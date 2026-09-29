1016,1100c\
  // Helper: Dapatkan list riwayat laporan QC.\
  // User meminta agar SEMUA referensi laporan QC ditampilkan agar bisa dipilih lintas-produk, \
  // namun kita akan mengurutkan laporan yang cocok (matching) di urutan teratas.\
  const getMatchingQcOptions = (sku?: string, namaProduk?: string, currentQcNo?: string): QcReport[] => {\
    const cleanSku = (sku || '').trim().toUpperCase();\
    const cleanNama = (namaProduk || '').trim().toUpperCase();\
\
    const normalize = (str: string) =>\
      str\
        .toUpperCase()\
        .replace(/\\b(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|ALL\\s*SIZE|ONESIZE)\\b/gi, '')\
        .replace(/[^A-Z0-9\\s]/g, ' ')\
        .replace(/\\s+/g, ' ')\
        .trim();\
\
    const normSku = normalize(cleanSku);\
    const normNama = normalize(cleanNama);\
\
    const isMatch = (q: QcReport) => {\
      if (currentQcNo && (q.report_no === currentQcNo || String(q.id) === currentQcNo)) return true;\
      if (!cleanSku && !cleanNama) return false;\
      const qSku = (q.sku || '').trim().toUpperCase();\
      const qNama = (q.nama_produk || '').trim().toUpperCase();\
      const qKode = (q.kode_produksi || '').trim().toUpperCase();\
      if (cleanSku && qSku && cleanSku === qSku) return true;\
      if (qKode && qKode.length >= 3) {\
        if (cleanSku && (cleanSku === qKode || cleanSku.startsWith(qKode) || cleanSku.includes(qKode))) return true;\
        if (cleanNama && (cleanNama === qKode || cleanNama.includes(qKode))) return true;\
      }\
      const qNormSku = normalize(qSku);\
      if (normSku && qNormSku && normSku.length >= 3 && qNormSku.length >= 3) {\
        if (normSku === qNormSku || normSku.startsWith(qNormSku) || qNormSku.startsWith(normSku)) return true;\
      }\
      const qNormNama = normalize(qNama);\
      if (normNama && qNormNama && normNama.length >= 3 && qNormNama.length >= 3) {\
        if (normNama === qNormNama || normNama.includes(qNormNama) || qNormNama.includes(normNama)) return true;\
      }\
      if (normNama && qNormSku && normNama.length >= 4 && qNormSku.length >= 4) {\
        if (normNama === qNormSku || normNama.includes(qNormSku) || qNormSku.includes(normNama)) return true;\
      }\
      if (normSku && qNormNama && normSku.length >= 4 && qNormNama.length >= 4) {\
        if (normSku === qNormNama || normSku.includes(qNormNama) || qNormNama.includes(normSku)) return true;\
      }\
      return false;\
    };\
\
    const uniqueMap = new Map<string, QcReport \& { _isMatch?: boolean }>();\
    qcReports.forEach((q) => {\
      if (q.report_no && !uniqueMap.has(q.report_no)) {\
        uniqueMap.set(q.report_no, { ...q, _isMatch: isMatch(q) });\
      }\
    });\
\
    const uniqueReports = Array.from(uniqueMap.values());\
    return uniqueReports.sort((a, b) => {\
      if (a._isMatch && !b._isMatch) return -1;\
      if (!a._isMatch && b._isMatch) return 1;\
      const dateA = new Date(a.tanggal || 0).getTime();\
      const dateB = new Date(b.tanggal || 0).getTime();\
      return dateB - dateA;\
    });\
  };\
