/**
 * WMS GAS BACKEND — webhook.gs
 * ============================
 * Handler utama untuk menerima webhook dari Supabase.
 * 
 * Supabase mengirim POST request ke URL GAS ini setiap ada:
 * - INSERT: data baru → tambah baris ke sheet
 * - UPDATE: data diubah → update baris yang memiliki UUID sama
 * - DELETE: data dihapus → soft-delete (status = 'DELETED')
 * 
 * KEAMANAN: Setiap request WAJIB menyertakan secret token di query param.
 * URL format: {GAS_WEB_APP_URL}?secret=wms-webhook-secret-2026
 * 
 * GAS TIDAK BOLEH melakukan kalkulasi — hanya tulis murni dari Supabase.
 */

/**
 * Handler POST — menerima webhook dari Supabase
 */
function doPost(e) {
  try {
    // 1. Verifikasi secret token
    var secret = (e && e.parameter && e.parameter.secret) ? e.parameter.secret : '';
    if (secret !== WEBHOOK_SECRET) {
      Logger.log('Unauthorized webhook attempt. Secret mismatch.');
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    // 2. Parse payload
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'No payload received' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Invalid JSON: ' + parseErr.toString() });
    }

    var type       = String(payload.type || '').toUpperCase();      // INSERT | UPDATE | DELETE
    var table      = String(payload.table || '');                    // nama tabel Supabase
    var record     = payload.record     || {};                       // data baru
    var old_record = payload.old_record || {};                       // data lama (untuk DELETE)

    Logger.log('Webhook: type=' + type + ' table=' + table);

    // 3. Cari sheet yang sesuai berdasarkan nama tabel Supabase
    var sheetName = getSheetNameByTable(table);
    if (!sheetName) {
      Logger.log('Table not configured for sync: ' + table);
      return jsonResponse({ success: true, message: 'Table not in sync list, skipped: ' + table });
    }

    // 4. Buka spreadsheet dan sheet
    var ss    = getSpreadsheet();
    var sheet = getOrCreateSheet(ss, sheetName);

    // 5. Route ke handler sesuai type
    var result;
    if (type === 'INSERT') {
      result = handleWebhookInsert(sheet, sheetName, record);
    } else if (type === 'UPDATE') {
      result = handleWebhookUpdate(sheet, sheetName, record);
    } else if (type === 'DELETE') {
      var deleteId = (old_record && old_record.id) ? old_record.id : record.id;
      result = handleWebhookDelete(sheet, deleteId);
    } else {
      return jsonResponse({ success: false, error: 'Unknown type: ' + type });
    }

    return jsonResponse({
      success: true,
      action: type,
      table: table,
      sheet: sheetName,
      result: result
    });

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * INSERT: Tambah baris baru.
 * Cek dulu apakah UUID sudah ada (untuk menghindari duplikat jika webhook dikirim ulang).
 */
function handleWebhookInsert(sheet, sheetName, record) {
  if (!record || !record.id) {
    return { inserted: false, reason: 'No ID in record' };
  }

  // Cek apakah sudah ada (idempotent)
  var existingRow = findRowByUUID(sheet, record.id);
  if (existingRow) {
    // Sudah ada → update saja
    Logger.log('INSERT: UUID already exists at row ' + existingRow + ', doing UPDATE instead');
    return handleWebhookUpdate(sheet, sheetName, record);
  }

  insertRow(sheet, sheetName, record);
  Logger.log('INSERT: Added row for id=' + record.id);
  return { inserted: true, id: record.id };
}

/**
 * UPDATE: Cari baris berdasarkan UUID, update semua field.
 * Jika tidak ditemukan, insert sebagai baru (upsert behavior).
 */
function handleWebhookUpdate(sheet, sheetName, record) {
  if (!record || !record.id) {
    return { updated: false, reason: 'No ID in record' };
  }

  var rowNum = findRowByUUID(sheet, record.id);
  if (!rowNum) {
    Logger.log('UPDATE: UUID not found, inserting as new: ' + record.id);
    insertRow(sheet, sheetName, record);
    return { updated: false, inserted: true, id: record.id };
  }

  updateRow(sheet, sheetName, record);
  Logger.log('UPDATE: Updated row ' + rowNum + ' for id=' + record.id);
  return { updated: true, row: rowNum, id: record.id };
}

/**
 * SOFT DELETE: Tandai baris dengan status='DELETED'.
 * Tidak menghapus fisik untuk keamanan data audit trail.
 */
function handleWebhookDelete(sheet, uuid) {
  if (!uuid) {
    return { deleted: false, reason: 'No UUID provided' };
  }

  var deleted = softDeleteRow(sheet, uuid);
  Logger.log('DELETE: ' + (deleted ? 'Soft-deleted' : 'Not found') + ' id=' + uuid);
  return { deleted: deleted, id: uuid };
}

/**
 * OPTIONS handler — untuk preflight CORS (jika diperlukan)
 */
function doOptions(e) {
  return jsonResponse({ status: 'ok', message: 'WMS GAS Webhook Active' });
}
