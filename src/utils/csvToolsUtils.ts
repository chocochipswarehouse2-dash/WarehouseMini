import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface DistStoreCol {
  idx: number;
  name: string;
  isGudangAwal: boolean;
}

export interface DistProductRow {
  sku: string;
  name: string;
  variant: string;
  price: string;
  allocations: Record<string, number>;
}

export interface DistFileItem {
  id: string;
  fileName: string;
  batchNumber: string;
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  selectedSheet: string;
  storeCols: DistStoreCol[];
  parsedProducts: DistProductRow[];
  selectedStores: Set<string>;
  prefixPattern: string;
  excludeZero: boolean;
  spacePadding: boolean;
  metrics: {
    totalSkus: number;
    totalStores: number;
    totalUnits: number;
    totalQtyAwal: number;
    hasGudangAwal: boolean;
  };
}

export interface DealPosOutletCol {
  idx: number;
  name: string;
}

export interface DealPosSkuRow {
  sku: string;
  name: string;
  variant: string;
  category: string;
  price: string;
  stocks: Record<string, number>;
}

export interface DealPosProductGroup {
  name: string;
  category: string;
  variants: DealPosSkuRow[];
}

export interface DealPosInventoryData {
  outletCols: DealPosOutletCol[];
  skuMap: Map<string, DealPosSkuRow>;
  productMap: Map<string, DealPosProductGroup>;
  totalSkus: number;
  sourceLabel: string;
}

export interface BatchBarcodePrintItem {
  sku: string;
  name: string;
  variant: string;
  price: string;
  qty: number;
  outlet: string;
}

export const NON_STORE_CHANNELS_REGEX =
  /^(total|subtotal|grand\s*total|sum|tp$|total_stok|total\s*stok|total_qty|total\s*qty|booked|b$|d$|cabang|barang\s*cacat|barang_cacat|defect|diskon\s*defect|permak|permak\s*\/?\s*cuci|gudang\s*permak|buying\s*staff|buying_staff|endorsement|ga$|gudang\s*awal|log$|gudang\s*logistik|qc$|gudang\s*qc|gudang_retur|gudang\s*retur|loss_damage|loss\/damage|sample\s*studio|sample_studio|studio$|sample\s*live|sample_live|live$|barang\s*live|wh$|warehouse|gudang\s*utama|gudang_utama|map$)/i;

/**
 * Standarisasi Penamaan Outlet & Bazaar WMS
 * - Bazaar diformat dengan awalan B- (contoh: B-EMP untuk Emporium, B-LWS untuk Living World)
 */
export function normalizeOutletName(rawName: string): string {
  const clean = String(rawName || '').trim();
  const upper = clean.toUpperCase().replace(/\s+/g, '_');

  // Specific Bazaar Mappings
  if (/^(bazaar_emporium|bazar_emporium|emporium_pluit|b_?emp)/i.test(upper) || upper.includes('EMPORIUM')) {
    return 'B-EMP';
  }
  if (
    /^(bazaar_living_world|bazar_living_world|bazaar_lwt|bazaar_lws|b_?lwt|b_?lws)/i.test(upper) ||
    (upper.includes('BAZAAR') && (upper.includes('LIVING') || upper.includes('LWT') || upper.includes('LWS')))
  ) {
    return 'B-LWS';
  }
  if (/^(bazaar_panakkukang|bazar_panakkukang|panakkukang|b_?pnk|b_?mks)/i.test(upper) || upper.includes('PANAKKUKANG')) {
    return 'B-PNK';
  }
  if (/^(bazaar_central_park|bazar_central_park|b_?cp|b_?cpj)/i.test(upper) || (upper.includes('BAZAAR') && upper.includes('CENTRAL'))) {
    return 'B-CPJ';
  }
  if (/^(bazaar_lippo_mall_puri|bazar_lippo|b_?lmp)/i.test(upper) || (upper.includes('BAZAAR') && upper.includes('LIPPO'))) {
    return 'B-LMP';
  }
  if (/^(bazaar_summarecon|bazar_summarecon|b_?sms|b_?spm)/i.test(upper) || (upper.includes('BAZAAR') && upper.includes('SUMMARECON'))) {
    return 'B-SMS';
  }
  if (/^(bazaar_pakuwon|bazar_pakuwon|b_?pms)/i.test(upper) || (upper.includes('BAZAAR') && upper.includes('PAKUWON'))) {
    return 'B-PMS';
  }

  // Generic Bazaar prefix if starts with BAZAAR_ or BAZAR_
  if (/^(bazaar_|bazar_)/i.test(upper)) {
    const suffix = upper
      .replace(/^(bazaar_|bazar_)/i, '')
      .replace(/_MALL|_TANGERANG|_SURABAYA|_JAKARTA|_MEDAN/g, '')
      .slice(0, 4);
    return `B-${suffix}`;
  }

  return clean;
}

export function getOutletDisplayName(code: string): { code: string; title: string; isBazaar: boolean } {
  const norm = normalizeOutletName(code);
  const isBazaar = norm.startsWith('B-');
  let title = norm;

  if (norm === 'B-EMP') title = 'B-EMP (Bazaar Emporium)';
  else if (norm === 'B-LWS') title = 'B-LWS (Bazaar Living World)';
  else if (norm === 'B-PNK') title = 'B-PNK (Bazaar Panakkukang)';
  else if (norm === 'B-CPJ') title = 'B-CPJ (Bazaar Central Park)';
  else if (norm === 'B-LMP') title = 'B-LMP (Bazaar Lippo Mall)';
  else if (norm === 'B-SMS') title = 'B-SMS (Bazaar Summarecon)';
  else if (norm === 'B-PMS') title = 'B-PMS (Bazaar Pakuwon)';

  return { code: norm, title, isBazaar };
}

export interface BarcodePrinterConfig {
  lineMode: '1' | '2'; // '1' = 50x20mm Single, '2' = 104x20mm Twin
  labelWidthMm: number;
  labelHeightMm: number;
  twoLineGapMm: number;
  printPaddingMm: number;
  fontFamily: string;

  codeType: 'barcode' | 'qrcode';
  barcodeFormat: string;
  barcodeHeight: number;
  barcodeWidth: number;
  qrSize: number;

  showProductName: boolean;
  productNameSize: number;
  productNameBold: boolean;
  productNameCase: 'normal' | 'uppercase';

  showVariantSize: boolean;
  variantSize: number;
  variantBold: boolean;

  showSku: boolean;
  skuSize: number;
  skuBold: boolean;
  skuPrefix: string;

  showPrice: boolean;
  priceSize: number;
  priceBold: boolean;
  pricePrefixType: 'Rp' | 'none' | 'IDR' | 'custom';
  priceCustomPrefix: string;
  priceCustomSuffix: string;
  priceThousandSeparator: '.' | ',' | 'none';
  customText: string;

  // Orientasi, Rotasi & Offset Cetak Thermal
  printOrientation: 'landscape' | 'portrait'; // 'landscape' (50x20mm) | 'portrait' (20x50mm)
  printRotation: number; // 0 | 90 | 180 | 270
  offsetX: number; // Geser X (mm)
  offsetY: number; // Geser Y (mm)
}

export type BarcodeLabelConfig = BarcodePrinterConfig;

export const DEFAULT_BARCODE_LABEL_CONFIG: BarcodePrinterConfig = {
  lineMode: '1',
  labelWidthMm: 50,
  labelHeightMm: 20,
  twoLineGapMm: 4,
  printPaddingMm: 1.0,
  fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

  codeType: 'qrcode',
  barcodeFormat: 'CODE128',
  barcodeHeight: 22,
  barcodeWidth: 1.2,
  qrSize: 44,

  showProductName: true,
  productNameSize: 8.5,
  productNameBold: true,
  productNameCase: 'normal',

  showVariantSize: true,
  variantSize: 8.0,
  variantBold: false,

  showSku: true,
  skuSize: 6.8,
  skuBold: true,
  skuPrefix: '',

  showPrice: true,
  priceSize: 11.0,
  priceBold: true,
  pricePrefixType: 'Rp',
  priceCustomPrefix: '',
  priceCustomSuffix: '',
  priceThousandSeparator: '.',
  customText: '',

  printOrientation: 'landscape',
  printRotation: 0,
  offsetX: 0,
  offsetY: 0,
};

export function formatLabelPriceDisplay(
  rawPrice: any,
  config: Partial<BarcodePrinterConfig> = DEFAULT_BARCODE_LABEL_CONFIG
): string {
  if (!rawPrice && rawPrice !== 0) return '';
  const numStr = String(rawPrice).replace(/[^\d]/g, '');
  if (!numStr) return String(rawPrice);

  let formattedNumber = '';
  if (config.priceThousandSeparator === '.') {
    formattedNumber = parseInt(numStr, 10).toLocaleString('id-ID');
  } else if (config.priceThousandSeparator === ',') {
    formattedNumber = parseInt(numStr, 10).toLocaleString('en-US');
  } else {
    formattedNumber = numStr;
  }

  let prefix = '';
  if (config.pricePrefixType === 'Rp') prefix = 'Rp ';
  else if (config.pricePrefixType === 'IDR') prefix = 'IDR ';
  else if (config.pricePrefixType === 'custom') prefix = config.priceCustomPrefix || '';
  else prefix = '';

  const suffix = config.priceCustomSuffix || '';
  return `${prefix}${formattedNumber}${suffix}`;
}

const KNOWN_CATEGORIES_LIST = [
  'Cardigan', 'Jumpsuit', 'Bodysuit', 'Culottes', 'Culotte', 'Bralette', 'Leggings', 'Legging',
  'Overalls', 'Overall', 'Blazer', 'Shorts', 'Short', 'Blouse', 'Jacket', 'Sweater', 'Hoodie',
  'Corset', 'Pants', 'Dress', 'Skirt', 'Shirt', 'Outer', 'Vest', 'Knit', 'Tank', 'Jeans',
  'Romper', 'Coat', 'Maxi', 'Midi', 'Mini', 'Top', 'Set', 'Tee'
];
KNOWN_CATEGORIES_LIST.sort((a, b) => b.length - a.length);

const KNOWN_COLORS_LIST = [
  'Denim Blue', 'Dark Denim', 'Light Denim', 'Baby Blue', 'Baby Pink', 'Dusty Pink', 'Dusty Blue',
  'Broken White', 'Off White', 'All Size', 'Navy', 'Black', 'White', 'Cream', 'Pink', 'Sage',
  'Khaki', 'Grey', 'Gray', 'Maroon', 'Burgundy', 'Camel', 'Lilac', 'Mint', 'Peach', 'Choco',
  'Olive', 'Brown', 'Yellow', 'Blue', 'Red', 'Green', 'Mustard', 'Charcoal', 'Taupe', 'Ivory',
  'Brick', 'Sand', 'Mocca', 'Champagne', 'Silver', 'Gold', 'Beige', 'Terracotta', 'Lavender',
  'Coral', 'Emerald', 'Rust', 'Bronze', 'Tan', 'Denim'
];
KNOWN_COLORS_LIST.sort((a, b) => b.length - a.length);

export function getAutoProductNameFontSize(text: string, baseSize = 7.5): number {
  const len = (text || '').length;
  const base = Number(baseSize) || 7.5;
  if (len > 34) return Math.min(base, Math.max(5.5, base - 2.0));
  if (len > 28) return Math.min(base, Math.max(6.0, base - 1.5));
  if (len > 22) return Math.min(base, Math.max(6.6, base - 0.8));
  return base;
}

export function parseLabelNameAndVariant(rawName: string, rawVariant?: string) {
  const name = (rawName || '').trim();
  const varStr = (rawVariant || '').trim();
  const isPlaceholderVar = !varStr || varStr === '-' || /^(default|all\s*size|none|one\s*size)$/i.test(varStr);
  const cleanVar = isPlaceholderVar ? '' : varStr;

  const nameLower = name.toLowerCase();
  let splitDone = false;
  let mainName = name;
  let color = '';

  for (const cat of KNOWN_CATEGORIES_LIST) {
    const regex = new RegExp('\\b' + cat.toLowerCase() + '\\b', 'i');
    const match = regex.exec(name);
    if (match) {
      const catEnd = match.index + match[0].length;
      const candidateMain = name.substring(0, catEnd).trim();
      let candidateColor = name.substring(catEnd).trim();
      candidateColor = candidateColor.replace(/^[-/\s]+/, '').trim();
      if (candidateColor) {
        mainName = candidateMain;
        color = candidateColor;
        splitDone = true;
        break;
      } else {
        mainName = candidateMain;
        color = '';
        splitDone = true;
        break;
      }
    }
  }

  if (!splitDone || !color) {
    for (const c of KNOWN_COLORS_LIST) {
      if (nameLower.endsWith(' ' + c.toLowerCase())) {
        color = c;
        mainName = name.substring(0, name.length - c.length - 1).trim();
        break;
      }
    }
  }

  // QR Code Lines:
  let qrRow1 = '';
  let qrRow2 = '';
  if (!color) {
    qrRow1 = cleanVar ? `${mainName} | ${cleanVar}` : mainName;
    qrRow2 = '';
  } else {
    qrRow1 = mainName;
    qrRow2 = cleanVar ? `${color} | ${cleanVar}` : color;
  }

  // Barcode format (50x20mm standard: Name (Size)):
  let barcodeFullName = name;
  if (cleanVar) {
    if (!name.endsWith(`(${cleanVar})`) && !name.endsWith(`[${cleanVar}]`)) {
      barcodeFullName = `${name} (${cleanVar})`;
    }
  }

  return {
    mainName,
    color,
    cleanVar,
    qrRow1,
    qrRow2,
    barcodeFullName,
  };
}

export function extractBatchNumber(name: string, sheet = ''): string {
  const mSheet = (sheet || '').match(/\b(\d{3,4})\b/);
  if (mSheet) return mSheet[1];
  const mFile = (name || '').match(/\b(\d{3,4})\b/);
  if (mFile) return mFile[1];
  if (/BACK IN STOCK|BIS/i.test(name) || /BACK IN STOCK|BIS/i.test(sheet)) {
    return 'BIS';
  }
  const cleanName = (name || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .replace(/^(Pembagian\s+Stock|Template)\s*[-_:]?\s*/i, '')
    .trim();
  return cleanName || 'DIST';
}

export function parseDistSheetData(
  wb: XLSX.WorkBook,
  sheetName: string,
  priceLookup?: (sku: string) => number | string | undefined
) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;

  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (!rawRows || rawRows.length === 0) return null;

  let headerRowIdx = -1;
  let skuColIdx = -1;
  let nameColIdx = 3;
  let variantColIdx = 4;
  let priceColIdx = -1;
  let qtyAwalIdx = -1;

  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toUpperCase();
      if (val === 'SKU' || val === 'CODE' || val === 'KODE SKU' || val === 'BARCODE') {
        headerRowIdx = r;
        skuColIdx = c;
      } else if (val.includes('NAMA PRODUK') || val === 'PRODUK' || val === 'NAME' || val === 'NAMA') {
        nameColIdx = c;
      } else if (val === 'VARIANT' || val === 'VARIAN' || val === 'SIZE') {
        variantColIdx = c;
      } else if (val === 'HARGA' || val === 'PRICE' || val === 'UNIT PRICE' || val === 'HARGA JUAL') {
        priceColIdx = c;
      } else if ((val.includes('QTY') && val.includes('AWAL')) || (qtyAwalIdx === -1 && val === 'MP')) {
        qtyAwalIdx = c;
      }
    }
    if (headerRowIdx !== -1) break;
  }

  if (headerRowIdx === -1 || skuColIdx === -1) return null;

  const headers = rawRows[headerRowIdx] || [];
  const startCol = qtyAwalIdx !== -1 ? qtyAwalIdx + 1 : Math.max(skuColIdx, priceColIdx) + 1;

  const stores: DistStoreCol[] = [];
  if (qtyAwalIdx !== -1) {
    stores.push({ idx: qtyAwalIdx, name: 'Gudang Awal', isGudangAwal: true });
  }

  const rawStores: Array<{ idx: number; name: string }> = [];
  const seenStoreCounts: Record<string, number> = {};
  const ignoredCols = new Set([
    'TOTAL',
    'SUM',
    'SUBTOTAL',
    'NOTE',
    'KET',
    'KETERANGAN',
    'REMARK',
    'SISA MP',
    'SISA',
    'BIS',
  ]);

  for (let c = startCol; c < headers.length; c++) {
    const h = headers[c];
    if (h && String(h).trim()) {
      const sName = String(h).trim();
      const sUpper = sName.toUpperCase();
      if (!ignoredCols.has(sUpper)) {
        seenStoreCounts[sName] = (seenStoreCounts[sName] || 0) + 1;
        rawStores.push({ idx: c, name: sName });
      }
    }
  }

  const hasDuplicates = Object.values(seenStoreCounts).some((count) => count > 1);
  if (hasDuplicates) {
    // Back In Stock template: store headers appear in pairs (1st = existing stock, 2nd = allocation)
    const storeTracker: Record<string, number> = {};
    rawStores.forEach((st) => {
      storeTracker[st.name] = (storeTracker[st.name] || 0) + 1;
      if (storeTracker[st.name] === 2 || seenStoreCounts[st.name] === 1) {
        stores.push({ idx: st.idx, name: st.name, isGudangAwal: false });
      }
    });
  } else {
    rawStores.forEach((st) => {
      stores.push({ idx: st.idx, name: st.name, isGudangAwal: false });
    });
  }

  const products: DistProductRow[] = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !row[skuColIdx]) continue;

    const skuStr = String(row[skuColIdx]).trim();
    if (!skuStr || ['TOTAL', 'SUM', 'SUBTOTAL'].includes(skuStr.toUpperCase())) continue;

    const nameStr = row[nameColIdx] ? String(row[nameColIdx]).trim() : '';
    const variantStr = row[variantColIdx] ? String(row[variantColIdx]).trim() : '';

    const allocations: Record<string, number> = {};
    stores.forEach((s) => {
      const rawVal = row[s.idx];
      if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
        const num = parseInt(String(Number(rawVal)), 10);
        if (!Number.isNaN(num) && num > 0) {
          allocations[s.name] = num;
        }
      }
    });

    let priceStr = '0';
    if (
      priceColIdx !== -1 &&
      row[priceColIdx] !== null &&
      row[priceColIdx] !== undefined &&
      String(row[priceColIdx]).trim() !== ''
    ) {
      const rawPrice = String(row[priceColIdx]).replace(/[^0-9]/g, '');
      if (rawPrice && Number(rawPrice) > 0) {
        priceStr = rawPrice;
      }
    }
    if ((priceStr === '0' || !priceStr) && priceLookup) {
      const cat = priceLookup(skuStr.toUpperCase());
      if (cat !== undefined && cat !== null && Number(cat) > 0) {
        priceStr = String(cat);
      }
    }

    products.push({
      sku: skuStr,
      name: nameStr,
      variant: variantStr,
      price: priceStr,
      allocations,
    });
  }

  let totalStoreUnits = 0;
  let totalQtyAwal = 0;
  products.forEach((p) => {
    Object.entries(p.allocations).forEach(([sName, qty]) => {
      if (sName === 'Gudang Awal') totalQtyAwal += qty;
      else totalStoreUnits += qty;
    });
  });

  return {
    storeCols: stores,
    parsedProducts: products,
    selectedStores: new Set(stores.map((s) => s.name)),
    metrics: {
      totalSkus: products.length,
      totalStores: stores.filter((s) => !s.isGudangAwal).length,
      totalUnits: totalStoreUnits,
      totalQtyAwal,
      hasGudangAwal: qtyAwalIdx !== -1,
    },
  };
}

export function findBestDistSheet(
  wb: XLSX.WorkBook,
  priceLookup?: (sku: string) => number | string | undefined
) {
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    return { sheetName: '', parsed: null };
  }
  const priorityKeywords = [
    'UPLOAD',
    'REGULAR',
    'REGULER',
    'ALOKASI',
    'DISTRIBUSI',
    'BIS',
    'TEMPLATE',
    'STOCK',
    'STOK',
  ];
  const sortedSheets = [...wb.SheetNames].sort((a, b) => {
    const aUp = a.toUpperCase();
    const bUp = b.toUpperCase();
    const aScore = priorityKeywords.findIndex((k) => aUp.includes(k));
    const bScore = priorityKeywords.findIndex((k) => bUp.includes(k));
    const aRank = aScore === -1 ? 999 : aScore;
    const bRank = bScore === -1 ? 999 : bScore;
    return aRank - bRank;
  });

  for (const s of sortedSheets) {
    const parsed = parseDistSheetData(wb, s, priceLookup);
    if (parsed && parsed.parsedProducts.length > 0) {
      return { sheetName: s, parsed };
    }
  }
  for (const s of wb.SheetNames) {
    const parsed = parseDistSheetData(wb, s, priceLookup);
    if (parsed) return { sheetName: s, parsed };
  }
  return { sheetName: wb.SheetNames[0], parsed: null };
}

export function formatStoreFilename(pattern: string, batch: string, store: string): string {
  return (pattern || '{store}')
    .replace(/{batch}/g, batch || '')
    .replace(/{store}/g, store || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateStoreCsvText(fileObj: DistFileItem, storeName: string): string {
  let csv = 'Code,Quantity,UnitCost,Serial\r\n';
  fileObj.parsedProducts.forEach((p) => {
    const qty = p.allocations[storeName] || 0;
    if (!fileObj.excludeZero || qty > 0) {
      if (fileObj.spacePadding) {
        csv += `${p.sku}, ${qty} ,,\r\n`;
      } else {
        csv += `${p.sku},${qty},,\r\n`;
      }
    }
  });
  return csv;
}

export function getDistFolderName(fileObj: DistFileItem): string {
  if (fileObj.batchNumber) {
    return `CSV_Export_${fileObj.batchNumber.replace(/[\\/*?:"<>|]/g, '_')}`;
  }
  const cleanBase = fileObj.fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim();
  return cleanBase ? `CSV_Export_${cleanBase.replace(/[\\/*?:"<>|]/g, '_')}` : 'CSV_Export';
}

export function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function parseDealPOSInventoryCsv(text: string, sourceLabel = 'CSV DealPOS'): DealPosInventoryData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('File CSV Inventory kosong atau tidak valid.');
  }

  const headerRow = parseCsvLine(lines[0]);
  const skuIdx = headerRow.findIndex((h) => ['SKU', 'CODE', 'KODE'].includes(h.trim().toUpperCase()));
  const nameIdx = headerRow.findIndex((h) => ['NAME', 'NAMA', 'NAMA PRODUK', 'PRODUCT'].includes(h.trim().toUpperCase()));
  const varIdx = headerRow.findIndex((h) => ['VARIANT', 'VARIAN', 'SIZE'].includes(h.trim().toUpperCase()));
  const catIdx = headerRow.findIndex((h) => ['CATEGORY', 'KATEGORI'].includes(h.trim().toUpperCase()));
  const priceIdx = headerRow.findIndex((h) => ['UNITPRICE', 'PRICE', 'HARGA', 'UNIT COST'].includes(h.trim().toUpperCase()));

  if (skuIdx === -1) {
    throw new Error('Kolom SKU / Code tidak ditemukan di header CSV.');
  }

  const metaCols = new Set([skuIdx, nameIdx, varIdx, catIdx, priceIdx].filter((i) => i !== -1));
  const ignoredHeaders = new Set([
    'COST',
    'UNITCOST',
    'BARCODE',
    'TAG',
    'BRAND',
    'DESCRIPTION',
    'SUPPLIER',
    'TOTAL',
    'TOTAL_STOK',
    'TOTAL STOK',
    'TOTAL_QTY',
    'TOTAL QTY',
    'TOTALSTOCK',
    'TOTALQTY',
    'TP',
    'SUBTOTAL',
    'GRAND TOTAL',
    'SUM',
    'BOOKED',
    'PERMAK',
    'PERMAK / CUCI',
    'PERMAK/CUCI',
    'BARANG CACAT',
    'DEFECT',
    'BUYING_STAFF',
    'ENDORSEMENT',
    'GA',
    'LOG',
    'QC',
    'GUDANG UTAMA',
    'WH',
    'MAP',
  ]);

  const outletCols: DealPosOutletCol[] = [];
  headerRow.forEach((h, idx) => {
    const clean = h.trim();
    const cleanUp = clean.toUpperCase();
    const isIgnored =
      ignoredHeaders.has(cleanUp) ||
      NON_STORE_CHANNELS_REGEX.test(cleanUp);
    if (!metaCols.has(idx) && clean && !isIgnored) {
      const normName = normalizeOutletName(clean);
      outletCols.push({ idx, name: normName });
    }
  });

  const skuMap = new Map<string, DealPosSkuRow>();
  const productMap = new Map<string, DealPosProductGroup>();

  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    const sku = (r[skuIdx] || '').trim();
    if (!sku) continue;
    const skuUpper = sku.toUpperCase();
    const name = nameIdx !== -1 ? (r[nameIdx] || '').trim() : sku;
    const variant = varIdx !== -1 ? (r[varIdx] || '').trim() : '-';
    const category = catIdx !== -1 ? (r[catIdx] || '').trim() : '';
    const price = priceIdx !== -1 ? (r[priceIdx] || '0').replace(/[^0-9]/g, '') : '0';

    const stocks: Record<string, number> = {};
    outletCols.forEach((o) => {
      const val = Number(r[o.idx]);
      if (!Number.isNaN(val) && val !== 0) {
        stocks[o.name] = (stocks[o.name] || 0) + val;
      }
    });

    const rowObj: DealPosSkuRow = { sku, name, variant, category, price, stocks };
    skuMap.set(skuUpper, rowObj);

    const groupKey = name || sku;
    let group = productMap.get(groupKey);
    if (!group) {
      group = { name: groupKey, category, variants: [] };
      productMap.set(groupKey, group);
    }
    group.variants.push(rowObj);
  }

  return {
    outletCols,
    skuMap,
    productMap,
    totalSkus: skuMap.size,
    sourceLabel,
  };
}

export async function downloadZipBlob(zip: JSZip, filename: string): Promise<void> {
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Print isolated HTML directly via a hidden iframe (prevents popup blockers and preserves app state).
 */
export function printHtmlInHiddenIframe(htmlContent: string): void {
  const existing = document.getElementById('wms-tools-hidden-print-iframe');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'wms-tools-hidden-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Hidden iframe print error:', err);
    }
    setTimeout(() => {
      iframe.remove();
    }, 60_000);
  }, 350);
}
