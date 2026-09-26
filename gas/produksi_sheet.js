/**
 * WMS PRODUKSI GOOGLE SPREADSHEET SYNC
 * ====================================
 * Spreadsheet ID : 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 * Script ID      : 1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb
 *
 * Menulis hasil input/riwayat penerimaan produksi ke Google Sheet dengan
 * lampiran gambar via formula =IMAGE("url").
 */

var TARGET_PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';

/**
 * Handler utama untuk doPost action: 'pushPenerimaanProduksi'
 */
function handlePushPenerimaanProduksi(data) {
  try {
    var ssId = data.spreadsheetId || TARGET_PRODUKSI_SPREADSHEET_ID;
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

    // Inisialisasi Header jika sheet masih kosong / baris <= 1
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#059669'); // Hijau Emerald WMS
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 36);

      // Atur lebar kolom yang rapi
      sheet.setColumnWidth(1, 45);  // No
      sheet.setColumnWidth(2, 120); // Tanggal Penerimaan
      sheet.setColumnWidth(3, 95);  // Kategori
      sheet.setColumnWidth(4, 140); // No Surat Jalan
      sheet.setColumnWidth(5, 130); // Kode Produksi
      sheet.setColumnWidth(6, 110); // Warna
      sheet.setColumnWidth(7, 75);  // Size
      sheet.setColumnWidth(8, 80);  // Qty (Pcs)
      sheet.setColumnWidth(9, 100); // Foto Produk (Gambar)
      sheet.setColumnWidth(10, 180);// Keterangan
      sheet.setColumnWidth(11, 120);// Operator
      sheet.setColumnWidth(12, 140);// Waktu Dibuat
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

      // Konversi Foto URL menjadi formula =IMAGE("url")
      var fotoFormula = '-';
      var rawFoto = String(it.foto_url || '').trim();
      if (rawFoto && (rawFoto.indexOf('http://') === 0 || rawFoto.indexOf('https://') === 0)) {
        fotoFormula = '=IMAGE("' + rawFoto + '", 4, 60, 60)';
      }

      rowsToAdd.push([
        rowNumber - 1, // Nomor Urut
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

      // Berikan tinggi baris 65px agar foto thumbnail terlihat jelas dan estetik
      for (var r = 0; r < rowsToAdd.length; r++) {
        var cRow = startRow + r;
        sheet.setRowHeight(cRow, 65);
      }

      // Format alignment & borders
      sheet.getRange(startRow, 1, rowsToAdd.length, 1).setHorizontalAlignment('center'); // No
      sheet.getRange(startRow, 2, rowsToAdd.length, 1).setHorizontalAlignment('center'); // Tanggal
      sheet.getRange(startRow, 3, rowsToAdd.length, 1).setHorizontalAlignment('center'); // Kategori
      sheet.getRange(startRow, 7, rowsToAdd.length, 2).setHorizontalAlignment('center'); // Size & Qty
      sheet.getRange(startRow, 9, rowsToAdd.length, 1).setHorizontalAlignment('center'); // Foto Produk
      
      // Vertical alignment middle untuk seluruh baris data baru
      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setVerticalAlignment('middle');

      // Border halus
      sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setBorder(
        true, true, true, true, true, true,
        '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    return {
      success: true,
      message: 'Sukses menulis ' + rowsToAdd.length + ' baris dengan lampiran gambar ke Google Sheet!',
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
