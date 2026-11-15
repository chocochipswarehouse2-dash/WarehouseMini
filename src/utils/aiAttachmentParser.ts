import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface AiAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'excel' | 'csv' | 'file';
  mimeType: string;
  sizeBytes: number;
  base64Data?: string; // Pure base64 data for Gemini inlineData (images & PDFs)
  previewUrl?: string; // Data URL for UI thumbnail
  extractedText?: string; // Extracted tabular/markdown text for Excel / CSV / plain text
  rowCount?: number;
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TABLE_ROWS = 250;

function formatTabularRowsForAi(rows: any[], sheetLabel?: string): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `${sheetLabel ? `[${sheetLabel}] ` : ''}(0 baris data)`;
  }

  const allHeaders: string[] = [];
  const seen = new Set<string>();
  const sampleForHeaders = rows.slice(0, 50);
  for (const r of sampleForHeaders) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) {
        const cleanK = String(k).trim();
        if (cleanK && !seen.has(cleanK)) {
          seen.add(cleanK);
          allHeaders.push(cleanK);
        }
      }
    }
  }

  // Compute full-dataset numeric totals for quantity / amount columns
  const numericTotals: Record<string, number> = {};
  const numericCounts: Record<string, number> = {};
  const numericColRegex = /(qty|pcs|jumlah|total|nominal|stok|stock|harga|ongkir|berat|subtotal|grand|tagihan|biaya|selisih)/i;

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const h of allHeaders) {
      if (!numericColRegex.test(h)) continue;
      const raw = r[h];
      if (raw === '' || raw === null || raw === undefined) continue;
      const num =
        typeof raw === 'number'
          ? raw
          : Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(num)) {
        numericTotals[h] = (numericTotals[h] || 0) + num;
        numericCounts[h] = (numericCounts[h] || 0) + 1;
      }
    }
  }

  const previewRows = rows.slice(0, MAX_TABLE_ROWS);
  const sanitizeCell = (val: any) => {
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val ?? '').replace(/[\r\n|]+/g, ' ').trim().slice(0, 120);
  };

  const lines: string[] = [];
  if (sheetLabel) {
    lines.push(`### ${sheetLabel} (Total ${rows.length} baris, ditampilkan ${previewRows.length} baris pertama)`);
  } else {
    lines.push(`Total ${rows.length} baris (ditampilkan ${previewRows.length} baris pertama):`);
  }

  const totalKeys = Object.keys(numericTotals);
  if (totalKeys.length > 0) {
    lines.push(
      `Ringkasan Total Seluruh ${rows.length} Baris: ` +
        totalKeys.map((k) => `${k}=${numericTotals[k].toLocaleString('id-ID')} (${numericCounts[k]} baris)`).join(' | ')
    );
  }

  if (allHeaders.length > 0) {
    lines.push(`| ${allHeaders.join(' | ')} |`);
    lines.push(`| ${allHeaders.map(() => '---').join(' | ')} |`);
    for (const row of previewRows) {
      lines.push(`| ${allHeaders.map((h) => sanitizeCell(row?.[h])).join(' | ')} |`);
    }
  } else {
    lines.push(JSON.stringify(previewRows, null, 2));
  }

  return lines.join('\n');
}

/**
 * Resize and compress image using HTMLCanvasElement to prevent massive base64 payloads
 * Keeps maximum dimension within 1280px and JPEG quality at 0.82 (typically 100KB-350KB).
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memuat gambar ke memori'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const rawResult = reader.result as string;
          const base64 = rawResult.split(',')[1] || '';
          resolve({ dataUrl: rawResult, base64, mimeType: file.type || 'image/jpeg' });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ dataUrl, base64, mimeType });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Parse an uploaded file (Image, PDF, Excel, CSV, or Text) into structured AiAttachment
 */
export async function parseAiAttachmentFile(file: File): Promise<AiAttachment> {
  const fileName = file.name || 'lampiran';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const fileId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Gambar (Foto Dokumen, Surat Jalan, Label, Baju, Bukti Transfer)
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
    const { dataUrl, base64, mimeType } = await compressImageToDataUrl(file);
    return {
      id: fileId,
      name: fileName,
      type: 'image',
      mimeType,
      sizeBytes: file.size,
      base64Data: base64,
      previewUrl: dataUrl,
    };
  }

  // 2. Dokumen PDF (Invoice, Surat Jalan PDF, Tagihan Ekspedisi, PO, SOP)
  if (ext === 'pdf' || file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`Ukuran PDF "${fileName}" melebihi batas 15 MB. Silakan perkecil atau bagi file terlebih dahulu.`);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file PDF'));
      reader.onload = () => {
        const rawResult = String(reader.result || '');
        const base64 = rawResult.includes(',') ? rawResult.split(',')[1] || '' : rawResult;
        resolve({
          id: fileId,
          name: fileName,
          type: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: file.size,
          base64Data: base64,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // 3. Spreadsheet Excel (.xlsx, .xls) - Multi-sheet + up to 250 rows markdown + full column totals
  if (['xlsx', 'xls'].includes(ext) || file.type.includes('spreadsheet') || file.type.includes('excel')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file Excel'));
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
          const sheetNames = wb.SheetNames || [];
          let totalRowCount = 0;
          const sheetSections: string[] = [];

          for (const sName of sheetNames.slice(0, 4)) {
            const sheet = wb.Sheets[sName];
            if (!sheet) continue;
            const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            totalRowCount += rawRows.length;
            sheetSections.push(formatTabularRowsForAi(rawRows, `Sheet: ${sName}`));
          }

          resolve({
            id: fileId,
            name: fileName,
            type: 'excel',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: file.size,
            rowCount: totalRowCount,
            extractedText: sheetSections.join('\n\n'),
          });
        } catch (err: any) {
          reject(new Error(`Gagal mengurai file Excel: ${err?.message || err}`));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // 4. File CSV (.csv) - up to 250 rows markdown + full column totals
  if (ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file CSV'));
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          const rawRows: any[] = parsed.data as any[];

          resolve({
            id: fileId,
            name: fileName,
            type: 'csv',
            mimeType: 'text/csv',
            sizeBytes: file.size,
            rowCount: rawRows.length,
            extractedText: formatTabularRowsForAi(rawRows),
          });
        } catch (err: any) {
          reject(new Error(`Gagal mengurai file CSV: ${err?.message || err}`));
        }
      };
      reader.readAsText(file);
    });
  }

  // Fallback file teks biasa (.txt, .json, .md)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = (e) => {
      const text = String(e.target?.result || '').slice(0, 20000);
      resolve({
        id: fileId,
        name: fileName,
        type: 'file',
        mimeType: file.type || 'text/plain',
        sizeBytes: file.size,
        extractedText: text,
      });
    };
    reader.readAsText(file);
  });
}
