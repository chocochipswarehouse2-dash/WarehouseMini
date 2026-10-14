/**
 * WMS PRODUKSI GOOGLE SPREADSHEET SYNC (1 SURAT JALAN = 1 SHEET & MASTER MATRIX)
 * ================================================================================================
 * Spreadsheet ID : 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 * Script ID      : 1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb
 */

var TARGET_PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';

/**
 * Entry point Web App untuk menerima request push dari WMS
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
    message: 'WMS Produksi Google Sheet Sync Gateway is Active (Supports 1 SJ = 1 Sheet & Master Matrix)',
    spreadsheetId: TARGET_PRODUKSI_SPREADSHEET_ID
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handler Utama Push Penerimaan Produksi
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

    var dateSet = {};
    for (var d = 0; d < codeItems.length; d++) {
      if (codeItems[d].tanggal_penerimaan) {
        dateSet[codeItems[d].tanggal_penerimaan] = true;
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
      dateSlots: dateSlots,
      colorGroups: colorGroups,
      totalDatang: blockTotalDatang,
      totalNet: blockTotalDatang
    });
  }

  return blocks;
}

/**
 * Merender tabel Produk Berdasarkan Blok Matriks (Format Resmi Master & Tanggal Produksi)
 * Sesuai format standar: Header Pink, Foto Produk Merged =IMAGE(...), Warna Merged, Size, Kolom Tanggal, Total Datang, Baris Catatan Kuning
 */
function renderProductBlocksMatrix(sheet, blocks, isCMT, specificDateStr) {
  var oldDataMap = {};
  var isSpecificDate = !!specificDateStr;
  
  try {
    var lastRow = sheet.getLastRow();
    var lastCol = Math.min(50, Math.max(1, sheet.getLastColumn()));
    if (!isSpecificDate && lastRow > 2 && lastCol > 8) {
      var header1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var colFisik = -1, colSelisih = -1, colStatus = -1, colLog = -1;
      for (var c = 0; c < header1.length; c++) {
        var hText = String(header1[c]).trim().toUpperCase();
        if (hText.indexOf('FISIK') !== -1) colFisik = c;
        else if (hText.indexOf('SELISIH') !== -1) colSelisih = c;
        else if (hText.indexOf('STATUS AUDIT') !== -1 || hText === 'STATUS') colStatus = c;
        else if (hText.indexOf('LOG') !== -1 || hText.indexOf('RIWAYAT') !== -1) colLog = c;
      }
      
      if (colFisik !== -1) {
        var oldValues = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
        for (var i = 0; i < oldValues.length; i++) {
          var rowObj = oldValues[i];
          var oldCode = String(rowObj[1] || '').trim().toUpperCase();
          var oldColor = String(rowObj[5] || '').trim().toUpperCase();
          var oldSize = String(rowObj[6] || '').trim().toUpperCase();
          
          if (oldCode && oldColor && oldSize) {
            var key = oldCode + '_' + oldColor + '_' + oldSize;
            oldDataMap[key] = {
              fisik: colFisik !== -1 ? rowObj[colFisik] : '',
              selisih: colSelisih !== -1 ? rowObj[colSelisih] : '',
              status: colStatus !== -1 ? rowObj[colStatus] : '',
              log: colLog !== -1 ? rowObj[colLog] : ''
            };
          }
        }
      }
    }
  } catch (eOld) {
    Logger.log('Gagal membaca data lama hitung ulang: ' + eOld);
  }

  sheet.clearContents();
  sheet.clearFormats();
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
      sheet.getRange(1, 4, 1, 15).merge().setValue(infoText)
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

  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    var headerRow1Index = currentRow;
    var headerRow2Index = currentRow + 1;

    // Jika mode tanggal spesifik (1 Tanggal = 1 Tab)
    var dateSlots = isSpecificDate ? [specificDateStr] : (block.dateSlots || []);
    var returSlots = isCMT ? (isSpecificDate ? (block.returDateSlots && block.returDateSlots.indexOf(specificDateStr) > -1 ? [specificDateStr] : []) : (block.returDateSlots || [])) : [];

    var numDateCols = Math.max(10, dateSlots.length);
    var numReturCols = isCMT ? (isSpecificDate ? Math.max(0, returSlots.length) : Math.max(5, returSlots.length)) : 0;
    var totalCols = 7 + numDateCols + (numReturCols > 0 ? numReturCols : 0) + 1 + (!isSpecificDate ? 4 : 0);

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
    if (!isSpecificDate) {
      row1Vals.push('FISIK HASIL HITUNG');
      row1Vals.push('SELISIH');
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
    sheet.getRange(headerRow1Index, nextColPointer, 2, 1).merge(); // TOTAL DATANG (NET)
    nextColPointer++;

    if (!isSpecificDate) {
      sheet.getRange(headerRow1Index, nextColPointer, 2, 1).merge(); // FISIK
      sheet.getRange(headerRow1Index, nextColPointer + 1, 2, 1).merge(); // SELISIH
      sheet.getRange(headerRow1Index, nextColPointer + 2, 2, 1).merge(); // STATUS
      sheet.getRange(headerRow1Index, nextColPointer + 3, 2, 1).merge(); // LOG
    }

    var headerRange = sheet.getRange(headerRow1Index, 1, 2, totalCols);
    headerRange.setBackground('#FCE8E6');
    headerRange.setFontColor('#0F172A');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(9);
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

    currentRow += 2;

    var startDataRowIndex = currentRow;
    var colorGroups = block.colorGroups || [];
    var totalSubRowsInBlock = 0;
    for (var cgIdx = 0; cgIdx < colorGroups.length; cgIdx++) {
      totalSubRowsInBlock += Math.max(1, (colorGroups[cgIdx].sizes || []).length);
    }
    var targetBlockHeightPx = Math.max(320, totalSubRowsInBlock * 32);
    var calculatedRowHeight = Math.max(32, Math.floor(targetBlockHeightPx / Math.max(1, totalSubRowsInBlock)));

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
        dataRowVals.push(rowNet);

        if (!isSpecificDate) {
          var lookupKey = String(block.code || block.productCode || '').trim().toUpperCase() + '_' + 
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
        sheet.setRowHeight(currentRow, calculatedRowHeight);
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
        sheet.getRange(startDataRowIndex, 1, numBlockRows, 1).merge();
        sheet.getRange(startDataRowIndex, 2, numBlockRows, 1).merge();
        sheet.getRange(startDataRowIndex, 3, numBlockRows, 1).merge();
        sheet.getRange(startDataRowIndex, 4, numBlockRows, 1).merge();
        sheet.getRange(startDataRowIndex, 5, numBlockRows, 1).merge();
        sheet.getRange(startDataRowIndex, totalCols, numBlockRows, 1).merge();
      }

      var rawPhotoUrl = String(block.photoUrl || '').trim();
      if (rawPhotoUrl && (rawPhotoUrl.indexOf('http://') === 0 || rawPhotoUrl.indexOf('https://') === 0)) {
        sheet.getRange(startDataRowIndex, 5).setFormula('=IMAGE("' + rawPhotoUrl + '", 1)');
      }

      var blockDataRange = sheet.getRange(startDataRowIndex, 1, numBlockRows, totalCols);
      blockDataRange.setVerticalAlignment('middle');
      blockDataRange.setHorizontalAlignment('center');
      blockDataRange.setFontSize(9.5);
      blockDataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

      sheet.getRange(startDataRowIndex, 1, numBlockRows, 7).setNumberFormat('@');
      sheet.getRange(startDataRowIndex, 8, numBlockRows, totalCols - 7).setNumberFormat('0');
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

  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 360);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 70);
  for (var colIdx = 8; colIdx <= 8 + numDateCols + (numReturCols > 0 ? numReturCols : 0); colIdx++) {
    sheet.setColumnWidth(colIdx, 65);
  }
  sheet.setColumnWidth(totalCols, 120);

  return {
    success: true,
    sheetId: sheet.getSheetId()
  };
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
      // Contoh: "26-09-2026 (Kargo)", "26-09-2026 (CMT)", "26-09-2026"
      var dateMatch = name.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*\((.*?)\))?/);
      if (dateMatch) {
        var dd = dateMatch[1];
        var mm = dateMatch[2];
        var yyyy = dateMatch[3];
        var tag = (dateMatch[4] || '').trim();

        // Sort key numerik yyyymmdd untuk pengurutan tanggal terbaru ke terlama
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
            // Cek apakah di baris 1 terdapat metadata ringkasan info (misal: "📦 Total: 12 Model  |  🔢 Datang: 850 pcs")
            var topBannerVal = String(s.getRange(1, 4).getValue() || '');
            var metaCodeMatch = topBannerVal.match(/Total:\s*(\d+)\s*Model/i);
            var metaPcsMatch = topBannerVal.match(/Datang:\s*(\d+)\s*pcs/i);
            
            if (metaCodeMatch && metaPcsMatch) {
              totalCodes = Number(metaCodeMatch[1]) || 0;
              totalPcs = Number(metaPcsMatch[1]) || 0;
            } else {
              // Baca data untuk menghitung kode & pcs riil
              var maxScanRows = Math.min(lastRow, 500);
              var scanCols = Math.min(lastCol, 25);
              var dataVals = s.getRange(1, 1, maxScanRows, scanCols).getValues();

              var codeSet = {};
              // Cari kolom total pcs (bisa 'TOTAL DATANG (NET)' atau col 8)
              var colTotal = -1;
              for (var c = 0; c < scanCols; c++) {
                var h1 = String(dataVals[0] && dataVals[0][c] || '').toUpperCase();
                var h2 = String(dataVals[1] && dataVals[1][c] || '').toUpperCase();
                var h3 = String(dataVals[2] && dataVals[2][c] || '').toUpperCase();
                if (h1.indexOf('TOTAL DATANG') !== -1 || h2.indexOf('TOTAL DATANG') !== -1 || h3.indexOf('TOTAL DATANG') !== -1) {
                  colTotal = c;
                  break;
                }
              }
              if (colTotal === -1) {
                // Kolom H (indeks 7) adalah kolom tanggal pertama
                colTotal = 7;
              }

              for (var r = 0; r < maxScanRows; r++) {
                var rCode = String(dataVals[r][1] || '').trim().toUpperCase();
                var rSize = String(dataVals[r][6] || '').trim().toUpperCase();
                
                if (rCode && rCode !== 'CODE' && rCode !== '-' && rCode.indexOf('CATATAN') === -1) {
                  codeSet[rCode] = true;
                }

                if (rSize && rSize !== 'SIZE' && rSize !== '-' && rCode.indexOf('CATATAN') === -1) {
                  var qVal = Number(dataVals[r][colTotal]) || 0;
                  totalPcs += qVal;
                }
              }

              totalCodes = Object.keys(codeSet).length;
              if (totalCodes === 0 && metaCodeMatch) {
                totalCodes = Number(metaCodeMatch[1]) || 0;
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
    // Col A-B: Link Master Kargo
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

    // Col C-D: Link Master CMT
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

    // Col E-G: Timestamp & Total Tabs
    sheet.getRange('E2:G2').merge();
    var nowWib = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd-MM-yyyy HH:mm:ss');
    sheet.getRange('E2').setValue('🕒 Terakhir Disinkron: ' + nowWib + ' WIB (' + dateEntries.length + ' Tab Tanggal)')
      .setBackground('#1E293B').setFontColor('#CBD5E1').setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(2, 28);

    // Spacer (Row 3)
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

      // Alignment & Styling
      sheet.getRange(5, 1, rows.length, 1).setHorizontalAlignment('center'); // NO
      sheet.getRange(5, 2, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold'); // TANGGAL
      sheet.getRange(5, 3, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold'); // KATEGORI
      sheet.getRange(5, 4, rows.length, 1).setHorizontalAlignment('left').setFontWeight('bold'); // NAMA TAB
      sheet.getRange(5, 5, rows.length, 1).setHorizontalAlignment('center'); // TOTAL KODE
      sheet.getRange(5, 6, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#047857').setNumberFormat('#,##0'); // TOTAL PCS
      sheet.getRange(5, 7, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#2563EB'); // NAVIGASI LINK

      for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        var rowNum = 5 + rIdx;
        sheet.setRowHeight(rowNum, 26);
        if (rIdx % 2 === 1) {
          sheet.getRange(rowNum, 1, 1, headers.length).setBackground('#F8FAFC');
        }
        var cat = dateEntries[rIdx].kategori;
        if (cat === 'Kargo') {
          sheet.getRange(rowNum, 3).setFontColor('#0284C7'); // Cyan/Blue
        } else if (cat === 'Lokal CMT') {
          sheet.getRange(rowNum, 3).setFontColor('#BE123C'); // Rose
        }
      }
    } else {
      // Empty state
      sheet.getRange('A5:G5').merge();
      sheet.getRange('A5').setValue('Belum ada tab tanggal yang terdaftar. Silakan lakukan Push Tab Tanggal dari WMS.')
        .setFontSize(10).setFontStyle('italic').setFontColor('#64748B').setHorizontalAlignment('center');
      sheet.setRowHeight(5, 40);
    }

    sheet.setColumnWidth(1, 45);  // NO
    sheet.setColumnWidth(2, 170); // TANGGAL KEDATANGAN
    sheet.setColumnWidth(3, 110); // KATEGORI
    sheet.setColumnWidth(4, 180); // NAMA TAB SHEET
    sheet.setColumnWidth(5, 140); // TOTAL KODE
    sheet.setColumnWidth(6, 130); // TOTAL PCS
    sheet.setColumnWidth(7, 180); // NAVIGASI LINK

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
 * Menghindari timeout Google Apps Script ketika data Master Sheet sudah mencapai ribuan baris!
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
      if (hText.indexOf('FISIK') !== -1) colFisik = c + 1;
      else if (hText.indexOf('SELISIH') !== -1) colSelisih = c + 1;
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

      var newHeaders = [['FISIK HASIL HITUNG', 'SELISIH', 'STATUS AUDIT', 'LOG HITUNG ULANG']];
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
      var cCode = String(rawRows[r][1] || '').trim().toUpperCase();
      var cColor = String(rawRows[r][5] || '').trim().toUpperCase();
      var cSize = String(rawRows[r][6] || '').trim().toUpperCase();

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
      var targetCode = String(it.kode_produksi || '').trim().toUpperCase();
      var targetColor = String(it.warna || '').trim().toUpperCase();
      var targetSize = String(it.size || '').trim().toUpperCase();

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

