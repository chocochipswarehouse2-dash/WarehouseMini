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
    // FALLBACK / MODE MATRIKS BLOCKS
    // =========================================================================
    var activeTab = data.activeTab || 'CMT';
    var targetSheetName = data.sheetName || ('Master Produksi (' + activeTab + ')');

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }

    var blocks = data.blocks || [];
    if (blocks && blocks.length > 0) {
      sheet.clearContents();
      sheet.clearFormats();
      try {
        sheet.getRange(1, 1, Math.max(100, sheet.getMaxRows()), Math.max(25, sheet.getMaxColumns())).setNumberFormat('@');
      } catch (eFmt) {}

      var isCMT = activeTab === 'CMT';
      var currentRow = 1;

      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        var headerRow1Index = currentRow;
        var headerRow2Index = currentRow + 1;

        var dateSlots = block.dateSlots || [];
        var returSlots = isCMT ? (block.returDateSlots || []) : [];
        var numDateCols = Math.max(10, dateSlots.length);
        var numReturCols = isCMT ? Math.max(5, returSlots.length) : 0;
        var totalCols = 7 + numDateCols + numReturCols + 1;

        var row1Vals = ['NO', 'CODE', 'PRODUCT NAME', 'UP', 'PHOTO', 'COLOR', 'SIZE'];
        for (var d = 0; d < numDateCols; d++) {
          row1Vals.push(d === 0 ? 'QTY DATANG' : '');
        }
        if (isCMT && numReturCols > 0) {
          for (var r = 0; r < numReturCols; r++) {
            row1Vals.push(r === 0 ? 'RETUR PRODUKSI' : '');
          }
        }
        row1Vals.push('TOTAL NET');

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
        row2Vals.push('');

        sheet.getRange(headerRow1Index, 1, 1, row1Vals.length).setValues([row1Vals]);
        sheet.getRange(headerRow2Index, 1, 1, row2Vals.length).setValues([row2Vals]);
        sheet.getRange(headerRow1Index, 1, 2, totalCols).setNumberFormat('@');

        sheet.getRange(headerRow1Index, 1, 2, 1).merge();
        sheet.getRange(headerRow1Index, 2, 2, 1).merge();
        sheet.getRange(headerRow1Index, 3, 2, 1).merge();
        sheet.getRange(headerRow1Index, 4, 2, 1).merge();
        sheet.getRange(headerRow1Index, 5, 2, 1).merge();
        sheet.getRange(headerRow1Index, 6, 2, 1).merge();
        sheet.getRange(headerRow1Index, 7, 2, 1).merge();

        sheet.getRange(headerRow1Index, 8, 1, numDateCols).merge();
        var nextColPointer = 8 + numDateCols;
        if (isCMT && numReturCols > 0) {
          sheet.getRange(headerRow1Index, nextColPointer, 1, numReturCols).merge();
          nextColPointer += numReturCols;
        }
        sheet.getRange(headerRow1Index, nextColPointer, 2, 1).merge();

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
              "'" + (block.code || ''),
              block.productName || '',
              block.upVendor || '',
              '',
              cg.color,
              "'" + (sz.size || '')
            ];

            for (var d2 = 0; d2 < numDateCols; d2++) {
              var dKey = dateSlots[d2];
              var qVal = (dKey && sz.qtyByDate && sz.qtyByDate[dKey] !== undefined && sz.qtyByDate[dKey] !== '')
                ? Number(sz.qtyByDate[dKey])
                : '';
              dataRowVals.push(qVal);
            }
            if (isCMT) {
              for (var r2 = 0; r2 < numReturCols; r2++) {
                var rKey = returSlots[r2];
                var rqVal = (rKey && sz.qtyReturByDate && sz.qtyReturByDate[rKey] !== undefined && sz.qtyReturByDate[rKey] !== '')
                  ? Number(sz.qtyReturByDate[rKey])
                  : '';
                dataRowVals.push(rqVal);
              }
            }
            dataRowVals.push(Number(block.totalNet) || 0);

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

          // Pastikan format kolom teks & kode adalah Plain Text (@) agar tidak diubah Google Sheets
          sheet.getRange(startDataRowIndex, 1, numBlockRows, 7).setNumberFormat('@');
          // Pastikan format kolom quantity (datang, retur, total) adalah Integer Number ('0') agar 55 tidak menjadi '23 Feb'
          sheet.getRange(startDataRowIndex, 8, numBlockRows, totalCols - 7).setNumberFormat('0');
        }

        var blockCatatan = String(block.catatan || block.keterangan || '').trim();
        if (blockCatatan) {
          var noteRowIndex = currentRow;
          var noteRowVals = ['CATATAN / KETERANGAN:', blockCatatan];
          for (var nc = 2; nc < totalCols; nc++) noteRowVals.push('');
          sheet.getRange(noteRowIndex, 1, 1, noteRowVals.length).setValues([noteRowVals]);
          sheet.getRange(noteRowIndex, 2, 1, totalCols - 1).merge();
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

        currentRow += 2;
      }

      sheet.setColumnWidth(1, 45);
      sheet.setColumnWidth(2, 90);
      sheet.setColumnWidth(3, 160);
      sheet.setColumnWidth(4, 90);
      sheet.setColumnWidth(5, 360);
      sheet.setColumnWidth(6, 110);
      sheet.setColumnWidth(7, 70);
      for (var colIdx = 8; colIdx <= 8 + numDateCols + numReturCols; colIdx++) {
        sheet.setColumnWidth(colIdx, 65);
      }
      sheet.setColumnWidth(totalCols, 120);

      return {
        success: true,
        message: 'Sukses menulis ' + blocks.length + ' Master Tabel Kode Produk ke Google Sheet (' + targetSheetName + ')!',
        count: blocks.length,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit#gid=' + sheet.getSheetId()
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
 * Menulis / Meng-update 1 Sheet Khusus Per Tanggal Penerimaan (1 Tanggal = 1 Tab Sheet)
 * Menampilkan KOP Tanggal, Foto Produk (=IMAGE), Kode, Nama Produk, Vendor/UP, Warna, Size, Qty, dan Catatan
 */
function writeSingleDateSheet(ss, dateObj, defaultActiveTab) {
  try {
    var rawDate = String(dateObj.tanggal || '').trim();
    var kategori = dateObj.kategori || defaultActiveTab || 'Lokal CMT';
    var targetSheetName = dateObj.sheetName || formatDateTabName(rawDate, kategori);

    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    } else {
      sheet.clearContents();
      sheet.clearFormats();
    }

    var items = dateObj.items || [];
    var blocks = dateObj.blocks || [];
    var displayDate = formatDateIndo(rawDate);

    // Hitung total kuantitas
    var totalPcs = 0;
    if (items.length > 0) {
      for (var i = 0; i < items.length; i++) {
        totalPcs += Number(items[i].qty) || 0;
      }
    } else if (blocks.length > 0) {
      for (var b = 0; b < blocks.length; b++) {
        totalPcs += Number(blocks[b].totalNet || blocks[b].totalDatang) || 0;
      }
    }

    // 1. KOP TANGGAL PENERIMAAN
    var kopVals = [
      ['PENERIMAAN PRODUKSI (' + (kategori === 'Kargo' ? 'KARGO' : 'LOKAL CMT') + ') - TANGGAL: ' + displayDate.toUpperCase(), '', '', '', '', '', '', '', ''],
      ['Tanggal Penerimaan:', displayDate, '', 'Kategori:', kategori, '', 'Total Datang:', totalPcs + ' pcs', ''],
      ['Waktu Sinkronisasi:', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') + ' WIB', '', 'Status Sheet:', 'Per Tanggal (1 Tanggal = 1 Tab)', '', 'Jumlah Varian:', (items.length || blocks.length) + ' baris', '']
    ];
    sheet.getRange(1, 1, 3, 9).setValues(kopVals);

    // Styling KOP
    sheet.getRange(1, 1, 1, 9).merge();
    sheet.getRange(1, 1).setFontSize(13).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF').setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 34);

    var metaRange = sheet.getRange(2, 1, 2, 9);
    metaRange.setFontSize(9).setBackground('#F8FAFC');
    sheet.getRange('A2').setFontWeight('bold');
    sheet.getRange('A3').setFontWeight('bold');
    sheet.getRange('D2').setFontWeight('bold');
    sheet.getRange('D3').setFontWeight('bold');
    sheet.getRange('G2').setFontWeight('bold');
    sheet.getRange('G3').setFontWeight('bold');
    sheet.getRange('B2').setFontWeight('bold').setFontColor('#BE123C');
    sheet.getRange('H2').setFontWeight('bold').setFontColor('#0369A1');
    metaRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(2, 22);
    sheet.setRowHeight(3, 22);

    // 2. HEADER TABEL ITEM
    var headerRowIndex = 5;
    var tableHeaders = ['NO', 'FOTO', 'KODE PRODUKSI', 'NAMA PRODUK', 'UP / VENDOR', 'WARNA', 'SIZE', 'QTY (PCS)', 'NO. SJ / CATATAN'];
    sheet.getRange(headerRowIndex, 1, 1, tableHeaders.length).setValues([tableHeaders]);
    var tableHeaderRange = sheet.getRange(headerRowIndex, 1, 1, tableHeaders.length);
    tableHeaderRange.setBackground('#BE123C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9.5).setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(headerRowIndex, 28);

    // 3. ISI TABEL DARI BLOCKS ATAU ITEMS
    var currentRow = 6;
    var startDataRow = currentRow;

    if (blocks && blocks.length > 0) {
      // MODE BLOCKS (Grouped Hierarchically by Kode Produksi)
      for (var bIdx = 0; bIdx < blocks.length; bIdx++) {
        var blk = blocks[bIdx];
        var startBlockRow = currentRow;
        var colorGroups = blk.colorGroups || [];

        for (var cgIdx = 0; cgIdx < colorGroups.length; cgIdx++) {
          var cg = colorGroups[cgIdx];
          var sizes = cg.sizes || [];

          for (var szIdx = 0; szIdx < sizes.length; szIdx++) {
            var sz = sizes[szIdx];
            var q = 0;
            if (sz.qtyByDate && sz.qtyByDate[rawDate] !== undefined) {
              q = Number(sz.qtyByDate[rawDate]) || 0;
            } else {
              q = Number(sz.totalSizeQty) || 0;
            }

            var rowVals = [
              (bIdx + 1),
              '',
              blk.code || '',
              blk.productName || '',
              blk.upVendor || '',
              cg.color || '',
              sz.size || '',
              q,
              blk.catatan || ''
            ];
            sheet.getRange(currentRow, 1, 1, rowVals.length).setValues([rowVals]);
            sheet.setRowHeight(currentRow, 46);
            currentRow++;
          }
        }

        var endBlockRow = currentRow - 1;
        var numBlockRows = endBlockRow - startBlockRow + 1;
        if (numBlockRows > 1) {
          sheet.getRange(startBlockRow, 1, numBlockRows, 1).merge(); // NO
          sheet.getRange(startBlockRow, 2, numBlockRows, 1).merge(); // FOTO
          sheet.getRange(startBlockRow, 3, numBlockRows, 1).merge(); // KODE
          sheet.getRange(startBlockRow, 4, numBlockRows, 1).merge(); // NAMA
          sheet.getRange(startBlockRow, 5, numBlockRows, 1).merge(); // UP
          sheet.getRange(startBlockRow, 9, numBlockRows, 1).merge(); // CATATAN
        }

        // Tampilkan gambar produk
        var photoUrl = String(blk.photoUrl || '').trim();
        if (photoUrl && (photoUrl.indexOf('http://') === 0 || photoUrl.indexOf('https://') === 0)) {
          sheet.getRange(startBlockRow, 2).setFormula('=IMAGE("' + photoUrl + '", 1)');
        }
      }
    } else if (items && items.length > 0) {
      // MODE FLAT ITEMS
      for (var itIdx = 0; itIdx < items.length; itIdx++) {
        var it = items[itIdx];
        var note = it.no_surat_jalan ? ('[' + it.no_surat_jalan + '] ') : '';
        note += (it.keterangan || it.catatan || '');

        var itRowVals = [
          (itIdx + 1),
          '',
          it.kode_produksi || '',
          it.nama_produk || '',
          it.up_vendor || it.keterangan || '',
          it.warna || '',
          it.size || '',
          Number(it.qty) || 0,
          note.trim()
        ];
        sheet.getRange(currentRow, 1, 1, itRowVals.length).setValues([itRowVals]);

        var itPhoto = String(it.foto_url || '').trim();
        if (itPhoto && (itPhoto.indexOf('http://') === 0 || itPhoto.indexOf('https://') === 0)) {
          sheet.getRange(currentRow, 2).setFormula('=IMAGE("' + itPhoto + '", 1)');
        }

        sheet.setRowHeight(currentRow, 46);
        currentRow++;
      }
    }

    var lastDataRow = currentRow - 1;
    if (lastDataRow >= startDataRow) {
      var dataRange = sheet.getRange(startDataRow, 1, (lastDataRow - startDataRow + 1), tableHeaders.length);
      dataRange.setFontSize(9).setVerticalAlignment('middle');
      dataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(startDataRow, 1, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('center'); // NO
      sheet.getRange(startDataRow, 2, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('center'); // FOTO
      sheet.getRange(startDataRow, 3, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('center').setFontWeight('bold').setFontFamily('monospace'); // KODE
      sheet.getRange(startDataRow, 4, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('left'); // NAMA
      sheet.getRange(startDataRow, 5, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('left'); // UP
      sheet.getRange(startDataRow, 6, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('left').setFontWeight('bold'); // WARNA
      sheet.getRange(startDataRow, 7, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('center').setFontWeight('bold'); // SIZE
      sheet.getRange(startDataRow, 8, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#0369A1').setBackground('#F0F9FF'); // QTY
      sheet.getRange(startDataRow, 9, (lastDataRow - startDataRow + 1), 1).setHorizontalAlignment('left'); // CATATAN

      // Format Text vs Number
      sheet.getRange(startDataRow, 1, (lastDataRow - startDataRow + 1), 7).setNumberFormat('@');
      sheet.getRange(startDataRow, 8, (lastDataRow - startDataRow + 1), 1).setNumberFormat('0');
      sheet.getRange(startDataRow, 9, (lastDataRow - startDataRow + 1), 1).setNumberFormat('@');
    }

    // 4. FOOTER TOTAL KESELURUHAN
    var totalRowIndex = currentRow;
    var footerVals = ['TOTAL KESELURUHAN', '', '', '', '', '', '', totalPcs, (items.length || blocks.length) + ' Varian'];
    sheet.getRange(totalRowIndex, 1, 1, footerVals.length).setValues([footerVals]);
    sheet.getRange(totalRowIndex, 1, 1, 7).merge();
    var footerRange = sheet.getRange(totalRowIndex, 1, 1, footerVals.length);
    footerRange.setFontSize(10).setFontWeight('bold').setBackground('#E2E8F0').setFontColor('#0F172A').setVerticalAlignment('middle');
    sheet.getRange(totalRowIndex, 1).setHorizontalAlignment('right');
    sheet.getRange(totalRowIndex, 8).setHorizontalAlignment('center').setFontColor('#BE123C').setBackground('#FFE4E6');
    sheet.getRange(totalRowIndex, 9).setHorizontalAlignment('left').setFontColor('#475569');
    footerRange.setBorder(true, true, true, true, true, true, '#94A3B8', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(totalRowIndex, 30);

    // 5. Lebar Kolom
    sheet.setColumnWidth(1, 40);  // NO
    sheet.setColumnWidth(2, 65);  // FOTO
    sheet.setColumnWidth(3, 100); // KODE
    sheet.setColumnWidth(4, 200); // NAMA
    sheet.setColumnWidth(5, 110); // UP / VENDOR
    sheet.setColumnWidth(6, 110); // WARNA
    sheet.setColumnWidth(7, 70);  // SIZE
    sheet.setColumnWidth(8, 85);  // QTY
    sheet.setColumnWidth(9, 220); // CATATAN

    return {
      success: true,
      sheetId: sheet.getSheetId(),
      sheetName: targetSheetName
    };
  } catch (err) {
    Logger.log('writeSingleDateSheet error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Buat atau update tab ringkasan indeks DAFTAR_TANGGAL
 * Mempermudah navigasi langsung ke sheet tanggal tertentu
 */
function updateIndexDaftarTanggal(ss) {
  try {
    var indexSheetName = 'DAFTAR_TANGGAL';
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
      // Deteksi tab tanggal: format DD-MM-YYYY atau memiliki (CMT)/(Kargo)
      if (/^\d{2}-\d{2}-\d{4}/.test(name)) {
        var tgl = '';
        var kategori = '';
        var totalQty = '';
        var totalVarian = '';
        try {
          tgl = s.getRange('B2').getValue();
          kategori = s.getRange('E2').getValue();
          totalQty = s.getRange('H2').getValue();
          totalVarian = s.getRange('H3').getValue();
        } catch (e) {}

        rows.push([
          no++,
          name,
          tgl || name,
          kategori || '-',
          totalQty || '-',
          totalVarian || '-',
          '=HYPERLINK("#gid=' + s.getSheetId() + '", "Buka Tab ' + name + '")'
        ]);
      }
    }

    sheet.clearContents();
    sheet.clearFormats();

    // Judul Indeks
    sheet.getRange('A1:G1').merge();
    sheet.getRange('A1').setValue('DAFTAR INDEKS TANGGAL PENERIMAAN PRODUKSI')
      .setFontSize(13).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 35);

    var headers = ['NO', 'TAB SHEET', 'TANGGAL PENERIMAAN', 'KATEGORI', 'TOTAL DATANG', 'TOTAL VARIAN', 'LINK NAVIGASI'];
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(2, 1, 1, headers.length);
    headerRange.setBackground('#BE123C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9.5).setHorizontalAlignment('center');
    sheet.setRowHeight(2, 26);

    if (rows.length > 0) {
      sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
      var dataRange = sheet.getRange(3, 1, rows.length, headers.length);
      dataRange.setFontSize(9.5).setVerticalAlignment('middle');
      dataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(3, 1, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(3, 2, rows.length, 1).setFontWeight('bold');
      sheet.getRange(3, 4, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(3, 5, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor('#0369A1');
      sheet.getRange(3, 6, rows.length, 1).setHorizontalAlignment('center');
      sheet.getRange(3, 7, rows.length, 1).setHorizontalAlignment('center').setFontColor('#2563EB');
    }

    sheet.setColumnWidth(1, 45);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 160);
    sheet.setColumnWidth(4, 110);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 160);
  } catch (err) {
    Logger.log('updateIndexDaftarTanggal error: ' + err.toString());
  }
}
