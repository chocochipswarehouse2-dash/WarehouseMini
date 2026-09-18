/**
 * WMS GAS BACKEND — fonnte_handler.gs (STANDALONE WEBHOOK)
 * =======================================================
 * Menerima webhook dari Fonnte dan menulis langsung ke Supabase:
 * - tabel 'log_produk'
 * - tabel 'stock_opname_queue'
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

/**
 * Handler utama (PERSIS seperti fonnte_handler.js asli)
 */
function handleWhatsAppScan(payload) {
  try {
    var sender = payload.participant || payload.sender || payload.pengirim || payload.from || payload.phone || '';
    var name = payload.pushname || payload.name || sender || 'WhatsApp User';
    var message = (payload.message || payload.pesan || payload.text || '').trim();
    
    if (!message) {
      return jsonResponse({ success: true, message: 'Empty message ignored.' });
    }
    
    var lines = message.split('\n');
    var currentType = '';
    var currentDeskripsi = '';
    var currentLokasi = '';
    var rows = [];
    var operator = name + ' | ' + sender;
    
    var TYPE_IN = 'IN';
    var TYPE_OUT = 'OUT';
    var TYPE_SO = 'SO';
    
    // hitungFisik[lokasi][sku] = qty
    var hitungFisik = {};
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      
      var upper = line.toUpperCase();
      
      if (upper.indexOf(' IN') > -1 || upper.indexOf('#IN') === 0) {
        currentType = TYPE_IN;
        currentDeskripsi = line.replace(/^#[A-Z0-9_\s]*IN\b/i, '').trim() || 'IN';
        continue;
      }
      if (upper.indexOf(' OUT') > -1 || upper.indexOf('#OUT') === 0) {
        currentType = TYPE_OUT;
        currentDeskripsi = line.replace(/^#[A-Z0-9_\s]*OUT\b/i, '').trim() || 'OUT';
        continue;
      }
      
      if (upper.indexOf('#LOK') === 0) {
        currentLokasi = line.replace(/#LOK/i, '').trim();
        continue;
      }
      
      if (upper.indexOf('#KET') === 0) {
        currentDeskripsi = line.replace(/^#KET/i, '').trim();
        continue;
      }
      
      if (currentLokasi) {
        var typeToUse = currentType === '' ? TYPE_SO : currentType;
        var deskripsiToUse = currentDeskripsi !== '' ? currentDeskripsi : (currentType === '' ? 'Stock Opname WA' : currentType);
        var area = getArea(currentLokasi);
        var sku = upper; // Baris SKU
        
        rows.push({
          sku: sku,
          lokasi: currentLokasi,
          type: typeToUse,
          keterangan: deskripsiToUse,
          area: area
        });
        
        if (typeToUse === TYPE_SO) {
          if (!hitungFisik[currentLokasi]) hitungFisik[currentLokasi] = {};
          hitungFisik[currentLokasi][sku] = (hitungFisik[currentLokasi][sku] || 0) + 1;
        }
      }
    }
    
    if (rows.length === 0) {
      return jsonResponse({ success: true, message: 'No valid data to process. Wajib ada baris #LOK.' });
    }
    
    var invoice = generateInvoice();
    var logEntries = [];
    
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var meta = cariMetaProdukBySkuSupabase(r.sku);
      var nama_produk = meta ? meta.nama_produk : (r.sku === 'KOLI' ? 'Koli Kargo' : 'Produk Baru / Unknown');
      var size = meta ? (meta.size || '-') : '-';
      
      logEntries.push({
        type: r.type,
        invoice: invoice,
        sku: r.sku,
        nama_produk: nama_produk,
        size: size,
        area: r.area,
        lokasi: r.lokasi,
        qty: 1,
        operator: operator,
        keterangan: r.keterangan
      });
    }
    
    // 1. TULIS KE log_produk SUPABASE
    if (logEntries.length > 0) {
      try {
        supabaseApiFetch('log_produk', 'POST', logEntries);
      } catch(err) {
        Logger.log('Supabase POST log_produk error: ' + err.toString());
      }
    }
    
    // 2. TULIS KE stock_opname_queue SUPABASE (Jika SO)
    var soKeys = Object.keys(hitungFisik);
    if (soKeys.length > 0) {
      var sessionId = 'SO-' + new Date().getTime();
      var soEntries = [];
      
      for (var l = 0; l < soKeys.length; l++) {
        var loka = soKeys[l];
        for (var fSku in hitungFisik[loka]) {
          var qty_fisik = hitungFisik[loka][fSku];
          var meta2 = cariMetaProdukBySkuSupabase(fSku);
          var nama = meta2 ? meta2.nama_produk : fSku;
          var sz = meta2 ? (meta2.size || '-') : '-';
          
          soEntries.push({
            sesi_id: sessionId,
            sku: fSku,
            nama_produk: nama,
            size: sz,
            lokasi: loka,
            area: getArea(loka),
            qty_sistem: 0,
            qty_fisik: qty_fisik,
            selisih: qty_fisik,
            status: 'PENDING',
            jenis: 'Opname WA',
            operator: operator,
            invoice: invoice
          });
        }
      }
      
      var validSoEntries = [];
      for (var p = 0; p < soEntries.length; p++) {
         var curSO = soEntries[p];
         try {
           var encSku = encodeURIComponent(curSO.sku);
           var encLok = encodeURIComponent(curSO.lokasi);
           var encArea = encodeURIComponent(curSO.area);
           var resStok = supabaseApiFetch('stok_real_fisik?sku=eq.' + encSku + '&lokasi=eq.' + encLok + '&area=eq.' + encArea + '&select=sisa_stok', 'GET');
           
           if (resStok && resStok.length > 0) {
              curSO.qty_sistem = resStok[0].sisa_stok || 0;
              curSO.selisih = curSO.qty_fisik - curSO.qty_sistem;
           }
         } catch(e) {}
         
         if (curSO.selisih !== 0) {
            validSoEntries.push(curSO);
         }
      }

      if (validSoEntries.length > 0) {
          try {
            supabaseApiFetch('stock_opname_queue', 'POST', validSoEntries);
          } catch(e) {
            Logger.log('Supabase POST SO error: ' + e.toString());
          }
      }
    }
    
    return jsonResponse({ success: true, message: 'Processed WA scan successfully.', invoice: invoice });
    
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

function cariMetaProdukBySkuSupabase(sku) {
  try {
    var skuEncoded = encodeURIComponent(sku);
    var result = supabaseApiFetch('master_produk?sku=eq.' + skuEncoded + '&select=sku,nama_produk,size', 'GET');
    if (result && result.length > 0) {
      return result[0];
    }
  } catch (e) {
    Logger.log('Error cariMetaProdukBySkuSupabase: ' + e.message);
  }
  return null;
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