/**
 * WMS PRODUKSI GOOGLE SPREADSHEET SYNC (MASTER SPREADSHEET MATRIX FORMAT)
 * =======================================================================
 * Spreadsheet ID : 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 * Script ID      : 1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb
 *
 * Menulis hasil input & tabel matriks produksi ke Google Sheet persis seperti
 * format spreadsheet master bergambar (NO | CODE | PRODUCT NAME | UP | PHOTO | COLOR | SIZE | DATANG | RETUR | TOTAL DATANG NET)
 */

var TARGET_PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';

/**
 * Handler utama untuk doPost action: 'pushPenerimaanProduksi'
 */
function handlePushPenerimaanProduksi(data) {
  try {
    var ssId = data.spreadsheetId || TARGET_PRODUKSI_SPREADSHEET_ID;
    var activeTab = data.activeTab || 'CMT';
    var targetSheetName = data.sheetName || ('Master Produksi (' + activeTab + ')');

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

    var blocks = data.blocks || [];

    // Jika dikirim data blocks (format matriks spreadsheet master)
    if (blocks && blocks.length > 0) {
      sheet.clearContents();
      sheet.clearFormats();

      var isCMT = activeTab === 'CMT';
      var currentRow = 1;

      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];

        var headerRow1Index = currentRow;
        var headerRow2Index = currentRow + 1;

        var dateSlots = block.dateSlots || []; // 10 slots
        var returSlots = isCMT ? (block.returDateSlots || []) : []; // 5 slots
        var numDateCols = Math.max(10, dateSlots.length);
        var numReturCols = isCMT ? Math.max(5, returSlots.length) : 0;

        var totalCols = 7 + numDateCols + numReturCols + 1;

        // Header Row 1
        var row1Vals = ['NO', 'CODE', 'PRODUCT NAME', 'UP', 'PHOTO', 'COLOR', 'SIZE', 'QTY BARANG DATANG'];
        for (var d = 1; d < numDateCols; d++) row1Vals.push('');
        if (isCMT) {
          row1Vals.push('QTY BARANG RETUR');
          for (var r = 1; r < numReturCols; r++) row1Vals.push('');
        }
        row1Vals.push('TOTAL DATANG (NET)');

        // Header Row 2
        var row2Vals = ['', '', '', '', '', '', ''];
        for (var d1 = 0; d1 < numDateCols; d1++) {
          row2Vals.push(dateSlots[d1] ? formatDateHeader(dateSlots[d1]) : ('Tgl ' + (d1 + 1)));
        }
        if (isCMT) {
          for (var r1 = 0; r1 < numReturCols; r1++) {
            row2Vals.push(returSlots[r1] ? formatDateHeader(returSlots[r1]) : ('Ret ' + (r1 + 1)));
          }
        }
        row2Vals.push(''); // Total Datang Net span

        // Write Header Rows
        sheet.getRange(headerRow1Index, 1, 1, row1Vals.length).setValues([row1Vals]);
        sheet.getRange(headerRow2Index, 1, 1, row2Vals.length).setValues([row2Vals]);

        sheet.setRowHeight(headerRow1Index, 24);
        sheet.setRowHeight(headerRow2Index, 20);

        // Header Merges
        sheet.getRange(headerRow1Index, 1, 2, 1).merge(); // NO
        sheet.getRange(headerRow1Index, 2, 2, 1).merge(); // CODE
        sheet.getRange(headerRow1Index, 3, 2, 1).merge(); // PRODUCT NAME
        sheet.getRange(headerRow1Index, 4, 2, 1).merge(); // UP
        sheet.getRange(headerRow1Index, 5, 2, 1).merge(); // PHOTO
        sheet.getRange(headerRow1Index, 6, 2, 1).merge(); // COLOR
        sheet.getRange(headerRow1Index, 7, 2, 1).merge(); // SIZE

        // Merge Qty Datang
        sheet.getRange(headerRow1Index, 8, 1, numDateCols).merge();

        var nextColPointer = 8 + numDateCols;
        if (isCMT && numReturCols > 0) {
          sheet.getRange(headerRow1Index, nextColPointer, 1, numReturCols).merge();
          nextColPointer += numReturCols;
        }

        // Merge Total Datang (NET)
        sheet.getRange(headerRow1Index, nextColPointer, 2, 1).merge();

        // Style Header
        var headerRange = sheet.getRange(headerRow1Index, 1, 2, totalCols);
        headerRange.setBackground('#FCE8E6');
        headerRange.setFontColor('#0F172A');
        headerRange.setFontWeight('bold');
        headerRange.setFontSize(9);
        headerRange.setHorizontalAlignment('center');
        headerRange.setVerticalAlignment('middle');
        headerRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);

        currentRow += 2;

        // DATA ROWS
        var startDataRowIndex = currentRow;
        var colorGroups = block.colorGroups || [];

        for (var c = 0; c < colorGroups.length; c++) {
          var cg = colorGroups[c];
          var startColorRowIndex = currentRow;
          var sizes = cg.sizes || [];

          for (var s = 0; s < sizes.length; s++) {
            var sz = sizes[s];
            var dataRowVals = [
              block.rowNumber,
              block.code,
              block.productName || '',
              block.upVendor || '',
              '', // photo placeholder
              cg.color,
              sz.size
            ];

            // Datang Date Qty
            for (var d2 = 0; d2 < numDateCols; d2++) {
              var dKey = dateSlots[d2];
              var qVal = (dKey && sz.qtyByDate && sz.qtyByDate[dKey]) ? sz.qtyByDate[dKey] : '';
              dataRowVals.push(qVal);
            }

            // Retur Date Qty
            if (isCMT) {
              for (var r2 = 0; r2 < numReturCols; r2++) {
                var rKey = returSlots[r2];
                var rqVal = (rKey && sz.qtyReturByDate && sz.qtyReturByDate[rKey]) ? sz.qtyReturByDate[rKey] : '';
                dataRowVals.push(rqVal);
              }
            }

            // Net Total
            dataRowVals.push(block.totalNet || 0);

            sheet.getRange(currentRow, 1, 1, dataRowVals.length).setValues([dataRowVals]);
            sheet.setRowHeight(currentRow, 36);

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
          // Merge Main Info Columns across block
          if (numBlockRows > 1) {
            sheet.getRange(startDataRowIndex, 1, numBlockRows, 1).merge(); // NO
            sheet.getRange(startDataRowIndex, 2, numBlockRows, 1).merge(); // CODE
            sheet.getRange(startDataRowIndex, 3, numBlockRows, 1).merge(); // NAME
            sheet.getRange(startDataRowIndex, 4, numBlockRows, 1).merge(); // UP
            sheet.getRange(startDataRowIndex, 5, numBlockRows, 1).merge(); // PHOTO
            sheet.getRange(startDataRowIndex, totalCols, numBlockRows, 1).merge(); // NET
          }

          // Add Photo Formula in Photo Cell
          var rawPhotoUrl = String(block.photoUrl || '').trim();
          if (rawPhotoUrl && (rawPhotoUrl.indexOf('http://') === 0 || rawPhotoUrl.indexOf('https://') === 0)) {
            sheet.getRange(startDataRowIndex, 5).setFormula('=IMAGE("' + rawPhotoUrl + '", 4, 110, 110)');
          }

          // Alignments & Borders
          var blockDataRange = sheet.getRange(startDataRowIndex, 1, numBlockRows, totalCols);
          blockDataRange.setVerticalAlignment('middle');
          blockDataRange.setHorizontalAlignment('center');
          blockDataRange.setFontSize(9);
          blockDataRange.setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
        }

        currentRow += 2; // Spacer gap between product blocks
      }

      // Adjust column widths for Master Matrix
      sheet.setColumnWidth(1, 45);  // NO
      sheet.setColumnWidth(2, 90);  // CODE
      sheet.setColumnWidth(3, 160); // PRODUCT NAME
      sheet.setColumnWidth(4, 90);  // UP
      sheet.setColumnWidth(5, 130); // PHOTO
      sheet.setColumnWidth(6, 110); // COLOR
      sheet.setColumnWidth(7, 70);  // SIZE

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

    // Fallback: Jika hanya data flat items
    var headers = [
      'No', 'Tanggal Penerimaan', 'Kategori', 'No Surat Jalan', 'Kode Produksi',
      'Warna', 'Size', 'Qty (Pcs)', 'Foto Produk', 'Keterangan', 'Operator', 'Waktu Dibuat'
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
        sheet.setRowHeight(startRow + r, 65);
      }

      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setVerticalAlignment('middle');
      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setBorder(
        true, true, true, true, true, true,
        '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    return {
      success: true,
      message: 'Sukses menulis ' + rowsToAdd.length + ' baris ke Google Sheet!',
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
