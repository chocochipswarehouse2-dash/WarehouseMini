#!/usr/bin/env node
/**
 * =============================================================================
 * WMS AI CAPABILITY GAP PULLER & RESOLVER CLI
 * =============================================================================
 * Menarik laporan tugas yang belum bisa dikerjakan oleh Asisten AI WMS dari
 * Supabase (`wms_system_docs`, doc_key = 'wms_ai_capability_gaps_index') ke
 * file lokal `docs/memory/AI_CAPABILITY_GAPS.md` agar otomatis terbaca oleh
 * semua agen coding saat Pre-Task Sync.
 *
 * Penggunaan:
 *   node tools/pull_ai_dev_reports.cjs
 *   node tools/pull_ai_dev_reports.cjs --resolve GAP-20261122-XXXX "Sudah diimplementasikan di v2.26.0"
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'docs', 'memory', 'AI_CAPABILITY_GAPS.md');
const DOC_KEY = 'wms_ai_capability_gaps_index';

function loadEnvFile(filename) {
  const fullPath = path.join(ROOT, filename);
  if (!fs.existsSync(fullPath)) return {};
  const vars = {};
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function getSupabaseCredentials() {
  const envFromFiles = {
    ...loadEnvFile('.env'),
    ...loadEnvFile('.env.local')
  };

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    envFromFiles.SUPABASE_URL ||
    envFromFiles.VITE_SUPABASE_URL ||
    '';

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    envFromFiles.SUPABASE_SERVICE_ROLE_KEY ||
    envFromFiles.SUPABASE_SERVICE_KEY ||
    envFromFiles.SUPABASE_ANON_KEY ||
    envFromFiles.VITE_SUPABASE_ANON_KEY ||
    '';

  return { url: url.replace(/\/+$/, ''), key };
}

function formatMarkdown(gaps) {
  const openItems = gaps.filter((g) => g.status !== 'done');
  const doneItems = gaps.filter((g) => g.status === 'done');
  const nowIso = new Date().toISOString();

  const lines = [
    '# AI Capability Gaps — Dev Agent Backlog',
    '',
    '> File ini disinkronkan otomatis dari Supabase (`wms_system_docs` -> `wms_ai_capability_gaps_index`) menggunakan `node tools/pull_ai_dev_reports.cjs`.',
    `> Terakhir disinkronkan: \`${nowIso}\``,
    `> Ringkasan: **${openItems.length} Open / In Progress** | **${doneItems.length} Selesai** | **${gaps.length} Total**`,
    '',
    '## Panduan Agen Coding',
    '1. Tinjau daftar **Open / In Progress** di bawah sebelum merencanakan update fitur AI atau modul terkait.',
    '2. Setelah mengimplementasikan tool/fitur baru untuk menyelesaikan sebuah gap, tandai selesai dengan:',
    '   ```bash',
    '   node tools/pull_ai_dev_reports.cjs --resolve <GAP-ID> "Ringkasan implementasi & versi"',
    '   ```',
    '3. Jangan lupa memperbarui `docs/memory/WMS_FEATURE_REGISTRY.md` & `docs/memory/WMS_MODULE_CHANGELOG.md`.',
    ''
  ];

  const writeGroup = (title, items) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('_Belum ada laporan pada kategori ini._');
      lines.push('');
      return;
    }

    for (const g of items) {
      const prio = String(g.priority || 'medium').toUpperCase();
      lines.push(`### [${g.id}] ${g.title}`);
      lines.push(`- **Status**: \`${g.status || 'open'}\` | **Prioritas**: \`${prio}\` | **Modul**: ${g.moduleArea || '-'} | **Frekuensi**: ${g.occurrences || 1}x`);
      lines.push(`- **Pelapor**: \`${g.reportedBy || '-'}\` (${g.reportedRole || '-'}) | **Dibuat**: ${g.createdAt || '-'}`);
      lines.push(`- **Permintaan Pengguna**: "${g.userPrompt || '-'}"`);
      lines.push(`- **Alasan Tidak Bisa Dieksekusi**: ${g.reasonCannotExecute || '-'}`);
      lines.push(`- **Usulan Tool / Fitur**: ${g.proposedToolOrFeature || '-'}`);
      lines.push(`- **Perilaku yang Diharapkan**: ${g.expectedBehavior || '-'}`);
      if (g.resolutionNote) {
        lines.push(`- **Catatan Resolusi**: ${g.resolutionNote}`);
      }
      lines.push('');
    }
  };

  writeGroup('Open / In Progress', openItems);
  writeGroup('Resolved / Selesai', doneItems);

  return lines.join('\n');
}

async function fetchGapsFromSupabase(url, key) {
  const endpoint = `${url}/rest/v1/wms_system_docs?doc_key=eq.${DOC_KEY}&select=content,updated_at&limit=1`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0] || !rows[0].content) {
    return [];
  }
  const parsed = JSON.parse(rows[0].content);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveGapsToSupabase(url, key, gaps) {
  const endpoint = `${url}/rest/v1/wms_system_docs?on_conflict=doc_key`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([
      {
        section_id: DOC_KEY,
        doc_key: DOC_KEY,
        title: 'AI Self-Reporting Capability Gap Backlog (Dev Queue)',
        content: JSON.stringify(gaps.slice(0, 100)),
        updated_at: new Date().toISOString()
      }
    ])
  });
  if (!res.ok) {
    throw new Error(`Gagal update Supabase: HTTP ${res.status} ${res.statusText}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const resolveIdx = args.indexOf('--resolve');
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    console.log('[AI Dev Reports] Kredensial Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) tidak ditemukan di environment/.env. Sync dilewati tanpa error.');
    process.exit(0);
  }

  let gaps = [];
  try {
    gaps = await fetchGapsFromSupabase(url, key);
  } catch (err) {
    console.warn(`[AI Dev Reports] Gagal menghubungi Supabase (${err.message}). File lokal dipertahankan.`);
    process.exit(0);
  }

  if (resolveIdx >= 0) {
    const gapId = args[resolveIdx + 1];
    const resolutionNote = args[resolveIdx + 2] || 'Diselesaikan oleh agen coding.';
    if (!gapId) {
      console.error('Penggunaan: node tools/pull_ai_dev_reports.cjs --resolve <GAP-ID> "<catatan>"');
      process.exit(1);
    }

    let found = false;
    const nowIso = new Date().toISOString();
    gaps = gaps.map((item) => {
      if (item.id === gapId) {
        found = true;
        return { ...item, status: 'done', resolutionNote, updatedAt: nowIso };
      }
      return item;
    });

    if (!found) {
      console.error(`[AI Dev Reports] GAP ID "${gapId}" tidak ditemukan di Supabase.`);
      process.exit(1);
    }

    await saveGapsToSupabase(url, key, gaps);
    console.log(`[AI Dev Reports] Berhasil menandai ${gapId} sebagai DONE.`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, formatMarkdown(gaps), 'utf8');

  const openCount = gaps.filter((g) => g.status !== 'done').length;
  console.log(
    `[AI Dev Reports] Sinkronisasi selesai -> docs/memory/AI_CAPABILITY_GAPS.md (${openCount} open, ${gaps.length} total).`
  );
}

main().catch((err) => {
  console.error('[AI Dev Reports] Error:', err.message);
  process.exit(1);
});
