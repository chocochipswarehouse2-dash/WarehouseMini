/**
 * WMS BACKEND - GOOGLE APPS SCRIPT (ALL-IN-ONE) - FULL SUITE
 * =========================================================
 * Modul Lengkap:
 * 1. Manual Shipment (Format Database: SKU | Nama Produk | Size | Qty per Baris)
 * 2. Data Alamat (Auto-Fill & Cetak Label A6)
 * 3. Pengecekan Surat Jalan / Tarikan MD (Format Database Multi-Baris: No SJ | Asal | Tujuan | SKU | Qty SJ | Qty Scan | Selisih | Status Item | Status SJ Pending)
 * 4. Upload Foto Reject QC ke Google Drive
 * 5. Outlet & Jasa Kirim (Sheet 'outlet')
 *
 * CARA UPDATE DI GOOGLE APPS SCRIPT:
 * 1. Buka Google Sheets Anda -> Klik menu 'Ekstensi' -> 'Apps Script'.
 * 2. Ganti SELURUH kode lama dengan kode ini (Ctrl+A lalu Paste).
 * 3. Simpan (Ctrl+S / Save).
 * 4. Klik tombol biru 'Deploy' (Terapkan) -> 'Manage Deployments' (Kelola Penerapan).
 * 5. Klik ikon PENSIL (Edit) pada baris deployment aktif.
 * 6. Ubah dropdown Version menjadi 'New version' (Versi Baru), lalu klik 'Deploy'.
 */

const SPREADSHEET_ID = '1ONrl13YPQfbgnXLXwaqBN0nWpYQlVm28HMKi7kVTPg0';

const MANUAL_SHIPMENT_HEADERS = [
  'No Pesanan', 'Tanggal', 'Pengirim', 'No Telp Pengirim', 'No Transaksi DealPOS',
  'Penerima', 'No Telp Penerima', 'Alamat Tujuan', 'Jasa Kirim', 'No Resi',
  'Status', 'SKU', 'Nama Produk', 'Size', 'Qty', 'Catatan Paket', 'Order ID', 'Petugas'
];

const PENGECEKAN_SJ_HEADERS = [
  'No SJ', 'Tanggal SJ', 'Source', 'Destination', 'SKU', 'Nama Produk',
  'Category', 'Qty SJ', 'Qty Scan', 'Selisih', 'Status Item', 'Status SJ',
  'Lebih Di Luar SJ', 'Petugas', 'Waktu Submit', 'Catatan', 'Record ID'
];

function getSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// =========================================================
// HELPER: MENGAMBIL SHEET 'Manual Shipment'
// =========================================================
function getManualShipmentSheet(ss) {
  var sheet = ss.getSheetByName('Manual Shipment');
  if (sheet) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(MANUAL_SHIPMENT_HEADERS);
    }
    return sheet;
  }

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var rawName = sheets[i].getName().trim().toLowerCase().replace(/[\s_]+/g, '');
    if (rawName === 'manualshipment') {
      return sheets[i];
    }
  }

  sheet = ss.insertSheet('Manual Shipment');
  sheet.appendRow(MANUAL_SHIPMENT_HEADERS);
  return sheet;
}

// =========================================================
// ROUTER UTAMA: doGet (READ DATA)
// =========================================================
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';

    if (action === 'getOrders' || action === 'getManualShipment' || action === 'getShipments') {
      return handleGetManualShipments();
    }
    if (action === 'getOutlets') {
      return handleGetOutlets();
    }
    if (action === 'getJasaKirim') {
      return handleGetJasaKirim();
    }
    if (action === 'getDataAlamat') {
      return handleGetDataAlamat();
    }
    if (action === 'getPengecekanSJ' || action === 'getTarikanMD') {
      return handleGetPengecekanSJ();
    }

    return jsonResponse({
      success: true,
      message: 'WMS Apps Script Service is Active',
      supportedActions: ['getOrders', 'getOutlets', 'getJasaKirim', 'getDataAlamat', 'getPengecekanSJ', 'getTarikanMD']
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// =========================================================
// ROUTER UTAMA: doPost (WRITE / UPDATE DATA)
// =========================================================
function doPost(e) {
  try {
    var postData = {};
    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        postData = e.parameter || {};
      }
    } else if (e && e.parameter) {
      postData = e.parameter;
    }

    var action = postData.action || (e && e.parameter ? e.parameter.action : '');
    var data = postData.data || postData;

    // 1. Upload QC GDrive
    if (postData.base64 || action === 'uploadQC' || action === 'uploadImage') {
      return handleUploadGDrive(postData);
    }

    // 2. Manual Shipment
    if (action === 'submitShipment' || action === 'addShipment' || action === 'createShipment' || action === 'editShipment') {
      return handleSubmitShipment(data);
    }
    if (action === 'updateResi') {
      return handleUpdateResi(data);
    }
    if (action === 'updateStatus') {
      return handleUpdateStatus(data);
    }
    if (action === 'deleteShipment') {
      return handleDeleteShipment(data);
    }

    // 3. Data Alamat
    if (action === 'saveDataAlamat') {
      return handleSaveDataAlamat(data);
    }
    if (action === 'deleteDataAlamat') {
      return handleDeleteDataAlamat(data);
    }

    // 4. Pengecekan Surat Jalan (Tarikan MD)
    if (action === 'submitPengecekanSJ' || action === 'submitTarikanMD' || action === 'editPengecekanSJ') {
      return handleSubmitPengecekanSJ(data);
    }
    if (action === 'deletePengecekanSJ' || action === 'deleteTarikanMD') {
      return handleDeletePengecekanSJ(data);
    }

    return jsonResponse({ success: false, error: 'Aksi tidak dikenali: ' + action });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function doOptions(e) {
  return jsonResponse({ status: 'ok' });
}

// =========================================================
// 1. MODUL MANUAL SHIPMENT
// =========================================================
function handleGetManualShipments() {
  const ss = getSpreadsheet();
  const sheet = getManualShipmentSheet(ss);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    return jsonResponse({ success: true, data: [] });
  }

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];

  const colMap = {};
  for (var c = 0; c < headers.length; c++) {
    var clean = String(headers[c] || '').toLowerCase().trim().replace(/[\s_.]+/g, '');
    colMap[clean] = c;
  }

  function getVal(row, keys, fallbackIdx) {
    for (var k = 0; k < keys.length; k++) {
      if (colMap[keys[k]] !== undefined) {
        var val = row[colMap[keys[k]]];
        if (val !== undefined && val !== null) return String(val).trim();
      }
    }
    if (fallbackIdx !== undefined && fallbackIdx < row.length) {
      var fb = row[fallbackIdx];
      if (fb !== undefined && fb !== null) return String(fb).trim();
    }
    return '';
  }

  const ordersMap = {};
  const ordersList = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var noPesanan = getVal(row, ['nopesanan', 'kodepesanan', 'nomorpesanan'], 0);
    var namaTujuan = getVal(row, ['penerima', 'namapenerima', 'namatujuan', 'tujuan', 'customer'], 5);
    var alamatTujuan = getVal(row, ['alamattujuan', 'alamatpenerima', 'alamat'], 7);

    if (!noPesanan && !namaTujuan && !alamatTujuan) continue;
    if (!noPesanan) noPesanan = 'MS-' + (i + 1);

    if (!ordersMap[noPesanan]) {
      var rawDate = row[colMap['tanggal'] !== undefined ? colMap['tanggal'] : 1];
      var createdAt = rawDate ? (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)) : new Date().toISOString();
      var rawDealPos = getVal(row, ['notransaksidealpos', 'dealpos', 'transaksipengirim', 'notransaksi'], 4);
      var dealPosArr = rawDealPos ? rawDealPos.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];

      var orderIdVal = getVal(row, ['orderid', 'idpaket', 'notransaksicustomer'], 16);
      if (orderIdVal && (orderIdVal.indexOf('[') === 0 || orderIdVal.indexOf('{') === 0)) {
        orderIdVal = noPesanan;
      }

      var newOrder = {
        id: noPesanan,
        no_pesanan: noPesanan,
        created_at: createdAt,
        nama_pengirim: getVal(row, ['pengirim', 'namapengirim', 'store', 'toko'], 2) || 'CHOCOCHIPS',
        no_telp_store: getVal(row, ['notelppengirim', 'telppengirim', 'teleponpengirim'], 3),
        no_transaksi_pengirim: dealPosArr,
        nama_tujuan: namaTujuan,
        no_telp_tujuan: getVal(row, ['notelppenerima', 'telppenerima', 'nohppenerima', 'notelptujuan'], 6),
        alamat_tujuan: alamatTujuan,
        jasa_kirim: getVal(row, ['jasakirim', 'ekspedisi', 'kurir'], 8),
        no_resi: getVal(row, ['noresi', 'resi', 'nomorresi'], 9),
        status: getVal(row, ['status', 'statuspesanan'], 10).toLowerCase() || 'diterima',
        notes_paket: getVal(row, ['catatanpaket', 'catatan', 'notes', 'keterangan'], 15),
        no_transaksi_customer: orderIdVal || noPesanan,
        submitted_by: getVal(row, ['petugas', 'admin', 'user', 'submittedby'], 17) || 'Admin',
        items: []
      };

      ordersMap[noPesanan] = newOrder;
      ordersList.push(newOrder);
    }

    var itemSku = getVal(row, ['sku', 'kodesku'], 11);
    var itemNama = getVal(row, ['namaproduk', 'produk', 'item', 'isipaket'], 12);
    var itemSize = getVal(row, ['size', 'ukuran'], 13);
    var itemQty = parseInt(getVal(row, ['qty', 'jumlah', 'kuantiti'], 14), 10) || 1;

    if (itemSku || itemNama) {
      if (!itemSize && itemNama) {
        var matchSize = itemNama.match(/\s*-\s*([A-Za-z0-9]+)$/);
        if (matchSize) itemSize = matchSize[1];
      }

      ordersMap[noPesanan].items.push({
        id: 'it-' + i,
        sku: itemSku || '',
        nama_produk: itemNama || itemSku,
        size: itemSize || '',
        qty: itemQty,
        fulfillment: ''
      });
    }
  }

  return jsonResponse({ success: true, data: ordersList });
}

function handleSubmitShipment(orderData) {
  if (!orderData || !orderData.no_pesanan) {
    return jsonResponse({ success: false, error: 'Data pesanan tidak lengkap' });
  }

  const ss = getSpreadsheet();
  const sheet = getManualShipmentSheet(ss);
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = ids.length - 1; r >= 0; r--) {
      if (String(ids[r][0]).trim().toUpperCase() === String(orderData.no_pesanan).trim().toUpperCase()) {
        sheet.deleteRow(r + 2);
      }
    }
  }

  var items = Array.isArray(orderData.items) && orderData.items.length > 0
    ? orderData.items
    : [{ sku: '', nama_produk: orderData.notes_paket || 'Item', size: '', qty: 1 }];

  var dealPosStr = Array.isArray(orderData.no_transaksi_pengirim)
    ? orderData.no_transaksi_pengirim.join(', ')
    : (orderData.no_transaksi_pengirim || '');

  var rowsToAppend = [];
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    var namaProd = it.nama_produk || '';
    var sizeProd = it.size || '';

    if (!sizeProd && namaProd) {
      var sm = namaProd.match(/\s*-\s*([A-Za-z0-9]+)$/);
      if (sm) sizeProd = sm[1];
    }

    rowsToAppend.push([
      orderData.no_pesanan,
      orderData.created_at || new Date().toISOString(),
      orderData.nama_pengirim || 'CHOCOCHIPS',
      orderData.no_telp_store || '',
      dealPosStr,
      orderData.nama_tujuan || '',
      orderData.no_telp_tujuan || '',
      orderData.alamat_tujuan || '',
      orderData.jasa_kirim || '',
      orderData.no_resi || '',
      orderData.status || 'diterima',
      it.sku || '',
      namaProd,
      sizeProd,
      it.qty || 1,
      orderData.notes_paket || '',
      orderData.no_transaksi_customer || orderData.no_pesanan,
      orderData.submitted_by || 'Admin'
    ]);
  }

  if (rowsToAppend.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAppend.length, MANUAL_SHIPMENT_HEADERS.length).setValues(rowsToAppend);
  }

  return jsonResponse({
    success: true,
    message: 'Pesanan ' + orderData.no_pesanan + ' berhasil disimpan (' + rowsToAppend.length + ' baris item)'
  });
}

function handleUpdateResi(data) {
  if (!data || !data.no_pesanan) return jsonResponse({ success: false, error: 'no_pesanan required' });
  const ss = getSpreadsheet();
  const sheet = getManualShipmentSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Data kosong' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var updatedCount = 0;

  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]).trim().toUpperCase() === String(data.no_pesanan).trim().toUpperCase()) {
      sheet.getRange(r + 2, 10).setValue(data.no_resi || '');
      sheet.getRange(r + 2, 11).setValue('dikirim');
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    return jsonResponse({ success: true, message: 'Resi diupdate pada ' + updatedCount + ' baris' });
  }
  return jsonResponse({ success: false, error: 'Nomor pesanan tidak ditemukan' });
}

function handleUpdateStatus(data) {
  if (!data || !data.no_pesanan) return jsonResponse({ success: false, error: 'no_pesanan required' });
  const ss = getSpreadsheet();
  const sheet = getManualShipmentSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Data kosong' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var updatedCount = 0;

  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]).trim().toUpperCase() === String(data.no_pesanan).trim().toUpperCase()) {
      sheet.getRange(r + 2, 11).setValue(data.status || 'diproses');
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    return jsonResponse({ success: true, message: 'Status diupdate pada ' + updatedCount + ' baris' });
  }
  return jsonResponse({ success: false, error: 'Nomor pesanan tidak ditemukan' });
}

function handleDeleteShipment(data) {
  if (!data || !data.no_pesanan) return jsonResponse({ success: false, error: 'no_pesanan required' });
  const ss = getSpreadsheet();
  const sheet = getManualShipmentSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Data kosong' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deletedCount = 0;

  for (var r = ids.length - 1; r >= 0; r--) {
    if (String(ids[r][0]).trim().toUpperCase() === String(data.no_pesanan).trim().toUpperCase()) {
      sheet.deleteRow(r + 2);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    return jsonResponse({ success: true, message: deletedCount + ' baris pesanan dihapus' });
  }
  return jsonResponse({ success: false, error: 'Pesanan tidak ditemukan' });
}

// =========================================================
// 2. MODUL OUTLET & JASA KIRIM (SHEET 'outlet')
// =========================================================
function handleGetOutlets() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('outlet') || ss.getSheetByName('Outlet');
  if (!sheet) return jsonResponse({ success: true, data: [], jasa_kirim: [] });

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: true, data: [], jasa_kirim: [] });

  const values = sheet.getRange(2, 1, lastRow - 1, Math.min(sheet.getLastColumn(), 5)).getValues();
  const outlets = [];
  const jasaKirimSet = {};

  for (var i = 0; i < values.length; i++) {
    var namaOutlet = String(values[i][0] || '').trim();
    if (namaOutlet) {
      outlets.push({ nama: namaOutlet, fulfillment: namaOutlet });
    }
    if (values[i].length >= 3) {
      var jk = String(values[i][2] || '').trim();
      if (jk) jasaKirimSet[jk] = true;
    }
  }

  return jsonResponse({
    success: true,
    data: outlets,
    jasa_kirim: Object.keys(jasaKirimSet)
  });
}

function handleGetJasaKirim() {
  const res = handleGetOutlets();
  try {
    const parsed = JSON.parse(res.getContent());
    return jsonResponse({ success: true, data: parsed.jasa_kirim || [] });
  } catch (e) {
    return jsonResponse({ success: true, data: [] });
  }
}

// =========================================================
// 3. MODUL DATA ALAMAT (TAB 'Data Alamat')
// =========================================================
function getDataAlamatSheet(ss) {
  var sheet = ss.getSheetByName('Data Alamat') || ss.getSheetByName('data_alamat');
  if (!sheet) {
    sheet = ss.insertSheet('Data Alamat');
    sheet.appendRow(['ID', 'Nama Penerima', 'No Telepon', 'Alamat', 'Keterangan', 'Jasa Kirim', 'Tanggal']);
  }
  return sheet;
}

function handleGetDataAlamat() {
  const ss = getSpreadsheet();
  const sheet = getDataAlamatSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: true, data: [] });

  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const list = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var nama = String(r[1] || '').trim();
    var alamat = String(r[3] || '').trim();
    if (!nama && !alamat) continue;

    list.push({
      id: String(r[0] || 'addr_' + (i + 1)),
      nama_penerima: nama,
      no_telp: String(r[2] || '').trim(),
      alamat: alamat,
      keterangan: String(r[4] || '').trim(),
      jasa_kirim: String(r[5] || '').trim(),
      created_at: String(r[6] || '')
    });
  }
  return jsonResponse({ success: true, data: list });
}

function handleSaveDataAlamat(items) {
  if (!items) return jsonResponse({ success: false, error: 'Data kosong' });
  const arr = Array.isArray(items) ? items : [items];
  if (arr.length === 0) return jsonResponse({ success: true });

  const ss = getSpreadsheet();
  const sheet = getDataAlamatSheet(ss);

  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    sheet.appendRow([
      it.id || ('addr_' + Date.now() + '_' + i),
      it.nama_penerima || '',
      it.no_telp || '',
      it.alamat || '',
      it.keterangan || '',
      it.jasa_kirim || '',
      it.created_at || new Date().toISOString()
    ]);
  }
  return jsonResponse({ success: true, message: 'Berhasil menyimpan alamat' });
}

function handleDeleteDataAlamat(data) {
  if (!data || !data.id) return jsonResponse({ success: false, error: 'ID required' });
  const ss = getSpreadsheet();
  const sheet = getDataAlamatSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: true });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]).trim() === String(data.id).trim()) {
      sheet.deleteRow(r + 2);
      return jsonResponse({ success: true, message: 'Alamat berhasil dihapus' });
    }
  }
  return jsonResponse({ success: false, error: 'Alamat tidak ditemukan' });
}

// =========================================================
// 4. MODUL PENGECEKAN SURAT JALAN (FORMAT DATABASE MULTI-BARIS)
// =========================================================
function getPengecekanSJSheet(ss) {
  var sheet = ss.getSheetByName('PengecekanSJ') || ss.getSheetByName('TarikanMD') || ss.getSheetByName('tarikan_md');
  if (!sheet) {
    sheet = ss.insertSheet('PengecekanSJ');
    sheet.appendRow(PENGECEKAN_SJ_HEADERS);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PENGECEKAN_SJ_HEADERS);
  }
  return sheet;
}

/**
 * Membaca riwayat Pengecekan Surat Jalan
 * Mengelompokkan seluruh baris item menjadi 1 Record per Surat Jalan (No SJ + Source + Destination).
 * Mendukung format database baris per SKU maupun format sheet dengan header legacy.
 */
function handleGetPengecekanSJ() {
  const ss = getSpreadsheet();
  const sheet = getPengecekanSJSheet(ss);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    return jsonResponse({ success: true, data: [] });
  }

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];

  const colMap = {};
  for (var c = 0; c < headers.length; c++) {
    var clean = String(headers[c] || '').toLowerCase().trim().replace(/[\s_.]+/g, '');
    colMap[clean] = c;
  }

  function getVal(row, keys, fallbackIdx) {
    for (var k = 0; k < keys.length; k++) {
      if (colMap[keys[k]] !== undefined) {
        var val = row[colMap[keys[k]]];
        if (val !== undefined && val !== null) return String(val).trim();
      }
    }
    if (fallbackIdx !== undefined && fallbackIdx < row.length) {
      var fb = row[fallbackIdx];
      if (fb !== undefined && fb !== null) return String(fb).trim();
    }
    return '';
  }

  // Cek apakah sheet adalah format lama dengan kolom JSON utuh per baris
  var isPureLegacyJson = colMap['itemsjson'] !== undefined && colMap['sku'] === undefined;

  if (isPureLegacyJson) {
    const legacyRecords = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (!r[0] && !r[3]) continue;
      var rawItems = String(r[colMap['itemsjson']] || '[]');
      var parsedItems = [];
      try { parsedItems = JSON.parse(rawItems); } catch (e) {}

      legacyRecords.push({
        id: String(r[0] || ('SJ-' + i)),
        no_sj: String(r[colMap['sjnumber'] !== undefined ? colMap['sjnumber'] : 3] || r[0] || ''),
        tanggal_sj: String(r[colMap['tanggal'] !== undefined ? colMap['tanggal'] : 1] || ''),
        source: String(r[colMap['source'] !== undefined ? colMap['source'] : 2] || ''),
        destination: String(r[colMap['destination'] !== undefined ? colMap['destination'] : 3] || ''),
        status: 'pending',
        status_komparasi: String(r[colMap['status'] !== undefined ? colMap['status'] : 7] || 'COCOK'),
        total_qty_sj: Number(r[colMap['totalqtysj'] !== undefined ? colMap['totalqtysj'] : 5]) || 0,
        total_qty_terima: Number(r[colMap['totalqtyaktual'] !== undefined ? colMap['totalqtyaktual'] : 6]) || 0,
        total_sku: Number(r[colMap['totalsku'] !== undefined ? colMap['totalsku'] : 4]) || parsedItems.length,
        submitted_by: String(r[colMap['user'] !== undefined ? colMap['user'] : 2] || 'Petugas'),
        created_at: String(r[colMap['tanggal'] !== undefined ? colMap['tanggal'] : 1] || new Date().toISOString()),
        catatan: String(r[colMap['catatan'] !== undefined ? colMap['catatan'] : 8] || ''),
        items: parsedItems
      });
    }
    return jsonResponse({ success: true, data: legacyRecords });
  }

  // Format Database Baris per Item SKU (Dikelompokkan menjadi 1 Surat Jalan)
  const sjMap = {};
  const sjList = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row || row.every(function(cell) { return String(cell || '').trim() === ''; })) {
      continue;
    }

    var noSj = getVal(row, ['nosj', 'nomorsj', 'suratjalan', 'sjnumber', 'numberdelivery'], 0);
    var source = getVal(row, ['source', 'asal', 'sourceasal', 'dari', 'outletasal'], 2);
    var destination = getVal(row, ['destination', 'tujuan', 'destinationtujuan', 'ke', 'outlettujuan'], 3);
    var submittedBy = getVal(row, ['petugas', 'operator', 'admin', 'user', 'submittedby'], 13);

    // Normalisasi cerdas jika posisi kolom terisi nama gudang / outlet
    if (!source && noSj && (noSj.toLowerCase().includes('warehouse') || noSj.toLowerCase().includes('gudang'))) {
      source = noSj;
    }
    if (!destination && submittedBy && submittedBy !== 'Unknown' && !submittedBy.includes('@')) {
      destination = submittedBy;
    }
    if (!noSj) {
      noSj = (source && destination) ? ('SJ-' + source.slice(0, 3).toUpperCase() + '-' + destination.slice(0, 3).toUpperCase()) : 'SJ-PENGECEKAN';
    }

    // Kunci Pengelompokan: No SJ + Source + Destination
    var groupKey = (noSj + '___' + source + '___' + destination).toUpperCase();

    if (!sjMap[groupKey]) {
      var rawTgl = row[colMap['tanggalsj'] !== undefined ? colMap['tanggalsj'] : (colMap['tanggal'] !== undefined ? colMap['tanggal'] : 1)];
      var tglSj = rawTgl ? (rawTgl instanceof Date ? rawTgl.toISOString().slice(0, 10) : String(rawTgl)) : '';
      var rawSubmit = row[colMap['waktusubmit'] !== undefined ? colMap['waktusubmit'] : (colMap['createdat'] !== undefined ? colMap['createdat'] : 14)];
      var submittedAt = rawSubmit ? (rawSubmit instanceof Date ? rawSubmit.toISOString() : String(rawSubmit)) : new Date().toISOString();

      var recordId = getVal(row, ['recordid', 'id'], 16) || groupKey;
      var statusSj = getVal(row, ['statussj', 'status'], 11).toLowerCase() || 'pending';

      var newRecord = {
        id: recordId,
        no_sj: noSj,
        tanggal_sj: tglSj,
        source: source || 'Gudang Asal',
        destination: destination || 'Outlet Tujuan',
        status: statusSj,
        status_komparasi: 'COCOK',
        total_qty_sj: 0,
        total_qty_terima: 0,
        total_sku: 0,
        submitted_by: submittedBy || 'Petugas',
        created_at: submittedAt,
        catatan: getVal(row, ['catatan', 'keterangan', 'notes'], 15),
        items: []
      };

      sjMap[groupKey] = newRecord;
      sjList.push(newRecord);
    }

    // Ambil detail produk per baris
    var sku = getVal(row, ['sku', 'kodesku', 'code', 'barcode'], 4);
    var namaProduk = getVal(row, ['namaproduk', 'produk', 'item', 'variant'], 5);
    var category = getVal(row, ['category', 'kategori'], 6);
    var statusKompRaw = getVal(row, ['statuskomparasi', 'komparasi'], -1);

    if (!category && statusKompRaw.includes('/')) {
      category = statusKompRaw;
    }
    if (!sku) {
      sku = category || ('ITEM-' + (sjMap[groupKey].items.length + 1));
    }
    if (!namaProduk) {
      namaProduk = category ? (category + ' (' + sku + ')') : sku;
    }

    var qtySj = Number(getVal(row, ['qtysj', 'qtysuratjalan', 'totalqtysj', 'qty'], 7)) || 0;
    var qtyScan = Number(getVal(row, ['qtyscan', 'qtyterima', 'qtyaktual', 'totalqtyterima', 'terima'], 8)) || 0;
    var selisih = Number(getVal(row, ['selisih'], 9)) || (qtyScan - qtySj);
    var statusItem = getVal(row, ['statusitem'], 10) || (selisih === 0 ? 'COCOK' : (selisih > 0 ? 'LEBIH' : 'KURANG'));
    var isUnexpectedStr = getVal(row, ['lebihdiluarsj', 'isunexpected'], 12).toUpperCase();
    var isUnexpected = isUnexpectedStr === 'YA' || isUnexpectedStr === 'TRUE' || qtySj === 0;

    sjMap[groupKey].items.push({
      id: noSj + '-' + sku + '-' + (sjMap[groupKey].items.length + 1),
      no_sj: noSj,
      source: sjMap[groupKey].source,
      destination: sjMap[groupKey].destination,
      tanggal_sj: sjMap[groupKey].tanggal_sj,
      sku: sku,
      nama_produk: namaProduk,
      category: category,
      qty_sj: qtySj,
      qty_scan: qtyScan,
      selisih: selisih,
      status_item: statusItem,
      status_sj: sjMap[groupKey].status,
      is_unexpected: isUnexpected,
      submitted_by: sjMap[groupKey].submitted_by,
      created_at: sjMap[groupKey].created_at,
      catatan: sjMap[groupKey].catatan
    });

    sjMap[groupKey].total_qty_sj += qtySj;
    sjMap[groupKey].total_qty_terima += qtyScan;
  }

  // Evaluasi total SKU dan status komparasi dokumen
  for (var j = 0; j < sjList.length; j++) {
    var rec = sjList[j];
    rec.total_sku = rec.items.length;
    var hasMismatch = rec.items.some(function(it) { return it.selisih !== 0; });
    rec.status_komparasi = hasMismatch ? 'SELISIH' : 'COCOK';
  }

  return jsonResponse({ success: true, data: sjList });
}

/**
 * Menyimpan data Pengecekan Surat Jalan ke sheet.
 * Menuliskan seluruh item produk 1 baris per SKU ke sheet.
 * Jika No SJ sudah ada, otomatis menghapus baris lama (Anti-Duplikasi).
 */
function handleSubmitPengecekanSJ(record) {
  if (!record || (!record.no_sj && !record.sj_number)) {
    return jsonResponse({ success: false, error: 'Data Surat Jalan tidak lengkap' });
  }

  const ss = getSpreadsheet();
  const sheet = getPengecekanSJSheet(ss);
  const lastRow = sheet.getLastRow();

  const targetNoSj = String(record.no_sj || record.sj_number || '').trim().toUpperCase();
  const targetId = String(record.id || '').trim().toUpperCase();

  // 1. Hapus baris-baris lama jika No SJ ini sebelumnya sudah pernah disubmit / sedang diedit
  if (lastRow > 1) {
    const colCount = Math.min(sheet.getLastColumn(), 17);
    const existing = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();

    // Hapus dari baris terbawah ke atas
    for (var r = existing.length - 1; r >= 0; r--) {
      var rowNoSj = String(existing[r][0] || '').trim().toUpperCase();
      var rowId = String(existing[r][16] || '').trim().toUpperCase();

      if ((targetNoSj && rowNoSj === targetNoSj) || (targetId && rowId === targetId)) {
        sheet.deleteRow(r + 2);
      }
    }
  }

  // 2. Siapkan data baris per item
  var items = [];
  if (Array.isArray(record.items) && record.items.length > 0) {
    items = record.items;
  } else if (Array.isArray(record.rows) && record.rows.length > 0) {
    items = record.rows;
  } else if (typeof record.items_json === 'string') {
    try { items = JSON.parse(record.items_json); } catch (e) {}
  }

  if (items.length === 0) {
    items = [{
      sku: 'INFO',
      nama_produk: record.catatan || 'Pengecekan Surat Jalan',
      category: '',
      qty_sj: Number(record.total_qty_sj) || 0,
      qty_scan: Number(record.total_qty_terima || record.total_qty_aktual) || 0,
      selisih: 0,
      status_item: 'COCOK',
      is_unexpected: false
    }];
  }

  var nowIso = new Date().toISOString();
  var rowsToAppend = [];

  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    var qtySj = Number(it.qty_sj !== undefined ? it.qty_sj : 0);
    var qtyScan = Number(it.qty_scan !== undefined ? it.qty_scan : (it.qty_terima || 0));
    var selisih = Number(it.selisih !== undefined ? it.selisih : (qtyScan - qtySj));
    var isUnexp = it.is_unexpected || qtySj === 0;

    var statusItem = it.status_item || (selisih === 0 ? 'COCOK' : (selisih > 0 ? 'LEBIH' : 'KURANG'));

    rowsToAppend.push([
      record.no_sj || record.sj_number || '',
      record.tanggal_sj || '',
      record.source || '',
      record.destination || '',
      it.sku || '',
      it.nama_produk || it.sku || '',
      it.category || '',
      qtySj,
      qtyScan,
      selisih,
      statusItem,
      record.status || 'pending', // Status otomatis pending
      isUnexp ? 'YA' : 'TIDAK',
      record.submitted_by || record.user || 'Petugas',
      record.created_at || nowIso,
      it.catatan || record.catatan || '',
      record.id || (record.no_sj + '___' + (record.source || '') + '___' + (record.destination || ''))
    ]);
  }

  // 3. Tulis batch sekaligus ke sheet
  if (rowsToAppend.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAppend.length, PENGECEKAN_SJ_HEADERS.length).setValues(rowsToAppend);
  }

  return jsonResponse({
    success: true,
    message: 'Surat Jalan ' + record.no_sj + ' berhasil disimpan (' + rowsToAppend.length + ' baris item) dengan status pending'
  });
}

/**
 * Menghapus seluruh baris yang memiliki No SJ atau ID tersebut
 */
function handleDeletePengecekanSJ(data) {
  if (!data || (!data.no_sj && !data.id && !data.sj_number)) {
    return jsonResponse({ success: false, error: 'no_sj atau id required' });
  }

  const ss = getSpreadsheet();
  const sheet = getPengecekanSJSheet(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: true, message: 'Sheet kosong' });

  const targetNoSj = String(data.no_sj || data.sj_number || '').trim().toUpperCase();
  const targetId = String(data.id || '').trim().toUpperCase();

  const colCount = Math.min(sheet.getLastColumn(), 17);
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var deletedCount = 0;

  for (var r = values.length - 1; r >= 0; r--) {
    var rowNoSj = String(values[r][0] || '').trim().toUpperCase();
    var rowId = String(values[r][16] || values[r][0] || '').trim().toUpperCase();

    if ((targetNoSj && rowNoSj === targetNoSj) || (targetId && rowId === targetId)) {
      sheet.deleteRow(r + 2);
      deletedCount++;
    }
  }

  return jsonResponse({
    success: true,
    message: deletedCount + ' baris item surat jalan berhasil dihapus'
  });
}

// =========================================================
// 5. MODUL UPLOAD FOTO GOOGLE DRIVE (QUALITY CONTROL)
// =========================================================
function handleUploadGDrive(data) {
  try {
    var base64 = data.base64 || '';
    var filename = data.filename || ('Reject_QC_' + Date.now() + '.jpg');
    var folderId = data.folderId || '14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';

    var cleanBase64 = base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, 'image/jpeg', filename);

    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;

    return jsonResponse({
      status: 'success',
      success: true,
      fileId: fileId,
      url: viewUrl,
      fileUrl: viewUrl
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      success: false,
      error: error.toString()
    });
  }
}

// =========================================================
// RESPONSE FORMATTER JSON
// =========================================================
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
