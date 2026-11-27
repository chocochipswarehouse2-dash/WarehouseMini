/**
 * =========================================================================
 * GOOGLE APPS SCRIPT BACKEND — REKAP TAGIHAN JNE ("JNEmember" & "JNECorporate")
 * =========================================================================
 * Script ID   : 1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ
 * Spreadsheet : https://docs.google.com/spreadsheets/d/1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k
 *
 * 1) Sheet "JNEmember" (gid = 1026608111, A..K):
 *    A(1): "" | B(2): No | C(3): Cnote No (@) | D(4): Deskripsi pengiriman
 *    E(5): Services | F(6): Receiver Name | G(7): Destination | H(8): Shipper Name
 *    I(9): Amount ("Rp   "#,##0) | J(10): Tanggal Pengiriman (dd/mm/yyyy) | K(11): Agen
 *
 * 2) Sheet "JNECorporate" (gid = 843586287, A..L):
 *    A(1): "" | B(2): No Resi (@) | C(3): Deskripsi pengiriman | D(4): Tanggal Kiriman (dd/mm/yyyy)
 *    E(5): Nama Penerima | F(6): Alamat Penerima | G(7): Kota Tujuan Penerima
 *    H(8): Service | I(9): Ongkir | J(10): Nominal Asuransi
 *    K(11): Status Pembayaran [RUMUS VLOOKUP ke 'Tagihan JNECorporate'!L:N — DILARANG TIMPA!]
 *    L(12): Agen (Default: JNECorporated)
 * =========================================================================
 */

var SPREADSHEET_ID = "1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k";
var JNE_DELTA_BLOCK_SIZE = 200;

function fnv1aHex(str) {
  var h = 0x811c9dc5;
  var s = String(str || "");
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    h = h >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

var SHEET_CONFIGS = {
  member: {
    type: "member",
    names: ["JNEmember", "JNEMember"],
    gid: 1026608111,
    totalCols: 11,
    resiCol: 3,  // C
    descCol: 4,  // D
    dateCol: 10, // J
    amountCol: 9, // I
    defaultAgen: "JNE Member",
    headers: [
      "", "No", "Cnote No", "Deskripsi pengiriman", "Services",
      "Receiver Name", "Destination", "Shipper Name", "Amount",
      "Tanggal Pengiriman", "Agen"
    ]
  },
  corporate: {
    type: "corporate",
    names: ["JNECorporate", "JNECorporated"],
    gid: 843586287,
    totalCols: 12,
    resiCol: 2,  // B
    descCol: 3,  // C
    dateCol: 4,  // D
    amountCol: 9, // I
    defaultAgen: "JNECorporated",
    headers: [
      "", "No Resi", "Deskripsi pengiriman", "Tanggal Kiriman",
      "Nama Penerima", "Alamat Penerima", "Kota Tujuan Penerima",
      "Service", "Ongkir", "Nominal Asuransi", "Status Pembayaran", "Agen"
    ]
  }
};

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function resolveSheetType(rawType) {
  var s = String(rawType || "").toLowerCase().replace(/[\s_\-]/g, "");
  if (s === "corporate" || s === "jnecorporate" || s === "jnecorporated") {
    return "corporate";
  }
  return "member";
}

function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getTargetSheet(sheetType) {
  var cfg = SHEET_CONFIGS[resolveSheetType(sheetType)];
  var ss = getSpreadsheet();
  var sheet = null;

  for (var i = 0; i < cfg.names.length; i++) {
    sheet = ss.getSheetByName(cfg.names[i]);
    if (sheet) break;
  }

  if (!sheet) {
    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      if (allSheets[s].getSheetId() === cfg.gid) {
        sheet = allSheets[s];
        break;
      }
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet(cfg.names[0]);
  }

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, cfg.totalCols).setValues([cfg.headers]);
    sheet.getRange(1, 2, 1, cfg.totalCols - 1)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }

  return { sheet: sheet, cfg: cfg };
}

function detectHeaderRow(sheet, cfg) {
  var lr = sheet.getLastRow();
  if (lr < 1) return 1;
  var scanRows = Math.min(lr, 5);
  var sample = sheet.getRange(1, 1, scanRows, cfg.totalCols).getDisplayValues();
  for (var r = 0; r < sample.length; r++) {
    var colResi = String(sample[r][cfg.resiCol - 1] || "").trim().toLowerCase();
    var colDesc = String(sample[r][cfg.descCol - 1] || "").trim().toLowerCase();
    if (
      colResi.indexOf("cnote") !== -1 ||
      colResi.indexOf("resi") !== -1 ||
      colDesc.indexOf("deskripsi") !== -1
    ) {
      return r + 1;
    }
  }
  return 1;
}

function cleanCnote(val) {
  if (val === null || val === undefined) return "";
  var s = String(val).trim().replace(/^['"`]+/, "").replace(/[\s\-_]/g, "").toUpperCase();
  if (/^1379\d{10}$/.test(s) || /^14819\d{10,12}$/.test(s)) {
    s = "0" + s;
  }
  return s;
}

function isHeaderPlaceholderResi(cnote) {
  return !cnote || cnote === "CNOTENO" || cnote === "NORESI" || cnote === "RESI";
}

function parseAmountNumber(rawVal, displayVal) {
  if (typeof rawVal === "number" && !isNaN(rawVal)) {
    return Math.round(rawVal);
  }
  var s = String(rawVal !== "" && rawVal !== null && rawVal !== undefined ? rawVal : (displayVal || ""))
    .trim()
    .replace(/^(?:Rp|IDR)\.?\s*/i, "")
    .trim();
  if (!s || s === "-") return 0;

  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
    return Math.round(parseFloat(s.replace(/,/g, "")) || 0);
  }
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
    return Math.round(parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0);
  }
  if (/^\d+\.\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s) || 0);
  }
  if (/^\d+,\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s.replace(",", ".")) || 0);
  }
  var digits = s.replace(/[^0-9]/g, "");
  return digits ? (parseInt(digits, 10) || 0) : 0;
}

function normalizeSheetDateToIso(rawVal, displayVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return Utilities.formatDate(rawVal, "Asia/Jakarta", "yyyy-MM-dd");
  }
  var s = String(displayVal || rawVal || "").trim();
  if (!s) return "";

  var dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmy) {
    var dd = ("0" + dmy[1]).slice(-2);
    var mm = ("0" + dmy[2]).slice(-2);
    var yy = dmy[3].length === 2 ? ("20" + dmy[3]) : dmy[3];
    return yy + "-" + mm + "-" + dd;
  }

  var ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    var m2 = ("0" + ymd[2]).slice(-2);
    var d2 = ("0" + ymd[3]).slice(-2);
    return ymd[1] + "-" + m2 + "-" + d2;
  }

  return s;
}

function parseIsoToSheetDateCell(dateStr) {
  var s = String(dateStr || "").trim();
  if (!s) return "";

  var ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0);
  }

  var dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmy) {
    var y = dmy[3].length === 2 ? ("20" + dmy[3]) : dmy[3];
    return new Date(parseInt(y, 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 12, 0, 0);
  }

  return s;
}

function preFormatResiAsText(sheet, cfg, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, cfg.resiCol, numRows, 1).setNumberFormat("@");
}

function postFormatRows(sheet, cfg, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, cfg.resiCol, numRows, 1).setNumberFormat("@");
  sheet.getRange(startRow, cfg.dateCol, numRows, 1).setNumberFormat("dd/mm/yyyy");
  if (cfg.type === "member") {
    sheet.getRange(startRow, cfg.amountCol, numRows, 1).setNumberFormat('"Rp   "#,##0');
  } else {
    // Pastikan Kolom K (Status Pembayaran) memiliki formula VLOOKUP jika masih kosong
    var kRange = sheet.getRange(startRow, 11, numRows, 1);
    var existingFormulas = kRange.getFormulas();
    var existingVals = kRange.getValues();
    var needFormulaUpdate = false;
    var formulasOut = [];
    for (var i = 0; i < numRows; i++) {
      var curF = existingFormulas[i][0];
      var curV = String(existingVals[i][0] || "").trim();
      if (curF) {
        formulasOut.push([curF]);
      } else if (!curV || curV === "Belum Ada Tagihan") {
        var rNum = startRow + i;
        formulasOut.push(['=IFERROR(VLOOKUP(B' + rNum + ',\'Tagihan JNECorporate\'!L:N,3,0),"Belum Ada Tagihan")']);
        needFormulaUpdate = true;
      } else {
        formulasOut.push([""]);
      }
    }
    if (needFormulaUpdate) {
      for (var k = 0; k < formulasOut.length; k++) {
        if (formulasOut[k][0] && !existingFormulas[k][0]) {
          sheet.getRange(startRow + k, 11).setFormula(formulasOut[k][0]);
        }
      }
    }
  }
}

/**
 * Cari baris terakhir yang Kolom Resi-nya benar-benar terisi
 * (kritis untuk JNECorporate yang punya formula VLOOKUP kosong sampai baris 2961)
 */
function findLastDataRowByResiCol(sheet, dataStartRow, resiCol) {
  var lr = sheet.getLastRow();
  if (lr < dataStartRow) return dataStartRow - 1;
  var numRows = lr - dataStartRow + 1;
  var vals = sheet.getRange(dataStartRow, resiCol, numRows, 1).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || "").trim() !== "") {
      return dataStartRow + i;
    }
  }
  return dataStartRow - 1;
}

function buildResiRowMap(sheet, cfg, dataStartRow, lastDataRow) {
  var map = {};
  if (lastDataRow < dataStartRow) return map;
  var numRows = lastDataRow - dataStartRow + 1;
  var resiDisplay = sheet.getRange(dataStartRow, cfg.resiCol, numRows, 1).getDisplayValues();
  for (var i = 0; i < resiDisplay.length; i++) {
    var key = cleanCnote(resiDisplay[i][0]);
    if (!isHeaderPlaceholderResi(key)) {
      map[key] = dataStartRow + i;
    }
  }
  return map;
}

/**
 * =========================================================================
 * 1. API GET: Baca seluruh baris dari Sheet "JNEmember" atau "JNECorporate"
 * =========================================================================
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var sheetType = resolveSheetType(params.sheet || "member");
    var ctx = getTargetSheet(sheetType);
    var sheet = ctx.sheet;
    var cfg = ctx.cfg;

    var forceFull = String(params.force || "") === "1";
    var clientSig = String(params.client_sig || "").trim();
    var clientCount = parseInt(params.client_count || "0", 10) || 0;
    var sinceRow = parseInt(params.since_row || "0", 10) || 0;
    var bsRaw = String(params.bs || "").trim();
    var clientBlockSigs = bsRaw ? bsRaw.split(",") : [];

    var headerRow = detectHeaderRow(sheet, cfg);
    var dataStartRow = headerRow + 1;
    var lastDataRow = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);

    if (lastDataRow < dataStartRow) {
      var emptySig = fnv1aHex("|0|" + (dataStartRow - 1));
      if (!forceFull && clientSig === emptySig && clientCount === 0) {
        return jsonResponse({
          success: true,
          mode: "unchanged",
          sheet_type: cfg.type,
          sheet_name: sheet.getName(),
          gid: sheet.getSheetId(),
          header_row: headerRow,
          block_size: JNE_DELTA_BLOCK_SIZE,
          last_row: dataStartRow - 1,
          total_records: 0,
          signature: emptySig,
          block_sigs: []
        });
      }
      return jsonResponse({
        success: true,
        mode: "full",
        sheet_type: cfg.type,
        sheet_name: sheet.getName(),
        gid: sheet.getSheetId(),
        header_row: headerRow,
        block_size: JNE_DELTA_BLOCK_SIZE,
        last_row: dataStartRow - 1,
        total_records: 0,
        signature: emptySig,
        block_sigs: [],
        records: []
      });
    }

    var numRows = lastDataRow - dataStartRow + 1;
    var numBlocks = Math.ceil(numRows / JNE_DELTA_BLOCK_SIZE);
    var blockRecords = [];
    var blockFpParts = [];
    for (var bi = 0; bi < numBlocks; bi++) {
      blockRecords.push([]);
      blockFpParts.push([]);
    }

    var rawRange = sheet.getRange(dataStartRow, 1, numRows, cfg.totalCols);
    var rawValues = rawRange.getValues();
    var displayValues = rawRange.getDisplayValues();
    var records = [];

    for (var i = 0; i < numRows; i++) {
      var raw = rawValues[i];
      var disp = displayValues[i];
      var rowNumber = dataStartRow + i;
      var blockIdx = Math.floor(i / JNE_DELTA_BLOCK_SIZE);
      var rec = null;
      var fp = "";

      if (cfg.type === "member") {
        var cnote = cleanCnote(disp[2] || raw[2]);
        if (isHeaderPlaceholderResi(cnote)) continue;

        rec = {
          row_number: rowNumber,
          no: String(disp[1] || raw[1] || "").trim(),
          no_resi: cnote,
          deskripsi: String(disp[3] !== undefined ? disp[3] : (raw[3] || "")).trim(),
          layanan: String(disp[4] || raw[4] || "REG23").trim() || "REG23",
          nama_tujuan: String(disp[5] || raw[5] || "").trim(),
          alamat_tujuan: String(disp[6] || raw[6] || "").trim(),
          nama_pengirim: String(disp[7] || raw[7] || "CCH-CHOCOCHIPS").trim() || "CCH-CHOCOCHIPS",
          nominal: parseAmountNumber(raw[8], disp[8]),
          tanggal: normalizeSheetDateToIso(raw[9], disp[9]),
          agen: String(disp[10] || raw[10] || "JNE Member").trim() || "JNE Member"
        };
        fp = [
          rowNumber, rec.no, cnote, rec.deskripsi, rec.layanan,
          rec.nama_tujuan, rec.alamat_tujuan, rec.nama_pengirim,
          rec.nominal, rec.tanggal, rec.agen
        ].join("|");
      } else {
        var resiCorp = cleanCnote(disp[1] || raw[1]);
        if (isHeaderPlaceholderResi(resiCorp)) continue;

        rec = {
          row_number: rowNumber,
          no: "",
          no_resi: resiCorp,
          deskripsi: String(disp[2] !== undefined ? disp[2] : (raw[2] || "")).trim(),
          tanggal: normalizeSheetDateToIso(raw[3], disp[3]),
          nama_tujuan: String(disp[4] || raw[4] || "").trim(),
          alamat_penerima: String(disp[5] || raw[5] || "").trim(),
          alamat_tujuan: String(disp[6] || raw[6] || "").trim(),
          layanan: String(disp[7] || raw[7] || "REG23").trim() || "REG23",
          nama_pengirim: "",
          nominal: parseAmountNumber(raw[8], disp[8]),
          asuransi: parseAmountNumber(raw[9], disp[9]),
          status_pembayaran: String(disp[10] || raw[10] || "Belum Ada Tagihan").trim() || "Belum Ada Tagihan",
          agen: String(disp[11] || raw[11] || "JNECorporated").trim() || "JNECorporated"
        };
        fp = [
          rowNumber, resiCorp, rec.deskripsi, rec.tanggal,
          rec.nama_tujuan, rec.alamat_penerima, rec.alamat_tujuan,
          rec.layanan, rec.nominal, rec.asuransi,
          rec.status_pembayaran, rec.agen
        ].join("|");
      }

      records.push(rec);
      blockRecords[blockIdx].push(rec);
      blockFpParts[blockIdx].push(fp);
    }

    var blockSigs = [];
    for (var b = 0; b < numBlocks; b++) {
      blockSigs.push(fnv1aHex(blockFpParts[b].join("\n")));
    }
    var fullSig = fnv1aHex(blockSigs.join(",") + "|" + records.length + "|" + lastDataRow);

    if (!forceFull && clientSig && clientSig === fullSig && clientCount === records.length && sinceRow === lastDataRow) {
      return jsonResponse({
        success: true,
        mode: "unchanged",
        sheet_type: cfg.type,
        sheet_name: sheet.getName(),
        gid: sheet.getSheetId(),
        header_row: headerRow,
        block_size: JNE_DELTA_BLOCK_SIZE,
        last_row: lastDataRow,
        total_records: records.length,
        signature: fullSig,
        block_sigs: blockSigs
      });
    }

    if (!forceFull && clientBlockSigs.length > 0 && lastDataRow >= sinceRow && blockSigs.length >= clientBlockSigs.length) {
      var changedBlocks = [];
      var deltaRecords = [];
      for (var cIdx = 0; cIdx < blockSigs.length; cIdx++) {
        if (cIdx >= clientBlockSigs.length || clientBlockSigs[cIdx] !== blockSigs[cIdx]) {
          var startRowBlk = dataStartRow + cIdx * JNE_DELTA_BLOCK_SIZE;
          var endRowBlk = Math.min(lastDataRow, startRowBlk + JNE_DELTA_BLOCK_SIZE - 1);
          changedBlocks.push({
            block_index: cIdx,
            start_row: startRowBlk,
            end_row: endRowBlk
          });
          var blkList = blockRecords[cIdx];
          for (var m = 0; m < blkList.length; m++) {
            deltaRecords.push(blkList[m]);
          }
        }
      }

      var maxDeltaBlocks = Math.max(2, Math.floor(blockSigs.length * 0.4));
      if (changedBlocks.length > 0 && changedBlocks.length <= maxDeltaBlocks) {
        return jsonResponse({
          success: true,
          mode: "delta",
          sheet_type: cfg.type,
          sheet_name: sheet.getName(),
          gid: sheet.getSheetId(),
          header_row: headerRow,
          block_size: JNE_DELTA_BLOCK_SIZE,
          last_row: lastDataRow,
          total_records: records.length,
          signature: fullSig,
          block_sigs: blockSigs,
          changed_blocks: changedBlocks,
          records: deltaRecords
        });
      }
    }

    return jsonResponse({
      success: true,
      mode: "full",
      sheet_type: cfg.type,
      sheet_name: sheet.getName(),
      gid: sheet.getSheetId(),
      header_row: headerRow,
      block_size: JNE_DELTA_BLOCK_SIZE,
      last_row: lastDataRow,
      total_records: records.length,
      signature: fullSig,
      block_sigs: blockSigs,
      records: records
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * =========================================================================
 * 2. API POST: Operasi CRUD & Sinkronisasi 2 Arah pada Sheet Pilihan
 * =========================================================================
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (lockErr) {
    return jsonResponse({ success: false, error: "Google Sheets sedang sibuk, silakan coba beberapa detik lagi." });
  }

  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errParse) {
        payload = e.parameter || {};
      }
    } else {
      payload = e ? e.parameter : {};
    }

    var sheetType = resolveSheetType(payload.sheet || (e && e.parameter ? e.parameter.sheet : "member"));
    var ctx = getTargetSheet(sheetType);
    var sheet = ctx.sheet;
    var cfg = ctx.cfg;
    var headerRow = detectHeaderRow(sheet, cfg);
    var dataStartRow = headerRow + 1;
    var action = String(payload.action || "").trim();

    // -----------------------------------------------------------------------
    // ACTION 1: UPDATE DESKRIPSI PENGIRIMAN — SATUAN
    // -----------------------------------------------------------------------
    if (action === "updateDeskripsi") {
      var targetResi = cleanCnote(payload.no_resi || payload.cnote_no || payload.resi);
      var newDeskripsi = payload.deskripsi !== undefined && payload.deskripsi !== null
        ? String(payload.deskripsi).trim()
        : "";

      if (!targetResi) {
        return jsonResponse({ success: false, error: "Nomor Resi wajib diisi." });
      }

      var lastRow1 = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);
      var cnoteMap1 = buildResiRowMap(sheet, cfg, dataStartRow, lastRow1);
      var foundRow = cnoteMap1[targetResi] || -1;

      if (foundRow === -1) {
        return jsonResponse({
          success: false,
          error: "Nomor resi '" + targetResi + "' belum ditemukan di sheet " + sheet.getName() + "."
        });
      }

      sheet.getRange(foundRow, cfg.descCol).setValue(newDeskripsi);
      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        sheet_type: cfg.type,
        message: "Deskripsi pengiriman untuk resi " + targetResi + " tersimpan ke Google Sheets.",
        row_number: foundRow,
        no_resi: targetResi,
        deskripsi: newDeskripsi
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 2: BULK UPDATE DESKRIPSI PENGIRIMAN — MASSAL
    // -----------------------------------------------------------------------
    if (action === "bulkUpdateDeskripsi") {
      var updates = Array.isArray(payload.updates) ? payload.updates : [];
      if (updates.length === 0) {
        return jsonResponse({ success: false, error: "Daftar update deskripsi kosong." });
      }

      var lrBulk = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);
      var mapBulk = buildResiRowMap(sheet, cfg, dataStartRow, lrBulk);
      var updatedDescCount = 0;

      for (var u = 0; u < updates.length; u++) {
        var item = updates[u] || {};
        var rKey = cleanCnote(item.no_resi || item.cnote_no || item.resi);
        if (!rKey || !mapBulk[rKey]) continue;

        var dText = item.deskripsi !== undefined && item.deskripsi !== null
          ? String(item.deskripsi).trim()
          : "";
        sheet.getRange(mapBulk[rKey], cfg.descCol).setValue(dText);
        updatedDescCount++;
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        sheet_type: cfg.type,
        message: updatedDescCount + " deskripsi pengiriman tersimpan ke Google Sheets " + sheet.getName() + ".",
        updated_count: updatedDescCount
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 3: TAMBAH / IMPORT RECORDS BARU (UPSERT AMAN)
    // -----------------------------------------------------------------------
    if (action === "upsertRecords" || action === "batchSave" || action === "saveRecords" || action === "addRecord") {
      var items = Array.isArray(payload.records)
        ? payload.records
        : (payload.record ? [payload.record] : []);

      if (items.length === 0) {
        return jsonResponse({ success: false, error: "Tidak ada data resi untuk disimpan." });
      }

      var overwriteExisting = payload.overwrite_existing === true;
      var overwriteDeskripsi = payload.overwrite_deskripsi === true;
      var skipDuplicates = payload.skip_duplicates === true;

      var lastDataRow = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);
      var existingMap = buildResiRowMap(sheet, cfg, dataStartRow, lastDataRow);

      var existingDescByRow = {};
      if (lastDataRow >= dataStartRow) {
        var numExisting = lastDataRow - dataStartRow + 1;
        var colDescValues = sheet.getRange(dataStartRow, cfg.descCol, numExisting, 1).getDisplayValues();
        for (var dIdx = 0; dIdx < colDescValues.length; dIdx++) {
          existingDescByRow[dataStartRow + dIdx] = String(colDescValues[dIdx][0] || "").trim();
        }
      }

      var newRowsBtoJ = [];
      var newRowsL = [];
      var newMemberRows = [];
      var insertedCount = 0;
      var updatedCount = 0;
      var skippedCount = 0;

      for (var j = 0; j < items.length; j++) {
        var it = items[j] || {};
        var cnote = cleanCnote(it.no_resi || it.cnote_no || it.resi);
        if (isHeaderPlaceholderResi(cnote)) continue;

        var deskripsiVal = String(it.deskripsi !== undefined ? it.deskripsi : (it.keterangan || "")).trim();
        var layananVal = String(it.layanan || it.services || it.service || "REG23").trim().toUpperCase();
        var receiverVal = String(it.nama_tujuan || it.receiver_name || it.nama_penerima || "").trim();
        var alamatPenerimaVal = String(it.alamat_penerima || it.full_address || "").trim();
        var destVal = String(it.alamat_tujuan || it.destination || it.kota_tujuan || "").trim();
        var shipperVal = String(it.nama_pengirim || it.shipper_name || "CCH-CHOCOCHIPS").trim();
        var amountVal = parseAmountNumber(it.nominal !== undefined ? it.nominal : (it.ongkir !== undefined ? it.ongkir : it.amount), "");
        var asuransiVal = parseAmountNumber(it.asuransi !== undefined ? it.asuransi : it.nominal_asuransi, "");
        var dateCellVal = parseIsoToSheetDateCell(it.tanggal || it.tanggal_kiriman || it.date || "");
        var agenVal = String(it.agen || cfg.defaultAgen).trim() || cfg.defaultAgen;
        var noColVal = it.no !== undefined && it.no !== null ? String(it.no).trim() : "";

        if (existingMap[cnote]) {
          if (skipDuplicates) {
            skippedCount++;
            continue;
          }

          var rowNum = existingMap[cnote];
          var currentSheetDesc = existingDescByRow[rowNum] || "";

          if (overwriteDeskripsi || (!currentSheetDesc && deskripsiVal)) {
            sheet.getRange(rowNum, cfg.descCol).setValue(deskripsiVal);
            existingDescByRow[rowNum] = deskripsiVal;
          }

          if (overwriteExisting) {
            if (cfg.type === "member") {
              if (layananVal) sheet.getRange(rowNum, 5).setValue(layananVal);
              if (receiverVal && receiverVal !== "-") sheet.getRange(rowNum, 6).setValue(receiverVal);
              if (destVal && destVal !== "-") sheet.getRange(rowNum, 7).setValue(destVal);
              if (shipperVal) sheet.getRange(rowNum, 8).setValue(shipperVal);
              if (amountVal > 0) {
                sheet.getRange(rowNum, 9).setValue(amountVal).setNumberFormat('"Rp   "#,##0');
              }
              if (dateCellVal) {
                sheet.getRange(rowNum, 10).setValue(dateCellVal).setNumberFormat("dd/mm/yyyy");
              }
              if (agenVal) sheet.getRange(rowNum, 11).setValue(agenVal);
            } else {
              if (dateCellVal) {
                sheet.getRange(rowNum, 4).setValue(dateCellVal).setNumberFormat("dd/mm/yyyy");
              }
              if (receiverVal && receiverVal !== "-") sheet.getRange(rowNum, 5).setValue(receiverVal);
              if (alamatPenerimaVal && alamatPenerimaVal !== "-") sheet.getRange(rowNum, 6).setValue(alamatPenerimaVal);
              if (destVal && destVal !== "-") sheet.getRange(rowNum, 7).setValue(destVal);
              if (layananVal) sheet.getRange(rowNum, 8).setValue(layananVal);
              if (amountVal > 0) sheet.getRange(rowNum, 9).setValue(amountVal);
              if (asuransiVal > 0) sheet.getRange(rowNum, 10).setValue(asuransiVal);
              if (agenVal) sheet.getRange(rowNum, 12).setValue(agenVal);
            }
          }
          updatedCount++;
        } else {
          if (cfg.type === "member") {
            newMemberRows.push([
              "",
              noColVal,
              cnote,
              deskripsiVal,
              layananVal,
              receiverVal === "-" ? "" : receiverVal,
              destVal === "-" ? "" : destVal,
              shipperVal || "CCH-CHOCOCHIPS",
              amountVal,
              dateCellVal,
              agenVal || "JNE Member"
            ]);
            existingMap[cnote] = lastDataRow + newMemberRows.length;
          } else {
            newRowsBtoJ.push([
              cnote,
              deskripsiVal,
              dateCellVal,
              receiverVal === "-" ? "" : receiverVal,
              alamatPenerimaVal === "-" ? "" : alamatPenerimaVal,
              destVal === "-" ? "" : destVal,
              layananVal,
              amountVal,
              asuransiVal
            ]);
            newRowsL.push([agenVal || "JNECorporated"]);
            existingMap[cnote] = lastDataRow + newRowsBtoJ.length;
          }
          insertedCount++;
        }
      }

      if (cfg.type === "member" && newMemberRows.length > 0) {
        var startAppendMember = Math.max(lastDataRow + 1, dataStartRow);
        preFormatResiAsText(sheet, cfg, startAppendMember, newMemberRows.length);
        sheet.getRange(startAppendMember, 1, newMemberRows.length, cfg.totalCols).setValues(newMemberRows);
        postFormatRows(sheet, cfg, startAppendMember, newMemberRows.length);
      } else if (cfg.type === "corporate" && newRowsBtoJ.length > 0) {
        var startAppendCorp = Math.max(lastDataRow + 1, dataStartRow);
        preFormatResiAsText(sheet, cfg, startAppendCorp, newRowsBtoJ.length);
        // Tulis B..J dan L tanpa menyentuh rumus VLOOKUP di Kolom K
        sheet.getRange(startAppendCorp, 2, newRowsBtoJ.length, 9).setValues(newRowsBtoJ);
        sheet.getRange(startAppendCorp, 12, newRowsL.length, 1).setValues(newRowsL);
        postFormatRows(sheet, cfg, startAppendCorp, newRowsBtoJ.length);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        sheet_type: cfg.type,
        message: "Google Sheets " + sheet.getName() + " diperbarui: " + insertedCount + " resi baru ditambahkan" +
          (updatedCount > 0 ? (", " + updatedCount + " diperbarui") : "") +
          (skippedCount > 0 ? (", " + skippedCount + " duplikat dilewati") : "") + ".",
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 4: EDIT LENGKAP SATU BARIS (KHUSUS ADMIN & WAREHOUSE)
    // -----------------------------------------------------------------------
    if (action === "updateRecord") {
      var origResi = cleanCnote(payload.original_no_resi || payload.no_resi);
      var rec = payload.record || payload;
      var newResi = cleanCnote(rec.no_resi || origResi);

      if (isHeaderPlaceholderResi(origResi) || isHeaderPlaceholderResi(newResi)) {
        return jsonResponse({ success: false, error: "Nomor Resi wajib diisi." });
      }

      var lrEdit = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);
      var mapEdit = buildResiRowMap(sheet, cfg, dataStartRow, lrEdit);
      var targetRowEdit = mapEdit[origResi] || -1;

      if (targetRowEdit === -1) {
        return jsonResponse({
          success: false,
          error: "Nomor resi '" + origResi + "' tidak ditemukan di Google Sheets " + sheet.getName() + "."
        });
      }

      if (newResi !== origResi && mapEdit[newResi] && mapEdit[newResi] !== targetRowEdit) {
        return jsonResponse({
          success: false,
          error: "Nomor resi '" + newResi + "' sudah terdaftar pada baris #" + mapEdit[newResi] + "."
        });
      }

      var currentRowVals = sheet.getRange(targetRowEdit, 1, 1, cfg.totalCols).getValues()[0];
      if (cfg.type === "member") {
        var updatedMemberRow = [
          currentRowVals[0] || "",
          rec.no !== undefined ? String(rec.no).trim() : currentRowVals[1],
          newResi,
          rec.deskripsi !== undefined ? String(rec.deskripsi).trim() : currentRowVals[3],
          String(rec.layanan || currentRowVals[4] || "REG23").trim().toUpperCase(),
          rec.nama_tujuan !== undefined ? String(rec.nama_tujuan === "-" ? "" : rec.nama_tujuan).trim() : currentRowVals[5],
          rec.alamat_tujuan !== undefined ? String(rec.alamat_tujuan === "-" ? "" : rec.alamat_tujuan).trim() : currentRowVals[6],
          String(rec.nama_pengirim || currentRowVals[7] || "CCH-CHOCOCHIPS").trim(),
          rec.nominal !== undefined ? parseAmountNumber(rec.nominal, "") : currentRowVals[8],
          rec.tanggal ? parseIsoToSheetDateCell(rec.tanggal) : currentRowVals[9],
          String(rec.agen || currentRowVals[10] || "JNE Member").trim()
        ];

        preFormatResiAsText(sheet, cfg, targetRowEdit, 1);
        sheet.getRange(targetRowEdit, 1, 1, cfg.totalCols).setValues([updatedMemberRow]);
        postFormatRows(sheet, cfg, targetRowEdit, 1);
      } else {
        var updatedCorpBtoJ = [[
          newResi,
          rec.deskripsi !== undefined ? String(rec.deskripsi).trim() : currentRowVals[2],
          rec.tanggal ? parseIsoToSheetDateCell(rec.tanggal) : currentRowVals[3],
          rec.nama_tujuan !== undefined ? String(rec.nama_tujuan === "-" ? "" : rec.nama_tujuan).trim() : currentRowVals[4],
          rec.alamat_penerima !== undefined ? String(rec.alamat_penerima === "-" ? "" : rec.alamat_penerima).trim() : currentRowVals[5],
          rec.alamat_tujuan !== undefined ? String(rec.alamat_tujuan === "-" ? "" : rec.alamat_tujuan).trim() : currentRowVals[6],
          String(rec.layanan || currentRowVals[7] || "REG23").trim().toUpperCase(),
          rec.nominal !== undefined ? parseAmountNumber(rec.nominal, "") : currentRowVals[8],
          rec.asuransi !== undefined ? parseAmountNumber(rec.asuransi, "") : currentRowVals[9]
        ]];
        var updatedCorpL = [[String(rec.agen || currentRowVals[11] || "JNECorporated").trim()]];

        preFormatResiAsText(sheet, cfg, targetRowEdit, 1);
        sheet.getRange(targetRowEdit, 2, 1, 9).setValues(updatedCorpBtoJ);
        sheet.getRange(targetRowEdit, 12, 1, 1).setValues(updatedCorpL);
        postFormatRows(sheet, cfg, targetRowEdit, 1);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        sheet_type: cfg.type,
        message: "Data resi " + newResi + " berhasil diperbarui di Google Sheets " + sheet.getName() + ".",
        row_number: targetRowEdit,
        no_resi: newResi
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 5: HAPUS BARIS DARI GOOGLE SHEETS (KHUSUS ADMIN & WAREHOUSE)
    // -----------------------------------------------------------------------
    if (action === "deleteRecords" || action === "deleteRecord") {
      var rawTargets = Array.isArray(payload.no_resis)
        ? payload.no_resis
        : (payload.no_resi ? [payload.no_resi] : []);

      var targetSet = {};
      for (var t = 0; t < rawTargets.length; t++) {
        var cleaned = cleanCnote(rawTargets[t]);
        if (cleaned) targetSet[cleaned] = true;
      }

      if (Object.keys(targetSet).length === 0) {
        return jsonResponse({ success: false, error: "Tidak ada nomor resi yang dipilih untuk dihapus." });
      }

      var lrDel = findLastDataRowByResiCol(sheet, dataStartRow, cfg.resiCol);
      if (lrDel < dataStartRow) {
        return jsonResponse({ success: true, deleted_count: 0, message: "Sheet sudah kosong." });
      }

      var numDelScan = lrDel - dataStartRow + 1;
      var resiColVals = sheet.getRange(dataStartRow, cfg.resiCol, numDelScan, 1).getDisplayValues();
      var rowsToDelete = [];

      for (var rIdx = 0; rIdx < resiColVals.length; rIdx++) {
        var rowKey = cleanCnote(resiColVals[rIdx][0]);
        if (rowKey && targetSet[rowKey]) {
          rowsToDelete.push(dataStartRow + rIdx);
        }
      }

      if (rowsToDelete.length === 0) {
        return jsonResponse({
          success: false,
          error: "Data resi yang dipilih tidak ditemukan di Google Sheets " + sheet.getName() + "."
        });
      }

      rowsToDelete.sort(function(a, b) { return b - a; });

      var deletedTotal = 0;
      var idxPtr = 0;
      while (idxPtr < rowsToDelete.length) {
        var endRow = rowsToDelete[idxPtr];
        var startRowBlock = endRow;
        while (idxPtr + 1 < rowsToDelete.length && rowsToDelete[idxPtr + 1] === startRowBlock - 1) {
          idxPtr++;
          startRowBlock = rowsToDelete[idxPtr];
        }
        var blockCount = endRow - startRowBlock + 1;
        if (startRowBlock >= dataStartRow) {
          sheet.deleteRows(startRowBlock, blockCount);
          deletedTotal += blockCount;
        }
        idxPtr++;
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        sheet_type: cfg.type,
        deleted_count: deletedTotal,
        message: deletedTotal + " baris data dihapus dari Google Sheets " + sheet.getName() + "."
      });
    }

    return jsonResponse({ success: false, error: "Action '" + action + "' tidak dikenali." });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}
