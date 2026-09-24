import ExcelJS from 'exceljs';
import { PenerimaanProduksiItem } from '../types';

export interface HitungUlangRowItem {
  id?: string | number;
  kode_produksi: string;
  nama_produk?: string;
  warna: string;
  size: string;
  tanggal_penerimaan: string;
  no_surat_jalan: string;
  foto_url?: string;
  qty_sebelumnya: number; // Qty baseline data tercatat
  qty_hitung_ulang: number | null; // Qty hasil hitung ulang fisik
  selisih: number; // qty_hitung_ulang - qty_sebelumnya
  catatan?: string;
}

export interface HitungUlangExportPayload {
  kode_produksi: string;
  nama_produk?: string;
  kategori?: string;
  up_vendor?: string;
  tanggal_pemeriksaan: string;
  petugas_pemeriksa: string;
  foto_url?: string;
  items: HitungUlangRowItem[];
}

// Fetch base64 image helper
async function fetchImageBuffer(
  url: string
): Promise<{ base64: string; extension: 'jpeg' | 'png' | 'gif' } | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resStr = reader.result as string;
        if (!resStr || !resStr.includes(',')) {
          resolve(null);
          return;
        }
        const base64 = resStr.split(',')[1];
        let extension: 'jpeg' | 'png' | 'gif' = 'jpeg';
        if (blob.type.includes('png') || url.toLowerCase().endsWith('.png')) {
          extension = 'png';
        } else if (blob.type.includes('gif') || url.toLowerCase().endsWith('.gif')) {
          extension = 'gif';
        }
        resolve({ base64, extension });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportHitungUlangToExcel(
  payload: HitungUlangExportPayload,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Menyiapkan lembar hitung ulang Excel...');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WMS Produksi - Audit Stock';
  workbook.lastModifiedBy = 'WMS Produksi System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(`Hitung Ulang - ${payload.kode_produksi}`, {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Column definitions
  worksheet.columns = [
    { key: 'no', width: 6 }, // A: NO
    { key: 'tanggal', width: 14 }, // B: TANGGAL
    { key: 'no_sj', width: 18 }, // C: NO SJ
    { key: 'warna', width: 16 }, // D: COLOR
    { key: 'size', width: 10 }, // E: SIZE
    { key: 'qty_sebelumnya', width: 22 }, // F: QTY HITUNGAN SEBELUMNYA
    { key: 'qty_hitung_ulang', width: 22 }, // G: QTY HITUNG ULANG FISIK
    { key: 'selisih', width: 14 }, // H: SELISIH (+/-)
    { key: 'status', width: 16 }, // I: STATUS
    { key: 'catatan', width: 24 }, // J: CATATAN AUDIT
  ];

  // Colors & Fills
  const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }, // Slate 100
  };

  const HIGHLIGHT_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFCE8E6' }, // Rose 50
  };

  const BORDER_THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // 1. TITLE BLOCK
  worksheet.mergeCells('A1', 'J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'LEMBAR PENGECEKAN & HITUNG ULANG KEDATANGAN PRODUKSI';
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // 2. METADATA BLOCK
  worksheet.getCell('A3').value = 'KODE PRODUKSI:';
  worksheet.getCell('A3').font = { bold: true };
  worksheet.getCell('B3').value = payload.kode_produksi;
  worksheet.getCell('B3').font = { bold: true, color: { argb: 'FFE11D48' } };

  worksheet.getCell('D3').value = 'NAMA PRODUK:';
  worksheet.getCell('D3').font = { bold: true };
  worksheet.getCell('E3').value = payload.nama_produk || '-';

  worksheet.getCell('G3').value = 'TANGGAL AUDIT:';
  worksheet.getCell('G3').font = { bold: true };
  worksheet.getCell('H3').value = payload.tanggal_pemeriksaan;

  worksheet.getCell('A4').value = 'KATEGORI:';
  worksheet.getCell('A4').font = { bold: true };
  worksheet.getCell('B4').value = payload.kategori || '-';

  worksheet.getCell('D4').value = 'PETUGAS AUDITOR:';
  worksheet.getCell('D4').font = { bold: true };
  worksheet.getCell('E4').value = payload.petugas_pemeriksa || 'Auditor Lapangan';

  worksheet.getCell('G4').value = 'STATUS CEK:';
  worksheet.getCell('G4').font = { bold: true };
  worksheet.getCell('H4').value = 'Verifikasi Lapangan';

  // 3. TABLE HEADER (Row 6)
  const headerRow = worksheet.getRow(6);
  headerRow.height = 26;
  headerRow.values = [
    'NO',
    'TANGGAL',
    'SURAT JALAN',
    'COLOR',
    'SIZE',
    'HITUNGAN SEBELUMNYA (PCS)',
    'HITUNG ULANG FISIK (PCS)',
    'SELISIH (+/-)',
    'STATUS',
    'CATATAN AUDITOR',
  ];

  for (let c = 1; c <= 10; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = HIGHLIGHT_FILL;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_THIN;
  }

  // 4. DATA ROWS
  let currentRow = 7;
  let totalPrev = 0;
  let totalRecount = 0;

  payload.items.forEach((item, idx) => {
    const row = worksheet.getRow(currentRow);
    row.height = 22;

    const prevQty = item.qty_sebelumnya || 0;
    const recountQty = item.qty_hitung_ulang !== null ? item.qty_hitung_ulang : '';
    const selisih = item.qty_hitung_ulang !== null ? item.qty_hitung_ulang - prevQty : '';

    let statusStr = 'Pending Fisik';
    if (item.qty_hitung_ulang !== null) {
      if (item.qty_hitung_ulang === prevQty) statusStr = 'Cocok (Match)';
      else if (item.qty_hitung_ulang > prevQty) statusStr = `Lebih (+${item.qty_hitung_ulang - prevQty})`;
      else statusStr = `Kurang (${item.qty_hitung_ulang - prevQty})`;
    }

    row.values = [
      idx + 1,
      item.tanggal_penerimaan || '-',
      item.no_surat_jalan || '-',
      item.warna,
      item.size,
      prevQty,
      recountQty,
      selisih,
      statusStr,
      item.catatan || '',
    ];

    totalPrev += prevQty;
    if (typeof recountQty === 'number') totalRecount += recountQty;

    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1E293B' } };
      cell.border = BORDER_THIN;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };

      if (c === 6) {
        cell.font = { bold: true, color: { argb: 'FF2563EB' } }; // Blue
      } else if (c === 7) {
        cell.font = { bold: true, color: { argb: 'FFE11D48' } }; // Red/Rose
      } else if (c === 8 && typeof selisih === 'number') {
        if (selisih !== 0) {
          cell.font = { bold: true, color: selisih > 0 ? { argb: 'FF16A34A' } : { argb: 'FFDC2626' } };
        }
      }
    }

    currentRow++;
  });

  // 5. TOTAL ROW
  const totalRow = worksheet.getRow(currentRow);
  totalRow.height = 24;
  worksheet.mergeCells(currentRow, 1, currentRow, 5);
  const totalLabelCell = totalRow.getCell(1);
  totalLabelCell.value = 'TOTAL KESELURUHAN (PCS):';
  totalLabelCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  totalLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };

  totalRow.getCell(6).value = totalPrev;
  totalRow.getCell(6).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2563EB' } };

  totalRow.getCell(7).value = totalRecount || '';
  totalRow.getCell(7).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE11D48' } };

  const totalSelisih = totalRecount ? totalRecount - totalPrev : '';
  totalRow.getCell(8).value = totalSelisih;
  totalRow.getCell(8).font = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: typeof totalSelisih === 'number' && totalSelisih < 0 ? { argb: 'FFDC2626' } : { argb: 'FF16A34A' },
  };

  for (let c = 1; c <= 10; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = HEADER_FILL;
    cell.border = BORDER_THIN;
    if (c >= 6) cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  currentRow += 2;

  // 6. SIGNATURE BLOCK (Checker & Supervisor)
  const signHeaderRow = worksheet.getRow(currentRow);
  signHeaderRow.getCell(2).value = 'Petugas Hitung Ulang:';
  signHeaderRow.getCell(2).font = { bold: true };
  signHeaderRow.getCell(8).value = 'Kepala Gudang / Supervisor:';
  signHeaderRow.getCell(8).font = { bold: true };

  currentRow += 4;
  const signNameRow = worksheet.getRow(currentRow);
  signNameRow.getCell(2).value = `( ${payload.petugas_pemeriksa || '................................'} )`;
  signNameRow.getCell(8).value = '( ................................ )';

  // Embed Photo if available
  if (payload.foto_url) {
    try {
      const img = await fetchImageBuffer(payload.foto_url);
      if (img) {
        const imageId = workbook.addImage({
          base64: img.base64,
          extension: img.extension,
        });
        worksheet.addImage(imageId, {
          tl: { col: 8.8, row: 1 } as any,
          br: { col: 9.8, row: 4.8 } as any,
          editAs: 'oneCell',
        });
      }
    } catch {}
  }

  onProgress?.('Mengunduh file Excel...');

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Lembar_Hitung_Ulang_${payload.kode_produksi}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
