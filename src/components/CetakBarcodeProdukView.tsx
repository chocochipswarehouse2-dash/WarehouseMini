import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer,
  Plus,
  Trash2,
  Search,
  Upload,
  Download,
  FileSpreadsheet,
  QrCode,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Package,
  SlidersHorizontal,
  RefreshCw,
  Copy,
  Layers,
  ArrowRight,
  FileText,
  ClipboardPaste,
  Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import QRCode from 'qrcode';
import { ProductItem, UserSession } from '../types';

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

export const formatProductPrice = (price?: number | string | null, withPrefix = false): string => {
  if (price === undefined || price === null || price === '') return '';
  const num = typeof price === 'number' ? price : Number(String(price).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num) || num <= 0) return '';
  const formatted = new Intl.NumberFormat('id-ID').format(num);
  return withPrefix ? `Rp ${formatted}` : formatted;
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

export interface ParsedBarcodeProductInfo {
  titleLine: string;
  variantLine: string;
  color: string;
  size: string;
}

// Daftar kategori pakaian umum untuk auto-split Nama Produk & Varian
const APPAREL_CATEGORIES = [
  // Multi-word first
  'crop top', 'tank top', 'maxi dress', 'midi dress', 'mini dress',
  'one set', 'knit wear', 'knitwear', 't-shirt', 't shirt', 'oversized tee',
  // Tops / Atasan
  'top', 'tops', 'blouse', 'shirt', 'kemeja', 'tee', 'tshirt', 'kaos',
  'tank', 'crop', 'camisole', 'cami', 'tunic', 'tunik', 'sweater',
  'cardigan', 'cardi', 'knit', 'vest', 'hoodie', 'jacket',
  'jaket', 'blazer', 'outer', 'outerwear', 'coat',
  // Bottoms / Bawahan
  'pants', 'pant', 'celana', 'jeans', 'denim', 'trouser', 'trousers',
  'culotte', 'culottes', 'kulot', 'skirt', 'rok', 'shorts', 'short',
  'legging', 'leggings', 'cargo',
  // One-Piece / Dresses
  'dress', 'gaun', 'jumpsuit', 'playsuit', 'romper', 'overall', 'overalls',
  'bodysuit',
  // Sets & Others
  'set', 'suit', 'pajamas', 'piyama', 'bag', 'tas', 'scarf'
];

// Daftar varian warna umum dalam fashion untuk deteksi pintar
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

export const parseBarcodeProductInfo = (
  nama?: string | null,
  size?: unknown,
  showName = true,
  showSz = true
): ParsedBarcodeProductInfo => {
  let cleanNama = nama ? String(nama).trim() : '';
  let cleanSz = isRealSize(size) ? String(size).trim().toUpperCase() : '';

  // 1. Ekstrak size dari bagian ujung nama jika ada (contoh: "cassandra top Blue L" atau "Miranda Pants Soft Yellow XL")
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

  // 2. Deteksi Kategori Produk (Top, Pants, Dress, Skirt, Blouse, dsb.)
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
    // 3. Jika tidak ada kata kategori pakaian yang cocok, coba cocokkan varian warna
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

  // Buat Variant Line (Warna | Size)
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

export const getLabelTitle = (nama?: string | null, size?: unknown, showName = true, showSz = true): string => {
  const parsed = parseBarcodeProductInfo(nama, size, showName, showSz);
  if (parsed.titleLine && parsed.variantLine) {
    return `${parsed.titleLine} - ${parsed.variantLine}`;
  }
  return parsed.titleLine || parsed.variantLine || '';
};

export interface NameTypographyConfig {
  fontSize: string;
  lineClamp: number;
  lineHeight: string;
}

export const getTitleTypography = (text: string, isPortrait: boolean): NameTypographyConfig => {
  const len = text.length;
  if (isPortrait) {
    if (len <= 16) return { fontSize: '7.6pt', lineClamp: 1, lineHeight: '1.15' };
    if (len <= 26) return { fontSize: '6.8pt', lineClamp: 2, lineHeight: '1.12' };
    return { fontSize: '6.0pt', lineClamp: 2, lineHeight: '1.08' };
  }
  // Landscape (50mm x 20mm):
  // Format lebih besar & mudah dibaca sesuai permintaan user
  if (len <= 16) {
    return { fontSize: '9.2pt', lineClamp: 1, lineHeight: '1.15' }; // e.g. "Cassandra Top", "Miranda Pants"
  }
  if (len <= 26) {
    return { fontSize: '8.4pt', lineClamp: 1, lineHeight: '1.12' };
  }
  return { fontSize: '7.6pt', lineClamp: 2, lineHeight: '1.08' };
};

export const getVariantTypography = (text: string, isPortrait: boolean): NameTypographyConfig => {
  const len = text.length;
  if (isPortrait) {
    if (len <= 16) return { fontSize: '7.0pt', lineClamp: 1, lineHeight: '1.15' };
    return { fontSize: '6.2pt', lineClamp: 2, lineHeight: '1.10' };
  }
  // Landscape (50mm x 20mm)
  if (len <= 16) {
    return { fontSize: '8.4pt', lineClamp: 1, lineHeight: '1.15' }; // e.g. "Blue | L", "M", "Soft Yellow | XL"
  }
  if (len <= 26) {
    return { fontSize: '7.8pt', lineClamp: 1, lineHeight: '1.12' };
  }
  return { fontSize: '7.2pt', lineClamp: 2, lineHeight: '1.08' };
};

export const getNameTypography = (text: string, isPortrait: boolean): NameTypographyConfig => {
  return getTitleTypography(text, isPortrait);
};

export const parseRawPrice = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim().replace(/rp\.?/gi, '').replace(/\s+/g, '');
  const cleanStr = str.replace(/[.,](?=\d{3})/g, '').replace(/,/g, '.');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
};

interface CetakBarcodeProdukViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY = 'wms_product_barcode_queue_v1';
const SETTINGS_KEY = 'wms_product_barcode_settings_v1';

export const CetakBarcodeProdukView: React.FC<CetakBarcodeProdukViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  // -------------------------------------------------------------
  // 1. STATE: Antrean Cetak & Local Persistence
  // -------------------------------------------------------------
  const [queue, setQueue] = useState<ProductBarcodeItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load barcode queue from localStorage', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to persist barcode queue', e);
    }
  }, [queue]);

  // -------------------------------------------------------------
  // 2. STATE: Pengaturan Cetak & Desain Label 50×20 mm
  // -------------------------------------------------------------
  const [printOrientation, setPrintOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [isRotated180, setIsRotated180] = useState<boolean>(false);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showSize, setShowSize] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showCurrencyPrefix, setShowCurrencyPrefix] = useState<boolean>(false);
  const [showLocation, setShowLocation] = useState<boolean>(false);
  const [qrSizePreset, setQrSizePreset] = useState<'small' | 'normal' | 'large'>('normal');

  // Load / save layout settings
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.printOrientation) setPrintOrientation(parsed.printOrientation);
        if (typeof parsed.isRotated180 === 'boolean') setIsRotated180(parsed.isRotated180);
        if (typeof parsed.showProductName === 'boolean') setShowProductName(parsed.showProductName);
        if (typeof parsed.showSize === 'boolean') setShowSize(parsed.showSize);
        if (typeof parsed.showPrice === 'boolean') setShowPrice(parsed.showPrice);
        if (typeof parsed.showCurrencyPrefix === 'boolean') setShowCurrencyPrefix(parsed.showCurrencyPrefix);
        if (typeof parsed.showLocation === 'boolean') setShowLocation(parsed.showLocation);
        if (parsed.qrSizePreset) setQrSizePreset(parsed.qrSizePreset);
      }
    } catch (e) {
      console.error('Failed to read settings', e);
    }
  }, []);

  const saveSettings = (newSettings: Record<string, unknown>) => {
    try {
      const current = {
        printOrientation,
        isRotated180,
        showProductName,
        showSize,
        showPrice,
        showCurrencyPrefix,
        showLocation,
        qrSizePreset,
        ...newSettings,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  // -------------------------------------------------------------
  // 3. STATE: Tab Input & Form Manual
  // -------------------------------------------------------------
  const [activeInputTab, setActiveInputTab] = useState<'catalog' | 'manual' | 'import'>('catalog');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [formSku, setFormSku] = useState<string>('');
  const [formNama, setFormNama] = useState<string>('');
  const [formSize, setFormSize] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formLokasi, setFormLokasi] = useState<string>('');
  const [formCopies, setFormCopies] = useState<number>(1);

  // -------------------------------------------------------------
  // 4. STATE: Import Massal (Excel / CSV / Paste)
  // -------------------------------------------------------------
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState<string>('');
  const [importPreviewList, setImportPreviewList] = useState<ProductBarcodeItem[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------
  // 5. STATE: QR Code Cache & Preview Slider
  // -------------------------------------------------------------
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [queueSearchQuery, setQueueSearchQuery] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter master catalog for instant search
  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim() || !productCatalog.length) return [];
    const query = catalogSearch.toLowerCase().trim();
    return productCatalog
      .filter((p) => {
        const sku = String(p.k || '').toLowerCase();
        const nama = String(p.n || p.p || '').toLowerCase();
        const size = String(p.s || '').toLowerCase();
        const lokasi = String(p.lokasi || '').toLowerCase();
        return (
          sku.includes(query) ||
          nama.includes(query) ||
          size.includes(query) ||
          lokasi.includes(query)
        );
      })
      .slice(0, 20); // Top 20 results
  }, [catalogSearch, productCatalog]);

  // Catalog lookup map for lightning enrichment & price detection
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    productCatalog.forEach((p) => {
      if (p.k) map.set(p.k.toLowerCase().trim(), p);
    });
    return map;
  }, [productCatalog]);

  // Auto-enrich existing queue items with master product price and details
  useEffect(() => {
    if (!catalogMap.size) return;
    setQueue((prevQueue) => {
      let changed = false;
      const next = prevQueue.map((item) => {
        const match = catalogMap.get(item.sku.toLowerCase().trim());
        if (!match) return item;
        const masterPrice = getProductMasterPrice(match);
        let updated = false;
        const copy = { ...item };
        if ((!copy.price || copy.price === 0) && masterPrice > 0) {
          copy.price = masterPrice;
          updated = true;
        }
        if ((!copy.nama || copy.nama === copy.sku) && (match.n || match.p || match.nama_produk)) {
          copy.nama = String(match.n || match.p || match.nama_produk);
          updated = true;
        }
        if (!copy.size && isRealSize(match.s || match.size)) {
          copy.size = String(match.s || match.size).trim();
          updated = true;
        }
        if (updated) changed = true;
        return copy;
      });
      return changed ? next : prevQueue;
    });
  }, [catalogMap]);

  // Handler for SKU input change: auto-lookup catalog
  const handleSkuChange = (val: string) => {
    setFormSku(val);
    const clean = val.trim().toLowerCase();
    if (clean && catalogMap.has(clean)) {
      const p = catalogMap.get(clean)!;
      if (!formNama || formNama === formSku) {
        setFormNama(String(p.n || p.p || p.nama_produk || ''));
      }
      const sz = String(p.s || p.size || '').trim();
      if (isRealSize(sz)) {
        setFormSize(sz);
      }
      const mp = getProductMasterPrice(p);
      if (mp > 0 && !formPrice) {
        setFormPrice(String(mp));
      }
      if (p.lokasi && !formLokasi) {
        setFormLokasi(String(p.lokasi));
      }
    }
  };

  // Generate QR Code data URL helper
  const generateQrDataUrl = async (text: string): Promise<string> => {
    if (!text) return '';
    if (qrCache[text]) return qrCache[text];
    try {
      const url = await QRCode.toDataURL(text, {
        width: 240,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      setQrCache((prev) => ({ ...prev, [text]: url }));
      return url;
    } catch (err) {
      console.error('Error creating QR Code:', err);
      return '';
    }
  };

  // Generate QR for items in queue & preview
  useEffect(() => {
    const skusToGenerate = new Set<string>();
    if (formSku.trim()) skusToGenerate.add(formSku.trim());
    queue.forEach((item) => {
      if (item.sku) skusToGenerate.add(item.sku);
    });
    importPreviewList.forEach((item) => {
      if (item.sku) skusToGenerate.add(item.sku);
    });

    skusToGenerate.forEach((sku) => {
      if (!qrCache[sku]) {
        generateQrDataUrl(sku);
      }
    });
  }, [queue, formSku, importPreviewList]);

  // -------------------------------------------------------------
  // 6. ACTION: Select product from master catalog
  // -------------------------------------------------------------
  const handleSelectFromCatalog = (product: ProductItem) => {
    setFormSku(product.k || '');
    setFormNama(String(product.n || product.p || product.nama_produk || ''));
    const cleanSz = String(product.s || product.size || '').trim();
    setFormSize(isRealSize(cleanSz) ? cleanSz : '');
    const rawPrice = getProductMasterPrice(product);
    setFormPrice(rawPrice > 0 ? String(rawPrice) : '');
    setFormLokasi(String(product.lokasi || ''));
    setIsSearchDropdownOpen(false);
    setCatalogSearch('');
  };

  // -------------------------------------------------------------
  // 7. ACTION: Add item to queue
  // -------------------------------------------------------------
  const handleAddToQueue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanSku = formSku.trim();
    if (!cleanSku) {
      onShowToast?.('Harap masukkan atau pilih SKU Produk terlebih dahulu!', 'error');
      return;
    }

    const copiesCount = Math.max(1, formCopies || 1);
    const catalogHit = catalogMap.get(cleanSku.toLowerCase());
    const masterPrice = getProductMasterPrice(catalogHit);
    const inputPrice = parseRawPrice(formPrice);
    // Prioritaskan input jika diisi, jika tidak gunakan otomatis dari master data
    const finalPrice = inputPrice > 0 ? inputPrice : (masterPrice > 0 ? masterPrice : undefined);

    const resolvedNama = formNama.trim() || (catalogHit ? String(catalogHit.n || catalogHit.p || catalogHit.nama_produk || '') : 'Produk ' + cleanSku);
    const resolvedSize = isRealSize(formSize)
      ? formSize.trim()
      : (catalogHit && isRealSize(catalogHit.s || catalogHit.size) ? String(catalogHit.s || catalogHit.size).trim() : '');
    const resolvedLokasi = formLokasi.trim() || (catalogHit ? String(catalogHit.lokasi || '') : '');

    // Cek apakah SKU sudah ada dalam antrean
    const existingIndex = queue.findIndex((item) => item.sku.toLowerCase() === cleanSku.toLowerCase());

    if (existingIndex >= 0) {
      // Update copies
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                copies: item.copies + copiesCount,
                nama: resolvedNama || item.nama,
                size: resolvedSize || item.size,
                price: finalPrice || item.price,
                lokasi: resolvedLokasi || item.lokasi,
              }
            : item
        )
      );
      onShowToast?.(`Berhasil menambahkan ${copiesCount} lembar stiker untuk SKU ${cleanSku}`, 'success');
    } else {
      const newItem: ProductBarcodeItem = {
        id: 'BC-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        sku: cleanSku,
        nama: resolvedNama,
        size: resolvedSize,
        price: finalPrice,
        lokasi: resolvedLokasi,
        copies: copiesCount,
        selected: true,
      };
      setQueue((prev) => [newItem, ...prev]);
      onShowToast?.(`Berhasil memasukkan SKU ${cleanSku} ke antrean cetak (${copiesCount} pcs)`, 'success');
    }

    // Reset form field
    setFormSku('');
    setFormNama('');
    setFormSize('');
    setFormPrice('');
    setFormLokasi('');
    setFormCopies(1);
  };

  // -------------------------------------------------------------
  // 8. ACTION: Queue Table Handlers (Select, Copies, Delete)
  // -------------------------------------------------------------
  const handleToggleSelect = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setQueue((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleUpdateCopies = (id: string, delta: number) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = Math.max(1, item.copies + delta);
          return { ...item, copies: updated };
        }
        return item;
      })
    );
  };

  const handleSetCopies = (id: string, value: number) => {
    const valid = Math.max(1, value || 1);
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, copies: valid } : item))
    );
  };

  const handleDeleteItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDeleteSelected = () => {
    const count = queue.filter((item) => item.selected).length;
    if (count === 0) {
      onShowToast?.('Tidak ada item yang dipilih untuk dihapus.', 'info');
      return;
    }
    setQueue((prev) => prev.filter((item) => !item.selected));
    onShowToast?.(`${count} item dihapus dari antrean cetak.`, 'info');
  };

  const handleClearQueue = () => {
    if (queue.length === 0) return;
    if (window.confirm('Yakin ingin mengosongkan semua antrean cetak barcode?')) {
      setQueue([]);
      onShowToast?.('Antrean cetak barcode telah dikosongkan.', 'info');
    }
  };

  // -------------------------------------------------------------
  // 9. FILTER & COMPUTED VALUES
  // -------------------------------------------------------------
  const filteredQueue = useMemo(() => {
    if (!queueSearchQuery.trim()) return queue;
    const q = queueSearchQuery.toLowerCase().trim();
    return queue.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        (item.size && item.size.toLowerCase().includes(q)) ||
        (item.lokasi && item.lokasi.toLowerCase().includes(q))
    );
  }, [queue, queueSearchQuery]);

  const selectedItems = useMemo(() => {
    return queue.filter((item) => item.selected !== false);
  }, [queue]);

  const totalSelectedCopies = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + (item.copies || 1), 0);
  }, [selectedItems]);

  const totalAllCopies = useMemo(() => {
    return queue.reduce((acc, item) => acc + (item.copies || 1), 0);
  }, [queue]);

  const currentPreviewItem: ProductBarcodeItem | null = useMemo(() => {
    if (formSku.trim()) {
      const match = catalogMap.get(formSku.trim().toLowerCase());
      const mp = getProductMasterPrice(match);
      const pr = parseRawPrice(formPrice) || (mp > 0 ? mp : 500000);
      const cleanSz = formSize.trim() || (match && isRealSize(match.s || match.size) ? String(match.s || match.size).trim() : '');
      return {
        id: 'preview-form',
        sku: formSku.trim(),
        nama: formNama.trim() || (match ? String(match.n || match.p || match.nama_produk || '') : 'Taylor Pants Dark Denim'),
        size: isRealSize(cleanSz) ? cleanSz : '',
        price: pr,
        lokasi: formLokasi.trim() || (match ? String(match.lokasi || '') : ''),
        copies: formCopies || 1,
      };
    }
    if (selectedItems.length > 0) {
      const safeIndex = Math.min(Math.max(0, previewIndex), selectedItems.length - 1);
      const item = selectedItems[safeIndex];
      const match = catalogMap.get(item.sku.toLowerCase());
      const mp = getProductMasterPrice(match);
      return {
        ...item,
        nama: item.nama || (match ? String(match.n || match.p || match.nama_produk || '') : item.sku),
        size: isRealSize(item.size) ? item.size : (match && isRealSize(match.s || match.size) ? String(match.s || match.size).trim() : ''),
        price: item.price || (mp > 0 ? mp : undefined),
      };
    }
    if (queue.length > 0) {
      const safeIndex = Math.min(Math.max(0, previewIndex), queue.length - 1);
      const item = queue[safeIndex];
      const match = catalogMap.get(item.sku.toLowerCase());
      const mp = getProductMasterPrice(match);
      return {
        ...item,
        nama: item.nama || (match ? String(match.n || match.p || match.nama_produk || '') : item.sku),
        size: isRealSize(item.size) ? item.size : (match && isRealSize(match.s || match.size) ? String(match.s || match.size).trim() : ''),
        price: item.price || (mp > 0 ? mp : undefined),
      };
    }
    return {
      id: 'default-preview',
      sku: 'F25JBF310DBM',
      nama: 'Taylor Pants Dark Denim',
      size: 'M',
      price: 500000,
      lokasi: 'RAK-A01',
      copies: 1,
    };
  }, [formSku, formNama, formSize, formPrice, formLokasi, formCopies, selectedItems, queue, previewIndex, catalogMap]);

  // -------------------------------------------------------------
  // 10. IMPORT LOGIC: EXCEL / CSV & CLIPBOARD
  // -------------------------------------------------------------
  const parseRawRows = (rows: any[]): ProductBarcodeItem[] => {
    const parsed: ProductBarcodeItem[] = [];

    rows.forEach((row, idx) => {
      let rawSku = '';
      let rawQty = 1;
      let rawNama = '';
      let rawSize = '';
      let rawPrice = 0;
      let rawLokasi = '';

      if (Array.isArray(row)) {
        // Flat Array format
        rawSku = String(row[0] || '').trim();
        rawQty = parseInt(row[1], 10) || 1;
        rawNama = String(row[2] || '').trim();
        rawSize = String(row[3] || '').trim();
        if (row[4] !== undefined) rawPrice = parseRawPrice(row[4]);
        if (row[5] !== undefined) rawLokasi = String(row[5] || '').trim();
        else if (isNaN(rawPrice) || rawPrice === 0) {
          // If col 4 was text (lokasi)
          if (typeof row[4] === 'string' && isNaN(Number(row[4]))) {
            rawLokasi = row[4];
            rawPrice = 0;
          }
        }
      } else if (typeof row === 'object' && row !== null) {
        // Object with headers
        for (const [key, val] of Object.entries(row)) {
          const k = key.toLowerCase().trim().replace(/[\s_-]+/g, '');
          const v = String(val ?? '').trim();
          if (['sku', 'kode', 'barcode', 'itemcode', 'kodeproduk', 'kodebarang'].includes(k)) {
            rawSku = v;
          } else if (['qty', 'jumlah', 'pcs', 'copies', 'total', 'lembar', 'quantity'].includes(k)) {
            rawQty = parseInt(v, 10) || 1;
          } else if (['nama', 'name', 'namaproduk', 'productname', 'deskripsi', 'itemname'].includes(k)) {
            rawNama = v;
          } else if (['size', 'ukuran', 'sz', 'variasi', 'variant'].includes(k)) {
            rawSize = v;
          } else if (['price', 'harga', 'hargaproduk', 'productprice', 'retailprice', 'sellprice', 'sellingprice', 'rp', 'hargajual'].includes(k)) {
            rawPrice = parseRawPrice(v);
          } else if (['lokasi', 'rak', 'location', 'bin', 'rack'].includes(k)) {
            rawLokasi = v;
          }
        }
      }

      if (!rawSku) return;

      // Auto enrich from catalog if nama/size/price/lokasi is missing
      const catalogHit = catalogMap.get(rawSku.toLowerCase());
      if (catalogHit) {
        if (!rawNama) rawNama = String(catalogHit.n || catalogHit.p || catalogHit.nama_produk || '');
        if (!rawSize && isRealSize(catalogHit.s || catalogHit.size)) {
          rawSize = String(catalogHit.s || catalogHit.size);
        }
        if (!rawPrice || rawPrice <= 0) {
          rawPrice = getProductMasterPrice(catalogHit);
        }
        if (!rawLokasi) rawLokasi = String(catalogHit.lokasi || '');
      }

      parsed.push({
        id: 'IMP-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 100),
        sku: rawSku,
        nama: rawNama || rawSku,
        size: isRealSize(rawSize) ? rawSize : '',
        price: rawPrice > 0 ? rawPrice : undefined,
        lokasi: rawLokasi,
        copies: Math.max(1, rawQty || 1),
        selected: true,
      });
    });

    return parsed;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setIsImporting(true);

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          const items = parseRawRows(data);
          setImportPreviewList(items);
          setIsImportModalOpen(true);
          onShowToast?.(`Berhasil membaca ${items.length} baris dari file Excel.`, 'success');
        } catch (err) {
          console.error('Failed to parse Excel', err);
          onShowToast?.('Gagal membaca file Excel. Pastikan format valid.', 'error');
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // CSV
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const items = parseRawRows(results.data);
          setImportPreviewList(items);
          setIsImportModalOpen(true);
          setIsImporting(false);
          onShowToast?.(`Berhasil membaca ${items.length} baris dari file CSV.`, 'success');
        },
        error: (err) => {
          console.error('Failed to parse CSV', err);
          onShowToast?.('Gagal membaca file CSV.', 'error');
          setIsImporting(false);
        },
      });
    }

    // Reset input
    e.target.value = '';
  };

  const handleProcessPasteText = () => {
    if (!pasteText.trim()) {
      onShowToast?.('Silakan paste data tabel terlebih dahulu.', 'info');
      return;
    }

    const lines = pasteText.trim().split(/\r?\n/);
    const rows = lines.map((line) => {
      if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
      if (line.includes(',')) return line.split(',').map((c) => c.trim());
      if (line.includes(';')) return line.split(';').map((c) => c.trim());
      return line.split(/\s{2,}/).map((c) => c.trim());
    });

    // Check if row 0 is header
    const firstRowStr = rows[0]?.join(' ').toLowerCase() || '';
    const hasHeader =
      firstRowStr.includes('sku') ||
      firstRowStr.includes('kode') ||
      firstRowStr.includes('qty') ||
      firstRowStr.includes('nama');

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const items = parseRawRows(dataRows);

    if (items.length === 0) {
      onShowToast?.('Tidak ada baris data valid yang ditemukan.', 'error');
      return;
    }

    setImportPreviewList(items);
    setIsImportModalOpen(true);
    onShowToast?.(`Berhasil membaca ${items.length} baris dari clipboard.`, 'success');
  };

  const handleCommitImport = () => {
    if (importPreviewList.length === 0) return;

    // Merge into existing queue
    setQueue((prevQueue) => {
      const updatedQueue = [...prevQueue];

      importPreviewList.forEach((imported) => {
        const idx = updatedQueue.findIndex(
          (q) => q.sku.toLowerCase() === imported.sku.toLowerCase()
        );
        if (idx >= 0) {
          updatedQueue[idx] = {
            ...updatedQueue[idx],
            copies: updatedQueue[idx].copies + imported.copies,
            nama: imported.nama || updatedQueue[idx].nama,
            size: imported.size || updatedQueue[idx].size,
            price: imported.price || updatedQueue[idx].price,
            lokasi: imported.lokasi || updatedQueue[idx].lokasi,
            selected: true,
          };
        } else {
          updatedQueue.push(imported);
        }
      });

      return updatedQueue;
    });

    const totalAdded = importPreviewList.reduce((acc, i) => acc + i.copies, 0);
    onShowToast?.(`Sukses menambahkan ${importPreviewList.length} SKU (${totalAdded} lembar stiker) ke antrean!`, 'success');
    setIsImportModalOpen(false);
    setImportPreviewList([]);
    setPasteText('');
  };

  const handleDownloadExcelTemplate = () => {
    const templateData = [
      {
        SKU: 'F25JBF310DBM',
        'Nama Produk': 'Taylor Pants Dark Denim',
        Size: 'M',
        Harga: 500000,
        Qty: 10,
        Lokasi: 'RAK-A01',
      },
      {
        SKU: 'F25JBF310DBL',
        'Nama Produk': 'Taylor Pants Dark Denim',
        Size: 'L',
        Harga: 500000,
        Qty: 15,
        Lokasi: 'RAK-A01',
      },
      {
        SKU: 'TSH-CTN-BLK-XL',
        'Nama Produk': 'Kaos Cotton Combed 30s',
        Size: 'XL',
        Harga: 125000,
        Qty: 8,
        Lokasi: 'RAK-D04',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Barcode');
    XLSX.writeFile(wb, 'Template_Cetak_Barcode_Produk_50x20.xlsx');
    onShowToast?.('Template Excel berhasil diunduh.', 'success');
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent =
      'SKU,Nama Produk,Size,Harga,Qty,Lokasi\n' +
      'F25JBF310DBM,Taylor Pants Dark Denim,M,500000,10,RAK-A01\n' +
      'F25JBF310DBL,Taylor Pants Dark Denim,L,500000,15,RAK-A01\n' +
      'TSH-CTN-BLK-XL,Kaos Cotton Combed 30s,XL,125000,8,RAK-D04\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Template_Cetak_Barcode_Produk_50x20.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast?.('Template CSV berhasil diunduh.', 'success');
  };

  // -------------------------------------------------------------
  // 11. PRINT ENGINE: HIGH-SPEED ISOLATED IFRAME FOR 50×20 MM
  // -------------------------------------------------------------
  const handlePrintBarcodes = async () => {
    const itemsToPrint = selectedItems;
    if (itemsToPrint.length === 0) {
      onShowToast?.('Pilih setidaknya 1 item stiker untuk dicetak!', 'error');
      return;
    }

    setIsPrinting(true);

    try {
      // 1. Ensure all QR images are ready in cache
      const qrDataMap: Record<string, string> = { ...qrCache };
      for (const item of itemsToPrint) {
        if (!qrDataMap[item.sku]) {
          qrDataMap[item.sku] = await generateQrDataUrl(item.sku);
        }
      }

      // 2. Prepare isolated print iframe
      const oldFrame = document.getElementById('barcode-product-print-frame');
      if (oldFrame) oldFrame.remove();

      const printFrame = document.createElement('iframe');
      printFrame.id = 'barcode-product-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';

      const isPortrait = printOrientation === 'portrait';
      const pageW = isPortrait ? '20mm' : '50mm';
      const pageH = isPortrait ? '50mm' : '20mm';
      const orientMode = isPortrait ? 'portrait' : 'landscape';

      printFrame.style.width = pageW;
      printFrame.style.height = pageH;
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      // 3. Build HTML pages for each copy
      let pagesHtml = '';

      for (const item of itemsToPrint) {
        const copies = Math.max(1, item.copies || 1);
        const qrUrl = qrDataMap[item.sku] || '';

        const qrImgTag = qrUrl
          ? `<img src="${qrUrl}" alt="QR" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; display: block;" />`
          : `<div style="font-size: 8px; font-weight: bold; text-align: center;">${item.sku}</div>`;

        // Parse nama produk & deteksi kategori + varian
        const parsed = parseBarcodeProductInfo(item.nama, item.size, showProductName, showSize);
        const titleTypo = getTitleTypography(parsed.titleLine, isPortrait);
        const variantTypo = getVariantTypography(parsed.variantLine, isPortrait);

        const titleStyle = `font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: ${titleTypo.fontSize} !important; font-weight: 600 !important; line-height: ${titleTypo.lineHeight} !important; letter-spacing: -0.05px !important;`;
        const variantStyle = `font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: ${variantTypo.fontSize} !important; font-weight: 600 !important; line-height: ${variantTypo.lineHeight} !important; letter-spacing: -0.05px !important;`;

        const titleHtml = parsed.titleLine
          ? `<div class="thermal-line-title" style="${titleStyle}" title="${escapeHtml(parsed.titleLine)}">${escapeHtml(parsed.titleLine)}</div>`
          : '';

        const variantHtml = parsed.variantLine
          ? `<div class="thermal-line-variant" style="${variantStyle}" title="${escapeHtml(parsed.variantLine)}">${escapeHtml(parsed.variantLine)}</div>`
          : '';

        // Row 3: SKU (Lebih kecil dari Nama & Harga)
        const skuText = escapeHtml(item.sku);
        const locHtml = showLocation && item.lokasi
          ? `<span class="thermal-loc-badge">[${escapeHtml(item.lokasi)}]</span>`
          : '';

        // Row 4: HARGA PRODUK (Otomatis dari item/master, font Quicksand Rounded 700)
        const resolvedPrice = item.price || getProductMasterPrice(catalogMap.get(item.sku.toLowerCase()));
        const priceFormatted = formatProductPrice(resolvedPrice, showCurrencyPrefix);
        const priceHtml = showPrice && priceFormatted
          ? `<div class="thermal-line-price">${escapeHtml(priceFormatted)}</div>`
          : '';

        for (let c = 0; c < copies; c++) {
          pagesHtml += `
            <div class="thermal-page-wrapper">
              <div class="thermal-page-inner">
                <div class="thermal-qr-container">
                  ${qrImgTag}
                </div>
                <div class="thermal-info-container">
                  ${titleHtml}
                  ${variantHtml}
                  <div class="thermal-line-sku">${skuText} ${locHtml}</div>
                  ${priceHtml}
                </div>
              </div>
            </div>
          `;
        }
      }

      // QR size dynamic calculation (dioptimalkan 13.5mm di lanskap agar teks nama produk leluasa dan ada margin 1mm dari tepi kertas)
      const qrDim = isPortrait
        ? qrSizePreset === 'large' ? '14.0mm' : qrSizePreset === 'small' ? '11.5mm' : '13.0mm'
        : qrSizePreset === 'large' ? '14.8mm' : qrSizePreset === 'small' ? '12.2mm' : '13.5mm';

      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Cetak Barcode Produk 50x20mm</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');
              @page {
                size: ${pageW} ${pageH} ${orientMode};
                margin: 0mm !important;
              }
              *, *::before, *::after {
                box-sizing: border-box !important;
                margin: 0;
                padding: 0;
              }
              html, body {
                width: ${pageW} !important;
                height: ${pageH} !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .thermal-page-wrapper {
                display: block !important;
                position: relative !important;
                width: ${pageW} !important;
                height: ${pageH} !important;
                max-width: ${pageW} !important;
                max-height: ${pageH} !important;
                page-break-before: auto !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-before: auto !important;
                break-after: page !important;
                break-inside: avoid !important;
                overflow: hidden !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                ${isRotated180 ? 'transform: rotate(180deg); transform-origin: center center;' : ''}
              }
              .thermal-page-inner {
                width: ${pageW} !important;
                height: ${pageH} !important;
                max-width: ${pageW} !important;
                max-height: ${pageH} !important;
                box-sizing: border-box !important;
                padding: ${isPortrait ? '1.5mm 1.0mm' : '1.0mm 1.5mm'} !important;
                display: flex !important;
                flex-direction: ${isPortrait ? 'column' : 'row'} !important;
                align-items: center !important;
                justify-content: ${isPortrait ? 'center' : 'flex-start'} !important;
                overflow: hidden !important;
                background: #ffffff !important;
                color: #000000 !important;
              }
              .thermal-qr-container {
                width: ${qrDim} !important;
                height: ${qrDim} !important;
                margin-right: ${isPortrait ? '0' : '1.5mm'} !important;
                margin-bottom: ${isPortrait ? '0.8mm' : '0'} !important;
                flex-shrink: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: #ffffff !important;
              }
              .thermal-info-container {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                overflow: hidden !important;
                padding-right: 0.5mm !important;
                ${isPortrait ? 'text-align: center; width: 100%;' : 'text-align: left;'}
              }
              .thermal-line-title {
                font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                font-size: ${isPortrait ? '7.6pt' : '9.2pt'} !important;
                font-weight: 600 !important;
                line-height: 1.15 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                color: #000000 !important;
                letter-spacing: -0.05px !important;
              }
              .thermal-line-variant {
                font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                font-size: ${isPortrait ? '7.0pt' : '8.4pt'} !important;
                font-weight: 600 !important;
                line-height: 1.15 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                color: #111111 !important;
                letter-spacing: -0.05px !important;
                margin-bottom: 0.15mm !important;
              }
              .thermal-line-sku {
                font-size: ${isPortrait ? '6.0pt' : '7.0pt'} !important;
                font-weight: 600 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                color: #222222 !important;
                line-height: 1.1 !important;
                margin: 0.2mm 0 !important;
                letter-spacing: 0px !important;
              }
              .thermal-line-price {
                font-family: 'Quicksand', sans-serif !important;
                font-size: ${isPortrait ? '10.0pt' : '12.0pt'} !important;
                font-weight: 700 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                color: #000000 !important;
                line-height: 1.05 !important;
                letter-spacing: -0.1px !important;
              }
              .thermal-loc-badge {
                font-family: 'Quicksand', sans-serif !important;
                font-size: 5.6pt !important;
                font-weight: 600 !important;
                margin-left: 2px !important;
                color: #444444 !important;
              }
            </style>
          </head>
          <body>
            ${pagesHtml}
          </body>
        </html>
      `;

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (!frameDoc) {
        throw new Error('Gagal mengakses frame cetak');
      }

      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();

      setTimeout(() => {
        try {
          const win = printFrame.contentWindow;
          if (win) {
            win.focus();
            win.print();
          }
        } catch (err) {
          console.error('Trigger print error:', err);
          window.print();
        } finally {
          setIsPrinting(false);
          setTimeout(() => {
            printFrame.remove();
          }, 3000);
        }
      }, 350);
    } catch (err) {
      console.error('Print execution failed:', err);
      setIsPrinting(false);
      onShowToast?.('Gagal menjalankan proses cetak printer.', 'error');
    }
  };

  function escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* ========================================================= */}
      {/* 1. HEADER SECTION & QUICK ACTIONS                         */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-3 bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-200 dark:border-purple-800">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Cetak Barcode Produk (50×20 mm)
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-extrabold uppercase bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full">
                  Thermal Label
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Modul pencetakan stiker barcode (QR Code) produk satuan &amp; massal via upload Excel / CSV.
              </p>
            </div>
          </div>

          {/* Quick Stat Badges & Print Action */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-center">
              <div className="text-[11px] font-bold text-slate-500">Antrean SKU</div>
              <div className="text-base font-black text-slate-900 dark:text-white">
                {queue.length} <span className="text-xs font-semibold text-slate-400">item</span>
              </div>
            </div>

            <div className="px-3.5 py-2 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/60 rounded-xl text-center">
              <div className="text-[11px] font-bold text-purple-600 dark:text-purple-300">Total Stiker</div>
              <div className="text-base font-black text-purple-700 dark:text-purple-300">
                {totalSelectedCopies}{' '}
                <span className="text-xs font-semibold text-purple-500/80">/ {totalAllCopies} pcs</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrintBarcodes}
              disabled={selectedItems.length === 0 || isPrinting}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Menyiapkan...' : `Cetak ${totalSelectedCopies} Stiker`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. DUA KOLOM: INPUT PRODUK & PREVIEW STIKER 50×20 MM      */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left Column: Mode Input Form & Import Tabs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            {/* Input Navigation Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 p-1.5 gap-1">
              <button
                type="button"
                onClick={() => setActiveInputTab('catalog')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeInputTab === 'catalog'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Search className="w-4 h-4" />
                <span>Pilih dari Master Katalog</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveInputTab('import')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeInputTab === 'import'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Import Massal (Excel / CSV)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveInputTab('manual')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeInputTab === 'manual'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Input Manual</span>
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* TAB 1: CARI DARI MASTER KATALOG */}
              {activeInputTab === 'catalog' && (
                <div className="space-y-4">
                  <div className="relative" ref={searchContainerRef}>
                    <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Cari SKU / Nama Baju / Size / Lokasi Rak
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => {
                          setCatalogSearch(e.target.value);
                          setIsSearchDropdownOpen(true);
                        }}
                        onFocus={() => setIsSearchDropdownOpen(true)}
                        placeholder="Ketik SKU (cth: TSH-BLK) atau nama baju..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      />
                    </div>

                    {/* Autocomplete Dropdown */}
                    {isSearchDropdownOpen && filteredCatalog.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredCatalog.map((prod, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSelectFromCatalog(prod)}
                            className="p-3 hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-slate-900 dark:text-white truncate">
                                {prod.k}
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 truncate">
                                {prod.n || prod.p || 'Tanpa nama'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {prod.s && (
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold">
                                  {prod.s}
                                </span>
                              )}
                              {prod.lokasi && (
                                <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded font-bold">
                                  {prod.lokasi}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Form Detail Setelah Dipilih */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] font-bold text-slate-500">SKU Terpilih:</span>
                        <input
                          type="text"
                          value={formSku}
                          onChange={(e) => handleSkuChange(e.target.value)}
                          placeholder="Pilih dari pencarian di atas atau ketik..."
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-500">Nama Produk:</span>
                        <input
                          type="text"
                          value={formNama}
                          onChange={(e) => setFormNama(e.target.value)}
                          placeholder="Nama baju / produk..."
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-500">Size / Ukuran:</span>
                        <input
                          type="text"
                          value={formSize}
                          onChange={(e) => setFormSize(e.target.value)}
                          placeholder="cth: S, M, L, XL, All Size"
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-500">Harga Produk (Rp):</span>
                          {(() => {
                            const match = catalogMap.get(formSku.trim().toLowerCase());
                            const mp = getProductMasterPrice(match);
                            return mp > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                ✓ Master Data
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <input
                          type="text"
                          value={formPrice}
                          onChange={(e) => setFormPrice(e.target.value)}
                          placeholder={(() => {
                            const match = catalogMap.get(formSku.trim().toLowerCase());
                            const mp = getProductMasterPrice(match);
                            return mp > 0 ? formatProductPrice(mp, true) : 'Otomatis dari master data produk...';
                          })()}
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-black text-purple-700 dark:text-purple-300"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[11px] font-bold text-slate-500">Lokasi Rak (Opsional):</span>
                        <input
                          type="text"
                          value={formLokasi}
                          onChange={(e) => setFormLokasi(e.target.value)}
                          placeholder="cth: A-01, RAK-B2"
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Copies Counter & Add Button */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">Jumlah Cetak:</span>
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setFormCopies((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-black cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={formCopies}
                            onChange={(e) => setFormCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="w-12 text-center text-xs font-black bg-transparent text-slate-900 dark:text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFormCopies((p) => p + 1)}
                            className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-black cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick preset copies */}
                        <div className="flex items-center gap-1">
                          {[5, 10, 25].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setFormCopies(amt)}
                              className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-purple-100 text-slate-700 dark:text-slate-300 rounded cursor-pointer"
                            >
                              +{amt}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddToQueue()}
                        disabled={!formSku.trim()}
                        className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Masukkan Antrean ({formCopies} Lembar)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: IMPORT MASSAL VIA EXCEL / CSV / PASTE */}
              {activeInputTab === 'import' && (
                <div className="space-y-4">
                  {/* Drag & Drop File Box */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-purple-300 dark:border-purple-800/80 hover:border-purple-500 dark:hover:border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 rounded-2xl p-5 text-center cursor-pointer transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Klik untuk Pilih File Excel (.xlsx, .xls) atau CSV
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                      Kolom otomatis terdeteksi: <b>SKU</b>, <b>Qty</b> (Jumlah Stiker), <b>Nama Produk</b>, <b>Size</b>, dan <b>Lokasi</b>.
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 rounded-lg text-xs font-bold text-purple-600 dark:text-purple-400">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Pilih Dokumen dari Komputer / HP</span>
                    </div>
                  </div>

                  {/* Clipboard Quick Paste Area */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <ClipboardPaste className="w-4 h-4 text-purple-500" />
                        <span>Atau Paste Data dari Clipboard / Salinan Excel:</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setPasteText('')}
                        className="text-[11px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                      >
                        Bersihkan
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Contoh format per baris:&#10;TSH-BLK-M    10    Kaos Hitam    M&#10;TSH-BLK-L    15    Kaos Hitam    L"
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleProcessPasteText}
                        disabled={!pasteText.trim()}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        Proses Teks Clipboard
                      </button>
                    </div>
                  </div>

                  {/* Download Templates Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 text-xs">
                    <span className="text-slate-500 font-medium">Contoh Format Excel / CSV:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadExcelTemplate}
                        className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors cursor-pointer text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh Format .xlsx</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsvTemplate}
                        className="px-3 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-lg font-bold flex items-center gap-1.5 hover:bg-blue-100 transition-colors cursor-pointer text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh .csv</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: INPUT MANUAL CEPAT */}
              {activeInputTab === 'manual' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Kode SKU Barcode <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formSku}
                        onChange={(e) => handleSkuChange(e.target.value)}
                        placeholder="cth: F25JBF310DBM"
                        className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Nama Produk
                      </label>
                      <input
                        type="text"
                        value={formNama}
                        onChange={(e) => setFormNama(e.target.value)}
                        placeholder="cth: Taylor Pants Dark Denim"
                        className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Size / Ukuran
                      </label>
                      <input
                        type="text"
                        value={formSize}
                        onChange={(e) => setFormSize(e.target.value)}
                        placeholder="cth: M, L, XL"
                        className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Harga Produk (Rp)
                        </label>
                        {(() => {
                          const match = catalogMap.get(formSku.trim().toLowerCase());
                          const mp = getProductMasterPrice(match);
                          return mp > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              ✓ Master Data
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <input
                        type="text"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        placeholder={(() => {
                          const match = catalogMap.get(formSku.trim().toLowerCase());
                          const mp = getProductMasterPrice(match);
                          return mp > 0 ? formatProductPrice(mp, true) : 'Otomatis dari master data produk...';
                        })()}
                        className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-black text-purple-700 dark:text-purple-300"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Lokasi Rak (Opsional)
                      </label>
                      <input
                        type="text"
                        value={formLokasi}
                        onChange={(e) => setFormLokasi(e.target.value)}
                        placeholder="cth: RAK-ETALASE"
                        className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">Jumlah Cetak:</span>
                      <input
                        type="number"
                        min="1"
                        value={formCopies}
                        onChange={(e) => setFormCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-16 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center text-xs font-black text-slate-900 dark:text-white"
                      />
                      <span className="text-xs text-slate-400">lembar</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddToQueue()}
                      disabled={!formSku.trim()}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Tambah ke Antrean</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Realistic Preview & Settings (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Pratinjau Fisik Stiker (50 × 20 mm)
                </h3>
              </div>

              {selectedItems.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                    disabled={previewIndex === 0}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Item Sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-bold text-purple-600">
                    {previewIndex + 1} / {selectedItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((p) => Math.min(selectedItems.length - 1, p + 1))}
                    disabled={previewIndex >= selectedItems.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Item Berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Controls: Orientasi Cetak & Putar 180 */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 rounded-xl text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-700 dark:text-slate-300">Orientasi:</span>
                <div className="inline-flex rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOrientation('landscape');
                      saveSettings({ printOrientation: 'landscape' });
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                      printOrientation === 'landscape'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    ↔️ Lanskap (50×20)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOrientation('portrait');
                      saveSettings({ printOrientation: 'portrait' });
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                      printOrientation === 'portrait'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    ↕️ Portret (20×50)
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !isRotated180;
                  setIsRotated180(next);
                  saveSettings({ isRotated180: next });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-all ${
                  isRotated180
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
                title="Putar balik 180 derajat jika label terpasang terbalik"
              >
                <RotateCw className={`w-3 h-3 ${isRotated180 ? 'rotate-180' : ''}`} />
                <span>Putar 180°</span>
              </button>
            </div>

            {/* Realistic Thermal Sticker Representation */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
              {currentPreviewItem ? (
                <div
                  className={`bg-white text-black p-2.5 rounded shadow-md border border-slate-300 select-none font-sans relative overflow-hidden transition-all ${
                    printOrientation === 'portrait'
                      ? 'w-[140px] h-[260px] flex flex-col items-center justify-center text-center'
                      : 'w-[285px] h-[114px] flex flex-row items-center justify-between'
                  } ${isRotated180 ? 'rotate-180' : ''}`}
                >
                  <div
                    className={`${
                      printOrientation === 'portrait'
                        ? 'w-[90px] h-[90px] mb-1'
                        : 'w-[84px] h-[84px] mr-2'
                    } shrink-0 flex items-center justify-center`}
                  >
                    {qrCache[currentPreviewItem.sku] ? (
                      <img
                        src={qrCache[currentPreviewItem.sku]}
                        alt={currentPreviewItem.sku}
                        className="w-full h-full object-contain [image-rendering:pixelated]"
                      />
                    ) : (
                      <div className="text-[10px] text-slate-400 animate-pulse text-center">
                        Membuat QR...
                      </div>
                    )}
                  </div>

                  {/* Samping QR Code: Komposisi Data 4 Baris (Kategori, Varian, SKU, Harga) */}
                  {(() => {
                    const parsed = parseBarcodeProductInfo(
                      currentPreviewItem.nama,
                      currentPreviewItem.size,
                      showProductName,
                      showSize
                    );
                    return (
                      <div
                        className={`flex flex-col justify-center overflow-hidden flex-1 py-0.5 pl-0.5 ${
                          printOrientation === 'portrait' ? 'w-full text-center pl-0 pt-1' : 'text-left'
                        }`}
                      >
                        {/* Row 1: Nama Produk & Kategori (cth: Cassandra Top / Miranda Pants) */}
                        {parsed.titleLine && (
                          <div
                            className="text-slate-950 font-semibold truncate leading-tight tracking-tight"
                            style={{
                              fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                              fontSize: '13.5px',
                            }}
                            title={parsed.titleLine}
                          >
                            {parsed.titleLine}
                          </div>
                        )}

                        {/* Row 2: Varian Warna & Size (cth: Blue | L atau Soft Yellow | XL) */}
                        {parsed.variantLine && (
                          <div
                            className="text-slate-900 font-semibold truncate leading-tight tracking-tight mt-0.5"
                            style={{
                              fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                              fontSize: '12px',
                            }}
                            title={parsed.variantLine}
                          >
                            {parsed.variantLine}
                          </div>
                        )}

                        {/* Row 3: SKU (Lebih kecil dari Nama & Harga) */}
                        <div className="text-[10px] font-semibold text-slate-600 font-mono truncate leading-tight my-0.5 tracking-tight flex items-center gap-1">
                          <span>{currentPreviewItem.sku}</span>
                          {showLocation && currentPreviewItem.lokasi && (
                            <span className="text-[8.5px] font-bold text-slate-400">
                              [{currentPreviewItem.lokasi}]
                            </span>
                          )}
                        </div>

                        {/* Row 4: HARGA PRODUK (Font Quicksand Rounded Tebal & Jelas) */}
                        {showPrice && (
                          <div
                            className="text-[16px] font-bold text-slate-950 truncate leading-tight tracking-tight mt-0.5"
                            style={{ fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif" }}
                          >
                            {formatProductPrice(
                              currentPreviewItem.price || getProductMasterPrice(catalogMap.get(currentPreviewItem.sku.toLowerCase())),
                              showCurrencyPrefix
                            ) || '0'}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <div className="mt-2 text-[10px] font-semibold text-slate-400">
                Skala Realistis Kertas Thermal 50 × 20 mm (Rasio 2.5 : 1)
              </div>
            </div>

            {/* Sticker Content Toggles */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="font-extrabold text-slate-700 dark:text-slate-300">
                Kustomisasi Elemen Teks:
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={(e) => {
                      setShowProductName(e.target.checked);
                      saveSettings({ showProductName: e.target.checked });
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>Nama Produk</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showSize}
                    onChange={(e) => {
                      setShowSize(e.target.checked);
                      saveSettings({ showSize: e.target.checked });
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>Size / Ukuran</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => {
                      setShowPrice(e.target.checked);
                      saveSettings({ showPrice: e.target.checked });
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-bold text-purple-700 dark:text-purple-300">Harga Produk</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showCurrencyPrefix}
                    onChange={(e) => {
                      setShowCurrencyPrefix(e.target.checked);
                      saveSettings({ showCurrencyPrefix: e.target.checked });
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>Format "Rp" (cth: Rp 500.000)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showLocation}
                    onChange={(e) => {
                      setShowLocation(e.target.checked);
                      saveSettings({ showLocation: e.target.checked });
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>Lokasi Rak</span>
                </label>
              </div>
            </div>

            {/* Thermal Print Setup Instructions */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl text-[11px] text-amber-900 dark:text-amber-100 space-y-1">
              <div className="flex items-center gap-1.5 font-black text-amber-950 dark:text-amber-50">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Pengaturan Pada Jendela Cetak Chrome/Edge:</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[10.5px]">
                <li><b>Tata Letak (Layout):</b> Pilih <b>Lanskap (Landscape)</b></li>
                <li><b>Ukuran Kertas:</b> Pilih <b>50×20 mm</b> (atau Roll Label)</li>
                <li><b>Margin:</b> Pilih <b>None (Tanpa Margin)</b> &amp; Skala <b>100%</b></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. PRINT QUEUE TABLE (DAFTAR ANTREAN CETAK BARCODE)       */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Action Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-850/50">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Daftar Antrean Cetak
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-extrabold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-full">
              {queue.length} SKU / {totalSelectedCopies} Lembar Terpilih
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queueSearchQuery}
                onChange={(e) => setQueueSearchQuery(e.target.value)}
                placeholder="Cari dalam antrean..."
                className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500 w-44"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              Pilih Semua
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-2.5 py-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 hover:bg-red-100 text-red-600 dark:text-red-300 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Terpilih</span>
            </button>

            <button
              type="button"
              onClick={handleClearQueue}
              className="px-2.5 py-1.5 text-slate-400 hover:text-red-500 text-xs font-bold cursor-pointer transition-colors"
            >
              Kosongkan Antrean
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredQueue.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Antrean Cetak Barcode Kosong
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Pilih produk dari master katalog di atas, gunakan input manual, atau import massal dari file Excel.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={queue.length > 0 && selectedItems.length === queue.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-16">QR</th>
                  <th className="py-3 px-3">SKU Produk</th>
                  <th className="py-3 px-3">Nama Produk</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Harga</th>
                  <th className="py-3 px-3">Lokasi Rak</th>
                  <th className="py-3 px-3 text-center w-36">Jumlah Stiker</th>
                  <th className="py-3 px-4 text-right w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                {filteredQueue.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-colors ${
                      item.selected ? 'bg-purple-50/10' : 'opacity-60'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-9 h-9 bg-white p-0.5 rounded border border-slate-200 shadow-2xs flex items-center justify-center">
                        {qrCache[item.sku] ? (
                          <img
                            src={qrCache[item.sku]}
                            alt="QR"
                            className="w-full h-full object-contain [image-rendering:pixelated]"
                          />
                        ) : (
                          <QrCode className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-white font-mono">
                      {item.sku}
                    </td>
                    <td className="py-3 px-3 max-w-[200px] truncate" title={item.nama}>
                      {item.nama || '-'}
                    </td>
                    <td className="py-3 px-3">
                      {isRealSize(item.size) ? (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded font-bold">
                          {item.size}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {(() => {
                        const pr = item.price || getProductMasterPrice(catalogMap.get(item.sku.toLowerCase()));
                        return pr ? (
                          <span className="font-extrabold text-purple-700 dark:text-purple-300">
                            {formatProductPrice(pr, true)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-3">
                      {item.lokasi ? (
                        <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-bold">
                          {item.lokasi}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, -1)}
                          className="w-7 h-7 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.copies}
                          onChange={(e) => handleSetCopies(item.id, parseInt(e.target.value, 10) || 1)}
                          className="w-14 text-center py-1 font-black bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, 1)}
                          className="w-7 h-7 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        title="Hapus dari antrean"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 4. MODAL PREVIEW IMPORT EXCEL / CSV                       */}
      {/* ========================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-600" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Pratinjau Hasil Import Barcode
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-xs flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-purple-900 dark:text-purple-200">
                    {importPreviewList.length} SKU ditemukan
                  </span>{' '}
                  <span className="text-purple-700 dark:text-purple-300">
                    (Total{' '}
                    {importPreviewList.reduce((acc, i) => acc + (i.copies || 1), 0)} lembar stiker)
                  </span>
                </div>
                <span className="text-[11px] text-purple-600 font-bold">
                  Diperkaya dari Master Database Gudang
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-extrabold text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Lokasi</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {importPreviewList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-bold font-mono text-slate-900 dark:text-white">
                          {item.sku}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[180px]">{item.nama}</td>
                        <td className="py-2 px-3">{item.size || '-'}</td>
                        <td className="py-2 px-3">{item.lokasi || '-'}</td>
                        <td className="py-2 px-3 text-center font-black text-purple-600">
                          {item.copies}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Masukkan ke Antrean Cetak</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
