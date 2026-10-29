/**
 * WMS PRODUKSI GOOGLE SPREADSHEET SYNC (1 SURAT JALAN = 1 SHEET & MASTER MATRIX)
 * ================================================================================================
 * Spreadsheet ID : 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 * Script ID      : 1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb
 */

var TARGET_PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';

/**
 * Konversi nomor kolom (1-based) menjadi huruf kolom Excel/Google Sheets (1 -> A, 27 -> AA)
 */
function colToLetter(col) {
  var temp, letter = '';
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

/**
 * Entry point Web App untuk menerima request push/pull dari WMS
 */
function doPost(e) {
  try {
    if (!e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var payload = {};
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

    var result = handlePushPenerimaanProduksi(payload);

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.action === 'fetch_qty_nota' || e.parameter.action === 'getQtyNota')) {
    try {
      var ssId = e.parameter.spreadsheetId || TARGET_PRODUKSI_SPREADSHEET_ID;
      var ss = SpreadsheetApp.openById(ssId);
      var resNota = handleFetchQtyNota(ss, e.parameter);
      return ContentService.createTextOutput(JSON.stringify(resNota))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (errNota) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: errNota.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (e && e.parameter && (e.parameter.action === 'getCCT45' || e.parameter.action === 'searchCode')) {
    try {
      var query = (e.parameter.q || e.parameter.code || '045').trim().toUpperCase();
      var ss = SpreadsheetApp.openById(TARGET_PRODUKSI_SPREADSHEET_ID);
      var sheets = ss.getSheets();
      var found = [];
      for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        var name = s.getName();
        var data = s.getDataRange().getValues();
        var formulas = s.getDataRange().getFormulas();
        var headers = data.length > 1 ? data[1] : [];
        for (var r = 0; r < data.length; r++) {
          var rowStr = JSON.stringify(data[r]).toUpperCase();
          if (rowStr.indexOf(query) !== -1) {
            found.push({
              sheet: name,
              row: r + 1,
              headers: headers,
              data: data[r],
              formulas: formulas[r]
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, query: query, found: found }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    message: 'WMS Produksi Google Sheet Sync Gateway is Active (Supports Qty Nota, Selisih Formula, 1 Tanggal = 1 Sheet & Master Matrix)',
    spreadsheetId: TARGET_PRODUKSI_SPREADSHEET_ID
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handler Utama Push & Sync Penerimaan Produksi
 */
function handlePushPenerimaanProduksi(data) {
  try {
    var ssId = data.spreadsheetId || TARGET_PRODUKSI_SPREADSHEET_ID;
    var ss;
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (eOpen) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) throw new Error('Tidak dapat membuka Spreadsheet dengan ID: ' + ssId + '. Pastikan script memiliki izin akses.');
    }

    // =========================================================================
    // JIKA ACTION: TARIK / BACA DATA QTY NOTA DARI SHEET (UNTUK FRONTEND & SUPABASE BACKUP)
    // =========================================================================
    if (data.action === 'fetch_qty_nota' || data.action === 'getQtyNota') {
      return handleFetchQtyNota(ss, data);
    }

    // =========================================================================
    // JIKA ACTION: UPDATE DELTA QTY NOTA DARI FRONTEND KE SHEET
    // =========================================================================
    if (data.action === 'update_qty_nota_delta') {
      return updateQtyNotaDelta(ss, data);
    }

    // =========================================================================
    // JIKA ACTION: REFRESH TAB INDEKS DAFTAR TANGGAL (DAFTAR_TANGGAL)
    // =========================================================================
    if (data.action === 'refresh_index' || data.action === 'update_index_daftar_tanggal') {
      return updateIndexDaftarTanggal(ss);
    }

    // =========================================================================
    // JIKA ACTION: UPDATE TARGETED DELTA HITUNG ULANG (SUPER CEPAT ANTI-TIMEOUT)
    // =========================================================================
    if (data.action === 'update_master_recount_delta') {
      return updateMasterRecountDelta(ss, data);
    }

    // =========================================================================
    // JIKA MODE PER SHEET PER TANGGAL (date_sheets atau groupByDate)
    // =========================================================================
    var dateSheets = data.date_sheets || data.dateSheets || [];
    if (dateSheets && dateSheets.length > 0) {
      var pushedDateCount = 0;
      var lastDateSheetId = null;

      for (var d = 0; d < dateSheets.length; d++) {
        var dateSheetObj = dateSheets[d];
        var resDS = writeSingleDateSheet(ss, dateSheetObj, data.activeTab || 'CMT');
        if (resDS.success) {
          pushedDateCount++;
          lastDateSheetId = resDS.sheetId;
        }
      }

      // Perbarui / buat tab indeks ringkasan daftar tanggal "DAFTAR_TANGGAL"
      updateIndexDaftarTanggal(ss);

      return {
        success: true,
        message: 'Sukses push ' + pushedDateCount + ' Sheet Tanggal Penerimaan (1 Tanggal = 1 Tab)!',
        count: pushedDateCount,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit' + (lastDateSheetId ? '#gid=' + lastDateSheetId : '')
      };
    }

    // =========================================================================
    // JIKA MODE 1 SURAT JALAN = 1 SHEET (atau dikirim array surats_jalan)
    // =========================================================================
    var suratsJalan = data.surats_jalan || [];
    if (suratsJalan && suratsJalan.length > 0) {
      var pushedCount = 0;
      var lastSheetId = null;

      for (var s = 0; s < suratsJalan.length; s++) {
        var sjObj = suratsJalan[s];
        var resSJ = writeSingleSuratJalanSheet(ss, sjObj);
        if (resSJ.success) {
          pushedCount++;
          lastSheetId = resSJ.sheetId;
        }
      }

      // Perbarui / buat tab indeks ringkasan daftar surat jalan "DAFTAR_SURAT_JALAN"
      updateIndexDaftarSuratJalan(ss);

      return {
        success: true,
        message: 'Sukses push ' + pushedCount + ' Surat Jalan ke Sheet terpisah (1 SJ = 1 Tab)!',
        count: pushedCount,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit' + (lastSheetId ? '#gid=' + lastSheetId : '')
      };
    }

    // =========================================================================
    // FALLBACK / MODE MATRIKS BLOCKS (Master Produksi atau Single Date Tab)
    // =========================================================================
    var activeTab = data.activeTab || 'CMT';
    var targetSheetName = data.sheetName || ('Master Produksi (' + activeTab + ')');

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }

    var blocks = data.blocks || [];
    var items = data.items || [];
    var isCMT = activeTab === 'CMT';
    var specificDateStr = data.targetDate || (targetSheetName && /^\d{2}-\d{2}-\d{4}/.test(targetSheetName) ? targetSheetName.split(' ')[0] : null);

    if ((!blocks || blocks.length === 0) && items.length > 0) {
      blocks = buildBlocksFromItemsGAS(items, isCMT, specificDateStr);
    }

    if (blocks && blocks.length > 0) {
      var resMatrix = renderProductBlocksMatrix(sheet, blocks, isCMT, specificDateStr);
      
      // Jika yang dipush adalah tab tanggal, otomatis perbarui indeks DAFTAR_TANGGAL
      if (specificDateStr) {
        updateIndexDaftarTanggal(ss);
      }

      return {
        success: true,
        message: 'Sukses menulis ' + blocks.length + ' Master Tabel Kode Produk ke Google Sheet (' + targetSheetName + ')!',
        count: blocks.length,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit#gid=' + resMatrix.sheetId
      };
    }

    return { success: false, message: 'Tidak ada data surat jalan atau blok matriks untuk ditulis.' };
  } catch (err) {
    Logger.log('handlePushPenerimaanProduksi error: ' + err.toString());
    return {
      success: false,
      error: err.toString(),
      message: 'Gagal menulis ke Google Sheet: ' + err.toString()
    };
  }
}

/**
 * Menulis / Meng-update 1 Surat Jalan menjadi 1 Sheet Terpisah (1 SJ = 1 Tab)
 * Format rapi: Info Surat Jalan, Tanggal, Vendor, Tabel Rincian Produk, Foto, Qty, dan Status Re-Count
 */
function writeSingleSuratJalanSheet(ss, sj) {
  try {
    var rawSjNo = String(sj.no_surat_jalan || 'SJ-UNKNOWN').trim();
    // Sanitasi nama sheet: buang karakter yang dilarang Google Sheets (: / ? * [ ])
    var cleanSjName = rawSjNo.replace(/[:\/\?\*\[\]]/g, '_').substring(0, 80);
    var targetSheetName = cleanSjName.indexOf('SJ_') === 0 || cleanSjName.indexOf('SJ-') === 0 
      ? cleanSjName 
      : ('SJ_' + cleanSjName);

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    } else {
      // Bersihkan tab jika melakukan re-push agar tidak menumpuk
      sheet.clearContents();
      sheet.clearFormats();
    }

    var items = sj.items || [];
    var totalPcs = 0;
    for (var i = 0; i < items.length; i++) {
      totalPcs += Number(items[i].qty) || 0;
    }

    // 1. KOP SURAT JALAN
    var kopVals = [
      ['SURAT JALAN PENERIMAAN PRODUKSI', '', '', '', '', '', '', ''],
      ['No. Surat Jalan:', rawSjNo, '', 'Tanggal Kedatangan:', sj.tanggal || '', '', 'Status:', sj.is_recount ? 'HASIL HITUNG ULANG (RE-COUNT)' : 'PENERIMAAN AKTUAL'],
      ['Kategori:', sj.kategori || 'Lokal CMT', '', 'UP / Vendor:', sj.up_vendor || sj.keterangan || '-', '', 'Total Qty:', totalPcs + ' pcs'],
      ['Petugas / Operator:', sj.operator || 'Gudang Inbound', '', 'Waktu Push:', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') + ' WIB', '', '', '']
    ];
    sheet.getRange(1, 1, 4, 8).setValues(kopVals);

    // Styling KOP
    sheet.getRange(1, 1, 1, 8).merge();
    sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 35);

    var metaRange = sheet.getRange(2, 1, 3, 8);
    metaRange.setFontSize(9.5).setBackground('#F8FAFC');
    sheet.getRange('A2').setFontWeight('bold');
    sheet.getRange('A3').setFontWeight('bold');
    sheet.getRange('A4').setFontWeight('bold');
    sheet.getRange('D2').setFontWeight('bold');
    sheet.getRange('D3').setFontWeight('bold');
    sheet.getRange('D4').setFontWeight('bold');
    sheet.getRange('G2').setFontWeight('bold');
    sheet.getRange('G3').setFontWeight('bold');
    sheet.getRange('B2').setFontWeight('bold').setFontColor('#BE123C');
    sheet.getRange('H3').setFontWeight('bold').setFontColor('#0369A1');
    metaRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

    // 2. HEADER TABEL ITEM
    var headerRowIndex = 6;
    var tableHeaders = ['NO', 'FOTO', 'KODE PRODUKSI', 'NAMA PRODUK', 'WARNA', 'SIZE', 'QTY (PCS)', 'CATATAN / KETERANGAN'];
    sheet.getRange(headerRowIndex, 1, 1, tableHeaders.length).setValues([tableHeaders]);
    var tableHeaderRange = sheet.getRange(headerRowIndex, 1, 1, tableHeaders.length);
    tableHeaderRange.setBackground('#BE123C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(headerRowIndex, 28);

    // 3. ROWS ISI DATA ITEM
    var currentRow = 7;
    for (var itIdx = 0; itIdx < items.length; itIdx++) {
      var item = items[itIdx];
      var rowVals = [
        (itIdx + 1),
        '',
        item.kode_produksi || '',
        item.nama_produk || '',
        item.warna || '',
        item.size || '',
        Number(item.qty) || 0,
        item.keterangan || item.catatan || ''
      ];
      sheet.getRange(currentRow, 1, 1, rowVals.length).setValues([rowVals]);

      // Tampilkan Foto Gambar jika ada URL
      var rawPhoto = String(item.foto_url || '').trim();
      if (rawPhoto && (rawPhoto.indexOf('http://') === 0 || rawPhoto.indexOf('https://') === 0)) {
        sheet.getRange(currentRow, 2).setFormula('=IMAGE("' + rawPhoto + '", 1)');
      }

      sheet.setRowHeight(currentRow, 48);
      currentRow++;
    }

    var lastDataRow = currentRow - 1;
    if (lastDataRow >= 7) {
      var dataTableRange = sheet.getRange(7, 1, (lastDataRow - 7 + 1), tableHeaders.length);
      dataTableRange.setFontSize(9.5).setVerticalAlignment('middle');
      dataTableRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(7, 1, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('center'); // NO
      sheet.getRange(7, 2, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('center'); // FOTO
      sheet.getRange(7, 3, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('center').setFontWeight('bold').setFontFamily('monospace'); // KODE
      sheet.getRange(7, 4, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('left');   // NAMA
      sheet.getRange(7, 5, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('left').setFontWeight('bold');   // WARNA
      sheet.getRange(7, 6, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('center').setFontWeight('bold'); // SIZE
      sheet.getRange(7, 7, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#0369A1').setBackground('#F0F9FF'); // QTY
      sheet.getRange(7, 8, (lastDataRow - 7 + 1), 1).setHorizontalAlignment('left');   // CATATAN

      // Format Text vs Number
      sheet.getRange(7, 1, (lastDataRow - 7 + 1), 6).setNumberFormat('@');
      sheet.getRange(7, 7, (lastDataRow - 7 + 1), 1).setNumberFormat('0');
      sheet.getRange(7, 8, (lastDataRow - 7 + 1), 1).setNumberFormat('@');
    }

    // 4. FOOTER TOTAL
    var totalRowIndex = currentRow;
    var footerVals = ['TOTAL KESELURUHAN', '', '', '', '', '', totalPcs, items.length + ' Baris Varian'];
    sheet.getRange(totalRowIndex, 1, 1, footerVals.length).setValues([footerVals]);
    sheet.getRange(totalRowIndex, 1, 1, 6).merge();
    var footerRange = sheet.getRange(totalRowIndex, 1, 1, footerVals.length);
    footerRange.setFontSize(10).setFontWeight('bold').setBackground('#E2E8F0').setFontColor('#0F172A').setVerticalAlignment('middle');
    sheet.getRange(totalRowIndex, 1).setHorizontalAlignment('right');
    sheet.getRange(totalRowIndex, 7).setHorizontalAlignment('center').setFontColor('#BE123C').setBackground('#FFE4E6');
    sheet.getRange(totalRowIndex, 8).setHorizontalAlignment('left').setFontColor('#475569');
    footerRange.setBorder(true, true, true, true, true, true, '#94A3B8', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(totalRowIndex, 30);

    // 5. Lebar Kolom
    sheet.setColumnWidth(1, 45);  // NO
    sheet.setColumnWidth(2, 60);  // FOTO
    sheet.setColumnWidth(3, 110); // KODE
    sheet.setColumnWidth(4, 200); // NAMA
    sheet.setColumnWidth(5, 120); // WARNA
    sheet.setColumnWidth(6, 70);  // SIZE
    sheet.setColumnWidth(7, 95);  // QTY
    sheet.setColumnWidth(8, 250); // CATATAN

    return {
      success: true,
      sheetId: sheet.getSheetId(),
      sheetName: targetSheetName
    };
  } catch (err) {
    Logger.log('writeSingleSuratJalanSheet error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Buat atau update tab ringkasan indeks DAFTAR_SURAT_JALAN
 */
function updateIndexDaftarSuratJalan(ss) {
  try {
    var indexSheetName = 'DAFTAR_SURAT_JALAN';
    var sheet = ss.getSheetByName(indexSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(indexSheetName, 0); // Tempatkan di tab paling depan
    }

    var allSheets = ss.getSheets();
    var rows = [];
    var no = 1;

    for (var i = 0; i < allSheets.length; i++) {
      var s = allSheets[i];
      var name = s.getName();
      if (name.indexOf('SJ_') === 0 || name.indexOf('SJ-') === 0) {
        var tgl = '';
        var vendor = '';
        var totalQty = '';
        try {
          tgl = s.getRange('E2').getValue();
          vendor = s.getRange('E3').getValue();
          totalQty = s.getRange('H3').getValue();
        } catch (e) {}

        rows.push([
          no++,
          name,
          tgl,
          vendor,
          totalQty,
          '=HYPERLINK("#gid=' + s.getSheetId() + '", "Buka Tab ' + name + '")'
        ]);
      }
    }

    sheet.clearContents();
    sheet.clearFormats();

    // Judul Indeks
    sheet.getRange('A1:F1').merge();
    sheet.getRange('A1').setValue('DAFTAR INDEKS SURAT JALAN KEDATANGAN PRODUKSI')
      .setFontSize(13).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 35);

    var headers = ['NO', 'SURAT JALAN (TAB)', 'TANGGAL KEDATANGAN', 'VENDOR / CMT', 'TOTAL PCS', 'LINK TAB'];
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(2, 1, 1, headers.length);
    headerRange.setBackground('#BE123C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9.5).setHorizontalAlignment('center');
    sheet.setRowHeight(2, 25);

    if (rows.length > 0) {
      sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
      var dataRange = sheet.getRange(3, 1, rows.length, headers.length);
      dataRange.setFontSize(9.5).setVerticalAlignment('middle');
      dataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(3, 1, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(3, 2, rows.length, 1).setFontWeight('bold');
      sheet.getRange(3, 5, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#0369A1');
      sheet.getRange(3, 6, rows.length, 1).setHorizontalAlignment('center').setFontColor('#2563EB');
    }

    sheet.setColumnWidth(1, 45);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 160);
  } catch (err) {
    Logger.log('updateIndexDaftarSuratJalan error: ' + err.toString());
  }
}

function formatDateHeader(dateStr) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return d.getDate() + ' ' + monthNames[d.getMonth()];
  } catch (e) {
    return dateStr;
  }
}

/**
 * Format tanggal untuk nama Tab Sheet Google Spreadsheet
 * Contoh: "2026-09-26" -> "26-09-2026 (CMT)" atau "26-09-2026"
 */
function formatDateTabName(dateStr, kategori) {
  if (!dateStr) return 'TANGGAL_UNKNOWN';
  var cleanDate = String(dateStr).trim();
  try {
    var d = new Date(cleanDate);
    if (!isNaN(d.getTime())) {
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var yyyy = d.getFullYear();
      cleanDate = dd + '-' + mm + '-' + yyyy;
    }
  } catch (e) {}
  
  cleanDate = cleanDate.replace(/[:\/\?\*\[\]]/g, '-').substring(0, 50);
  if (kategori) {
    var tag = (kategori === 'Kargo' ? 'Kargo' : 'CMT');
    return cleanDate + ' (' + tag + ')';
  }
  return cleanDate;
}

/**
 * Format tanggal lengkap bahasa Indonesia: "2026-09-26" -> "26 September 2026"
 */
function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return d.getDate() + ' ' + bulanIndo[d.getMonth()] + ' ' + d.getFullYear();
  } catch (e) {
    return dateStr;
  }
}

/**
 * Helper untuk membangun struktur Blok Matriks dari flat items di dalam GAS
 */
function buildBlocksFromItemsGAS(items, isCMT, specificDateStr) {
  var codeMap = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var code = String(it.kode_produksi || 'TANPA_KODE').trim();
    if (!codeMap[code]) codeMap[code] = [];
    codeMap[code].push(it);
  }

  var blocks = [];
  var no = 1;

  for (var codeKey in codeMap) {
    var codeItems = codeMap[codeKey];
    var first = codeItems[0];
    var productName = first.nama_produk || '';
    var upVendor = first.up_vendor || first.keterangan || (isCMT ? 'CMT' : 'KARGO');
    var photoUrl = first.foto_url || '';
    var catatan = first.catatan || '';
    var qtyNota = (first.qty_nota !== undefined && first.qty_nota !== null && first.qty_nota !== '') ? Number(first.qty_nota) : undefined;

    var dateSet = {};
    for (var d = 0; d < codeItems.length; d++) {
      if (codeItems[d].tanggal_penerimaan) {
        dateSet[codeItems[d].tanggal_penerimaan] = true;
      }
      if (qtyNota === undefined && codeItems[d].qty_nota !== undefined && codeItems[d].qty_nota !== null && codeItems[d].qty_nota !== '') {
        qtyNota = Number(codeItems[d].qty_nota);
      }
    }
    var dateSlots = specificDateStr ? [specificDateStr] : Object.keys(dateSet).sort();

    var colorMap = {};
    for (var c = 0; c < codeItems.length; c++) {
      var col = String(codeItems[c].warna || 'DEFAULT').trim();
      if (!colorMap[col]) colorMap[col] = [];
      colorMap[col].push(codeItems[c]);
    }

    var colorGroups = [];
    var blockTotalDatang = 0;

    for (var colKey in colorMap) {
      var colItems = colorMap[colKey];
      var sizeMap = {};
      for (var s = 0; s < colItems.length; s++) {
        var sz = String(colItems[s].size || 'ALL SIZE').trim();
        if (!sizeMap[sz]) sizeMap[sz] = [];
        sizeMap[sz].push(colItems[s]);
      }

      var sizes = [];
      var cgTotal = 0;

      for (var szKey in sizeMap) {
        var szItems = sizeMap[szKey];
        var qtyByDate = {};
        var szTotal = 0;
        for (var q = 0; q < szItems.length; q++) {
          var tgl = szItems[q].tanggal_penerimaan || '';
          var qtyVal = Number(szItems[q].qty) || 0;
          qtyByDate[tgl] = (qtyByDate[tgl] || 0) + qtyVal;
          szTotal += qtyVal;
        }

        sizes.push({
          size: szKey,
          qtyByDate: qtyByDate,
          totalSizeQty: szTotal
        });
        cgTotal += szTotal;
      }

      colorGroups.push({
        color: colKey,
        sizes: sizes,
        totalColorQty: cgTotal
      });
      blockTotalDatang += cgTotal;
    }

    blocks.push({
      no: no++,
      code: codeKey,
      productName: productName,
      upVendor: upVendor,
      photoUrl: photoUrl,
      catatan: catatan,
      qtyNota: qtyNota,
      dateSlots: dateSlots,
      colorGroups: colorGroups,
      totalDatang: blockTotalDatang,
      totalNet: blockTotalDatang
    });
  }

  return blocks;
}

/**
 * Membaca data lama (Qty Nota & Hitung Ulang) dari sebuah Sheet sebelum di-clear / untuk sinkronisasi
 */
function scanExistingSheetBlocksData(sheet) {
  var oldNotaMap = {}; // { [CODE]: { qtyNota, totalDiterima, selisihNota, rowNum, colQtyNota } }
  var oldDataMap = {}; // { [CODE_COLOR_SIZE]: { fisik, selisih, status, log } }
  var scanError = '';

  try {
    var lastRow = sheet.getLastRow();
    var lastCol = Math.min(50, Math.max(1, sheet.getLastColumn()));
    if (lastRow < 2 || lastCol < 7) {
      return { oldNotaMap: oldNotaMap, oldDataMap: oldDataMap };
    }

    var allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var colTotalDatang = -1;
    var colQtyNota = -1;
    var colSelisihNota = -1;
    var colFisik = -1;
    var colSelisihFisik = -1;
    var colStatus = -1;
    var colLog = -1;

    var curCode = '';
    var curColor = '';

    for (var r = 0; r < allValues.length; r++) {
      var rowObj = allValues[r];
      var c0 = String(rowObj[0] || '').trim().toUpperCase();
      var c1 = String(rowObj[1] || '').replace(/^'+/, '').trim().toUpperCase();
      var c5 = String(rowObj[5] || '').trim().toUpperCase();
      var c6 = String(rowObj[6] || '').replace(/^'+/, '').trim().toUpperCase();

      // Deteksi Baris Header Blok
      if (c0 === 'NO' && c1 === 'CODE') {
        colTotalDatang = -1;
        colQtyNota = -1;
        colSelisihNota = -1;
        colFisik = -1;
        colSelisihFisik = -1;
        colStatus = -1;
        colLog = -1;
        curCode = '';
        curColor = '';

        for (var c = 0; c < rowObj.length; c++) {
          var hText = String(rowObj[c] || '').trim().toUpperCase();
          if (hText.indexOf('TOTAL DATANG') !== -1 || hText.indexOf('TOTAL DITERIMA') !== -1) {
            colTotalDatang = c;
          } else if (hText.indexOf('QTY NOTA') !== -1 || hText === 'NOTA') {
            colQtyNota = c;
          } else if (hText.indexOf('SELISIH NOTA') !== -1 || (hText === 'SELISIH' && colQtyNota !== -1 && colFisik === -1)) {
            colSelisihNota = c;
          } else if (hText.indexOf('SELISIH') !== -1 && (hText.indexOf('FISIK') !== -1 || hText.indexOf('HITUNG') !== -1 || colFisik !== -1)) {
            colSelisihFisik = c;
          } else if (hText.indexOf('FISIK') !== -1 || hText.indexOf('QTY HITUNG') !== -1) {
            colFisik = c;
          } else if (hText.indexOf('STATUS AUDIT') !== -1 || hText === 'STATUS') {
            colStatus = c;
          } else if (hText.indexOf('LOG') !== -1 || hText.indexOf('RIWAYAT') !== -1) {
            colLog = c;
          }
        }
        continue;
      }

      if (c0.indexOf('CATATAN:') === 0 || c1.indexOf('CATATAN:') === 0) {
        continue;
      }

      if (c1 && c1 !== 'CODE' && c1 !== '-') {
        curCode = c1;
        // Baca Qty Nota pada baris pertama blok kode ini
        if (colQtyNota !== -1) {
          var rawNota = rowObj[colQtyNota];
          var rawTotal = colTotalDatang !== -1 ? (Number(rowObj[colTotalDatang]) || 0) : 0;
          if (rawNota !== '' && rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota))) {
            var numNota = Number(rawNota);
            oldNotaMap[curCode] = {
              qtyNota: numNota,
              totalDiterima: rawTotal,
              selisihNota: rawTotal - numNota,
              rowNum: r + 1,
              colQtyNota: colQtyNota + 1,
              colTotalDatang: colTotalDatang + 1,
              colSelisihNota: colSelisihNota + 1
            };
          } else if (!oldNotaMap[curCode]) {
            oldNotaMap[curCode] = {
              qtyNota: null,
              totalDiterima: rawTotal,
              selisihNota: null,
              rowNum: r + 1,
              colQtyNota: colQtyNota + 1,
              colTotalDatang: colTotalDatang + 1,
              colSelisihNota: colSelisihNota + 1
            };
          }
        }
      }

      if (c5 && c5 !== 'COLOR' && c5 !== '-') {
        curColor = c5;
      }

      if (curCode && curColor && c6 && c6 !== 'SIZE' && c6 !== '-') {
        if (colFisik !== -1) {
          var key = curCode + '_' + curColor + '_' + c6;
          var rFisik = rowObj[colFisik];
          var rLog = colLog !== -1 ? rowObj[colLog] : '';
          if ((rFisik !== '' && rFisik !== null && rFisik !== undefined) || rLog) {
            oldDataMap[key] = {
              fisik: rFisik !== '' && rFisik !== null && rFisik !== undefined ? Number(rFisik) : '',
              selisih: colSelisihFisik !== -1 ? rowObj[colSelisihFisik] : '',
              status: colStatus !== -1 ? rowObj[colStatus] : '',
              log: rLog
            };
          }
        }
      }
    }
  } catch (eScan) {
    Logger.log('scanExistingSheetBlocksData error: ' + eScan);
    scanError = String(eScan);
  }

  return {
    oldNotaMap: oldNotaMap,
    oldDataMap: oldDataMap,
    scanError: scanError
  };
}

/**
 * Merender tabel Produk Berdasarkan Blok Matriks (Format Resmi Master & Tanggal Produksi)
 * Dilengkapi kolom QTY NOTA (Diisi Buyer) & Formula Otomatis SELISIH (= Total Diterima - Qty Nota)
 */
function renderProductBlocksMatrix(sheet, blocks, isCMT, specificDateStr) {
  var isSpecificDate = !!specificDateStr;
  var existingScan = scanExistingSheetBlocksData(sheet);
  var oldNotaMap = existingScan.oldNotaMap || {};
  var oldDataMap = existingScan.oldDataMap || {};

  // Pengaman: jika pembacaan sheet lama gagal, batalkan render agar Qty Nota Buyer tidak hilang
  if (existingScan.scanError) {
    throw new Error('Gagal membaca Qty Nota yang ada di sheet, push dibatalkan agar data Buyer aman: ' + existingScan.scanError);
  }

  sheet.clearContents();
  sheet.clearFormats();
  try {
    sheet.clearConditionalFormatRules();
  } catch (eCfClear) {}
  try {
    sheet.getRange(1, 1, Math.max(100, sheet.getMaxRows()), Math.max(25, sheet.getMaxColumns())).setNumberFormat('@');
  } catch (eFmt) {}

  var currentRow = 1;

  // JIKA TAB TANGGAL: TAMPILKAN BANNER NAVIGASI CEPAT KEMBALI KE "DAFTAR_TANGGAL"
  if (isSpecificDate) {
    try {
      var ss = sheet.getParent();
      var indexSheet = ss.getSheetByName('DAFTAR_TANGGAL');
      var indexGid = indexSheet ? indexSheet.getSheetId() : null;

      var totalPcsAll = 0;
      for (var tb = 0; tb < blocks.length; tb++) {
        totalPcsAll += (Number(blocks[tb].totalNet) || Number(blocks[tb].totalDatang) || 0);
      }

      // Tombol Navigasi Kembali ke DAFTAR_TANGGAL
      if (indexGid !== null) {
        sheet.getRange(1, 1, 1, 3).merge()
          .setFormula('=HYPERLINK("#gid=' + indexGid + '", "🔙 KEMBALI KE DAFTAR TANGGAL (KLIK DISINI)")')
          .setBackground('#0F172A').setFontColor('#38BDF8').setFontWeight('bold').setFontSize(10)
          .setHorizontalAlignment('center').setVerticalAlignment('middle');
      } else {
        sheet.getRange(1, 1, 1, 3).merge()
          .setValue('📋 TAB TANGGAL PENERIMAAN')
          .setBackground('#0F172A').setFontColor('#38BDF8').setFontWeight('bold').setFontSize(10)
          .setHorizontalAlignment('center').setVerticalAlignment('middle');
      }

      var infoText = '📅 Tanggal: ' + specificDateStr + '  |  🏷️ Kategori: ' + (isCMT ? 'Lokal CMT' : 'Kargo') + '  |  📦 Total: ' + blocks.length + ' Model  |  🔢 Datang: ' + totalPcsAll + ' pcs';
      sheet.getRange(1, 4, 1, 17).merge().setValue(infoText)
        .setBackground('#1E293B').setFontColor('#F8FAFC').setFontWeight('bold').setFontSize(9.5)
        .setHorizontalAlignment('left').setVerticalAlignment('middle');

      sheet.setRowHeight(1, 32);
      sheet.setRowHeight(2, 6); // Jarak pemisah
      currentRow = 3;
    } catch (eNav) {
      Logger.log('Error setup top navigation banner: ' + eNav);
      currentRow = 1;
    }
  }

  var selisihRangesForCF = [];
  var maxTotalColsUsed = 20;

  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    var cleanBlockCode = String(block.code || block.productCode || '').replace(/^'+/, '').trim().toUpperCase();
    var headerRow1Index = currentRow;
    var headerRow2Index = currentRow + 1;

    // Jika mode tanggal spesifik (1 Tanggal = 1 Tab)
    var dateSlots = isSpecificDate ? [specificDateStr] : (block.dateSlots || []);
    var returSlots = isCMT ? (isSpecificDate ? (block.returDateSlots && block.returDateSlots.indexOf(specificDateStr) > -1 ? [specificDateStr] : []) : (block.returDateSlots || [])) : [];

    var numDateCols = Math.max(10, dateSlots.length);
    var numReturCols = isCMT ? (isSpecificDate ? Math.max(0, returSlots.length) : Math.max(5, returSlots.length)) : 0;

    // Kolom Indeks (1-based) setelah kolom Tanggal & Retur:
    // 1. TOTAL DATANG (NET)
    // 2. QTY NOTA (Diisi Buyer)
    // 3. SELISIH (= Total Datang - Qty Nota)
    // + Jika Master Sheet (!isSpecificDate): FISIK HASIL HITUNG, SELISIH FISIK, STATUS AUDIT, LOG HITUNG ULANG
    var colTotalDatang = 8 + numDateCols + (isCMT && numReturCols > 0 ? numReturCols : 0);
    var colQtyNota = colTotalDatang + 1;
    var colSelisihNota = colTotalDatang + 2;
    var totalCols = colSelisihNota + (!isSpecificDate ? 4 : 0);
    if (totalCols > maxTotalColsUsed) maxTotalColsUsed = totalCols;

    // Header Baris 1
    var row1Vals = ['NO', 'CODE', 'PRODUCT NAME', 'UP', 'PHOTO', 'COLOR', 'SIZE'];
    for (var d = 0; d < numDateCols; d++) {
      row1Vals.push(d === 0 ? 'QTY BARANG DATANG' : '');
    }
    if (isCMT && numReturCols > 0) {
      for (var r = 0; r < numReturCols; r++) {
        row1Vals.push(r === 0 ? 'RETUR PRODUKSI' : '');
      }
    }
    row1Vals.push('TOTAL DATANG (NET)');
    row1Vals.push('QTY NOTA');
    row1Vals.push('SELISIH');
    if (!isSpecificDate) {
      row1Vals.push('QTY HITUNG ULANG');
      row1Vals.push('SELISIH HITUNG ULANG');
      row1Vals.push('STATUS AUDIT');
      row1Vals.push('LOG HITUNG ULANG');
    }

    // Header Baris 2
    var row2Vals = ['', '', '', '', '', '', ''];
    for (var d1 = 0; d1 < numDateCols; d1++) {
      var dateLabel = dateSlots[d1] ? formatDateHeader(dateSlots[d1]) : '-';
      row2Vals.push(dateLabel ? ("'" + dateLabel) : '-');
    }
    if (isCMT && numReturCols > 0) {
      for (var r1 = 0; r1 < numReturCols; r1++) {
        var returLabel = returSlots[r1] ? formatDateHeader(returSlots[r1]) : '-';
        row2Vals.push(returLabel ? ("'" + returLabel) : '-');
      }
    }
    row2Vals.push(''); // TOTAL DATANG (NET)
    row2Vals.push(''); // QTY NOTA
    row2Vals.push(''); // SELISIH
    if (!isSpecificDate) {
      row2Vals.push('');
      row2Vals.push('');
      row2Vals.push('');
      row2Vals.push('');
    }

    sheet.getRange(headerRow1Index, 1, 1, row1Vals.length).setValues([row1Vals]);
    sheet.getRange(headerRow2Index, 1, 1, row2Vals.length).setValues([row2Vals]);
    sheet.getRange(headerRow1Index, 1, 2, totalCols).setNumberFormat('@');

    // Merge Header Kolom 1-7
    sheet.getRange(headerRow1Index, 1, 2, 1).merge(); // NO
    sheet.getRange(headerRow1Index, 2, 2, 1).merge(); // CODE
    sheet.getRange(headerRow1Index, 3, 2, 1).merge(); // PRODUCT NAME
    sheet.getRange(headerRow1Index, 4, 2, 1).merge(); // UP
    sheet.getRange(headerRow1Index, 5, 2, 1).merge(); // PHOTO
    sheet.getRange(headerRow1Index, 6, 2, 1).merge(); // COLOR
    sheet.getRange(headerRow1Index, 7, 2, 1).merge(); // SIZE

    // Merge Header Kolom Tanggal
    sheet.getRange(headerRow1Index, 8, 1, numDateCols).merge();
    var nextColPointer = 8 + numDateCols;
    if (isCMT && numReturCols > 0) {
      sheet.getRange(headerRow1Index, nextColPointer, 1, numReturCols).merge();
      nextColPointer += numReturCols;
    }
    sheet.getRange(headerRow1Index, colTotalDatang, 2, 1).merge(); // TOTAL DATANG (NET)
    sheet.getRange(headerRow1Index, colQtyNota, 2, 1).merge(); // QTY NOTA
    sheet.getRange(headerRow1Index, colSelisihNota, 2, 1).merge(); // SELISIH

    if (!isSpecificDate) {
      sheet.getRange(headerRow1Index, colSelisihNota + 1, 2, 1).merge(); // FISIK
      sheet.getRange(headerRow1Index, colSelisihNota + 2, 2, 1).merge(); // SELISIH FISIK
      sheet.getRange(headerRow1Index, colSelisihNota + 3, 2, 1).merge(); // STATUS
      sheet.getRange(headerRow1Index, colSelisihNota + 4, 2, 1).merge(); // LOG
    }

    var headerRange = sheet.getRange(headerRow1Index, 1, 2, totalCols);
    headerRange.setBackground('#FCE8E6');
    headerRange.setFontColor('#0F172A');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(9);
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setWrap(true);
    sheet.setRowHeight(headerRow1Index, 30);
    sheet.setRowHeight(headerRow2Index, 30);
    headerRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

    // Highlight Header QTY NOTA (Kuning Emas agar Buyer langsung melihat kolom input) & SELISIH
    sheet.getRange(headerRow1Index, colQtyNota, 2, 1).setBackground('#FEF3C7').setFontColor('#92400E');
    sheet.getRange(headerRow1Index, colSelisihNota, 2, 1).setBackground('#E0F2FE').setFontColor('#075985');

    currentRow += 2;

    var startDataRowIndex = currentRow;
    var colorGroups = block.colorGroups || [];
    var totalSubRowsInBlock = 0;
    for (var cgIdx = 0; cgIdx < colorGroups.length; cgIdx++) {
      totalSubRowsInBlock += Math.max(1, (colorGroups[cgIdx].sizes || []).length);
    }
    var targetBlockHeightPx = Math.max(320, totalSubRowsInBlock * 32);
    var calculatedRowHeight = Math.max(32, Math.floor(targetBlockHeightPx / Math.max(1, totalSubRowsInBlock)));

    // Hitung total datang net keseluruhan blok
    var computedBlockNet = 0;
    for (var cgSumIdx = 0; cgSumIdx < colorGroups.length; cgSumIdx++) {
      var cgSizes = colorGroups[cgSumIdx].sizes || [];
      for (var szSumIdx = 0; szSumIdx < cgSizes.length; szSumIdx++) {
        var szObj = cgSizes[szSumIdx];
        var sDatang = 0;
        for (var dSum = 0; dSum < numDateCols; dSum++) {
          var dk = dateSlots[dSum];
          if (dk && szObj.qtyByDate && szObj.qtyByDate[dk] !== undefined && szObj.qtyByDate[dk] !== '') {
            sDatang += Number(szObj.qtyByDate[dk]) || 0;
          }
        }
        var sRetur = 0;
        if (isCMT && numReturCols > 0) {
          for (var rSum = 0; rSum < numReturCols; rSum++) {
            var rk = returSlots[rSum];
            if (rk && szObj.qtyReturByDate && szObj.qtyReturByDate[rk] !== undefined && szObj.qtyReturByDate[rk] !== '') {
              sRetur += Number(szObj.qtyReturByDate[rk]) || 0;
            }
          }
        }
        var sNet = (isSpecificDate && sDatang > 0)
          ? sDatang
          : (isCMT ? Math.max(0, sDatang - sRetur) : (Number(szObj.totalSizeQty) || sDatang));
        computedBlockNet += sNet;
      }
    }
    var finalBlockTotalNet = computedBlockNet > 0 ? computedBlockNet : (Number(block.totalNet) || Number(block.totalDatang) || 0);

    // Tentukan nilai awal QTY NOTA.
    // PRIORITAS: nilai yang sudah diketik Buyer di Sheet (sumber kebenaran) -> block.qtyNota dari WMS/Supabase (fallback) -> kosong.
    // Dengan begitu push/re-push dari aplikasi TIDAK PERNAH menimpa Qty Nota yang diketik manual oleh Buyer.
    var initialQtyNota = '';
    if (oldNotaMap[cleanBlockCode] && oldNotaMap[cleanBlockCode].qtyNota !== null && oldNotaMap[cleanBlockCode].qtyNota !== undefined && oldNotaMap[cleanBlockCode].qtyNota !== '') {
      initialQtyNota = Number(oldNotaMap[cleanBlockCode].qtyNota);
    } else if (block.qtyNota !== undefined && block.qtyNota !== null && block.qtyNota !== '') {
      initialQtyNota = Number(block.qtyNota);
    }

    var isFirstRowWritten = false;

    for (var c = 0; c < colorGroups.length; c++) {
      var cg = colorGroups[c];
      var startColorRowIndex = currentRow;
      var sizes = cg.sizes || [];

      for (var s = 0; s < sizes.length; s++) {
        var sz = sizes[s];
        var dataRowVals = [
          (b + 1),
          "'" + (block.code || block.productCode || ''),
          block.productName || '',
          block.upVendor || '',
          '',
          cg.color || cg.colorName || '',
          "'" + (sz.size || sz.sizeName || '')
        ];

        var rowDatang = 0;
        for (var d2 = 0; d2 < numDateCols; d2++) {
          var dKey = dateSlots[d2];
          var qVal = (dKey && sz.qtyByDate && sz.qtyByDate[dKey] !== undefined && sz.qtyByDate[dKey] !== '')
            ? Number(sz.qtyByDate[dKey])
            : '';
          if (qVal !== '') rowDatang += Number(qVal);
          dataRowVals.push(qVal);
        }

        var rowRetur = 0;
        if (isCMT && numReturCols > 0) {
          for (var r2 = 0; r2 < numReturCols; r2++) {
            var rKey = returSlots[r2];
            var rqVal = (rKey && sz.qtyReturByDate && sz.qtyReturByDate[rKey] !== undefined && sz.qtyReturByDate[rKey] !== '')
              ? Number(sz.qtyReturByDate[rKey])
              : '';
            if (rqVal !== '') rowRetur += Number(rqVal);
            dataRowVals.push(rqVal);
          }
        }

        var rowNet = (isSpecificDate && rowDatang > 0)
          ? rowDatang
          : (isCMT ? Math.max(0, (rowDatang - rowRetur)) : (Number(sz.totalSizeQty) || rowDatang));

        // Pada baris pertama blok, isi Total Datang Blok & Qty Nota Blok (karena sel di-merge per blok)
        if (!isFirstRowWritten) {
          dataRowVals.push(finalBlockTotalNet);
          dataRowVals.push(initialQtyNota);
          dataRowVals.push(''); // Formula SELISIH akan dipasang di bawah
          isFirstRowWritten = true;
        } else {
          dataRowVals.push('');
          dataRowVals.push('');
          dataRowVals.push('');
        }

        if (!isSpecificDate) {
          var lookupKey = cleanBlockCode + '_' + 
                          String(cg.color || cg.colorName || '').trim().toUpperCase() + '_' + 
                          String(sz.size || sz.sizeName || '').trim().toUpperCase();
          var oldRecord = oldDataMap[lookupKey];

          var rQty = (sz.recountQty !== undefined && sz.recountQty !== null && sz.recountQty !== '') 
                      ? Number(sz.recountQty) 
                      : (oldRecord && oldRecord.fisik !== '' ? Number(oldRecord.fisik) : '');
                      
          var rSelisih = rQty !== '' ? (rQty - rowNet) : '';
          var rStatus = rQty !== '' ? (rSelisih === 0 ? 'MATCH' : (rSelisih < 0 ? 'KURANG' : 'LEBIH')) : '';
          var rLog = (sz.recountNotes || sz.recountAuditor || '') || (oldRecord ? oldRecord.log : '');
          
          dataRowVals.push(rQty);
          dataRowVals.push(rSelisih);
          dataRowVals.push(rStatus);
          dataRowVals.push(rLog);
        }

        sheet.getRange(currentRow, 1, 1, dataRowVals.length).setValues([dataRowVals]);
        sheet.getRange(currentRow, 1, 1, 7).setNumberFormat('@');
        sheet.getRange(currentRow, 8, 1, totalCols - 7).setNumberFormat('0');
        // Tinggi baris otomatis: sesuaikan dengan panjang teks Log Hitung Ulang (kolom 260px ≈ 40 karakter/baris)
        var logTextLen = 0;
        if (!isSpecificDate) {
          logTextLen = String(dataRowVals[dataRowVals.length - 1] || '').length;
        }
        var logLines = Math.max(1, Math.ceil(logTextLen / 38));
        var rowHeightByText = logLines * 15 + 8;
        sheet.setRowHeight(currentRow, Math.max(calculatedRowHeight, rowHeightByText));
        currentRow++;
      }

      var endColorRowIndex = currentRow - 1;
      if (endColorRowIndex > startColorRowIndex) {
        sheet.getRange(startColorRowIndex, 6, (endColorRowIndex - startColorRowIndex + 1), 1).merge();
      }
    }

    var endDataRowIndex = currentRow - 1;
    var numBlockRows = endDataRowIndex - startDataRowIndex + 1;
    if (numBlockRows > 0) {
      if (numBlockRows > 1) {
        sheet.getRange(startDataRowIndex, 1, numBlockRows, 1).merge(); // NO
        sheet.getRange(startDataRowIndex, 2, numBlockRows, 1).merge(); // CODE
        sheet.getRange(startDataRowIndex, 3, numBlockRows, 1).merge(); // PRODUCT NAME
        sheet.getRange(startDataRowIndex, 4, numBlockRows, 1).merge(); // UP
        sheet.getRange(startDataRowIndex, 5, numBlockRows, 1).merge(); // PHOTO
        sheet.getRange(startDataRowIndex, colTotalDatang, numBlockRows, 1).merge(); // TOTAL DATANG (NET)
        sheet.getRange(startDataRowIndex, colQtyNota, numBlockRows, 1).merge(); // QTY NOTA
        sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1).merge(); // SELISIH
      }

      var rawPhotoUrl = String(block.photoUrl || '').trim();
      if (rawPhotoUrl && (rawPhotoUrl.indexOf('http://') === 0 || rawPhotoUrl.indexOf('https://') === 0)) {
        sheet.getRange(startDataRowIndex, 5).setFormula('=IMAGE("' + rawPhotoUrl + '", 1)');
      }

      var blockDataRange = sheet.getRange(startDataRowIndex, 1, numBlockRows, totalCols);
      blockDataRange.setVerticalAlignment('middle');
      blockDataRange.setHorizontalAlignment('center');
      blockDataRange.setWrap(true);
      blockDataRange.setFontSize(9.5);
      blockDataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

      sheet.getRange(startDataRowIndex, 1, numBlockRows, 7).setNumberFormat('@');
      sheet.getRange(startDataRowIndex, 8, numBlockRows, totalCols - 7).setNumberFormat('0');

      // Pasang Formula Otomatis TOTAL DATANG (NET) & SELISIH (= Total Diterima - Qty Nota)
      var startDateLetter = colToLetter(8);
      var endDateLetter = colToLetter(8 + numDateCols - 1);
      if (computedBlockNet > 0) {
        if (isCMT && numReturCols > 0) {
          var startRetLetter = colToLetter(8 + numDateCols);
          var endRetLetter = colToLetter(8 + numDateCols + numReturCols - 1);
          sheet.getRange(startDataRowIndex, colTotalDatang).setFormula(
            '=SUM(' + startDateLetter + startDataRowIndex + ':' + endDateLetter + endDataRowIndex + ')-SUM(' + startRetLetter + startDataRowIndex + ':' + endRetLetter + endDataRowIndex + ')'
          );
        } else {
          sheet.getRange(startDataRowIndex, colTotalDatang).setFormula(
            '=SUM(' + startDateLetter + startDataRowIndex + ':' + endDateLetter + endDataRowIndex + ')'
          );
        }
      }

      var totalDatangCellRef = colToLetter(colTotalDatang) + startDataRowIndex;
      var qtyNotaCellRef = colToLetter(colQtyNota) + startDataRowIndex;
      var selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", ' + totalDatangCellRef + '-' + qtyNotaCellRef + ')';
      var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);
      selisihCellRange.setFormula(selisihFormula).setNumberFormat('0').setFontWeight('bold').setFontSize(11);

      // Styling khusus kolom TOTAL DATANG & QTY NOTA
      sheet.getRange(startDataRowIndex, colTotalDatang, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#F8FAFC');
      sheet.getRange(startDataRowIndex, colQtyNota, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#FFFBEB').setFontColor('#92400E');

      selisihRangesForCF.push(sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1));
    }

    // Baris Catatan Kuning jika ada
    var blockCatatan = String(block.catatan || block.keterangan || '').trim();
    if (blockCatatan) {
      var noteRowIndex = currentRow;
      var noteRowVals = ['CATATAN: ' + blockCatatan];
      for (var nc = 1; nc < totalCols; nc++) noteRowVals.push('');
      sheet.getRange(noteRowIndex, 1, 1, noteRowVals.length).setValues([noteRowVals]);
      sheet.getRange(noteRowIndex, 1, 1, totalCols).merge();
      var noteRange = sheet.getRange(noteRowIndex, 1, 1, totalCols);
      noteRange.setFontSize(8.5);
      noteRange.setFontWeight('bold');
      noteRange.setFontColor('#92400E');
      noteRange.setBackground('#FEF3C7');
      noteRange.setVerticalAlignment('middle');
      noteRange.setHorizontalAlignment('left');
      noteRange.setBorder(true, true, true, true, true, true, '#FDE68A', SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(noteRowIndex, 22);
      currentRow++;
    }

    // Pemisah antar blok
    currentRow += 1;
  }

  // Pasang Conditional Formatting Otomatis pada kolom SELISIH:
  // - Selisih < 0 (Kurang): Merah (#FEE2E2 / #991B1B)
  // - Selisih > 0 (Lebih): Biru (#DBEAFE / #1E40AF)
  // - Selisih = 0 (Klop): Hijau (#DCFCE7 / #166534)
  if (selisihRangesForCF.length > 0) {
    try {
      var ruleLess = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setBackground('#FEE2E2')
        .setFontColor('#991B1B')
        .setBold(true)
        .setRanges(selisihRangesForCF)
        .build();
      var ruleGreater = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground('#DBEAFE')
        .setFontColor('#1E40AF')
        .setBold(true)
        .setRanges(selisihRangesForCF)
        .build();
      var ruleEqual = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberEqualTo(0)
        .setBackground('#DCFCE7')
        .setFontColor('#166534')
        .setBold(true)
        .setRanges(selisihRangesForCF)
        .build();
      sheet.setConditionalFormatRules([ruleLess, ruleGreater, ruleEqual]);
    } catch (eCf) {
      Logger.log('Conditional formatting error: ' + eCf);
    }
  }

  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 360);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 70);
  if (blocks.length > 0) {
    var firstBlock = blocks[0];
    var fDateSlots = isSpecificDate ? [specificDateStr] : (firstBlock.dateSlots || []);
    var fRetSlots = isCMT ? (isSpecificDate ? [] : (firstBlock.returDateSlots || [])) : [];
    var fNumDates = Math.max(10, fDateSlots.length);
    var fNumRet = isCMT ? (isSpecificDate ? 0 : Math.max(5, fRetSlots.length)) : 0;
    var fColTotal = 8 + fNumDates + fNumRet;
    for (var colIdx = 8; colIdx < fColTotal; colIdx++) {
      sheet.setColumnWidth(colIdx, 65);
    }
    sheet.setColumnWidth(fColTotal, 120);     // TOTAL DATANG (NET)
    sheet.setColumnWidth(fColTotal + 1, 105); // QTY NOTA
    sheet.setColumnWidth(fColTotal + 2, 100); // SELISIH
    if (!isSpecificDate) {
      sheet.setColumnWidth(fColTotal + 3, 125); // QTY HITUNG ULANG
      sheet.setColumnWidth(fColTotal + 4, 130); // SELISIH HITUNG ULANG
      sheet.setColumnWidth(fColTotal + 5, 110); // STATUS AUDIT
      sheet.setColumnWidth(fColTotal + 6, 260); // LOG HITUNG ULANG
    }
  }

  return {
    success: true,
    sheetId: sheet.getSheetId()
  };
}

/**
 * Menarik seluruh data QTY NOTA yang telah diisi oleh Buyer di Google Sheet
 * (Baik dari Sheet Satuan Per Tanggal maupun Sheet Master Produksi Kargo/CMT)
 * sekaligus menyinkronkan silang antara Sheet Tanggal <-> Sheet Master jika salah satu sudah diisi Buyer.
 */
function handleFetchQtyNota(ss, data) {
  try {
    var allSheets = ss.getSheets();
    var masterEntriesByCode = {}; // { [code]: { qtyNota, totalDiterima, selisihNota, sheet, rowNum, colQtyNota, kategori, sheetName } }
    var dateEntriesByCode = {};   // { [code]: [ { tanggal, qtyNota, totalDiterima, selisihNota, sheet, rowNum, colQtyNota, kategori, sheetName } ] }

    for (var i = 0; i < allSheets.length; i++) {
      var s = allSheets[i];
      var name = s.getName().trim();

      var isMasterKargo = (name === 'Master Produksi (Kargo)');
      var isMasterCMT = (name === 'Master Produksi (CMT)');
      var dateMatch = name.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*\((.*?)\))?/);

      if (!isMasterKargo && !isMasterCMT && !dateMatch) {
        continue;
      }

      var scan = scanExistingSheetBlocksData(s);
      var notaMap = scan.oldNotaMap || {};

      if (isMasterKargo || isMasterCMT) {
        var mKat = isMasterKargo ? 'Kargo' : 'Lokal CMT';
        for (var codeKey in notaMap) {
          var rec = notaMap[codeKey];
          masterEntriesByCode[codeKey] = {
            kode_produksi: codeKey,
            kategori: mKat,
            qtyNota: rec.qtyNota,
            totalDiterima: rec.totalDiterima,
            selisihNota: rec.selisihNota,
            sheet: s,
            sheetName: name,
            rowNum: rec.rowNum,
            colQtyNota: rec.colQtyNota
          };
        }
      } else if (dateMatch) {
        var dd = dateMatch[1];
        var mm = dateMatch[2];
        var yyyy = dateMatch[3];
        var isoDate = yyyy + '-' + mm + '-' + dd;
        var tag = (dateMatch[4] || '').trim();
        var dKat = tag.toLowerCase().indexOf('kargo') !== -1 ? 'Kargo' : 'Lokal CMT';

        for (var dCode in notaMap) {
          var dRec = notaMap[dCode];
          if (!dateEntriesByCode[dCode]) dateEntriesByCode[dCode] = [];
          dateEntriesByCode[dCode].push({
            kode_produksi: dCode,
            tanggal: isoDate,
            kategori: dKat,
            qtyNota: dRec.qtyNota,
            totalDiterima: dRec.totalDiterima,
            selisihNota: dRec.selisihNota,
            sheet: s,
            sheetName: name,
            rowNum: dRec.rowNum,
            colQtyNota: dRec.colQtyNota
          });
        }
      }
    }

    var combinedMap = {};
    var allCodesSet = {};
    for (var mc in masterEntriesByCode) allCodesSet[mc] = true;
    for (var dc in dateEntriesByCode) allCodesSet[dc] = true;

    var nowIso = new Date().toISOString();

    for (var code in allCodesSet) {
      var mEntry = masterEntriesByCode[code];
      var dList = dateEntriesByCode[code] || [];

      var byDate = {};
      var sumDateNota = 0;
      var hasDateNota = false;
      var sumDateDiterima = 0;
      var lastDateSheetName = '';
      var inferredKat = mEntry ? mEntry.kategori : (dList[0] ? dList[0].kategori : 'Kargo');

      for (var j = 0; j < dList.length; j++) {
        var de = dList[j];
        sumDateDiterima += Number(de.totalDiterima) || 0;
        if (de.qtyNota !== null && de.qtyNota !== undefined && !isNaN(Number(de.qtyNota))) {
          byDate[de.tanggal] = Number(de.qtyNota);
          sumDateNota += Number(de.qtyNota);
          hasDateNota = true;
          lastDateSheetName = de.sheetName;
        }
      }

      var finalQtyNota = null;
      var finalTotalDiterima = mEntry ? (Number(mEntry.totalDiterima) || sumDateDiterima) : sumDateDiterima;
      var sourceSheet = '';

      if (hasDateNota && (!mEntry || mEntry.qtyNota === null || mEntry.qtyNota === undefined)) {
        // Buyer mengisi di Sheet Tanggal, sedangkan di Master belum terisi -> pakai nilai Sheet Tanggal & sinkronkan ke Master!
        finalQtyNota = sumDateNota;
        sourceSheet = lastDateSheetName;
        if (mEntry && mEntry.sheet && mEntry.rowNum > 0 && mEntry.colQtyNota > 0) {
          try {
            mEntry.sheet.getRange(mEntry.rowNum, mEntry.colQtyNota).setValue(finalQtyNota).setNumberFormat('0');
          } catch (eSyncMaster) {}
        }
      } else if (mEntry && mEntry.qtyNota !== null && mEntry.qtyNota !== undefined) {
        // Buyer mengisi di Master Sheet (atau keduanya terisi)
        finalQtyNota = hasDateNota && sumDateNota !== mEntry.qtyNota && dList.length === 1 ? byDate[dList[0].tanggal] : Number(mEntry.qtyNota);
        sourceSheet = mEntry.sheetName;
        // Jika kode ini hanya ada di 1 Sheet Tanggal dan di Sheet Tanggal tersebut Qty Nota masih kosong, sinkronkan ke Sheet Tanggal!
        if (!hasDateNota && dList.length === 1 && dList[0].sheet && dList[0].rowNum > 0 && dList[0].colQtyNota > 0) {
          try {
            dList[0].sheet.getRange(dList[0].rowNum, dList[0].colQtyNota).setValue(finalQtyNota).setNumberFormat('0');
            byDate[dList[0].tanggal] = finalQtyNota;
          } catch (eSyncDate) {}
        }
      }

      if (finalQtyNota !== null && finalQtyNota !== undefined && !isNaN(Number(finalQtyNota))) {
        var finalSelisih = finalTotalDiterima - Number(finalQtyNota);
        combinedMap[code] = {
          kode_produksi: code,
          kategori: inferredKat,
          qty_nota: Number(finalQtyNota),
          total_diterima: finalTotalDiterima,
          selisih_nota: finalSelisih,
          by_date: byDate,
          source_sheet: sourceSheet,
          updated_at: nowIso
        };
      }
    }

    var recordsList = [];
    for (var k in combinedMap) {
      recordsList.push(combinedMap[k]);
    }

    return {
      success: true,
      count: recordsList.length,
      notaMap: combinedMap,
      records: recordsList
    };
  } catch (err) {
    Logger.log('handleFetchQtyNota error: ' + err.toString());
    return {
      success: false,
      error: err.toString(),
      message: 'Gagal menarik data Qty Nota dari Google Sheet: ' + err.toString()
    };
  }
}

/**
 * Update nilai QTY NOTA untuk kode tertentu secara langsung dari Frontend ke Sheet Master & Sheet Tanggal
 */
function updateQtyNotaDelta(ss, data) {
  try {
    var targetCode = String(data.kode_produksi || '').replace(/^'+/, '').trim().toUpperCase();
    if (!targetCode) {
      return { success: false, error: 'Kode produksi wajib diisi.' };
    }
    var qtyNotaVal = (data.qty_nota === '' || data.qty_nota === null || data.qty_nota === undefined)
      ? ''
      : Number(data.qty_nota);

    var allSheets = ss.getSheets();
    var updatedSheets = [];

    for (var i = 0; i < allSheets.length; i++) {
      var s = allSheets[i];
      var name = s.getName().trim();
      var isMaster = (name === 'Master Produksi (Kargo)' || name === 'Master Produksi (CMT)');
      var dateMatch = name.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*\((.*?)\))?/);

      if (!isMaster && !dateMatch) continue;
      if (data.tanggal && dateMatch) {
        var isoDate = dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1];
        if (isoDate !== data.tanggal) continue;
      }

      var scan = scanExistingSheetBlocksData(s);
      var rec = scan.oldNotaMap ? scan.oldNotaMap[targetCode] : null;
      if (rec && rec.rowNum > 0 && rec.colQtyNota > 0) {
        s.getRange(rec.rowNum, rec.colQtyNota).setValue(qtyNotaVal).setNumberFormat('0');
        if (rec.colSelisihNota > 0 && rec.colTotalDatang > 0) {
          var totalRef = colToLetter(rec.colTotalDatang) + rec.rowNum;
          var notaRef = colToLetter(rec.colQtyNota) + rec.rowNum;
          s.getRange(rec.rowNum, rec.colSelisihNota).setFormula('=IF(ISBLANK(' + notaRef + '), "", ' + totalRef + '-' + notaRef + ')').setNumberFormat('0');
        }
        updatedSheets.push(name);
      }
    }

    return {
      success: true,
      message: 'Berhasil memperbarui Qty Nota Kode ' + targetCode + ' pada ' + updatedSheets.length + ' tab sheet (' + updatedSheets.join(', ') + ')',
      updatedSheets: updatedSheets
    };
  } catch (err) {
    Logger.log('updateQtyNotaDelta error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Menulis / Meng-update 1 Sheet Khusus Per Tanggal Penerimaan (1 Tanggal = 1 Tab Sheet)
 * Menampilkan Format Matriks Produk yang SAMA PERSIS dengan Master & Tab Tanggal Sebelumnya
 */
function writeSingleDateSheet(ss, dateObj, defaultActiveTab) {
  try {
    var rawDate = String(dateObj.tanggal || '').trim();
    var kategori = dateObj.kategori || defaultActiveTab || 'Lokal CMT';
    var targetSheetName = dateObj.sheetName || formatDateTabName(rawDate, kategori);

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }

    var isCMT = (kategori !== 'Kargo');
    var blocks = dateObj.blocks || [];
    var items = dateObj.items || [];

    if (!blocks || blocks.length === 0) {
      blocks = buildBlocksFromItemsGAS(items, isCMT, rawDate);
    }

    var resMatrix = renderProductBlocksMatrix(sheet, blocks, isCMT, rawDate);

    return {
      success: true,
      sheetId: resMatrix.sheetId,
      sheetName: targetSheetName
    };
  } catch (err) {
    Logger.log('writeSingleDateSheet error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Buat atau update tab ringkasan indeks DAFTAR_TANGGAL
 * Ditempatkan di urutan paling depan (tab 0), diurutkan dari tanggal terbaru ke terlama.
 * Memuat ringkasan Model, Total Pcs, dan Link Navigasi langsung ke tab tanggal bersangkutan.
 */
function updateIndexDaftarTanggal(ss) {
  try {
    var indexSheetName = 'DAFTAR_TANGGAL';
    var sheet = ss.getSheetByName(indexSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(indexSheetName, 0); // Tempatkan di tab paling depan
    } else {
      // Pindahkan ke posisi 0 (paling kiri / depan)
      try {
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(1);
      } catch (eMove) {}
    }

    var allSheets = ss.getSheets();
    var dateEntries = [];

    // Cari ID Master Kargo dan Master CMT untuk Quick Links
    var kargoMasterSheet = ss.getSheetByName('Master Produksi (Kargo)');
    var kargoGid = kargoMasterSheet ? kargoMasterSheet.getSheetId() : null;
    var cmtMasterSheet = ss.getSheetByName('Master Produksi (CMT)');
    var cmtGid = cmtMasterSheet ? cmtMasterSheet.getSheetId() : null;

    var bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    for (var i = 0; i < allSheets.length; i++) {
      var s = allSheets[i];
      var name = s.getName().trim();

      // Deteksi tab tanggal: format DD-MM-YYYY atau memiliki (CMT)/(Kargo)
      var dateMatch = name.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*\((.*?)\))?/);
      if (dateMatch) {
        var dd = dateMatch[1];
        var mm = dateMatch[2];
        var yyyy = dateMatch[3];
        var tag = (dateMatch[4] || '').trim();

        var sortKey = yyyy + mm + dd;
        var mIdx = Number(mm) - 1;
        var formattedDateIndo = dd + ' ' + (bulanIndo[mIdx] || mm) + ' ' + yyyy;

        var kategori = 'Lokal CMT';
        if (tag.toLowerCase().indexOf('kargo') !== -1) {
          kategori = 'Kargo';
        } else if (tag.toLowerCase().indexOf('cmt') !== -1) {
          kategori = 'Lokal CMT';
        }

        // Hitung total kode dan total pcs dari tab sheet ini
        var totalCodes = 0;
        var totalPcs = 0;
        var lastRow = s.getLastRow();
        var lastCol = s.getLastColumn();

        if (lastRow >= 3) {
          try {
            var topBannerVal = String(s.getRange(1, 4).getValue() || '');
            var metaCodeMatch = topBannerVal.match(/Total:\s*(\d+)\s*Model/i);
            var metaPcsMatch = topBannerVal.match(/Datang:\s*(\d+)\s*pcs/i);
            
            if (metaCodeMatch && metaPcsMatch) {
              totalCodes = Number(metaCodeMatch[1]) || 0;
              totalPcs = Number(metaPcsMatch[1]) || 0;
            } else {
              var scan = scanExistingSheetBlocksData(s);
              var nMap = scan.oldNotaMap || {};
              var cKeys = Object.keys(nMap);
              totalCodes = cKeys.length;
              for (var ck = 0; ck < cKeys.length; ck++) {
                totalPcs += Number(nMap[cKeys[ck]].totalDiterima) || 0;
              }
            }
          } catch (eScan) {
            Logger.log('Error scan tab ' + name + ': ' + eScan);
          }
        }

        dateEntries.push({
          sheetId: s.getSheetId(),
          sheetName: name,
          sortKey: sortKey,
          tanggalIndo: formattedDateIndo,
          kategori: kategori,
          totalCodes: totalCodes,
          totalPcs: totalPcs
        });
      }
    }

    // Urutkan Tanggal: Terbaru di paling atas (Descending by sortKey)
    dateEntries.sort(function(a, b) {
      if (b.sortKey !== a.sortKey) {
        return b.sortKey.localeCompare(a.sortKey);
      }
      return a.kategori.localeCompare(b.kategori);
    });

    sheet.clearContents();
    sheet.clearFormats();

    // 1. Title Banner (Row 1)
    sheet.getRange('A1:G1').merge();
    sheet.getRange('A1').setValue('📋 DAFTAR INDEKS TANGGAL PENERIMAAN PRODUKSI (KARGO & CMT)')
      .setFontSize(13).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 38);

    // 2. Quick Links & Master Stats Bar (Row 2)
    sheet.getRange('A2:B2').merge();
    if (kargoGid !== null) {
      sheet.getRange('A2').setFormula('=HYPERLINK("#gid=' + kargoGid + '", "📦 Buka Master Kargo (Semua Data)")')
        .setBackground('#1E293B').setFontColor('#38BDF8').setFontWeight('bold').setFontSize(9.5)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    } else {
      sheet.getRange('A2').setValue('📦 Master Kargo Belum Dibuat')
        .setBackground('#1E293B').setFontColor('#94A3B8').setFontSize(9)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }

    sheet.getRange('C2:D2').merge();
    if (cmtGid !== null) {
      sheet.getRange('C2').setFormula('=HYPERLINK("#gid=' + cmtGid + '", "🧵 Buka Master CMT (Semua Data)")')
        .setBackground('#1E293B').setFontColor('#F43F5E').setFontWeight('bold').setFontSize(9.5)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    } else {
      sheet.getRange('C2').setValue('🧵 Master CMT Belum Dibuat')
        .setBackground('#1E293B').setFontColor('#94A3B8').setFontSize(9)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }

    sheet.getRange('E2:G2').merge();
    var nowWib = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd-MM-yyyy HH:mm:ss');
    sheet.getRange('E2').setValue('🕒 Terakhir Disinkron: ' + nowWib + ' WIB (' + dateEntries.length + ' Tab Tanggal)')
      .setBackground('#1E293B').setFontColor('#CBD5E1').setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(2, 28);

    sheet.setRowHeight(3, 10);

    // 3. Table Header (Row 4)
    var headers = ['NO', 'TANGGAL KEDATANGAN', 'KATEGORI', 'NAMA TAB SHEET', 'TOTAL MODEL / KODE', 'TOTAL PCS DATANG', 'AKSI NAVIGASI'];
    sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(4, 1, 1, headers.length);
    headerRange.setBackground('#BE123C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9.5)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(4, 28);

    // 4. Data Rows (Row 5+)
    if (dateEntries.length > 0) {
      var rows = [];
      for (var d = 0; d < dateEntries.length; d++) {
        var entry = dateEntries[d];
        rows.push([
          d + 1,
          entry.tanggalIndo,
          entry.kategori,
          entry.sheetName,
          entry.totalCodes > 0 ? (entry.totalCodes + ' Model') : '-',
          entry.totalPcs > 0 ? entry.totalPcs : 0,
          '=HYPERLINK("#gid=' + entry.sheetId + '", "👉 Buka Tab ' + entry.sheetName + '")'
        ]);
      }

      sheet.getRange(5, 1, rows.length, headers.length).setValues(rows);
      var dataRange = sheet.getRange(5, 1, rows.length, headers.length);
      dataRange.setFontSize(9.5).setVerticalAlignment('middle');
      dataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

      sheet.getRange(5, 1, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(5, 2, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
      sheet.getRange(5, 3, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
      sheet.getRange(5, 4, rows.length, 1).setHorizontalAlignment('left').setFontWeight('bold');
      sheet.getRange(5, 5, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(5, 6, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#047857').setNumberFormat('#,##0');
      sheet.getRange(5, 7, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#2563EB');

      for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        var rowNum = 5 + rIdx;
        sheet.setRowHeight(rowNum, 26);
        if (rIdx % 2 === 1) {
          sheet.getRange(rowNum, 1, 1, headers.length).setBackground('#F8FAFC');
        }
        var cat = dateEntries[rIdx].kategori;
        if (cat === 'Kargo') {
          sheet.getRange(rowNum, 3).setFontColor('#0284C7');
        } else if (cat === 'Lokal CMT') {
          sheet.getRange(rowNum, 3).setFontColor('#BE123C');
        }
      }
    } else {
      sheet.getRange('A5:G5').merge();
      sheet.getRange('A5').setValue('Belum ada tab tanggal yang terdaftar. Silakan lakukan Push Tab Tanggal dari WMS.')
        .setFontSize(10).setFontStyle('italic').setFontColor('#64748B').setHorizontalAlignment('center');
      sheet.setRowHeight(5, 40);
    }

    sheet.setColumnWidth(1, 45);
    sheet.setColumnWidth(2, 170);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 140);
    sheet.setColumnWidth(6, 130);
    sheet.setColumnWidth(7, 180);

    return {
      success: true,
      message: 'Sukses memperbarui Indeks DAFTAR_TANGGAL (' + dateEntries.length + ' tab tanggal terindeks)!',
      totalTabs: dateEntries.length,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/edit#gid=' + sheet.getSheetId()
    };
  } catch (err) {
    Logger.log('updateIndexDaftarTanggal error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * TARGETED DELTA UPDATE UNTUK HITUNG ULANG DI MASTER SHEET
 * Hanya mencari baris yang cocok (CODE + COLOR + SIZE) dan meng-update kolom recount tanpa menyentuh baris lain.
 */
function updateMasterRecountDelta(ss, data) {
  try {
    var activeTab = data.activeTab || 'CMT';
    var targetSheetName = data.sheetName || ('Master Produksi (' + activeTab + ')');
    var sheet = ss.getSheetByName(targetSheetName);
    
    if (!sheet) {
      return {
        success: false,
        error: 'Tab Master Sheet "' + targetSheetName + '" tidak ditemukan. Silakan lakukan push Master Sheet awal terlebih dahulu.'
      };
    }

    var items = data.items || [];
    if (!items || items.length === 0) {
      return { success: true, message: 'Tidak ada item hitung ulang yang dikirim.', updatedCount: 0 };
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 3) {
      return { success: false, error: 'Master sheet belum memiliki data yang valid.' };
    }

    // 1. Dapatkan Header untuk menemukan atau membuat kolom audit
    var headerRow1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    var colFisik = -1;
    var colSelisih = -1;
    var colStatus = -1;
    var colLog = -1;

    for (var c = 0; c < headerRow1.length; c++) {
      var hText = String(headerRow1[c]).trim().toUpperCase();
      if (hText.indexOf('SELISIH') !== -1 && (hText.indexOf('FISIK') !== -1 || hText.indexOf('HITUNG') !== -1 || colFisik !== -1) && colSelisih === -1) colSelisih = c + 1;
      else if (hText.indexOf('FISIK') !== -1 || hText.indexOf('QTY HITUNG') !== -1) colFisik = c + 1;
      else if (hText.indexOf('STATUS AUDIT') !== -1 || hText === 'STATUS') colStatus = c + 1;
      else if (hText.indexOf('LOG') !== -1 || hText.indexOf('RIWAYAT') !== -1) colLog = c + 1;
    }

    // Jika kolom audit belum ada di Master Sheet, sisipkan otomatis di paling kanan
    if (colFisik === -1 || colSelisih === -1 || colStatus === -1 || colLog === -1) {
      var startNewCol = lastCol + 1;
      sheet.insertColumnsAfter(lastCol, 4);
      
      colFisik = startNewCol;
      colSelisih = startNewCol + 1;
      colStatus = startNewCol + 2;
      colLog = startNewCol + 3;

      var newHeaders = [['QTY HITUNG ULANG', 'SELISIH HITUNG ULANG', 'STATUS AUDIT', 'LOG HITUNG ULANG']];
      sheet.getRange(1, startNewCol, 1, 4).setValues(newHeaders);
      sheet.getRange(2, startNewCol, 1, 4).setValues([['', '', '', '']]);
      
      for (var hi = 0; hi < 4; hi++) {
        sheet.getRange(1, startNewCol + hi, 2, 1).merge();
      }

      var headerRange = sheet.getRange(1, startNewCol, 2, 4);
      headerRange.setBackground('#FCE8E6');
      headerRange.setFontColor('#0F172A');
      headerRange.setFontWeight('bold');
      headerRange.setFontSize(9);
      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
      headerRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

      sheet.setColumnWidth(colFisik, 115);
      sheet.setColumnWidth(colSelisih, 95);
      sheet.setColumnWidth(colStatus, 115);
      sheet.setColumnWidth(colLog, 280);
    }

    // 2. Petakan Baris dengan Penanganan Sel Ter-Merge (CODE & COLOR)
    var rawRows = sheet.getRange(3, 1, lastRow - 2, 7).getValues();
    var mappedRows = [];
    var curCode = '';
    var curColor = '';

    for (var r = 0; r < rawRows.length; r++) {
      var rowNum = r + 3;
      var c1 = String(rawRows[r][0] || '').trim();
      var cCode = String(rawRows[r][1] || '').replace(/^'+/, '').trim().toUpperCase();
      var cColor = String(rawRows[r][5] || '').trim().toUpperCase();
      var cSize = String(rawRows[r][6] || '').replace(/^'+/, '').trim().toUpperCase();

      if (cCode === 'CODE' || cCode.indexOf('CATATAN') !== -1 || c1 === 'NO') {
        continue;
      }
      if (cCode && cCode !== '-') {
        curCode = cCode;
      }
      if (cColor && cColor !== '-') {
        curColor = cColor;
      }
      if (cSize && cSize !== '-' && cSize !== 'SIZE') {
        mappedRows.push({
          rowNum: rowNum,
          code: curCode,
          color: curColor,
          size: cSize
        });
      }
    }

    var updatedCount = 0;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var targetCode = String(it.kode_produksi || '').replace(/^'+/, '').trim().toUpperCase();
      var targetColor = String(it.warna || '').trim().toUpperCase();
      var targetSize = String(it.size || '').replace(/^'+/, '').trim().toUpperCase();

      for (var m = 0; m < mappedRows.length; m++) {
        var mRow = mappedRows[m];
        var isMatch = (mRow.code === targetCode) &&
                      (!targetColor || !mRow.color || mRow.color === targetColor) &&
                      (!targetSize || !mRow.size || mRow.size === targetSize);

        if (isMatch) {
          var targetRowNum = mRow.rowNum;

          // Set Nilai Fisik & Selisih
          sheet.getRange(targetRowNum, colFisik).setValue(Number(it.qty_fisik) || 0).setNumberFormat('0');
          
          var selisihVal = Number(it.selisih) || 0;
          var selisihRange = sheet.getRange(targetRowNum, colSelisih);
          selisihRange.setValue(selisihVal).setNumberFormat('0');

          var statusRange = sheet.getRange(targetRowNum, colStatus);
          var statusText = it.status || (selisihVal === 0 ? 'MATCH' : selisihVal < 0 ? 'KURANG (' + selisihVal + ')' : 'LEBIH (+' + selisihVal + ')');
          statusRange.setValue(statusText);

          // Format Pewarnaan Otomatis Selisih & Status
          if (selisihVal < 0) {
            selisihRange.setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
            statusRange.setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
          } else if (selisihVal > 0) {
            selisihRange.setBackground('#DBEAFE').setFontColor('#1E40AF').setFontWeight('bold');
            statusRange.setBackground('#DBEAFE').setFontColor('#1E40AF').setFontWeight('bold');
          } else {
            selisihRange.setBackground('#DCFCE7').setFontColor('#166534').setFontWeight('bold');
            statusRange.setBackground('#DCFCE7').setFontColor('#166534').setFontWeight('bold');
          }

          // Catat Log Putaran, Info Tanggal Kedatangan & Petugas
          var logDateStr = it.updated_at ? formatDateIndo(it.updated_at) : formatDateIndo(new Date().toISOString());
          var logText = 'Rev ' + (it.round || 1) + ' [' + logDateStr + ']';
          if (it.tanggal_kedatangan_info) {
            logText += ' (Kedatangan: ' + it.tanggal_kedatangan_info + ')';
          }
          logText += ' (' + (it.auditor || 'Auditor') + ')';
          if (it.catatan) logText += ': ' + it.catatan;
          
          sheet.getRange(targetRowNum, colLog).setValue(logText).setFontSize(8.5);
          updatedCount++;
        }
      }
    }

    return {
      success: true,
      message: 'Sukses memperbarui ' + updatedCount + ' baris hasil hitung ulang Kode ' + (data.kode_produksi || '') + ' di Master Sheet secara instan!',
      updatedCount: updatedCount,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/edit#gid=' + sheet.getSheetId()
    };
  } catch (err) {
    Logger.log('updateMasterRecountDelta error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}
