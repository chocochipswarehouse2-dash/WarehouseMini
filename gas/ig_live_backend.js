/**
 * SISTEM BACKEND GOOGLE APPS SCRIPT - CHOCOCHIPS IG LIVE WMS (VERSI TERUPDATE)
 * Terintegrasi 2-Arah dengan Frontend WMS Inventory & Supabase
 * 
 * Script ID: 1niTufmejkWtUnCCfStve3mvLMQakZEZ7eCJ27wehHWmC8nPkkSwyDW4A
 * Deployment: AKfycbyCAAs6oYeW1TJKq3mq_C2Lt1SxoVzVg2yeS8atAHlDsip5jDWQ2aJpRQ66oKPQdhU7dw
 * 
 * Struktur Kolom Sheet "Pesanan LIVE":
 * - Kolom A s/d AL (1 - 38) : Data Murni dari Sheet Sumber ("TRANSAKSI") — TIDAK DISENTUH FRONTEND
 * - Kolom AM (39 / idx 38)  : Order ID Permanen (ORD-YYMMDD-XXX)
 * - Kolom AN (40 / idx 39)  : Tanggal Input Permanen
 * - Kolom AO (41 / idx 40)  : Log Perubahan Terakhir
 * - Kolom AP (42 / idx 41)  : Diubah Oleh (User / WMS)
 * - Kolom AQ (43 / idx 42)  : Resi (Diupdate dari Frontend WMS)
 * - Kolom AR (44 / idx 43)  : Ekspedisi (Diupdate dari Frontend WMS)
 * - Kolom AS (45 / idx 44)  : Status WMS (Diproses / Dikirim / Selesai / Batal dari Frontend WMS)
 */

const SOURCE_SPREADSHEET_ID = "1rmtcRFdxdHS-5wWuToak8wIj40wY9GmH"; // ID file sumber
const SOURCE_SHEET_NAME = "TRANSAKSI";
const TARGET_SHEET_NAME = "Pesanan LIVE";
const TOTAL_MANAGED_COLS = 45; // Kolom A (1) s/d AS (45)

// ==========================================
// 1. API GET: TARIK DATA DARI GSHEET KE WMS
// ==========================================
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    
    if (!sheet) {
      return jsonResponse({
        success: false,
        message: "Sheet '" + TARGET_SHEET_NAME + "' tidak ditemukan di spreadsheet."
      });
    }

    // Parameter opsional: ?sync=true untuk sinkronisasi otomatis sebelum mengambil data
    if (e && e.parameter && (e.parameter.sync === "true" || e.parameter.action === "sync")) {
      sinkronisasiPesananLiveDenganLog();
      sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    }

    ensureSystemHeaders(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return jsonResponse({
        success: true,
        orders: [],
        total: 0,
        message: "Belum ada data pesanan di sheet."
      });
    }

    // Ambil seluruh data dari baris 3 s/d kolom AS (minimal 45 kolom)
    const maxCols = Math.max(TOTAL_MANAGED_COLS, sheet.getLastColumn());
    const data = sheet.getRange(3, 1, lastRow - 2, maxCols).getValues();
    const orderMap = {};
    const orderList = [];

    // Hitung nomor urut Order ID tertinggi yang sudah ada untuk auto-assign jika ada baris yang belum punya Order ID di Kolom AM
    let maxOrderNum = 0;
    const keyToExistingOrderId = {};
    for (let i = 0; i < data.length; i++) {
      const existingId = String(data[i][38] || "").trim();
      if (existingId) {
        const m = existingId.match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxOrderNum) maxOrderNum = num;
        }
        const k = normalisasiKunci(data[i][0], data[i][1], data[i][2]);
        if (k && !keyToExistingOrderId[k]) {
          keyToExistingOrderId[k] = existingId;
        }
      }
    }

    const now = new Date();
    const timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm");
    let lastAssignedKey = "";
    let lastAssignedOrderId = "";

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const rowIndex = i + 3; // nomor baris aktual di gsheet
      
      const tanggalRaw = r[0];
      const nama = String(r[1] || "").trim();
      const hp = String(r[2] || "").trim();
      const alamat = String(r[3] || "").trim();
      const kode = String(r[4] || "").trim();
      const namaProduk = String(r[5] || "").trim();
      const size = String(r[6] || "-").trim();
      const sku = String(r[7] || kode || "").trim();
      const hargaLive = Number(r[8]) || 0;
      const qty = Number(r[9]) || 1;
      const price = Number(r[10]) || (hargaLive * qty);
      const ongkir = Number(r[11]) || 0;
      const total = Number(r[12]) || 0;
      const rawStatus = String(r[13] || "").trim();
      const keterangan = String(r[14] || "").trim();
      const resiSumber = String(r[15] || "").trim();

      // Lewati baris kosong
      if (!nama && !hp && !sku && !namaProduk && !kode) continue;
      
      // Order ID di Kolom AM (indeks 38 / kolom 39)
      let orderId = String(r[38] || "").trim();
      const currentKey = normalisasiKunci(tanggalRaw, nama, hp);

      // Jika Kolom AM masih kosong, buatkan Order ID permanen & langsung kunci ke Kolom AM agar update dari Frontend tidak pernah gagal
      if (!orderId) {
        if (currentKey && currentKey === lastAssignedKey && lastAssignedOrderId) {
          orderId = lastAssignedOrderId;
        } else if (currentKey && keyToExistingOrderId[currentKey]) {
          orderId = keyToExistingOrderId[currentKey];
        } else {
          maxOrderNum++;
          const dateCode = ekstrakDateCode(tanggalRaw, now);
          orderId = "ORD-" + dateCode + "-" + String(maxOrderNum).padStart(3, "0");
          if (currentKey) keyToExistingOrderId[currentKey] = orderId;
        }
        sheet.getRange(rowIndex, 39).setValue(orderId); // Kolom AM
        if (!r[39]) {
          sheet.getRange(rowIndex, 40).setValue(timestampNow); // Kolom AN
        }
      }

      lastAssignedKey = currentKey;
      lastAssignedOrderId = orderId;

      // Kolom AO (indeks 40 / kolom 41) = Log Perubahan Terakhir
      // Kolom AQ (indeks 42 / kolom 43) = Resi dari Frontend WMS
      // Kolom AR (indeks 43 / kolom 44) = Ekspedisi dari Frontend WMS
      // Kolom AS (indeks 44 / kolom 45) = Status WMS dari Frontend WMS
      const logAO = String(r[40] || "").trim();
      const resiAQ = String(r[42] || "").trim();
      const ekspedisiAR = String(r[43] || "").trim();
      const statusAS = String(r[44] || "").trim();

      // Prioritas Resi: Ambil dari Kolom AQ (Frontend WMS), fallback ke Kolom P (Sumber) jika AQ kosong
      const resi = (resiAQ && resiAQ !== "-") ? resiAQ : resiSumber;

      // Normalisasi Tanggal ke Format YYYY-MM-DD HH:mm:ss
      let tanggalStr = "";
      if (tanggalRaw instanceof Date) {
        tanggalStr = Utilities.formatDate(tanggalRaw, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
      } else {
        tanggalStr = String(tanggalRaw || "");
      }

      // Standarisasi Status WMS:
      // Prioritas 1: Kolom AS (Status WMS)
      // Prioritas 2: Kolom AQ (Jika sudah ada Resi -> otomatis Dikirim kecuali sudah Selesai/Batal)
      // Prioritas 3: Kolom N (Status Sumber)
      let statusWms = parseWmsStatus(statusAS || rawStatus, resi, logAO);

      // Deteksi Ekspedisi: Prioritas Utama dari Kolom AR (Frontend WMS), fallback ke Keterangan (Kolom O), Default JNE REG
      let ekspedisi = "JNE";
      let layanan = "REG";

      const parsedFromAR = parseKurirString(ekspedisiAR);
      if (parsedFromAR) {
        ekspedisi = parsedFromAR.ekspedisi;
        layanan = parsedFromAR.layanan;
      } else {
        const kurirMatch = keterangan.match(/\[Kurir:\s*([^\]]+)\]/i);
        const parsedFromKet = parseKurirString(kurirMatch ? kurirMatch[1] : keterangan);
        if (parsedFromKet) {
          ekspedisi = parsedFromKet.ekspedisi;
          layanan = parsedFromKet.layanan;
        }
      }

      // Item Produk
      const itemObj = {
        row_index: rowIndex,
        kode: kode,
        sku: sku,
        nama_produk: namaProduk,
        size: size,
        qty: qty,
        harga: hargaLive,
        total_harga: price
      };

      if (!orderMap[orderId]) {
        orderMap[orderId] = {
          id: orderId,
          no_pesanan: orderId,
          tanggal: tanggalStr,
          session_live: "IG Live Session",
          username_ig: nama ? ("@" + nama.toLowerCase().replace(/\s+/g, "_")) : "@customer",
          nama_pembeli: nama,
          no_telp: hp,
          alamat_lengkap: alamat,
          kota_kabupaten: "",
          ekspedisi: ekspedisi,
          layanan: layanan,
          no_resi: resi || "-",
          resi_aq: resiAQ || "",
          ekspedisi_ar: ekspedisiAR || "",
          status_as: statusAS || "",
          biaya_ongkir: ongkir,
          total_bayar: total || (price + ongkir),
          status: statusWms,
          catatan: keterangan,
          items: [itemObj],
          row_indexes: [rowIndex]
        };
        orderList.push(orderMap[orderId]);
      } else {
        // Gabungkan produk ke order yang sama (multi-item)
        orderMap[orderId].items.push(itemObj);
        orderMap[orderId].row_indexes.push(rowIndex);
        if (!orderMap[orderId].total_bayar) {
          orderMap[orderId].total_bayar += price;
        }
        // Jika baris lanjutan memiliki resi di AQ atau ekspedisi di AR, pastikan terambil
        if ((orderMap[orderId].no_resi === "-" || !orderMap[orderId].no_resi) && resi && resi !== "-") {
          orderMap[orderId].no_resi = resi;
          orderMap[orderId].resi_aq = resiAQ || resi;
          if (orderMap[orderId].status === "siap_diproses" || orderMap[orderId].status === "diproses") {
            orderMap[orderId].status = "dikirim";
          }
        }
        if (!orderMap[orderId].ekspedisi_ar && ekspedisiAR) {
          orderMap[orderId].ekspedisi_ar = ekspedisiAR;
          orderMap[orderId].ekspedisi = ekspedisi;
          orderMap[orderId].layanan = layanan;
        }
        if (!orderMap[orderId].status_as && statusAS) {
          orderMap[orderId].status_as = statusAS;
          orderMap[orderId].status = statusWms;
        }
      }
    }

    return jsonResponse({
      success: true,
      total_orders: orderList.length,
      orders: orderList,
      timestamp: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss")
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      message: "Terjadi kesalahan server: " + err.message
    });
  }
}

// ==========================================
// 2. API POST: UPDATE DARI WMS BALIK KE GSHEET (KOLOM AQ, AR & AS)
// ==========================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockErr) {
    return jsonResponse({ success: false, message: "Server sedang sibuk menyimpan data lain, silakan coba lagi." });
  }

  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errParse) {
        payload = e.parameter || {};
      }
    } else {
      payload = e ? e.parameter : {};
    }

    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, message: "Sheet '" + TARGET_SHEET_NAME + "' tidak ditemukan" });
    }

    ensureSystemHeaders(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return jsonResponse({ success: false, message: "Sheet kosong" });
    }

    const now = new Date();
    const timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm");
    const activeUser = String(payload.updated_by || payload.operator || "WMS App").trim();

    // AKSI 1: TRIGGER SINKRONISASI
    if (action === "sync") {
      sinkronisasiPesananLiveDenganLog();
      return jsonResponse({ success: true, message: "Sinkronisasi berhasil dijalankan." });
    }

    // AKSI 2: UPDATE NOMOR RESI DARI FRONTEND -> TULIS KE KOLOM AQ (43), EKSPEDISI KE KOLOM AR (44), STATUS KE KOLOM AS (45)
    // (Kolom A - AL tidak disentuh sama sekali agar tidak bentrok dengan trigger sinkronisasi sumber)
    if (action === "updateResi") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const newResi = String(payload.no_resi || payload.resi || "").trim();
      const newStatus = String(payload.status || "Dikirim").trim();

      if (!targetOrderId || !newResi) {
        return jsonResponse({ success: false, message: "order_id dan no_resi wajib diisi." });
      }

      const matchedRows = findMatchingRowsByOrderId(sheet, lastRow, targetOrderId);

      for (let m = 0; m < matchedRows.length; m++) {
        const rowNum = matchedRows[m];
        // Tulis Resi ke Kolom AQ (Kolom 43)
        sheet.getRange(rowNum, 43).setValue(newResi);

        // Jika ekspedisi dikirim bersamaan, tulis juga ke Kolom AR (Kolom 44)
        if (payload.ekspedisi) {
          const kurirAR = formatEkspedisiAR(payload.ekspedisi, payload.layanan);
          if (kurirAR) {
            sheet.getRange(rowNum, 44).setValue(kurirAR);
          }
        }

        // Tulis Status ke Kolom AS (Kolom 45)
        if (newStatus) {
          sheet.getRange(rowNum, 45).setValue(newStatus);
        }

        sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Resi diupdate via WMS (AQ): " + newResi); // AO
        sheet.getRange(rowNum, 42).setValue(activeUser); // AP
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: matchedRows.length > 0,
        matched_rows: matchedRows.length,
        target_columns: { resi: "AQ", ekspedisi: "AR", status: "AS" },
        message: matchedRows.length > 0
          ? "Resi berhasil ditulis ke Kolom AQ (" + matchedRows.length + " baris)."
          : "Order ID '" + targetOrderId + "' tidak ditemukan di Kolom AM."
      });
    }

    // AKSI 2B: BULK UPDATE RESI MASSAL DARI FRONTEND -> TULIS SEKALIGUS KE KOLOM AQ, AR, AS
    if (action === "bulkUpdateResi") {
      const updates = Array.isArray(payload.updates) ? payload.updates : [];
      if (updates.length === 0) {
        return jsonResponse({ success: false, message: "Daftar updates kosong." });
      }

      let totalMatchedRows = 0;
      let updatedOrderCount = 0;

      for (let u = 0; u < updates.length; u++) {
        const item = updates[u] || {};
        const targetOrderId = String(item.order_id || item.no_pesanan || item.id || "").trim();
        const newResi = String(item.no_resi || item.newResi || item.resi || "").trim();
        const newStatus = String(item.status || "Dikirim").trim();

        if (!targetOrderId || !newResi) continue;

        const matchedRows = findMatchingRowsByOrderId(sheet, lastRow, targetOrderId);
        if (matchedRows.length > 0) updatedOrderCount++;

        for (let m = 0; m < matchedRows.length; m++) {
          const rowNum = matchedRows[m];
          sheet.getRange(rowNum, 43).setValue(newResi); // AQ
          if (item.ekspedisi) {
            const kurirAR = formatEkspedisiAR(item.ekspedisi, item.layanan);
            if (kurirAR) sheet.getRange(rowNum, 44).setValue(kurirAR); // AR
          }
          sheet.getRange(rowNum, 45).setValue(newStatus); // AS
          sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Bulk Resi via WMS (AQ): " + newResi); // AO
          sheet.getRange(rowNum, 42).setValue(activeUser); // AP
          totalMatchedRows++;
        }
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: updatedOrderCount > 0,
        updated_orders: updatedOrderCount,
        matched_rows: totalMatchedRows,
        message: updatedOrderCount + " pesanan (" + totalMatchedRows + " baris) berhasil diupdate ke Kolom AQ."
      });
    }

    // AKSI 3: UPDATE STATUS -> TULIS KE KOLOM AS (45) & LOG KOLOM AO (41) TANPA MENIMPA KOLOM A-AL
    if (action === "updateStatus") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const newStatus = String(payload.status || "").trim();
      const alasanBatal = String(payload.alasan_batal || "").trim();

      if (!targetOrderId || !newStatus) {
        return jsonResponse({ success: false, message: "order_id dan status wajib diisi." });
      }

      const statusValueAS = alasanBatal ? (newStatus + " (" + alasanBatal + ")") : newStatus;
      const matchedRows = findMatchingRowsByOrderId(sheet, lastRow, targetOrderId);

      for (let m = 0; m < matchedRows.length; m++) {
        const rowNum = matchedRows[m];
        sheet.getRange(rowNum, 45).setValue(statusValueAS); // Kolom AS = Status WMS
        sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Status diubah via WMS menjadi: " + statusValueAS); // AO
        sheet.getRange(rowNum, 42).setValue(activeUser); // AP
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: matchedRows.length > 0,
        matched_rows: matchedRows.length,
        target_column: "AS",
        message: matchedRows.length > 0
          ? "Status berhasil disimpan di Kolom AS (" + matchedRows.length + " baris)."
          : "Order ID '" + targetOrderId + "' tidak ditemukan."
      });
    }

    // AKSI 4: UPDATE EKSPEDISI / KURIR DARI FRONTEND -> TULIS KE KOLOM AR (44)
    // (Kolom A - AL tidak disentuh agar tidak bentrok dengan trigger sinkronisasi sumber)
    if (action === "updateCourier" || action === "updateEkspedisi") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const newEkspedisi = String(payload.ekspedisi || "JNE").trim();
      const newLayanan = String(payload.layanan || "REG").trim();

      if (!targetOrderId) {
        return jsonResponse({ success: false, message: "order_id wajib diisi." });
      }

      const kurirAR = formatEkspedisiAR(newEkspedisi, newLayanan);
      const matchedRows = findMatchingRowsByOrderId(sheet, lastRow, targetOrderId);

      for (let m = 0; m < matchedRows.length; m++) {
        const rowNum = matchedRows[m];
        // Tulis pilihan ekspedisi ke Kolom AR (Kolom 44)
        sheet.getRange(rowNum, 44).setValue(kurirAR);
        sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Ekspedisi diubah via WMS (AR): " + kurirAR); // AO
        sheet.getRange(rowNum, 42).setValue(activeUser); // AP
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: matchedRows.length > 0,
        matched_rows: matchedRows.length,
        target_column: "AR",
        message: matchedRows.length > 0
          ? "Ekspedisi berhasil ditulis ke Kolom AR (" + matchedRows.length + " baris)."
          : "Order ID '" + targetOrderId + "' tidak ditemukan."
      });
    }

    // AKSI 5: EDIT PESANAN DARI FRONTEND -> RESI KE KOLOM AQ (43), EKSPEDISI KE KOLOM AR (44), STATUS KE KOLOM AS (45)
    if (action === "editOrder") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const matchedRows = findMatchingRowsByOrderId(sheet, lastRow, targetOrderId);

      for (let m = 0; m < matchedRows.length; m++) {
        const rowNum = matchedRows[m];
        if (payload.no_resi !== undefined) {
          const cleanR = String(payload.no_resi || "").trim();
          sheet.getRange(rowNum, 43).setValue(cleanR === "-" ? "" : cleanR); // Kolom AQ = Resi
        }
        if (payload.ekspedisi) {
          const kurirAR = formatEkspedisiAR(payload.ekspedisi, payload.layanan);
          sheet.getRange(rowNum, 44).setValue(kurirAR); // Kolom AR = Ekspedisi
        }
        if (payload.status) {
          sheet.getRange(rowNum, 45).setValue(String(payload.status).trim()); // Kolom AS = Status WMS
        }

        sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Data Resi/Ekspedisi (AQ/AR) diedit via WMS");
        sheet.getRange(rowNum, 42).setValue(activeUser);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        success: matchedRows.length > 0,
        matched_rows: matchedRows.length,
        message: matchedRows.length > 0
          ? "Pesanan berhasil diupdate di Kolom AQ & AR."
          : "Order ID '" + targetOrderId + "' tidak ditemukan."
      });
    }

    return jsonResponse({ success: false, message: "Aksi tidak dikenal: " + action });

  } catch (err) {
    return jsonResponse({ success: false, message: "Error POST: " + err.message });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

// ==========================================
// 3. FUNGSI SINKRONISASI SUMBER (KOLOM A-AL DARI SUMBER, AM-AS DIPERTAHANKAN)
// ==========================================
function sinkronisasiPesananLiveDenganLog() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    Logger.log("Sinkronisasi dilewati karena lock sedang digunakan proses lain.");
    return;
  }

  try {
    const targetSS = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = targetSS.getSheetByName(TARGET_SHEET_NAME);
    if (!targetSheet) return;

    // 1. Pastikan Header Kolom Sistem & Frontend WMS (AM s/d AS) tersedia
    ensureSystemHeaders(targetSheet);

    // 2. Buka spreadsheet sumber
    let sourceSS;
    try {
      sourceSS = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
    } catch (e) {
      Logger.log("Gagal membuka file sumber: " + e.message);
      return;
    }
    const sourceSheet = sourceSS.getSheetByName(SOURCE_SHEET_NAME);
    if (!sourceSheet) return;

    const sourceLastRow = sourceSheet.getLastRow();
    if (sourceLastRow < 3) return;

    // 3. Ambil data sumber (Kolom A s/d AL = 38 kolom)
    const sourceData = sourceSheet.getRange(3, 1, sourceLastRow - 2, 38).getValues();

    // 4. Ambil data lama di sheet tujuan (Kolom A s/d AS = 45 kolom)
    const targetLastRow = targetSheet.getLastRow();
    let targetData = [];
    if (targetLastRow >= 3) {
      const readCols = Math.max(TOTAL_MANAGED_COLS, targetSheet.getLastColumn());
      targetData = targetSheet.getRange(3, 1, targetLastRow - 2, readCols).getValues();
    }

    const now = new Date();
    const timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm");
    
    let activeUser = "";
    try {
      activeUser = Session.getActiveUser().getEmail();
      if (!activeUser) activeUser = Session.getEffectiveUser().getEmail();
    } catch (e) {}
    if (!activeUser) activeUser = "chocochips.warehouse2@gmail.com";

    const columnHeaders = [
      "Tanggal", "Nama Pemesan", "No HP", "Alamat", "Kode", "Product Name",
      "Size", "SKU", "Harga LIVE", "Qty", "Price", "Shipping", "Total",
      "Status", "Keterangan", "Resi"
    ];

    // 5. PETA ORDER ID LAMA & DATA FRONTEND (KOLOM AM s/d AS AGAR TIDAK PERNAH TERHAPUS / TERTUKAR)
    const orderMap = {};
    const frontendDataByOrderId = {};
    const frontendDataByCustomerKey = {};
    let maxOrderNum = 0;

    for (let i = 0; i < targetData.length; i++) {
      const tRow = targetData[i];
      const existingOrderId = String(tRow[38] || "").trim(); // Kolom AM
      const existingInputAN = tRow[39] || "";                // Kolom AN
      const existingLogAO   = String(tRow[40] || "").trim(); // Kolom AO
      const existingEditAP  = String(tRow[41] || "").trim(); // Kolom AP
      const existingResiAQ  = String(tRow[42] || "").trim(); // Kolom AQ
      const existingEkspAR  = String(tRow[43] || "").trim(); // Kolom AR
      const existingStatAS  = String(tRow[44] || "").trim(); // Kolom AS
      const key = normalisasiKunci(tRow[0], tRow[1], tRow[2]);

      if (existingOrderId) {
        if (key && !orderMap[key]) {
          orderMap[key] = existingOrderId;
        }

        if (!frontendDataByOrderId[existingOrderId]) {
          frontendDataByOrderId[existingOrderId] = {
            inputAN: existingInputAN,
            logAO: existingLogAO,
            editorAP: existingEditAP,
            resiAQ: "",
            ekspAR: "",
            statAS: ""
          };
        }
        if (existingResiAQ && existingResiAQ !== "-") {
          frontendDataByOrderId[existingOrderId].resiAQ = existingResiAQ;
        }
        if (existingEkspAR && existingEkspAR !== "-") {
          frontendDataByOrderId[existingOrderId].ekspAR = existingEkspAR;
        }
        if (existingStatAS && existingStatAS !== "-") {
          frontendDataByOrderId[existingOrderId].statAS = existingStatAS;
        }
        if (existingLogAO && !frontendDataByOrderId[existingOrderId].logAO) {
          frontendDataByOrderId[existingOrderId].logAO = existingLogAO;
        }
        
        const match = existingOrderId.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxOrderNum) maxOrderNum = num;
        }
      }

      if (key) {
        if (!frontendDataByCustomerKey[key]) {
          frontendDataByCustomerKey[key] = { resiAQ: "", ekspAR: "", statAS: "" };
        }
        if (existingResiAQ && existingResiAQ !== "-") {
          frontendDataByCustomerKey[key].resiAQ = existingResiAQ;
        }
        if (existingEkspAR && existingEkspAR !== "-") {
          frontendDataByCustomerKey[key].ekspAR = existingEkspAR;
        }
        if (existingStatAS && existingStatAS !== "-") {
          frontendDataByCustomerKey[key].statAS = existingStatAS;
        }
      }
    }

    const finalRows = [];
    let lastAssignedOrderId = "";
    let lastAssignedKey = "";

    for (let i = 0; i < sourceData.length; i++) {
      const sRow = sourceData[i];
      if (!sRow[0] && !sRow[1] && !sRow[4] && !sRow[7]) continue;

      const tRow = (i < targetData.length) ? targetData[i] : null;
      const currentKey = normalisasiKunci(sRow[0], sRow[1], sRow[2]);
      const dateCode = ekstrakDateCode(sRow[0], now);

      // --- LOGIKA PENENTUAN ORDER ID (PERMANEN) ---
      let orderId = "";

      // 1. Jika baris ini sama dengan baris tepat di atasnya (gabungan 1 invoice/paket)
      if (currentKey && currentKey === lastAssignedKey && lastAssignedOrderId) {
        orderId = lastAssignedOrderId;
      }
      // 2. Jika customer ini sudah punya Order ID terdaftar di peta
      else if (currentKey && orderMap[currentKey]) {
        orderId = orderMap[currentKey];
      }
      // 3. Jika baris di posisi yang sama memiliki kunci customer yang sama dan sudah punya Order ID
      else if (tRow && String(tRow[38] || "").trim() !== "" && normalisasiKunci(tRow[0], tRow[1], tRow[2]) === currentKey) {
        orderId = String(tRow[38]).trim();
        if (currentKey) orderMap[currentKey] = orderId;
      }
      // 4. Benar-benar baris pesanan BARU -> Buat Order ID baru
      else {
        maxOrderNum++;
        orderId = "ORD-" + dateCode + "-" + String(maxOrderNum).padStart(3, "0");
        if (currentKey) orderMap[currentKey] = orderId;
      }

      lastAssignedOrderId = orderId;
      lastAssignedKey = currentKey;

      const savedByOrder = frontendDataByOrderId[orderId] || {};
      const savedByKey = (currentKey && frontendDataByCustomerKey[currentKey]) || {};
      const isSameRowOrder = tRow && String(tRow[38] || "").trim() === orderId;

      // --- TANGGAL INPUT PERMANEN (KOLOM AN) ---
      const tanggalInput = savedByOrder.inputAN || (isSameRowOrder && tRow[39]) || timestampNow;

      // --- LOG PERUBAHAN & EDITOR (KOLOM AO & AP) ---
      let lastLog = (isSameRowOrder && tRow[40]) ? String(tRow[40]) : (savedByOrder.logAO || "");
      let lastEditor = (isSameRowOrder && tRow[41]) ? String(tRow[41]) : (savedByOrder.editorAP || activeUser);

      if (!tRow && !lastLog) {
        lastLog = "[" + timestampNow + "] Data baru dibuat.";
        lastEditor = activeUser;
      } else if (isSameRowOrder) {
        const perubahans = [];
        for (let c = 0; c <= 15; c++) {
          const isPhoneCol = (c === 2);
          const valOld = formatCekNilai(tRow[c], isPhoneCol);
          const valNew = formatCekNilai(sRow[c], isPhoneCol);

          if (valOld !== valNew) {
            perubahans.push(columnHeaders[c] + " diubah: '" + valOld + "' -> '" + valNew + "'");
          }
        }

        if (perubahans.length > 0) {
          lastLog = "[" + timestampNow + "] " + perubahans.join("; ");
          lastEditor = activeUser;
        }
      }

      // Kolom A s/d AL (38 kolom) murni dari sheet sumber
      const rowLengkap = sRow.slice(0, 38);

      // Ambil nilai Kolom AQ (Resi), AR (Ekspedisi), & AS (Status WMS) berdasarkan Order ID
      const rowResiAQ = savedByOrder.resiAQ || (isSameRowOrder ? String(tRow[42] || "").trim() : "") || savedByKey.resiAQ || "";
      const rowEkspAR = savedByOrder.ekspAR || (isSameRowOrder ? String(tRow[43] || "").trim() : "") || savedByKey.ekspAR || "";
      const rowStatAS = savedByOrder.statAS || (isSameRowOrder ? String(tRow[44] || "").trim() : "") || savedByKey.statAS || "";

      rowLengkap.push(orderId);       // Kolom AM (39) = Order ID
      rowLengkap.push(tanggalInput);  // Kolom AN (40) = Tanggal Input
      rowLengkap.push(lastLog);       // Kolom AO (41) = Log Perubahan Terakhir
      rowLengkap.push(lastEditor);    // Kolom AP (42) = Diubah Oleh
      rowLengkap.push(rowResiAQ);     // Kolom AQ (43) = Resi dari Frontend WMS
      rowLengkap.push(rowEkspAR);     // Kolom AR (44) = Ekspedisi dari Frontend WMS
      rowLengkap.push(rowStatAS);     // Kolom AS (45) = Status WMS dari Frontend WMS

      finalRows.push(rowLengkap);
    }

    if (finalRows.length === 0) return;

    // 6. Tulis data (45 kolom: A s/d AS) & format tabel
    targetSheet.getRange(3, 1, finalRows.length, TOTAL_MANAGED_COLS).setValues(finalRows);
    rapikanFormatTabel(targetSheet, finalRows.length);

    Logger.log("Selesai. Order ID (AM) serta Resi (AQ), Ekspedisi (AR) & Status (AS) terkunci rapi.");
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

// ==========================================
// 4. HELPER FUNCTIONS
// ==========================================
function ensureSystemHeaders(sheet) {
  const headers = sheet.getRange("AM2:AS2").getValues()[0];
  const expected = [
    "Order ID",               // AM
    "Tanggal Input",          // AN
    "Log Perubahan Terakhir", // AO
    "Diubah Oleh",            // AP
    "Resi",                   // AQ
    "Ekspedisi",              // AR
    "Status WMS"              // AS
  ];
  let needsWrite = false;
  for (let i = 0; i < expected.length; i++) {
    if (String(headers[i] || "").trim() !== expected[i]) {
      needsWrite = true;
      break;
    }
  }
  if (needsWrite) {
    sheet.getRange("AM2:AS2").setValues([expected]);
  }
}

function findMatchingRowsByOrderId(sheet, lastRow, targetOrderId) {
  const cleanTarget = String(targetOrderId || "").trim().toUpperCase();
  if (!cleanTarget || lastRow < 3) return [];

  const orderIds = sheet.getRange(3, 39, lastRow - 2, 1).getValues(); // Kolom AM
  const matchedRows = [];

  for (let i = 0; i < orderIds.length; i++) {
    const cellOrderId = String(orderIds[i][0] || "").trim().toUpperCase();
    const rowNum = i + 3;
    if (cellOrderId === cleanTarget || cleanTarget === ("ORD-ROW-" + rowNum)) {
      matchedRows.push(rowNum);
    }
  }

  return matchedRows;
}

function formatEkspedisiAR(expRaw, layRaw) {
  const exp = String(expRaw || "").trim();
  const lay = String(layRaw || "").trim();
  if (!exp) return "";
  const expUp = exp.toUpperCase();
  if (expUp === "INSTAN" || expUp === "INSTANT") return "Instan";
  if (expUp === "SAMEDAY" || expUp === "SAME DAY") return "Sameday";
  if (expUp === "JNE") return "JNE " + (lay.toUpperCase().includes("YES") ? "YES" : "REG");
  if (lay && !expUp.includes(lay.toUpperCase())) return exp + " " + lay;
  return exp;
}

function parseKurirString(rawKurirStr) {
  const fkUpper = String(rawKurirStr || "").toUpperCase().trim();
  if (!fkUpper || fkUpper === "-") return null;
  if (fkUpper.includes("YES") || fkUpper.includes("JNE YES")) {
    return { ekspedisi: "JNE", layanan: "YES" };
  } else if (fkUpper.includes("INSTAN") || fkUpper.includes("INSTANT") || fkUpper.includes("GOSEND") || fkUpper.includes("GRAB")) {
    return { ekspedisi: "Instan", layanan: "Instant" };
  } else if (fkUpper.includes("SAMEDAY") || fkUpper.includes("SAME DAY")) {
    return { ekspedisi: "Sameday", layanan: "Sameday" };
  } else if (fkUpper.includes("J&T") || fkUpper === "JT") {
    return { ekspedisi: "J&T Express", layanan: "Reguler" };
  } else if (fkUpper.includes("SICEPAT")) {
    return { ekspedisi: "SiCepat", layanan: "Reguler" };
  } else if (fkUpper.includes("SPX")) {
    return { ekspedisi: "SPX Express", layanan: "Reguler" };
  } else if (fkUpper.includes("JNE")) {
    return { ekspedisi: "JNE", layanan: "REG" };
  }
  return null;
}

function parseWmsStatus(rawStatusStr, resiStr, logAOStr) {
  const sLower = String(rawStatusStr || "").toLowerCase().trim();
  const logLower = String(logAOStr || "").toLowerCase().trim();
  const hasResi = Boolean(resiStr && resiStr !== "-" && String(resiStr).trim() !== "");

  if (sLower.includes("batal") || sLower.includes("cancel")) return "batal";
  if (sLower.includes("selesai") || sLower.includes("done")) return "selesai";
  if (sLower.includes("kirim") || hasResi) return "dikirim";
  if (
    (sLower.includes("proses") && !sLower.includes("siap")) ||
    sLower.includes("packing") ||
    sLower.includes("pick")
  ) {
    return "diproses";
  }
  if (sLower.includes("tunggu") || sLower.includes("unpaid") || sLower.includes("belum")) {
    return "menunggu_pembayaran";
  }

  // Fallback cek log AO jika sebelumnya diupdate dari WMS sebelum kolom AS ada
  if (logLower.includes("status diubah via wms menjadi:")) {
    if (logLower.includes("batal")) return "batal";
    if (logLower.includes("selesai")) return "selesai";
    if (logLower.includes("dikirim")) return "dikirim";
    if (logLower.includes("diproses")) return "diproses";
  }

  return "siap_diproses";
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalisasiKunci(tanggal, nama, noHp) {
  let tglStr = "";
  if (tanggal instanceof Date) {
    tglStr = Utilities.formatDate(tanggal, "Asia/Jakarta", "yyyyMMdd");
  } else if (tanggal) {
    let str = String(tanggal).trim();
    let parts = str.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        tglStr = parts[0] + parts[1].padStart(2, "0") + parts[2].padStart(2, "0");
      } else {
        tglStr = parts[2] + parts[0].padStart(2, "0") + parts[1].padStart(2, "0");
      }
    } else {
      tglStr = str;
    }
  }

  let hpStr = String(noHp || "").replace(/[^0-9]/g, "").replace(/^0+/, "");
  let namaStr = String(nama || "").trim().toLowerCase();

  return hpStr ? (tglStr + "_" + hpStr) : (tglStr + "_" + namaStr);
}

function ekstrakDateCode(tanggal, defaultDate) {
  if (tanggal instanceof Date) {
    return Utilities.formatDate(tanggal, "Asia/Jakarta", "yyMMdd");
  }
  if (tanggal) {
    let str = String(tanggal).trim();
    let parts = str.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return parts[0].substring(2, 4) + parts[1].padStart(2, "0") + parts[2].padStart(2, "0");
      } else {
        return parts[2].substring(2, 4) + parts[0].padStart(2, "0") + parts[1].padStart(2, "0");
      }
    }
  }
  return Utilities.formatDate(defaultDate, "Asia/Jakarta", "yyMMdd");
}

function formatCekNilai(val, isPhone) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return Utilities.formatDate(val, "Asia/Jakarta", "yyyy-MM-dd");
  let str = String(val).trim();
  if (isPhone) return str.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return str;
}

function rapikanFormatTabel(sheet, numRows) {
  if (numRows < 1) return;
  const dataRange = sheet.getRange(3, 1, numRows, TOTAL_MANAGED_COLS);

  dataRange.setBorder(true, true, true, true, true, true, "#D0D7DE", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(3, 9, numRows, 1).setNumberFormat("#,##0");
  sheet.getRange(3, 11, numRows, 3).setNumberFormat("#,##0");

  sheet.getRange(3, 1, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(3, 5, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(3, 7, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(3, 10, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(3, 14, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(3, 16, numRows, 1).setHorizontalAlignment("center");

  sheet.getRange(3, 39, numRows, 2).setHorizontalAlignment("center");
  sheet.getRange(3, 42, numRows, 4).setHorizontalAlignment("center");
  sheet.getRange(3, 4, numRows, 1).setWrap(true);
  sheet.getRange(3, 41, numRows, 1).setWrap(true);

  sheet.getRange("AM2:AS2")
    .setBackground("#37474F")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}