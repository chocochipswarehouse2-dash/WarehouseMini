import React, { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Search,
  Upload,
  Download,
  Tag,
  Printer,
  ClipboardPaste,
  Eye,
  EyeOff,
  Trash2,
  Database,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { ProductItem } from '../../types';
import {
  BatchBarcodePrintItem,
  DealPosInventoryData,
  DealPosOutletCol,
  DealPosProductGroup,
  DealPosSkuRow,
  downloadZipBlob,
  parseDealPOSInventoryCsv,
} from '../../utils/csvToolsUtils';
import { BatchBarcodePrintModal } from './BatchBarcodePrintModal';
import { ChecklistPrintModal } from './ChecklistPrintModal';

interface CsvBarcodeViewProps {
  products: ProductItem[];
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

function buildInventoryFromWmsProducts(products: ProductItem[]): DealPosInventoryData {
  const outletSet = new Set<string>();
  const skuMap = new Map<string, DealPosSkuRow>();
  const productMap = new Map<string, DealPosProductGroup>();

  for (const p of products) {
    const sku = String(p.sku || p.k || '').trim();
    if (!sku) continue;
    const skuUpper = sku.toUpperCase();
    const name = String(p.p || sku).trim();
    const variant = String(p.s || '-').trim();
    const category = String(p.category || '').trim();
    const price = String(p.price || 0);

    const stocks: Record<string, number> = {};
    if (Array.isArray(p.locations) && p.locations.length > 0) {
      for (const loc of p.locations) {
        const locName = String(loc.lokasi || 'Warehouse').trim().toUpperCase();
        const qty = Number(loc.qty) || 0;
        if (locName && qty !== 0) {
          stocks[locName] = (stocks[locName] || 0) + qty;
          outletSet.add(locName);
        }
      }
    } else if (p.l && (Number(p.q) || 0) !== 0) {
      const locName = String(p.l).trim().toUpperCase();
      stocks[locName] = Number(p.q) || 0;
      outletSet.add(locName);
    }

    const row: DealPosSkuRow = { sku, name, variant, category, price, stocks };
    skuMap.set(skuUpper, row);

    const groupKey = name || sku;
    let grp = productMap.get(groupKey);
    if (!grp) {
      grp = { name: groupKey, category, variants: [] };
      productMap.set(groupKey, grp);
    }
    grp.variants.push(row);
  }

  const outletCols: DealPosOutletCol[] = Array.from(outletSet)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, idx) => ({ idx, name }));

  return {
    outletCols,
    skuMap,
    productMap,
    totalSkus: skuMap.size,
    sourceLabel: 'Database WMS (Live Lokal)',
  };
}

export const CsvBarcodeView: React.FC<CsvBarcodeViewProps> = ({ products, onNotify }) => {
  const [importedDealPosData, setImportedDealPosData] = useState<DealPosInventoryData | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedProductNames, setSelectedProductNames] = useState<Set<string>>(new Set());
  const [selectedCustomSkus, setSelectedCustomSkus] = useState<Set<string>>(new Set());
  const [outletSearch, setOutletSearch] = useState('');
  const [selectedOutlets, setSelectedOutlets] = useState<Set<string>>(new Set());
  const [hideZeroOutlets, setHideZeroOutlets] = useState(false);

  const [folderName, setFolderName] = useState('CSV_Barcode_Export');
  const [spacePadding, setSpacePadding] = useState(true);
  const [excludeZero, setExcludeZero] = useState(true);
  const [isZipping, setIsZipping] = useState(false);

  // Bulk Paste SKU Modal
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');

  // Print Modals
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeModalOutlets, setBarcodeModalOutlets] = useState<string[]>([]);
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [checklistModalOutlets, setChecklistModalOutlets] = useState<string[]>([]);

  const csvInputRef = useRef<HTMLInputElement>(null);

  const wmsInventoryData = useMemo(() => buildInventoryFromWmsProducts(products), [products]);
  const inventoryData = importedDealPosData || wmsInventoryData;

  const allActiveSkusSet = useMemo(() => {
    const set = new Set<string>();
    selectedProductNames.forEach((pName) => {
      const grp = inventoryData.productMap.get(pName);
      if (grp) {
        grp.variants.forEach((v) => set.add(v.sku.toUpperCase()));
      }
    });
    selectedCustomSkus.forEach((sku) => set.add(sku.toUpperCase()));
    return set;
  }, [inventoryData, selectedProductNames, selectedCustomSkus]);

  const searchResults = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    const results: DealPosProductGroup[] = [];
    for (const grp of inventoryData.productMap.values()) {
      const nameMatch = grp.name.toLowerCase().includes(q) || grp.category.toLowerCase().includes(q);
      const skuMatch = grp.variants.some((v) => v.sku.toLowerCase().includes(q));
      if (nameMatch || skuMatch) {
        results.push(grp);
        if (results.length >= 40) break;
      }
    }
    return results;
  }, [inventoryData, productSearch]);

  const outletUnitsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (allActiveSkusSet.size === 0) return map;
    inventoryData.outletCols.forEach((o) => {
      let total = 0;
      allActiveSkusSet.forEach((skuUpper) => {
        const row = inventoryData.skuMap.get(skuUpper);
        if (row && row.stocks[o.name]) total += row.stocks[o.name];
      });
      map.set(o.name, total);
    });
    return map;
  }, [inventoryData, allActiveSkusSet]);

  const filteredOutlets = useMemo(() => {
    const q = outletSearch.trim().toLowerCase();
    return inventoryData.outletCols.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q)) return false;
      if (hideZeroOutlets && (outletUnitsMap.get(o.name) || 0) <= 0) return false;
      return true;
    });
  }, [inventoryData, outletSearch, hideZeroOutlets, outletUnitsMap]);

  const invMetrics = useMemo(() => {
    let totalUnits = 0;
    let outletsWithStock = 0;
    selectedOutlets.forEach((oName) => {
      const units = outletUnitsMap.get(oName) || 0;
      if (units > 0) outletsWithStock++;
      totalUnits += units;
    });
    return {
      totalSelectedSkus: allActiveSkusSet.size,
      totalUnits,
      outletsWithStock,
    };
  }, [allActiveSkusSet, selectedOutlets, outletUnitsMap]);

  const coveragePercent = useMemo(() => {
    if (inventoryData.outletCols.length === 0) return 0;
    return Math.round((selectedOutlets.size / inventoryData.outletCols.length) * 100);
  }, [inventoryData, selectedOutlets]);

  const itemsByOutletForPrint = useMemo(() => {
    const map = new Map<string, BatchBarcodePrintItem[]>();
    inventoryData.outletCols.forEach((o) => {
      const list: BatchBarcodePrintItem[] = [];
      allActiveSkusSet.forEach((skuUpper) => {
        const row = inventoryData.skuMap.get(skuUpper);
        if (!row) return;
        const qty = row.stocks[o.name] || 0;
        if (qty > 0) {
          list.push({
            sku: row.sku,
            name: row.name,
            variant: row.variant,
            price: row.price,
            qty,
            outlet: o.name,
          });
        }
      });
      if (list.length > 0) map.set(o.name, list);
    });
    return map;
  }, [inventoryData, allActiveSkusSet]);

  const handleImportDealPosCsv = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseDealPOSInventoryCsv(text, file.name);
      setImportedDealPosData(parsed);
      setSelectedOutlets(new Set(parsed.outletCols.map((o) => o.name)));
      onNotify(`CSV DealPOS dimuat: ${parsed.totalSkus.toLocaleString('id-ID')} SKU & ${parsed.outletCols.length} Outlet.`, 'success');
    } catch (err: any) {
      onNotify(err?.message || 'Gagal membaca file CSV Inventory.', 'error');
    }
  };

  const handleToggleProduct = (name: string) => {
    setSelectedProductNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleApplyBulkPaste = () => {
    const tokens = bulkPasteText
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (tokens.length === 0) {
      onNotify('Tempel minimal 1 SKU.', 'warning');
      return;
    }

    let matched = 0;
    setSelectedCustomSkus((prev) => {
      const next = new Set(prev);
      tokens.forEach((t) => {
        if (inventoryData.skuMap.has(t)) {
          next.add(t);
          matched++;
        }
      });
      return next;
    });

    setBulkPasteOpen(false);
    setBulkPasteText('');
    onNotify(`Berhasil menambahkan ${matched} SKU yang cocok dari ${tokens.length} input.`, matched > 0 ? 'success' : 'warning');
  };

  const handlePresetOutlets = (type: 'all' | 'none' | 'has_stock' | 'uncheck_zero' | 'physical' | 'online') => {
    const all = inventoryData.outletCols.map((o) => o.name);
    if (type === 'all') {
      setSelectedOutlets(new Set(all));
    } else if (type === 'none') {
      setSelectedOutlets(new Set());
    } else if (type === 'has_stock') {
      const withStock = all.filter((oName) => (outletUnitsMap.get(oName) || 0) > 0);
      setSelectedOutlets(new Set(withStock));
      onNotify(`Dipilih ${withStock.length} outlet/lokasi yang memiliki stok (>0 pcs).`, 'success');
    } else if (type === 'uncheck_zero') {
      setSelectedOutlets((prev) => {
        const next = new Set<string>();
        prev.forEach((oName) => {
          if ((outletUnitsMap.get(oName) || 0) > 0) next.add(oName);
        });
        return next;
      });
      onNotify('Semua outlet/lokasi dengan Qty 0 berhasil di-uncheck.', 'info');
    } else if (type === 'physical') {
      const physical = all.filter(
        (o) => !o.match(/Shopee|Tokopedia|TikTok|Lazada|Website|Marketplace|Woocommerce|KYTE|ChicShopee|Warehouse|Gudang|Sample|Staff|Defect|Loss|Endorsement|TIKTOK|SHOPEE|STUDIO|IGLIVE/i)
      );
      setSelectedOutlets(new Set(physical));
    } else if (type === 'online') {
      const online = all.filter((o) =>
        o.match(/Shopee|Tokopedia|TikTok|Lazada|Website|Marketplace|Woocommerce|KYTE|ChicShopee|TIKTOK|SHOPEE|STUDIO|IGLIVE/i)
      );
      setSelectedOutlets(new Set(online));
    }
  };

  const handleDownloadZip = async () => {
    if (allActiveSkusSet.size === 0) {
      onNotify('Pilih minimal 1 produk atau SKU di Langkah 1.', 'warning');
      return;
    }
    if (selectedOutlets.size === 0) {
      onNotify('Pilih minimal 1 outlet/lokasi tujuan di Langkah 2.', 'warning');
      return;
    }

    setIsZipping(true);
    const cleanFolder = (folderName || 'CSV_Barcode_Export').trim().replace(/[\\/*?:"<>|]/g, '_');
    try {
      const zip = new JSZip();
      const folder = zip.folder(cleanFolder);
      let count = 0;

      selectedOutlets.forEach((oName) => {
        let csv = 'Code,Quantity,UnitCost,Serial\r\n';
        let rowsCount = 0;
        allActiveSkusSet.forEach((skuUpper) => {
          const row = inventoryData.skuMap.get(skuUpper);
          if (!row) return;
          const qty = row.stocks[oName] || 0;
          if (!excludeZero || qty > 0) {
            csv += spacePadding ? `${row.sku}, ${qty} ,,\r\n` : `${row.sku},${qty},,\r\n`;
            rowsCount++;
          }
        });
        if (!excludeZero || rowsCount > 0) {
          const fileName = `${oName.replace(/[\\/*?:"<>|]/g, '_')}.csv`;
          folder?.file(fileName, csv);
          count++;
        }
      });

      if (count === 0) {
        onNotify('Tidak ada stok > 0 untuk kombinasi SKU dan outlet yang dipilih.', 'warning');
        return;
      }

      await downloadZipBlob(zip, `${cleanFolder}.zip`);
      onNotify(`Berhasil download ${cleanFolder}.zip (${count} file CSV DealPOS).`, 'success');
    } catch (err: any) {
      onNotify(err?.message || 'Gagal membuat file ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const openPrintBarcode = (singleOutlet?: string) => {
    if (allActiveSkusSet.size === 0) {
      onNotify('Pilih minimal 1 produk/SKU terlebih dahulu.', 'warning');
      return;
    }
    const targets = singleOutlet
      ? [singleOutlet]
      : Array.from(selectedOutlets).filter((o) => (outletUnitsMap.get(o) || 0) > 0);
    if (targets.length === 0) {
      onNotify('Tidak ada outlet terpilih dengan stok > 0.', 'warning');
      return;
    }
    setBarcodeModalOutlets(targets);
    setBarcodeModalOpen(true);
  };

  const openPrintChecklist = (singleOutlet?: string) => {
    if (allActiveSkusSet.size === 0) {
      onNotify('Pilih minimal 1 produk/SKU terlebih dahulu.', 'warning');
      return;
    }
    const targets = singleOutlet
      ? [singleOutlet]
      : Array.from(selectedOutlets).filter((o) => (outletUnitsMap.get(o) || 0) > 0);
    if (targets.length === 0) {
      onNotify('Tidak ada outlet terpilih dengan stok > 0.', 'warning');
      return;
    }
    setChecklistModalOutlets(targets);
    setChecklistModalOpen(true);
  };

  return (
    <div className="w-full max-w-full px-2 sm:px-4 lg:px-6 py-4 space-y-5">
      {/* Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              CSV Barcode &amp; Export Outlet DealPOS
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {inventoryData.sourceLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Pilih produk/SKU lalu export CSV DealPOS per outlet/lokasi dalam 1 ZIP atau cetak stiker barcode &amp; ceklis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportDealPosCsv(f);
              e.target.value = '';
            }}
          />
          {importedDealPosData && (
            <button
              type="button"
              onClick={() => {
                setImportedDealPosData(null);
                setSelectedOutlets(new Set());
                onNotify('Kembali menggunakan Database WMS Lokal.', 'info');
              }}
              className="h-9 px-3 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Pakai DB WMS</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV DealPOS</span>
          </button>
          <button
            type="button"
            disabled={isZipping || allActiveSkusSet.size === 0 || selectedOutlets.size === 0}
            onClick={handleDownloadZip}
            className="h-9 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isZipping ? 'Membuat ZIP...' : 'Download ZIP'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Step 1 & Step 2 */}
        <div className="lg:col-span-8 space-y-5">
          {/* Langkah 1: Pilih Produk & SKU */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Langkah 1</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Pilih Produk &amp; SKU Tertentu
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkPasteOpen(true)}
                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Tempel Banyak SKU</span>
                </button>
                {allActiveSkusSet.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductNames(new Set());
                      setSelectedCustomSkus(new Set());
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dropsearch */}
            <div className="relative z-30">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Ketik nama produk, kategori, atau barcode SKU..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearch('');
                      setIsDropdownOpen(false);
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isDropdownOpen && productSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-72 overflow-y-auto p-1.5">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Ditemukan {searchResults.length} hasil</span>
                    <div className="flex items-center gap-3">
                      {searchResults.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProductNames((prev) => {
                              const next = new Set(prev);
                              searchResults.forEach((p) => next.add(p.name));
                              return next;
                            });
                            setIsDropdownOpen(false);
                          }}
                          className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Pilih Semua Hasil
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>

                  {searchResults.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400">
                      Tidak ada produk yang cocok dengan "{productSearch}"
                    </div>
                  ) : (
                    searchResults.map((prod) => {
                      const isSelected = selectedProductNames.has(prod.name);
                      return (
                        <button
                          key={prod.name}
                          type="button"
                          onClick={() => handleToggleProduct(prod.name)}
                          className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/40'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {prod.name}
                              </span>
                              {prod.category && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  {prod.category}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {prod.variants.length} Varian • {prod.variants.slice(0, 4).map((v) => v.variant).join(', ')}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isSelected ? '✓ Terpilih' : '+ Pilih'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected Chips */}
            <div>
              <div className="text-xs text-slate-500 mb-2">
                Produk Terpilih (<b>{selectedProductNames.size}</b> Produk • <b className="text-indigo-600 dark:text-indigo-400">{allActiveSkusSet.size}</b> SKU)
              </div>
              {selectedProductNames.size === 0 && selectedCustomSkus.size === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                  Belum ada produk dipilih. Cari produk di atas atau gunakan tombol <b>Tempel Banyak SKU</b>.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {Array.from(selectedProductNames).map((pName) => {
                    const grp = inventoryData.productMap.get(pName);
                    return (
                      <span
                        key={pName}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5"
                      >
                        <span>{pName}</span>
                        <span className="text-[10px] opacity-75">({grp?.variants.length || 0})</span>
                        <button type="button" onClick={() => handleToggleProduct(pName)} className="hover:text-rose-600 font-bold">
                          ✕
                        </button>
                      </span>
                    );
                  })}
                  {Array.from(selectedCustomSkus).map((sku) => (
                    <span
                      key={sku}
                      className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5"
                    >
                      <span>{sku}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCustomSkus((prev) => {
                            const next = new Set(prev);
                            next.delete(sku);
                            return next;
                          })
                        }
                        className="hover:text-rose-600 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Langkah 2: Pilih Outlet / Lokasi Tujuan */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Langkah 2</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Pilih Outlet / Lokasi Tujuan Export ({inventoryData.outletCols.length})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('all')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('has_stock')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                >
                  ⚡ Ada Qty (&gt;0)
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('uncheck_zero')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                >
                  Uncheck Qty 0
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('physical')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Store Fisik
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('online')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetOutlets('none')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={outletSearch}
                  onChange={(e) => setOutletSearch(e.target.value)}
                  placeholder="Cari outlet atau kode rak (contoh: CPJ, Shopee, A001)..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setHideZeroOutlets((v) => !v)}
                className={`h-8 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 ${
                  hideZeroOutlets
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {hideZeroOutlets ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{hideZeroOutlets ? 'Hanya Qty > 0' : 'Tampilkan Semua'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-96 overflow-y-auto pr-1">
              {filteredOutlets.map((o) => {
                const isChecked = selectedOutlets.has(o.name);
                const units = outletUnitsMap.get(o.name) || 0;
                return (
                  <div
                    key={o.name}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-1.5 ${
                      isChecked
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700'
                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOutlets((prev) => {
                          const next = new Set(prev);
                          if (isChecked) next.delete(o.name);
                          else next.add(o.name);
                          return next;
                        });
                      }}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                    >
                      <input type="checkbox" checked={isChecked} readOnly className="rounded text-indigo-600 shrink-0" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">{o.name}</span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          units > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {units}
                      </span>
                      <button
                        type="button"
                        onClick={() => openPrintBarcode(o.name)}
                        title={`Cetak Barcode ${o.name}`}
                        className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openPrintChecklist(o.name)}
                        title={`Cetak Ceklis ${o.name}`}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <Printer className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Summary & Actions */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ringkasan Outlet &amp; Stok</h3>

            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100 dark:text-slate-800"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-indigo-600"
                    strokeDasharray={`${coveragePercent}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">{coveragePercent}%</span>
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Outlet</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Outlet:</span>
                  <b className="text-slate-900 dark:text-white">{inventoryData.outletCols.length}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dipilih:</span>
                  <b className="text-slate-900 dark:text-white">{selectedOutlets.size}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ada Stok:</span>
                  <b className="text-emerald-600 dark:text-emerald-400">{invMetrics.outletsWithStock}</b>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] text-slate-500">Total Unit Siap</div>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {invMetrics.totalUnits.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] text-slate-500">SKU Terpilih</div>
                <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                  {invMetrics.totalSelectedSkus}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={allActiveSkusSet.size === 0 || selectedOutlets.size === 0}
                onClick={() => openPrintBarcode()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Tag className="w-4 h-4 text-indigo-600" />
                <span>Cetak Barcode / QR Toko Terpilih</span>
              </button>

              <button
                type="button"
                disabled={allActiveSkusSet.size === 0 || selectedOutlets.size === 0}
                onClick={() => openPrintChecklist()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4 text-amber-600" />
                <span>Cetak Lembar Ceklis (A4)</span>
              </button>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Nama Folder Hasil Download:
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spacePadding}
                    onChange={(e) => setSpacePadding(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-slate-600 dark:text-slate-300">
                    Format spasi MAP (<code className="font-mono text-indigo-600">Code, Qty ,,</code>)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeZero}
                    onChange={(e) => setExcludeZero(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-slate-600 dark:text-slate-300">Abaikan produk Qty 0</span>
                </label>
              </div>

              <button
                type="button"
                disabled={isZipping || allActiveSkusSet.size === 0 || selectedOutlets.size === 0}
                onClick={handleDownloadZip}
                className="w-full py-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isZipping ? 'Membuat ZIP...' : 'Download 1 Folder ZIP'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Tempel Banyak SKU */}
      {bulkPasteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Tempel Banyak SKU</h3>
              <button type="button" onClick={() => setBulkPasteOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Tempel daftar SKU dipisahkan baris baru, koma, atau spasi tab dari Excel.
            </p>
            <textarea
              rows={7}
              value={bulkPasteText}
              onChange={(e) => setBulkPasteText(e.target.value)}
              placeholder={'Contoh:\nZF260101-S\nZF260101-M\nZF260101-L'}
              className="w-full p-3 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPasteOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyBulkPaste}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Tambahkan SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Barcode Print Modal */}
      <BatchBarcodePrintModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        title="Cetak Stiker Barcode / QR — CSV Barcode"
        itemsByOutlet={itemsByOutletForPrint}
        initialSelectedOutlets={barcodeModalOutlets}
        onNotify={onNotify}
      />

      {/* Checklist A4 Print Modal */}
      <ChecklistPrintModal
        isOpen={checklistModalOpen}
        onClose={() => setChecklistModalOpen(false)}
        title="Lembar Ceklis Stok Outlet"
        subtitle={`Sumber: ${inventoryData.sourceLabel}`}
        itemsByOutlet={itemsByOutletForPrint}
        selectedOutlets={checklistModalOutlets}
      />
    </div>
  );
};
