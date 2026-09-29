/************************************************
 * FILE WEBHOOK.GS
 *
 * REVISI:
 * 1. Menambahkan fungsi deduplikasi webhook berbasis CacheService (getWebhookDedupKey,
 *    isDuplicateWebhook, saveWebhookHistory) untuk mencegah retry otomatis gateway WA/Fonnte
 *    membuat duplikat data.
 * 2. Menambahkan fallback debugLog yang aman.
 ************************************************/

/**
 * Menghasilkan unique deduplication key untuk webhook masuk
 */
function getWebhookDedupKey(json) {
  if (!json) return null;
  // 1. Jika ada inboxid / message_id / id dari gateway (Fonnte, WPPConnect, UltraMsg, dll)
  const msgId = json.inboxid || json.id || json.message_id || json.msgId || (json.key && json.key.id);
  if (msgId) {
    return "DEDUP_ID_" + String(msgId).trim();
  }
  
  // 2. Fallback: Hash dari sender + pesan (jendela 60-120 detik)
  const sender = String(json.sender || json.pengirim || json.from || "").trim();
  const message = String(json.message || json.pesan || json.text || "").trim();
  if (sender && message) {
    const normMsg = message.replace(/\s+/g, " ").trim().toUpperCase();
    try {
      const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sender + "_" + normMsg);
      let hashStr = "";
      for (let i = 0; i < rawHash.length; i++) {
        let byteVal = rawHash[i];
        if (byteVal < 0) byteVal += 256;
        let hexVal = byteVal.toString(16);
        if (hexVal.length === 1) hexVal = "0" + hexVal;
        hashStr += hexVal;
      }
      return "DEDUP_MSG_" + hashStr;
    } catch (eHash) {
      return "DEDUP_MSG_" + sender + "_" + normMsg.substring(0, 30);
    }
  }
  return null;
}

/**
 * Cek apakah webhook ini duplikat (sudah pernah diterima dalam 120 detik terakhir)
 */
function isDuplicateWebhook(dedupKey) {
  if (!dedupKey) return false;
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return false;
    const existing = cache.get(dedupKey);
    return existing !== null;
  } catch (e) {
    Logger.log("isDuplicateWebhook error: " + e.message);
    return false;
  }
}

/**
 * Simpan dedupKey ke ScriptCache (TTL: 120 detik)
 */
function saveWebhookHistory(dedupKey) {
  if (!dedupKey) return;
  try {
    const cache = CacheService.getScriptCache();
    if (cache) {
      cache.put(dedupKey, "PROCESSED", 120);
    }
  } catch (e) {
    Logger.log("saveWebhookHistory error: " + e.message);
  }
}

/**
 * Safe logger for webhook events
 */
function debugLog(action, msg) {
  try {
    Logger.log("[" + action + "] " + msg);
  } catch (e) {}
}

function doPost(e) {

  // 1. PARSE JSON / URL-ENCODED FORM DULU
  let json = {};
  try {
    if (e && e.postData && e.postData.contents) {
      try {
        json = JSON.parse(e.postData.contents);
      } catch (errJson) {
        if (e.parameter && Object.keys(e.parameter).length > 0) {
          json = e.parameter;
        } else {
          const contents = String(e.postData.contents);
          const pairs = contents.split("&");
          pairs.forEach(function(pair) {
            const parts = pair.split("=");
            if (parts.length === 2) {
              json[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1].replace(/\+/g, " "));
            }
          });
        }
      }
    } else if (e && e.parameter) {
      json = e.parameter;
    }
  } catch (errParse) {
    Logger.log("doPost: gagal parse payload: " + errParse.message);
    return ContentService.createTextOutput("ERROR : invalid payload");
  }

  // =========================================================================
  // 1.1 ROUTING API REQUEST DARI FRONTEND GITHUB / WEB STANDALONE
  // =========================================================================
  if (json.action || json.type === "API") {
    return handleWmsApiRequest(json);
  }

  // =========================================================================
  // FAST-FILTER: JIKA BUKAN PESAN BERAWALAN '#' LANGSUNG SKIP SEKETIKA (0ms)
  // Tidak membuang waktu, tidak menyentuh Google Sheets, dan tidak mengunci Lock.
  // =========================================================================
  const message = String(json.message || json.pesan || json.text || "").trim();
  
  if (message === "PING TEST WEBHOOK") {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "PING OK - Webhook Standalone Aktif"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (!message.startsWith("#")) {
    return ContentService.createTextOutput("IGNORED_NO_HASHTAG");
  }

  // 2. CATAT PESAN MENTAH SEBELUM LOCK (best-effort).
  try {
    debugLog(
      "doPost-masuk",
      "inboxid=" + (json.inboxid || "") +
      " sender=" + (json.sender || json.pengirim || "") +
      " message=" + message
    );
  } catch (eLogMasuk) {
    // abaikan, jangan sampai logging gagal menghentikan proses utama
  }

    // 3. DUPLICATE PROTECTION & PARSING MESSAGE

    /************************************************
     * DUPLICATE WEBHOOK PROTECTION (ROBUST MULTI-GATEWAY)
     ************************************************/
    const dedupKey = getWebhookDedupKey(json);

    if (dedupKey && isDuplicateWebhook(dedupKey)) {
      Logger.log("Duplicate Webhook diabaikan: " + dedupKey);
      try {
        debugLog("doPost-DUPLICATE", "Pesan duplikat diabaikan: " + dedupKey);
      } catch (eDup) {}
      return ContentService.createTextOutput("OK");
    }

    // SIMPAN KEY SEGERA: Cegah request paralel/retry berikutnya masuk
    if (dedupKey) {
      saveWebhookHistory(dedupKey);
    }

    const upper = message.toUpperCase();

    const isInventoryScan = 
      upper.startsWith("#LOK") ||
      upper.startsWith("#IN") ||
      upper.startsWith("#OUT") ||
      upper.startsWith("#STD") ||
      upper.startsWith("#TPD") ||
      upper.startsWith("#SHP") ||
      upper.startsWith("#SCAN") ||
      upper.startsWith("#PERMAK") ||
      upper.startsWith("#CUCI") ||
      upper.startsWith("#DEFECT");

    if (isInventoryScan) {
      // FASE 2: ROUTER CEPAT WEBHOOK FONNTE
      // Request inventori (IN, OUT, LOK) jalan TANPA LOCK
      // karena akan dikirim langsung ke Supabase (tidak nyentuh Sheet Log Product).
      return prosesStockOpname(json);
    }

    // 3. AMBIL LOCK -- UNTUK PROSES QC DAN PRODUKSI YANG MASIH PAKAI SHEETS
    const lock = LockService.getScriptLock();
    let hasLock = false;
    try {
      lock.waitLock(30000);
      hasLock = true;
    } catch (errLock) {
      try { debugLog("doPost-BUSY", "Lock antrean penuh (>30s)."); } catch (e) {}
      throw new Error("BUSY: System is overloaded, please retry");
    }

    try {

    /************************************************
     * ROUTING QC
     ************************************************/
    if (upper.startsWith("#LAPORQC")) {
      return prosesQC(json);
    }

    /************************************************
     * ROUTING PRODUKSI
     ************************************************/
    if (upper.startsWith("#PRODUKSI")) {
      return prosesProduksi(json);
    }

    // ROUTING LAINNYA DI HAPUS DARI BLOK INI KARENA DIPINDAHKAN KE ATAS (isInventoryScan)

    /************************************************
     * HASHTAG TIDAK DIKENAL
     ************************************************/
    return ContentService.createTextOutput("IGNORED");

  } catch (err) {

    Logger.log(err);
    try {
      debugLog("doPost-ERROR", "inboxid=" + (json.inboxid || "") + " ERROR: " + err.message);
    } catch (eLogErr) {}

    // Hanya throw 500 untuk error concurrency/lock/timeout agar diretry oleh gateway.
    // Jika error karena salah input, return 200 supaya tidak di-retry terus menerus.
    const msgLower = err.message.toLowerCase();
    if (msgLower.includes("busy") || msgLower.includes("sibuk") || msgLower.includes("lock") || msgLower.includes("timeout") || msgLower.includes("terlalu banyak") || msgLower.includes("too many")) {
      throw err;
    }

    return ContentService.createTextOutput("ERROR : " + err.message);
  } finally {
    if (typeof hasLock !== 'undefined' && hasLock) {
      lock.releaseLock();
    }
  }

}

function menuTestSimulasiScanMasuk() {
  const ui = SpreadsheetApp.getUi();
  const res = testSimulasiScanWA();
  ui.alert("Hasil Test Simulasi Scan", res, ui.ButtonSet.OK);
}

function testSimulasiScanWA() {
  try {
    const dummyEvent = {
      postData: {
        contents: JSON.stringify({
          inboxid: "TEST-" + Date.now(), 
          message: "#IN\n#LOK A019\nF26CDB574DDS",
          sender: "120363426359702090@g.us",
          pushname: "Testing Simulator",
          device: "62899999999"
        })
      }
    };

    const hasil = doPost(dummyEvent);
    const code = hasil.getContent();
    return "✅ Simulasi Berhasil Dijalankan!\nStatus: " + code + "\n\nSilakan cek:\n1. Sheet 'Log Product' (ada baris baru F26CDB574DDS #IN)\n2. Table Supabase 'log_produk' (ada baris baru)\n3. Sheet 'STOCK' / Supabase 'stok_lokasi' (stok A019 bertambah)";
  } catch (err) {
    return "❌ Error saat simulasi: " + err.message + "\n" + err.stack;
  }
}

function testWebhookManual() {
  testSimulasiScanWA();
}