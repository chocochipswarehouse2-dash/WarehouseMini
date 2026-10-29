const fs = require('fs');
const path = require('path');

// ==============================================================================
// 1. UPDATE gas/produksi_sheet.js
// ==============================================================================
const gasPath = path.join(__dirname, '../gas/produksi_sheet.js');
let gas = fs.readFileSync(gasPath, 'utf8');

// Replacement 1: Column definitions and headers in renderProductBlocksMatrix
const oldGasColDefs = `    // Kolom Indeks (1-based) setelah kolom Tanggal & Retur:
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
    }`;

const newGasColDefs = `    // Kolom Indeks (1-based) setelah kolom Tanggal & Retur:
    // 1. TOTAL DATANG (Per Row per size - unmerged)
    // 2. TOTAL AWAL (NET) (Merged per model/block)
    // 3. QTY NOTA (Merged per model/block - diisi Buyer)
    // 4. TOTAL HITUNG ULANG (Merged per model/block - sum fisik audit) [khusus Master Sheet]
    // 5. SELISIH NOTA (Merged per model/block - 4 kondisi rumus)
    // + Jika Master Sheet (!isSpecificDate): QTY HITUNG ULANG (row), SELISIH FISIK (row), STATUS AUDIT (row), LOG HITUNG ULANG (row)
    var colRowTotalDatang = 8 + numDateCols + (isCMT && numReturCols > 0 ? numReturCols : 0);
    var colTotalAwal = colRowTotalDatang + 1;
    var colQtyNota = colRowTotalDatang + 2;
    var colTotalHitung = !isSpecificDate ? (colRowTotalDatang + 3) : -1;
    var colSelisihNota = !isSpecificDate ? (colRowTotalDatang + 4) : (colRowTotalDatang + 3);
    var colFisik = !isSpecificDate ? (colRowTotalDatang + 5) : -1;
    var colSelisihFisik = !isSpecificDate ? (colRowTotalDatang + 6) : -1;
    var colStatus = !isSpecificDate ? (colRowTotalDatang + 7) : -1;
    var colLog = !isSpecificDate ? (colRowTotalDatang + 8) : -1;
    var totalCols = !isSpecificDate ? (colRowTotalDatang + 8) : (colRowTotalDatang + 3);
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
    row1Vals.push('TOTAL DATANG');
    row1Vals.push('TOTAL AWAL (NET)');
    row1Vals.push('QTY NOTA');
    if (!isSpecificDate) {
      row1Vals.push('TOTAL HITUNG ULANG');
      row1Vals.push('SELISIH NOTA');
      row1Vals.push('QTY HITUNG ULANG');
      row1Vals.push('SELISIH FISIK');
      row1Vals.push('STATUS AUDIT');
      row1Vals.push('LOG HITUNG ULANG');
    } else {
      row1Vals.push('SELISIH NOTA');
    }`;

gas = gas.replace(oldGasColDefs, newGasColDefs);

// Replacement 2: Header row 2 values
const oldGasRow2Vals = `    row2Vals.push(''); // TOTAL DATANG (NET)
    row2Vals.push(''); // QTY NOTA
    row2Vals.push(''); // SELISIH
    if (!isSpecificDate) {
      row2Vals.push('');
      row2Vals.push('');
      row2Vals.push('');
      row2Vals.push('');
    }`;

const newGasRow2Vals = `    row2Vals.push(''); // TOTAL DATANG (Row)
    row2Vals.push(''); // TOTAL AWAL (NET)
    row2Vals.push(''); // QTY NOTA
    if (!isSpecificDate) {
      row2Vals.push(''); // TOTAL HITUNG ULANG
      row2Vals.push(''); // SELISIH NOTA
      row2Vals.push(''); // QTY HITUNG ULANG (Row)
      row2Vals.push(''); // SELISIH FISIK (Row)
      row2Vals.push(''); // STATUS AUDIT (Row)
      row2Vals.push(''); // LOG HITUNG ULANG (Row)
    } else {
      row2Vals.push(''); // SELISIH NOTA
    }`;

gas = gas.replace(oldGasRow2Vals, newGasRow2Vals);

// Replacement 3: Header merging
const oldGasHeaderMerge = `    sheet.getRange(headerRow1Index, colTotalDatang, 2, 1).merge(); // TOTAL DATANG (NET)
    sheet.getRange(headerRow1Index, colQtyNota, 2, 1).merge(); // QTY NOTA
    sheet.getRange(headerRow1Index, colSelisihNota, 2, 1).merge(); // SELISIH

    if (!isSpecificDate) {
      sheet.getRange(headerRow1Index, colSelisihNota + 1, 2, 1).merge(); // FISIK
      sheet.getRange(headerRow1Index, colSelisihNota + 2, 2, 1).merge(); // SELISIH FISIK
      sheet.getRange(headerRow1Index, colSelisihNota + 3, 2, 1).merge(); // STATUS
      sheet.getRange(headerRow1Index, colSelisihNota + 4, 2, 1).merge(); // LOG
    }`;

const newGasHeaderMerge = `    sheet.getRange(headerRow1Index, colRowTotalDatang, 2, 1).merge(); // TOTAL DATANG (Row)
    sheet.getRange(headerRow1Index, colTotalAwal, 2, 1).merge(); // TOTAL AWAL (NET)
    sheet.getRange(headerRow1Index, colQtyNota, 2, 1).merge(); // QTY NOTA
    if (!isSpecificDate) {
      sheet.getRange(headerRow1Index, colTotalHitung, 2, 1).merge(); // TOTAL HITUNG ULANG
      sheet.getRange(headerRow1Index, colSelisihNota, 2, 1).merge(); // SELISIH NOTA
      sheet.getRange(headerRow1Index, colFisik, 2, 1).merge(); // QTY HITUNG ULANG (Row)
      sheet.getRange(headerRow1Index, colSelisihFisik, 2, 1).merge(); // SELISIH FISIK (Row)
      sheet.getRange(headerRow1Index, colStatus, 2, 1).merge(); // STATUS AUDIT (Row)
      sheet.getRange(headerRow1Index, colLog, 2, 1).merge(); // LOG HITUNG ULANG (Row)
    } else {
      sheet.getRange(headerRow1Index, colSelisihNota, 2, 1).merge(); // SELISIH NOTA
    }`;

gas = gas.replace(oldGasHeaderMerge, newGasHeaderMerge);

// Replacement 4: Data rows population in renderProductBlocksMatrix
const oldGasDataRowVals = `        var rowNet = (isSpecificDate && rowDatang > 0)
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
        }`;

const newGasDataRowVals = `        var rowNet = (isSpecificDate && rowDatang > 0)
          ? rowDatang
          : (isCMT ? Math.max(0, (rowDatang - rowRetur)) : (Number(sz.totalSizeQty) || rowDatang));

        // 1. TOTAL DATANG (Per row size - unmerged!)
        dataRowVals.push(rowNet);

        // 2-5. Ringkasan Blok (TOTAL AWAL, QTY NOTA, TOTAL HITUNG ULANG, SELISIH NOTA) - diisi di baris pertama blok
        if (!isFirstRowWritten) {
          dataRowVals.push(finalBlockTotalNet); // TOTAL AWAL (NET)
          dataRowVals.push(initialQtyNota);     // QTY NOTA
          if (!isSpecificDate) {
            dataRowVals.push('');               // TOTAL HITUNG ULANG (Formula dipasang di bawah)
            dataRowVals.push('');               // SELISIH NOTA (Formula 4 kondisi dipasang di bawah)
          } else {
            dataRowVals.push('');               // SELISIH NOTA
          }
          isFirstRowWritten = true;
        } else {
          dataRowVals.push('');
          dataRowVals.push('');
          if (!isSpecificDate) {
            dataRowVals.push('');
            dataRowVals.push('');
          } else {
            dataRowVals.push('');
          }
        }

        // 6-9. Rincian Audit Per Row (QTY HITUNG ULANG, SELISIH FISIK, STATUS AUDIT, LOG)
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
        }`;

gas = gas.replace(oldGasDataRowVals, newGasDataRowVals);

// Replacement 5: Merge and Formulas at end of block
const oldGasBlockMergeAndFormulas = `      if (numBlockRows > 1) {
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
      var selisihFormula = '';
      if (!isSpecificDate) {
        // Master Sheet: terdapat kolom QTY HITUNG ULANG (colSelisihNota + 1)
        var colFisikLetter = colToLetter(colSelisihNota + 1);
        var fisikRange = colFisikLetter + startDataRowIndex + ':' + colFisikLetter + endDataRowIndex;
        // Jika ada hasil hitung ulang fisik (COUNT > 0), bandingkan SUM(QTY HITUNG ULANG) dengan QTY NOTA.
        // Jika belum ada hasil hitung ulang fisik, pembandingnya adalah TOTAL DATANG (NET).
        selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", IF(COUNT(' + fisikRange + ')>0, SUM(' + fisikRange + ')-' + qtyNotaCellRef + ', ' + totalDatangCellRef + '-' + qtyNotaCellRef + '))';
      } else {
        // Sheet Tanggal Satuan: pembanding adalah Total Datang kedatangan tanggal tersebut
        selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", ' + totalDatangCellRef + '-' + qtyNotaCellRef + ')';
      }
      var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);
      selisihCellRange.setFormula(selisihFormula).setNumberFormat('0').setFontWeight('bold').setFontSize(11);

      // Styling khusus kolom TOTAL DATANG & QTY NOTA
      sheet.getRange(startDataRowIndex, colTotalDatang, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#F8FAFC');
      sheet.getRange(startDataRowIndex, colQtyNota, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#FFFBEB').setFontColor('#92400E');

      selisihRangesForCF.push(sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1));`;

const newGasBlockMergeAndFormulas = `      if (numBlockRows > 1) {
        sheet.getRange(startDataRowIndex, 1, numBlockRows, 1).merge(); // NO
        sheet.getRange(startDataRowIndex, 2, numBlockRows, 1).merge(); // CODE
        sheet.getRange(startDataRowIndex, 3, numBlockRows, 1).merge(); // PRODUCT NAME
        sheet.getRange(startDataRowIndex, 4, numBlockRows, 1).merge(); // UP
        sheet.getRange(startDataRowIndex, 5, numBlockRows, 1).merge(); // PHOTO
        sheet.getRange(startDataRowIndex, colTotalAwal, numBlockRows, 1).merge(); // TOTAL AWAL (NET)
        sheet.getRange(startDataRowIndex, colQtyNota, numBlockRows, 1).merge(); // QTY NOTA
        if (!isSpecificDate) {
          sheet.getRange(startDataRowIndex, colTotalHitung, numBlockRows, 1).merge(); // TOTAL HITUNG ULANG
          sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1).merge(); // SELISIH NOTA
        } else {
          sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1).merge(); // SELISIH NOTA
        }
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

      // 1. Pasang Formula TOTAL DATANG per Row
      var startDateLetter = colToLetter(8);
      var endDateLetter = colToLetter(8 + numDateCols - 1);
      for (var rIdx = startDataRowIndex; rIdx <= endDataRowIndex; rIdx++) {
        if (isCMT && numReturCols > 0) {
          var startRetLetter = colToLetter(8 + numDateCols);
          var endRetLetter = colToLetter(8 + numDateCols + numReturCols - 1);
          sheet.getRange(rIdx, colRowTotalDatang).setFormula(
            '=SUM(' + startDateLetter + rIdx + ':' + endDateLetter + rIdx + ')-SUM(' + startRetLetter + rIdx + ':' + endRetLetter + rIdx + ')'
          );
        } else {
          sheet.getRange(rIdx, colRowTotalDatang).setFormula(
            '=SUM(' + startDateLetter + rIdx + ':' + endDateLetter + rIdx + ')'
          );
        }
      }

      // 2. Pasang Formula TOTAL AWAL (NET) (Sum dari seluruh TOTAL DATANG baris)
      var colRowTotalLetter = colToLetter(colRowTotalDatang);
      sheet.getRange(startDataRowIndex, colTotalAwal).setFormula(
        '=SUM(' + colRowTotalLetter + startDataRowIndex + ':' + colRowTotalLetter + endDataRowIndex + ')'
      );

      var totalAwalCellRef = colToLetter(colTotalAwal) + startDataRowIndex;
      var qtyNotaCellRef = colToLetter(colQtyNota) + startDataRowIndex;

      // 3. Pasang Formula TOTAL HITUNG ULANG & SELISIH NOTA 4 KONDISI
      if (!isSpecificDate) {
        var colFisikLetter = colToLetter(colFisik);
        var fisikRange = colFisikLetter + startDataRowIndex + ':' + colFisikLetter + endDataRowIndex;
        var totalHitungCellRef = colToLetter(colTotalHitung) + startDataRowIndex;

        // TOTAL HITUNG ULANG = sum seluruh QTY HITUNG ULANG jika ada yang diisi
        sheet.getRange(startDataRowIndex, colTotalHitung).setFormula(
          '=IF(COUNT(' + fisikRange + ')>0, SUM(' + fisikRange + '), "")'
        ).setNumberFormat('0').setFontWeight('bold').setFontSize(11).setBackground('#F0FDF4').setFontColor('#166534');

        // SELISIH NOTA:
        // Jika Qty Nota terisi:
        //   - jika sudah hitung: Total Hitung Ulang - Qty Nota
        //   - jika belum hitung: Total Awal - Qty Nota
        // Jika Qty Nota kosong:
        //   - jika sudah hitung: Total Hitung Ulang - Total Awal
        //   - jika belum hitung: kosong ("")
        var selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), IF(ISBLANK(' + totalHitungCellRef + '), "", ' + totalHitungCellRef + '-' + totalAwalCellRef + '), IF(ISBLANK(' + totalHitungCellRef + '), ' + totalAwalCellRef + '-' + qtyNotaCellRef + ', ' + totalHitungCellRef + '-' + qtyNotaCellRef + '))';
        var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);
        selisihCellRange.setFormula(selisihFormula).setNumberFormat('0').setFontWeight('bold').setFontSize(11);

        // Pasang Formula SELISIH FISIK & STATUS AUDIT per Row
        var colSelisihFisikLetter = colToLetter(colSelisihFisik);
        for (var rf = startDataRowIndex; rf <= endDataRowIndex; rf++) {
          sheet.getRange(rf, colSelisihFisik).setFormula(
            '=IF(ISBLANK(' + colFisikLetter + rf + '), "", ' + colFisikLetter + rf + '-' + colRowTotalLetter + rf + ')'
          );
          sheet.getRange(rf, colStatus).setFormula(
            '=IF(ISBLANK(' + colSelisihFisikLetter + rf + '), "", IF(' + colSelisihFisikLetter + rf + '=0, "MATCH", IF(' + colSelisihFisikLetter + rf + '<0, "KURANG", "LEBIH")))'
          );
        }
      } else {
        var selisihFormula = '=IF(ISBLANK(' + qtyNotaCellRef + '), "", ' + totalAwalCellRef + '-' + qtyNotaCellRef + ')';
        var selisihCellRange = sheet.getRange(startDataRowIndex, colSelisihNota);
        selisihCellRange.setFormula(selisihFormula).setNumberFormat('0').setFontWeight('bold').setFontSize(11);
      }

      // Styling khusus kolom TOTAL AWAL & QTY NOTA
      sheet.getRange(startDataRowIndex, colRowTotalDatang, numBlockRows, 1).setFontWeight('bold').setBackground('#F8FAFC');
      sheet.getRange(startDataRowIndex, colTotalAwal, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#F1F5F9');
      sheet.getRange(startDataRowIndex, colQtyNota, numBlockRows, 1).setFontWeight('bold').setFontSize(11).setBackground('#FFFBEB').setFontColor('#92400E');

      selisihRangesForCF.push(sheet.getRange(startDataRowIndex, colSelisihNota, numBlockRows, 1));`;

gas = gas.replace(oldGasBlockMergeAndFormulas, newGasBlockMergeAndFormulas);

// Replacement 6: Column widths in renderProductBlocksMatrix
const oldGasColWidths = `    sheet.setColumnWidth(fColTotal, 120);     // TOTAL DATANG (NET)
    sheet.setColumnWidth(fColTotal + 1, 105); // QTY NOTA
    sheet.setColumnWidth(fColTotal + 2, 100); // SELISIH
    if (!isSpecificDate) {
      sheet.setColumnWidth(fColTotal + 3, 125); // QTY HITUNG ULANG
      sheet.setColumnWidth(fColTotal + 4, 130); // SELISIH HITUNG ULANG
      sheet.setColumnWidth(fColTotal + 5, 110); // STATUS AUDIT
      sheet.setColumnWidth(fColTotal + 6, 260); // LOG HITUNG ULANG
    }`;

const newGasColWidths = `    sheet.setColumnWidth(fColTotal, 75);      // TOTAL DATANG (Row)
    sheet.setColumnWidth(fColTotal + 1, 95);  // TOTAL AWAL (NET)
    sheet.setColumnWidth(fColTotal + 2, 90);  // QTY NOTA
    if (!isSpecificDate) {
      sheet.setColumnWidth(fColTotal + 3, 105); // TOTAL HITUNG ULANG
      sheet.setColumnWidth(fColTotal + 4, 95);  // SELISIH NOTA
      sheet.setColumnWidth(fColTotal + 5, 85);  // QTY HITUNG ULANG (Row)
      sheet.setColumnWidth(fColTotal + 6, 80);  // SELISIH FISIK (Row)
      sheet.setColumnWidth(fColTotal + 7, 95);  // STATUS AUDIT (Row)
      sheet.setColumnWidth(fColTotal + 8, 240); // LOG HITUNG ULANG (Row)
    } else {
      sheet.setColumnWidth(fColTotal + 3, 95);  // SELISIH NOTA
    }`;

gas = gas.replace(oldGasColWidths, newGasColWidths);

fs.writeFileSync(gasPath, gas, 'utf8');
console.log('gas/produksi_sheet.js updated successfully with complete layout & formulas.');

