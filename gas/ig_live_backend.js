/**
 * SISTEM BACKEND GOOGLE APPS SCRIPT - CHOOCHIPS IG LIVE WMS
 * Terintegrasi 2-Arah dengan Frontend Vercel WMS Inventory
 * 
 * Script ID: 1niTufmejkWtUnCCfStve3mvLMQakZEZ7eCJ27wehHWmC8nPkkSwyDW4A
 * Deployment: AKfycbyCAAs6oYeW1TJKq3mq_C2Lt1SxoVzVg2yeS8atAHlDsip5jDWQ2aJpRQ66oKPQdhU7dw
 * 
 * Fitur:
 * 1. sinkronisasiPesananLiveDenganLog(): Logika original Order ID permanen & log
 * 2. doGet(e): Mengirim daftar pesanan (grouped multi-item per Order ID) ke WMS Vercel
 * 3. doPost(e): Menerima update Resi, Status, dan Edit Pesanan langsung dari WMS ke GSheet
 */

const SOURCE_SPREADSHEET_ID = "1rmtcRFdxdHS-5wWuToak8wIj40wY9GmH"; // ID file sumber
const SOURCE_SHEET_NAME = "TRANSAKSI";
const TARGET_SHEET_NAME = "Pesanan LIVE";

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

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return jsonResponse({
        success: true,
        orders: [],
        total: 0,
        message: "Belum ada data pesanan di sheet."
      });
    }

    // Ambil seluruh data dari baris 3 s/d kolom AR (minimal 44 kolom: A-AL sumber, AM-AP sistem, AQ=Resi, AR=Ekspedisi)
    const maxCols = Math.max(44, sheet.getLastColumn());
    const data = sheet.getRange(3, 1, lastRow - 2, maxCols).getValues();
    const orderMap = {};
    const orderList = [];

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
      
      // Order ID di Kolom AM (indeks 38 / kolom 39)
      let orderId = String(r[38] || "").trim();
      if (!orderId) {
        orderId = "ORD-ROW-" + rowIndex;
      }

      // Kolom AQ (indeks 42 / kolom 43) = Resi dari Frontend WMS
      // Kolom AR (indeks 43 / kolom 44) = Ekspedisi dari Frontend WMS
      const resiAQ = String(r[42] || "").trim();
      const ekspedisiAR = String(r[43] || "").trim();

      // Prioritas Resi: Ambil dari Kolom AQ (Frontend WMS), fallback ke Kolom P (Sumber) jika AQ kosong
      const resi = (resiAQ && resiAQ !== "-") ? resiAQ : resiSumber;

      // Normalisasi Tanggal ke Format YYYY-MM-DD HH:mm:ss
      let tanggalStr = "";
      if (tanggalRaw instanceof Date) {
        tanggalStr = Utilities.formatDate(tanggalRaw, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
      } else {
        tanggalStr = String(tanggalRaw || "");
      }

      // Standarisasi Status WMS
      let statusWms = "siap_diproses";
      const sLower = rawStatus.toLowerCase();
      if (sLower.includes("batal") || sLower.includes("cancel")) {
        statusWms = "batal";
      } else if (sLower.includes("selesai") || sLower.includes("done")) {
        statusWms = "selesai";
      } else if (sLower.includes("kirim") || (resi !== "" && resi !== "-")) {
        statusWms = "dikirim";
      } else if (sLower.includes("proses") || sLower.includes("packing") || sLower.includes("pick")) {
        statusWms = "diproses";
      } else if (sLower.includes("tunggu") || sLower.includes("unpaid") || sLower.includes("belum")) {
        statusWms = "menunggu_pembayaran";
      }

      // Deteksi Ekspedisi: Prioritas Utama dari Kolom AR (Frontend WMS), fallback ke Keterangan (Kolom O), Default JNE REG
      let ekspedisi = "JNE";
      let layanan = "REG";

      const parseKurirString = function(rawKurirStr) {
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
      };

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
// 2. API POST: UPDATE DARI WMS BALIK KE GSHEET (KOLOM AQ & AR)
// ==========================================
function doPost(e) {
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
      return jsonResponse({ success: false, message: "Sheet tidak ditemukan" });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return jsonResponse({ success: false, message: "Sheet kosong" });
    }

    // Pastikan Header Kolom AQ (43) dan AR (44) tersedia
    if (!String(sheet.getRange("AQ2").getValue() || "").trim()) {
      sheet.getRange("AQ2").setValue("Resi");
    }
    if (!String(sheet.getRange("AR2").getValue() || "").trim()) {
      sheet.getRange("AR2").setValue("Ekspedisi");
    }

    const now = new Date();
    const timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm");
    let activeUser = "WMS Vercel App";

    // Helper format label ekspedisi untuk Kolom AR
    const formatEkspedisiAR = function(expRaw, layRaw) {
      const exp = String(expRaw || "").trim();
      const lay = String(layRaw || "").trim();
      if (!exp) return "";
      const expUp = exp.toUpperCase();
      if (expUp === "INSTAN" || expUp === "INSTANT") return "Instan";
      if (expUp === "SAMEDAY" || expUp === "SAME DAY") return "Sameday";
      if (expUp === "JNE") return "JNE " + (lay.toUpperCase() === "YES" ? "YES" : "REG");
      if (lay && !expUp.includes(lay.toUpperCase())) return exp + " " + lay;
      return exp;
    };

    // AKSI 1: TRIGGER SINKRONISASI
    if (action === "sync") {
      sinkronisasiPesananLiveDenganLog();
      return jsonResponse({ success: true, message: "Sinkronisasi berhasil dijalankan." });
    }

    // AKSI 2: UPDATE NOMOR RESI DARI FRONTEND -> TULIS KE KOLOM AQ (43) & EKSPEDISI KE KOLOM AR (44)
    // (Kolom A - AL tidak disentuh agar tidak bentrok dengan trigger sinkronisasi sumber)
    if (action === "updateResi") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const newResi = String(payload.no_resi || payload.resi || "").trim();

      if (!targetOrderId || !newResi) {
        return jsonResponse({ success: false, message: "order_id dan no_resi wajib diisi." });
      }

      // Cari baris dengan Order ID tersebut di Kolom AM (39)
      const orderIds = sheet.getRange(3, 39, lastRow - 2, 1).getValues();
      let matchedCount = 0;

      for (let i = 0; i < orderIds.length; i++) {
        if (String(orderIds[i][0]).trim() === targetOrderId) {
          const rowNum = i + 3;
          // Tulis Resi ke Kolom AQ (Kolom 43)
          sheet.getRange(rowNum, 43).setValue(newResi);

          // Jika ekspedisi dikirim bersamaan, tulis juga ke Kolom AR (Kolom 44)
          if (payload.ekspedisi) {
            const kurirAR = formatEkspedisiAR(payload.ekspedisi, payload.layanan);
            if (kurirAR) {
              sheet.getRange(rowNum, 44).setValue(kurirAR);
            }
          }

          sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Resi diupdate via WMS (AQ): " + newResi); // AO
          sheet.getRange(rowNum, 42).setValue(activeUser); // AP
          matchedCount++;
        }
      }

      return jsonResponse({
        success: matchedCount > 0,
        matched_rows: matchedCount,
        target_columns: { resi: "AQ", ekspedisi: "AR" },
        message: matchedCount > 0 ? "Resi berhasil ditulis ke Kolom AQ (" + matchedCount + " baris)." : "Order ID tidak ditemukan."
      });
    }

    // AKSI 3: UPDATE STATUS (Catat di Log Kolom AO & AP tanpa menimpa Kolom A-AL)
    if (action === "updateStatus") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const newStatus = String(payload.status || "").trim();

      const orderIds = sheet.getRange(3, 39, lastRow - 2, 1).getValues();
      let matchedCount = 0;

      for (let i = 0; i < orderIds.length; i++) {
        if (String(orderIds[i][0]).trim() === targetOrderId) {
          const rowNum = i + 3;
          sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Status diubah via WMS menjadi: " + newStatus);
          sheet.getRange(rowNum, 42).setValue(activeUser);
          matchedCount++;
        }
      }

      return jsonResponse({
        success: matchedCount > 0,
        message: "Status berhasil dicatat ke gsheet."
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
      const orderIds = sheet.getRange(3, 39, lastRow - 2, 1).getValues();
      let matchedCount = 0;

      for (let i = 0; i < orderIds.length; i++) {
        if (String(orderIds[i][0]).trim() === targetOrderId) {
          const rowNum = i + 3;
          // Tulis pilihan ekspedisi ke Kolom AR (Kolom 44)
          sheet.getRange(rowNum, 44).setValue(kurirAR);
          sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Ekspedisi diubah via WMS (AR): " + kurirAR); // AO
          sheet.getRange(rowNum, 42).setValue(activeUser); // AP
          matchedCount++;
        }
      }

      return jsonResponse({
        success: matchedCount > 0,
        matched_rows: matchedCount,
        target_column: "AR",
        message: matchedCount > 0 ? "Ekspedisi berhasil ditulis ke Kolom AR (" + matchedCount + " baris)." : "Order ID tidak ditemukan."
      });
    }

    // AKSI 5: EDIT PESANAN DARI FRONTEND -> RESI KE KOLOM AQ (43), EKSPEDISI KE KOLOM AR (44)
    if (action === "editOrder") {
      const targetOrderId = String(payload.order_id || payload.no_pesanan || "").trim();
      const orderIds = sheet.getRange(3, 39, lastRow - 2, 1).getValues();
      let matchedCount = 0;

      for (let i = 0; i < orderIds.length; i++) {
        if (String(orderIds[i][0]).trim() === targetOrderId) {
          const rowNum = i + 3;
          if (payload.no_resi !== undefined) {
            sheet.getRange(rowNum, 43).setValue(String(payload.no_resi || "").trim()); // Kolom AQ = Resi
          }
          if (payload.ekspedisi) {
            const kurirAR = formatEkspedisiAR(payload.ekspedisi, payload.layanan);
            sheet.getRange(rowNum, 44).setValue(kurirAR); // Kolom AR = Ekspedisi
          }

          sheet.getRange(rowNum, 41).setValue("[" + timestampNow + "] Data Resi/Ekspedisi (AQ/AR) diedit via WMS");
          sheet.getRange(rowNum, 42).setValue(activeUser);
          matchedCount++;
        }
      }

      return jsonResponse({
        success: matchedCount > 0,
        matched_rows: matchedCount,
        message: "Pesanan berhasil diupdate di Kolom AQ & AR."
      });
    }

    return jsonResponse({ success: false, message: "Aksi tidak dikenal: " + action });

  } catch (err) {
    return jsonResponse({ success: false, message: "Error POST: " + err.message });
  }
}

// Helper Response JSON
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. FUNGSI SINKRONISASI SUMBER (KOLOM A-AL DARI SUMBER, AM-AR DIPERTAHANKAN)
// ==========================================
function sinkronisasiPesananLiveDenganLog() {
  const targetSS = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = targetSS.getSheetByName(TARGET_SHEET_NAME);
  if (!targetSheet) return;

  // 1. Header Kolom Sistem & Frontend WMS (AM s/d AR)
  targetSheet.getRange("AM2").setValue("Order ID");
  targetSheet.getRange("AN2").setValue("Tanggal Input");
  targetSheet.getRange("AO2").setValue("Log Perubahan Terakhir");
  targetSheet.getRange("AP2").setValue("Diubah Oleh");
  targetSheet.getRange("AQ2").setValue("Resi");
  targetSheet.getRange("AR2").setValue("Ekspedisi");

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

  // 4. Ambil data lama di sheet tujuan (Kolom A s/d AR = 44 kolom)
  const targetLastRow = targetSheet.getLastRow();
  let targetData = [];
  if (targetLastRow >= 3) {
    const readCols = Math.max(44, targetSheet.getLastColumn());
    targetData = targetSheet.getRange(3, 1, targetLastRow - 2, readCols).getValues();
  }

  const now = new Date();
  const timestampNow = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm");
  
  let activeUser = Session.getActiveUser().getEmail();
  if (!activeUser || activeUser === "") {
    activeUser = Session.getEffectiveUser().getEmail() || "chocochips.warehouse2@gmail.com";
  }

  const columnHeaders = [
    "Tanggal", "Nama Pemesan", "No HP", "Alamat", "Kode", "Product Name",
    "Size", "SKU", "Harga LIVE", "Qty", "Price", "Shipping", "Total",
    "Status", "Keterangan", "Resi"
  ];

  // 5. PETA ORDER ID LAMA & DATA FRONTEND (KOLOM AQ & AR AGAR TIDAK PERNAH TERHAPUS)
  let orderMap = {};
  let frontendDataByOrderId = {};
  let maxOrderNum = 0;

  for (let i = 0; i < targetData.length; i++) {
    const tRow = targetData[i];
    const existingOrderId = String(tRow[38] || "").trim(); // Kolom AM
    const existingResiAQ = String(tRow[42] || "").trim();  // Kolom AQ
    const existingEkspAR = String(tRow[43] || "").trim();  // Kolom AR

    if (existingOrderId) {
      const key = normalisasiKunci(tRow[0], tRow[1], tRow[2]);
      if (key && !orderMap[key]) {
        orderMap[key] = existingOrderId;
      }

      if (!frontendDataByOrderId[existingOrderId]) {
        frontendDataByOrderId[existingOrderId] = { resiAQ: "", ekspAR: "" };
      }
      if (existingResiAQ && existingResiAQ !== "-") {
        frontendDataByOrderId[existingOrderId].resiAQ = existingResiAQ;
      }
      if (existingEkspAR && existingEkspAR !== "-") {
        frontendDataByOrderId[existingOrderId].ekspAR = existingEkspAR;
      }
      
      const match = existingOrderId.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxOrderNum) maxOrderNum = num;
      }
    }
  }

  let finalRows = [];
  let updatedCount = 0;
  let lastAssignedOrderId = "";
  let lastAssignedKey = "";

  for (let i = 0; i < sourceData.length; i++) {
    const sRow = sourceData[i];
    if (!sRow[0] && !sRow[1]) continue;

    const tRow = (i < targetData.length) ? targetData[i] : null;
    const currentKey = normalisasiKunci(sRow[0], sRow[1], sRow[2]);
    const dateCode = ekstrakDateCode(sRow[0], now);

    // --- LOGIKA PENENTUAN ORDER ID (PERMANEN) ---
    let orderId = "";

    // 1. Jika baris ini sama dengan baris tepat di atasnya (gabungan 1 invoice/paket)
    if (currentKey && currentKey === lastAssignedKey && lastAssignedOrderId) {
      orderId = lastAssignedOrderId;
    }
    // 2. Jika baris ini di sheet tujuan SUDAH punya Order ID sebelumnya -> PERTAHANKAN
    else if (tRow && String(tRow[38] || "").trim() !== "") {
      orderId = String(tRow[38]).trim();
      orderMap[currentKey] = orderId;
    }
    // 3. Jika customer ini sudah punya Order ID terdaftar
    else if (orderMap[currentKey]) {
      orderId = orderMap[currentKey];
    }
    // 4. Benar-benar baris pesanan BARU -> Buat Order ID baru
    else {
      maxOrderNum++;
      orderId = "ORD-" + dateCode + "-" + String(maxOrderNum).padStart(3, "0");
      orderMap[currentKey] = orderId;
    }

    lastAssignedOrderId = orderId;
    lastAssignedKey = currentKey;

    // --- TANGGAL INPUT PERMANEN (KOLOM AN) ---
    let tanggalInput = (tRow && tRow[39]) ? tRow[39] : timestampNow;

    // --- LOG PERUBAHAN & EDITOR ---
    let lastLog = (tRow && tRow[40]) ? String(tRow[40]) : "";
    let lastEditor = (tRow && tRow[41]) ? String(tRow[41]) : activeUser;

    if (!tRow) {
      lastLog = "[" + timestampNow + "] Data baru dibuat.";
      lastEditor = activeUser;
      updatedCount++;
    } else {
      let perubahans = [];
      for (let c = 0; c <= 15; c++) {
        let isPhoneCol = (c === 2);
        let valOld = formatCekNilai(tRow[c], isPhoneCol);
        let valNew = formatCekNilai(sRow[c], isPhoneCol);

        if (valOld !== valNew) {
          perubahans.push(columnHeaders[c] + " diubah: '" + valOld + "' -> '" + valNew + "'");
        }
      }

      if (perubahans.length > 0) {
        lastLog = "[" + timestampNow + "] " + perubahans.join("; ");
        lastEditor = activeUser;
        updatedCount++;
      }
    }

    // Kolom A s/d AL (38 kolom) murni dari sheet sumber
    let rowLengkap = sRow.slice(0, 38);

    // Ambil nilai Kolom AQ (Resi Frontend) & Kolom AR (Ekspedisi Frontend) yang sudah tersimpan
    const savedFrontend = frontendDataByOrderId[orderId] || { resiAQ: "", ekspAR: "" };
    const rowResiAQ = (tRow && String(tRow[42] || "").trim()) || savedFrontend.resiAQ || "";
    const rowEkspAR = (tRow && String(tRow[43] || "").trim()) || savedFrontend.ekspAR || "";

    rowLengkap.push(orderId);       // Kolom AM (39)
    rowLengkap.push(tanggalInput);  // Kolom AN (40)
    rowLengkap.push(lastLog);       // Kolom AO (41)
    rowLengkap.push(lastEditor);    // Kolom AP (42)
    rowLengkap.push(rowResiAQ);     // Kolom AQ (43) = Resi dari Frontend WMS
    rowLengkap.push(rowEkspAR);     // Kolom AR (44) = Ekspedisi dari Frontend WMS

    finalRows.push(rowLengkap);
  }

  if (finalRows.length === 0) return;

  // 6. Tulis data (44 kolom: A s/d AR) & format tabel
  targetSheet.getRange(3, 1, finalRows.length, 44).setValues(finalRows);
  rapikanFormatTabel(targetSheet, finalRows.length);

  Logger.log("Selesai. Order ID (AM) serta Resi (AQ) & Ekspedisi (AR) terkunci rapi.");
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
  const dataRange = sheet.getRange(3, 1, numRows, 44);

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
  sheet.getRange(3, 42, numRows, 3).setHorizontalAlignment("center");
  sheet.getRange(3, 4, numRows, 1).setWrap(true);
  sheet.getRange(3, 41, numRows, 1).setWrap(true);

  sheet.getRange("AM2:AR2")
    .setBackground("#37474F")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}
