import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface AiAttachment {
  id: string;
  name: string;
  type: 'image' | 'excel' | 'csv' | 'file';
  mimeType: string;
  sizeBytes: number;
  base64Data?: string; // Pure base64 data for Gemini inlineData
  previewUrl?: string; // Data URL for UI thumbnail
  extractedText?: string; // Extracted tabular text for Excel / CSV
  rowCount?: number;
}

/**
 * Resize and compress image using HTMLCanvasElement to prevent massive base64 payloads
 * Keeps maximum dimension within 1280px and JPEG quality at 0.82 (typically 100KB-350KB).
 */
export async function compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.82): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
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
 * Parse an uploaded file (Image, Excel, or CSV) into structured AiAttachment
 */
export async function parseAiAttachmentFile(file: File): Promise<AiAttachment> {
  const fileName = file.name || 'lampiran';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const fileId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Gambar (Foto Dokumen, Surat Jalan, Label, Baju)
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) {
    const { dataUrl, base64, mimeType } = await compressImageToDataUrl(file);
    return {
      id: fileId,
      name: fileName,
      type: 'image',
      mimeType: mimeType,
      sizeBytes: file.size,
      base64Data: base64,
      previewUrl: dataUrl
    };
  }

  // 2. Spreadsheet Excel (.xlsx, .xls)
  if (['xlsx', 'xls'].includes(ext) || file.type.includes('spreadsheet') || file.type.includes('excel')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file Excel'));
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
          const firstSheetName = wb.SheetNames[0] || 'Sheet1';
          const sheet = wb.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          const rowCount = rawRows.length;
          // Ambil maksimal 80 baris pertama untuk menghemat token dan mencegah overflow
          const previewRows = rawRows.slice(0, 80);
          const extractedText = JSON.stringify(previewRows, null, 2);

          resolve({
            id: fileId,
            name: fileName,
            type: 'excel',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: file.size,
            rowCount: rowCount,
            extractedText: extractedText
          });
        } catch (err: any) {
          reject(new Error(`Gagal mengurai file Excel: ${err?.message || err}`));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // 3. File CSV (.csv)
  if (ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file CSV'));
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          const rawRows: any[] = parsed.data as any[];

          const rowCount = rawRows.length;
          const previewRows = rawRows.slice(0, 80);
          const extractedText = JSON.stringify(previewRows, null, 2);

          resolve({
            id: fileId,
            name: fileName,
            type: 'csv',
            mimeType: 'text/csv',
            sizeBytes: file.size,
            rowCount: rowCount,
            extractedText: extractedText
          });
        } catch (err: any) {
          reject(new Error(`Gagal mengurai file CSV: ${err?.message || err}`));
        }
      };
      reader.readAsText(file);
    });
  }

  // Fallback file teks biasa
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = (e) => {
      const text = String(e.target?.result || '').slice(0, 4000);
      resolve({
        id: fileId,
        name: fileName,
        type: 'file',
        mimeType: file.type || 'text/plain',
        sizeBytes: file.size,
        extractedText: text
      });
    };
    reader.readAsText(file);
  });
}

