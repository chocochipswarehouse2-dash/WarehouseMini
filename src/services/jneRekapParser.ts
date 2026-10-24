import * as XLSX from 'xlsx';

export interface JneDetectedRecord {
  id: string;
  no_resi: string;
  tanggal: string;
  nominal: number;
  layanan: string;
  nama_tujuan: string;
  alamat_tujuan: string;
  deskripsi: string;
  source_file?: string;
  raw_line?: string;
}

export interface ParseResult {
  success: boolean;
  records: JneDetectedRecord[];
  totalDetected: number;
  fileName: string;
  fileType: 'excel' | 'pdf' | 'image' | 'unknown';
  error?: string;
}

/**
 * Konversi Excel Serial Date (e.g. 46316.57) ke string ISO YYYY-MM-DD
 */
export function excelDateToISO(serial: number): string {
  if (typeof serial !== 'number' || isNaN(serial)) return '';
  const utc_days = Math.floor(serial - 25569);
  const date_info = new Date(utc_days * 86400 * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  const d = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalisasi format tanggal ke YYYY-MM-DD
 */
export function normalizeDate(raw: any): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Format Excel serial date (e.g. 46316.57)
  if (typeof raw === 'number' && raw > 30000 && raw < 75000) {
    return excelDateToISO(raw);
  }
  const s = String(raw).trim();
  // Format DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  // Format YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

/**
 * Normalisasi nominal rupiah dengan pemisahan desimal dan ribuan yang sangat teliti.
 * Format yang didukung:
 * - 72,000.00 (Ribuan koma, desimal titik) -> 72000
 * - 72.000,00 (Ribuan titik, desimal koma) -> 72000
 * - 72000.00 / 72000,00 -> 72000
 * - 72,000 / 72.000 (Ribuan saja) -> 72000
 * - Rp. 72,000.00 / IDR 72.000 -> 72000
 */
export function normalizeNominal(raw: any): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  let s = String(raw).trim().replace(/^(?:Rp|IDR)\.?\s*/i, '').trim();
  if (!s || s === '-' || s === '0.00' || s === '0,00') return 0;

  // Kasus 1: Format 72,000.00 atau 1,250,000.00 (Koma ribuan, Titik desimal)
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
    return Math.round(parseFloat(s) || 0);
  }

  // Kasus 2: Format 72.000,00 atau 1.250.000,00 (Titik ribuan, Koma desimal)
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
    return Math.round(parseFloat(s) || 0);
  }

  // Kasus 3: Titik sebagai desimal 1-2 digit di akhir (contoh: 72000.00 atau 10000.5)
  if (/^\d+\.\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s) || 0);
  }

  // Kasus 4: Koma sebagai desimal 1-2 digit di akhir (contoh: 72000,00 atau 10000,5)
  if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
    return Math.round(parseFloat(s) || 0);
  }

  // Kasus 5: Akhiran .00 atau ,00
  if (/[\.,]00$/.test(s)) {
    s = s.slice(0, -3);
  }

  // Kasus 6: Format ribuan murni (e.g. 72.000 atau 72,000)
  if (/^\d{1,3}(?:[\.,]\d{3})+$/.test(s)) {
    s = s.replace(/[\.,]/g, '');
    return parseInt(s, 10) || 0;
  }

  // Fallback: bersihkan karakter non-angka
  const digitsOnly = s.replace(/[^0-9]/g, '');
  const parsed = parseInt(digitsOnly, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Bersihkan nomor resi JNE
 */
export function cleanResi(raw: any): string {
  if (!raw) return '';
  // Hanya ambil huruf dan angka, ubah ke uppercase
  return String(raw).trim().replace(/[\s\-_]/g, '').toUpperCase();
}

/**
 * Deteksi Layanan JNE (YES, REG, JTR, OKE, SPS, dsb)
 */
export function detectJneService(raw: any): string {
  const s = String(raw || '').toUpperCase().trim();
  if (s.includes('YES')) return 'YES';
  if (s.includes('JTR') || s.includes('TRUCKING')) return 'JTR';
  if (s.includes('OKE')) return 'OKE';
  if (s.includes('SPS') || s.includes('SUPER SPEED')) return 'SPS';
  if (s.includes('REG') || s.includes('CTC')) return 'REG';
  return s || 'REG';
}

/**
 * Ekstraksi baris per sheet Excel
 */
function extractRecordsFromSheet(rawRows: any[][], fileName: string, sheetName: string): JneDetectedRecord[] {
  if (!rawRows || rawRows.length < 2) return [];

  // Cari baris header (bisa bertingkat 1-4 baris seperti pada format JNE)
  const headerRowIndices: number[] = [];
  for (let r = 0; r < Math.min(rawRows.length, 6); r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;
    const hasHeaderWord = row.some(cell => {
      const s = String(cell || '').toLowerCase().trim();
      return /^(no|no\.|shipper|receiver|consignee|destination|services?|amount|date|tgl|tanggal|c[\s_-]?note|awb|resi|ongkir|charge|deskripsi|keterangan)$/i.test(s)
        || /resi|awb|connote|c[\s_-]?note|airway|destination|receiver/i.test(s);
    });
    // Jika baris berisi nomor resi 12+ digit, itu baris data, bukan header!
    const hasDataCell = row.some(cell => {
      const s = String(cell || '').trim();
      return /^\d{13,18}$/.test(s) || /^01\d{10,16}$/.test(s);
    });

    if (hasHeaderWord && !hasDataCell) {
      headerRowIndices.push(r);
    }
  }

  const colMap = {
    resi: -1,
    tanggal: -1,
    nominal: -1,
    layanan: -1,
    nama: -1,
    alamat: -1,
    deskripsi: -1
  };

  let startRow = 0;
  if (headerRowIndices.length > 0) {
    startRow = Math.max(...headerRowIndices) + 1;
    const maxCols = Math.max(...headerRowIndices.map(r => (rawRows[r] || []).length));
    const mergedHeaders: string[] = [];

    // Gabungkan teks header per kolom dari seluruh baris header yang bertingkat
    for (let c = 0; c < maxCols; c++) {
      const parts: string[] = [];
      for (const r of headerRowIndices) {
        const val = String(rawRows[r]?.[c] || '').trim();
        if (val && !parts.includes(val)) parts.push(val);
      }
      mergedHeaders.push(parts.join(' '));
    }

    colMap.resi = mergedHeaders.findIndex(c => /resi|awb|c[\s_-]?note|connote|airway\s*bill|no\s*cn|tracking/i.test(c));
    colMap.nominal = mergedHeaders.findIndex(c => /nominal|tarif|ongkir|amount|total\s*bayar|biaya|charge|net/i.test(c));
    colMap.tanggal = mergedHeaders.findIndex(c => /tgl|tanggal|date|shipment/i.test(c));
    colMap.layanan = mergedHeaders.findIndex(c => /layanan|services?|produk|product/i.test(c));
    colMap.nama = mergedHeaders.findIndex(c => /penerima|consignee|nama\s*tujuan|receiver/i.test(c));
    colMap.alamat = mergedHeaders.findIndex(c => /alamat|tujuan|destination|kota|address/i.test(c));
    colMap.deskripsi = mergedHeaders.findIndex(c => /deskripsi|keterangan|remarks|goods|isi\s*paket|description/i.test(c));
  }

  const records: JneDetectedRecord[] = [];
  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    let noResi = '';
    let tanggal = '';
    let nominal = 0;
    let layanan = 'REG';
    let namaTujuan = '';
    let alamatTujuan = '';
    let deskripsi = '';

    if (colMap.resi !== -1) {
      noResi = cleanResi(row[colMap.resi]);
      tanggal = colMap.tanggal !== -1 ? normalizeDate(row[colMap.tanggal]) : '';
      nominal = colMap.nominal !== -1 ? normalizeNominal(row[colMap.nominal]) : 0;
      layanan = colMap.layanan !== -1 ? detectJneService(row[colMap.layanan]) : 'REG';
      namaTujuan = colMap.nama !== -1 ? String(row[colMap.nama] || '').trim() : '';
      alamatTujuan = colMap.alamat !== -1 ? String(row[colMap.alamat] || '').trim() : '';
      deskripsi = colMap.deskripsi !== -1 ? String(row[colMap.deskripsi] || '').trim() : '';
    } else {
      // Fallback: deteksi sel demi sel jika posisi header tidak terbaca
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val === null || val === undefined || val === '') continue;
        const strVal = String(val).trim();

        if (!noResi && (/(?:JNE|TJNE|CGK|01)\d{8,16}/i.test(strVal) || (/^\d{12,18}$/.test(strVal) && strVal.length >= 12))) {
          noResi = cleanResi(strVal);
          continue;
        }
        if (!tanggal && (val instanceof Date || (typeof val === 'number' && val > 30000 && val < 75000) || /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(strVal))) {
          tanggal = normalizeDate(val);
          continue;
        }
        const numVal = normalizeNominal(val);
        if (numVal >= 1000 && numVal <= 50000000 && (!nominal || numVal > nominal)) {
          nominal = numVal;
          continue;
        }
        if (/^(REG|YES|JTR|OKE|SPS|CTC)$/i.test(strVal)) {
          layanan = strVal.toUpperCase();
          continue;
        }
      }
    }

    if (noResi && noResi.length >= 8) {
      records.push({
        id: `JNE-${noResi}-${r}`,
        no_resi: noResi,
        tanggal: tanggal || normalizeDate(new Date()),
        nominal: nominal,
        layanan: layanan,
        nama_tujuan: namaTujuan || '-',
        alamat_tujuan: alamatTujuan || '-',
        deskripsi: deskripsi,
        source_file: fileName + (sheetName && sheetName !== 'Sheet1' ? ` (${sheetName})` : '')
      });
    }
  }

  return records;
}

/**
 * =========================================================================
 * 1. PARSER UNTUK EXCEL / CSV (.xlsx, .xls, .csv)
 * =========================================================================
 */
export async function parseExcelJneFile(file: File): Promise<ParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    
    let allRecords: JneDetectedRecord[] = [];

    // Periksa setiap sheet dalam file Excel
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      const sheetRecords = extractRecordsFromSheet(rawRows, file.name, sheetName);
      if (sheetRecords.length > 0) {
        allRecords = allRecords.concat(sheetRecords);
      }
    }

    if (allRecords.length === 0) {
      return {
        success: false,
        records: [],
        totalDetected: 0,
        fileName: file.name,
        fileType: 'excel',
        error: 'Tidak ditemukan data resi JNE yang valid dalam file Excel tersebut.'
      };
    }

    // Deduplikasi resi jika ada kembaran antar baris
    const uniqueRecords: JneDetectedRecord[] = [];
    const seen = new Set<string>();
    for (const rec of allRecords) {
      if (!seen.has(rec.no_resi)) {
        seen.add(rec.no_resi);
        uniqueRecords.push(rec);
      }
    }

    return {
      success: true,
      records: uniqueRecords,
      totalDetected: uniqueRecords.length,
      fileName: file.name,
      fileType: 'excel'
    };

  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'excel',
      error: `Gagal membaca Excel: ${err?.message || String(err)}`
    };
  }
}

/**
 * =========================================================================
 * 2. PARSER UNTUK PDF (.pdf) via Dynamic CDN ESM pdfjs-dist
 * =========================================================================
 */
export async function parsePdfJneFile(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Dynamic import pdfjs-dist dari CDN agar tidak membebani initial bundle
    const pdfCdnUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
    const pdfjsLib: any = await import(/* @vite-ignore */ pdfCdnUrl);

    // Konfigurasi worker
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    }

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    let fullLines: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Kelompokkan item teks berdasarkan koordinat sumbu Y (baris yang sama)
      const rowBuckets: { [y: number]: string[] } = {};
      for (const item of textContent.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]); // posisi Y
        if (!rowBuckets[y]) rowBuckets[y] = [];
        rowBuckets[y].push(item.str);
      }

      // Urutkan dari atas ke bawah (Y besar ke kecil)
      const sortedYs = Object.keys(rowBuckets).map(Number).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const lineText = rowBuckets[y].join(' ').trim();
        if (lineText) fullLines.push(lineText);
      }
    }

    const records = extractJneRecordsFromTextLines(fullLines, file.name);

    return {
      success: records.length > 0,
      records: records,
      totalDetected: records.length,
      fileName: file.name,
      fileType: 'pdf'
    };

  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'pdf',
      error: `Gagal memproses file PDF: ${err?.message || String(err)}`
    };
  }
}

/**
 * =========================================================================
 * 3. PARSER UNTUK GAMBAR (.png, .jpeg, .jpg) via Dynamic Tesseract.js OCR
 * =========================================================================
 */
export async function parseImageJneFile(file: File, onProgress?: (pct: number) => void): Promise<ParseResult> {
  try {
    // Dynamic import Tesseract.js dari CDN
    const tesseractCdnUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
    const Tesseract: any = await import(/* @vite-ignore */ tesseractCdnUrl);

    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text' && onProgress && typeof m.progress === 'number') {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });

    const ret = await worker.recognize(file);
    await worker.terminate();

    const rawText = ret.data.text || '';
    const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const records = extractJneRecordsFromTextLines(lines, file.name);

    return {
      success: records.length > 0,
      records: records,
      totalDetected: records.length,
      fileName: file.name,
      fileType: 'image'
    };

  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'image',
      error: `Gagal membaca gambar/OCR: ${err?.message || String(err)}`
    };
  }
}

/**
 * =========================================================================
 * 4. REGEX EXTRACTOR DARI BARIS TEKS (Untuk PDF & OCR)
 * =========================================================================
 */
export function extractJneRecordsFromTextLines(lines: string[], fileName: string): JneDetectedRecord[] {
  const records: JneDetectedRecord[] = [];
  const seenResi = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Deteksi Resi JNE:
    // Format 1: Diawali JNE/TJNE/01 diikuti angka, e.g. 0123456789012345
    // Format 2: Alfanumerik 12 - 18 digit
    const resiMatch = line.match(/\b((?:JNE|TJNE|CGK|01)[A-Z0-9]{10,18})\b/i) ||
                      line.match(/\b([0-9]{12,18})\b/);

    if (resiMatch) {
      const resi = cleanResi(resiMatch[1]);
      if (seenResi.has(resi) || resi.length < 10) continue;
      seenResi.add(resi);

      // Cari tanggal di baris yang sama atau 1 baris sebelum/sesudahnya
      const contextLines = [lines[idx - 1] || '', line, lines[idx + 1] || ''].join(' ');
      const dateMatch = contextLines.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/) ||
                        contextLines.match(/\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/);
      const tanggal = dateMatch ? normalizeDate(dateMatch[1]) : normalizeDate(new Date());

      // Cari nominal (Rp) dengan dukungan format ribuan dan desimal (, / .)
      const nominalMatch = contextLines.match(/(?:Rp\.?|IDR|\b)\s*([0-9]{1,3}(?:[,\.][0-9]{3})+(?:[\.,][0-9]{2})?|[0-9]{4,8}(?:[\.,][0-9]{2})?)\b/i);
      const nominal = nominalMatch ? normalizeNominal(nominalMatch[1]) : 0;

      // Cari layanan
      const serviceMatch = contextLines.match(/\b(YES|REG|JTR|OKE|SPS|CTC)\b/i);
      const layanan = serviceMatch ? serviceMatch[1].toUpperCase() : 'REG';

      // Ekstraksi nama / tujuan jika ada
      let namaTujuan = '-';
      let alamatTujuan = '-';
      const destMatch = contextLines.match(/(?:tujuan|penerima|to|dest)\s*[:\-]\s*([a-zA-Z0-9\s,\.]+)/i);
      if (destMatch) {
        namaTujuan = destMatch[1].trim().substring(0, 40);
      }

      records.push({
        id: `JNE-${resi}-${records.length + 1}`,
        no_resi: resi,
        tanggal: tanggal,
        nominal: nominal,
        layanan: layanan,
        nama_tujuan: namaTujuan,
        alamat_tujuan: alamatTujuan,
        deskripsi: '',
        source_file: fileName,
        raw_line: line
      });
    }
  }

  return records;
}

/**
 * Universal Entry Point: Parser otomatis mendeteksi ekstensi file
 */
export async function parseJneImportFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return parseExcelJneFile(file);
  }
  if (ext === 'pdf') {
    return parsePdfJneFile(file);
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    return parseImageJneFile(file, onProgress);
  }

  return {
    success: false,
    records: [],
    totalDetected: 0,
    fileName: file.name,
    fileType: 'unknown',
    error: `Format file .${ext} tidak didukung. Harap upload Excel (.xlsx, .xls, .csv), PDF (.pdf), atau Gambar (.png, .jpg).`
  };
}
