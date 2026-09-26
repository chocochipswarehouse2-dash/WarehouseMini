/**
 * WMS GAS BACKEND — Code.js (STANDALONE WEBHOOK FOR FONNTE & SUPABASE)
 * ====================================================================
 * Realtime & Super Cepat (< 150ms):
 * 1 Pesan WA = 1 Invoice
 * Pesan WA -> Webhook -> Tulis Raw Scan ke log_produk Supabase -> Return HTTP 200
 * (GAS MURNI PENCATAT PESAN, NOL KALKULASI STOK DI GAS)
 */

var SUPABASE_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

// ===================================================
// DAFTAR GRUP WHATSAPP RESMI (ALLOWED GROUPS)
// Sesuai aturan baku Config.gs WMS Chocochips
// ===================================================
var ALLOWED_GROUPS_MUTASI = [
  "120363427883208118@g.us",
  "120363409655838712@g.us"
];

var ALLOWED_GROUPS_LOG_PRODUCT = [
  "120363426359702090@g.us",
  "120363430508883535@g.us",
  "120363410159735625@g.us",
  "120363410565626286@g.us"
];

/**
 * Entry point doPost
 */
function doPost(e) {
  try {
    if (!e) {
      return jsonResponse({ success: false, error: 'No request received' });
    }

    var payload = {};

    // 1. Coba parse JSON body
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errJson) {
        payload = e.parameter || {};
      }
    } else if (e.parameter) {
      payload = e.parameter;
    }

    if (payload.data && typeof payload.data === 'object') {
      payload = payload.data;
    }

    // 2. Action router khusus WMS Produksi Sheet Sync
    if (payload.action === 'pushPenerimaanProduksi') {
      return jsonResponse(handlePushPenerimaanProduksi(payload));
    }

    return handleWhatsAppScan(payload);

  } catch (err) {
    Logger.log('doPost Error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return jsonResponse({ success: true, status: 'WMS Webhook Active', timestamp: new Date().toISOString() });
}

/**
 * Handler utama WhatsApp scan (IN, OUT, SO)
 */
function handleWhatsAppScan(payload) {
  try {
    var sender = payload.participant || payload.sender || payload.pengirim || payload.from || payload.phone || '';
    var name = payload.pushname || payload.name || sender || 'WhatsApp User';
    var message = (payload.message || payload.pesan || payload.text || '').trim();
    
    if (!message) {
      return jsonResponse({ success: true, message: 'Empty message ignored.' });
    }
    
    if (message === 'PING TEST WEBHOOK') {
      return jsonResponse({ success: true, message: 'PING OK - Webhook Standalone Aktif' });
    }

    // 0. Filter Pesan Broadcast / Surat Jalan / Tugas Picking / Pesan Sistem
    var upperMsg = message.toUpperCase();
    if (
      upperMsg.indexOf('TUGAS PICKING') > -1 ||
      upperMsg.indexOf('PICKING LIST') > -1 ||
      upperMsg.indexOf('DAFTAR BARANG YANG HARUS DIAMBIL') > -1 ||
      upperMsg.indexOf('SENT VIA FONNTE') > -1 ||
      upperMsg.indexOf('MOHON PICKER') > -1 ||
      upperMsg.indexOf('EKSPEDISI:') > -1 ||
      upperMsg.indexOf('*EKSPEDISI') > -1 ||
      upperMsg.indexOf('*ORDER ') > -1 ||
      upperMsg.indexOf('*NO SJ:*') > -1 ||
      upperMsg.indexOf('*ASAL:*') > -1 ||
      upperMsg.indexOf('SURAT JALAN') > -1
    ) {
      Logger.log('Pesan WA diabaikan: Format broadcast tugas picking / surat jalan bukan format scan.');
      return jsonResponse({ success: true, message: 'IGNORED_PICKING_TASK_BROADCAST' });
    }

    // 1. Ekstraksi dan Validasi Group ID (@g.us)
    var groupId = null;
    var candidates = [
      payload.group,
      payload.group_id,
      payload.chatId,
      payload.chat_id,
      payload.target,
      payload.sender,
      payload.pengirim,
      payload.from
    ];
    for (var g = 0; g < candidates.length; g++) {
      var cand = String(candidates[g] || '').trim();
      if (!cand) continue;
      if (cand.indexOf('@g.us') > -1) {
        groupId = cand;
        break;
      }
      if (cand.length >= 15 && /^\d+$/.test(cand)) {
        var withSuffix = cand + '@g.us';
        if (ALLOWED_GROUPS_LOG_PRODUCT.indexOf(withSuffix) > -1 || ALLOWED_GROUPS_MUTASI.indexOf(withSuffix) > -1) {
          groupId = withSuffix;
          break;
        }
      }
    }

    // Wajib berasal dari grup WhatsApp resmi yang terdaftar
    var isGroupSo = ALLOWED_GROUPS_LOG_PRODUCT.indexOf(groupId) > -1;
    var isGroupMutasi = ALLOWED_GROUPS_MUTASI.indexOf(groupId) > -1;

    if (!groupId || (!isGroupSo && !isGroupMutasi)) {
      Logger.log('Pesan WA diabaikan: groupId=' + groupId + ' tidak terdaftar dalam grup resmi.');
      return jsonResponse({ success: true, message: 'IGNORED_UNAUTHORIZED_GROUP' });
    }

    // 2. Deduplikasi Webhook via CacheService (TTL 120s)
    var msgId = payload.id || payload.message_id || '';
    var dedupKey = msgId ? ('DEDUP_ID_' + msgId) : ('DEDUP_MSG_' + String(groupId).replace(/[^a-zA-Z0-9]/g, '') + '_' + message.length + '_' + encodeURIComponent(message.slice(0, 30)));
    try {
      var cache = CacheService.getScriptCache();
      if (cache && dedupKey.length > 8) {
        var existing = cache.get(dedupKey);
        if (existing) {
          Logger.log('Duplicate WA message ignored: ' + dedupKey);
          return jsonResponse({ success: true, message: 'Duplicate webhook ignored.' });
        }
        cache.put(dedupKey, 'PROCESSED', 120);
      }
    } catch (eDedup) {}
    
    var actualSender = payload.member || payload.participant || (sender.indexOf('@g.us') === -1 ? sender : '');
    var operator = name + ' | ' + (actualSender || sender || groupId);
    
    var lines = message.split('\n');
    var currentType = '';
    var currentDeskripsi = '';
    var currentLokasi = '';
    var rawItems = [];
    
    var TYPE_IN = 'IN';
    var TYPE_OUT = 'OUT';
    var TYPE_SO = 'SO';
    var TYPE_ADJ_IN = 'ADJ_IN';
    var TYPE_ADJ_OUT = 'ADJ_OUT';
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      
      var upper = line.toUpperCase();
      
      // 1. Deteksi Header Tag (Harus diawali tag # atau kata perintah di awal baris)
      if (/^#?(SO|STOCK OPNAME|OPNAME)(\s|:|$)/i.test(line)) {
        currentType = TYPE_SO;
        var restSo = line.replace(/^#?(SO|STOCK OPNAME|OPNAME)[:\s]*/i, '').trim();
        if (restSo && !currentLokasi) currentLokasi = restSo;
        currentDeskripsi = 'Stock Opname WA';
        continue;
      }
      
      if (/^#?(IN|MASUK)(\s|:|$)/i.test(line)) {
        currentType = TYPE_IN;
        var restIn = line.replace(/^#?(IN|MASUK)[:\s]*/i, '').trim();
        if (restIn && !currentLokasi && !/^[A-Z0-9_]{5,}$/i.test(restIn)) currentLokasi = restIn;
        currentDeskripsi = 'IN';
        continue;
      }
      
      if (/^#?(OUT|KELUAR)(\s|:|$)/i.test(line)) {
        currentType = TYPE_OUT;
        var restOut = line.replace(/^#?(OUT|KELUAR)[:\s]*/i, '').trim();
        if (restOut && !currentLokasi && !/^[A-Z0-9_]{5,}$/i.test(restOut)) currentLokasi = restOut;
        currentDeskripsi = 'OUT';
        continue;
      }

      if (/^#?ADJ[-_]IN(\s|:|$)/i.test(line)) {
        currentType = TYPE_ADJ_IN;
        continue;
      }

      if (/^#?ADJ[-_]OUT(\s|:|$)/i.test(line)) {
        currentType = TYPE_ADJ_OUT;
        continue;
      }
      
      // 2. Deteksi Lokasi eksplisit (#LOK / #LOKASI / LOKASI / LOK)
      if (/^#?LOK(ASI)?[:\s]/i.test(line)) {
        currentLokasi = line.replace(/^#?LOK[ASI:]*\s*/i, '').trim();
        continue;
      }
      
      // 3. Deteksi Keterangan (#KET / KET)
      if (/^#?KET[:\s]/i.test(line)) {
        currentDeskripsi = line.replace(/^#?KET[:\s]*/i, '').trim();
        continue;
      }
      
      // 4. Deteksi jika baris awal adalah nama lokasi mandiri
      if (!currentLokasi && (upper.match(/^[A-Z][0-9]{2,4}$/) || upper === 'SHOPEE' || upper === 'TIKTOK' || upper.indexOf('BLOK') === 0 || upper === 'STUDIO' || upper === 'PERBAIKAN')) {
        currentLokasi = line;
        continue;
      }

      // 5. Abaikan baris obrolan, header broadcast, footer watermark, emoji, atau teks non-SKU
      if (
        /^[*_>•\-\[\]#]/.test(line) ||
        /[📦🔢🚨🚚🛒🏷️]/.test(line) ||
        /\b(QTY|PCS|ORDER|EXPEDISI|EKSPEDISI|TOTAL|KURIR|REKAP|SURAT JALAN|SENT VIA|BARCODE)\b/i.test(line)
      ) {
        continue;
      }
      
      // 6. Baris Item SKU & QTY
      var itemSku = upper;
      var itemQty = 1;
      
      if (upper.indexOf('|') > -1) {
        var partsPipe = upper.split('|');
        itemSku = partsPipe[0].trim();
        var parsedQtyPipe = parseInt(partsPipe[1].trim(), 10);
        if (!isNaN(parsedQtyPipe) && parsedQtyPipe > 0) {
          itemQty = parsedQtyPipe;
        }
      } else {
        var matchQty = upper.match(/^(.*?)\s+(\d+)$/);
        if (matchQty && matchQty[1] && matchQty[2]) {
          var qVal = parseInt(matchQty[2], 10);
          if (qVal > 0 && qVal <= 1000) {
            itemSku = matchQty[1].trim();
            itemQty = qVal;
          }
        }
      }

      // Validasi ketat SKU: SKU tidak boleh mengandung kalimat panjang (maks 2 kata jika ada spasi)
      if (itemSku.length < 2 || itemSku.length > 40 || (itemSku.indexOf(' ') > -1 && itemSku !== 'KOLI KARGO' && itemSku.split(' ').length > 2)) {
        continue;
      }
      
      var itemLokasi = currentLokasi ? currentLokasi.trim() : 'Warehouse';
      var itemType = currentType ? currentType : TYPE_SO;
      var itemDeskripsi = currentDeskripsi || (itemType === TYPE_SO ? 'Stock Opname WA' : itemType);
      var itemArea = getArea(itemLokasi);

      rawItems.push({
        sku: itemSku,
        qty: itemQty,
        lokasi: itemLokasi,
        type: itemType,
        deskripsi: itemDeskripsi,
        area: itemArea
      });
    }
    
    // Jika tidak ada tipe transaksi maupun lokasi valid yang terdeteksi,
    // abaikan pesan karena merupakan obrolan biasa di grup
    if (!currentType && !currentLokasi) {
      Logger.log('Pesan WA diabaikan: obrolan grup biasa (bukan format scan WMS).');
      return jsonResponse({ success: true, message: 'IGNORED_NON_SCAN_MESSAGE' });
    }
    
    if (rawItems.length === 0) {
      return jsonResponse({ success: true, message: 'Tidak ada baris SKU produk yang valid.' });
    }
    
    var lokasiFinal = currentLokasi ? currentLokasi.trim() : 'Warehouse';
    var typeFinal = currentType ? currentType : TYPE_SO;
    var deskripsiFinal = currentDeskripsi || (typeFinal === TYPE_SO ? 'Stock Opname WA' : typeFinal);
    var areaFinal = getArea(lokasiFinal);
    
    // 1 PESAN WA = 1 INVOICE
    var invoice = generateInvoice();
    var nowIso = new Date().toISOString();
    
    // Batch lookup metadata produk (1 request kilat)
    var uniqueSkus = [];
    var skuSeen = {};
    for (var k = 0; k < rawItems.length; k++) {
      var s = rawItems[k].sku;
      if (!skuSeen[s]) {
        skuSeen[s] = true;
        uniqueSkus.push(s);
      }
    }
    
    var metaMap = {};
    if (uniqueSkus.length > 0 && uniqueSkus.length <= 50) {
      try {
        var inClause = uniqueSkus.map(function(itemSku) { 
          return '"' + itemSku.replace(/"/g, '""') + '"'; 
        }).join(',');
        var metaResults = supabaseApiFetch('master_produk?sku=in.(' + encodeURIComponent(inClause) + ')&select=sku,nama_produk,size', 'GET');
        if (metaResults && metaResults.length > 0) {
          for (var m = 0; m < metaResults.length; m++) {
            var metaRow = metaResults[m];
            if (metaRow && metaRow.sku) {
              metaMap[metaRow.sku.toUpperCase()] = metaRow;
            }
          }
        }
      } catch (eMeta) {
        Logger.log('Batch meta lookup warning: ' + eMeta.toString());
      }
    }
    
    // Siapkan baris log_produk
    var logEntries = [];
    for (var j = 0; j < rawItems.length; j++) {
      var it = rawItems[j];
      var meta = metaMap[it.sku];
      var nama_produk = meta ? meta.nama_produk : (it.sku === 'KOLI' ? 'Koli Kargo' : it.sku);
      var size = meta ? (meta.size || '-') : '-';
      
      logEntries.push({
        type: it.type || typeFinal,
        invoice: invoice,
        sku: it.sku,
        nama_produk: nama_produk,
        size: size,
        area: it.area || areaFinal,
        lokasi: it.lokasi || lokasiFinal,
        qty: it.qty,
        operator: operator,
        keterangan: it.deskripsi || deskripsiFinal,
        created_at: nowIso
      });
    }
    
    // TULIS KE log_produk SUPABASE (1 Batch POST < 150ms)
    // Seluruh kalkulasi stok fisik maupun stock opname didelegasikan ke Supabase.
    // GAS murni bertindak sebagai webhook pesan yang cepat tanpa kalkulasi.
    supabaseApiFetch('log_produk', 'POST', logEntries);
    Logger.log('Insert log_produk success. Invoice=' + invoice + ', Items=' + logEntries.length);
    
    return jsonResponse({
      success: true,
      message: 'Scan berhasil dicatat ke log_produk.',
      invoice: invoice,
      type: typeFinal,
      total_items: logEntries.length
    });
    
  } catch (err) {
    Logger.log('Fonnte handler error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Fetch helper ke Supabase REST API
 */
function supabaseApiFetch(endpoint, method, payload) {
  var url = SUPABASE_URL + '/rest/v1/' + endpoint;
  var options = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  if (payload) {
    if (method === 'POST' || method === 'PATCH') {
      options.headers['Prefer'] = 'return=minimal';
    }
    options.payload = JSON.stringify(payload);
  }
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 400) {
    throw new Error('Supabase API Error (' + response.getResponseCode() + '): ' + response.getContentText());
  }
  
  var text = response.getContentText();
  return text ? JSON.parse(text) : null;
}

function getArea(lokasi) {
  var lok = String(lokasi || '').trim().toUpperCase();
  if (!lok) return 'Warehouse';
  if (lok.indexOf('BLOK F') > -1 || lok.indexOf('SHOPEE') > -1 || lok.indexOf('TIKTOK') > -1) return 'Blok F';
  if (lok.indexOf('STUDIO') > -1 || lok.indexOf('FOTO') > -1 || lok.indexOf('DISPLAY') > -1 || lok.indexOf('STD') === 0) return 'Studio';
  if (lok.indexOf('T-') === 0 || lok.indexOf('TK-') === 0 || lok.indexOf('TOKO') > -1 || lok.indexOf('STORE') > -1) return 'Toko';
  if (lok.indexOf('CC') === 0 || lok.indexOf('CUCI') > -1 || lok.indexOf('WASH') > -1 || lok.indexOf('PERBAIKAN') > -1 || lok.indexOf('REPAIR') > -1 || lok.indexOf('DEFECT') > -1 || lok.indexOf('BS') > -1 || lok.indexOf('REJECT') > -1) return 'Perbaikan';
  return 'Warehouse';
}

function generateInvoice() {
  var dt = new Date();
  var pad = function(n) { return n < 10 ? '0' + n : n; };
  var randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "WA" + dt.getFullYear() + pad(dt.getMonth()+1) + pad(dt.getDate()) + randomStr;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Push data riwayat produksi ke Google Spreadsheet dengan formula =IMAGE(...)
 * Spreadsheet ID: 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 */
function handlePushPenerimaanProduksi(data) {
  try {
    var ssId = data.spreadsheetId || '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';
    var targetSheetName = data.sheetName || 'Riwayat Produksi';

    var ss;
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (eOpen) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) throw new Error('Tidak dapat membuka Spreadsheet dengan ID: ' + ssId + '. Pastikan script memiliki izin akses.');
    }

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }

    var headers = [
      'No',
      'Tanggal Penerimaan',
      'Kategori',
      'No Surat Jalan',
      'Kode Produksi',
      'Warna',
      'Size',
      'Qty (Pcs)',
      'Foto Produk',
      'Keterangan',
      'Operator',
      'Waktu Dibuat'
    ];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#059669');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 36);

      sheet.setColumnWidth(1, 45);
      sheet.setColumnWidth(2, 120);
      sheet.setColumnWidth(3, 95);
      sheet.setColumnWidth(4, 140);
      sheet.setColumnWidth(5, 130);
      sheet.setColumnWidth(6, 110);
      sheet.setColumnWidth(7, 75);
      sheet.setColumnWidth(8, 80);
      sheet.setColumnWidth(9, 100);
      sheet.setColumnWidth(10, 180);
      sheet.setColumnWidth(11, 120);
      sheet.setColumnWidth(12, 140);
    }

    var items = data.items || [];
    if (!items || items.length === 0) {
      return { success: true, message: 'Tidak ada baris data item untuk ditambahkan.', count: 0 };
    }

    var startRow = sheet.getLastRow() + 1;
    var rowsToAdd = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var rowNumber = startRow + i;

      var fotoFormula = '-';
      var rawFoto = String(it.foto_url || '').trim();
      if (rawFoto && (rawFoto.indexOf('http://') === 0 || rawFoto.indexOf('https://') === 0)) {
        fotoFormula = '=IMAGE("' + rawFoto + '", 4, 60, 60)';
      }

      rowsToAdd.push([
        rowNumber - 1,
        it.tanggal_penerimaan || '',
        it.kategori || 'Lokal CMT',
        it.no_surat_jalan || '',
        it.kode_produksi || '',
        it.warna || '',
        it.size || '',
        Number(it.qty) || 0,
        fotoFormula,
        it.keterangan || '',
        it.operator || 'Operator',
        it.created_at || new Date().toISOString()
      ]);
    }

    if (rowsToAdd.length > 0) {
      var range = sheet.getRange(startRow, 1, rowsToAdd.length, headers.length);
      range.setValues(rowsToAdd);

      for (var r = 0; r < rowsToAdd.length; r++) {
        var cRow = startRow + r;
        sheet.setRowHeight(cRow, 65);
      }

      sheet.getRange(startRow, 1, rowsToAdd.length, 1).setHorizontalAlignment('center');
      sheet.getRange(startRow, 2, rowsToAdd.length, 1).setHorizontalAlignment('center');
      sheet.getRange(startRow, 3, rowsToAdd.length, 1).setHorizontalAlignment('center');
      sheet.getRange(startRow, 7, rowsToAdd.length, 2).setHorizontalAlignment('center');
      sheet.getRange(startRow, 9, rowsToAdd.length, 1).setHorizontalAlignment('center');
      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setVerticalAlignment('middle');

      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setBorder(
        true, true, true, true, true, true,
        '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    return {
      success: true,
      message: 'Sukses menulis ' + rowsToAdd.length + ' baris dengan gambar ke Google Sheet!',
      count: rowsToAdd.length,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit#gid=' + sheet.getSheetId()
    };
  } catch (err) {
    Logger.log('handlePushPenerimaanProduksi error: ' + err.toString());
    return {
      success: false,
      error: err.toString(),
      message: 'Gagal menulis ke Google Sheet: ' + err.toString()
    };
  }
}