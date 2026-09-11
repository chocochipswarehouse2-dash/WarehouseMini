/**
 * WMS GAS BACKEND — sheets.gs
 * ============================
 * Helper untuk operasi dasar pada Google Sheets:
 * - Buka spreadsheet
 * - Buat/cari sheet
 * - Cari baris berdasarkan UUID
 * - Insert, update, soft-delete baris
 * - Ensure header row
 * 
 * GAS TIDAK BOLEH melakukan kalkulasi — hanya operasi tulis murni.
 */

function getSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Dapatkan sheet berdasarkan nama, atau buat baru jika belum ada.
 * Jika baru dibuat, otomatis tulis header berdasarkan SCHEMA.
 */
function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  // Buat sheet baru
  sheet = ss.insertSheet(sheetName);

  // Tulis header dari schema jika ada
  var schema = getSchema(sheetName);
  if (schema && schema.columns && schema.columns.length > 0) {
    sheet.appendRow(schema.columns);
    // Format header: bold, freeze row pertama
    sheet.getRange(1, 1, 1, schema.columns.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Pastikan sheet sudah memiliki header row yang benar.
 * Jika header kosong atau berbeda, tulis ulang.
 * TIDAK menghapus data yang sudah ada.
 */
function ensureSheetHeader(sheet, sheetName) {
  var schema = getSchema(sheetName);
  if (!schema || !schema.columns || schema.columns.length === 0) return;

  var lastRow = sheet.getLastRow();

  if (lastRow === 0) {
    sheet.appendRow(schema.columns);
    sheet.getRange(1, 1, 1, schema.columns.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }

  var headerRow = sheet.getRange(1, 1, 1, schema.columns.length).getValues()[0];
  var needsUpdate = false;

  for (var i = 0; i < schema.columns.length; i++) {
    if (String(headerRow[i] || '').trim() !== schema.columns[i]) {
      needsUpdate = true;
      break;
    }
  }

  // Jika ada kolom baru yang belum ada di sheet, tambahkan
  var currentColCount = sheet.getLastColumn();
  if (schema.columns.length > currentColCount) {
    for (var j = currentColCount; j < schema.columns.length; j++) {
      sheet.getRange(1, j + 1).setValue(schema.columns[j]).setFontWeight('bold');
    }
  }
}

/**
 * Cari nomor baris berdasarkan nilai UUID di kolom A (kolom 1).
 * Returns: nomor baris (1-indexed), atau null jika tidak ditemukan.
 */
function findRowByUUID(sheet, uuid) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null; // Hanya header

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var uuidStr = String(uuid || '').trim();

  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0] || '').trim() === uuidStr) {
      return i + 2; // +2 karena index 0 = baris ke-2 (baris 1 adalah header)
    }
  }
  return null;
}

/**
 * Dapatkan index kolom berdasarkan nama kolom dari header row.
 * Returns: index 1-based, atau -1 jika tidak ditemukan.
 */
function getColumnIndex(sheet, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === columnName.toLowerCase()) {
      return i + 1; // 1-indexed
    }
  }
  return -1;
}

/**
 * Konversi record Supabase menjadi array baris sesuai urutan kolom di SCHEMA.
 * Field JSONB (object/array) di-stringify.
 */
function recordToRow(record, sheetName) {
  var schema = getSchema(sheetName);
  if (!schema) return [];

  return schema.columns.map(function(col) {
    var val = record[col];
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

/**
 * INSERT: Tambah baris baru di akhir sheet.
 */
function insertRow(sheet, sheetName, record) {
  ensureSheetHeader(sheet, sheetName);
  var row = recordToRow(record, sheetName);
  sheet.appendRow(row);
  return true;
}

/**
 * UPDATE: Cari baris berdasarkan UUID, lalu update seluruh baris.
 * Jika tidak ditemukan, insert sebagai baris baru (upsert).
 */
function updateRow(sheet, sheetName, record) {
  var rowNum = findRowByUUID(sheet, record.id);
  if (!rowNum) {
    // Upsert: tidak ditemukan → insert baru
    return insertRow(sheet, sheetName, record);
  }

  var row = recordToRow(record, sheetName);
  var schema = getSchema(sheetName);
  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  return true;
}

/**
 * SOFT DELETE: Tandai baris dengan status 'DELETED'.
 * Tidak menghapus baris secara fisik untuk keamanan data.
 */
function softDeleteRow(sheet, uuid) {
  var rowNum = findRowByUUID(sheet, uuid);
  if (!rowNum) return false;

  var statusColIdx = getColumnIndex(sheet, 'status');
  if (statusColIdx > 0) {
    sheet.getRange(rowNum, statusColIdx).setValue('DELETED');
  } else {
    // Jika tidak ada kolom status, tandai di kolom UUID dengan prefix DELETED-
    var currentId = sheet.getRange(rowNum, 1).getValue();
    sheet.getRange(rowNum, 1).setValue('DELETED-' + currentId);
  }
  return true;
}

/**
 * Baca semua data dari sheet sebagai array of objects.
 * Skip baris dengan status 'DELETED'.
 */
function readAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var result = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[String(headers[j] || '').trim()] = row[j];
    }
    // Skip soft-deleted rows
    if (String(obj['status'] || '').toUpperCase() === 'DELETED') continue;
    result.push(obj);
  }

  return result;
}

/**
 * Helper: kembalikan ContentService JSON response
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
