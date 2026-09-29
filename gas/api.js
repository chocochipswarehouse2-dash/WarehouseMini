/**
 * WMS GAS BACKEND — api.gs
 * =========================
 * Handler doGet: menyajikan data dari Google Sheets ke Frontend.
 *
 * Frontend membaca data DARI SINI (bukan dari Supabase langsung)
 * sehingga egress Supabase hanya terjadi 1x saat sync ke GAS,
 * bukan per-user per-refresh.
 *
 * Endpoint URL format:
 *   GET {GAS_WEB_APP_URL}?action=getOrders
 *   GET {GAS_WEB_APP_URL}?table=Manual+Shipment
 *   GET {GAS_WEB_APP_URL}?action=getPengecekanSJ
 *
 * CATATAN: doGet sudah berjalan di context yang sama dengan webhook.gs (doPost).
 * Hanya ada 1 Web App deployment yang menangani keduanya.
 */

/**
 * Handler GET — melayani request baca dari Frontend
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
    var table  = (e && e.parameter && e.parameter.table)  ? e.parameter.table  : '';

    // ── MANUAL SHIPMENT ─────────────────────────────────────────────────
    if (action === 'getOrders' || action === 'getManualShipment' || action === 'getShipments') {
      return handleGetSheet('manual_shipment');
    }

    // ── PENGECEKAN SURAT JALAN (Tarikan MD) ──────────────────────────────
    if (action === 'getPengecekanSJ' || action === 'getTarikanMD') {
      return handleGetSheet('pengecekan_sj');
    }

    // ── DATA ALAMAT (Address Book) ────────────────────────────────────────
    if (action === 'getDataAlamat') {
      return handleGetDataAlamat();
    }

    // ── OUTLETS & JASA KIRIM ─────────────────────────────────────────────
    if (action === 'getOutlets') {
      return handleGetOutlets();
    }
    if (action === 'getJasaKirim') {
      return handleGetJasaKirim();
    }

    // ── GENERIC TABLE ENDPOINT ───────────────────────────────────────────
    // ?table=Manual+Shipment&limit=100&offset=0
    if (table) {
      return handleGetSheet(table, e.parameter);
    }

    // ── STATUS CHECK ─────────────────────────────────────────────────────
    return jsonResponse({
      success: true,
      message: 'WMS GAS API Active',
      version: '2.0.0',
      supportedActions: [
        'getOrders', 'getManualShipment',
        'getPengecekanSJ', 'getTarikanMD',
        'getDataAlamat',
        'getOutlets', 'getJasaKirim'
      ],
      genericEndpoint: '?table={sheetName}'
    });

  } catch (err) {
    Logger.log('doGet error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Baca semua baris dari sheet tertentu.
 * Baris dengan status='DELETED' dikecualikan.
 * Return format: { success: true, data: [...], count: N }
 */
function handleGetSheet(sheetName, params) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ success: true, data: [], count: 0, sheet: sheetName });
  }

  var data = readAllRows(sheet);

  // Optional: filter by status (e.g., ?status=diterima)
  if (params && params.status) {
    var filterStatus = String(params.status).toLowerCase();
    data = data.filter(function(row) {
      return String(row.status || '').toLowerCase() === filterStatus;
    });
  }

  // Delta Sync & Delete Sync
  var activeIds = null;
  if (params && params.since) {
    // 1. Collect all active IDs to tell the client what currently exists
    activeIds = data.map(function(r) { return r.id || r.sku || r.no_pesanan || r.no_sj; }).filter(Boolean);

    // 2. Filter data for rows that changed since the timestamp
    var sinceDate = Number(params.since);
    if (isNaN(sinceDate)) {
      sinceDate = new Date(params.since).getTime();
    }
    if (!isNaN(sinceDate)) {
      data = data.filter(function(row) {
        var rowDateStr = row.updated_at || row.created_at || row.tanggal;
        if (!rowDateStr) return true; // If no date column, send it to be safe
        var rowDate = new Date(rowDateStr).getTime();
        if (isNaN(rowDate)) return true;
        // Keep if it was updated at or AFTER the since timestamp
        return rowDate >= sinceDate;
      });
    }
  }

  var responsePayload = {
    success: true,
    status: 'success',
    data: data,
    count: data.length,
    sheet: sheetName,
    timestamp: new Date().getTime()
  };

  if (activeIds !== null) {
    responsePayload.active_ids = activeIds;
  }

  return jsonResponse(responsePayload);
}

/**
 * Baca daftar outlet dari sheet 'outlet' (kolom tipe='outlet')
 * Backward compatible dengan format lama GAS.
 */
function handleGetOutlets() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('outlet');

  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ success: true, data: getDefaultOutlets() });
  }

  var rows  = readAllRows(sheet);
  var outlets = rows
    .filter(function(r) { return String(r.tipe || r.type || '').toLowerCase() !== 'jasa_kirim'; })
    .map(function(r) {
      return {
        nama:        String(r.nama || r.name || '').trim(),
        fulfillment: String(r.fulfillment || r.nama || '').trim()
      };
    })
    .filter(function(o) { return o.nama !== ''; });

  var jasaKirim = rows
    .filter(function(r) { return String(r.tipe || r.type || '').toLowerCase() === 'jasa_kirim'; })
    .map(function(r) { return String(r.nama || r.name || '').trim(); })
    .filter(Boolean);

  if (outlets.length === 0) outlets = getDefaultOutlets();
  if (jasaKirim.length === 0) jasaKirim = getDefaultJasaKirim();

  return jsonResponse({
    success: true,
    data: outlets,
    jasa_kirim: jasaKirim
  });
}

/**
 * Baca daftar jasa kirim dari sheet 'outlet' (kolom tipe='jasa_kirim')
 */
function handleGetJasaKirim() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('outlet');

  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse({ success: true, data: getDefaultJasaKirim() });
  }

  var rows = readAllRows(sheet);
  var jasaKirim = rows
    .filter(function(r) { return String(r.tipe || r.type || '').toLowerCase() === 'jasa_kirim'; })
    .map(function(r) { return String(r.nama || r.name || '').trim(); })
    .filter(Boolean);

  if (jasaKirim.length === 0) jasaKirim = getDefaultJasaKirim();

  return jsonResponse({ success: true, data: jasaKirim });
}

/**
 * Default outlets jika sheet belum dikonfigurasi
 */
function getDefaultOutlets() {
  return [
    { nama: 'Mall Kelapa Gading',          fulfillment: 'Mall Kelapa Gading' },
    { nama: 'La Vela Tangerang',           fulfillment: 'La Vela Tangerang' },
    { nama: 'Paskal Hyper Square Bandung', fulfillment: 'Paskal Hyper Square Bandung' },
    { nama: 'Gading Serpong Tangerang',    fulfillment: 'Gading Serpong Tangerang' },
    { nama: 'Ciputra World Surabaya',      fulfillment: 'Ciputra World Surabaya' },
    { nama: 'Puri Indah Mall',             fulfillment: 'Puri Indah Mall' },
    { nama: 'By The Sea PIK',              fulfillment: 'By The Sea PIK' },
    { nama: 'Pakuwon Mall Surabaya',       fulfillment: 'Pakuwon Mall Surabaya' },
    { nama: 'Living World Tangerang',      fulfillment: 'Living World Tangerang' },
    { nama: 'Lippo Mall Puri',             fulfillment: 'Lippo Mall Puri' },
    { nama: 'Sun Plaza Medan',             fulfillment: 'Sun Plaza Medan' },
    { nama: 'Deli Park Medan',             fulfillment: 'Deli Park Medan' },
    { nama: 'Central Park Jakarta',        fulfillment: 'Central Park Jakarta' }
  ];
}

/**
 * Default jasa kirim jika sheet belum dikonfigurasi
 */
function getDefaultJasaKirim() {
  return [
    'JNE Regular', 'JNE YES', 'J&T Express',
    'SiCepat REG', 'SiCepat BEST',
    'Anteraja Regular', 'Anteraja Same Day',
    'GoSend Instant', 'GoSend Same Day',
    'GrabExpress Instant', 'GrabExpress Same Day',
    'Paxel', 'SPX Standard', 'SPX Instant',
    'Lion Parcel', 'Wahana', 'Kurir Toko / Internal'
  ];
}

/**
 * Baca sheet Data Alamat, mengabaikan baris header dan baris kosong
 */
function handleGetDataAlamat() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Data Alamat');
  if (!sheet) return jsonResponse({ success: true, data: [] });

  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return jsonResponse({ success: true, data: [] });

  var data = [];
  var row1str = values[0].join(' ').toLowerCase();
  var hasHeaders = (row1str.indexOf('nama') !== -1 || row1str.indexOf('alamat') !== -1);
  var startIndex = hasHeaders ? 1 : 0;

  for (var i = startIndex; i < values.length; i++) {
    var row = values[i];
    if (row.join('').trim() === '') continue;
    data.push({
      id:            String(row[0] || ''),
      nama_penerima: String(row[1] || ''),
      no_telp:       String(row[2] || ''),
      alamat:        String(row[3] || ''),
      keterangan:    String(row[4] || ''),
      jasa_kirim:    String(row[5] || ''),
      created_at:    String(row[6] || '')
    });
  }

  return jsonResponse({ success: true, data: data });
}
