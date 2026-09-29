import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  Search,
  MapPin,
  FileSpreadsheet,
  Check,
  Copy,
  Boxes,
  Layers,
  ChevronDown,
  Calendar,
  User,
  Eye,
  RotateCcw,
  CheckSquare,
  FileText,
  Truck,
  Scissors,
  Shirt,
  Sparkles,
  Plus,
  Trash2,
  Filter,
  Split,
  Combine,
  Tag,
  RefreshCw,
  AlertCircle,
  Wrench,
  ChevronRight,
  Settings2,
  Building2,
  Hash,
} from 'lucide-react';
import { StockRealtimeItem, ProductItem, UserSession } from '../types';
import {
  resolveProductName,
  resolveProductDisplaySize,
  extractSizeFromSku,
  cleanProductName,
} from '../utils/sortUtils';

export interface LocationStockItem {
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  qty: number;
  totalStokFisikGlobal?: number;
  lastUpdated?: string;
}

export type DocumentType = 'SURAT_JALAN' | 'AUDIT_SO' | 'LIST_DATA';
export type MultiPrintMode = 'SEPARATE' | 'CONSOLIDATED';

export interface InventoryLokasiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocation?: string;
  stockList: StockRealtimeItem[];
  productCatalog?: ProductItem[];
  currentLocations?: string[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const InventoryLokasiExportModal: React.FC<InventoryLokasiExportModalProps> = ({
  isOpen,
  onClose,
  initialLocation = '',
  stockList = [],
  productCatalog = [],
  currentLocations = [],
  session,
  onNotify,
}) => {
  // Selected Locations (Support single or multiple)
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [searchLocationQuery, setSearchLocationQuery] = useState<string>('');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'TABLE' | 'PRINT_PREVIEW'>('TABLE');
  const [hasCopiedSku, setHasCopiedSku] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Document Type & Multi-Location Print Settings
  const [docType, setDocType] = useState<DocumentType>('SURAT_JALAN');
  const [multiPrintMode, setMultiPrintMode] = useState<MultiPrintMode>('SEPARATE');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Custom Surat Jalan Metadata
  const [customSJNumber, setCustomSJNumber] = useState<string>('');
  const [recipientVendor, setRecipientVendor] = useState<string>('');
  const [senderOfficer, setSenderOfficer] = useState<string>('');
  const [driverCourier, setDriverCourier] = useState<string>('');
  const [sjNotes, setSjNotes] = useState<string>('');
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);

  // Extract all unique locations with stock counts
  const allAvailableLocations = useMemo(() => {
    const locMap = new Map<string, { skuCount: number; totalQty: number; area: string }>();

    // 1. From stockList
    stockList.forEach((s) => {
      const l = String(s.lokasi || '').trim();
      if (!l || l.startsWith('#') || l === 'KOLI' || l === 'BOX') return;
      const cleanLoc = l.split(':')[0].trim();
      if (!cleanLoc) return;

      const qty = Number(s.sisa_stok || s.qty || 0);
      const cur = locMap.get(cleanLoc) || { skuCount: 0, totalQty: 0, area: s.area || '' };
      cur.skuCount += 1;
      cur.totalQty += qty;
      if (!cur.area && s.area) cur.area = s.area;
      locMap.set(cleanLoc, cur);
    });

    // 2. From productCatalog locList if not already in map
    if (Array.isArray(productCatalog)) {
      productCatalog.forEach((p) => {
        if (Array.isArray(p.locList)) {
          p.locList.forEach((item) => {
            const locName =
              typeof item === 'object' && item !== null
                ? String(item.lokasi || '').trim()
                : String(item || '').split(':')[0].trim();
            const locQty =
              typeof item === 'object' && item !== null
                ? Number(item.qty || 0)
                : parseInt(String(item || '').split(':')[1], 10) || 0;
            if (!locName || locName.startsWith('#') || locName === 'KOLI' || locName === 'BOX') return;
            if (!locMap.has(locName)) {
              locMap.set(locName, { skuCount: 1, totalQty: locQty, area: '' });
            }
          });
        }
      });
    }

    // 3. From currentLocations prop if provided
    if (Array.isArray(currentLocations)) {
      currentLocations.forEach((loc) => {
        const l = String(loc || '').trim();
        if (l && !locMap.has(l)) {
          locMap.set(l, { skuCount: 0, totalQty: 0, area: '' });
        }
      });
    }

    return Array.from(locMap.entries())
      .map(([lokasi, meta]) => ({
        lokasi,
        skuCount: meta.skuCount,
        totalQty: meta.totalQty,
        area: meta.area || 'Gudang',
      }))
      .sort((a, b) => a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' }));
  }, [stockList, productCatalog, currentLocations]);

  // Set initial location on open & smart document type detection
  useEffect(() => {
    if (isOpen) {
      const loc = (initialLocation || '').trim();
      const initialList = loc ? [loc] : allAvailableLocations.length > 0 ? [allAvailableLocations[0].lokasi] : [];
      setSelectedLocations(initialList);
      setSearchLocationQuery('');
      setItemSearchQuery('');
      setViewMode('TABLE');
      setIsDropdownOpen(false);

      // Default officer name from session
      const officer = session?.name || session?.username || 'Petugas Gudang';
      setSenderOfficer(officer);

      // Smart Document Type & Default Vendor detection based on location prefix
      const firstLocUpper = (initialList[0] || '').toUpperCase();
      if (firstLocUpper.startsWith('CC')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('Vendor Laundry / Cuci');
        setSjNotes('Barang butuh cuci / laundry. Harap konfirmasi kondisi saat serah terima.');
      } else if (firstLocUpper.startsWith('PMK')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('Penjahit Permak / Alteration');
        setSjNotes('Barang butuh permak / jahit ulang. Harap pastikan jumlah fisik sesuai.');
      } else if (firstLocUpper.startsWith('DF')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('QC & Workshop Defect / Repair');
        setSjNotes('Barang cacat / butuh ACC perbaikan defect QC.');
      } else {
        setDocType('LIST_DATA');
        setRecipientVendor('Gudang Tujuan / Vendor Eksternal');
        setSjNotes('Mutasi stok antar lokasi rak.');
      }

      // Generate initial SJ Number
      const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const locCode = (initialList[0] || 'LOC').replace(/[^A-Z0-9]/gi, '');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      setCustomSJNumber(`SJ/WMS/${locCode}/${dateCode}-${randomSuffix}`);
    }
  }, [isOpen, initialLocation, allAvailableLocations, session]);

  // When selectedLocations changes, update SJ Number and defaults if empty
  const handleToggleLocation = (loc: string) => {
    const clean = loc.trim();
    if (!clean) return;

    if (isMultiSelectMode) {
      setSelectedLocations((prev) => {
        const exists = prev.includes(clean);
        if (exists) {
          const next = prev.filter((l) => l !== clean);
          return next.length === 0 ? [clean] : next;
        } else {
          return [...prev, clean];
        }
      });
    } else {
      setSelectedLocations([clean]);
      // Auto-adapt SJ details when switching single location
      const locUpper = clean.toUpperCase();
      if (locUpper.startsWith('CC')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('Vendor Laundry / Cuci');
      } else if (locUpper.startsWith('PMK')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('Penjahit Permak / Alteration');
      } else if (locUpper.startsWith('DF')) {
        setDocType('SURAT_JALAN');
        setRecipientVendor('QC & Workshop Defect / Repair');
      }
    }
  };

  const handleSelectAllProcessLocations = () => {
    // Select CC, PMK, and DF locations if available
    const processLocs = allAvailableLocations
      .map((l) => l.lokasi)
      .filter((loc) => {
        const u = loc.toUpperCase();
        return u.startsWith('CC') || u.startsWith('PMK') || u.startsWith('DF');
      });
    if (processLocs.length > 0) {
      setIsMultiSelectMode(true);
      setSelectedLocations(processLocs);
      setDocType('SURAT_JALAN');
      onNotify?.(`Memilih ${processLocs.length} lokasi proses perbaikan (CC, PMK, DF)!`, 'info');
    }
  };

  // Filtered dropdown location list based on search input
  const filteredLocationOptions = useMemo(() => {
    const q = searchLocationQuery.trim().toLowerCase();
    if (!q) return allAvailableLocations;
    return allAvailableLocations.filter(
      (loc) => loc.lokasi.toLowerCase().includes(q) || loc.area.toLowerCase().includes(q)
    );
  }, [allAvailableLocations, searchLocationQuery]);

  // Global Physical stock map
  const globalStockBySku = useMemo(() => {
    const map = new Map<string, number>();
    stockList.forEach((s) => {
      const sku = String(s.sku || '').trim().toUpperCase();
      if (!sku) return;
      const qty = Number(s.sisa_stok || s.qty || 0);
      map.set(sku, (map.get(sku) || 0) + qty);
    });
    return map;
  }, [stockList]);

  // Comprehensive catalog dictionary (including props + local storage caches)
  const masterProductLookup = useMemo(() => {
    const map = new Map<string, { nama: string; size: string; rawItem?: any }>();
    const prefixMap = new Map<string, string>(); // maps prefix (e.g. F26ITN806) to base name

    const addEntry = (rawSku?: string, rawName?: string, rawSize?: string, itemObj?: any) => {
      const sku = (rawSku || '').trim().toUpperCase();
      if (!sku) return;
      const cleanName = cleanProductName((rawName || '').trim());
      const isNameValid =
        cleanName &&
        cleanName.toUpperCase() !== sku &&
        cleanName.toUpperCase().replace(/\s+/g, '') !== sku.replace(/\s+/g, '');
      const size = (rawSize || '').trim();

      if (isNameValid) {
        if (!map.has(sku) || !map.get(sku)?.nama) {
          map.set(sku, { nama: cleanName, size, rawItem: itemObj });
        }
        // Also map stripped / normalized SKU
        const noPunct = sku.replace(/[\s-_]+/g, '');
        if (!map.has(noPunct)) {
          map.set(noPunct, { nama: cleanName, size, rawItem: itemObj });
        }
        // Save prefix (e.g. first 9-10 chars or without last size letter)
        if (sku.length >= 7) {
          const prefix2 = sku.slice(0, -2);
          if (!prefixMap.has(prefix2)) prefixMap.set(prefix2, cleanName);
          const prefix1 = sku.slice(0, -1);
          if (!prefixMap.has(prefix1)) prefixMap.set(prefix1, cleanName);
        }
      } else if (!map.has(sku)) {
        map.set(sku, { nama: '', size, rawItem: itemObj });
      }
    };

    // A. From productCatalog prop
    if (Array.isArray(productCatalog)) {
      productCatalog.forEach((p) => {
        addEntry(p.k, p.p || p.n || (p as any).nama_produk || (p as any).nama, p.s, p);
      });
    }

    // B. From localStorage product caches
    if (typeof window !== 'undefined' && window.localStorage) {
      const cacheKeys = [
        'wms_product_cache',
        'wms_master_produk',
        'wms_dealpos_products',
        'wms_catalog_cache',
        'wms_offline_products',
      ];
      for (const k of cacheKeys) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((it: any) => {
                const sku = it.k || it.sku || it.kode || it.barcode;
                const name = it.p || it.n || it.nama_produk || it.nama || it.product_name;
                const size = it.s || it.size || it.ukuran;
                addEntry(sku, name, size, it);
              });
            }
          }
        } catch {}
      }
    }

    return { map, prefixMap };
  }, [productCatalog]);

  // Map of Location Items Grouped By Location with guaranteed resolved Product Names & Sizes
  const itemsByLocation = useMemo(() => {
    const result = new Map<string, LocationStockItem[]>();

    const resolveBestName = (sku: string, rawName?: string): string => {
      const cleanSku = (sku || '').trim().toUpperCase();
      const cleanRaw = cleanProductName((rawName || '').trim());
      const isRawValid =
        cleanRaw &&
        cleanRaw.toUpperCase() !== cleanSku &&
        cleanRaw.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '');

      // 1. Direct match in master catalog lookup
      const cat =
        masterProductLookup.map.get(cleanSku) ||
        masterProductLookup.map.get(cleanSku.replace(/[\s-_]+/g, ''));
      if (cat?.nama) {
        return cat.nama;
      }

      // 2. Existing record name if valid
      if (isRawValid) {
        return cleanRaw;
      }

      // 3. Check resolveProductName utility
      const resolved = resolveProductName(cleanSku, rawName, cat?.rawItem);
      if (
        resolved &&
        resolved.toUpperCase() !== cleanSku &&
        resolved.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '')
      ) {
        return resolved;
      }

      // 4. Prefix fallback (e.g. F26ITN806 from F26ITN806YL)
      if (cleanSku.length >= 7) {
        const p2 = masterProductLookup.prefixMap.get(cleanSku.slice(0, -2));
        if (p2) return p2;
        const p1 = masterProductLookup.prefixMap.get(cleanSku.slice(0, -1));
        if (p1) return p1;
      }

      return isRawValid ? cleanRaw : cleanSku;
    };

    const resolveBestSize = (sku: string, rawSize?: string): string => {
      const cleanSku = (sku || '').trim().toUpperCase();
      const cat =
        masterProductLookup.map.get(cleanSku) ||
        masterProductLookup.map.get(cleanSku.replace(/[\s-_]+/g, ''));
      const resolved = resolveProductDisplaySize(cleanSku, rawSize, cat?.size);
      if (resolved && resolved.toUpperCase() !== 'DEFAULT' && resolved !== '-') {
        return resolved;
      }
      const fromSku = extractSizeFromSku(cleanSku);
      if (fromSku && fromSku !== '-' && fromSku.toUpperCase() !== 'DEFAULT') {
        return fromSku;
      }
      if (rawSize && rawSize.toUpperCase() !== 'DEFAULT' && rawSize !== '-') {
        return rawSize;
      }
      return 'ALL';
    };

    selectedLocations.forEach((targetLoc) => {
      const locKey = targetLoc.trim();
      if (!locKey) return;
      const targetUpper = locKey.toUpperCase();
      const itemMap = new Map<string, LocationStockItem>();

      // 1. Scan stockList
      stockList.forEach((s) => {
        const rawLoc = String(s.lokasi || '').trim();
        const cleanLoc = rawLoc.split(':')[0].trim().toUpperCase();
        if (cleanLoc !== targetUpper) return;

        const sku = String(s.sku || '').trim().toUpperCase();
        if (!sku) return;

        const qty = Number(s.sisa_stok || s.qty || 0);
        const resolvedName = resolveBestName(sku, s.nama_produk || s.nama);
        const resolvedSize = resolveBestSize(sku, s.size || s.ukuran);

        const existing = itemMap.get(sku);
        if (existing) {
          existing.qty += qty;
          if (!existing.area && s.area) existing.area = s.area;
          if (
            (!existing.nama_produk || existing.nama_produk === existing.sku) &&
            resolvedName !== sku
          ) {
            existing.nama_produk = resolvedName;
          }
          if (
            (!existing.size || existing.size === '-' || existing.size === 'ALL') &&
            resolvedSize !== 'ALL'
          ) {
            existing.size = resolvedSize;
          }
        } else {
          itemMap.set(sku, {
            sku,
            nama_produk: resolvedName,
            size: resolvedSize,
            lokasi: locKey,
            area: s.area || '',
            qty,
            totalStokFisikGlobal: globalStockBySku.get(sku) || qty,
            lastUpdated: s.updated_at,
          });
        }
      });

      // 2. Cross-reference with productCatalog
      if (Array.isArray(productCatalog)) {
        productCatalog.forEach((p) => {
          const sku = String(p.k || '').trim().toUpperCase();
          if (!sku) return;

          const catName = p.n || p.p || (p as any).nama_produk || (p as any).nama || '';
          const resolvedName = resolveBestName(sku, catName);
          const resolvedSize = resolveBestSize(sku, p.s);

          const inMap = itemMap.get(sku);
          if (inMap) {
            if (
              (!inMap.nama_produk || inMap.nama_produk === inMap.sku) &&
              resolvedName !== sku
            ) {
              inMap.nama_produk = resolvedName;
            }
            if (
              (!inMap.size || inMap.size === '-' || inMap.size === 'ALL') &&
              resolvedSize !== 'ALL'
            ) {
              inMap.size = resolvedSize;
            }
            return;
          }

          if (Array.isArray(p.locList)) {
            p.locList.forEach((locEntry) => {
              const locName =
                typeof locEntry === 'object' && locEntry !== null
                  ? String(locEntry.lokasi || '').trim().toUpperCase()
                  : String(locEntry || '').split(':')[0].trim().toUpperCase();
              if (locName === targetUpper) {
                const qty =
                  typeof locEntry === 'object' && locEntry !== null
                    ? Number(locEntry.qty || 0)
                    : parseInt(String(locEntry || '').split(':')[1], 10) || 0;
                itemMap.set(sku, {
                  sku,
                  nama_produk: resolvedName,
                  size: resolvedSize,
                  lokasi: locKey,
                  area: '',
                  qty,
                  totalStokFisikGlobal: globalStockBySku.get(sku) || qty,
                });
              }
            });
          }
        });
      }

      result.set(
        locKey,
        Array.from(itemMap.values()).sort((a, b) =>
          a.sku.localeCompare(b.sku, undefined, { numeric: true })
        )
      );
    });

    return result;
  }, [selectedLocations, stockList, productCatalog, globalStockBySku, masterProductLookup]);

  // Flat Combined Items Across all selected locations
  const allSelectedLocationItems = useMemo(() => {
    const list: LocationStockItem[] = [];
    itemsByLocation.forEach((items) => {
      list.push(...items);
    });
    return list;
  }, [itemsByLocation]);

  // Filter items in location by search query (SKU or Name)
  const filteredLocationItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return allSelectedLocationItems;
    return allSelectedLocationItems.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.nama_produk.toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q) ||
        item.lokasi.toLowerCase().includes(q)
    );
  }, [allSelectedLocationItems, itemSearchQuery]);

  // Summary statistics for selected locations
  const summary = useMemo(() => {
    const totalPcs = allSelectedLocationItems.reduce((acc, it) => acc + it.qty, 0);
    const uniqueSkus = new Set(allSelectedLocationItems.map((i) => i.sku)).size;
    const areas = Array.from(new Set(allSelectedLocationItems.map((i) => i.area).filter(Boolean)));
    return {
      totalPcs,
      uniqueSkus,
      totalRows: allSelectedLocationItems.length,
      locationCount: selectedLocations.length,
      areaStr: areas.length > 0 ? areas.join(', ') : 'Gudang Utama',
    };
  }, [allSelectedLocationItems, selectedLocations]);

  // Dynamic Document Title and Purpose Helper
  const getDocumentMeta = (locName?: string) => {
    const loc = (locName || selectedLocations[0] || '').toUpperCase();
    if (docType === 'AUDIT_SO') {
      return {
        title: 'LEMBAR STOK OPNAME / AUDIT LOKASI RAK',
        subtitle: 'Dokumen Verifikasi & Pencocokan Fisik Persediaan Rak',
        code: 'AUDIT-SO',
        accentColor: '#4f46e5',
        badgeText: 'Audit Opname',
        isSJ: false,
      };
    }

    if (docType === 'LIST_DATA') {
      return {
        title: 'LAPORAN & DAFTAR PRODUK LOKASI RAK',
        subtitle: 'Dokumen Printout Data Stok & Posisi Fisik Rak',
        code: 'LIST-STOK',
        accentColor: '#0284c7',
        badgeText: 'List Stok',
        isSJ: false,
      };
    }

    // SURAT_JALAN
    if (loc.startsWith('CC')) {
      return {
        title: 'SURAT JALAN PROSES CUCI (LAUNDRY)',
        subtitle: 'Dokumen Pengeluaran & Serah Terima Barang Cuci / Treatment',
        code: 'SJ-CUCI',
        accentColor: '#0d9488',
        badgeText: 'Surat Jalan Cuci',
        isSJ: true,
      };
    }
    if (loc.startsWith('PMK')) {
      return {
        title: 'SURAT JALAN PROSES PERMAK / ALTERATION',
        subtitle: 'Dokumen Serah Terima Barang Permak / Jahit Ulang',
        code: 'SJ-PERMAK',
        accentColor: '#d97706',
        badgeText: 'Surat Jalan Permak',
        isSJ: true,
      };
    }
    if (loc.startsWith('DF')) {
      return {
        title: 'SURAT JALAN ACC DEFECT / REPARASI QC',
        subtitle: 'Dokumen Serah Terima Barang Cacat / Penanganan Workshop QC',
        code: 'SJ-DEFECT',
        accentColor: '#dc2626',
        badgeText: 'Surat Jalan Defect',
        isSJ: true,
      };
    }

    return {
      title: 'SURAT JALAN MUTASI & PENGELUARAN LOKASI RAK',
      subtitle: 'Dokumen Serah Terima Barang Internal & Eksternal',
      code: 'SJ-MUTASI',
      accentColor: '#b45309',
      badgeText: 'Surat Jalan Rak',
      isSJ: true,
    };
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (allSelectedLocationItems.length === 0) {
      onNotify?.('Tidak ada data produk di lokasi terpilih untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'NO',
      'LOKASI_RAK',
      'AREA',
      'SKU',
      'NAMA_PRODUK',
      'SIZE',
      'QTY_DI_LOKASI',
      'TOTAL_FISIK_GLOBAL',
      'TIPE_DOKUMEN',
      'NO_SURAT_JALAN',
      'TUJUAN_VENDOR',
    ];

    const rows = allSelectedLocationItems.map((item, idx) => {
      const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      return [
        idx + 1,
        escape(item.lokasi),
        escape(item.area || summary.areaStr),
        escape(item.sku),
        escape(item.nama_produk),
        escape(item.size),
        item.qty,
        item.totalStokFisikGlobal ?? item.qty,
        escape(docType),
        escape(docType === 'SURAT_JALAN' ? customSJNumber : '-'),
        escape(docType === 'SURAT_JALAN' ? recipientVendor : '-'),
      ].join(',');
    });

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const locNames = selectedLocations.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `WMS_INVENTORY_LOKASI_${locNames}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify?.(
      `Berhasil mengunduh CSV (${selectedLocations.join(', ')}) - ${allSelectedLocationItems.length} baris, ${summary.totalPcs} pcs!`,
      'success'
    );
  };

  // Copy SKU list to clipboard
  const handleCopySkus = () => {
    if (allSelectedLocationItems.length === 0) return;
    const uniqueSkus = Array.from(new Set(allSelectedLocationItems.map((it) => it.sku)));
    const skuText = uniqueSkus.join('\n');
    navigator.clipboard.writeText(skuText).then(() => {
      setHasCopiedSku(true);
      setTimeout(() => setHasCopiedSku(false), 2500);
      onNotify?.(`Daftar ${uniqueSkus.length} SKU berhasil disalin ke clipboard!`, 'info');
    });
  };

  // Isolated Iframe Direct Print Engine
  const handlePrint = () => {
    if (allSelectedLocationItems.length === 0) {
      onNotify?.('Tidak ada data produk di lokasi terpilih untuk dicetak.', 'warning');
      return;
    }

    setIsPrinting(true);

    try {
      // Build pure HTML printable document
      const printableContent = generatePrintHtml();

      const existingFrame = document.getElementById('inventory-loc-print-iframe') as HTMLIFrameElement;
      if (existingFrame) {
        existingFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'inventory-loc-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        window.print();
        setIsPrinting(false);
        return;
      }

      doc.open();
      doc.write(printableContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print failed, falling back to window.print():', e);
          window.print();
        } finally {
          setIsPrinting(false);
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              iframe.remove();
            }
          }, 3000);
        }
      }, 500);
    } catch (err) {
      console.error('Print Error:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  // HTML Generator for Pure A4 Print
  const generatePrintHtml = () => {
    const printDate = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isMultiSeparate = selectedLocations.length > 1 && multiPrintMode === 'SEPARATE';

    // Base CSS for A4 print
    const css = `
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
        color: #000;
        background: #fff;
        font-size: 11px;
        line-height: 1.35;
      }
      .page-container {
        width: 100%;
        page-break-after: always;
        break-after: page;
        padding-bottom: 20px;
      }
      .page-container:last-child {
        page-break-after: avoid;
        break-after: avoid;
      }
      .header-box {
        border-bottom: 2.5px solid #000;
        padding-bottom: 10px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .company-title {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: -0.5px;
        text-transform: uppercase;
        margin-bottom: 2px;
      }
      .doc-title {
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
        color: #111;
        margin-bottom: 2px;
      }
      .doc-sub {
        font-size: 9.5px;
        color: #555;
      }
      .loc-badge-box {
        text-align: right;
      }
      .loc-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        color: #666;
        margin-bottom: 2px;
      }
      .loc-badge {
        font-size: 18px;
        font-weight: 900;
        font-family: "Courier New", Courier, monospace;
        border: 2px solid #000;
        padding: 3px 10px;
        background: #fef3c7;
        border-radius: 4px;
        display: inline-block;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 12px;
        font-size: 10px;
      }
      .meta-item label {
        display: block;
        color: #64748b;
        font-size: 8.5px;
        text-transform: uppercase;
        font-weight: 700;
      }
      .meta-item strong {
        font-size: 10.5px;
        color: #0f172a;
      }
      .table-data {
        width: 100%;
        border-collapse: collapse;
        border: 1.5px solid #000;
        font-size: 10px;
        margin-bottom: 12px;
      }
      .table-data th {
        background: #f1f5f9;
        border: 1px solid #000;
        padding: 5px 4px;
        font-weight: 800;
        text-transform: uppercase;
        font-size: 9px;
        letter-spacing: 0.2px;
      }
      .table-data td {
        border: 1px solid #000;
        padding: 4.5px 4px;
        vertical-align: middle;
      }
      .table-data tr.even {
        background: #fafafa;
      }
      .table-data tfoot td {
        background: #f1f5f9;
        font-weight: 800;
        font-size: 10px;
        border-top: 2px solid #000;
      }
      .signatures-box {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        text-align: center;
        font-size: 9.5px;
        page-break-inside: avoid;
      }
      .signatures-box-2col {
        margin-top: 20px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        text-align: center;
        font-size: 10px;
        page-break-inside: avoid;
      }
      .sig-title {
        font-weight: 700;
        margin-bottom: 45px;
        color: #1e293b;
      }
      .sig-line {
        border-bottom: 1px solid #000;
        width: 85%;
        margin: 0 auto 3px auto;
      }
      .sig-name {
        font-size: 8.5px;
        color: #64748b;
      }
      .notes-box {
        background: #fffbeb;
        border: 1px dashed #d97706;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 9px;
        color: #92400e;
        margin-bottom: 12px;
      }
    `;

    // Render single document template for a specific location or combined
    const renderDocumentSection = (locs: string[], isConsolidated: boolean) => {
      const locKey = locs[0] || 'LOKASI';
      const meta = getDocumentMeta(locKey);
      const items = isConsolidated
        ? allSelectedLocationItems
        : itemsByLocation.get(locKey) || [];
      const totalPcs = items.reduce((acc, it) => acc + it.qty, 0);
      const totalSku = items.length;

      // Surat Jalan No for this section
      const sjNumber =
        customSJNumber ||
        `SJ/WMS/${locKey.replace(/[^A-Z0-9]/gi, '')}/${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      return `
        <div class="page-container">
          <!-- Header -->
          <div class="header-box">
            <div>
              <div class="company-title">WMS CHOCOCHIPS WAREHOUSE</div>
              <div class="doc-title">${isConsolidated ? `${meta.title} (GABUNGAN MULTI-LOKASI)` : meta.title}</div>
              <div class="doc-sub">${meta.subtitle}</div>
            </div>
            <div class="loc-badge-box">
              <div class="loc-label">${isConsolidated ? 'LOKASI RAK TERPILIH' : 'LOKASI RAK'}</div>
              <div class="loc-badge">${isConsolidated ? selectedLocations.join(' + ') : locKey}</div>
            </div>
          </div>

          <!-- Metadata Box -->
          <div class="meta-grid">
            <div class="meta-item">
              <label>${meta.isSJ ? 'No. Dokumen / SJ:' : 'Tipe Dokumen:'}</label>
              <strong>${meta.isSJ ? sjNumber : meta.badgeText}</strong>
            </div>
            <div class="meta-item">
              <label>Tanggal & Waktu:</label>
              <strong>${printDate}</strong>
            </div>
            <div class="meta-item">
              <label>${meta.isSJ ? 'Tujuan / Vendor / Proses:' : 'Area Gudang:'}</label>
              <strong>${meta.isSJ ? recipientVendor || 'Vendor / Tailor / QC' : summary.areaStr}</strong>
            </div>
            <div class="meta-item">
              <label>Total Persediaan Fisik:</label>
              <strong style="color: #b45309;">${totalPcs} Pcs (${totalSku} SKU)</strong>
            </div>
          </div>

          ${
            meta.isSJ && sjNotes
              ? `<div class="notes-box"><strong>Catatan Khusus:</strong> ${sjNotes}</div>`
              : ''
          }

          <!-- Table Content -->
          <table class="table-data">
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">No</th>
                ${isConsolidated ? '<th style="width: 60px; text-align: center;">Lokasi</th>' : ''}
                <th style="width: 125px; text-align: left;">SKU / Barcode</th>
                <th style="text-align: left;">Nama Produk</th>
                <th style="width: 40px; text-align: center;">Size</th>
                <th style="width: 50px; text-align: center;">Qty (Pcs)</th>
                ${
                  docType === 'AUDIT_SO'
                    ? '<th style="width: 55px; text-align: center;">Fisik</th><th style="width: 40px; text-align: center;">+/-</th><th style="width: 80px; text-align: center;">Catatan</th>'
                    : docType === 'SURAT_JALAN'
                    ? '<th style="width: 45px; text-align: center;">Satuan</th><th style="width: 95px; text-align: left;">Kondisi / Keterangan</th>'
                    : '<th style="width: 55px; text-align: center;">Global</th><th style="width: 75px; text-align: left;">Area</th>'
                }
              </tr>
            </thead>
            <tbody>
              ${
                items.length === 0
                  ? `<tr><td colspan="${isConsolidated ? 8 : 7}" style="text-align: center; padding: 15px; color: #999;">Tidak ada barang di lokasi ini</td></tr>`
                  : items
                      .map(
                        (it, idx) => `
                    <tr class="${idx % 2 === 1 ? 'even' : ''}">
                      <td style="text-align: center; color: #555;">${idx + 1}</td>
                      ${isConsolidated ? `<td style="text-align: center; font-weight: bold; font-family: monospace; background: #fffbeb;">${it.lokasi}</td>` : ''}
                      <td style="font-family: monospace; font-weight: bold; font-size: 9.5px;">${it.sku}</td>
                      <td>${it.nama_produk || '-'}</td>
                      <td style="text-align: center; font-weight: bold;">${it.size || 'ALL'}</td>
                      <td style="text-align: center; font-weight: bold; font-family: monospace; background: #f8fafc; font-size: 10.5px;">${it.qty}</td>
                      ${
                        docType === 'AUDIT_SO'
                          ? '<td style="text-align: center;"></td><td style="text-align: center;"></td><td></td>'
                          : docType === 'SURAT_JALAN'
                          ? '<td style="text-align: center; color: #475569;">Pcs</td><td style="font-size: 9px; color: #334155;">-</td>'
                          : `<td style="text-align: center; font-family: monospace; color: #64748b;">${it.totalStokFisikGlobal ?? it.qty}</td><td style="font-size: 9px; color: #64748b;">${it.area || '-'}</td>`
                      }
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="${isConsolidated ? 5 : 4}" style="text-align: right; padding-right: 8px;">
                  TOTAL PERSINGGAHAN (${totalSku} SKU):
                </td>
                <td style="text-align: center; font-family: monospace; font-size: 11px; color: #000;">
                  ${totalPcs}
                </td>
                <td colspan="${docType === 'AUDIT_SO' ? 3 : docType === 'SURAT_JALAN' ? 2 : 2}"></td>
              </tr>
            </tfoot>
          </table>

          <!-- Signatures Footer -->
          ${
            meta.isSJ
              ? `
            <div class="signatures-box">
              <div>
                <div class="sig-title">Diserahkan Oleh (Warehouse):</div>
                <div class="sig-line"></div>
                <div class="sig-name">( ${senderOfficer || 'Petugas Gudang'} )</div>
              </div>
              <div>
                <div class="sig-title">Dibawa Oleh (Driver / Vendor):</div>
                <div class="sig-line"></div>
                <div class="sig-name">( ${driverCourier || 'Kurir / Ekspedisi'} )</div>
              </div>
              <div>
                <div class="sig-title">Diterima Oleh (Pihak Penerima):</div>
                <div class="sig-line"></div>
                <div class="sig-name">( ${recipientVendor || 'Penerima / Vendor'} )</div>
              </div>
            </div>
          `
              : `
            <div class="signatures-box-2col">
              <div>
                <div class="sig-title">Petugas Audit / Cek Fisik:</div>
                <div class="sig-line"></div>
                <div class="sig-name">( ${senderOfficer || 'Auditor Fisik'} )</div>
              </div>
              <div>
                <div class="sig-title">Supervisor Gudang / Validator:</div>
                <div class="sig-line"></div>
                <div class="sig-name">( Nama Jelas & Tanda Tangan )</div>
              </div>
            </div>
          `
          }
        </div>
      `;
    };

    let bodyHtml = '';
    if (isMultiSeparate) {
      selectedLocations.forEach((loc) => {
        bodyHtml += renderDocumentSection([loc], false);
      });
    } else {
      bodyHtml += renderDocumentSection(selectedLocations, selectedLocations.length > 1);
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>WMS CHOCOCHIPS - ${docType} - ${selectedLocations.join('_')}</title>
          <style>${css}</style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Main Modal Card */}
      <div className="bg-white dark:bg-[#161F30] w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* ========================================================
            MODAL HEADER: TITLE & QUICK ACTIONS
            ======================================================== */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111827]/90 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                  <span>Cetak & Ekspor Lokasi Rak</span>
                  {selectedLocations.map((loc) => (
                    <span
                      key={loc}
                      className="px-2 py-0.5 text-xs font-mono font-black bg-amber-500 text-black rounded-lg shadow-xs flex items-center gap-1"
                    >
                      {loc}
                      {selectedLocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleToggleLocation(loc)}
                          className="hover:text-red-700 ml-0.5 font-bold"
                          title="Hapus lokasi"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cetak Surat Jalan Proses (Cuci / Permak / Defect), Lembar Stok Opname, atau Printout Data Stok Lokasi.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                  isSettingsOpen
                    ? 'bg-amber-500 text-black border-amber-600 shadow-xs'
                    : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                }`}
                title="Sesuaikan No SJ, Vendor, & Data Surat Jalan"
              >
                <Settings2 className="w-4 h-4" />
                <span className="hidden sm:inline">Pengaturan SJ</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Location Selector & Multi-Choice Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Searchable Dropdown */}
            <div className="relative flex-1">
              <div className="flex items-center gap-2 bg-white dark:bg-[#1E293B] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 shadow-xs focus-within:ring-2 focus-within:ring-amber-500">
                <Search className="w-4 h-4 text-amber-500 shrink-0" />
                <input
                  type="text"
                  value={searchLocationQuery}
                  onChange={(e) => {
                    setSearchLocationQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Ketik nama lokasi (misal: CC001, PMK01, DF01, A01)..."
                  className="bg-transparent border-none outline-none text-xs font-bold text-slate-900 dark:text-slate-100 w-full placeholder:text-slate-400 uppercase"
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Dropdown Options */}
              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>Pilih Lokasi Rak:</span>
                      <button
                        type="button"
                        onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                        className="text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {isMultiSelectMode ? '✓ Mode Multi-Pilihan Aktif' : '+ Aktifkan Multi-Pilihan'}
                      </button>
                    </div>
                    {filteredLocationOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Tidak ada lokasi yang cocok.
                      </div>
                    ) : (
                      filteredLocationOptions.map((opt) => {
                        const isSelected = selectedLocations.includes(opt.lokasi);
                        return (
                          <button
                            key={opt.lokasi}
                            type="button"
                            onClick={() => {
                              handleToggleLocation(opt.lokasi);
                              if (!isMultiSelectMode) {
                                setIsDropdownOpen(false);
                              }
                            }}
                            className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isMultiSelectMode && (
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                                    isSelected
                                      ? 'bg-amber-500 text-black border-amber-600'
                                      : 'border-slate-400'
                                  }`}
                                >
                                  {isSelected && '✓'}
                                </div>
                              )}
                              <span className="font-mono font-bold">{opt.lokasi}</span>
                              <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                                {opt.area}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {opt.skuCount} SKU • {opt.totalQty} pcs
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Quick Chips & Mode Toggles */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all shrink-0 cursor-pointer border flex items-center gap-1 ${
                  isMultiSelectMode
                    ? 'bg-amber-500 text-black border-amber-600 shadow-xs'
                    : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                }`}
                title="Beralih antara pilihan 1 lokasi atau banyak lokasi sekaligus"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{isMultiSelectMode ? 'Multi-Lokasi (Aktif)' : '+ Multi-Lokasi'}</span>
              </button>

              <button
                type="button"
                onClick={handleSelectAllProcessLocations}
                className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition-all shrink-0 cursor-pointer flex items-center gap-1"
                title="Pilih semua lokasi perbaikan: CC001, PMK01, DF01"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Semua Reparasi (CC+PMK+DF)</span>
              </button>

              {['CC001', 'PMK01', 'DF01', 'A01', 'B01', 'R01'].map((quickLoc) => {
                const isSel = selectedLocations.includes(quickLoc);
                return (
                  <button
                    key={quickLoc}
                    type="button"
                    onClick={() => handleToggleLocation(quickLoc)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg font-mono font-bold transition-all shrink-0 cursor-pointer border ${
                      isSel
                        ? 'bg-amber-500 text-black border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                    }`}
                  >
                    {quickLoc}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================
            DOCUMENT TYPE SELECTOR & SETTINGS ACCORDION
            ======================================================== */}
        <div className="px-4 py-3 bg-white dark:bg-[#161F30] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Document Type Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setDocType('SURAT_JALAN')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                docType === 'SURAT_JALAN'
                  ? 'bg-amber-500 text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Surat Jalan Proses (SJ)</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('AUDIT_SO')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                docType === 'AUDIT_SO'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Lembar Audit / SO</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('LIST_DATA')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                docType === 'LIST_DATA'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Printout List Data</span>
            </button>
          </div>

          {/* Multi-Location Print Format Toggle (When >1 locations selected) */}
          {selectedLocations.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs font-bold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 px-2.5 py-1 rounded-xl">
              <span className="text-amber-800 dark:text-amber-300 text-[11px]">Format Multi-Lokasi:</span>
              <button
                type="button"
                onClick={() => setMultiPrintMode('SEPARATE')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  multiPrintMode === 'SEPARATE'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Cetak surat jalan / lembar terpisah per masing-masing lokasi"
              >
                <Split className="w-3 h-3 inline mr-1" />
                Terpisah Per Lokasi
              </button>
              <button
                type="button"
                onClick={() => setMultiPrintMode('CONSOLIDATED')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  multiPrintMode === 'CONSOLIDATED'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Gabungkan semua lokasi ke dalam 1 daftar komparasi / lembar terpadu"
              >
                <Combine className="w-3 h-3 inline mr-1" />
                Daftar Komparasi / Gabung
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Settings Drawer for Surat Jalan & Document Meta */}
        {isSettingsOpen && (
          <div className="p-4 bg-amber-50/50 dark:bg-[#1A2333] border-b border-slate-200 dark:border-slate-800 text-xs animate-in slide-in-from-top-2 duration-150">
            <div className="font-black text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-amber-500" />
              <span>Detail Surat Jalan & Informasi Pengiriman / Audit</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  No. Surat Jalan
                </label>
                <input
                  type="text"
                  value={customSJNumber}
                  onChange={(e) => setCustomSJNumber(e.target.value)}
                  placeholder="SJ/WMS/..."
                  className="w-full bg-white dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Tujuan / Vendor / Proses
                </label>
                <input
                  type="text"
                  value={recipientVendor}
                  onChange={(e) => setRecipientVendor(e.target.value)}
                  placeholder="Misal: Vendor Laundry, Penjahit Permak..."
                  className="w-full bg-white dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Petugas Gudang (Pengirim)
                </label>
                <input
                  type="text"
                  value={senderOfficer}
                  onChange={(e) => setSenderOfficer(e.target.value)}
                  placeholder="Nama petugas..."
                  className="w-full bg-white dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Driver / Kurir Ekspedisi
                </label>
                <input
                  type="text"
                  value={driverCourier}
                  onChange={(e) => setDriverCourier(e.target.value)}
                  placeholder="Nama kurir / plat nomor..."
                  className="w-full bg-white dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div className="sm:col-span-2 md:col-span-4">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Catatan / Keterangan Khusus Dokumen
                </label>
                <input
                  type="text"
                  value={sjNotes}
                  onChange={(e) => setSjNotes(e.target.value)}
                  placeholder="Instruksi penanganan barang, kondisi cacat, estimasi selesai..."
                  className="w-full bg-white dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            LOCATION STATS & ACTION TOOLBAR
            ======================================================== */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F30] flex flex-wrap items-center justify-between gap-3">
          {/* Summary Metrics */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-amber-500" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">Total SKU</div>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                  {summary.uniqueSkus.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">Total Fisik</div>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {summary.totalPcs.toLocaleString('id-ID')} <span className="text-xs font-normal">pcs</span>
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">
                  Lokasi Terpilih ({selectedLocations.length})
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {selectedLocations.join(', ')}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons: Mode Toggle, Copy, CSV, Print */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* View Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PRINT_PREVIEW')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'PRINT_PREVIEW'
                    ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview A4</span>
              </button>
            </div>

            {/* Copy SKUs */}
            <button
              type="button"
              onClick={handleCopySkus}
              disabled={allSelectedLocationItems.length === 0}
              className="p-2 sm:px-2.5 sm:py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Salin semua SKU unik di lokasi terpilih"
            >
              {hasCopiedSku ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{hasCopiedSku ? 'Tersalin' : 'Salin SKU'}</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={allSelectedLocationItems.length === 0}
              className="px-3 py-1.5 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Unduh file CSV untuk lokasi terpilih"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {/* Print / Save as PDF */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={allSelectedLocationItems.length === 0 || isPrinting}
              className="px-3.5 py-1.5 text-xs font-black bg-amber-500 hover:bg-amber-400 text-black rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Cetak Langsung / Simpan Dokumen PDF A4"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Menyiapkan...' : 'Print PDF A4'}</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            CONTENT AREA: INTERACTIVE TABLE OR REALISTIC A4 PREVIEW
            ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-[#0E1420]">
          {allSelectedLocationItems.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak Ada Produk di Lokasi: {selectedLocations.join(', ')}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Lokasi ini belum memiliki stok fisik tercatat, atau silakan pilih lokasi lain dari daftar di atas.
              </p>
            </div>
          ) : viewMode === 'TABLE' ? (
            /* ========================================================
               INTERACTIVE TABLE VIEW
               ======================================================== */
            <div className="space-y-3">
              {/* Table search filter */}
              <div className="flex items-center gap-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder={`Cari SKU atau nama produk di lokasi ${selectedLocations.join(', ')}...`}
                  className="bg-transparent border-none outline-none text-xs text-slate-900 dark:text-slate-100 w-full placeholder:text-slate-400"
                />
                {itemSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setItemSearchQuery('')}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Data Table */}
              <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-black text-[10px] tracking-wider">
                        <th className="p-3 text-center w-12">No</th>
                        {selectedLocations.length > 1 && (
                          <th className="p-3 text-center w-20">Lokasi</th>
                        )}
                        <th className="p-3">SKU / Barcode</th>
                        <th className="p-3">Nama Produk</th>
                        <th className="p-3 text-center">Size</th>
                        <th className="p-3 text-center">Qty di Rak</th>
                        <th className="p-3 text-center">Total Fisik</th>
                        <th className="p-3">Area</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {filteredLocationItems.map((item, idx) => (
                        <tr
                          key={`${item.lokasi}-${item.sku}-${idx}`}
                          className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors"
                        >
                          <td className="p-3 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          {selectedLocations.length > 1 && (
                            <td className="p-3 text-center font-mono font-bold">
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                {item.lokasi}
                              </span>
                            </td>
                          )}
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {item.sku}
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                            {item.nama_produk || '-'}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {item.size || 'ALL'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                            {item.qty}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400">
                            {item.totalStokFisikGlobal ?? item.qty}
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px]">
                            {item.area || summary.areaStr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-[#111827] border-t-2 border-slate-200 dark:border-slate-700 font-black text-xs">
                        <td
                          colSpan={selectedLocations.length > 1 ? 5 : 4}
                          className="p-3 text-right uppercase tracking-wider"
                        >
                          TOTAL ({filteredLocationItems.length} Baris):
                        </td>
                        <td className="p-3 text-center font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                          {filteredLocationItems.reduce((acc, it) => acc + it.qty, 0)}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {filteredLocationItems.reduce(
                            (acc, it) => acc + (it.totalStokFisikGlobal ?? it.qty),
                            0
                          )}
                        </td>
                        <td className="p-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
               LIVE A4 PAPER PREVIEW
               ======================================================== */
            <div className="space-y-6">
              {selectedLocations.length > 1 && multiPrintMode === 'SEPARATE' ? (
                // Separate Multi-Location Preview
                selectedLocations.map((loc) => {
                  const locItems = itemsByLocation.get(loc) || [];
                  const locMeta = getDocumentMeta(loc);
                  const locTotalPcs = locItems.reduce((acc, it) => acc + it.qty, 0);

                  return (
                    <div
                      key={loc}
                      className="max-w-3xl mx-auto bg-white text-black p-8 rounded-xl shadow-xl border border-slate-300 font-sans text-xs space-y-4 relative"
                    >
                      <div className="border-b-2 border-black pb-3 flex items-start justify-between">
                        <div>
                          <h1 className="text-lg font-black tracking-tight uppercase">
                            WMS CHOCOCHIPS WAREHOUSE
                          </h1>
                          <h2 className="text-sm font-black uppercase text-slate-800">
                            {locMeta.title}
                          </h2>
                          <div className="text-[10.5px] text-slate-500 mt-0.5">
                            {locMeta.subtitle}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase font-black">
                            LOKASI RAK
                          </div>
                          <div className="text-xl font-black font-mono border-2 border-black px-3 py-0.5 bg-amber-100 rounded">
                            {loc}
                          </div>
                        </div>
                      </div>

                      {/* Meta Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[10.5px]">
                        <div>
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">
                            {locMeta.isSJ ? 'No. Dokumen:' : 'Area Gudang:'}
                          </span>
                          <span className="font-bold">
                            {locMeta.isSJ ? customSJNumber || `SJ/WMS/${loc}/...` : summary.areaStr}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">
                            Waktu Cetak:
                          </span>
                          <span className="font-bold">
                            {new Date().toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">
                            {locMeta.isSJ ? 'Tujuan / Vendor:' : 'Total SKU:'}
                          </span>
                          <span className="font-bold">
                            {locMeta.isSJ ? recipientVendor || 'Vendor / Tailor' : `${locItems.length} SKU`}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">
                            Total Qty Fisik:
                          </span>
                          <span className="font-black text-amber-700 font-mono">
                            {locTotalPcs} Pcs
                          </span>
                        </div>
                      </div>

                      {/* Items Table */}
                      <table className="w-full text-left border-collapse border border-black text-[10.5px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-black font-black uppercase text-[9px]">
                            <th className="p-1 border-r border-black text-center w-7">No</th>
                            <th className="p-1 border-r border-black w-32">SKU / Barcode</th>
                            <th className="p-1 border-r border-black">Nama Produk</th>
                            <th className="p-1 border-r border-black text-center w-10">Size</th>
                            <th className="p-1 border-r border-black text-center w-12">Qty</th>
                            {docType === 'AUDIT_SO' ? (
                              <>
                                <th className="p-1 border-r border-black text-center w-14">Fisik</th>
                                <th className="p-1 border-r border-black text-center w-10">+/-</th>
                                <th className="p-1 text-center w-20">Catatan</th>
                              </>
                            ) : docType === 'SURAT_JALAN' ? (
                              <>
                                <th className="p-1 border-r border-black text-center w-12">Satuan</th>
                                <th className="p-1 text-left w-28">Keterangan</th>
                              </>
                            ) : (
                              <>
                                <th className="p-1 border-r border-black text-center w-14">Global</th>
                                <th className="p-1 text-left w-20">Area</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                          {locItems.map((item, idx) => (
                            <tr key={item.sku} className="border-b border-slate-200">
                              <td className="p-1 text-center border-r border-black">{idx + 1}</td>
                              <td className="p-1 font-mono font-bold border-r border-black">{item.sku}</td>
                              <td className="p-1 font-semibold border-r border-black">{item.nama_produk || '-'}</td>
                              <td className="p-1 text-center font-bold border-r border-black">{item.size || 'ALL'}</td>
                              <td className="p-1 text-center font-mono font-bold border-r border-black bg-slate-50">
                                {item.qty}
                              </td>
                              {docType === 'AUDIT_SO' ? (
                                <>
                                  <td className="p-1 border-r border-black" />
                                  <td className="p-1 border-r border-black" />
                                  <td className="p-1" />
                                </>
                              ) : docType === 'SURAT_JALAN' ? (
                                <>
                                  <td className="p-1 text-center text-slate-500 border-r border-black">Pcs</td>
                                  <td className="p-1 text-slate-500">-</td>
                                </>
                              ) : (
                                <>
                                  <td className="p-1 text-center font-mono text-slate-500 border-r border-black">{item.totalStokFisikGlobal ?? item.qty}</td>
                                  <td className="p-1 text-slate-500">{item.area || '-'}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black font-black bg-slate-100">
                            <td colSpan={4} className="p-1 text-right border-r border-black">
                              TOTAL ({locItems.length} SKU):
                            </td>
                            <td className="p-1 text-center border-r border-black font-mono">
                              {locTotalPcs}
                            </td>
                            <td colSpan={3} className="p-1" />
                          </tr>
                        </tfoot>
                      </table>

                      {/* Signatures */}
                      {locMeta.isSJ ? (
                        <div className="grid grid-cols-3 gap-6 pt-3 text-center text-[10px]">
                          <div className="space-y-8">
                            <div className="font-bold">Diserahkan (Warehouse):</div>
                            <div className="border-b border-black w-32 mx-auto" />
                            <div className="text-slate-500 text-[9px]">({senderOfficer})</div>
                          </div>
                          <div className="space-y-8">
                            <div className="font-bold">Dibawa (Driver/Kurir):</div>
                            <div className="border-b border-black w-32 mx-auto" />
                            <div className="text-slate-500 text-[9px]">({driverCourier || 'Kurir'})</div>
                          </div>
                          <div className="space-y-8">
                            <div className="font-bold">Diterima (Pihak Penerima):</div>
                            <div className="border-b border-black w-32 mx-auto" />
                            <div className="text-slate-500 text-[9px]">({recipientVendor})</div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-10 pt-3 text-center text-[10px]">
                          <div className="space-y-8">
                            <div className="font-bold">Petugas Audit / Cek Fisik:</div>
                            <div className="border-b border-black w-36 mx-auto" />
                            <div className="text-slate-500 text-[9px]">({senderOfficer})</div>
                          </div>
                          <div className="space-y-8">
                            <div className="font-bold">Supervisor Gudang:</div>
                            <div className="border-b border-black w-36 mx-auto" />
                            <div className="text-slate-500 text-[9px]">( Tanda Tangan )</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                // Consolidated or Single Preview
                <div className="max-w-3xl mx-auto bg-white text-black p-8 rounded-xl shadow-xl border border-slate-300 font-sans text-xs space-y-4">
                  {/* Header */}
                  <div className="border-b-2 border-black pb-3 flex items-start justify-between">
                    <div>
                      <h1 className="text-lg font-black tracking-tight uppercase">
                        WMS CHOCOCHIPS WAREHOUSE
                      </h1>
                      <h2 className="text-sm font-black uppercase text-slate-800">
                        {getDocumentMeta().title}
                        {selectedLocations.length > 1 && ' (KOMPARASI MULTI-LOKASI)'}
                      </h2>
                      <div className="text-[10.5px] text-slate-500 mt-0.5">
                        {getDocumentMeta().subtitle}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-slate-500 uppercase font-black">
                        LOKASI RAK
                      </div>
                      <div className="text-xl font-black font-mono border-2 border-black px-3 py-0.5 bg-amber-100 rounded">
                        {selectedLocations.join(' + ')}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[10.5px]">
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">
                        {getDocumentMeta().isSJ ? 'No. Dokumen:' : 'Area Gudang:'}
                      </span>
                      <span className="font-bold">
                        {getDocumentMeta().isSJ
                          ? customSJNumber || `SJ/WMS/${selectedLocations[0]}/...`
                          : summary.areaStr}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">
                        Waktu Cetak:
                      </span>
                      <span className="font-bold">
                        {new Date().toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">
                        {getDocumentMeta().isSJ ? 'Tujuan / Vendor:' : 'Total SKU:'}
                      </span>
                      <span className="font-bold">
                        {getDocumentMeta().isSJ
                          ? recipientVendor || 'Vendor / Tailor'
                          : `${summary.uniqueSkus} SKU`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">
                        Total Qty Fisik:
                      </span>
                      <span className="font-black text-amber-700 font-mono">
                        {summary.totalPcs} Pcs
                      </span>
                    </div>
                  </div>

                  {/* Printable Table */}
                  <table className="w-full text-left border-collapse border border-black text-[10.5px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-black font-black uppercase text-[9px]">
                        <th className="p-1 border-r border-black text-center w-7">No</th>
                        {selectedLocations.length > 1 && (
                          <th className="p-1 border-r border-black text-center w-16">Lokasi</th>
                        )}
                        <th className="p-1 border-r border-black w-32">SKU / Barcode</th>
                        <th className="p-1 border-r border-black">Nama Produk</th>
                        <th className="p-1 border-r border-black text-center w-10">Size</th>
                        <th className="p-1 border-r border-black text-center w-12">Qty</th>
                        {docType === 'AUDIT_SO' ? (
                          <>
                            <th className="p-1 border-r border-black text-center w-14">Fisik</th>
                            <th className="p-1 border-r border-black text-center w-10">+/-</th>
                            <th className="p-1 text-center w-20">Catatan</th>
                          </>
                        ) : docType === 'SURAT_JALAN' ? (
                          <>
                            <th className="p-1 border-r border-black text-center w-12">Satuan</th>
                            <th className="p-1 text-left w-28">Keterangan</th>
                          </>
                        ) : (
                          <>
                            <th className="p-1 border-r border-black text-center w-14">Global</th>
                            <th className="p-1 text-left w-20">Area</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {allSelectedLocationItems.map((item, idx) => (
                        <tr key={`${item.lokasi}-${item.sku}-${idx}`} className="border-b border-slate-200">
                          <td className="p-1 text-center border-r border-black">{idx + 1}</td>
                          {selectedLocations.length > 1 && (
                            <td className="p-1 text-center font-mono font-bold border-r border-black bg-amber-50">
                              {item.lokasi}
                            </td>
                          )}
                          <td className="p-1 font-mono font-bold border-r border-black">{item.sku}</td>
                          <td className="p-1 font-semibold border-r border-black">{item.nama_produk || '-'}</td>
                          <td className="p-1 text-center font-bold border-r border-black">{item.size || 'ALL'}</td>
                          <td className="p-1 text-center font-mono font-bold border-r border-black bg-slate-50">
                            {item.qty}
                          </td>
                          {docType === 'AUDIT_SO' ? (
                            <>
                              <td className="p-1 border-r border-black" />
                              <td className="p-1 border-r border-black" />
                              <td className="p-1" />
                            </>
                          ) : docType === 'SURAT_JALAN' ? (
                            <>
                              <td className="p-1 text-center text-slate-500 border-r border-black">Pcs</td>
                              <td className="p-1 text-slate-500">-</td>
                            </>
                          ) : (
                            <>
                              <td className="p-1 text-center font-mono text-slate-500 border-r border-black">{item.totalStokFisikGlobal ?? item.qty}</td>
                              <td className="p-1 text-slate-500">{item.area || '-'}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-black font-black bg-slate-100">
                        <td
                          colSpan={selectedLocations.length > 1 ? 5 : 4}
                          className="p-1 text-right border-r border-black"
                        >
                          TOTAL ({allSelectedLocationItems.length} Baris):
                        </td>
                        <td className="p-1 text-center border-r border-black font-mono">
                          {summary.totalPcs}
                        </td>
                        <td colSpan={3} className="p-1" />
                      </tr>
                    </tfoot>
                  </table>

                  {/* Signatures */}
                  {getDocumentMeta().isSJ ? (
                    <div className="grid grid-cols-3 gap-6 pt-3 text-center text-[10px]">
                      <div className="space-y-8">
                        <div className="font-bold">Diserahkan (Warehouse):</div>
                        <div className="border-b border-black w-32 mx-auto" />
                        <div className="text-slate-500 text-[9px]">({senderOfficer})</div>
                      </div>
                      <div className="space-y-8">
                        <div className="font-bold">Dibawa (Driver/Kurir):</div>
                        <div className="border-b border-black w-32 mx-auto" />
                        <div className="text-slate-500 text-[9px]">({driverCourier || 'Kurir'})</div>
                      </div>
                      <div className="space-y-8">
                        <div className="font-bold">Diterima (Pihak Penerima):</div>
                        <div className="border-b border-black w-32 mx-auto" />
                        <div className="text-slate-500 text-[9px]">({recipientVendor})</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-10 pt-3 text-center text-[10px]">
                      <div className="space-y-8">
                        <div className="font-bold">Petugas Audit / Cek Fisik:</div>
                        <div className="border-b border-black w-36 mx-auto" />
                        <div className="text-slate-500 text-[9px]">({senderOfficer})</div>
                      </div>
                      <div className="space-y-8">
                        <div className="font-bold">Supervisor Gudang:</div>
                        <div className="border-b border-black w-36 mx-auto" />
                        <div className="text-slate-500 text-[9px]">( Tanda Tangan )</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================
            MODAL FOOTER
            ======================================================== */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F30] flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {allSelectedLocationItems.length > 0 ? (
              <span>
                Menampilkan <b>{filteredLocationItems.length}</b> baris dari <b>{selectedLocations.length}</b> lokasi terpilih ({selectedLocations.join(', ')})
              </span>
            ) : (
              <span>Pilih lokasi rak untuk mengekspor atau mencetak data.</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
