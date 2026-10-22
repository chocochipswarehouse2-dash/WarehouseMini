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
 * Normalisasi nominal rupiah (menghapus Rp, koma, titik)
 */
export function normalizeNominal(raw: any): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  const str = String(raw).replace(/[^0-9]/g, '');
  const parsed = parseInt(str, 10);
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
 * =========================================================================
 * 1. PARSER UNTUK EXCEL / CSV (.xlsx, .xls, .csv)
 * =========================================================================
 */
export async function parseExcelJneFile(file: File): Promise<ParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Konversi ke JSON array of arrays
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) {
      return {
        success: false,
        records: [],
        totalDetected: 0,
        fileName: file.name,
        fileType: 'excel',
        error: 'File Excel kosong atau tidak memiliki baris data.'
      };
    }

    // 1. Cari baris header
    let headerRowIdx = -1;
    let colMap = {
      resi: -1,
      tanggal: -1,
      nominal: -1,
      layanan: -1,
      nama: -1,
      alamat: -1,
      deskripsi: -1
    };

    for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
      const row = rawRows[r].map(c => String(c || '').toLowerCase().trim());
      
      const resiIdx = row.findIndex(c => /resi|awb|connote|airway\s*bill|no\s*cn|tracking/i.test(c));
      const nominalIdx = row.findIndex(c => /nominal|tarif|ongkir|amount|total|biaya|charge|net/i.test(c));
      
      if (resiIdx !== -1 && (nominalIdx !== -1 || row.some(c => /tgl|tanggal|date/i.test(c)))) {
        headerRowIdx = r;
        colMap.resi = resiIdx;
        colMap.nominal = nominalIdx;
        colMap.tanggal = row.findIndex(c => /tgl|tanggal|date|shipment/i.test(c));
        colMap.layanan = row.findIndex(c => /layanan|service|produk|product/i.test(c));
        colMap.nama = row.findIndex(c => /penerima|consignee|nama\s*tujuan|receiver|nama/i.test(c));
        colMap.alamat = row.findIndex(c => /alamat|tujuan|destination|kota|address/i.test(c));
        colMap.deskripsi = row.findIndex(c => /deskripsi|keterangan|remarks|goods|isi\s*paket|description/i.test(c));
        break;
      }
    }

    // Fallback jika tidak ada baris header yang cocok: auto-scan tiap baris berdasarkan pola
    const records: JneDetectedRecord[] = [];
    const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

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

      if (headerRowIdx !== -1 && colMap.resi !== -1) {
        noResi = cleanResi(row[colMap.resi]);
        tanggal = colMap.tanggal !== -1 ? normalizeDate(row[colMap.tanggal]) : '';
        nominal = colMap.nominal !== -1 ? normalizeNominal(row[colMap.nominal]) : 0;
        layanan = colMap.layanan !== -1 ? detectJneService(row[colMap.layanan]) : 'REG';
        namaTujuan = colMap.nama !== -1 ? String(row[colMap.nama] || '').trim() : '';
        alamatTujuan = colMap.alamat !== -1 ? String(row[colMap.alamat] || '').trim() : '';
        deskripsi = colMap.deskripsi !== -1 ? String(row[colMap.deskripsi] || '').trim() : '';
      } else {
        // Auto-detect dari isi sel
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (!val) continue;

          // Pola resi JNE: minimal 10 karakter alfanumerik atau diawali JNE/01/TJNE
          if (!noResi && (/(?:JNE|TJNE|CGK|01)\d{8,14}/i.test(val) || (/^\d{12,18}$/.test(val) && val.length >= 12))) {
            noResi = cleanResi(val);
            continue;
          }

          // Pola Tanggal
          if (!tanggal && (val instanceof Date || /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(val))) {
            tanggal = normalizeDate(val);
            continue;
          }

          // Pola Nominal (angka di atas 5000)
          const numVal = normalizeNominal(val);
          if (numVal >= 1000 && numVal <= 50000000 && (!nominal || numVal > nominal)) {
            nominal = numVal;
            continue;
          }

          // Pola Layanan
          if (/^(REG|YES|JTR|OKE|SPS|CTC)$/i.test(val)) {
            layanan = val.toUpperCase();
            continue;
          }
        }
      }

      // Validasi resi
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
          source_file: file.name
        });
      }
    }

    return {
      success: records.length > 0,
      records: records,
      totalDetected: records.length,
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
    const pdfjsLib: any = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'
    );

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
    const Tesseract: any = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
    );

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

      // Cari nominal (Rp)
      const nominalMatch = contextLines.match(/(?:Rp\.?|IDR|\b)\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,8})\b/i);
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
