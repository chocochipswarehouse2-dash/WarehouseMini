const fs = require('fs');

let p = 'src/components/penerimaan/AuditHitungUlangTab.tsx';
let c = fs.readFileSync(p, 'utf8');

// 1. Add getCachedProduksiQtyNotaMapSync to imports
c = c.replace(
  `  pushMasterRecountDeltaToGoogleSheet,
  syncQtyNotaAndAutoQueueRecount,
  MasterRecountDeltaItem,`,
  `  pushMasterRecountDeltaToGoogleSheet,
  syncQtyNotaAndAutoQueueRecount,
  MasterRecountDeltaItem,`
);

if (!c.includes('getCachedProduksiQtyNotaMapSync')) {
  c = c.replace(
    `  supabaseFetch,
} from '../../services/supabase';`,
    `  supabaseFetch,
  getCachedProduksiQtyNotaMapSync,
} from '../../services/supabase';`
  );
}

// 2. In CodeAuditGroup interface, add qty_nota & target_pembanding
c = c.replace(
  `  last_notes?: string;
  catatan_petunjuk?: string; // Catatan petunjuk per kode (misal: "petunjuk kurang 23")`,
  `  last_notes?: string;
  catatan_petunjuk?: string; // Catatan petunjuk per kode (misal: "petunjuk kurang 23")
  qty_nota?: number | null;
  target_pembanding?: number;`
);

// 3. In parsedCodeGroups calculation (around line 500-610):
// Calculate targetQty (Qty Nota if available, otherwise totalAsli)
const oldCodeGroupCalc = `      const qMeta = queueMap[code];

      results.push({
        kode_produksi: code,
        nama_produk: grp.nama_produk,
        kategori: grp.kategori,
        vendor_up: grp.vendor_up,
        photo_url: grp.photo_url,
        total_asli: totalAsli,
        total_fisik: totalFisik,
        total_selisih: totalSelisih,
        status_audit: statusAudit,`;

const newCodeGroupCalc = `      const qMeta = queueMap[code] as any;
      const cachedNotaMap = getCachedProduksiQtyNotaMapSync();
      const rawNota = qMeta?.qty_nota ?? cachedNotaMap[code]?.qty_nota ?? null;
      const hasNota = rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota));
      const targetNota = hasNota ? Number(rawNota) : null;
      const targetQty = hasNota ? targetNota! : totalAsli;

      // Jika ada target Qty Nota, selisih dan status dihitung terhadap Qty Nota!
      // Jika Qty Nota belum ada, dihitung terhadap Total Diterima awal (totalAsli).
      let effectiveSelisih = totalSelisih;
      if (isCounted && totalFisik !== null && hasNota) {
        effectiveSelisih = totalFisik - targetNota!;
        if (effectiveSelisih === 0) statusAudit = 'MATCH';
        else if (effectiveSelisih < 0) statusAudit = 'KURANG';
        else statusAudit = 'LEBIH';
      }

      results.push({
        kode_produksi: code,
        nama_produk: grp.nama_produk,
        kategori: grp.kategori,
        vendor_up: grp.vendor_up,
        photo_url: grp.photo_url,
        total_asli: totalAsli,
        total_fisik: totalFisik,
        total_selisih: effectiveSelisih,
        status_audit: statusAudit,
        qty_nota: targetNota,
        target_pembanding: targetQty,`;

c = c.replace(oldCodeGroupCalc, newCodeGroupCalc);

// 4. In workspaceSummary (around line 790-820):
const oldWorkspaceSummary = `    const totalSelisih = totalFisik - totalAsli;
    const status: 'MATCH' | 'KURANG' | 'LEBIH' = totalSelisih === 0 ? 'MATCH' : totalSelisih < 0 ? 'KURANG' : 'LEBIH';

    return {
      totalAsli,
      totalFisik,
      totalSelisih,
      status,
      filledCount,
      totalVariants: activeVariants.length,
    };
  }, [activeVariants, variantInputs]);`;

const newWorkspaceSummary = `    const code = activeGroup ? activeGroup.kode_produksi : '';
    const cachedNotaMap = getCachedProduksiQtyNotaMapSync();
    const rawNota = (queueMap[code] as any)?.qty_nota ?? cachedNotaMap[code]?.qty_nota ?? null;
    const hasNota = rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota));
    const targetNota = hasNota ? Number(rawNota) : null;
    const targetQty = hasNota ? targetNota! : totalAsli;

    // Matching angka: Jika Qty Nota terisi, bandingkan Qty Hitung Ulang dengan Qty Nota.
    // Jika tidak ada Qty Nota, bandingkan Qty Hitung Ulang dengan Total SJ Diterima.
    const totalSelisih = totalFisik - targetQty;
    const status: 'MATCH' | 'KURANG' | 'LEBIH' = totalSelisih === 0 ? 'MATCH' : totalSelisih < 0 ? 'KURANG' : 'LEBIH';

    return {
      totalAsli,
      totalFisik,
      totalSelisih,
      status,
      filledCount,
      totalVariants: activeVariants.length,
      hasNota,
      targetNota,
      targetQty,
    };
  }, [activeVariants, variantInputs, activeGroup, queueMap]);`;

c = c.replace(oldWorkspaceSummary, newWorkspaceSummary);

// 5. In Total Metrics Comparison Banner (around line 2102):
const oldBanner = `            {/* Total Metrics Comparison Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
              <div className="text-center sm:text-left">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Surat Jalan Asli</span>
                <span className="text-2xl font-black font-mono">{workspaceSummary.totalAsli} pcs</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Fisik Hasil Audit</span>
                <span className="text-2xl font-black font-mono text-blue-400">{workspaceSummary.totalFisik} pcs</span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Selisih</span>`;

const newBanner = `            {/* Total Metrics Comparison Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
              <div className="text-center sm:text-left">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total SJ Diterima</span>
                <span className="text-xl font-black font-mono">{workspaceSummary.totalAsli} pcs</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-amber-300 block">
                  {workspaceSummary.hasNota ? 'Target Qty Nota' : 'Qty Nota Buyer'}
                </span>
                <span className="text-xl font-black font-mono text-amber-300">
                  {workspaceSummary.hasNota ? \`\${workspaceSummary.targetNota} pcs\` : '-'}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Fisik Hitung Ulang</span>
                <span className="text-xl font-black font-mono text-blue-400">{workspaceSummary.totalFisik} pcs</span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Selisih vs {workspaceSummary.hasNota ? 'Nota' : 'SJ'}
                </span>`;

c = c.replace(oldBanner, newBanner);

// 6. After saving recount in handleSaveAudit, also sync with syncQtyNotaAndAutoQueueRecount
const saveRecordTarget = `        await saveRecountAuditRecord(newRecord);
        setRecountAuditMap((prev) => ({
          ...prev,
          [activeGroup.kode_produksi]: newRecord,
        }));`;

const saveRecordReplacement = `        await saveRecountAuditRecord(newRecord);
        setRecountAuditMap((prev) => ({
          ...prev,
          [activeGroup.kode_produksi]: newRecord,
        }));

        // Sinkronkan juga status selisih nota terbaru ke Supabase jika ada Qty Nota
        if (workspaceSummary.hasNota) {
          syncQtyNotaAndAutoQueueRecount({
            penerimaanItems,
            skipSheetFetch: true,
            updatedBy: auditorName || 'Auditor Fisik',
            overrideNotaEntry: {
              kode_produksi: activeGroup.kode_produksi,
              qty_nota: workspaceSummary.targetNota,
              kategori: activeGroup.kategori,
            },
          }).catch((errSync) => console.warn('Sync nota post recount:', errSync));
        }`;

c = c.replace(saveRecordTarget, saveRecordReplacement);

fs.writeFileSync(p, c, 'utf8');
console.log('AuditHitungUlangTab.tsx successfully updated with target Qty Nota matching!');

