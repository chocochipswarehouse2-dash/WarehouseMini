#!/usr/bin/env node
/**
 * Safe, lossless compaction for master_produk.dealpos_channels in Supabase.
 * Removes redundant nested copies (`b`, `d`, `cabang`), `total_stok`, duplicate aliases,
 * and zero-value outlet keys (`:0`), preserving 100% of non-zero outlet stocks and Tag Price (`TP`).
 *
 * Usage:
 *   node tools/compact_master_dealpos_channels.cjs --dry-run
 *   node tools/compact_master_dealpos_channels.cjs --apply
 */

const SUPA_URL = process.env.VITE_SUPABASE_URL || 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

const ALIAS_TO_CANONICAL = {
  'Gudang Utama': 'MAP',
  'Barang Live': 'LIVE',
  'Sample Live': 'LIVE',
  'Sample Studio': 'STUDIO',
  'Permak / Cuci': 'PERMAK',
  'Barang Cacat': 'DEFECT',
  'Diskon Defect': 'DEFECT',
};

const SKIP_CONTAINER_KEYS = new Set([
  'b',
  'd',
  'cabang',
  'total_stok',
  'Gudang Utama',
  'Barang Live',
  'Sample Live',
  'Sample Studio',
  'Permak / Cuci',
  'Barang Cacat',
  'Diskon Defect',
]);

function compactDealposChannels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};

  const assignNonZero = (key, val) => {
    if (!key) return;
    const canonical = ALIAS_TO_CANONICAL[key] || key;
    if (SKIP_CONTAINER_KEYS.has(canonical)) return;
    if (typeof val === 'number') {
      if (Number.isFinite(val) && val !== 0) {
        if (out[canonical] === undefined || out[canonical] === 0) {
          out[canonical] = val;
        }
      }
      return;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return;
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        if (num !== 0 && (out[canonical] === undefined || out[canonical] === 0)) {
          out[canonical] = num;
        }
      } else {
        out[canonical] = trimmed;
      }
    }
  };

  // 1. Tag Price (TP)
  const tp = Number(raw.TP ?? raw.tp ?? raw.tag_price ?? raw.b?.TP ?? raw.cabang?.TP ?? 0);
  if (Number.isFinite(tp) && tp > 0) {
    out.TP = tp;
  }

  // 2. Canonical short-code keys on root first
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'b' || k === 'd' || k === 'cabang' || k === 'total_stok' || k === 'TP') continue;
    assignNonZero(k, v);
  }

  // 3. Nested objects (d, b, cabang) in case any key only existed nested
  for (const nestedKey of ['d', 'b', 'cabang']) {
    const nested = raw[nestedKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const [k, v] of Object.entries(nested)) {
        if (k === 'TP') continue;
        assignNonZero(k, v);
      }
    }
  }

  return out;
}

function isAlreadyCompact(raw, compacted) {
  const rawStr = JSON.stringify(raw || {});
  const compStr = JSON.stringify(compacted || {});
  return rawStr === compStr;
}

async function fetchPage(offset, limit) {
  const url = `${SUPA_URL}/rest/v1/master_produk?select=sku,nama_produk,kategori,size,price,dealpos_channels&order=sku.asc&offset=${offset}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`GET offset=${offset} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function upsertBatch(rows) {
  const url = `${SUPA_URL}/rest/v1/master_produk?on_conflict=sku`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`UPSERT batch (${rows.length}) failed: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY (LIVE WRITE)' : 'DRY-RUN (READ-ONLY)';
  console.log(`\n=== master_produk.dealpos_channels Compaction [${mode}] ===`);

  const PAGE_SIZE = 1000;
  const BATCH_SIZE = 500;
  let offset = 0;
  let totalRows = 0;
  let rowsToCompact = 0;
  let rowsUpdated = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  let sampleLogged = 0;

  while (true) {
    const page = await fetchPage(offset, PAGE_SIZE);
    if (!Array.isArray(page) || page.length === 0) break;

    const batchPayload = [];
    for (const row of page) {
      totalRows++;
      const rawJson = JSON.stringify(row.dealpos_channels || {});
      const compacted = compactDealposChannels(row.dealpos_channels);
      const compJson = JSON.stringify(compacted);
      bytesBefore += rawJson.length;
      bytesAfter += compJson.length;

      if (!isAlreadyCompact(row.dealpos_channels, compacted)) {
        rowsToCompact++;
        if (sampleLogged < 3 && Object.keys(compacted).length > 1) {
          sampleLogged++;
          console.log(`Sample ${row.sku}: ${rawJson.length}B -> ${compJson.length}B | ${compJson}`);
        }
        batchPayload.push({
          sku: row.sku,
          nama_produk: row.nama_produk,
          kategori: row.kategori,
          size: row.size,
          price: row.price,
          dealpos_channels: compacted,
        });
      }
    }

    if (apply && batchPayload.length > 0) {
      for (let i = 0; i < batchPayload.length; i += BATCH_SIZE) {
        const chunk = batchPayload.slice(i, i + BATCH_SIZE);
        await upsertBatch(chunk);
        rowsUpdated += chunk.length;
      }
    }

    offset += page.length;
    if (offset % 5000 === 0 || page.length < PAGE_SIZE) {
      console.log(`Processed ${totalRows} rows (need compact: ${rowsToCompact}, updated: ${rowsUpdated})...`);
    }
    if (page.length < PAGE_SIZE) break;
  }

  const mbBefore = (bytesBefore / 1024 / 1024).toFixed(2);
  const mbAfter = (bytesAfter / 1024 / 1024).toFixed(2);
  const pct = bytesBefore > 0 ? (((bytesBefore - bytesAfter) / bytesBefore) * 100).toFixed(1) : '0.0';

  console.log('\n=== SUMMARY ===');
  console.log(`Total rows scanned : ${totalRows}`);
  console.log(`Rows needing compact: ${rowsToCompact}`);
  console.log(`Rows updated       : ${rowsUpdated}`);
  console.log(`dealpos_channels   : ${mbBefore} MB -> ${mbAfter} MB (-${pct}%)`);
}

main().catch((err) => {
  console.error('Compaction failed:', err);
  process.exit(1);
});
