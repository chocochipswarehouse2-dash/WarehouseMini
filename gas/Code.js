/**
 * WMS GAS BACKEND — Code.js (STANDALONE WEBHOOK FOR FONNTE & SUPABASE)
 * ====================================================================
 * Realtime & Cepat:
 * 1 Pesan WA = 1 Invoice
 * Pesan WA -> Webhook -> Tulis ke log_produk Supabase -> Supabase Kalkulasi -> Tulis ke stock_opname_queue
 */

var SUPABASE_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

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
        // Fallback jika dikirim x-www-form-urlencoded
        payload = e.parameter || {};
      }
    } else if (e.parameter) {
      payload = e.parameter;
    }

    // Tangani jika pesan bersarang di field data
    if (payload.data && typeof payload.data === 'object') {
      payload = payload.data;
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
    
    // Deduplication check via CacheService (TTL 90s) to block automated gateway retries
    var dedupKey = 'DEDUP_' + String(sender || '').replace(/[^a-zA-Z0-9]/g, '') + '_' + String(message || '').substring(0, 30).replace(/[^a-zA-Z0-9]/g, '');
    try {
      var cache = CacheService.getScriptCache();
      if (cache && dedupKey.length > 8) {
        var existing = cache.get(dedupKey);
        if (existing) {
          Logger.log('Duplicate WA message ignored: ' + dedupKey);
          return jsonResponse({ success: true, message: 'Duplicate webhook ignored.' });
        }
        cache.put(dedupKey, 'PROCESSED', 90);
      }
    } catch (eDedup) {}
    
    var lines = message.split('\n');
    var currentType = '';
    var currentDeskripsi = '';
    var currentLokasi = '';
    var rawItems = [];
    var operator = name + ' | ' + sender;
    
    var TYPE_IN = 'IN';
    var TYPE_OUT = 'OUT';
    var TYPE_SO = 'SO';
    var TYPE_ADJ_IN = 'ADJ_IN';
    var TYPE_ADJ_OUT = 'ADJ_OUT';
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      
      var upper = line.toUpperCase();
      
      // 1. Deteksi Header Tag
      if (upper.indexOf('#SO') === 0 || upper.indexOf('#STOCK OPNAME') === 0 || upper.indexOf('#OPNAME') === 0) {
        currentType = TYPE_SO;
        var restSo = line.replace(/^#[A-Z0-9_\s]*(SO|STOCK OPNAME|OPNAME)\b/i, '').replace(/^[:\-\s]+/, '').trim();
        if (restSo) currentLokasi = restSo;
        currentDeskripsi = 'Stock Opname WA';
        continue;
      }
      
      if (upper.indexOf(' IN') > -1 || upper.indexOf('#IN') === 0) {
        currentType = TYPE_IN;
        var restIn = line.replace(/^#[A-Z0-9_\s]*IN\b/i, '').replace(/^[:\-\s]+/, '').trim();
        if (restIn && !currentLokasi) currentLokasi = restIn;
        currentDeskripsi = restIn || 'IN';
        continue;
      }
      
      if (upper.indexOf(' OUT') > -1 || upper.indexOf('#OUT') === 0) {
        currentType = TYPE_OUT;
        var restOut = line.replace(/^#[A-Z0-9_\s]*OUT\b/i, '').replace(/^[:\-\s]+/, '').trim();
        if (restOut && !currentLokasi) currentLokasi = restOut;
        currentDeskripsi = restOut || 'OUT';
        continue;
      }

      if (upper.indexOf('#ADJ_IN') === 0 || upper.indexOf('#ADJ-IN') === 0) {
        currentType = TYPE_ADJ_IN;
        continue;
      }

      if (upper.indexOf('#ADJ_OUT') === 0 || upper.indexOf('#ADJ-OUT') === 0) {
        currentType = TYPE_ADJ_OUT;
        continue;
      }
      
      // 2. Deteksi Lokasi eksplisit (#LOK / #LOKASI)
      if (upper.indexOf('#LOK') === 0) {
        currentLokasi = line.replace(/^#LOK[ASI:]*\s*/i, '').trim();
        continue;
      }
      
      // 3. Deteksi Keterangan (#KET)
      if (upper.indexOf('#KET') === 0) {
        currentDeskripsi = line.replace(/^#KET[:\s]*/i, '').trim();
        continue;
      }
      
      // 4. Deteksi jika baris awal adalah nama lokasi mandiri (misal: C060, SHOPEE, TIKTOK, BLOK F)
      if (!currentLokasi && (upper.match(/^[A-Z][0-9]{2,4}$/) || upper === 'SHOPEE' || upper === 'TIKTOK' || upper.indexOf('BLOK') === 0 || upper === 'STUDIO' || upper === 'PERBAIKAN')) {
        currentLokasi = line;
        continue;
      }
      
      // 5. Baris Item SKU & QTY
      // Parsing SKU dan QTY: "SKU 5", "SKU | 5", atau "SKU" (qty = 1)
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
        // Cek jika diakhiri spasi angka (contoh: "STEKLA YELLOW 3")
        var matchQty = upper.match(/^(.*?)\s+(\d+)$/);
        if (matchQty && matchQty[1] && matchQty[2]) {
          // Hanya anggap qty jika angka <= 1000 dan SKU tidak murni numeric
          var qVal = parseInt(matchQty[2], 10);
          if (qVal > 0 && qVal <= 1000) {
            itemSku = matchQty[1].trim();
            itemQty = qVal;
          }
        }
      }
      
      rawItems.push({
        sku: itemSku,
        qty: itemQty
      });
    }
    
    if (rawItems.length === 0) {
      return jsonResponse({ success: true, message: 'Tidak ada baris SKU produk yang valid.' });
    }
    
    // Default lokasi ke 'Warehouse' jika tidak disebutkan
    var lokasiFinal = currentLokasi ? currentLokasi.trim() : 'Warehouse';
    var typeFinal = currentType ? currentType : TYPE_SO;
    var deskripsiFinal = currentDeskripsi || (typeFinal === TYPE_SO ? 'Stock Opname WA' : typeFinal);
    var areaFinal = getArea(lokasiFinal);
    
    // 1 PESAN WA = 1 INVOICE
    var invoice = generateInvoice();
    var nowIso = new Date().toISOString();
    
    // 1. FAST BATCH QUERY: Ambil metadata produk (nama_produk & size) dalam 1 HTTP Request
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
    if (uniqueSkus.length > 0) {
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
    
    // 2. Siapkan baris log_produk
    var logEntries = [];
    for (var j = 0; j < rawItems.length; j++) {
      var it = rawItems[j];
      var meta = metaMap[it.sku];
      var nama_produk = meta ? meta.nama_produk : (it.sku === 'KOLI' ? 'Koli Kargo' : it.sku);
      var size = meta ? (meta.size || '-') : '-';
      
      logEntries.push({
        type: typeFinal,
        invoice: invoice,
        sku: it.sku,
        nama_produk: nama_produk,
        size: size,
        area: areaFinal,
        lokasi: lokasiFinal,
        qty: it.qty,
        operator: operator,
        keterangan: deskripsiFinal,
        created_at: nowIso
      });
    }
    
    // 3. TULIS KE log_produk SUPABASE (1 Batch POST < 200ms)
    var insertLogResult = supabaseApiFetch('log_produk', 'POST', logEntries);
    Logger.log('Insert log_produk success. Invoice=' + invoice + ', Items=' + logEntries.length);
    
    // 4. JIKA TYPE ADALAH 'SO', SUPABASE LANGSUNG KALKULASI HASIL HITUNG KE stock_opname_queue
    var queueCount = 0;
    if (typeFinal === TYPE_SO) {
      queueCount = kalkulasiDanTulisSoQueueSupabase(invoice, logEntries, lokasiFinal, areaFinal, operator, nowIso);
    }
    
    return jsonResponse({
      success: true,
      message: 'Scan berhasil diproses dan dicatat ke log_produk.',
      invoice: invoice,
      type: typeFinal,
      total_items: logEntries.length,
      queue_items: queueCount
    });
    
  } catch (err) {
    Logger.log('Fonnte handler error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Kalkulasi Stock Opname berbasis data log_produk vs stok_real_fisik
 * Menghitung selisih dan menulis langsung ke stock_opname_queue dengan invoice terkait
 */
function kalkulasiDanTulisSoQueueSupabase(invoice, logEntries, lokasi, area, operator, nowIso) {
  try {
    // 1. Agregasi Qty Fisik dari baris log_produk yang baru dicatat
    var hitungFisikMap = {}; // sku -> qty_fisik
    var skuList = [];
    var metaMap = {};
    
    for (var i = 0; i < logEntries.length; i++) {
      var entry = logEntries[i];
      var skuUpper = entry.sku.toUpperCase();
      hitungFisikMap[skuUpper] = (hitungFisikMap[skuUpper] || 0) + (Number(entry.qty) || 0);
      if (skuList.indexOf(skuUpper) === -1) {
        skuList.push(skuUpper);
        metaMap[skuUpper] = {
          nama_produk: entry.nama_produk,
          size: entry.size
        };
      }
    }
    
    if (skuList.length === 0) return 0;
    
    // 2. Batch Query Stok Sistem dari view stok_real_fisik di Supabase
    var inClause = skuList.map(function(s) { return '"' + s.replace(/"/g, '""') + '"'; }).join(',');
    var endpoint = 'stok_real_fisik?sku=in.(' + encodeURIComponent(inClause) + ')&lokasi=eq.' + encodeURIComponent(lokasi) + '&select=sku,lokasi,sisa_stok';
    var stockRows = supabaseApiFetch(endpoint, 'GET') || [];
    
    var stockMap = {}; // sku -> sisa_stok
    for (var s = 0; s < stockRows.length; s++) {
      var row = stockRows[s];
      if (row && row.sku) {
        stockMap[row.sku.toUpperCase()] = Number(row.sisa_stok) || 0;
      }
    }
    
    // 3. Bandingkan Qty Fisik vs Qty Sistem (Hanya masukkan jika selisih !== 0)
    var queueRows = [];
    for (var k = 0; k < skuList.length; k++) {
      var targetSku = skuList[k];
      var qtyFisik = hitungFisikMap[targetSku] || 0;
      var qtySistem = stockMap[targetSku] || 0; // Jika tidak ada di stok_real_fisik, stok sistem = 0
      var selisih = qtyFisik - qtySistem;
      
      if (selisih !== 0) {
        var mInfo = metaMap[targetSku] || {};
        queueRows.push({
          sesi_id: invoice,
          tanggal: nowIso,
          sku: targetSku,
          nama_produk: mInfo.nama_produk || targetSku,
          size: mInfo.size || '-',
          lokasi: lokasi,
          area: area,
          qty_sistem: qtySistem,
          qty_fisik: qtyFisik,
          selisih: selisih,
          status: 'PENDING',
          jenis: 'Opname WA',
          alasan: 'Selisih Opname (' + (selisih > 0 ? '+' + selisih : selisih) + ')',
          operator: operator,
          invoice: invoice
        });
      }
    }
    
    // 4. Batch Insert ke stock_opname_queue
    if (queueRows.length > 0) {
      supabaseApiFetch('stock_opname_queue', 'POST', queueRows);
      Logger.log('Tulis ke stock_opname_queue sukses. Invoice=' + invoice + ', Antrean=' + queueRows.length);
    }
    
    return queueRows.length;
  } catch (err) {
    Logger.log('Gagal kalkulasi SO queue: ' + err.toString());
    return 0;
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