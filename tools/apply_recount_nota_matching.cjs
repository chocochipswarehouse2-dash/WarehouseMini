const fs = require('fs');

// 1. UPDATE ProduksiSpreadsheetView.tsx
let pswPath = 'src/components/penerimaan/ProduksiSpreadsheetView.tsx';
let psw = fs.readFileSync(pswPath, 'utf8');

// Replace resolvedSelisihNota calculation in parsedBlocks loop
psw = psw.replace(
  `      const resolvedSelisihNota =
        resolvedQtyNota !== null && !isNaN(resolvedQtyNota) ? totalNet - resolvedQtyNota : null;`,
  `      // Jika sudah ada hasil hitung ulang fisik, pembanding akhir dengan Qty Nota adalah Qty Hitung Ulang!
      // Jika belum dihitung ulang, pembandingnya adalah Total Diterima awal (totalNet).
      const effectiveFisik =
        blockHasRecount && blockRecountFisik !== null && blockRecountFisik !== undefined
          ? blockRecountFisik
          : totalNet;
      const resolvedSelisihNota =
        resolvedQtyNota !== null && !isNaN(resolvedQtyNota) ? effectiveFisik - resolvedQtyNota : null;`
);

// Replace optimistic update in handleSaveInlineQtyNota
psw = psw.replace(
  `          qtyNota: finalNota,
          selisihNota: finalNota !== null ? b.totalNet - finalNota : null,`,
  `          qtyNota: finalNota,
          selisihNota:
            finalNota !== null
              ? (b.hasRecount && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined
                  ? b.totalRecountFisik
                  : b.totalNet) - finalNota
              : null,`
);

fs.writeFileSync(pswPath, psw, 'utf8');
console.log('ProduksiSpreadsheetView.tsx updated for recount vs nota matching.');

// 2. UPDATE gasProduksiSync.ts
let syncPath = 'src/services/gasProduksiSync.ts';
let sync = fs.readFileSync(syncPath, 'utf8');

// In pushPenerimaanProduksiToGoogleSheet (line ~727):
sync = sync.replace(
  `    const resolvedQtyNota = b.qtyNota !== undefined && b.qtyNota !== null ? b.qtyNota : (cachedNotaMapMaster[normCode]?.qty_nota ?? null);
    return {
      ...b,
      photoUrl: formatImageUrlForSheets(b.photoUrl),
      qtyNota: resolvedQtyNota,
      selisihNota: resolvedQtyNota !== null && resolvedQtyNota !== undefined ? b.totalNet - Number(resolvedQtyNota) : null,
    };`,
  `    const resolvedQtyNota = b.qtyNota !== undefined && b.qtyNota !== null ? b.qtyNota : (cachedNotaMapMaster[normCode]?.qty_nota ?? null);
    const effectiveFisik = (b.hasRecount && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined)
      ? b.totalRecountFisik
      : b.totalNet;
    return {
      ...b,
      photoUrl: formatImageUrlForSheets(b.photoUrl),
      qtyNota: resolvedQtyNota,
      selisihNota: resolvedQtyNota !== null && resolvedQtyNota !== undefined ? effectiveFisik - Number(resolvedQtyNota) : null,
    };`
);

// In syncQtyNotaAndAutoQueueRecount:
// Calculate effectiveFisik using auditMap
sync = sync.replace(
  `  // 2. Ambil data backup dari Supabase Cloud & tarik data terbaru dari Google Sheet
  const [cloudNotaMap, sheetRes] = await Promise.all([
    fetchProduksiQtyNotaMapFromSupabase(),
    skipSheetFetch ? Promise.resolve({ success: true, notaMap: {} } as FetchQtyNotaResponse) : fetchQtyNotaFromGoogleSheet(customSpreadsheetId),
  ]);`,
  `  // 2. Ambil data backup dari Supabase Cloud, data Audit Hitung Ulang, & tarik data terbaru dari Google Sheet
  const [cloudNotaMap, cloudAuditMap, sheetRes] = await Promise.all([
    fetchProduksiQtyNotaMapFromSupabase(),
    fetchRecountAuditMapFromCloud(),
    skipSheetFetch ? Promise.resolve({ success: true, notaMap: {} } as FetchQtyNotaResponse) : fetchQtyNotaFromGoogleSheet(customSpreadsheetId),
  ]);
  const localAuditMap = getRecountAuditMap();
  const activeAuditMap: Record<string, any> = { ...cloudAuditMap, ...localAuditMap };`
);

sync = sync.replace(
  `        const wmsTotal = totalDiterimaByCode.has(code)
          ? Math.max(0, totalDiterimaByCode.get(code)!)
          : Number(sRec.total_diterima) || 0;
        const qNota = Number(sRec.qty_nota);
        mergedNotaMap[code] = {
          kode_produksi: code,
          kategori: sRec.kategori || kategoriByCode.get(code) || 'Kargo',
          qty_nota: qNota,
          total_diterima: wmsTotal,
          selisih_nota: wmsTotal - qNota,`,
  `        const wmsTotal = totalDiterimaByCode.has(code)
          ? Math.max(0, totalDiterimaByCode.get(code)!)
          : Number(sRec.total_diterima) || 0;
        const auditFisik = activeAuditMap[code]?.total_fisik !== undefined && activeAuditMap[code]?.total_fisik !== null
          ? Number(activeAuditMap[code].total_fisik)
          : (sRec.total_fisik_recount !== undefined && sRec.total_fisik_recount !== null ? Number(sRec.total_fisik_recount) : null);
        const effectiveTotal = auditFisik !== null ? auditFisik : wmsTotal;
        const qNota = Number(sRec.qty_nota);
        mergedNotaMap[code] = {
          kode_produksi: code,
          kategori: sRec.kategori || kategoriByCode.get(code) || 'Kargo',
          qty_nota: qNota,
          total_diterima: wmsTotal,
          selisih_nota: effectiveTotal - qNota,`
);

sync = sync.replace(
  `    const oCode = overrideNotaEntry.kode_produksi.trim().toUpperCase();
    const wmsTotal = Math.max(0, totalDiterimaByCode.get(oCode) || mergedNotaMap[oCode]?.total_diterima || 0);
    if (overrideNotaEntry.qty_nota === null || overrideNotaEntry.qty_nota === undefined || isNaN(Number(overrideNotaEntry.qty_nota))) {
      delete mergedNotaMap[oCode];
    } else {
      const qNota = Number(overrideNotaEntry.qty_nota);
      mergedNotaMap[oCode] = {
        kode_produksi: oCode,
        kategori: overrideNotaEntry.kategori || kategoriByCode.get(oCode) || mergedNotaMap[oCode]?.kategori || 'Kargo',
        qty_nota: qNota,
        total_diterima: wmsTotal,
        selisih_nota: wmsTotal - qNota,`,
  `    const oCode = overrideNotaEntry.kode_produksi.trim().toUpperCase();
    const wmsTotal = Math.max(0, totalDiterimaByCode.get(oCode) || mergedNotaMap[oCode]?.total_diterima || 0);
    if (overrideNotaEntry.qty_nota === null || overrideNotaEntry.qty_nota === undefined || isNaN(Number(overrideNotaEntry.qty_nota))) {
      delete mergedNotaMap[oCode];
    } else {
      const qNota = Number(overrideNotaEntry.qty_nota);
      const auditFisik = activeAuditMap[oCode]?.total_fisik !== undefined && activeAuditMap[oCode]?.total_fisik !== null
        ? Number(activeAuditMap[oCode].total_fisik)
        : null;
      const effectiveTotal = auditFisik !== null ? auditFisik : wmsTotal;
      mergedNotaMap[oCode] = {
        kode_produksi: oCode,
        kategori: overrideNotaEntry.kategori || kategoriByCode.get(oCode) || mergedNotaMap[oCode]?.kategori || 'Kargo',
        qty_nota: qNota,
        total_diterima: wmsTotal,
        selisih_nota: effectiveTotal - qNota,`
);

sync = sync.replace(
  `    if (totalDiterimaByCode.has(code)) {
      const latestTotal = Math.max(0, totalDiterimaByCode.get(code)!);
      rec.total_diterima = latestTotal;
      rec.selisih_nota = latestTotal - Number(rec.qty_nota);
    }`,
  `    if (totalDiterimaByCode.has(code)) {
      const latestTotal = Math.max(0, totalDiterimaByCode.get(code)!);
      rec.total_diterima = latestTotal;
      const auditFisik = activeAuditMap[code]?.total_fisik !== undefined && activeAuditMap[code]?.total_fisik !== null
        ? Number(activeAuditMap[code].total_fisik)
        : null;
      const effectiveTotal = auditFisik !== null ? auditFisik : latestTotal;
      rec.selisih_nota = effectiveTotal - Number(rec.qty_nota);
    }`
);

fs.writeFileSync(syncPath, sync, 'utf8');
console.log('gasProduksiSync.ts updated.');

// 3. UPDATE gas/produksi_sheet.js
let gasPath = 'gas/produksi_sheet.js';
let gas = fs.readFileSync(gasPath, 'utf8');

// Update scanExistingSheetBlocksData to calculate effective total with recount
gas = gas.replace(
  `  var oldDataMap = {}; // { [CODE_COLOR_SIZE]: { fisik, selisih, status, log } }
  var scanError = '';`,
  `  var oldDataMap = {}; // { [CODE_COLOR_SIZE]: { fisik, selisih, status, log } }
  var codeRecountSum = {}; // { [CODE]: sumFisik }
  var codeHasRecount = {}; // { [CODE]: boolean }
  var scanError = '';`
);

gas = gas.replace(
  `          var rFisik = rowObj[colFisik];
          var rLog = colLog !== -1 ? rowObj[colLog] : '';
          if ((rFisik !== '' && rFisik !== null && rFisik !== undefined) || rLog) {
            oldDataMap[key] = {
              fisik: rFisik !== '' && rFisik !== null && rFisik !== undefined ? Number(rFisik) : '',
              selisih: colSelisihFisik !== -1 ? rowObj[colSelisihFisik] : '',
              status: colStatus !== -1 ? rowObj[colStatus] : '',
              log: rLog
            };
          }`,
  `          var rFisik = rowObj[colFisik];
          var rLog = colLog !== -1 ? rowObj[colLog] : '';
          if ((rFisik !== '' && rFisik !== null && rFisik !== undefined && !isNaN(Number(rFisik))) || rLog) {
            var numF = Number(rFisik);
            if (!isNaN(numF)) {
              codeRecountSum[curCode] = (codeRecountSum[curCode] || 0) + numF;
              codeHasRecount[curCode] = true;
            }
            oldDataMap[key] = {
              fisik: rFisik !== '' && rFisik !== null && rFisik !== undefined ? numF : '',
              selisih: colSelisihFisik !== -1 ? rowObj[colSelisihFisik] : '',
              status: colStatus !== -1 ? rowObj[colStatus] : '',
              log: rLog
            };
          }`
);

gas = gas.replace(
  `  return {
    oldNotaMap: oldNotaMap,
    oldDataMap: oldDataMap,
    scanError: scanError
  };`,
  `  // Sinkronkan selisihNota di oldNotaMap agar membandingkan Qty Hitung Ulang jika sudah ada
  Object.keys(oldNotaMap).forEach(function(code) {
    var rec = oldNotaMap[code];
    if (rec && rec.qtyNota !== null) {
      var effective = (codeHasRecount[code] && codeRecountSum[code] !== undefined)
        ? codeRecountSum[code]
        : rec.totalDiterima;
      rec.selisihNota = effective - rec.qtyNota;
      rec.totalFisikRecount = codeHasRecount[code] ? codeRecountSum[code] : null;
    }
  });

  return {
    oldNotaMap: oldNotaMap,
    oldDataMap: oldDataMap,
    scanError: scanError
  };`
);

// Update formula for SELISIH in renderProductBlocksMatrix
gas = gas.replace(
  `      var totalDatangCellRef = colToLetter(colTotalDatang) + startDataRowIndex;
      var qtyNotaCellRef = colToLetter(colQtyNota) + startDataRowIndex;
      var selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", ' + totalDatangCellRef + '-' + qtyNotaCellRef + ')';
      var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);`,
  `      var totalDatangCellRef = colToLetter(colTotalDatang) + startDataRowIndex;
      var qtyNotaCellRef = colToLetter(colQtyNota) + startDataRowIndex;
      var selisihFormula = '';
      if (!isSpecificDate) {
        // Master Sheet: terdapat kolom QTY HITUNG ULANG (colSelisihNota + 1)
        var colFisikLetter = colToLetter(colSelisihNota + 1);
        var fisikRange = colFisikLetter + startDataRowIndex + ':' + colFisikLetter + endDataRowIndex;
        // Jika ada hasil hitung ulang fisik (COUNT > 0), bandingkan SUM(QTY HITUNG ULANG) dengan QTY NOTA.
        // Jika belum ada hasil hitung ulang fisik, pembandingnya adalah TOTAL DATANG (NET).
        selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", IF(COUNT(' + fisikRange + ')>0, SUM(' + fisikRange + ')-' + qtyNotaCellRef + ', ' + totalDatangCellRef + '-' + qtyNotaCellRef + '))';
      } else {
        // Sheet Tanggal Satuan: pembanding adalah Total Datang kedatangan tanggal tersebut
        selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", ' + totalDatangCellRef + '-' + qtyNotaCellRef + ')';
      }
      var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);`
);

fs.writeFileSync(gasPath, gas, 'utf8');
console.log('gas/produksi_sheet.js updated for reactive recount vs nota formula.');

