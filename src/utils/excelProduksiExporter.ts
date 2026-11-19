import ExcelJS from 'exceljs';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';
import {
  enrichBlocksWithRecountAudit,
  extractIsoDateFromSlot,
  formatDateIndo,
  formatRecountLogEntry,
  getLatestDateForMatrixBlock,
  sortMatrixBlocksNewestFirst,
} from '../services/gasProduksiSync';
import { getRecountAuditMap } from '../services/supabase';

const MONTH_NAMES_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function colToLetter(col: number): string {
  let temp = 0;
  let letter = '';
  let c = col;
  while (c > 0) {
    temp = (c - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    c = (c - temp - 1) / 26;
  }
  return letter;
}

function getDiffStyle(val: number): { fill: ExcelJS.Fill; fontColor: string } {
  if (val < 0) {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
      fontColor: 'FF991B1B',
    };
  }
  if (val > 0) {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
      fontColor: 'FF1E40AF',
    };
  }
  return {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
    fontColor: 'FF166534',
  };
}

// Helper to fetch image and convert to base64
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

// Get scaled image dimensions maintaining exact original aspect ratio (prevents gepeng)
async function getScaledImageDimensions(
  url: string,
  maxColWidthPx: number,
  maxRowHeightPx: number
): Promise<{ base64: string; extension: 'jpeg' | 'png' | 'gif'; width: number; height: number } | null> {
  const imgData = await fetchImageBuffer(url);
  if (!imgData) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth || img.width || 100;
      const origH = img.naturalHeight || img.height || 100;
      const aspect = origW / origH;

      let w = maxColWidthPx;
      let h = w / aspect;

      if (h > maxRowHeightPx) {
        h = maxRowHeightPx;
        w = h * aspect;
      }

      resolve({
        base64: imgData.base64,
        extension: imgData.extension,
        width: Math.max(30, Math.round(w)),
        height: Math.max(30, Math.round(h)),
      });
    };
    img.onerror = () => {
      resolve({
        base64: imgData.base64,
        extension: imgData.extension,
        width: Math.round(maxColWidthPx * 0.85),
        height: Math.round(maxRowHeightPx * 0.85),
      });
    };
    img.src = `data:image/${imgData.extension};base64,${imgData.base64}`;
  });
}

// Format date to "DD MMM" (+ optional SJ subtitle on second line)
function formatDateHeader(dateStr: string): string {
  if (!dateStr) return '';
  let rawDate = String(dateStr).trim();
  let sjSubtitle = '';
  if (rawDate.includes('||')) {
    const parts = rawDate.split('||');
    rawDate = (parts[0] || '').trim();
    sjSubtitle = (parts[1] || '').replace(/^KARGOCHN\s*/i, '').replace(/^SJ-?/i, '').trim();
  }

  let dateLabel = rawDate;
  if (rawDate.length >= 10 && rawDate[4] === '-' && rawDate[7] === '-') {
    const m = parseInt(rawDate.slice(5, 7), 10);
    const d = parseInt(rawDate.slice(8, 10), 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      dateLabel = `${d} ${MONTH_NAMES_ID[m - 1]}`;
    }
  } else {
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        dateLabel = `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]}`;
      }
    } catch {}
  }

  return sjSubtitle ? `${dateLabel}\n(${sjSubtitle})` : dateLabel;
}

export async function buildProduksiModernExcelBuffer(
  productBlocks: MatrixProductBlock[],
  activeTab: 'CMT' | 'Kargo' = 'CMT',
  onProgress?: (msg: string) => void
): Promise<ArrayBuffer> {
  if (!productBlocks || productBlocks.length === 0) {
    throw new Error('Tidak ada data kedatangan produksi untuk diekspor.');
  }

  onProgress?.(`Menyiapkan template Excel modern untuk ${activeTab}...`);

  // Selalu perkaya dengan hasil Hitung Ulang terbaru & urutkan Terbaru -> Terlama
  const auditMap = getRecountAuditMap();
  const preparedBlocks = sortMatrixBlocksNewestFirst(
    enrichBlocksWithRecountAudit(productBlocks, auditMap)
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WMS Produksi System';
  workbook.lastModifiedBy = 'WMS Produksi System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const isCMT = activeTab === 'CMT';
  const worksheet = workbook.addWorksheet(`Master Produksi (${activeTab})`, {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Styling Constants
  const PINK_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFCE8E6' },
  };

  const RETUR_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFE4E6' },
  };

  const NOTA_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' },
  };

  const TOTAL_HITUNG_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCFCE7' },
  };

  const SELISIH_NOTA_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0F2FE' },
  };

  const FISIK_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' },
  };

  const STATUS_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  const YELLOW_CELL_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF2CC' },
  };

  const RED_CELL_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEBEB' },
  };

  const BORDER_THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  const FONT_HEADER: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 9.5,
    bold: true,
    color: { argb: 'FF0F172A' },
  };

  const FONT_SUBHEADER: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 8.5,
    bold: true,
    color: { argb: 'FF334155' },
  };

  const FONT_BODY: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 9.5,
    color: { argb: 'FF1E293B' },
  };

  let currentRow = 1;

  interface RekapRecountRow {
    code: string;
    productName: string;
    latestDate: string;
    color: string;
    size: string;
    totalAwal: number;
    qtyNota: number | null;
    qtyFisik: number;
    selisih: number;
    status: string;
    round: number;
    auditDate: string;
    auditor: string;
    notes: string;
  }

  const rekapRows: RekapRecountRow[] = [];
  let countedBlocksCount = 0;

  for (let bIndex = 0; bIndex < preparedBlocks.length; bIndex++) {
    const block = preparedBlocks[bIndex];
    onProgress?.(`Memproses Kode ${block.code} (${bIndex + 1}/${preparedBlocks.length})...`);

    const headerRow1Index = currentRow;
    const headerRow2Index = currentRow + 1;

    const row1 = worksheet.getRow(headerRow1Index);
    row1.height = 28;
    const row2 = worksheet.getRow(headerRow2Index);
    row2.height = 26;

    const rawDateSlots = block.dateSlots || [];
    const dateSlots = rawDateSlots.length >= 10
      ? rawDateSlots
      : [...rawDateSlots, ...Array(10 - rawDateSlots.length).fill('')];
    const rawReturSlots = isCMT ? block.returDateSlots || [] : [];
    const returSlots = isCMT
      ? (rawReturSlots.length >= 5 ? rawReturSlots : [...rawReturSlots, ...Array(5 - rawReturSlots.length).fill('')])
      : [];

    const numDateCols = dateSlots.length;
    const numReturCols = isCMT ? returSlots.length : 0;

    const startDatangCol = 8;
    const endDatangCol = startDatangCol + numDateCols - 1;
    let startReturCol = 0;
    let endReturCol = 0;
    if (isCMT && numReturCols > 0) {
      startReturCol = endDatangCol + 1;
      endReturCol = startReturCol + numReturCols - 1;
    }

    const colRowTotalDatang = 8 + numDateCols + numReturCols;
    const colTotalAwal = colRowTotalDatang + 1;
    const colQtyNota = colRowTotalDatang + 2;
    const colTotalHitung = colRowTotalDatang + 3;
    const colSelisihNota = colRowTotalDatang + 4;
    const colFisik = colRowTotalDatang + 5;
    const colSelisihFisik = colRowTotalDatang + 6;
    const colStatus = colRowTotalDatang + 7;
    const colLog = colRowTotalDatang + 8;
    const totalCols = colLog;

    // Set Column Widths
    worksheet.getColumn(1).width = 6;   // NO
    worksheet.getColumn(2).width = 14;  // CODE
    worksheet.getColumn(3).width = 22;  // PRODUCT NAME
    worksheet.getColumn(4).width = 12;  // UP / Vendor
    worksheet.getColumn(5).width = 50;  // PHOTO
    worksheet.getColumn(6).width = 16;  // COLOR
    worksheet.getColumn(7).width = 11;  // SIZE

    for (let c = 8; c < colRowTotalDatang; c++) {
      worksheet.getColumn(c).width = 11;
    }
    worksheet.getColumn(colRowTotalDatang).width = 13;
    worksheet.getColumn(colTotalAwal).width = 14;
    worksheet.getColumn(colQtyNota).width = 12;
    worksheet.getColumn(colTotalHitung).width = 15;
    worksheet.getColumn(colSelisihNota).width = 13;
    worksheet.getColumn(colFisik).width = 14;
    worksheet.getColumn(colSelisihFisik).width = 13;
    worksheet.getColumn(colStatus).width = 13;
    worksheet.getColumn(colLog).width = 34;

    // Build Row 1 Headers
    const row1Vals: string[] = ['NO', 'CODE', 'PRODUCT NAME', 'UP', 'PHOTO', 'COLOR', 'SIZE'];
    row1Vals.push('QTY BARANG DATANG');
    for (let i = 1; i < numDateCols; i++) row1Vals.push('');

    if (isCMT && numReturCols > 0) {
      row1Vals.push('QTY BARANG RETUR');
      for (let i = 1; i < numReturCols; i++) row1Vals.push('');
    }

    row1Vals.push(
      'TOTAL DATANG',
      isCMT ? 'TOTAL AWAL (NET)' : 'TOTAL AWAL DITERIMA',
      'QTY NOTA',
      'TOTAL HITUNG ULANG',
      'SELISIH NOTA',
      'QTY HITUNG ULANG',
      'SELISIH FISIK',
      'STATUS AUDIT',
      'LOG HITUNG ULANG'
    );
    row1.values = row1Vals;

    // Build Row 2 Subheaders
    const row2Vals: string[] = ['', '', '', '', '', '', ''];
    dateSlots.forEach((d) => row2Vals.push(d ? formatDateHeader(d) : '-'));
    if (isCMT && numReturCols > 0) {
      returSlots.forEach((d) => row2Vals.push(d ? formatDateHeader(d) : '-'));
    }
    for (let c = colRowTotalDatang; c <= colLog; c++) {
      row2Vals.push('');
    }
    row2.values = row2Vals;

    // Merges for Header
    for (let c = 1; c <= 7; c++) {
      worksheet.mergeCells(headerRow1Index, c, headerRow2Index, c);
    }
    worksheet.mergeCells(headerRow1Index, startDatangCol, headerRow1Index, endDatangCol);
    if (isCMT && numReturCols > 0) {
      worksheet.mergeCells(headerRow1Index, startReturCol, headerRow1Index, endReturCol);
    }
    for (let c = colRowTotalDatang; c <= colLog; c++) {
      worksheet.mergeCells(headerRow1Index, c, headerRow2Index, c);
    }

    // Style Header Cells
    for (let c = 1; c <= totalCols; c++) {
      const cell1 = row1.getCell(c);
      const cell2 = row2.getCell(c);
      let hdrFill = PINK_HEADER_FILL;
      let fontColor = 'FF0F172A';

      if (isCMT && c >= startReturCol && c <= endReturCol) {
        hdrFill = RETUR_HEADER_FILL;
      } else if (c === colQtyNota) {
        hdrFill = NOTA_HEADER_FILL;
        fontColor = 'FF92400E';
      } else if (c === colTotalHitung) {
        hdrFill = TOTAL_HITUNG_HEADER_FILL;
        fontColor = 'FF166534';
      } else if (c === colSelisihNota) {
        hdrFill = SELISIH_NOTA_HEADER_FILL;
        fontColor = 'FF075985';
      } else if (c === colFisik) {
        hdrFill = FISIK_HEADER_FILL;
        fontColor = 'FF1E3A8A';
      } else if (c === colSelisihFisik) {
        hdrFill = NOTA_HEADER_FILL;
        fontColor = 'FF92400E';
      } else if (c === colStatus) {
        hdrFill = STATUS_HEADER_FILL;
      }

      cell1.fill = hdrFill;
      cell1.font = { ...FONT_HEADER, color: { argb: fontColor } };
      cell1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell1.border = BORDER_THIN;

      cell2.fill = hdrFill;
      cell2.font = { ...FONT_SUBHEADER, color: { argb: fontColor } };
      cell2.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell2.border = BORDER_THIN;
    }

    currentRow += 2;

    // --- DATA ROWS ---
    const totalSubRows = block.colorGroups.reduce(
      (acc, c) => acc + Math.max(1, c.sizes.length),
      0
    );

    const startDataRowIndex = currentRow;
    const targetBlockHeight = Math.max(320, totalSubRows * 32);
    const rowHeightAllocated = Math.max(32, Math.floor(targetBlockHeight / Math.max(1, totalSubRows)));

    const blockLatestDate = getLatestDateForMatrixBlock(block);
    const blockArrivalDates = Array.from(
      new Set(dateSlots.map((d) => extractIsoDateFromSlot(d)).filter(Boolean))
    );
    const resolvedNota =
      block.qtyNota !== undefined && block.qtyNota !== null && !isNaN(Number(block.qtyNota))
        ? Number(block.qtyNota)
        : null;
    const netTotal =
      Number(block.totalNet) || Math.max(0, (Number(block.totalDatang) || 0) - (Number(block.totalRetur) || 0));

    let blockHasRecount = false;
    let blockRecountSum = 0;

    const startDateLetter = colToLetter(startDatangCol);
    const endDateLetter = colToLetter(endDatangCol);
    const startRetLetter = isCMT && numReturCols > 0 ? colToLetter(startReturCol) : '';
    const endRetLetter = isCMT && numReturCols > 0 ? colToLetter(endReturCol) : '';
    const rowTotalLetter = colToLetter(colRowTotalDatang);
    const totalAwalLetter = colToLetter(colTotalAwal);
    const notaLetter = colToLetter(colQtyNota);
    const totalHitungLetter = colToLetter(colTotalHitung);
    const fisikLetter = colToLetter(colFisik);
    const selisihFisikLetter = colToLetter(colSelisihFisik);

    for (let cIdx = 0; cIdx < block.colorGroups.length; cIdx++) {
      const colorGroup = block.colorGroups[cIdx];
      const startColorRowIndex = currentRow;

      for (let sIdx = 0; sIdx < colorGroup.sizes.length; sIdx++) {
        const sizeItem = colorGroup.sizes[sIdx] as any;
        const dataRow = worksheet.getRow(currentRow);

        const rowValues: any[] = [
          block.rowNumber,
          block.code,
          block.productName || '',
          block.upVendor || '',
          '', // Photo placeholder
          colorGroup.color,
          sizeItem.size,
        ];

        // Datang Date Qty
        let rowDatang = 0;
        dateSlots.forEach((dStr) => {
          let qVal: number | '' = '';
          if (dStr && sizeItem.qtyByDate) {
            if (sizeItem.qtyByDate[dStr] !== undefined && sizeItem.qtyByDate[dStr] !== null && sizeItem.qtyByDate[dStr] !== '') {
              qVal = Number(sizeItem.qtyByDate[dStr]);
            } else if (dStr.includes('||')) {
              const dateOnly = extractIsoDateFromSlot(dStr);
              const singleSlotForDate =
                dateSlots.filter((other) => other && extractIsoDateFromSlot(other) === dateOnly).length === 1;
              if (
                singleSlotForDate &&
                sizeItem.qtyByDate[dateOnly] !== undefined &&
                sizeItem.qtyByDate[dateOnly] !== ''
              ) {
                qVal = Number(sizeItem.qtyByDate[dateOnly]);
              }
            }
          }
          if (typeof qVal === 'number' && !isNaN(qVal)) {
            rowDatang += qVal;
            rowValues.push(qVal);
          } else {
            rowValues.push('');
          }
        });

        // Retur Date Qty (if CMT)
        let rowRetur = 0;
        if (isCMT && numReturCols > 0) {
          returSlots.forEach((dStr) => {
            if (dStr && sizeItem.qtyReturByDate && sizeItem.qtyReturByDate[dStr]) {
              const rq = Number(sizeItem.qtyReturByDate[dStr]) || 0;
              rowRetur += rq;
              rowValues.push(rq);
            } else {
              rowValues.push('');
            }
          });
        }

        const rowNet = isCMT
          ? Math.max(0, rowDatang - rowRetur)
          : Number(sizeItem.totalSizeQty) || rowDatang;

        const hasFisik =
          (sizeItem.recountFisik !== undefined && sizeItem.recountFisik !== null && sizeItem.recountFisik !== '') ||
          (sizeItem.recountQty !== undefined && sizeItem.recountQty !== null && sizeItem.recountQty !== '');
        const rawFisik =
          sizeItem.recountFisik !== undefined && sizeItem.recountFisik !== null && sizeItem.recountFisik !== ''
            ? sizeItem.recountFisik
            : sizeItem.recountQty;
        const rFisik: number | null = hasFisik && !isNaN(Number(rawFisik)) ? Number(rawFisik) : null;
        const rSelisih: number | null = rFisik !== null ? rFisik - rowNet : null;
        const rStatus =
          rSelisih === null ? '' : rSelisih === 0 ? 'MATCH' : rSelisih < 0 ? 'KURANG' : 'LEBIH';
        const rLog =
          rFisik !== null
            ? sizeItem.recountLog ||
              formatRecountLogEntry({
                round: sizeItem.recountRound,
                updatedAt: sizeItem.recountUpdatedAt,
                arrivalDates: blockArrivalDates,
                auditor: sizeItem.recountAuditor,
                notes: sizeItem.recountNotes,
              })
            : '';

        if (rFisik !== null) {
          blockHasRecount = true;
          blockRecountSum += rFisik;
          rekapRows.push({
            code: block.code,
            productName: block.productName || '',
            latestDate: blockLatestDate || '-',
            color: colorGroup.color,
            size: sizeItem.size,
            totalAwal: rowNet,
            qtyNota: resolvedNota,
            qtyFisik: rFisik,
            selisih: rSelisih!,
            status: rStatus,
            round: Number(sizeItem.recountRound || 1),
            auditDate: sizeItem.recountUpdatedAt ? extractIsoDateFromSlot(sizeItem.recountUpdatedAt) : '-',
            auditor: sizeItem.recountAuditor || 'Auditor Fisik',
            notes: sizeItem.recountNotes || '',
          });
        }

        rowValues.push(
          rowNet, // colRowTotalDatang (replaced by formula below)
          netTotal, // colTotalAwal (replaced by formula below)
          resolvedNota !== null ? resolvedNota : '', // colQtyNota
          blockHasRecount ? blockRecountSum : '', // colTotalHitung (replaced by formula below)
          '', // colSelisihNota (replaced by formula below)
          rFisik !== null ? rFisik : '', // colFisik
          '', // colSelisihFisik (formula below)
          '', // colStatus (formula below)
          rLog // colLog
        );

        dataRow.values = rowValues;

        const logLines = Math.max(1, Math.ceil(String(rLog || '').length / 32));
        dataRow.height = Math.max(rowHeightAllocated, logLines * 14 + 8);

        // Install Excel formulas with cached results (NO leading '=')
        const rowFormulaTotal =
          isCMT && numReturCols > 0
            ? `SUM(${startDateLetter}${currentRow}:${endDateLetter}${currentRow})-SUM(${startRetLetter}${currentRow}:${endRetLetter}${currentRow})`
            : `SUM(${startDateLetter}${currentRow}:${endDateLetter}${currentRow})`;
        dataRow.getCell(colRowTotalDatang).value = { formula: rowFormulaTotal, result: rowNet };

        dataRow.getCell(colSelisihFisik).value = {
          formula: `IF(${fisikLetter}${currentRow}<>"",${fisikLetter}${currentRow}-${rowTotalLetter}${currentRow},"")`,
          result: rSelisih !== null ? rSelisih : '',
        };
        dataRow.getCell(colStatus).value = {
          formula: `IF(${selisihFisikLetter}${currentRow}<>"",IF(${selisihFisikLetter}${currentRow}=0,"MATCH",IF(${selisihFisikLetter}${currentRow}<0,"KURANG","LEBIH")),"")`,
          result: rStatus,
        };

        // Styling data cells
        for (let col = 1; col <= totalCols; col++) {
          const cell = dataRow.getCell(col);
          cell.font = FONT_BODY;
          cell.border = BORDER_THIN;
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

          if (col <= 7 || col === colStatus || col === colLog) {
            cell.numFmt = '@';
          } else {
            cell.numFmt = '#,##0';
          }

          if (col >= startDatangCol && col <= endDatangCol) {
            if (typeof cell.value === 'number' && cell.value > 0) {
              cell.fill = YELLOW_CELL_FILL;
              cell.font = { ...FONT_BODY, bold: true };
            }
          }

          if (isCMT && numReturCols > 0 && col >= startReturCol && col <= endReturCol) {
            if (typeof cell.value === 'number' && cell.value > 0) {
              cell.fill = RED_CELL_FILL;
              cell.font = { ...FONT_BODY, bold: true, color: { argb: 'FFDC2626' } };
            }
          }

          if (col === 7) {
            cell.font = { ...FONT_BODY, bold: true };
          }
          if (col === colRowTotalDatang) {
            cell.font = { ...FONT_BODY, bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
          if (col === colFisik) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
            if (rFisik !== null) {
              cell.font = { ...FONT_BODY, bold: true, color: { argb: 'FF1D4ED8' } };
            }
          }
          if (col === colSelisihFisik && rSelisih !== null) {
            const st = getDiffStyle(rSelisih);
            cell.fill = st.fill;
            cell.font = { ...FONT_BODY, bold: true, color: { argb: st.fontColor } };
          }
          if (col === colStatus && rSelisih !== null) {
            const st = getDiffStyle(rSelisih);
            cell.fill = st.fill;
            cell.font = { ...FONT_BODY, bold: true, size: 8.5, color: { argb: st.fontColor } };
          }
          if (col === colLog) {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.font = { ...FONT_BODY, size: 8.5, color: { argb: 'FF334155' } };
          }
        }

        currentRow++;
      }

      // Merge Color Column
      const endColorRowIndex = currentRow - 1;
      if (endColorRowIndex > startColorRowIndex) {
        worksheet.mergeCells(startColorRowIndex, 6, endColorRowIndex, 6);
      }
      const colorCell = worksheet.getRow(startColorRowIndex).getCell(6);
      colorCell.alignment = { vertical: 'middle', horizontal: 'center' };
      colorCell.font = { ...FONT_BODY, bold: true };
    }

    const endDataRowIndex = currentRow - 1;
    if (blockHasRecount) countedBlocksCount++;

    // Merge Main Info Columns & Block Summary Columns
    if (endDataRowIndex >= startDataRowIndex) {
      if (endDataRowIndex > startDataRowIndex) {
        worksheet.mergeCells(startDataRowIndex, 1, endDataRowIndex, 1);
        worksheet.mergeCells(startDataRowIndex, 2, endDataRowIndex, 2);
        worksheet.mergeCells(startDataRowIndex, 3, endDataRowIndex, 3);
        worksheet.mergeCells(startDataRowIndex, 4, endDataRowIndex, 4);
        worksheet.mergeCells(startDataRowIndex, 5, endDataRowIndex, 5);
        worksheet.mergeCells(startDataRowIndex, colTotalAwal, endDataRowIndex, colTotalAwal);
        worksheet.mergeCells(startDataRowIndex, colQtyNota, endDataRowIndex, colQtyNota);
        worksheet.mergeCells(startDataRowIndex, colTotalHitung, endDataRowIndex, colTotalHitung);
        worksheet.mergeCells(startDataRowIndex, colSelisihNota, endDataRowIndex, colSelisihNota);
      }

      const firstRow = worksheet.getRow(startDataRowIndex);
      firstRow.getCell(1).font = { ...FONT_BODY, bold: true };
      firstRow.getCell(2).font = { ...FONT_BODY, bold: true };
      firstRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      // TOTAL AWAL (NET)
      const totalAwalCell = firstRow.getCell(colTotalAwal);
      totalAwalCell.value = {
        formula: `SUM(${rowTotalLetter}${startDataRowIndex}:${rowTotalLetter}${endDataRowIndex})`,
        result: netTotal,
      };
      totalAwalCell.font = { ...FONT_BODY, bold: true, size: 11 };
      totalAwalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      totalAwalCell.numFmt = '#,##0';

      // QTY NOTA
      const qtyNotaCell = firstRow.getCell(colQtyNota);
      qtyNotaCell.value = resolvedNota !== null ? resolvedNota : '';
      qtyNotaCell.font = { ...FONT_BODY, bold: true, size: 11, color: { argb: 'FF92400E' } };
      qtyNotaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      qtyNotaCell.numFmt = '#,##0';

      // TOTAL HITUNG ULANG
      const totalHitungCell = firstRow.getCell(colTotalHitung);
      const fisikColRange = `${fisikLetter}${startDataRowIndex}:${fisikLetter}${endDataRowIndex}`;
      totalHitungCell.value = {
        formula: `IF(COUNT(${fisikColRange})>0,SUM(${fisikColRange}),"")`,
        result: blockHasRecount ? blockRecountSum : '',
      };
      totalHitungCell.font = { ...FONT_BODY, bold: true, size: 11, color: { argb: 'FF166534' } };
      totalHitungCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      totalHitungCell.numFmt = '#,##0';

      // SELISIH NOTA (4-Kondisi sama persis dengan UI & Google Sheet)
      const totAwalRef = `${totalAwalLetter}${startDataRowIndex}`;
      const notaRef = `${notaLetter}${startDataRowIndex}`;
      const totHitungRef = `${totalHitungLetter}${startDataRowIndex}`;
      let selNotaResult: number | '' = '';
      if (resolvedNota !== null) {
        selNotaResult = (blockHasRecount ? blockRecountSum : netTotal) - resolvedNota;
      } else if (blockHasRecount) {
        selNotaResult = blockRecountSum - netTotal;
      }
      const selisihNotaCell = firstRow.getCell(colSelisihNota);
      selisihNotaCell.value = {
        formula: `IF(${totHitungRef}<>"",${totHitungRef}-IF(${notaRef}<>"",${notaRef},${totAwalRef}),IF(${notaRef}<>"",${totAwalRef}-${notaRef},""))`,
        result: selNotaResult,
      };
      selisihNotaCell.numFmt = '#,##0';
      if (typeof selNotaResult === 'number') {
        const st = getDiffStyle(selNotaResult);
        selisihNotaCell.fill = st.fill;
        selisihNotaCell.font = { ...FONT_BODY, bold: true, size: 11, color: { argb: st.fontColor } };
      } else {
        selisihNotaCell.font = { ...FONT_BODY, bold: true, size: 11 };
      }

      // PHOTO
      const photoCell = firstRow.getCell(5);
      photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (block.photoUrl) {
        try {
          const maxW = 250;
          const maxH = Math.max(200, totalSubRows * rowHeightAllocated - 12);
          const scaledImg = await getScaledImageDimensions(block.photoUrl, maxW, maxH);

          if (scaledImg) {
            const imageId = workbook.addImage({
              base64: scaledImg.base64,
              extension: scaledImg.extension,
            });

            const colEWidthPx = 270;
            const leftColOffset = Math.max(0.02, (colEWidthPx - scaledImg.width) / colEWidthPx / 2);

            worksheet.addImage(imageId, {
              tl: { col: 4 + leftColOffset, row: startDataRowIndex - 1 + 0.05 } as any,
              ext: { width: scaledImg.width, height: scaledImg.height },
              editAs: 'oneCell',
            });
          } else {
            photoCell.value = {
              text: 'Lihat Foto ↗',
              hyperlink: block.photoUrl,
              tooltip: 'Buka Foto Produk di Browser',
            };
            photoCell.font = { color: { argb: 'FF2563EB' }, underline: true, size: 8.5 };
          }
        } catch (e) {
          console.warn('Could not embed image in excel:', e);
        }
      }
    }

    // Optional CATATAN footer row matching Google Sheet
    const blockCatatan = String(block.catatan || '').trim();
    if (blockCatatan) {
      const noteRow = worksheet.getRow(currentRow);
      noteRow.height = 20;
      const noteVals = [`CATATAN: ${blockCatatan}`];
      noteRow.values = noteVals;
      worksheet.mergeCells(currentRow, 1, currentRow, totalCols);
      for (let c = 1; c <= totalCols; c++) {
        const cell = noteRow.getCell(c);
        cell.fill = NOTA_HEADER_FILL;
        cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF92400E' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFFDE68A' } },
          left: { style: 'thin', color: { argb: 'FFFDE68A' } },
          bottom: { style: 'thin', color: { argb: 'FFFDE68A' } },
          right: { style: 'thin', color: { argb: 'FFFDE68A' } },
        };
      }
      currentRow++;
    }

    currentRow += 2;
  }

  // --- SHEET 2: REKAP HITUNG ULANG ---
  const rekapSheet = workbook.addWorksheet('Rekap Hitung Ulang', {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  rekapSheet.mergeCells('A1', 'O1');
  const titleCell = rekapSheet.getCell('A1');
  titleCell.value = `REKAP HASIL AUDIT & HITUNG ULANG FISIK (${activeTab})`;
  titleCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  rekapSheet.getRow(1).height = 30;

  const totalAwalAll = rekapRows.reduce((acc, r) => acc + r.totalAwal, 0);
  const totalFisikAll = rekapRows.reduce((acc, r) => acc + r.qtyFisik, 0);
  const totalSelisihAll = totalFisikAll - totalAwalAll;

  rekapSheet.mergeCells('A2', 'O2');
  const subCell = rekapSheet.getCell('A2');
  subCell.value = `Tanggal Export: ${formatDateIndo(new Date().toISOString())}  |  Model Terexport: ${preparedBlocks.length} Kode  |  Sudah Hitung Ulang: ${countedBlocksCount} Kode (${rekapRows.length} Varian)  |  Total Awal: ${totalAwalAll} pcs  |  Total Fisik: ${totalFisikAll} pcs`;
  subCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFE2E8F0' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  rekapSheet.getRow(2).height = 22;

  const rekapColWidths = [6, 16, 24, 13, 15, 10, 13, 15, 16, 14, 14, 7, 13, 18, 34];
  rekapColWidths.forEach((w, idx) => {
    rekapSheet.getColumn(idx + 1).width = w;
  });

  const rekapHeaderRow = rekapSheet.getRow(4);
  rekapHeaderRow.height = 26;
  rekapHeaderRow.values = [
    'NO',
    'KODE PRODUKSI',
    'NAMA PRODUK',
    'TGL TERBARU',
    'COLOR',
    'SIZE',
    'TOTAL AWAL',
    'QTY NOTA (BLOK)',
    'QTY HITUNG ULANG',
    'SELISIH FISIK',
    'STATUS AUDIT',
    'REV',
    'TGL AUDIT',
    'AUDITOR',
    'CATATAN AUDIT',
  ];

  for (let c = 1; c <= 15; c++) {
    const cell = rekapHeaderRow.getCell(c);
    cell.fill = PINK_HEADER_FILL;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_THIN;
  }

  let rRowIdx = 5;
  if (rekapRows.length === 0) {
    rekapSheet.mergeCells(5, 1, 5, 15);
    const emptyCell = rekapSheet.getCell(5, 1);
    emptyCell.value = 'Belum ada data hasil Hitung Ulang pada kode produk / filter tanggal yang dipilih.';
    emptyCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
    rekapSheet.getRow(5).height = 30;
  } else {
    rekapRows.forEach((r, idx) => {
      const row = rekapSheet.getRow(rRowIdx);
      row.height = 22;
      row.values = [
        idx + 1,
        r.code,
        r.productName,
        r.latestDate,
        r.color,
        r.size,
        r.totalAwal,
        r.qtyNota !== null ? r.qtyNota : '-',
        r.qtyFisik,
        r.selisih,
        r.status,
        `Rev ${r.round}`,
        r.auditDate,
        r.auditor,
        r.notes,
      ];

      for (let c = 1; c <= 15; c++) {
        const cell = row.getCell(c);
        cell.font = FONT_BODY;
        cell.border = BORDER_THIN;
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === 3 || c === 15 ? 'left' : 'center',
          wrapText: true,
        };
        if (c === 7 || c === 9 || c === 10 || (c === 8 && r.qtyNota !== null)) {
          cell.numFmt = '#,##0';
        }
        if (c === 2 || c === 5 || c === 6) {
          cell.font = { ...FONT_BODY, bold: true };
        }
        if (c === 9) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
          cell.font = { ...FONT_BODY, bold: true, color: { argb: 'FF1D4ED8' } };
        }
        if (c === 10 || c === 11) {
          const st = getDiffStyle(r.selisih);
          cell.fill = st.fill;
          cell.font = { ...FONT_BODY, bold: true, color: { argb: st.fontColor } };
        }
      }
      rRowIdx++;
    });

    const summaryRow = rekapSheet.getRow(rRowIdx);
    summaryRow.height = 26;
    rekapSheet.mergeCells(rRowIdx, 1, rRowIdx, 6);
    summaryRow.getCell(1).value = 'TOTAL KESELURUHAN:';
    summaryRow.getCell(7).value = { formula: `SUM(G5:G${rRowIdx - 1})`, result: totalAwalAll };
    summaryRow.getCell(8).value = '-';
    summaryRow.getCell(9).value = { formula: `SUM(I5:I${rRowIdx - 1})`, result: totalFisikAll };
    summaryRow.getCell(10).value = { formula: `SUM(J5:J${rRowIdx - 1})`, result: totalSelisihAll };
    summaryRow.getCell(11).value = totalSelisihAll === 0 ? 'MATCH' : totalSelisihAll < 0 ? 'KURANG' : 'LEBIH';

    for (let c = 1; c <= 15; c++) {
      const cell = summaryRow.getCell(c);
      cell.fill = STATUS_HEADER_FILL;
      cell.border = BORDER_THIN;
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'right' : 'center' };
      if (c === 7 || c === 9 || c === 10) cell.numFmt = '#,##0';
      if (c === 9) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
      if (c === 10 || c === 11) {
        const st = getDiffStyle(totalSelisihAll);
        cell.fill = st.fill;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: st.fontColor } };
      }
    }
  }

  onProgress?.('Mengompilasi file Excel (.xlsx)...');
  return workbook.xlsx.writeBuffer();
}

export async function exportProduksiToModernExcel(
  productBlocks: MatrixProductBlock[],
  activeTab: 'CMT' | 'Kargo' = 'CMT',
  onProgress?: (msg: string) => void
): Promise<void> {
  const buffer = await buildProduksiModernExcelBuffer(productBlocks, activeTab, onProgress);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Master_Produksi_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
