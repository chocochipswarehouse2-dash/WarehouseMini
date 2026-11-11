/**
 * =============================================================================
 * WMS AI REPORT EXPORTER — PDF & EXCEL (.XLSX) GENERATOR
 * =============================================================================
 * Mengonversi laporan tabel dari Asisten AI WMS (baik dari Function Tool
 * `generate_exportable_report` maupun tabel Markdown di chat) menjadi file
 * Excel (.xlsx) dan PDF siap unduh / cetak.
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AiReportTableData {
  title: string;
  subtitle?: string;
  filename?: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: string;
  preferredFormat?: 'excel' | 'pdf' | 'both';
}

/**
 * Membersihkan simbol markdown (**bold**, `code`, dll.) agar tampilan sel di Excel & PDF bersih
 */
export function cleanMarkdownCellText(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim();
}

function buildSafeFilename(rawName?: string, fallbackTitle?: string): string {
  const base = (rawName || fallbackTitle || 'Laporan_WMS_AI')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${base || 'Laporan_WMS_AI'}_${datePart}`;
}

/**
 * Mengekstrak semua tabel Markdown dari teks balasan AI agar setiap tabel di chat
 * juga bisa langsung diunduh ke Excel / PDF dengan 1 klik.
 */
export function extractMarkdownTablesFromText(
  content: string,
  defaultTitle = 'Laporan Data WMS AI'
): AiReportTableData[] {
  if (!content) return [];
  const lines = content.split('\n');
  const tables: AiReportTableData[] = [];
  let buffer: string[] = [];
  let lastHeading = defaultTitle;

  const flush = () => {
    if (buffer.length < 2) {
      buffer = [];
      return;
    }
    const tLines = [...buffer];
    buffer = [];

    const parseRow = (line: string): string[] =>
      line
        .split('|')
        .map((c) => cleanMarkdownCellText(c))
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    const headers = parseRow(tLines[0]);
    if (headers.length === 0) return;

    // Skip baris separator |---|---|
    const dataStartIdx = tLines[1] && /^[\s|\-:]+$/.test(tLines[1]) ? 2 : 1;
    const rows = tLines
      .slice(dataStartIdx)
      .filter((l) => !/^[\s|\-:]+$/.test(l))
      .map((l) => parseRow(l))
      .filter((r) => r.length > 0 && r.some((cell) => cell !== ''));

    if (rows.length > 0) {
      tables.push({
        title: cleanMarkdownCellText(lastHeading) || defaultTitle,
        headers,
        rows,
        preferredFormat: 'both',
      });
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      if (buffer.length > 0) flush();
      lastHeading = trimmed.replace(/^#+\s+/, '').trim();
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      buffer.push(trimmed);
    } else if (buffer.length > 0) {
      flush();
    }
  }
  if (buffer.length > 0) flush();

  return tables;
}

/**
 * Mengunduh data tabel AI ke dalam format Microsoft Excel (.xlsx)
 */
export function exportAiTableToExcel(table: AiReportTableData): void {
  const cleanTitle = cleanMarkdownCellText(table.title || 'Laporan Data WMS AI');
  const cleanHeaders = (table.headers || []).map((h) => cleanMarkdownCellText(h));
  const cleanRows = (table.rows || []).map((row) =>
    row.map((cell) => {
      const cleaned = cleanMarkdownCellText(cell);
      // Jika angka murni (dan bukan kode diawali 0 seperti '0123' atau nomor panjang > 10 digit), konversi ke Number agar bisa di-SUM di Excel
      if (/^-?\d+(\.\d+)?$/.test(cleaned) && !(cleaned.startsWith('0') && cleaned.length > 1) && cleaned.length <= 9) {
        const num = Number(cleaned);
        if (!Number.isNaN(num)) return num;
      }
      return cleaned;
    })
  );

  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const sheetAoA: (string | number)[][] = [
    [cleanTitle.toUpperCase()],
    [table.subtitle ? cleanMarkdownCellText(table.subtitle) : `Dicetak dari Asisten AI WMS Chocochips • ${nowStr}`],
  ];

  if (table.summary) {
    sheetAoA.push([`Ringkasan: ${cleanMarkdownCellText(table.summary)}`]);
  }

  sheetAoA.push([]); // Baris kosong pemisah
  sheetAoA.push(cleanHeaders);
  cleanRows.forEach((r) => sheetAoA.push(r));

  const ws = XLSX.utils.aoa_to_sheet(sheetAoA);

  // Hitung lebar kolom otomatis agar rapi saat dibuka di Excel
  const colWidths = cleanHeaders.map((header, colIdx) => {
    let maxLen = String(header || '').length;
    cleanRows.forEach((row) => {
      const cellStr = String(row[colIdx] ?? '');
      if (cellStr.length > maxLen) maxLen = cellStr.length;
    });
    return { wch: Math.min(Math.max(maxLen + 4, 12), 52) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan WMS');

  const filename = `${buildSafeFilename(table.filename, cleanTitle)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Mengunduh data tabel AI ke dalam format Dokumen PDF (.pdf) siap cetak / kirim WA
 */
export function exportAiTableToPdf(table: AiReportTableData): void {
  const cleanTitle = cleanMarkdownCellText(table.title || 'Laporan Data WMS AI');
  const cleanHeaders = (table.headers || []).map((h) => cleanMarkdownCellText(h));
  const cleanRows = (table.rows || []).map((row) =>
    row.map((cell) => {
      // Hilangkan emoji yang tidak didukung font standar Helvetica PDF agar tidak menjadi karakter aneh
      return cleanMarkdownCellText(cell)
        .replace(/✅/g, '[READY] ')
        .replace(/❌/g, '[KOSONG] ')
        .replace(/⚠️/g, '[!] ')
        .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
        .trim();
    })
  );

  // Gunakan orientasi Landscape otomatis jika kolom >= 6 agar tabel leluasa
  const isLandscape = cleanHeaders.length >= 6;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // Header Banner
  doc.setFillColor(79, 70, 229); // Indigo-600
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(cleanTitle.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').trim() || 'LAPORAN DATA WMS', 14, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const subText = table.subtitle
    ? cleanMarkdownCellText(table.subtitle).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').trim()
    : `Chocochips Warehouse Management System (WMS) • Dicetak: ${nowStr}`;
  doc.text(subText, 14, 16.5);

  let startY = 28;

  if (table.summary) {
    const cleanSummary = cleanMarkdownCellText(table.summary)
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
      .trim();
    if (cleanSummary) {
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const splitSummary = doc.splitTextToSize(`Ringkasan: ${cleanSummary}`, pageWidth - 28);
      doc.text(splitSummary, 14, startY);
      startY += splitSummary.length * 4.5 + 3;
    }
  }

  autoTable(doc, {
    startY,
    head: [cleanHeaders.map((h) => h.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').trim())],
    body: cleanRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount} • Chocochips WMS AI Report`,
        14,
        doc.internal.pageSize.getHeight() - 8
      );
    },
  });

  const filename = `${buildSafeFilename(table.filename, cleanTitle)}.pdf`;
  doc.save(filename);
}
