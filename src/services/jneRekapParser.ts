import * as XLSX from 'xlsx';

export type JneSheetTab = 'member' | 'corporate';

export interface JneDetectedRecord {
  id: string;
  row_number?: number;
  no?: string | number;
  no_resi: string;            // Cnote No / No Resi
  deskripsi: string;          // Deskripsi pengiriman
  layanan: string;            // Service (CTC23, REG23, CTCYES23, YES23, dll.)
  nama_tujuan: string;        // Nama Penerima
  alamat_penerima?: string;   // Alamat lengkap Penerima (JNECorporate Kolom F)
  alamat_tujuan: string;      // Kota / Kecamatan Tujuan (Destination)
  nama_pengirim: string;      // Shipper Name (JNEmember)
  nominal: number;            // Ongkir / Amount (Rp)
  asuransi?: number;          // Nominal Asuransi (Rp, JNECorporate Kolom J)
  status_pembayaran?: string; // Status Pembayaran VLOOKUP (JNECorporate Kolom K)
  tanggal: string;            // Tanggal Kiriman (YYYY-MM-DD)
  agen: string;               // Agen (JNE Member / JNECorporated)
  source_file?: string;
  raw_line?: string;
}

export interface ParseResult {
  success: boolean;
  records: JneDetectedRecord[];
  totalDetected: number;
  fileName: string;
  fileType: 'excel' | 'csv' | 'pdf' | 'image' | 'text' | 'unknown';
  engine?: 'xlsx' | 'gemini-vision' | 'pdf-text' | 'ocr-fallback' | 'text-paste';
  error?: string;
}

export const DEFAULT_SHIPPER_NAME = 'CCH-CHOCOCHIPS';
export const DEFAULT_AGEN_NAME = 'JNE Member';
export const DEFAULT_AGEN_CORPORATE = 'JNECorporated';
export const DEFAULT_JNE_SERVICE = 'REG23';

/**
 * Konversi Excel Serial Date (e.g. 46316.57) ke string ISO YYYY-MM-DD
 */
export function excelDateToISO(serial: number): string {
  if (typeof serial !== 'number' || isNaN(serial)) return '';
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  const dateInfo = new Date(utcValue);
  const y = dateInfo.getUTCFullYear();
  const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateInfo.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalisasi format tanggal ke YYYY-MM-DD
 */
export function normalizeDate(raw: any): string {
  if (!raw) return '';
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number' && raw > 30000 && raw < 75000) {
    return excelDateToISO(raw);
  }
  const s = String(raw).trim();
  if (!s) return '';

  // DD/MM/YYYY atau DD-MM-YYYY atau DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }

  // YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Format nama bulan Indonesia/Inggris (e.g. "23 Nov 2026" / "05 Mei 2025")
  const monthMap: Record<string, string> = {
    jan: '01', januari: '01', january: '01',
    feb: '02', februari: '02', february: '02',
    mar: '03', maret: '03', march: '03',
    apr: '04', april: '04',
    mei: '05', may: '05',
    jun: '06', juni: '06', june: '06',
    jul: '07', juli: '07', july: '07',
    agu: '08', ags: '08', agustus: '08', aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    okt: '10', oktober: '10', oct: '10', october: '10',
    nov: '11', nop: '11', november: '11',
    des: '12', desember: '12', dec: '12', december: '12',
  };
  const namedMatch = s.match(/(\d{1,2})\s+([a-zA-Z]{3,10})\s+(\d{4})/);
  if (namedMatch) {
    const mm = monthMap[namedMatch[2].toLowerCase()];
    if (mm) {
      return `${namedMatch[3]}-${mm}-${namedMatch[1].padStart(2, '0')}`;
    }
  }

  return s;
}

/**
 * Format YYYY-MM-DD menjadi DD/MM/YYYY sesuai tampilan GSheet JNEMember
 */
export function formatDisplayDateJne(isoOrRaw: string): string {
  const norm = normalizeDate(isoOrRaw);
  const m = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return isoOrRaw || '-';
}

/**
 * Normalisasi nominal rupiah dengan pemisahan desimal & ribuan presisi
 */
export function normalizeNominal(raw: any): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  let s = String(raw).trim().replace(/^(?:Rp|IDR)\.?\s*/i, '').trim();
  if (!s || s === '-' || s === '0.00' || s === '0,00') return 0;

  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
    return Math.round(parseFloat(s) || 0);
  }
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
    return Math.round(parseFloat(s) || 0);
  }
  if (/^\d+\.\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s) || 0);
  }
  if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
    return Math.round(parseFloat(s) || 0);
  }
  if (/[\.,]00$/.test(s)) {
    s = s.slice(0, -3);
  }
  if (/^\d{1,3}(?:[\.,]\d{3})+$/.test(s)) {
    s = s.replace(/[\.,]/g, '');
    return parseInt(s, 10) || 0;
  }

  const digitsOnly = s.replace(/[^0-9]/g, '');
  const parsed = parseInt(digitsOnly, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Bersihkan nomor resi JNE (pertahankan leading zero seperti 0137900...)
 */
export function cleanResi(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim().replace(/^['"`]+/, '').replace(/[\s\-_]/g, '').toUpperCase();
  // Jika Excel memotong leading zero pada resi angka panjang -> pulihkan '0' di depan
  if (/^1379\d{10}$/.test(s) || /^14819\d{10,12}$/.test(s)) {
    s = '0' + s;
  }
  return s;
}

/**
 * Pertahankan kode layanan asli JNE Member (CTC23, REG23, CTCYES23, YES23, JTR23, dll.)
 */
export function normalizeJneService(raw: any): string {
  const s = String(raw || '').toUpperCase().trim().replace(/\s+/g, '');
  if (!s || s === '-') return DEFAULT_JNE_SERVICE;
  return s;
}

/**
 * Klasifikasi kategori deskripsi pengiriman (Kolom D) untuk filter cepat & analitik
 */
export type JneDeskripsiCategory =
  | 'EMPTY'
  | 'MANUAL_SHIPMENT'
  | 'WEBSITE'
  | 'RETUR'
  | 'PR_SEEDING'
  | 'OTHER';

export function classifyJneDeskripsi(deskripsi: string): JneDeskripsiCategory {
  const d = String(deskripsi || '').trim();
  if (!d) return 'EMPTY';
  const upper = d.toUpperCase();
  if (
    /^#?MS[A-Z]{2,5}/i.test(d) ||
    /^#?AR-/i.test(d) ||
    upper.includes('MANUAL SHIPMENT') ||
    upper.includes('ALTER')
  ) {
    return 'MANUAL_SHIPMENT';
  }
  if (upper.includes('RETUR') || /^#?RTR-/i.test(d)) {
    return 'RETUR';
  }
  if (
    upper.includes('WEBSITE') ||
    upper.includes('ORDER ID') ||
    upper.includes('WOOCOMMERCE') ||
    upper.includes('SHOPEE') ||
    upper.includes('TIKTOK') ||
    /^[A-Z0-9]{8,9}$/.test(upper)
  ) {
    return 'WEBSITE';
  }
  if (
    upper.includes('SEEDING') ||
    upper.startsWith('PR ') ||
    upper.includes('ENDORSE') ||
    upper.includes('KOL') ||
    upper.includes('INFLUENCER')
  ) {
    return 'PR_SEEDING';
  }
  return 'OTHER';
}

/**
 * Ekstraksi baris per sheet dari matriks sel Excel/CSV (dengan proteksi leading zero)
 */
function extractRecordsFromMatrix(
  displayRows: string[][],
  rawRows: any[][],
  fileName: string,
  sheetName: string,
  sheetTab: JneSheetTab = 'member'
): JneDetectedRecord[] {
  if (!displayRows || displayRows.length < 1) return [];

  const defaultAgen = sheetTab === 'corporate' ? DEFAULT_AGEN_CORPORATE : DEFAULT_AGEN_NAME;
  const defaultShipper = sheetTab === 'corporate' ? '' : DEFAULT_SHIPPER_NAME;

  const headerRowIndices: number[] = [];
  for (let r = 0; r < Math.min(displayRows.length, 10); r++) {
    const row = displayRows[r];
    if (!row || row.length === 0) continue;

    let headerScore = 0;
    for (const cell of row) {
      const s = String(cell || '').toLowerCase().trim();
      if (!s) continue;
      if (/^(no|no\.|cnote\s*no|c[\s_-]?note|awb|no\s*resi|resi|connote)$/i.test(s)) headerScore += 2;
      else if (/deskripsi|keterangan|services?|layanan|receiver|consignee|penerima|destination|tujuan|shipper|pengirim|amount|nominal|ongkir|asuransi|tarif|tanggal|date|agen|status/i.test(s)) {
        headerScore += 1;
      }
    }

    const hasResiDataCell = row.some((cell) => {
      const c = cleanResi(cell);
      return /^01\d{11,16}$/.test(c) || /^(?:JNE|TJNE|CGK[A-Z0-9]*)\d{8,16}$/i.test(c);
    });

    if (headerScore >= 2 && !hasResiDataCell) {
      headerRowIndices.push(r);
    }
  }

  const colMap = {
    no: -1,
    resi: -1,
    deskripsi: -1,
    layanan: -1,
    nama: -1,
    alamatPenerima: -1,
    alamat: -1,
    pengirim: -1,
    nominal: -1,
    asuransi: -1,
    statusPembayaran: -1,
    tanggal: -1,
    agen: -1,
  };

  let startRow = 0;
  if (headerRowIndices.length > 0) {
    const mainHeaderIdx = headerRowIndices[headerRowIndices.length - 1];
    startRow = mainHeaderIdx + 1;
    const maxCols = Math.max(...headerRowIndices.map((r) => (displayRows[r] || []).length));
    const mergedHeaders: string[] = [];

    for (let c = 0; c < maxCols; c++) {
      const parts: string[] = [];
      for (const r of headerRowIndices) {
        const val = String(displayRows[r]?.[c] || '').trim();
        if (val && !parts.includes(val)) parts.push(val);
      }
      mergedHeaders.push(parts.join(' ').trim());
    }

    colMap.no = mergedHeaders.findIndex((h) => /^no\.?$/i.test(h));
    colMap.resi = mergedHeaders.findIndex((h) => /cnote|c[\s_-]?note|no\s*resi|\bresi\b|awb|connote|airway\s*bill|no\s*cn|tracking/i.test(h));
    colMap.deskripsi = mergedHeaders.findIndex((h) => /deskripsi|keterangan|remarks|goods|isi\s*paket|description|catatan/i.test(h));
    colMap.layanan = mergedHeaders.findIndex((h) => /services?|layanan|produk|product/i.test(h));
    colMap.nama = mergedHeaders.findIndex((h) => /receiver|nama\s*penerima|penerima|consignee|nama\s*tujuan/i.test(h));
    colMap.alamatPenerima = mergedHeaders.findIndex((h) => /alamat\s*penerima|full\s*address|street/i.test(h));
    colMap.alamat = mergedHeaders.findIndex((h) => /kota\s*tujuan|destination|kecamatan|\bkota\b|city/i.test(h));
    if (colMap.alamat === -1) {
      colMap.alamat = mergedHeaders.findIndex((h, idx) => idx !== colMap.alamatPenerima && /tujuan|alamat|address/i.test(h));
    }
    colMap.pengirim = mergedHeaders.findIndex((h) => /shipper|pengirim|sender/i.test(h));
    colMap.nominal = mergedHeaders.findIndex((h) => /amount|ongkir|total\s*bayar|biaya|charge|freight|\bnet\b|tarif/i.test(h) && !/asuransi/i.test(h));
    if (colMap.nominal === -1) {
      colMap.nominal = mergedHeaders.findIndex((h) => /nominal/i.test(h) && !/asuransi/i.test(h));
    }
    colMap.asuransi = mergedHeaders.findIndex((h) => /asuransi|insurance/i.test(h));
    colMap.statusPembayaran = mergedHeaders.findIndex((h) => /status\s*pembayaran|payment\s*status|status\s*tagihan/i.test(h));
    colMap.tanggal = mergedHeaders.findIndex((h) => /tanggal|tgl|date|shipment/i.test(h));
    colMap.agen = mergedHeaders.findIndex((h) => /\bagen\b|agent|origin\s*branch|cabang/i.test(h));

    // Jika seperti format lama JNEMember dimana header Amount/Tanggal sempat kosong di I & J
    if (colMap.resi === 2 && colMap.pengirim === 7 && colMap.agen === 10) {
      if (colMap.nominal === -1) colMap.nominal = 8;
      if (colMap.tanggal === -1) colMap.tanggal = 9;
    }
  }

  const records: JneDetectedRecord[] = [];

  for (let r = startRow; r < displayRows.length; r++) {
    const dRow = displayRows[r] || [];
    const rRow = rawRows[r] || [];
    if (dRow.length === 0 && rRow.length === 0) continue;

    let noVal = '';
    let noResi = '';
    let deskripsi = '';
    let layanan = DEFAULT_JNE_SERVICE;
    let namaTujuan = '';
    let alamatPenerima = '';
    let alamatTujuan = '';
    let namaPengirim = defaultShipper;
    let nominal = 0;
    let asuransi = 0;
    let statusPembayaran = '';
    let tanggal = '';
    let agen = defaultAgen;

    if (colMap.resi !== -1) {
      noResi = cleanResi(dRow[colMap.resi] || rRow[colMap.resi]);
      if (!noResi || /^(CNOTENO|NORESI|TOTALTAGIHAN|TANGGALPEMBAYARAN)$/i.test(noResi)) continue;

      noVal = colMap.no !== -1 ? String(dRow[colMap.no] || '').trim() : '';
      deskripsi = colMap.deskripsi !== -1 ? String(dRow[colMap.deskripsi] ?? rRow[colMap.deskripsi] ?? '').trim() : '';
      layanan = colMap.layanan !== -1 ? normalizeJneService(dRow[colMap.layanan] || rRow[colMap.layanan]) : DEFAULT_JNE_SERVICE;
      namaTujuan = colMap.nama !== -1 ? String(dRow[colMap.nama] || rRow[colMap.nama] || '').trim() : '';
      alamatPenerima = colMap.alamatPenerima !== -1 ? String(dRow[colMap.alamatPenerima] || rRow[colMap.alamatPenerima] || '').trim() : '';
      alamatTujuan = colMap.alamat !== -1 ? String(dRow[colMap.alamat] || rRow[colMap.alamat] || '').trim() : '';
      namaPengirim = colMap.pengirim !== -1
        ? String(dRow[colMap.pengirim] || rRow[colMap.pengirim] || defaultShipper).trim()
        : defaultShipper;
      nominal = colMap.nominal !== -1
        ? normalizeNominal(typeof rRow[colMap.nominal] === 'number' ? rRow[colMap.nominal] : (dRow[colMap.nominal] || rRow[colMap.nominal]))
        : 0;
      asuransi = colMap.asuransi !== -1
        ? normalizeNominal(typeof rRow[colMap.asuransi] === 'number' ? rRow[colMap.asuransi] : (dRow[colMap.asuransi] || rRow[colMap.asuransi]))
        : 0;
      statusPembayaran = colMap.statusPembayaran !== -1
        ? String(dRow[colMap.statusPembayaran] || rRow[colMap.statusPembayaran] || '').trim()
        : '';
      tanggal = colMap.tanggal !== -1
        ? normalizeDate(rRow[colMap.tanggal] instanceof Date ? rRow[colMap.tanggal] : (dRow[colMap.tanggal] || rRow[colMap.tanggal]))
        : '';
      agen = colMap.agen !== -1
        ? String(dRow[colMap.agen] || rRow[colMap.agen] || defaultAgen).trim()
        : defaultAgen;
    } else {
      for (let c = 0; c < Math.max(dRow.length, rRow.length); c++) {
        const dVal = String(dRow[c] ?? '').trim();
        const rVal = rRow[c];
        if (!dVal && (rVal === null || rVal === undefined || rVal === '')) continue;

        const candidateResi = cleanResi(dVal || rVal);
        if (
          !noResi &&
          (/(?:JNE|TJNE|CGK[A-Z0-9]*|01)\d{8,17}/i.test(candidateResi) || /^\d{12,18}$/.test(candidateResi))
        ) {
          noResi = candidateResi;
          continue;
        }
        if (
          !tanggal &&
          (rVal instanceof Date ||
            (typeof rVal === 'number' && rVal > 30000 && rVal < 75000) ||
            /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(dVal) ||
            /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(dVal))
        ) {
          tanggal = normalizeDate(rVal instanceof Date ? rVal : dVal);
          continue;
        }
        if (/^(CTC\d*|CTCYES\d*|REG\d*|YES\*?\d*|JTR\d*|OKE\d*|SPS\d*)$/i.test(dVal)) {
          layanan = normalizeJneService(dVal);
          continue;
        }
        if (/^CCH-/i.test(dVal)) {
          namaPengirim = dVal;
          continue;
        }
        if (/^JNE\s*(?:Member|Corporate|Corporated)$/i.test(dVal)) {
          agen = dVal;
          continue;
        }
        const numVal = normalizeNominal(typeof rVal === 'number' ? rVal : dVal);
        if (
          numVal >= 1000 &&
          numVal <= 50000000 &&
          (/^Rp/i.test(dVal) || typeof rVal === 'number' || /^[\d\.,]+$/.test(dVal)) &&
          (!nominal || numVal > nominal)
        ) {
          nominal = numVal;
          continue;
        }
      }
    }

    if (noResi && noResi.length >= 8 && /[0-9]{6,}/.test(noResi)) {
      records.push({
        id: `JNE-${sheetTab}-${noResi}-${r}`,
        no: noVal,
        no_resi: noResi,
        deskripsi,
        layanan: layanan || DEFAULT_JNE_SERVICE,
        nama_tujuan: namaTujuan || '-',
        ...(alamatPenerima ? { alamat_penerima: alamatPenerima } : {}),
        alamat_tujuan: alamatTujuan || '-',
        nama_pengirim: namaPengirim || defaultShipper,
        nominal,
        ...(sheetTab === 'corporate' || asuransi > 0 ? { asuransi } : {}),
        ...(statusPembayaran ? { status_pembayaran: statusPembayaran } : {}),
        tanggal: tanggal || normalizeDate(new Date()),
        agen: agen || defaultAgen,
        source_file: fileName + (sheetName && sheetName !== 'Sheet1' ? ` (${sheetName})` : ''),
      });
    }
  }

  return records;
}

/**
 * =========================================================================
 * 1. PARSER EXCEL & CSV (.xlsx, .xls, .csv)
 * =========================================================================
 */
export async function parseExcelJneFile(
  file: File,
  sheetTab: JneSheetTab = 'member'
): Promise<ParseResult> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      raw: false,
    });

    let allRecords: JneDetectedRecord[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      // Baca formatted text (raw: false) untuk menjaga leading zero Cnote No, dan raw: true untuk angka/Date asli
      const displayRows: string[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false,
      });
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true,
      });

      const sheetRecords = extractRecordsFromMatrix(displayRows, rawRows, file.name, sheetName, sheetTab);
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
        fileType: isCsv ? 'csv' : 'excel',
        engine: 'xlsx',
        error: 'Tidak ditemukan nomor resi JNE yang valid di file ini.',
      };
    }

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
      fileType: isCsv ? 'csv' : 'excel',
      engine: 'xlsx',
    };
  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: isCsv ? 'csv' : 'excel',
      engine: 'xlsx',
      error: `Gagal membaca file ${isCsv ? 'CSV' : 'Excel'}: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Kompres / resize gambar di browser agar ringan dikirim ke Gemini Vision API (< 1.5 MB)
 * namun tetap tajam untuk membaca angka Cnote 15-16 digit.
 */
async function convertImageFileToBase64(file: File | Blob): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => {
        // Fallback kirim raw base64 jika elemen Image gagal decode
        const commaIdx = dataUrl.indexOf(',');
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        resolve({
          mimeType: mimeMatch ? mimeMatch[1] : (file.type || 'image/png'),
          data: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
        });
      };
      img.onload = () => {
        const MAX_DIM = 2200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const commaIdx = dataUrl.indexOf(',');
          resolve({
            mimeType: file.type || 'image/png',
            data: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
          });
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const outUrl = canvas.toDataURL('image/jpeg', 0.9);
        const commaIdx = outUrl.indexOf(',');
        resolve({
          mimeType: 'image/jpeg',
          data: commaIdx !== -1 ? outUrl.slice(commaIdx + 1) : outUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Ekstrak JSON array records dari respons teks Gemini Vision
 */
function parseGeminiVisionJsonOutput(
  rawText: string,
  fileName: string,
  sheetTab: JneSheetTab = 'member'
): JneDetectedRecord[] {
  let cleaned = String(rawText || '').trim();
  if (!cleaned) return [];

  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (arrStart !== -1 && arrEnd > arrStart) {
      parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } else if (objStart !== -1 && objEnd > objStart) {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
    }
  }

  const rawItems: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];

  const records: JneDetectedRecord[] = [];
  const seen = new Set<string>();
  const todayIso = normalizeDate(new Date());
  const defaultAgen = sheetTab === 'corporate' ? DEFAULT_AGEN_CORPORATE : DEFAULT_AGEN_NAME;
  const defaultShipper = sheetTab === 'corporate' ? '' : DEFAULT_SHIPPER_NAME;

  rawItems.forEach((it, idx) => {
    const noResi = cleanResi(it?.no_resi || it?.cnote_no || it?.cnote || it?.resi || it?.awb);
    if (!noResi || noResi.length < 7 || seen.has(noResi)) return;
    seen.add(noResi);

    const deskripsi = String(it?.deskripsi || it?.deskripsi_pengiriman || it?.keterangan || '').trim();
    const layanan = normalizeJneService(it?.layanan || it?.services || it?.service || DEFAULT_JNE_SERVICE);
    const namaTujuan = String(it?.nama_tujuan || it?.receiver_name || it?.penerima || '-').trim() || '-';
    const alamatPenerima = String(it?.alamat_penerima || it?.full_address || '').trim();
    const alamatTujuan = String(it?.alamat_tujuan || it?.destination || it?.kota_tujuan || it?.tujuan || '-').trim() || '-';
    const namaPengirim = String(it?.nama_pengirim || it?.shipper_name || defaultShipper).trim() || defaultShipper;
    const nominal = normalizeNominal(it?.nominal ?? it?.ongkir ?? it?.amount ?? 0);
    const asuransi = normalizeNominal(it?.asuransi ?? it?.nominal_asuransi ?? 0);
    const tanggal = normalizeDate(it?.tanggal || it?.date) || todayIso;
    const agen = String(it?.agen || defaultAgen).trim() || defaultAgen;

    records.push({
      id: `JNE-${sheetTab}-${noResi}-AI-${idx + 1}`,
      no_resi: noResi,
      deskripsi,
      layanan,
      nama_tujuan: namaTujuan,
      ...(alamatPenerima ? { alamat_penerima: alamatPenerima } : {}),
      alamat_tujuan: alamatTujuan,
      nama_pengirim: namaPengirim,
      nominal,
      ...(sheetTab === 'corporate' || asuransi > 0 ? { asuransi } : {}),
      tanggal,
      agen,
      source_file: fileName,
    });
  });

  return records;
}

/**
 * Panggil endpoint /api/ai (Gemini Multimodal Vision) untuk membaca gambar/screenshot tagihan atau struk resi JNE
 */
async function extractJneFromBase64ViaAi(
  images: Array<{ mimeType: string; data: string }>,
  fileName: string,
  sheetTab: JneSheetTab = 'member'
): Promise<JneDetectedRecord[]> {
  const defaultAgen = sheetTab === 'corporate' ? DEFAULT_AGEN_CORPORATE : DEFAULT_AGEN_NAME;
  const systemInstruction = [
    'Anda adalah mesin ekstraksi dokumen tagihan & resi ekspedisi JNE tingkat presisi tinggi.',
    'Tugas Anda membaca gambar screenshot tabel tagihan JNE, spreadsheet, portal MyJNE, chat WA, atau foto struk fisik resi JNE, lalu mengekstrak SELURUH baris resi yang terlihat ke dalam JSON murni.',
    'ATURAN KETAT:',
    '1. Pertahankan seluruh digit & huruf Nomor Resi / Cnote No apa adanya termasuk angka 0 di paling depan (contoh: "013790032629726", "0148192500000060", "CGKEC79399447826"). JANGAN menebak karakter yang tidak ada.',
    '2. Kolom yang diekstrak per item:',
    '   - "no_resi": string Nomor Resi / Cnote No JNE',
    '   - "deskripsi": string Deskripsi pengiriman / referensi order jika tertulis di gambar (jika tidak ada isi "")',
    '   - "layanan": string kode layanan JNE seperti "CTC23", "REG23", "CTCYES23", "YES23", "YES", "JTR23" (default "REG23" jika tidak terlihat)',
    '   - "nama_tujuan": string nama penerima',
    '   - "alamat_penerima": string alamat jalan lengkap penerima jika ada (opsional, jika tidak ada isi "")',
    '   - "alamat_tujuan": string kota/kecamatan tujuan',
    '   - "nama_pengirim": string nama pengirim (kosongkan jika tidak tertulis)',
    '   - "nominal": integer angka murni biaya ongkir/amount dalam Rupiah tanpa titik/Rp (contoh: "Rp 18.000" -> 18000)',
    '   - "asuransi": integer angka murni nominal asuransi dalam Rupiah (default 0)',
    '   - "tanggal": string tanggal pengiriman dalam format "YYYY-MM-DD" (contoh: "23/11/2026" -> "2026-11-23")',
    `   - "agen": string nama agen (default "${defaultAgen}" jika tidak tertulis)`,
    '3. Kembalikan HANYA objek JSON dengan format: {"records": [ ... ]} tanpa teks penjelasan lain.',
  ].join('\n');

  const parts: any[] = images.map((img) => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.data,
    },
  }));
  parts.push({
    text: 'Ekstrak semua baris data resi / tagihan JNE pada gambar ini ke JSON {"records": [...]}. Pastikan nomor resi (termasuk angka 0 di depan), layanan, nama penerima, tujuan, ongkir, dan tanggal terbaca akurat.',
  });

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
      },
      speedMode: 'fast',
      stream: false,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error || `AI Vision HTTP ${res.status}`);
  }

  const data = await res.json();
  const text =
    data?.text ||
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (p?.thought ? '' : p?.text || ''))
      .join('') ||
    '';

  return parseGeminiVisionJsonOutput(text, fileName, sheetTab);
}

/**
 * =========================================================================
 * 2. PARSER GAMBAR / SCREENSHOT (.png, .jpg, .jpeg, .webp)
 *    Primary: Gemini Vision AI -> Fallback: Tesseract.js OCR
 * =========================================================================
 */
export async function parseImageJneFile(
  file: File,
  onProgress?: (pct: number) => void,
  sheetTab: JneSheetTab = 'member'
): Promise<ParseResult> {
  try {
    onProgress?.(15);
    const base64Img = await convertImageFileToBase64(file);
    onProgress?.(40);

    try {
      const aiRecords = await extractJneFromBase64ViaAi([base64Img], file.name, sheetTab);
      onProgress?.(100);
      if (aiRecords.length > 0) {
        return {
          success: true,
          records: aiRecords,
          totalDetected: aiRecords.length,
          fileName: file.name,
          fileType: 'image',
          engine: 'gemini-vision',
        };
      }
    } catch (aiErr) {
      console.warn('[JNE Parser] Gemini Vision gagal, beralih ke OCR lokal:', aiErr);
    }

    onProgress?.(50);
    const tesseractCdnUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
    const Tesseract: any = await import(/* @vite-ignore */ tesseractCdnUrl);

    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text' && onProgress && typeof m.progress === 'number') {
          onProgress(50 + Math.round(m.progress * 50));
        }
      },
    });

    const ret = await worker.recognize(file);
    await worker.terminate();

    const rawText = ret.data.text || '';
    const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const records = extractJneRecordsFromTextLines(lines, file.name, sheetTab);

    return {
      success: records.length > 0,
      records,
      totalDetected: records.length,
      fileName: file.name,
      fileType: 'image',
      engine: 'ocr-fallback',
      error: records.length === 0 ? 'Tidak ada nomor resi JNE yang terbaca jelas pada gambar ini.' : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'image',
      error: `Gagal membaca gambar/screenshot: ${err?.message || String(err)}`,
    };
  }
}

/**
 * =========================================================================
 * 3. PARSER PDF (.pdf) — Digital Text + Fallback Render Halaman ke AI Vision
 * =========================================================================
 */
export async function parsePdfJneFile(
  file: File,
  onProgress?: (pct: number) => void,
  sheetTab: JneSheetTab = 'member'
): Promise<ParseResult> {
  try {
    onProgress?.(10);
    const arrayBuffer = await file.arrayBuffer();
    const pdfCdnUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
    const pdfjsLib: any = await import(/* @vite-ignore */ pdfCdnUrl);

    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    }

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const fullLines: string[] = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const rowBuckets: { [y: number]: Array<{ x: number; str: string }> } = {};

      for (const item of textContent.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const x = Math.round(item.transform[4]);
        if (!rowBuckets[y]) rowBuckets[y] = [];
        rowBuckets[y].push({ x, str: item.str });
      }

      const sortedYs = Object.keys(rowBuckets).map(Number).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const lineText = rowBuckets[y]
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join('\t')
          .trim();
        if (lineText) fullLines.push(lineText);
      }
      onProgress?.(10 + Math.round((pageNum / numPages) * 45));
    }

    const textRecords = extractJneRecordsFromTextLines(fullLines, file.name, sheetTab);
    if (textRecords.length > 0) {
      onProgress?.(100);
      return {
        success: true,
        records: textRecords,
        totalDetected: textRecords.length,
        fileName: file.name,
        fileType: 'pdf',
        engine: 'pdf-text',
      };
    }

    const renderedImages: Array<{ mimeType: string; data: string }> = [];
    const maxVisionPages = Math.min(numPages, 4);
    for (let p = 1; p <= maxVisionPages; p++) {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const commaIdx = dataUrl.indexOf(',');
        renderedImages.push({
          mimeType: 'image/jpeg',
          data: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
        });
      }
    }

    if (renderedImages.length > 0) {
      const visionRecords = await extractJneFromBase64ViaAi(renderedImages, file.name, sheetTab);
      onProgress?.(100);
      return {
        success: visionRecords.length > 0,
        records: visionRecords,
        totalDetected: visionRecords.length,
        fileName: file.name,
        fileType: 'pdf',
        engine: 'gemini-vision',
        error: visionRecords.length === 0 ? 'Tidak ada nomor resi JNE yang terbaca di file PDF ini.' : undefined,
      };
    }

    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'pdf',
      error: 'Tidak ditemukan data resi JNE pada file PDF ini.',
    };
  } catch (err: any) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: file.name,
      fileType: 'pdf',
      error: `Gagal membaca file PDF: ${err?.message || String(err)}`,
    };
  }
}

/**
 * =========================================================================
 * 4. TEMPEL TEKS / BARIS SPREADSHEET (Copy-Paste dari Excel/GSheet/WA)
 * =========================================================================
 */
export function parsePastedJneText(
  rawText: string,
  sourceLabel: string = 'Tempel Teks',
  sheetTab: JneSheetTab = 'member'
): ParseResult {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return {
      success: false,
      records: [],
      totalDetected: 0,
      fileName: sourceLabel,
      fileType: 'text',
      engine: 'text-paste',
      error: 'Teks tempelan masih kosong.',
    };
  }

  const rawLines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const hasTabs = rawLines.some((l) => l.includes('\t'));
  if (hasTabs) {
    const matrix = rawLines.map((l) => l.split('\t').map((c) => c.trim()));
    const fromMatrix = extractRecordsFromMatrix(matrix, matrix, sourceLabel, '', sheetTab);
    if (fromMatrix.length > 0) {
      return {
        success: true,
        records: fromMatrix,
        totalDetected: fromMatrix.length,
        fileName: sourceLabel,
        fileType: 'text',
        engine: 'text-paste',
      };
    }
  }

  const fromLines = extractJneRecordsFromTextLines(rawLines, sourceLabel, sheetTab);
  return {
    success: fromLines.length > 0,
    records: fromLines,
    totalDetected: fromLines.length,
    fileName: sourceLabel,
    fileType: 'text',
    engine: 'text-paste',
    error: fromLines.length === 0 ? 'Tidak ditemukan nomor resi JNE yang valid dari teks ini.' : undefined,
  };
}

/**
 * =========================================================================
 * 5. REGEX EXTRACTOR DARI BARIS TEKS (Untuk PDF Digital, Paste Teks & OCR)
 * =========================================================================
 */
export function extractJneRecordsFromTextLines(
  lines: string[],
  fileName: string,
  sheetTab: JneSheetTab = 'member'
): JneDetectedRecord[] {
  const records: JneDetectedRecord[] = [];
  const seenResi = new Set<string>();
  const defaultAgen = sheetTab === 'corporate' ? DEFAULT_AGEN_CORPORATE : DEFAULT_AGEN_NAME;
  const defaultShipper = sheetTab === 'corporate' ? '' : DEFAULT_SHIPPER_NAME;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    const resiMatch =
      line.match(/\b((?:JNE|TJNE|CGK[A-Z0-9]*|01)[A-Z0-9]{8,18})\b/i) ||
      line.match(/\b([0-9]{12,18})\b/);

    if (resiMatch) {
      const resi = cleanResi(resiMatch[1]);
      if (seenResi.has(resi) || resi.length < 10) continue;
      seenResi.add(resi);

      const contextLines = [lines[idx - 1] || '', line, lines[idx + 1] || ''].join(' ');
      const dateMatch =
        contextLines.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/) ||
        contextLines.match(/\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/);
      const tanggal = dateMatch ? normalizeDate(dateMatch[1]) : normalizeDate(new Date());

      const nominalMatch = contextLines.match(
        /(?:Rp\.?\s*|IDR\s*)([0-9]{1,3}(?:[,\.][0-9]{3})+(?:[\.,][0-9]{2})?|[0-9]{4,8})/i
      ) || line.replace(resiMatch[1], ' ').match(/\b([0-9]{1,3}(?:[\.,][0-9]{3})+)\b/);
      const nominal = nominalMatch ? normalizeNominal(nominalMatch[1]) : 0;

      const serviceMatch = contextLines.match(/\b(CTCYES\d*|CTC\d*|REG\d*|YES\*?\d*|JTR\d*|OKE\d*|SPS\d*)\b/i);
      const layanan = serviceMatch ? normalizeJneService(serviceMatch[1]) : DEFAULT_JNE_SERVICE;

      let namaTujuan = '-';
      let alamatTujuan = '-';
      const parts = line.split(/\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        const resiIdx = parts.findIndex((p) => cleanResi(p) === resi);
        if (resiIdx !== -1 && parts[resiIdx + 2]) {
          namaTujuan = parts[resiIdx + 2];
          if (parts[resiIdx + 3] && !/^Rp/i.test(parts[resiIdx + 3])) {
            alamatTujuan = parts[resiIdx + 3];
          }
        }
      }

      records.push({
        id: `JNE-${sheetTab}-${resi}-${records.length + 1}`,
        no_resi: resi,
        deskripsi: '',
        layanan,
        nama_tujuan: namaTujuan,
        alamat_tujuan: alamatTujuan,
        nama_pengirim: defaultShipper,
        nominal,
        ...(sheetTab === 'corporate' ? { asuransi: 0 } : {}),
        tanggal,
        agen: defaultAgen,
        source_file: fileName,
        raw_line: line,
      });
    }
  }

  return records;
}

/**
 * Universal Entry Point: Deteksi otomatis format file (Excel, CSV, Gambar/SS, PDF)
 */
export async function parseJneImportFile(
  file: File,
  onProgress?: (pct: number) => void,
  sheetTab: JneSheetTab = 'member'
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || mime.includes('spreadsheet') || mime.includes('csv')) {
    onProgress?.(40);
    const res = await parseExcelJneFile(file, sheetTab);
    onProgress?.(100);
    return res;
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    return parsePdfJneFile(file, onProgress, sheetTab);
  }

  if (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'webp' ||
    mime.startsWith('image/')
  ) {
    return parseImageJneFile(file, onProgress, sheetTab);
  }

  return {
    success: false,
    records: [],
    totalDetected: 0,
    fileName: file.name,
    fileType: 'unknown',
    error: `Format file .${ext || 'unknown'} belum didukung. Gunakan Excel (.xlsx/.xls), CSV (.csv), Gambar/Screenshot (.png/.jpg/.webp), atau PDF (.pdf).`,
  };
}
