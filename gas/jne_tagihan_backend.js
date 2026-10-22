/**
 * =========================================================================
 * GOOGLE APPS SCRIPT BACKEND — REKAP TAGIHAN DAN RESI JNE
 * =========================================================================
 * Script ID   : 1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ
 * Spreadsheet : https://docs.google.com/spreadsheets/d/1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k/edit
 * Sheet Target: "Rekap Tagihan JNE"
 *
 * Kolom yang dikelola:
 * 1. No (A)
 * 2. No Resi (B)
 * 3. Tanggal Pengiriman (C)
 * 4. Nominal Tagihan (Rp) (D)
 * 5. Layanan / Service (E)
 * 6. Nama Penerima (F)
 * 7. Alamat Tujuan (G)
 * 8. Deskripsi Pengiriman (H) [Bisa diisi manual/otomatis]
 * 9. File Sumber (I)
 * 10. Tanggal Input (J)
 * 11. Diinput Oleh (K)
 * =========================================================================
 */

var SPREADSHEET_ID = "1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k";
var SHEET_NAME = "Rekap Tagihan JNE";
var TOTAL_COLS = 11;

var HEADERS = [
  "No",                       // A (1)
  "No Resi",                  // B (2)
  "Tanggal Pengiriman",       // C (3)
  "Nominal Tagihan (Rp)",     // D (4)
  "Layanan / Service",        // E (5)
  "Nama Penerima",            // F (6)
  "Alamat Tujuan",            // G (7)
  "Deskripsi Pengiriman",     // H (8)
  "File Sumber",              // I (9)
  "Tanggal Input",            // J (10)
  "Diinput Oleh"              // K (11)
];

/**
 * Pastikan Sheet Target dan Header tersedia dengan format profesional
 */
function getOrCreateSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Cek apakah header baris 1 sudah ada
  var lr = sheet.getLastRow();
  var lc = sheet.getLastColumn();
  var needsHeader = false;

  if (lr < 1 || lc < TOTAL_COLS) {
    needsHeader = true;
  } else {
    var existingH = sheet.getRange(1, 1, 1, TOTAL_COLS).getValues()[0];
    if (String(existingH[1] || "").trim() !== "No Resi") {
      needsHeader = true;
    }
  }

  if (needsHeader) {
    sheet.getRange(1, 1, 1, TOTAL_COLS).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, TOTAL_COLS)
      .setBackground("#1E293B")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Format tabel dan kolom
 */
function formatTable(sheet, startRow, numRows) {
  if (numRows < 1) return;
  var range = sheet.getRange(startRow, 1, numRows, TOTAL_COLS);
  range.setBorder(true, true, true, true, true, true, "#E2E8F0", SpreadsheetApp.BorderStyle.SOLID);
  
  // No, Resi, Tanggal, Layanan center
  sheet.getRange(startRow, 1, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(startRow, 2, numRows, 1).setNumberFormat("@").setHorizontalAlignment("center");
  sheet.getRange(startRow, 3, numRows, 1).setHorizontalAlignment("center");
  
  // Nominal format rupiah
  sheet.getRange(startRow, 4, numRows, 1).setNumberFormat("#,##0").setHorizontalAlignment("right");
  
  // Layanan center
  sheet.getRange(startRow, 5, numRows, 1).setHorizontalAlignment("center");
  
  // Deskripsi & Alamat wrap
  sheet.getRange(startRow, 7, numRows, 1).setWrap(true);
  sheet.getRange(startRow, 8, numRows, 1).setWrap(true);
  
  // Tanggal input & user center
  sheet.getRange(startRow, 10, numRows, 2).setHorizontalAlignment("center");
}

/**
 * Helper JSON Response
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * =========================================================================
 * 1. API GET: Ambil seluruh data rekap tagihan JNE dari Sheet
 * =========================================================================
 */
function doGet(e) {
  try {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return jsonResponse({
        success: true,
        sheet_name: SHEET_NAME,
        total_records: 0,
        records: []
      });
    }

    var data = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLS).getValues();
    var records = [];

    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var noResi = String(r[1] || "").trim();
      if (!noResi) continue;

      var nominalVal = Number(r[3]) || 0;
      var tanggalVal = r[2];
      var tanggalStr = "";
      if (tanggalVal instanceof Date) {
        tanggalStr = Utilities.formatDate(tanggalVal, "Asia/Jakarta", "yyyy-MM-dd");
      } else {
        tanggalStr = String(tanggalVal || "").trim();
      }

      records.push({
        row_number: i + 2,
        no: Number(r[0]) || (i + 1),
        no_resi: noResi,
        tanggal: tanggalStr,
        nominal: nominalVal,
        layanan: String(r[4] || "").trim(),
        nama_tujuan: String(r[5] || "").trim(),
        alamat_tujuan: String(r[6] || "").trim(),
        deskripsi: String(r[7] || "").trim(),
        source_file: String(r[8] || "").trim(),
        created_at: String(r[9] || "").trim(),
        operator: String(r[10] || "").trim()
      });
    }

    return jsonResponse({
      success: true,
      sheet_name: SHEET_NAME,
      total_records: records.length,
      records: records
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * =========================================================================
 * 2. API POST: Simpan batch rekap / update deskripsi manual
 * =========================================================================
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (lockErr) {
    return jsonResponse({ success: false, error: "Server sedang sibuk, silakan coba beberapa detik lagi." });
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

    var sheet = getOrCreateSheet();
    var action = String(payload.action || "").trim();
    var now = new Date();
    var timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
    var activeOperator = String(payload.operator || payload.user || "WMS Admin").trim();

    // -----------------------------------------------------------------------
    // ACTION A: BATCH SAVE / UPSERT RECORDS
    // -----------------------------------------------------------------------
    if (action === "batchSave" || action === "saveRecords") {
      var items = Array.isArray(payload.records) ? payload.records : [];
      if (items.length === 0) {
        return jsonResponse({ success: false, error: "Tidak ada data records yang dikirim." });
      }

      var lastRow = sheet.getLastRow();
      var existingResiMap = {}; // resi -> rowNum (1-indexed)

      if (lastRow > 1) {
        var existingResis = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (var i = 0; i < existingResis.length; i++) {
          var resiKey = String(existingResis[i][0] || "").trim().toUpperCase();
          if (resiKey) {
            existingResiMap[resiKey] = i + 2;
          }
        }
      }

      var newRows = [];
      var updatedCount = 0;
      var insertedCount = 0;
      var currentNumber = Object.keys(existingResiMap).length;

      for (var j = 0; j < items.length; j++) {
        var it = items[j] || {};
        var resi = String(it.no_resi || it.resi || "").trim();
        if (!resi) continue;

        var cleanKey = resi.toUpperCase();
        var nominal = Number(it.nominal || it.ongkir || it.total || 0);
        var tanggal = String(it.tanggal || "").trim();
        var layanan = String(it.layanan || it.service || "REG").trim();
        var namaTujuan = String(it.nama_tujuan || it.nama_penerima || "").trim();
        var alamatTujuan = String(it.alamat_tujuan || it.alamat || "").trim();
        var deskripsi = String(it.deskripsi || it.keterangan || "").trim();
        var sourceFile = String(it.source_file || payload.source_file || "").trim();

        if (existingResiMap[cleanKey]) {
          // Update baris yang sudah ada
          var rowNum = existingResiMap[cleanKey];
          if (nominal > 0) sheet.getRange(rowNum, 4).setValue(nominal);
          if (layanan) sheet.getRange(rowNum, 5).setValue(layanan);
          if (namaTujuan) sheet.getRange(rowNum, 6).setValue(namaTujuan);
          if (alamatTujuan) sheet.getRange(rowNum, 7).setValue(alamatTujuan);
          if (deskripsi) sheet.getRange(rowNum, 8).setValue(deskripsi);
          if (sourceFile) sheet.getRange(rowNum, 9).setValue(sourceFile);
          sheet.getRange(rowNum, 10).setValue(timestampNow);
          sheet.getRange(rowNum, 11).setValue(activeOperator);
          updatedCount++;
        } else {
          // Baris baru
          currentNumber++;
          newRows.push([
            currentNumber,
            resi,
            tanggal,
            nominal,
            layanan,
            namaTujuan,
            alamatTujuan,
            deskripsi,
            sourceFile,
            timestampNow,
            activeOperator
          ]);
          existingResiMap[cleanKey] = (lastRow + newRows.length);
          insertedCount++;
        }
      }

      if (newRows.length > 0) {
        var startAppendRow = sheet.getLastRow() + 1;
        sheet.getRange(startAppendRow, 1, newRows.length, TOTAL_COLS).setValues(newRows);
        formatTable(sheet, startAppendRow, newRows.length);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: "Berhasil menyimpan data JNE: " + insertedCount + " baru ditambahkan, " + updatedCount + " diupdate.",
        inserted: insertedCount,
        updated: updatedCount,
        total_handled: items.length
      });
    }

    // -----------------------------------------------------------------------
    // ACTION B: UPDATE MANUAL DESKRIPSI PENGIRIMAN
    // -----------------------------------------------------------------------
    if (action === "updateDeskripsi") {
      var targetResi = String(payload.no_resi || payload.resi || "").trim().toUpperCase();
      var newDeskripsi = String(payload.deskripsi || "").trim();

      if (!targetResi) {
        return jsonResponse({ success: false, error: "no_resi wajib diisi." });
      }

      var lr = sheet.getLastRow();
      if (lr <= 1) {
        return jsonResponse({ success: false, error: "Sheet kosong." });
      }

      var resiList = sheet.getRange(2, 2, lr - 1, 1).getValues();
      var foundRow = -1;

      for (var k = 0; k < resiList.length; k++) {
        if (String(resiList[k][0] || "").trim().toUpperCase() === targetResi) {
          foundRow = k + 2;
          break;
        }
      }

      if (foundRow === -1) {
        return jsonResponse({ success: false, error: "No resi '" + targetResi + "' tidak ditemukan di sheet." });
      }

      sheet.getRange(foundRow, 8).setValue(newDeskripsi); // Kolom H (Deskripsi)
      sheet.getRange(foundRow, 10).setValue(timestampNow);
      sheet.getRange(foundRow, 11).setValue(activeOperator);

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: "Deskripsi pengiriman untuk resi " + targetResi + " berhasil disimpan.",
        no_resi: targetResi,
        deskripsi: newDeskripsi
      });
    }

    // -----------------------------------------------------------------------
    // ACTION C: BULK UPDATE DESKRIPSI
    // -----------------------------------------------------------------------
    if (action === "bulkUpdateDeskripsi") {
      var updates = Array.isArray(payload.updates) ? payload.updates : [];
      if (updates.length === 0) {
        return jsonResponse({ success: false, error: "Updates list kosong." });
      }

      var lr2 = sheet.getLastRow();
      if (lr2 <= 1) return jsonResponse({ success: false, error: "Sheet kosong." });

      var resiMap = {};
      var resis = sheet.getRange(2, 2, lr2 - 1, 1).getValues();
      for (var idx = 0; idx < resis.length; idx++) {
        var key = String(resis[idx][0] || "").trim().toUpperCase();
        if (key) resiMap[key] = idx + 2;
      }

      var successCount = 0;
      for (var u = 0; u < updates.length; u++) {
        var item = updates[u] || {};
        var rKey = String(item.no_resi || item.resi || "").trim().toUpperCase();
        var dText = String(item.deskripsi || "").trim();
        if (rKey && resiMap[rKey]) {
          var targetRow = resiMap[rKey];
          sheet.getRange(targetRow, 8).setValue(dText);
          sheet.getRange(targetRow, 10).setValue(timestampNow);
          sheet.getRange(targetRow, 11).setValue(activeOperator);
          successCount++;
        }
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: true,
        message: successCount + " deskripsi pengiriman berhasil diupdate.",
        updated_count: successCount
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
