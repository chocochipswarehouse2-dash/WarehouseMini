import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  Plus,
  Trash2,
  Search,
  Upload,
  Layers,
  Sparkles,
  QrCode,
  Store,
  FileSpreadsheet,
} from 'lucide-react';
import { ProductItem, UserSession } from '../types';
import {
  ProductBarcodeItem,
  BarcodeCustomizerSettings,
  DEFAULT_BARCODE_SETTINGS,
  formatProductPriceWithTag,
  getProductMasterPrice,
  parseBarcodeProductInfo,
  isRealSize,
} from './CetakBarcode/types';
import { TabInputManual } from './CetakBarcode/TabInputManual';
import { TabKatalogMultiSelect } from './CetakBarcode/TabKatalogMultiSelect';
import { TabImportCsv } from './CetakBarcode/TabImportCsv';
import { LabelCustomizerPreview } from './CetakBarcode/LabelCustomizerPreview';

const SETTINGS_KEY = 'wms_barcode_print_settings_v3';
const QUEUE_STORAGE_KEY = 'wms_barcode_print_queue_v3';

interface CetakBarcodeProdukViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const CetakBarcodeProdukView: React.FC<CetakBarcodeProdukViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  // Navigation Tabs: 'catalog_multi' | 'manual' | 'import'
  const [activeTab, setActiveTab] = useState<'catalog_multi' | 'manual' | 'import'>('catalog_multi');

  // Customizer Settings
  const [settings, setSettings] = useState<BarcodeCustomizerSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return { ...DEFAULT_BARCODE_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to load barcode print settings:', e);
    }
    return DEFAULT_BARCODE_SETTINGS;
  });

  const updateSettings = useCallback((patch: Partial<BarcodeCustomizerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save barcode print settings:', e);
      }
      return next;
    });
  }, []);

  // Print Queue
  const [queue, setQueue] = useState<ProductBarcodeItem[]>(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load queue:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save queue:', e);
    }
  }, [queue]);

  // Form State for Manual Input Tab
  const [formSku, setFormSku] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formSize, setFormSize] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formLokasi, setFormLokasi] = useState('');
  const [formCopies, setFormCopies] = useState<number>(1);

  // Queue Filter & Preview
  const [queueSearchQuery, setQueueSearchQuery] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const [qrCache, setQrCache] = useState<Record<string, string>>({});

  // Catalog Map lookup by SKU lowercase
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    productCatalog.forEach((p) => {
      if (p.k) map.set(p.k.toLowerCase().trim(), p);
      if (typeof (p as any).sku === 'string' && (p as any).sku) {
        map.set((p as any).sku.toLowerCase().trim(), p);
      }
    });
    return map;
  }, [productCatalog]);

  // Generate QR Data URLs
  const generateQrDataUrl = useCallback(async (text: string): Promise<string> => {
    try {
      return await QRCode.toDataURL(text, {
        errorCorrectionLevel: 'M',
        margin: 0,
        scale: 6,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.error('Error generating QR:', err);
      return '';
    }
  }, []);

  // Sync QR Cache for queue items
  useEffect(() => {
    const unCached = queue.filter((i) => !qrCache[i.sku]);
    if (unCached.length === 0) return;

    let isMounted = true;
    (async () => {
      const newEntries: Record<string, string> = {};
      for (const item of unCached) {
        if (!newEntries[item.sku]) {
          const url = await generateQrDataUrl(item.sku);
          if (url) newEntries[item.sku] = url;
        }
      }
      if (isMounted && Object.keys(newEntries).length > 0) {
        setQrCache((prev) => ({ ...prev, ...newEntries }));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [queue, qrCache, generateQrDataUrl]);

  // Queue stats
  const selectedItems = useMemo(() => queue.filter((i) => i.selected !== false), [queue]);
  const totalSelectedCopies = useMemo(
    () => selectedItems.reduce((acc, i) => acc + (i.copies || 1), 0),
    [selectedItems]
  );
  const totalAllCopies = useMemo(() => queue.reduce((acc, i) => acc + (i.copies || 1), 0), [queue]);

  const filteredQueue = useMemo(() => {
    if (!queueSearchQuery.trim()) return queue;
    const q = queueSearchQuery.toLowerCase().trim();
    return queue.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q) ||
        (item.lokasi && item.lokasi.toLowerCase().includes(q))
    );
  }, [queue, queueSearchQuery]);

  // Preview current item
  const currentPreviewItem = selectedItems[previewIndex] || selectedItems[0] || queue[0] || null;

  // Add Single Item to Queue
  const handleAddToQueue = (newItem: Omit<ProductBarcodeItem, 'id' | 'selected'>) => {
    setQueue((prev) => {
      const existingIdx = prev.findIndex((i) => i.sku.toLowerCase() === newItem.sku.toLowerCase());
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          copies: updated[existingIdx].copies + newItem.copies,
          nama: newItem.nama || updated[existingIdx].nama,
          size: newItem.size || updated[existingIdx].size,
          price: newItem.price !== undefined ? newItem.price : updated[existingIdx].price,
          lokasi: newItem.lokasi || updated[existingIdx].lokasi,
          selected: true,
        };
        return updated;
      } else {
        return [
          {
            ...newItem,
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            selected: true,
          },
          ...prev,
        ];
      }
    });
    onShowToast?.(`Berhasil menambahkan ${newItem.sku} (${newItem.copies} stiker)`, 'success');
  };

  // Add Multiple Items to Queue
  const handleAddMultipleToQueue = (newItems: Omit<ProductBarcodeItem, 'id' | 'selected'>[]) => {
    setQueue((prev) => {
      const map = new Map<string, ProductBarcodeItem>();
      prev.forEach((item) => map.set(item.sku.toLowerCase(), { ...item }));

      newItems.forEach((newItem) => {
        const key = newItem.sku.toLowerCase();
        if (map.has(key)) {
          const exist = map.get(key)!;
          exist.copies += newItem.copies;
          if (newItem.nama) exist.nama = newItem.nama;
          if (newItem.size) exist.size = newItem.size;
          if (newItem.price !== undefined) exist.price = newItem.price;
          if (newItem.lokasi) exist.lokasi = newItem.lokasi;
          exist.selected = true;
        } else {
          map.set(key, {
            ...newItem,
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            selected: true,
          });
        }
      });

      return Array.from(map.values());
    });
  };

  // Queue Operations
  const handleToggleSelect = (id: string) => {
    setQueue((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: i.selected === false } : i))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setQueue((prev) => prev.map((i) => ({ ...i, selected: select })));
  };

  const handleUpdateCopies = (id: string, delta: number) => {
    setQueue((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          const next = Math.max(1, (i.copies || 1) + delta);
          return { ...i, copies: next };
        }
        return i;
      })
    );
  };

  const handleSetCopies = (id: string, copies: number) => {
    setQueue((prev) =>
      prev.map((i) => (i.id === id ? { ...i, copies: Math.max(1, copies) } : i))
    );
  };

  const handleDeleteItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const handleDeleteSelected = () => {
    setQueue((prev) => prev.filter((i) => i.selected === false));
    onShowToast?.('Item terpilih berhasil dihapus dari antrean.', 'info');
  };

  const handleClearQueue = () => {
    if (window.confirm('Kosongkan semua item dalam antrean cetak?')) {
      setQueue([]);
      onShowToast?.('Antrean cetak telah dikosongkan.', 'info');
    }
  };

  // Print Execution Engine
  const handlePrintBarcodes = async () => {
    if (selectedItems.length === 0) {
      onShowToast?.('Pilih minimal 1 item untuk dicetak.', 'warning');
      return;
    }

    setIsPrinting(true);
    onShowToast?.(`Mempersiapkan ${totalSelectedCopies} lembar stiker barcode...`, 'info');

    try {
      // 1. Ensure all QR images are ready
      const qrDataMap: Record<string, string> = { ...qrCache };
      for (const item of selectedItems) {
        if (!qrDataMap[item.sku]) {
          qrDataMap[item.sku] = await generateQrDataUrl(item.sku);
        }
      }
      setQrCache(qrDataMap);

      // 2. Derive Layout and Sizing Variables
      const isLandscape = settings.printOrientation === 'landscape';
      const pageOrientation = isLandscape ? 'landscape' : 'portrait';
      const stickerW = isLandscape ? '50mm' : '20mm';
      const stickerH = isLandscape ? '20mm' : '50mm';

      const qrMmSize =
        settings.qrSizePreset === 'small'
          ? '11.5mm'
          : settings.qrSizePreset === 'large'
          ? '15.0mm'
          : settings.qrSizePreset === 'xlarge'
          ? '16.5mm'
          : '13.5mm';

      const titlePt =
        settings.titleFontSizePreset === 'small'
          ? '7.5pt'
          : settings.titleFontSizePreset === 'large'
          ? '9.8pt'
          : settings.titleFontSizePreset === 'xlarge'
          ? '11pt'
          : '8.8pt';

      const variantPt =
        settings.titleFontSizePreset === 'small'
          ? '7.0pt'
          : settings.titleFontSizePreset === 'large'
          ? '8.8pt'
          : settings.titleFontSizePreset === 'xlarge'
          ? '9.8pt'
          : '8.0pt';

      const pricePt =
        settings.priceFontSizePreset === 'small'
          ? '9.5pt'
          : settings.priceFontSizePreset === 'large'
          ? '13.5pt'
          : settings.priceFontSizePreset === 'xlarge'
          ? '15.5pt'
          : '11.5pt';

      const titleWeight = Number(settings.titleFontWeight);
      const priceWeight = Number(settings.priceFontWeight);

      // 3. Build HTML for Printable Labels
      const stickerHtmlList: string[] = [];

      selectedItems.forEach((item) => {
        const qrUrl = qrDataMap[item.sku] || '';
        const copies = Math.max(1, item.copies || 1);

        const parsed = parseBarcodeProductInfo(
          item.nama,
          item.size,
          settings.showProductName,
          settings.showSize
        );

        const effectivePrice =
          item.price || getProductMasterPrice(catalogMap.get(item.sku.toLowerCase()));
        const priceText = formatProductPriceWithTag(
          effectivePrice,
          settings.priceTagMode,
          settings.customPricePrefix
        );

        const labelContent = `
          <div class="sticker-card ${isLandscape ? 'mode-landscape' : 'mode-portrait'} ${
          settings.isRotated180 ? 'rotated-180' : ''
        }">
            <div class="qr-box">
              <img src="${qrUrl}" alt="${escapeHtml(item.sku)}" class="qr-img" />
            </div>
            <div class="info-box">
              ${
                settings.titleLayoutMode === 'single'
                  ? `<div class="title-text" style="font-size: ${titlePt}; font-weight: ${titleWeight};">
                      ${escapeHtml([parsed.titleLine, parsed.variantLine].filter(Boolean).join(' - '))}
                     </div>`
                  : `
                    ${
                      parsed.titleLine
                        ? `<div class="title-text" style="font-size: ${titlePt}; font-weight: ${titleWeight};">${escapeHtml(
                            parsed.titleLine
                          )}</div>`
                        : ''
                    }
                    ${
                      parsed.variantLine
                        ? `<div class="variant-text" style="font-size: ${variantPt}; font-weight: ${
                            titleWeight > 600 ? 600 : 500
                          };">${escapeHtml(parsed.variantLine)}</div>`
                        : ''
                    }
                  `
              }
              <div class="sku-text">
                <span>${escapeHtml(item.sku)}</span>
                ${
                  settings.showLocation && item.lokasi
                    ? `<span class="location-tag">[${escapeHtml(item.lokasi)}]</span>`
                    : ''
                }
              </div>
              ${
                settings.showPrice && priceText
                  ? `<div class="price-text" style="font-size: ${pricePt}; font-weight: ${priceWeight};">${escapeHtml(
                      priceText
                    )}</div>`
                  : ''
              }
            </div>
          </div>
        `;

        for (let i = 0; i < copies; i++) {
          stickerHtmlList.push(labelContent);
        }
      });

      // 4. Create Hidden IFrame
      let iframe = document.getElementById('barcode-thermal-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'barcode-thermal-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) throw new Error('Could not access print frame document');

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Cetak Barcode Produk</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700;800;900&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: ${stickerW} ${stickerH} ${pageOrientation};
              margin: 0 !important;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              width: 100%;
              height: 100%;
              background: #fff;
              color: #000;
              font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .sticker-card {
              width: ${stickerW};
              height: ${stickerH};
              page-break-after: always;
              break-after: page;
              overflow: hidden;
              background: #fff;
              display: flex;
              align-items: center;
              box-sizing: border-box;
            }
            .sticker-card.mode-landscape {
              flex-direction: row;
              justify-content: flex-start;
              padding: 1mm 1.5mm 1mm 1.5mm;
            }
            .sticker-card.mode-portrait {
              flex-direction: column;
              justify-content: center;
              text-align: center;
              padding: 1.5mm 1mm;
            }
            .sticker-card.rotated-180 {
              transform: rotate(180deg);
            }
            .qr-box {
              width: ${qrMmSize};
              height: ${qrMmSize};
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .mode-landscape .qr-box {
              margin-right: 1.5mm;
            }
            .mode-portrait .qr-box {
              margin-bottom: 1.5mm;
            }
            .qr-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: pixelated;
            }
            .info-box {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              justify-content: center;
              overflow: hidden;
            }
            .mode-landscape .info-box {
              text-align: left;
            }
            .mode-portrait .info-box {
              text-align: center;
            }
            .title-text {
              color: #000;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.15;
              letter-spacing: -0.01em;
            }
            .variant-text {
              color: #111;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.15;
              margin-top: 0.2mm;
              letter-spacing: -0.01em;
            }
            .sku-text {
              font-family: 'JetBrains Mono', monospace;
              font-size: 6.8pt;
              font-weight: 700;
              color: #333;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.1;
              margin: 0.3mm 0;
            }
            .location-tag {
              font-size: 6pt;
              font-weight: 800;
              color: #555;
              margin-left: 0.5mm;
            }
            .price-text {
              color: #000;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.1;
              letter-spacing: -0.01em;
              margin-top: 0.2mm;
            }
          </style>
        </head>
        <body>
          ${stickerHtmlList.join('')}
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        setIsPrinting(false);
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 500);
    } catch (err) {
      console.error('Print execution failed:', err);
      setIsPrinting(false);
      onShowToast?.('Gagal menjalankan proses cetak printer thermal.', 'error');
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
                <span className="px-2.5 py-0.5 text-[11px] font-black uppercase bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full">
                  Thermal Direct Label
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cetak barcode satuan, multi-choice master katalog, berdasarkan stok outlet/store, atau import massal Excel/CSV.
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
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
        {/* Left Column: 3 Input Modes (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            {/* Input Navigation Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 p-1.5 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('catalog_multi')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'catalog_multi'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Pilih List Produk &amp; Stok Toko</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'manual'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Cetak Satuan / Ketik Manual</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'import'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV / Excel</span>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {/* TAB 1: LIST PRODUK MULTI-SELECT & OUTLET STOCK */}
              {activeTab === 'catalog_multi' && (
                <TabKatalogMultiSelect
                  productCatalog={productCatalog}
                  onAddMultipleToQueue={handleAddMultipleToQueue}
                  onShowToast={onShowToast}
                />
              )}

              {/* TAB 2: MANUAL SATUAN INPUT */}
              {activeTab === 'manual' && (
                <TabInputManual
                  productCatalog={productCatalog}
                  catalogMap={catalogMap}
                  onAddToQueue={handleAddToQueue}
                  formSku={formSku}
                  setFormSku={setFormSku}
                  formNama={formNama}
                  setFormNama={setFormNama}
                  formSize={formSize}
                  setFormSize={setFormSize}
                  formPrice={formPrice}
                  setFormPrice={setFormPrice}
                  formLokasi={formLokasi}
                  setFormLokasi={setFormLokasi}
                  formCopies={formCopies}
                  setFormCopies={setFormCopies}
                />
              )}

              {/* TAB 3: IMPORT EXCEL / CSV & TEMPLATE */}
              {activeTab === 'import' && (
                <TabImportCsv
                  catalogMap={catalogMap}
                  onAddMultipleToQueue={handleAddMultipleToQueue}
                  onShowToast={onShowToast}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Realistic Preview & Settings (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <LabelCustomizerPreview
            settings={settings}
            onUpdateSettings={updateSettings}
            currentPreviewItem={currentPreviewItem}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            totalSelectedItems={selectedItems.length}
            qrCache={qrCache}
            catalogMap={catalogMap}
          />
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
            <span className="px-2.5 py-0.5 text-xs font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-full">
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
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Antrean Cetak Barcode Kosong
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Pilih produk dari list katalog di atas, gunakan input manual satuan, atau import massal dari file Excel/CSV.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-black uppercase tracking-wider text-[11px]">
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
                  <th className="py-3 px-3">Nama Produk &amp; Varian</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Harga</th>
                  <th className="py-3 px-3">Lokasi Rak</th>
                  <th className="py-3 px-3 text-center w-36">Jumlah Stiker</th>
                  <th className="py-3 px-4 text-right w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                {filteredQueue.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-colors ${
                      item.selected !== false ? 'bg-purple-50/10' : 'opacity-60'
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
                    <td className="py-3 px-3 font-black text-slate-900 dark:text-white font-mono">
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
                        const pr =
                          item.price || getProductMasterPrice(catalogMap.get(item.sku.toLowerCase()));
                        return pr ? (
                          <span className="font-black text-purple-700 dark:text-purple-300">
                            {formatProductPriceWithTag(pr, settings.priceTagMode, settings.customPricePrefix)}
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
    </div>
  );
};
export default CetakBarcodeProdukView;
