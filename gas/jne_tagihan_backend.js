/**
 * =========================================================================
 * GOOGLE APPS SCRIPT BACKEND — REKAP TAGIHAN JNE (SHEET "JNEMember")
 * =========================================================================
 * Script ID   : 1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ
 * Spreadsheet : https://docs.google.com/spreadsheets/d/1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k/edit?gid=1026608111#gid=1026608111
 * Sheet Target: "JNEMember" (gid = 1026608111)
 *
 * Struktur Kolom Baku Sheet JNEMember (Baris 1 = Header):
 * A (1)  : "" (Margin Kosong)
 * B (2)  : No
 * C (3)  : Cnote No (Format Teks '@' agar angka 0 di depan tidak hilang)
 * D (4)  : Deskripsi pengiriman (Sinkron 2 Arah: Frontend WMS <-> GSheet)
 * E (5)  : Services (CTC23, REG23, CTCYES23, YES23, JTR23, dll.)
 * F (6)  : Receiver Name
 * G (7)  : Destination
 * H (8)  : Shipper Name (Default: CCH-CHOCOCHIPS)
 * I (9)  : Amount (Numerik Rupiah dengan format '"Rp   "#,##0')
 * J (10) : Tanggal Pengiriman (Date dengan format 'dd/mm/yyyy')
 * K (11) : Agen (Default: JNE Member)
 * =========================================================================
 */

var SPREADSHEET_ID = "1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k";
var SHEET_NAME = "JNEMember";
var TARGET_GID = 1026608111;
var TOTAL_COLS = 11;

var HEADERS = [
  "",                       // A (1)
  "No",                     // B (2)
  "Cnote No",               // C (3)
  "Deskripsi pengiriman",   // D (4)
  "Services",               // E (5)
  "Receiver Name",          // F (6)
  "Destination",            // G (7)
  "Shipper Name",           // H (8)
  "Amount",                 // I (9)
  "Tanggal Pengiriman",     // J (10)
  "Agen"                    // K (11)
];

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ambil sheet JNEMember berdasarkan nama atau gid=1026608111
 */
function getJneMemberSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var allSheets = ss.getSheets();
    for (var i = 0; i < allSheets.length; i++) {
      if (allSheets[i].getSheetId() === TARGET_GID) {
        sheet = allSheets[i];
        break;
      }
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  var lr = sheet.getLastRow();
  if (lr < 1) {
    sheet.getRange(1, 1, 1, TOTAL_COLS).setValues([HEADERS]);
    sheet.getRange(1, 2, 1, TOTAL_COLS - 1)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Deteksi baris header ("Cnote No") secara dinamis di baris 1..5 (default baris 1)
 */
function detectHeaderRow(sheet) {
  var lr = sheet.getLastRow();
  if (lr < 1) return 1;
  var scanRows = Math.min(lr, 5);
  var sample = sheet.getRange(1, 1, scanRows, TOTAL_COLS).getDisplayValues();
  for (var r = 0; r < sample.length; r++) {
    var colC = String(sample[r][2] || "").trim().toLowerCase();
    var colD = String(sample[r][3] || "").trim().toLowerCase();
    if (colC.indexOf("cnote") !== -1 || colC.indexOf("resi") !== -1 || colD.indexOf("deskripsi") !== -1) {
      return r + 1;
    }
  }
  return 1;
}

/**
 * Normalisasi nomor resi tanpa memangkas leading zero
 */
function cleanCnote(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim().replace(/[\s\-]/g, "").toUpperCase();
}

/**
 * Parse nominal Rupiah baik dari angka maupun string "Rp   10.000" / "10,000.00"
 */
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

/**
 * Normalisasi Tanggal dari sel GSheet ke string ISO YYYY-MM-DD
 */
function normalizeSheetDateToIso(rawVal, displayVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return Utilities.formatDate(rawVal, "Asia/Jakarta", "yyyy-MM-dd");
  }
  var s = String(displayVal || rawVal || "").trim();
  if (!s) return "";

  var dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) {
    var dd = ("0" + dmy[1]).slice(-2);
    var mm = ("0" + dmy[2]).slice(-2);
    return dmy[3] + "-" + mm + "-" + dd;
  }

  var ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    var m2 = ("0" + ymd[2]).slice(-2);
    var d2 = ("0" + ymd[3]).slice(-2);
    return ymd[1] + "-" + m2 + "-" + d2;
  }

  return s;
}

/**
 * Konversi string YYYY-MM-DD atau DD/MM/YYYY menjadi Date objek pukul 12:00 siang
 * agar tersimpan sebagai Date asli di GSheet dengan format dd/mm/yyyy tanpa geser timezone.
 */
function parseIsoToSheetDateCell(dateStr) {
  var s = String(dateStr || "").trim();
  if (!s) return "";

  var ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0);
  }

  var dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 12, 0, 0);
  }

  return s;
}

/**
 * Terapkan format kolom standar JNEMember SEBELUM/SESUDAH penulisan baris baru
 */
function preFormatCnoteAsText(sheet, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, 3, numRows, 1).setNumberFormat("@");
}

function postFormatJneMemberRows(sheet, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, 3, numRows, 1).setNumberFormat("@");
  sheet.getRange(startRow, 9, numRows, 1).setNumberFormat('"Rp   "#,##0');
  sheet.getRange(startRow, 10, numRows, 1).setNumberFormat("dd/mm/yyyy");
}

/**
 * Bangun peta Cnote -> Nomor Baris 1-based di GSheet
 */
function buildCnoteRowMap(sheet, dataStartRow, lastRow) {
  var map = {};
  if (lastRow < dataStartRow) return map;
  var numRows = lastRow - dataStartRow + 1;
  var cnoteDisplay = sheet.getRange(dataStartRow, 3, numRows, 1).getDisplayValues();
  for (var i = 0; i < cnoteDisplay.length; i++) {
    var key = cleanCnote(cnoteDisplay[i][0]);
    if (key) {
      map[key] = dataStartRow + i;
    }
  }
  return map;
}

/**
 * =========================================================================
 * 1. API GET: Baca seluruh baris dari Sheet "JNEMember"
 * =========================================================================
 */
function doGet(e) {
  try {
    var sheet = getJneMemberSheet();
    var lastRow = sheet.getLastRow();
    var headerRow = detectHeaderRow(sheet);
    var dataStartRow = headerRow + 1;

    if (lastRow < dataStartRow) {
      return jsonResponse({
        success: true,
        sheet_name: sheet.getName(),
        gid: sheet.getSheetId(),
        header_row: headerRow,
        total_records: 0,
        records: []
      });
    }

    var numRows = lastRow - dataStartRow + 1;
    var rawRange = sheet.getRange(dataStartRow, 1, numRows, TOTAL_COLS);
    var rawValues = rawRange.getValues();
    var displayValues = rawRange.getDisplayValues();
    var records = [];

    for (var i = 0; i < numRows; i++) {
      var raw = rawValues[i];
      var disp = displayValues[i];

      var cnote = cleanCnote(disp[2] || raw[2]);
      if (!cnote || cnote === "CNOTENO" || cnote === "NORESI") continue;

      var rowNumber = dataStartRow + i;
      var noVal = String(disp[1] || raw[1] || "").trim();
      var deskripsi = String(disp[3] !== undefined ? disp[3] : (raw[3] || "")).trim();
      var layanan = String(disp[4] || raw[4] || "").trim();
      var namaTujuan = String(disp[5] || raw[5] || "").trim();
      var alamatTujuan = String(disp[6] || raw[6] || "").trim();
      var namaPengirim = String(disp[7] || raw[7] || "CCH-CHOCOCHIPS").trim();
      var nominal = parseAmountNumber(raw[8], disp[8]);
      var tanggalIso = normalizeSheetDateToIso(raw[9], disp[9]);
      var agen = String(disp[10] || raw[10] || "JNE Member").trim();

      records.push({
        row_number: rowNumber,
        no: noVal,
        no_resi: cnote,
        deskripsi: deskripsi,
        layanan: layanan || "REG23",
        nama_tujuan: namaTujuan,
        alamat_tujuan: alamatTujuan,
        nama_pengirim: namaPengirim || "CCH-CHOCOCHIPS",
        nominal: nominal,
        tanggal: tanggalIso,
        agen: agen || "JNE Member"
      });
    }

    return jsonResponse({
      success: true,
      sheet_name: sheet.getName(),
      gid: sheet.getSheetId(),
      header_row: headerRow,
      total_records: records.length,
      records: records
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * =========================================================================
 * 2. API POST: Operasi CRUD & Sinkronisasi 2 Arah pada Sheet "JNEMember"
 * =========================================================================
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (lockErr) {
    return jsonResponse({ success: false, error: "Server GSheet sedang sibuk, silakan coba beberapa detik lagi." });
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

    var sheet = getJneMemberSheet();
    var headerRow = detectHeaderRow(sheet);
    var dataStartRow = headerRow + 1;
    var action = String(payload.action || "").trim();

    // -----------------------------------------------------------------------
    // ACTION 1: UPDATE DESKRIPSI PENGIRIMAN (KOLOM D) — SATUAN
    // -----------------------------------------------------------------------
    if (action === "updateDeskripsi") {
      var targetResi = cleanCnote(payload.no_resi || payload.cnote_no || payload.resi);
      var newDeskripsi = payload.deskripsi !== undefined && payload.deskripsi !== null
        ? String(payload.deskripsi).trim()
        : "";

      if (!targetResi) {
        return jsonResponse({ success: false, error: "Nomor Resi (Cnote No) wajib diisi." });
      }

      var lr = sheet.getLastRow();
      var cnoteMap = buildCnoteRowMap(sheet, dataStartRow, lr);
      var foundRow = cnoteMap[targetResi] || -1;

      if (foundRow === -1) {
        return jsonResponse({
          success: false,
          error: "Cnote No '" + targetResi + "' belum ditemukan di sheet JNEMember."
        });
      }

      // Hanya tulis Kolom D (kolom ke-4) tanpa menyentuh kolom lain
      sheet.getRange(foundRow, 4).setValue(newDeskripsi);
      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: "Deskripsi pengiriman untuk Cnote " + targetResi + " tersimpan ke GSheet.",
        row_number: foundRow,
        no_resi: targetResi,
        deskripsi: newDeskripsi
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 2: BULK UPDATE DESKRIPSI PENGIRIMAN (KOLOM D) — MASSAL
    // -----------------------------------------------------------------------
    if (action === "bulkUpdateDeskripsi") {
      var updates = Array.isArray(payload.updates) ? payload.updates : [];
      if (updates.length === 0) {
        return jsonResponse({ success: false, error: "Daftar update deskripsi kosong." });
      }

      var lrBulk = sheet.getLastRow();
      var mapBulk = buildCnoteRowMap(sheet, dataStartRow, lrBulk);
      var updatedDescCount = 0;

      for (var u = 0; u < updates.length; u++) {
        var item = updates[u] || {};
        var rKey = cleanCnote(item.no_resi || item.cnote_no || item.resi);
        if (!rKey || !mapBulk[rKey]) continue;

        var dText = item.deskripsi !== undefined && item.deskripsi !== null
          ? String(item.deskripsi).trim()
          : "";
        sheet.getRange(mapBulk[rKey], 4).setValue(dText);
        updatedDescCount++;
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: updatedDescCount + " deskripsi pengiriman berhasil disimpan ke GSheet JNEMember.",
        updated_count: updatedDescCount
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 3: TAMBAH / IMPORT RECORDS BARU (UPSERT AMAN TANPA TIMPA KOLOM D)
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

      var lastRow = sheet.getLastRow();
      var existingMap = buildCnoteRowMap(sheet, dataStartRow, lastRow);

      // Baca nilai Kolom D existing agar deskripsi manual di GSheet tidak pernah tertimpa kosong
      var existingDescByRow = {};
      if (lastRow >= dataStartRow) {
        var numExisting = lastRow - dataStartRow + 1;
        var colDValues = sheet.getRange(dataStartRow, 4, numExisting, 1).getDisplayValues();
        for (var dIdx = 0; dIdx < colDValues.length; dIdx++) {
          existingDescByRow[dataStartRow + dIdx] = String(colDValues[dIdx][0] || "").trim();
        }
      }

      var newRows = [];
      var insertedCount = 0;
      var updatedCount = 0;
      var skippedCount = 0;

      for (var j = 0; j < items.length; j++) {
        var it = items[j] || {};
        var cnote = cleanCnote(it.no_resi || it.cnote_no || it.resi);
        if (!cnote) continue;

        var deskripsiVal = String(it.deskripsi !== undefined ? it.deskripsi : (it.keterangan || "")).trim();
        var layananVal = String(it.layanan || it.services || it.service || "REG23").trim().toUpperCase();
        var receiverVal = String(it.nama_tujuan || it.receiver_name || it.nama_penerima || "").trim();
        var destVal = String(it.alamat_tujuan || it.destination || it.alamat || "").trim();
        var shipperVal = String(it.nama_pengirim || it.shipper_name || "CCH-CHOCOCHIPS").trim();
        var amountVal = parseAmountNumber(it.nominal !== undefined ? it.nominal : it.amount, "");
        var dateCellVal = parseIsoToSheetDateCell(it.tanggal || it.date || "");
        var agenVal = String(it.agen || "JNE Member").trim();
        var noColVal = it.no !== undefined && it.no !== null ? String(it.no).trim() : "";

        if (existingMap[cnote]) {
          if (skipDuplicates) {
            skippedCount++;
            continue;
          }

          var rowNum = existingMap[cnote];
          var currentSheetDesc = existingDescByRow[rowNum] || "";

          // Update Kolom D hanya jika diminta eksplisit ATAU jika Kolom D di GSheet masih kosong dan input baru punya isi
          if (overwriteDeskripsi || (!currentSheetDesc && deskripsiVal)) {
            sheet.getRange(rowNum, 4).setValue(deskripsiVal);
            existingDescByRow[rowNum] = deskripsiVal;
          }

          if (overwriteExisting) {
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
          }
          updatedCount++;
        } else {
          newRows.push([
            "",            // A: kosong
            noColVal,      // B: No
            cnote,         // C: Cnote No
            deskripsiVal,  // D: Deskripsi pengiriman
            layananVal,    // E: Services
            receiverVal === "-" ? "" : receiverVal, // F: Receiver Name
            destVal === "-" ? "" : destVal,         // G: Destination
            shipperVal || "CCH-CHOCOCHIPS",         // H: Shipper Name
            amountVal,     // I: Amount
            dateCellVal,   // J: Tanggal Pengiriman
            agenVal || "JNE Member"                 // K: Agen
          ]);
          existingMap[cnote] = lastRow + newRows.length;
          insertedCount++;
        }
      }

      if (newRows.length > 0) {
        var startAppendRow = Math.max(sheet.getLastRow() + 1, dataStartRow);
        // WAJIB format Kolom C sebagai teks '@' SEBELUM setValues agar leading 0 tidak hilang
        preFormatCnoteAsText(sheet, startAppendRow, newRows.length);
        sheet.getRange(startAppendRow, 1, newRows.length, TOTAL_COLS).setValues(newRows);
        postFormatJneMemberRows(sheet, startAppendRow, newRows.length);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: "GSheet JNEMember diperbarui: " + insertedCount + " resi baru ditambahkan" +
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

      if (!origResi || !newResi) {
        return jsonResponse({ success: false, error: "Nomor Resi (Cnote No) wajib diisi." });
      }

      var lrEdit = sheet.getLastRow();
      var mapEdit = buildCnoteRowMap(sheet, dataStartRow, lrEdit);
      var targetRowEdit = mapEdit[origResi] || -1;

      if (targetRowEdit === -1) {
        return jsonResponse({
          success: false,
          error: "Baris Cnote '" + origResi + "' tidak ditemukan di GSheet JNEMember."
        });
      }

      if (newResi !== origResi && mapEdit[newResi] && mapEdit[newResi] !== targetRowEdit) {
        return jsonResponse({
          success: false,
          error: "Cnote No '" + newResi + "' sudah terdaftar pada baris #" + mapEdit[newResi] + "."
        });
      }

      var currentRowVals = sheet.getRange(targetRowEdit, 1, 1, TOTAL_COLS).getValues()[0];
      var updatedRow = [
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

      preFormatCnoteAsText(sheet, targetRowEdit, 1);
      sheet.getRange(targetRowEdit, 1, 1, TOTAL_COLS).setValues([updatedRow]);
      postFormatJneMemberRows(sheet, targetRowEdit, 1);
      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: "Data Cnote " + newResi + " (baris #" + targetRowEdit + ") berhasil diperbarui di GSheet.",
        row_number: targetRowEdit,
        no_resi: newResi
      });
    }

    // -----------------------------------------------------------------------
    // ACTION 5: HAPUS BARIS DARI GSHEET JNEMember (KHUSUS ADMIN & WAREHOUSE)
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

      var targetKeys = Object.keys(targetSet);
      if (targetKeys.length === 0) {
        return jsonResponse({ success: false, error: "Tidak ada Cnote No yang dipilih untuk dihapus." });
      }

      var lrDel = sheet.getLastRow();
      if (lrDel < dataStartRow) {
        return jsonResponse({ success: true, deleted_count: 0, message: "Sheet sudah kosong." });
      }

      var numDelScan = lrDel - dataStartRow + 1;
      var cnotesCol = sheet.getRange(dataStartRow, 3, numDelScan, 1).getDisplayValues();
      var rowsToDelete = [];

      for (var rIdx = 0; rIdx < cnotesCol.length; rIdx++) {
        var rowKey = cleanCnote(cnotesCol[rIdx][0]);
        if (rowKey && targetSet[rowKey]) {
          rowsToDelete.push(dataStartRow + rIdx);
        }
      }

      if (rowsToDelete.length === 0) {
        return jsonResponse({
          success: false,
          error: "Data Cnote yang dipilih tidak ditemukan di GSheet JNEMember."
        });
      }

      // Urutkan descending (bawah ke atas) dan gabungkan baris berurutan agar cepat & aman indeks
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
        deleted_count: deletedTotal,
        message: deletedTotal + " baris data berhasil dihapus dari GSheet JNEMember."
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
