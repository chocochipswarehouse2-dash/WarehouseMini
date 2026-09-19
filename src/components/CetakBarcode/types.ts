import { ProductItem } from '../../types';

export interface ProductBarcodeItem {
  id: string;
  sku: string;
  nama: string;
  size: string;
  lokasi?: string;
  price?: number;
  copies: number;
  selected?: boolean;
}

export type PriceTagMode = 'none' | 'rp' | 'idr' | 'custom';
export type QrSizePreset = 'small' | 'normal' | 'large' | 'xlarge';
export type TitleFontSizePreset = 'small' | 'normal' | 'large' | 'xlarge';
export type TitleFontWeight = '500' | '600' | '700' | '800';
export type TitleLayoutMode = 'split' | 'single';
export type PriceFontSizePreset = 'small' | 'normal' | 'large' | 'xlarge';
export type PriceFontWeight = '600' | '700' | '800' | '900';

export interface BarcodeCustomizerSettings {
  printOrientation: 'landscape' | 'portrait';
  isRotated180: boolean;
  showProductName: boolean;
  showSize: boolean;
  showPrice: boolean;
  showLocation: boolean;
  priceTagMode: PriceTagMode;
  customPricePrefix: string;
  qrSizePreset: QrSizePreset;
  titleFontSizePreset: TitleFontSizePreset;
  titleFontWeight: TitleFontWeight;
  titleLayoutMode: TitleLayoutMode;
  priceFontSizePreset: PriceFontSizePreset;
  priceFontWeight: PriceFontWeight;
}

export const DEFAULT_BARCODE_SETTINGS: BarcodeCustomizerSettings = {
  printOrientation: 'landscape',
  isRotated180: false,
  showProductName: true,
  showSize: true,
  showPrice: true,
  showLocation: false,
  priceTagMode: 'none',
  customPricePrefix: '',
  qrSizePreset: 'normal',
  titleFontSizePreset: 'normal',
  titleFontWeight: '600',
  titleLayoutMode: 'split',
  priceFontSizePreset: 'normal',
  priceFontWeight: '700',
};

export const formatProductPriceWithTag = (
  price?: number | string | null,
  tagMode: PriceTagMode = 'none',
  customPrefix = ''
): string => {
  if (price === undefined || price === null || price === '') return '';
  const num = typeof price === 'number' ? price : Number(String(price).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num) || num <= 0) return '';
  const formatted = new Intl.NumberFormat('id-ID').format(num);

  if (tagMode === 'rp') return `Rp ${formatted}`;
  if (tagMode === 'idr') return `IDR ${formatted}`;
  if (tagMode === 'custom' && customPrefix.trim()) return `${customPrefix.trim()} ${formatted}`;
  return formatted;
};

export const isRealSize = (sz?: unknown): boolean => {
  if (sz === undefined || sz === null) return false;
  const clean = String(sz).trim();
  return clean !== '' && clean !== '-' && clean.toLowerCase() !== 'default' && clean.toLowerCase() !== 'none';
};

export const getProductMasterPrice = (product?: ProductItem | null): number => {
  if (!product) return 0;
  if (typeof product.price === 'number' && product.price > 0) return product.price;
  if (typeof product.harga === 'number' && product.harga > 0) return product.harga;
  const dp = (product as any)?.dealpos_channels;
  if (dp && typeof dp === 'object') {
    const tp = Number(dp.TP ?? dp.tag_price ?? dp.TagPrice ?? dp.price ?? dp.harga ?? dp.HARGA ?? 0);
    if (!isNaN(tp) && tp > 0) return tp;
  }
  return 0;
};

export const parseRawPrice = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim().replace(/rp\.?/gi, '').replace(/idr\.?/gi, '').replace(/\s+/g, '');
  const cleanStr = str.replace(/[.,](?=\d{3})/g, '').replace(/,/g, '.');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
};

const APPAREL_CATEGORIES = [
  'crop top', 'tank top', 'maxi dress', 'midi dress', 'mini dress',
  'one set', 'knit wear', 'knitwear', 't-shirt', 't shirt', 'oversized tee',
  'top', 'tops', 'blouse', 'shirt', 'kemeja', 'tee', 'tshirt', 'kaos',
  'tank', 'crop', 'camisole', 'cami', 'tunic', 'tunik', 'sweater',
  'cardigan', 'cardi', 'knit', 'vest', 'hoodie', 'jacket',
  'jaket', 'blazer', 'outer', 'outerwear', 'coat',
  'pants', 'pant', 'celana', 'jeans', 'denim', 'trouser', 'trousers',
  'culotte', 'culottes', 'kulot', 'skirt', 'rok', 'shorts', 'short',
  'legging', 'leggings', 'cargo',
  'dress', 'gaun', 'jumpsuit', 'playsuit', 'romper', 'overall', 'overalls',
  'bodysuit', 'set', 'suit', 'pajamas', 'piyama', 'bag', 'tas', 'scarf'
];

const FASHION_COLORS = [
  'soft yellow', 'soft blue', 'baby blue', 'baby pink', 'dusty pink',
  'broken white', 'grey black denim', 'dark grey', 'light grey', 'dark blue',
  'sage green', 'army green', 'olive green', 'mint green', 'forest green',
  'navy blue', 'royal blue', 'light blue', 'deep blue', 'warm beige',
  'blue', 'yellow', 'black', 'white', 'red', 'green', 'pink', 'cream',
  'beige', 'brown', 'grey', 'gray', 'denim', 'navy', 'olive', 'sage',
  'lilac', 'lavender', 'maroon', 'mustard', 'choco', 'charcoal', 'mocca',
  'moka', 'terracotta', 'fuchsia', 'bw', 'khaki', 'nude', 'army',
  'emerald', 'taupe', 'burgundy', 'silver', 'gold', 'tan', 'peach',
  'orange', 'coral', 'ivory', 'brick', 'plum', 'magenta', 'tosca',
  'rose', 'caramel', 'coffee', 'espresso', 'cappuccino', 'sand'
];

export const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const upper = part.toUpperCase();
      if (['XL', 'XXL', 'XXXL', '2XL', '3XL', 'XS', 'S', 'M', 'L', 'SM', 'ML', 'BW', 'SKU'].includes(upper)) {
        return upper;
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
};

export interface ParsedBarcodeProductInfo {
  titleLine: string;
  variantLine: string;
  color: string;
  size: string;
}

export const parseBarcodeProductInfo = (
  nama?: string | null,
  size?: unknown,
  showName = true,
  showSz = true
): ParsedBarcodeProductInfo => {
  let cleanNama = nama ? String(nama).trim() : '';
  let cleanSz = isRealSize(size) ? String(size).trim().toUpperCase() : '';

  const sizeEndRegex = /(?:[\s\-_/|(),]+)(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|all\s*size|onesize|free\s*size|sm|ml|\d{2})(?:[\s\-_/|()]*)$/i;
  const matchSizeEnd = cleanNama.match(sizeEndRegex);
  if (matchSizeEnd) {
    if (!cleanSz) {
      cleanSz = matchSizeEnd[1].trim().toUpperCase();
    }
    cleanNama = cleanNama.substring(0, matchSizeEnd.index).trim();
  }

  let title = '';
  let color = '';

  let matchedCat: string | null = null;
  let matchIndex = -1;
  let matchLen = 0;

  for (const cat of APPAREL_CATEGORIES) {
    const rx = new RegExp(`\\b(${cat})\\b`, 'i');
    const m = cleanNama.match(rx);
    if (m && m.index !== undefined) {
      matchedCat = m[0];
      matchIndex = m.index;
      matchLen = m[0].length;
      break;
    }
  }

  if (matchedCat && matchIndex >= 0) {
    const splitPoint = matchIndex + matchLen;
    title = cleanNama.substring(0, splitPoint).trim();
    let rest = cleanNama.substring(splitPoint).trim();
    rest = rest.replace(/^[\s\-_/|,]+/, '').trim();
    color = rest;
  } else {
    let matchedColor: string | null = null;
    let colorIndex = -1;

    for (const col of FASHION_COLORS) {
      const rx = new RegExp(`\\b(${col})\\b`, 'i');
      const m = cleanNama.match(rx);
      if (m && m.index !== undefined && m.index > 0) {
        matchedColor = m[0];
        colorIndex = m.index;
        break;
      }
    }

    if (matchedColor && colorIndex > 0) {
      title = cleanNama.substring(0, colorIndex).trim().replace(/[\s\-_/|,]+$/, '');
      color = cleanNama.substring(colorIndex).trim().replace(/^[\s\-_/|,]+/, '');
    } else {
      const delimiterMatch = cleanNama.match(/\s*[-/|]\s*/);
      if (delimiterMatch && delimiterMatch.index && delimiterMatch.index > 0) {
        title = cleanNama.substring(0, delimiterMatch.index).trim();
        color = cleanNama.substring(delimiterMatch.index + delimiterMatch[0].length).trim();
      } else {
        title = cleanNama;
        color = '';
      }
    }
  }

  const formattedTitle = toTitleCase(title);
  const formattedColor = toTitleCase(color);

  const variantParts: string[] = [];
  if (formattedColor) {
    variantParts.push(formattedColor);
  }
  if (showSz && cleanSz) {
    const lowerCol = formattedColor.toLowerCase();
    const lowerSz = cleanSz.toLowerCase();
    if (
      !lowerCol.endsWith(` ${lowerSz}`) &&
      !lowerCol.endsWith(`-${lowerSz}`) &&
      !lowerCol.endsWith(`/${lowerSz}`) &&
      !lowerCol.endsWith(`|${lowerSz}`)
    ) {
      variantParts.push(cleanSz);
    }
  }

  const finalTitle = showName ? formattedTitle : '';
  const finalVariant = variantParts.join(' | ');

  return {
    titleLine: finalTitle,
    variantLine: finalVariant,
    color: formattedColor,
    size: cleanSz,
  };
};

export const getOutletStockForProduct = (
  product: ProductItem,
  selectedOutlets: string[]
): number => {
  if (!product || !selectedOutlets || selectedOutlets.length === 0) return 0;

  const dpRaw = (product as any)?.dealpos_channels;
  const d = {
    ...(typeof dpRaw === 'object' && !Array.isArray(dpRaw) ? dpRaw : {}),
    ...(typeof dpRaw?.d === 'object' ? dpRaw.d : {}),
    ...(typeof (product as any)?.d === 'object' ? (product as any).d : {}),
  } as Record<string, any>;

  const b = {
    ...(typeof dpRaw === 'object' && !Array.isArray(dpRaw) ? dpRaw : {}),
    ...(typeof dpRaw?.cabang === 'object' ? dpRaw.cabang : {}),
    ...(typeof dpRaw?.b === 'object' ? dpRaw.b : {}),
    ...(typeof (product as any)?.b === 'object' ? (product as any).b : {}),
  } as Record<string, any>;

  let total = 0;

  selectedOutlets.forEach((outletKey) => {
    const kUpper = outletKey.toUpperCase();

    if (kUpper === 'MAP' || kUpper === 'GUDANG UTAMA' || kUpper === 'MARKETPLACE') {
      const val = Number(
        d['MAP'] ?? d['Gudang Utama'] ?? d['Marketplace'] ?? dpRaw?.MAP ?? dpRaw?.['Gudang Utama'] ?? product.stokMap ?? product.q ?? 0
      );
      if (!isNaN(val)) total += val;
    } else if (kUpper === 'LIVE' || kUpper === 'STUDIO' || kUpper === 'BARANG LIVE' || kUpper === 'SAMPLE LIVE') {
      const val = Number(
        d['LIVE'] ?? d['Studio'] ?? d['Barang Live'] ?? dpRaw?.LIVE ?? dpRaw?.STUDIO ?? product.stokStudio ?? 0
      );
      if (!isNaN(val)) total += val;
    } else if (kUpper === 'SHOPEE' || kUpper === 'SHP') {
      const val = Number(d['SHOPEE'] ?? dpRaw?.SHOPEE ?? product.stokShp ?? 0);
      if (!isNaN(val)) total += val;
    } else if (kUpper === 'TIKTOK' || kUpper === 'TTK') {
      const val = Number(d['TIKTOK'] ?? dpRaw?.TIKTOK ?? product.stokTtk ?? 0);
      if (!isNaN(val)) total += val;
    } else {
      // Branch outlet from b or d or dpRaw
      const val = Number(b[outletKey] ?? d[outletKey] ?? dpRaw?.[outletKey] ?? 0);
      if (!isNaN(val)) total += val;
    }
  });

  return Math.max(0, total);
};
