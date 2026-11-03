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

    // Intercept Send Email Notification (Chocochips Official)
    if (payload.action === 'sendEmail' || payload.type === 'sendEmail') {
      return handleSendEmail(payload);
    }

    // Intercept Google Calendar Operations
    if (payload.action === 'syncCalendarEvent') {
      return handleGoogleCalendarSync(payload);
    }
    if (payload.action === 'fetchGoogleCalendar') {
      return handleGoogleCalendarFetch(payload);
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
 * Handle Pengiriman Email Formal Chocochips (Customer & PIC Store)
 */
function handleSendEmail(payload) {
  try {
    payload = payload || {};
    var rawTo = String(payload.to || '');
    var toList = rawTo
      .split(/[,;\n]+/)
      .map(function(e) { return e.trim(); })
      .filter(function(e) { return e.indexOf('@') > 0; });
    var to = toList.join(',');

    var rawCc = String(payload.cc || '');
    var ccList = rawCc
      .split(/[,;\n]+/)
      .map(function(e) { return e.trim(); })
      .filter(function(e) { return e.indexOf('@') > 0; });
    var cc = ccList.join(',');

    var subject = payload.subject || 'Notifikasi Pesanan Chocochips';
    var htmlBody = payload.htmlBody || payload.body || '';
    var fromName = payload.fromName || 'Chocochips';

    if (!to || !htmlBody) {
      return jsonResponse({ success: false, error: 'Target email (to) dan isi pesan (htmlBody) harus diisi.' });
    }

    var mailOpts = {
      to: to,
      subject: subject,
      htmlBody: htmlBody,
      name: fromName
    };
    if (cc) {
      mailOpts.cc = cc;
    }
    if (payload.replyTo) {
      mailOpts.replyTo = payload.replyTo;
    }

    MailApp.sendEmail(mailOpts);

    return jsonResponse({
      success: true,
      message: 'Email berhasil terkirim ke ' + to + (cc ? ' (CC: ' + cc + ')' : '')
    });
  } catch (err) {
    Logger.log('handleSendEmail error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * OPTIONS handler — untuk preflight CORS
 */
function doOptions(e) {
  return jsonResponse({ status: 'ok', message: 'WMS GAS Webhook Active (WhatsApp Only)' });
}

/**
 * Output helper response JSON
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGoogleCalendarSync(payload) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    if (!cal) {
      return jsonResponse({ success: false, error: 'Google Calendar default tidak ditemukan.' });
    }

    var data = payload.eventData || payload;
    var googleEventId = data.google_event_id;

    // Aksi hapus event
    if (data.is_delete) {
      if (googleEventId) {
        try {
          var evToDelete = cal.getEventById(googleEventId);
          if (evToDelete) {
            evToDelete.deleteEvent();
          }
        } catch (delErr) {
          Logger.log('Gagal hapus event di Google Calendar: ' + delErr.toString());
        }
      }
      return jsonResponse({ success: true, action: 'deleted', google_event_id: null });
    }

    if (!data.start_date) {
      return jsonResponse({ success: false, error: 'Tanggal mulai (start_date) harus diisi.' });
    }

    var title = (data.title || 'Agenda WMS').trim();
    var descParts = [];
    if (data.description) descParts.push(data.description.trim());
    if (data.pic) descParts.push('PIC: ' + data.pic.trim());
    if (data.category) descParts.push('Kategori: ' + data.category);
    descParts.push('[WMS-ID: ' + (data.id || '') + ']');

    var options = {
      description: descParts.join('\n'),
      location: (data.location || '').trim()
    };

    var startParts = data.start_date.split('-');
    var sYear = parseInt(startParts[0], 10);
    var sMonth = parseInt(startParts[1], 10) - 1;
    var sDay = parseInt(startParts[2], 10);

    var endParts = (data.end_date || data.start_date).split('-');
    var eYear = parseInt(endParts[0], 10);
    var eMonth = parseInt(endParts[1], 10) - 1;
    var eDay = parseInt(endParts[2], 10);

    var targetEvent = null;
    if (googleEventId) {
      try {
        targetEvent = cal.getEventById(googleEventId);
      } catch (findErr) {
        Logger.log('Event id tidak ditemukan di Google Calendar: ' + findErr.toString());
      }
    }

    // Jika google_event_id tidak disediakan / tidak ditemukan, cari event yang sudah ada berdasarkan WMS-ID atau judul + rentang tanggal
    if (!targetEvent && data.id) {
      try {
        var searchStart = new Date(sYear, sMonth, sDay - 1);
        var searchEnd = new Date(eYear, eMonth, eDay + 2);
        var rangeEvents = cal.getEvents(searchStart, searchEnd);
        for (var rIdx = 0; rIdx < rangeEvents.length; rIdx++) {
          var evCand = rangeEvents[rIdx];
          var evDesc = evCand.getDescription() || '';
          if (evDesc.indexOf('[WMS-ID: ' + data.id + ']') > -1) {
            targetEvent = evCand;
            break;
          }
          if (evCand.getTitle().trim().toLowerCase() === title.toLowerCase()) {
            targetEvent = evCand;
            break;
          }
        }
      } catch (searchErr) {
        Logger.log('Pencarian event Google Calendar fallback error: ' + searchErr.toString());
      }
    }

    var isAllDay = Boolean(data.is_all_day || !data.start_time);

    if (isAllDay) {
      var dStart = new Date(sYear, sMonth, sDay);
      var dEnd = new Date(eYear, eMonth, eDay);
      // Di Google Calendar, end date untuk all-day event bersifat exclusive (tambah 1 hari)
      dEnd.setDate(dEnd.getDate() + 1);

      if (targetEvent) {
        targetEvent.setTitle(title);
        targetEvent.setAllDayDates(dStart, dEnd);
        targetEvent.setDescription(options.description);
        targetEvent.setLocation(options.location);
      } else {
        targetEvent = cal.createAllDayEvent(title, dStart, dEnd, options);
      }
    } else {
      var sTimeParts = (data.start_time || '09:00').split(':');
      var sHour = parseInt(sTimeParts[0], 10) || 9;
      var sMin = parseInt(sTimeParts[1], 10) || 0;

      var eTimeParts = (data.end_time || (sHour + 1) + ':' + sMin).split(':');
      var eHour = parseInt(eTimeParts[0], 10) || (sHour + 1);
      var eMin = parseInt(eTimeParts[1], 10) || 0;

      var dtStart = new Date(sYear, sMonth, sDay, sHour, sMin, 0);
      var dtEnd = new Date(eYear, eMonth, eDay, eHour, eMin, 0);

      // Pastikan dtEnd >= dtStart
      if (dtEnd <= dtStart) {
        dtEnd = new Date(dtStart.getTime() + (60 * 60 * 1000));
      }

      if (targetEvent) {
        targetEvent.setTitle(title);
        targetEvent.setTime(dtStart, dtEnd);
        targetEvent.setDescription(options.description);
        targetEvent.setLocation(options.location);
      } else {
        targetEvent = cal.createEvent(title, dtStart, dtEnd, options);
      }
    }

    return jsonResponse({
      success: true,
      google_event_id: targetEvent ? targetEvent.getId() : null,
      message: 'Berhasil disinkronkan dengan Google Calendar'
    });
  } catch (err) {
    Logger.log('handleGoogleCalendarSync error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Menarik daftar event dari Google Calendar ke WMS
 */
function handleGoogleCalendarFetch(payload) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    if (!cal) {
      return jsonResponse({ success: false, error: 'Google Calendar default tidak ditemukan.' });
    }

    var now = new Date();
    // Default rentang: 30 hari ke belakang s/d 90 hari ke depan
    var startTime = payload.startDate ? new Date(payload.startDate) : new Date(now.getTime() - (60 * 24 * 3600 * 1000));
    var endTime = payload.endDate ? new Date(payload.endDate) : new Date(now.getTime() + (180 * 24 * 3600 * 1000));

    var events = cal.getEvents(startTime, endTime);
    var list = [];

    var pad = function(n) { return (n < 10 ? '0' : '') + n; };

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var isAllDay = ev.isAllDayEvent();
      var sDate = ev.getStartTime();
      var eDate = ev.getEndTime();

      var desc = ev.getDescription() || '';
      var wmsIdMatch = desc.match(/\[WMS-ID:\s*([^\]]+)\]/);
      var wmsId = wmsIdMatch ? wmsIdMatch[1].trim() : null;

      var sDateStr = sDate.getFullYear() + '-' + pad(sDate.getMonth() + 1) + '-' + pad(sDate.getDate());
      var eDateStr = '';
      if (isAllDay) {
        // Kurangi 1 hari karena Google Calendar menyimpan end date all-day secara exclusive (+1 hari)
        var adjEnd = new Date(eDate.getTime() - (24 * 3600 * 1000));
        if (adjEnd < sDate) adjEnd = sDate;
        eDateStr = adjEnd.getFullYear() + '-' + pad(adjEnd.getMonth() + 1) + '-' + pad(adjEnd.getDate());
      } else {
        eDateStr = eDate.getFullYear() + '-' + pad(eDate.getMonth() + 1) + '-' + pad(eDate.getDate());
      }

      var sTimeStr = isAllDay ? '' : (pad(sDate.getHours()) + ':' + pad(sDate.getMinutes()));
      var eTimeStr = isAllDay ? '' : (pad(eDate.getHours()) + ':' + pad(eDate.getMinutes()));

      var lastUpdatedStr = '';
      try {
        if (ev.getLastUpdated) {
          lastUpdatedStr = ev.getLastUpdated().toISOString();
        }
      } catch (upErr) {}

      var cleanDesc = desc;
      var picMatch = desc.match(/PIC:\s*([^\n\r]+)/i);
      var picVal = picMatch ? picMatch[1].trim() : '';
      var catMatch = desc.match(/Kategori:\s*([^\n\r]+)/i);
      var catVal = catMatch ? catMatch[1].trim() : '';

      cleanDesc = cleanDesc
        .replace(/\[WMS-ID:\s*[^\\\]]+\]/gi, '')
        .replace(/PIC:\s*[^\n\r]+/gi, '')
        .replace(/Kategori:\s*[^\n\r]+/gi, '')
        .trim();

      list.push({
        google_event_id: ev.getId(),
        wms_id: wmsId,
        title: ev.getTitle() || 'Tanpa Judul',
        description: cleanDesc,
        location: ev.getLocation() || '',
        start_date: sDateStr,
        end_date: eDateStr,
        start_time: sTimeStr,
        end_time: eTimeStr,
        is_all_day: isAllDay,
        pic: picVal,
        category: catVal,
        updated_at: lastUpdatedStr
      });
    }

    return jsonResponse({
      success: true,
      events: list,
      count: list.length
    });
  } catch (err) {
    Logger.log('handleGoogleCalendarFetch error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() });
  }
}



/**
 * Fungsi sekali jalan untuk memicu dialog otorisasi izin Calendar di Apps Script Editor
 */
function authorizeGoogleCalendar() {
  var cal = CalendarApp.getDefaultCalendar();
  Logger.log('Google Calendar berhasil diotorisasi: ' + cal.getName());
  return cal.getName();
}

