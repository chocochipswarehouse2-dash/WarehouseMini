/**
 * WMS GAS BACKEND — webhook.gs (WHATSAPP SCAN ONLY)
 * =================================================
 * Hanya menangani Webhook WhatsApp (Fonnte) & GDrive Upload.
 * Fungsi sinkronisasi / penulisan data dari Supabase ke Google Sheets telah dinonaktifkan.
 * Satu-satunya alasan GAS aktif adalah untuk menerima scan WhatsApp dari Fonnte.
 */

/**
 * Handler POST — menerima webhook
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      if (e && e.parameter) {
        var p = e.parameter;
        if ((p.message || p.text || p.pesan) && (p.sender || p.from || p.phone)) {
          return handleWhatsAppScan(p);
        }
      }
      return jsonResponse({ success: false, error: 'No payload received' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      payload = e.parameter || {};
    }

    // Intercept GDrive Image Upload
    if (payload.base64File && payload.fileName) {
      return handleGDriveUpload(payload);
    }

    // Intercept WhatsApp / Fonnte payload (SATU-SATUNYA TUJUAN GAS)
    if ((payload.message || payload.text || payload.pesan) && (payload.sender || payload.from || payload.phone)) {
      return handleWhatsAppScan(payload);
    }

    // Penulisan data dari Supabase ke Google Sheet dinonaktifkan permanen
    return jsonResponse({
      success: true,
      message: 'Supabase to Google Sheets sync is disabled. Only WhatsApp webhook is active.'
    });

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle GDrive File Upload (Image)
 */
function handleGDriveUpload(payload) {
  try {
    payload = payload || {};
    var folderId = payload.folderId || '1oFx9WFm8Ch_DlOxw66WRy4nH-kIAXwcw';
    
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (fErr) {
      Logger.log('Folder ID tidak valid/tidak ditemukan, menggunakan root folder: ' + fErr.toString());
      folder = DriveApp.getRootFolder();
    }
    
    var data = payload.base64File || payload.base64 || '';
    if (!data) {
      return jsonResponse({ success: false, error: 'Tidak ada data file base64 yang dikirim.' });
    }
    
    if (data.indexOf(',') > -1) {
      data = data.split(',')[1];
    }
    
    var fileName = payload.fileName || payload.filename || ('Reject_' + new Date().getTime() + '.jpg');
    var mimeType = payload.mimeType || 'image/jpeg';
    
    var decoded = Utilities.base64Decode(data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = folder.createFile(blob);
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log('Warning sharing: ' + shareErr.toString());
    }
    
    return jsonResponse({
      success: true,
      url: file.getUrl(),
      id: file.getId(),
      fileId: file.getId(),
      name: file.getName()
    });
  } catch (err) {
    Logger.log('GDrive upload error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * OPTIONS handler — untuk preflight CORS
 */
function doOptions(e) {
  return jsonResponse({ status: 'ok', message: 'WMS GAS Webhook Active (WhatsApp Only)' });
}
