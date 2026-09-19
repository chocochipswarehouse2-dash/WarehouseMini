/**
 * WMS GAS BACKEND — fonnte_handler.gs
 * ====================================
 * Menangani request Webhook dari WhatsApp (Fonnte).
 * Format Payload: { sender, name, message }
 * 
 * Flow:
 * 1 Pesan WA = 1 Invoice
 * Pesan WA -> Webhook -> Tulis Raw Scan ke log_produk Supabase -> Return HTTP 200
 * (GAS MURNI PENCATAT PESAN, NOL KALKULASI STOK DI GAS)
 */

/**
 * Fetch helper untuk memanggil Supabase REST API dari dalam GAS
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

function handleWhatsAppScan(payload) {
  try {
    var sender = payload.sender || payload.pengirim || payload.from || payload.phone || '';
    var actualSender = payload.participant || sender;
    var name = payload.pushname || payload.name || actualSender;
    var message = (payload.message || payload.pesan || payload.text || '').trim();
    
    if (!message) {
      return jsonResponse({ success: true, message: 'Empty message ignored.' });
    }
    
    // Deduplication check via CacheService (TTL 120s)
    var dedupKey = 'DEDUP_' + String(actualSender || sender || '').replace(/[^a-zA-Z0-9]/g, '') + '_' + message.length + '_' + String(message || '').substring(0, 30).replace(/[^a-zA-Z0-9]/g, '');
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
    
    var lines = message.split('\n');
    var currentType = '';
    var currentDeskripsi = '';
    var currentLokasi = '';
    var rawItems = [];
    var operator = name + ' | ' + actualSender;
    
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
      
      // 4. Deteksi jika baris awal adalah nama lokasi mandiri
      if (!currentLokasi && (upper.match(/^[A-Z][0-9]{2,4}$/) || upper === 'SHOPEE' || upper === 'TIKTOK' || upper.indexOf('BLOK') === 0 || upper === 'STUDIO' || upper === 'PERBAIKAN')) {
        currentLokasi = line;
        continue;
      }
      
      // 5. Baris Item SKU & QTY
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
      
      rawItems.push({
        sku: itemSku,
        qty: itemQty
      });
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
    
    // Batch lookup metadata produk (1 request kilat jika <= 50 sku)
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
    
    // Tulis ke log_produk Supabase (NOL KALKULASI DI GAS)
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
