/**
 * WMS GAS BACKEND — Code.gs
 * ==========================
 * Entry point utama. File ini hanya berisi routing minimal.
 * Logic detail ada di: webhook.gs (doPost) dan api.gs (doGet).
 * 
 * Catatan: doGet dan doPost sudah didefinisikan di api.gs dan webhook.gs.
 * GAS akan menggabungkan semua .gs file secara otomatis dalam satu project.
 * 
 * File ini hanya berisi fungsi utilitas dan inisialisasi project.
 */

/**
 * Fungsi test untuk memverifikasi script berjalan normal.
 * Bisa dijalankan manual dari GAS Editor untuk debugging.
 */
function testConnection() {
  try {
    var ss = getSpreadsheet();
    var sheetCount = ss.getSheets().length;
    Logger.log('✅ Spreadsheet terhubung. Jumlah sheet: ' + sheetCount);
    Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
    Logger.log('Webhook Secret: ' + (WEBHOOK_SECRET ? 'Configured ✅' : 'NOT SET ❌'));

    var syncedSheets = getAllSyncedSheets();
    Logger.log('Sheet yang di-sync: ' + syncedSheets.join(', '));

    return 'OK: ' + sheetCount + ' sheets found';
  } catch (err) {
    Logger.log('❌ Error: ' + err.toString());
    return 'ERROR: ' + err.toString();
  }
}

/**
 * Inisialisasi semua sheet yang terdaftar di SCHEMA.
 * Jalankan sekali dari GAS Editor saat setup pertama kali.
 */
function initializeAllSheets() {
  var ss = getSpreadsheet();
  var syncedSheets = getAllSyncedSheets();

  Logger.log('Menginisialisasi ' + syncedSheets.length + ' sheet...');

  for (var i = 0; i < syncedSheets.length; i++) {
    var sheetName = syncedSheets[i];
    var sheet = getOrCreateSheet(ss, sheetName);
    ensureSheetHeader(sheet, sheetName);
    Logger.log('✅ Sheet siap: ' + sheetName);
  }

  Logger.log('Semua sheet berhasil diinisialisasi!');
}

/**
 * Test webhook handler secara manual dari GAS Editor.
 * Berguna untuk debugging tanpa perlu trigger dari Supabase.
 */
function testWebhookInsert() {
  var mockRecord = {
    id: 'test-uuid-' + new Date().getTime(),
    no_pesanan: 'TEST-' + new Date().getTime(),
    tanggal: new Date().toISOString(),
    nama_pengirim: 'CHOCOCHIPS TEST',
    no_telp_store: '08123456789',
    no_transaksi_pengirim: '[]',
    nama_tujuan: 'Test Customer',
    no_telp_tujuan: '08987654321',
    alamat_tujuan: 'Jl. Test No. 1, Jakarta',
    jasa_kirim: 'JNE Regular',
    no_resi: '',
    status: 'diterima',
    notes_paket: 'Test notes',
    no_transaksi_customer: 'ORD-TEST-001',
    submitted_by: 'test_agent',
    items_json: JSON.stringify([{ sku: 'SKU001', nama_produk: 'Test Produk', qty: 1, size: 'M' }]),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  var ss    = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, 'Manual Shipment');
  var result = handleWebhookInsert(sheet, 'Manual Shipment', mockRecord);
  Logger.log('Test INSERT result: ' + JSON.stringify(result));
}

/**
 * Cleanup: hapus baris test dari semua sheet
 */
function cleanupTestRows() {
  var ss = getSpreadsheet();
  var sheets = getAllSyncedSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sheet = ss.getSheetByName(sheets[i]);
    if (!sheet || sheet.getLastRow() <= 1) continue;

    var idValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var j = idValues.length - 1; j >= 0; j--) {
      if (String(idValues[j][0]).startsWith('test-uuid-')) {
        sheet.deleteRow(j + 2);
        Logger.log('Removed test row from ' + sheets[i] + ' at index ' + (j + 2));
      }
    }
  }
  Logger.log('Cleanup selesai!');
}
