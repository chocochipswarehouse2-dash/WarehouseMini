import ExcelJS from 'exceljs';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';

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
  } catch (e) {
    return null;
  }
}

// Format date to "DD MMM"
function formatDateHeader(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${day} ${monthNames[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

export async function exportProduksiToModernExcel(
  productBlocks: MatrixProductBlock[],
  activeTab: 'CMT' | 'Kargo' = 'CMT',
  onProgress?: (msg: string) => void
): Promise<void> {
  if (!productBlocks || productBlocks.length === 0) {
    throw new Error('Tidak ada data kedatangan produksi untuk diekspor.');
  }

  onProgress?.(`Menyiapkan template Excel modern untuk ${activeTab}...`);

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

  // Base Columns: A: NO, B: CODE, C: PRODUCT NAME, D: UP, E: PHOTO, F: COLOR, G: SIZE
  // Next: Date Arrival Columns (H..Q)
  // If CMT: Retur Date Columns (R..W) (6 columns)
  // Then: Total Datang, Spacer, Kesimpulan (PCS, KG, ONGKIR, TOTAL ONGKIR, ONGKIR/PCS)

  // Styling Constants
  const PINK_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFCE8E6' },
  };

  const RETUR_HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFE4E6' }, // Rose/Red tint for retur
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

  for (let bIndex = 0; bIndex < productBlocks.length; bIndex++) {
    const block = productBlocks[bIndex];
    onProgress?.(`Memproses Kode ${block.code} (${bIndex + 1}/${productBlocks.length})...`);

    const headerRow1Index = currentRow;
    const headerRow2Index = currentRow + 1;

    const row1 = worksheet.getRow(headerRow1Index);
    row1.height = 24;
    const row2 = worksheet.getRow(headerRow2Index);
    row2.height = 20;

    const dateSlots = block.dateSlots || [];
    const returSlots = isCMT ? block.returDateSlots || [] : [];

    const numDateCols = dateSlots.length; // 10
    const numReturCols = isCMT ? returSlots.length : 0; // 5 or 6

    const totalCols = 7 + numDateCols + (isCMT ? numReturCols : 0) + 1 + 1 + 5;

    // Build Row 1 Headers
    const row1Vals: string[] = ['NO', 'CODE', 'PRODUCT NAME', 'UP', 'PHOTO', 'COLOR', 'SIZE'];
    row1Vals.push('QTY BARANG DATANG');
    for (let i = 1; i < numDateCols; i++) row1Vals.push('');

    if (isCMT) {
      row1Vals.push('QTY BARANG RETUR');
      for (let i = 1; i < numReturCols; i++) row1Vals.push('');
    }

    row1Vals.push('TOTAL DATANG (NET)');
    row1Vals.push(''); // Spacer
    row1Vals.push('KESIMPULAN');
    for (let i = 1; i < 5; i++) row1Vals.push('');

    row1.values = row1Vals;

    // Build Row 2 Subheaders
    const row2Vals: string[] = ['', '', '', '', '', '', ''];
    dateSlots.forEach((d) => row2Vals.push(d ? formatDateHeader(d) : ''));
    if (isCMT) {
      returSlots.forEach((d) => row2Vals.push(d ? formatDateHeader(d) : ''));
    }
    row2Vals.push(''); // Total Datang span
    row2Vals.push(''); // Spacer
    row2Vals.push('PCS');
    row2Vals.push('KG');
    row2Vals.push('ONGKIR');
    row2Vals.push('TOTAL ONGKIR');
    row2Vals.push('ONGKIR/PCS');

    row2.values = row2Vals;

    // Merges for Header
    worksheet.mergeCells(headerRow1Index, 1, headerRow2Index, 1); // NO (A)
    worksheet.mergeCells(headerRow1Index, 2, headerRow2Index, 2); // CODE (B)
    worksheet.mergeCells(headerRow1Index, 3, headerRow2Index, 3); // PRODUCT NAME (C)
    worksheet.mergeCells(headerRow1Index, 4, headerRow2Index, 4); // UP (D)
    worksheet.mergeCells(headerRow1Index, 5, headerRow2Index, 5); // PHOTO (E)
    worksheet.mergeCells(headerRow1Index, 6, headerRow2Index, 6); // COLOR (F)
    worksheet.mergeCells(headerRow1Index, 7, headerRow2Index, 7); // SIZE (G)

    // Merge QTY DATANG
    const startDatangCol = 8;
    const endDatangCol = startDatangCol + numDateCols - 1;
    worksheet.mergeCells(headerRow1Index, startDatangCol, headerRow1Index, endDatangCol);

    let currentPointer = endDatangCol + 1;

    // Merge QTY RETUR (if CMT)
    let startReturCol = 0;
    let endReturCol = 0;
    if (isCMT && numReturCols > 0) {
      startReturCol = currentPointer;
      endReturCol = startReturCol + numReturCols - 1;
      worksheet.mergeCells(headerRow1Index, startReturCol, headerRow1Index, endReturCol);
      currentPointer = endReturCol + 1;
    }

    // Merge TOTAL DATANG
    const totalDatangCol = currentPointer;
    worksheet.mergeCells(headerRow1Index, totalDatangCol, headerRow2Index, totalDatangCol);
    currentPointer++;

    // Spacer
    const spacerCol = currentPointer;
    worksheet.mergeCells(headerRow1Index, spacerCol, headerRow2Index, spacerCol);
    currentPointer++;

    // Merge KESIMPULAN
    const startKesimpulanCol = currentPointer;
    const endKesimpulanCol = startKesimpulanCol + 4;
    worksheet.mergeCells(headerRow1Index, startKesimpulanCol, headerRow1Index, endKesimpulanCol);

    // Style Header Cells
    for (let c = 1; c <= totalCols; c++) {
      if (c === spacerCol) continue;
      const cell1 = row1.getCell(c);
      const isReturCell = isCMT && c >= startReturCol && c <= endReturCol;
      cell1.fill = isReturCell ? RETUR_HEADER_FILL : PINK_HEADER_FILL;
      cell1.font = FONT_HEADER;
      cell1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell1.border = BORDER_THIN;

      const cell2 = row2.getCell(c);
      cell2.fill = isReturCell ? RETUR_HEADER_FILL : PINK_HEADER_FILL;
      cell2.font = FONT_SUBHEADER;
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

    for (let cIdx = 0; cIdx < block.colorGroups.length; cIdx++) {
      const colorGroup = block.colorGroups[cIdx];
      const startColorRowIndex = currentRow;

      for (let sIdx = 0; sIdx < colorGroup.sizes.length; sIdx++) {
        const sizeItem = colorGroup.sizes[sIdx];
        const dataRow = worksheet.getRow(currentRow);
        dataRow.height = Math.max(24, Math.floor(110 / Math.max(1, totalSubRows)));

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
        dateSlots.forEach((dStr) => {
          if (dStr && sizeItem.qtyByDate && sizeItem.qtyByDate[dStr]) {
            rowValues.push(sizeItem.qtyByDate[dStr]);
          } else {
            rowValues.push('');
          }
        });

        // Retur Date Qty (if CMT)
        if (isCMT) {
          returSlots.forEach((dStr) => {
            if (dStr && sizeItem.qtyReturByDate && sizeItem.qtyReturByDate[dStr]) {
              rowValues.push(sizeItem.qtyReturByDate[dStr]);
            } else {
              rowValues.push('');
            }
          });
        }

        // Total Datang Net (Datang - Retur)
        const netTotal = Math.max(0, block.totalDatang - (block.totalRetur || 0));
        rowValues.push(netTotal);
        rowValues.push(''); // Spacer
        rowValues.push(netTotal); // PCS
        rowValues.push(block.kg); // KG
        rowValues.push(block.ongkirPerKg); // ONGKIR
        rowValues.push(block.totalOngkir); // TOTAL ONGKIR
        rowValues.push(block.ongkirPerPcs); // ONGKIR/PCS

        dataRow.values = rowValues;

        // Styling data cells
        for (let col = 1; col <= totalCols; col++) {
          if (col === spacerCol) continue;
          const cell = dataRow.getCell(col);
          cell.font = FONT_BODY;
          cell.border = BORDER_THIN;
          cell.alignment = { vertical: 'middle', horizontal: 'center' };

          // Highlight Qty Datang
          if (col >= startDatangCol && col <= endDatangCol) {
            const val = cell.value;
            if (val && typeof val === 'number') {
              cell.fill = YELLOW_CELL_FILL;
              cell.font = { ...FONT_BODY, bold: true };
            }
          }

          // Highlight Qty Retur (CMT)
          if (isCMT && col >= startReturCol && col <= endReturCol) {
            const val = cell.value;
            if (val && typeof val === 'number') {
              cell.fill = RED_CELL_FILL;
              cell.font = { ...FONT_BODY, bold: true, color: { argb: 'FFDC2626' } };
            }
          }

          if (col === 7) {
            cell.font = { ...FONT_BODY, bold: true };
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

    // Merge Main Info Columns
    if (endDataRowIndex >= startDataRowIndex) {
      // 1. NO
      worksheet.mergeCells(startDataRowIndex, 1, endDataRowIndex, 1);
      const noCell = worksheet.getRow(startDataRowIndex).getCell(1);
      noCell.alignment = { vertical: 'top', horizontal: 'center' };
      noCell.font = { ...FONT_BODY, bold: true };

      // 2. CODE
      worksheet.mergeCells(startDataRowIndex, 2, endDataRowIndex, 2);
      const codeCell = worksheet.getRow(startDataRowIndex).getCell(2);
      codeCell.alignment = { vertical: 'top', horizontal: 'center' };
      codeCell.font = { ...FONT_BODY, bold: true };

      // 3. PRODUCT NAME
      worksheet.mergeCells(startDataRowIndex, 3, endDataRowIndex, 3);

      // 4. UP
      worksheet.mergeCells(startDataRowIndex, 4, endDataRowIndex, 4);

      // 5. PHOTO
      worksheet.mergeCells(startDataRowIndex, 5, endDataRowIndex, 5);
      const photoCell = worksheet.getRow(startDataRowIndex).getCell(5);
      photoCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Total Datang Net
      worksheet.mergeCells(startDataRowIndex, totalDatangCol, endDataRowIndex, totalDatangCol);
      const totalDatangCell = worksheet.getRow(startDataRowIndex).getCell(totalDatangCol);
      totalDatangCell.alignment = { vertical: 'middle', horizontal: 'center' };
      totalDatangCell.font = { ...FONT_BODY, bold: true, size: 10.5 };
      totalDatangCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };

      // PCS
      worksheet.mergeCells(startDataRowIndex, startKesimpulanCol, endDataRowIndex, startKesimpulanCol);
      const pcsCell = worksheet.getRow(startDataRowIndex).getCell(startKesimpulanCol);
      pcsCell.alignment = { vertical: 'middle', horizontal: 'center' };
      pcsCell.font = { ...FONT_BODY, bold: true, color: { argb: 'FFDC2626' } };

      // KG
      worksheet.mergeCells(startDataRowIndex, startKesimpulanCol + 1, endDataRowIndex, startKesimpulanCol + 1);
      const kgCell = worksheet.getRow(startDataRowIndex).getCell(startKesimpulanCol + 1);
      kgCell.alignment = { vertical: 'middle', horizontal: 'center' };
      kgCell.font = { ...FONT_BODY, bold: true, color: { argb: 'FF2563EB' } };
      kgCell.numFmt = '0.0';

      // ONGKIR
      worksheet.mergeCells(startDataRowIndex, startKesimpulanCol + 2, endDataRowIndex, startKesimpulanCol + 2);
      const ongkirCell = worksheet.getRow(startDataRowIndex).getCell(startKesimpulanCol + 2);
      ongkirCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ongkirCell.numFmt = '#,##0';

      // TOTAL ONGKIR
      worksheet.mergeCells(startDataRowIndex, startKesimpulanCol + 3, endDataRowIndex, startKesimpulanCol + 3);
      const totalOngkirCell = worksheet.getRow(startDataRowIndex).getCell(startKesimpulanCol + 3);
      totalOngkirCell.alignment = { vertical: 'middle', horizontal: 'center' };
      totalOngkirCell.numFmt = '#,##0';

      // ONGKIR/PCS
      worksheet.mergeCells(startDataRowIndex, startKesimpulanCol + 4, endDataRowIndex, startKesimpulanCol + 4);
      const ongkirPcsCell = worksheet.getRow(startDataRowIndex).getCell(startKesimpulanCol + 4);
      ongkirPcsCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ongkirPcsCell.numFmt = '#,##0';

      // Embed Image
      if (block.photoUrl) {
        try {
          const imgData = await fetchImageBuffer(block.photoUrl);
          if (imgData) {
            const imageId = workbook.addImage({
              base64: imgData.base64,
              extension: imgData.extension,
            });

            worksheet.addImage(imageId, {
              tl: { col: 4.15, row: startDataRowIndex - 1 + 0.1 } as any,
              br: { col: 4.85, row: endDataRowIndex + 0.9 } as any,
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

    currentRow += 2;
  }

  onProgress?.('Mengompilasi file Excel (.xlsx)...');

  const buffer = await workbook.xlsx.writeBuffer();
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
