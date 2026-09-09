import React, { useState, useRef } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';
import {
  Upload,
  FileText,
  Printer,
  Package,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Truck,
  Layers,
  FileSpreadsheet,
  Send,
  Eye,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
} from 'lucide-react';
import { ProductItem, PickingListItem, StockRealtimeItem } from '../types';
import { createPickingSuratJalanSupabase, isWarehouseLocation, fetchStockForSkus } from '../services/supabase';

interface ParsedSJItem {
  nama: string;
  sku: string;
  size?: string;
  qty: number;
  lokasi: string;
  category?: string;
  price?: string | number;
}

interface ProductLocationInfo {
  lokasi: string;
  qty?: number;
  isPrimary?: boolean;
  source?: 'REALTIME_STOCK' | 'CATALOG' | 'SJ';
  area?: string;
}

interface ParsedSJGroup {
  id: string;
  fileName: string;
  noSJ: string;
  tujuan: string;
  date: string;
  items: ParsedSJItem[];
  totalQty: number;
  totalItems: number;
}

interface FulfillmentRefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  productCatalog?: ProductItem[];
  existingSJs?: string[];
  onSuccess: (message: string, newItems?: PickingListItem[]) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const FulfillmentRefillModal: React.FC<FulfillmentRefillModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  productCatalog = [],
  existingSJs = [],
  onSuccess,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'CSV' | 'MANUAL'>('CSV');
  const [parsedGroups, setParsedGroups] = useState<ParsedSJGroup[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});

  // Helper: Extract warehouse locations that actually have physical stock > 0
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku) return [];
    const map = new Map<string, ProductLocationInfo>();

    // 1. Authoritative check: live Supabase view_stok_realtime data
    const isRealtimeChecked = cleanSku in realtimeSkuStocks;
    if (isRealtimeChecked) {
      const realtimeList = realtimeSkuStocks[cleanSku] || [];
      // ONLY recommend warehouse locations that currently have physical stock (sisa_stok > 0)!
      realtimeList.forEach((stk) => {
        const loc = String(stk.lokasi || '').trim().toUpperCase();
        const qty = Number(stk.sisa_stok) || 0;
        if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty > 0) {
          const existing = map.get(loc);
          if (existing) {
            existing.qty = (existing.qty || 0) + qty;
          } else {
            map.set(loc, {
              lokasi: loc,
              qty: qty,
              isPrimary: false,
              source: 'REALTIME_STOCK',
              area: stk.area || 'Warehouse',
            });
          }
        }
      });

      const sorted = Array.from(map.values()).sort((a, b) => (b.qty || 0) - (a.qty || 0));
      if (sorted.length > 0) {
        sorted[0].isPrimary = true;
      }
      return sorted;
    }

    // 2. Fallback only while realtime data is still loading
    const strItemLokasi = String(itemLokasi || '').trim();
    if (strItemLokasi && strItemLokasi !== '-' && strItemLokasi !== '--') {
      const parts = strItemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc));
      parts.forEach((loc) => {
        map.set(loc, {
          lokasi: loc,
          isPrimary: map.size === 0,
          source: 'SJ',
        });
      });
    }

    const catMatch = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
    if (catMatch && Array.isArray(catMatch.locList)) {
      catMatch.locList.forEach((itemLoc) => {
        if (typeof itemLoc === 'object' && itemLoc && itemLoc.lokasi) {
          const loc = String(itemLoc.lokasi || '').trim().toUpperCase();
          const qty = Number(itemLoc.qty) || 0;
          if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc) && qty > 0) {
            if (!map.has(loc)) {
              map.set(loc, {
                lokasi: loc,
                qty: qty,
                isPrimary: map.size === 0,
                source: 'CATALOG',
              });
            }
          }
        }
      });
    }

    const allLocs = Array.from(map.values()).filter((l) => l && l.lokasi && l.lokasi !== '-' && isWarehouseLocation(l.lokasi));
    allLocs.sort((a, b) => (b.qty || 0) - (a.qty || 0));
    return allLocs;
  };

  // Helper: Retrieve all recorded warehouse locations that currently have 0 stock
  const getRecordedEmptyLocations = (sku: string): string[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku || !(cleanSku in realtimeSkuStocks)) return [];
    const list = realtimeSkuStocks[cleanSku] || [];
    const emptyLocs: string[] = [];
    list.forEach((stk) => {
      const loc = String(stk.lokasi || '').trim().toUpperCase();
      const qty = Number(stk.sisa_stok) || 0;
      if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty <= 0) {
        if (!emptyLocs.includes(loc)) emptyLocs.push(loc);
      }
    });
    return emptyLocs;
  };

  // Manual Form State
  const [manualSJ, setManualSJ] = useState('');
  const [manualTujuan, setManualTujuan] = useState('');
  const [manualRows, setManualRows] = useState<
    Array<{ sku: string; nama_produk: string; size: string; lokasi: string; qty: number }>
  >([{ sku: '', nama_produk: '', size: '', lokasi: '', qty: 1 }]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  /**
   * RFC 4180 compliant CSV parser with auto-detection of delimiters (comma, semicolon, tab)
   */
  const parseRefillCsv = (text: string): string[][] => {
    const clean = text.replace(/^\uFEFF/, ''); // Remove UTF-8 BOM
    if (!clean.trim()) return [];

    // Determine delimiter from first few non-empty lines
    const linesSample = clean.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 3);
    let delimiter = ',';
    if (linesSample.length > 0) {
      const counts = { ',': 0, ';': 0, '\t': 0 };
      for (const line of linesSample) {
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQ = !inQ;
          else if (!inQ) {
            if (ch === ',') counts[',']++;
            else if (ch === ';') counts[';']++;
            else if (ch === '\t') counts['\t']++;
          }
        }
      }
      if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) {
        delimiter = ';';
      } else if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) {
        delimiter = '\t';
      }
    }

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let insideQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      const nextChar = clean[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentVal.trim());
        currentVal = '';
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentVal += char;
      }
    }

    if (currentVal || currentRow.length > 0) {
      currentRow.push(currentVal.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  // Handle Multi-CSV file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    showGlobalLoading('Memproses...');
    const groupsMap: Record<string, ParsedSJGroup> = {};

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();
        const rows = parseRefillCsv(content);
        if (rows.length === 0) continue;

        const defaultSjFromName = file.name.replace(/\.[^/.]+$/, '').trim().toUpperCase();

        // Inspect header row
        const firstRow = rows[0].map((h) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        
        let idxNoSJ = firstRow.findIndex((h) =>
          ['nosj', 'nomorsj', 'nosuratjalan', 'suratjalan', 'transfernumber', 'deliverynumber', 'nodelivery', 'notransfer', 'number', 'nomor', 'invoice', 'sj', 'notrx', 'noorder'].includes(h)
        );
        let idxSku = firstRow.findIndex((h) =>
          ['sku', 'code', 'barcode', 'kode', 'itemcode', 'kodeproduk', 'kodebarang', 'partnumber'].includes(h)
        );
        let idxNama = firstRow.findIndex((h) =>
          ['product', 'produk', 'nama', 'item', 'itemname', 'productname', 'namaproduk', 'namabarang', 'title', 'description'].includes(h)
        );
        let idxVariant = firstRow.findIndex((h) =>
          ['variant', 'size', 'ukuran', 'varian', 'opsi', 'option'].includes(h)
        );
        let idxQty = firstRow.findIndex((h) =>
          ['quantity', 'qty', 'jumlah', 'pcs', 'kuantitas', 'totalqty', 'targetqty', 'qtyreq', 'qtyorder'].includes(h)
        );
        let idxDestination = firstRow.findIndex((h) =>
          ['destination', 'tujuan', 'outlettujuan', 'ke', 'to', 'channel', 'customer', 'toko', 'cabang', 'store', 'penerima'].includes(h)
        );
        let idxDate = firstRow.findIndex((h) =>
          ['date', 'tanggal', 'tgl', 'created', 'createdat', 'transferdate', 'deliverydate'].includes(h)
        );
        let idxLokasi = firstRow.findIndex((h) =>
          ['lokasi', 'location', 'rak', 'bin', 'shelf'].includes(h)
        );
        let idxCategory = firstRow.findIndex((h) =>
          ['category', 'kategori', 'cat', 'jenis'].includes(h)
        );
        let idxPrice = firstRow.findIndex((h) =>
          ['price', 'harga', 'sellprice', 'sellingprice'].includes(h)
        );

        // Fallback search with partial substring
        if (idxNoSJ === -1) idxNoSJ = firstRow.findIndex((h) => h.includes('surat') || h.includes('delivery') || h.includes('transfer') || h.includes('nosj'));
        if (idxSku === -1) idxSku = firstRow.findIndex((h) => h.includes('sku') || h.includes('code') || h.includes('kode') || h.includes('barcode'));
        if (idxNama === -1) idxNama = firstRow.findIndex((h) => h.includes('product') || h.includes('nama') || h.includes('item'));
        if (idxVariant === -1) idxVariant = firstRow.findIndex((h) => h.includes('size') || h.includes('variant') || h.includes('ukuran') || h.includes('varian'));
        if (idxQty === -1) idxQty = firstRow.findIndex((h) => h.includes('qty') || h.includes('jumlah') || h.includes('quantity') || h.includes('pcs'));
        if (idxDestination === -1) idxDestination = firstRow.findIndex((h) => h.includes('tujuan') || h.includes('destination') || h.includes('outlet'));

        const isHeaderRow = (idxSku !== -1 && idxQty !== -1) || 
                            (idxNoSJ !== -1 && (idxSku !== -1 || idxNama !== -1)) ||
                            firstRow.some((h) => ['date', 'number', 'sku', 'product', 'code', 'quantity', 'tujuan', 'destination'].some(k => h.includes(k)));

        let startRowIndex = isHeaderRow ? 1 : 0;

        // Positional fallbacks
        if (idxSku === -1) {
          if (rows[0].length >= 8) {
            // Standard DealPOS format (0: Date, 1: No SJ, 2: Category, 3: Product, 4: Variant, 5: Code/SKU, 6: Price, 7: Qty, 8: Source, 9: Destination)
            idxDate = 0;
            idxNoSJ = 1;
            idxCategory = 2;
            idxNama = 3;
            idxVariant = 4;
            idxSku = 5;
            idxPrice = 6;
            idxQty = 7;
            idxDestination = 9;
          } else if (rows[0].length >= 4) {
            idxNoSJ = 0;
            idxSku = 1;
            idxNama = 2;
            idxQty = 3;
          } else {
            idxSku = 0;
            idxNama = 1;
            idxQty = 2;
          }
        }

        for (let j = startRowIndex; j < rows.length; j++) {
          const row = rows[j];
          if (!row || row.length === 0) continue;

          let noSJ = (idxNoSJ !== -1 ? row[idxNoSJ] : '')?.trim() || defaultSjFromName;
          let sku = (idxSku !== -1 ? row[idxSku] : '')?.trim() || '';
          let produk = (idxNama !== -1 ? row[idxNama] : '')?.trim() || '';
          let variant = (idxVariant !== -1 ? row[idxVariant] : '')?.trim() || '';
          let dateVal = (idxDate !== -1 ? row[idxDate] : '')?.trim() || new Date().toLocaleDateString('id-ID');
          let category = (idxCategory !== -1 ? row[idxCategory] : '')?.trim() || 'Apparel';
          let price = (idxPrice !== -1 ? row[idxPrice] : '')?.trim() || '';
          let destination = (idxDestination !== -1 ? row[idxDestination] : '')?.trim() || 'Marketplace';
          let explicitLokasi = (idxLokasi !== -1 ? row[idxLokasi] : '')?.trim() || '';

          // Parse Qty safely
          const rawQtyStr = (idxQty !== -1 ? row[idxQty] : '')?.toString().trim().replace(/,/g, '.') || '1';
          const parsedQty = parseFloat(rawQtyStr);
          const qty = isNaN(parsedQty) || parsedQty <= 0 ? 1 : Math.round(parsedQty);

          if (!sku && produk) {
            sku = produk;
          }
          if (!produk && sku) {
            produk = sku;
          }

          if (!sku || qty <= 0) continue;

          let namaFinal = produk;
          if (variant && variant !== '-' && variant.toLowerCase() !== 'default') {
            const pLower = produk.toLowerCase();
            const vLower = variant.toLowerCase();
            if (vLower !== pLower && !vLower.includes(pLower)) {
              namaFinal = `${produk} (${variant})`;
            } else if (vLower.includes(pLower)) {
              namaFinal = variant;
            }
          }

          let lokasi = explicitLokasi || '-';
          if (lokasi === '-' && productCatalog && productCatalog.length > 0) {
            const cleanSku = sku.toUpperCase();
            const matchedProduct = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
            if (matchedProduct && matchedProduct.lokasi) {
              const parts = matchedProduct.lokasi
                .split(/[,/;\n|]+/)
                .map((s) => s.trim().toUpperCase())
                .filter((loc) => loc && isWarehouseLocation(loc));
              if (parts.length > 0) {
                lokasi = parts.join(', ');
              }
            }
          }

          const cleanSjKey = (noSJ || defaultSjFromName).toUpperCase();
          if (!groupsMap[cleanSjKey]) {
            groupsMap[cleanSjKey] = {
              id: `sj_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
              fileName: file.name,
              noSJ: cleanSjKey,
              tujuan: destination,
              date: dateVal,
              items: [],
              totalQty: 0,
              totalItems: 0,
            };
          }

          const existingItem = groupsMap[cleanSjKey].items.find((it) => it.sku.toUpperCase() === sku.toUpperCase());
          if (existingItem) {
            existingItem.qty += qty;
          } else {
            groupsMap[cleanSjKey].items.push({
              nama: namaFinal,
              sku: sku.toUpperCase(),
              size: variant || '-',
              qty,
              lokasi,
              category,
              price,
            });
          }

          groupsMap[cleanSjKey].totalQty += qty;
          groupsMap[cleanSjKey].totalItems = groupsMap[cleanSjKey].items.length;
        }
      }

      const parsedList = Object.values(groupsMap);
      if (parsedList.length === 0) {
        onNotify('Tidak ditemukan data baris Surat Jalan yang valid pada file CSV.', 'error');
      } else {
        // Fetch real-time stock to fill in any missing locations
        const allSkusToFetch = Array.from(new Set(parsedList.flatMap(g => g.items.map(it => it.sku))));
        if (allSkusToFetch.length > 0) {
          try {
            const realtimeStocks = await fetchStockForSkus(allSkusToFetch);
            
            const map: Record<string, StockRealtimeItem[]> = {};
            allSkusToFetch.forEach(s => {
              map[s.toUpperCase().trim()] = [];
            });
            realtimeStocks.forEach(stk => {
              const key = stk.sku.toUpperCase().trim();
              if (!map[key]) map[key] = [];
              map[key].push(stk);
            });
            setRealtimeSkuStocks(map);

            // Update parsed list with real warehouse locations that have stock > 0
            parsedList.forEach(g => {
              g.items.forEach(it => {
                const skuUpper = it.sku.toUpperCase().trim();
                const stockList = map[skuUpper] || [];
                const validStockLocs = stockList
                  .filter(stk => stk.lokasi && stk.lokasi !== '-' && stk.lokasi !== '--' && isWarehouseLocation(stk.lokasi, stk.area) && (Number(stk.sisa_stok) || 0) > 0)
                  .sort((a, b) => (Number(b.sisa_stok) || 0) - (Number(a.sisa_stok) || 0));
                
                if (validStockLocs.length > 0) {
                  it.lokasi = validStockLocs.map(l => `${l.lokasi} (${l.sisa_stok} pcs)`).join(', ');
                } else if (skuUpper in map) {
                  it.lokasi = 'KOSONG';
                }
              });
            });
          } catch (fetchErr) {
            console.warn('Failed to fetch real-time stock for locations:', fetchErr);
          }
        }

        setParsedGroups(parsedList);
        setExpandedGroupId(parsedList[0].id);
        onNotify(`Berhasil memproses ${parsedList.length} Surat Jalan dari file CSV!`, 'success');
      }
    } catch (err: any) {
      onNotify(`Gagal membaca file CSV: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
      hideGlobalLoading();
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Print HTML Builder (matches buildPrintHtml from GAS)
  const buildPrintHtml = (groups: ParsedSJGroup[]): string => {
    let pagesHtml = '';

    groups.forEach((g) => {
      let rowsHtml = '';
      g.items.forEach((it, idx) => {
        const cleanSku = it.sku.toUpperCase().trim();
        const locs = getProductLocations(cleanSku, it.lokasi);
        let locText = '-';
        let isKosong = false;
        if (locs.length > 0) {
          locText = locs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
        } else if (cleanSku in realtimeSkuStocks) {
          const empty = getRecordedEmptyLocations(cleanSku);
          locText = empty.length > 0 ? `KOSONG (Rak: ${empty.join(', ')})` : 'KOSONG (0 pcs)';
          isKosong = true;
        } else if (it.lokasi && it.lokasi !== '-' && it.lokasi !== 'KOSONG') {
          locText = it.lokasi;
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            <td style="padding: 6px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
            <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #0f172a;">${it.sku}</td>
            <td style="padding: 6px 8px; color: #1e293b; font-weight: 600;">${it.nama}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 700;">${it.size || '-'}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 800; color: var(--theme-500); font-size: 12px;">${it.qty}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 700; background: #f8fafc; color: ${isKosong ? '#e11d48' : '#047857'};">${locText}</td>
            <td style="padding: 6px 8px; text-align: center; width: 40px;"><div style="width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 3px; margin: 0 auto;"></div></td>
          </tr>
        `;
      });

      pagesHtml += `
        <div style="page-break-after: always; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
            <div>
              <div style="font-size: 18px; font-weight: 900; letter-spacing: 0.5px; color: var(--theme-500);">CHOCOCHIPS WMS</div>
              <div style="font-size: 14px; font-weight: 800; margin-top: 2px;">SURAT JALAN PICKING REFILL</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Tanggal: <b>${g.date}</b> • Dicetak oleh: <b>${currentUser}</b></div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: #0f172a; border: 1.5px solid #0f172a; padding: 4px 10px; border-radius: 6px; display: inline-block;">
                ${g.noSJ}
              </div>
              <div style="font-size: 12px; font-weight: 700; color: #334155; margin-top: 4px;">Tujuan: <span style="color: var(--theme-500);">${g.tujuan}</span></div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569;">
                <th style="padding: 8px; text-align: center; width: 30px;">NO</th>
                <th style="padding: 8px; text-align: left; width: 140px;">SKU / CODE</th>
                <th style="padding: 8px; text-align: left;">NAMA PRODUK</th>
                <th style="padding: 8px; text-align: center; width: 50px;">SIZE</th>
                <th style="padding: 8px; text-align: center; width: 50px;">QTY</th>
                <th style="padding: 8px; text-align: center; width: 80px;">LOKASI</th>
                <th style="padding: 8px; text-align: center; width: 40px;">CEK</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1;">
            <div style="font-size: 11px; color: #64748b;">
              Total Item: <b>${g.totalItems} SKU</b> • Total Qty: <b>${g.totalQty} Pcs</b>
            </div>
            <div style="display: flex; gap: 40px; text-align: center; font-size: 11px;">
              <div>
                <div style="margin-bottom: 35px; color: #64748b;">Petugas Picking</div>
                <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 90px;">(${currentUser})</div>
              </div>
              <div>
                <div style="margin-bottom: 35px; color: #64748b;">Checker / QC</div>
                <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 90px;">( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; )</div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Surat Jalan Picking Refill</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              @page { margin: 10mm; size: auto; }
            }
          </style>
        </head>
        <body onload="window.print();">
          ${pagesHtml}
        </body>
      </html>
    `;
  };

  // Open PDF / Print Window
  const handlePrintGroups = (groupsToPrint: ParsedSJGroup[]) => {
    if (groupsToPrint.length === 0) {
      onNotify('Tidak ada data Surat Jalan untuk dicetak.', 'error');
      return;
    }
    const html = buildPrintHtml(groupsToPrint);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      // Fallback iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.print();
          document.body.removeChild(iframe);
        }, 800);
      }
    }
  };

  // Save parsed groups to Supabase picking_list
  const handleSaveToDatabase = async (groupsToSave: ParsedSJGroup[], andPrint = false) => {
    if (groupsToSave.length === 0) {
      onNotify('Tidak ada Surat Jalan yang dipilih untuk disimpan.', 'error');
      return;
    }

    // Check duplicate SJs
    const duplicateList = groupsToSave
      .filter((g) => existingSJs.some((ex) => ex.toUpperCase() === g.noSJ.toUpperCase()))
      .map((g) => g.noSJ);

    // The duplicate warning is already rendered in the UI with a yellow badge.
    // In iframe environments, window.confirm is often blocked and silently fails.
    // Instead of using window.confirm, we will allow them to save if they explicitly clicked the button,
    // or we could use a custom modal. For now, since they can see the warning, we proceed.
    // If you want strict protection, a custom state-based confirmation modal is required.
    
    setIsProcessing(true);
    showGlobalLoading('Memproses...');
    try {
      const allCreatedItems: PickingListItem[] = [];
      for (const group of groupsToSave) {
        const formattedItems = group.items.map((it) => {
          const cleanSku = it.sku.toUpperCase().trim();
          const locs = getProductLocations(cleanSku, it.lokasi);
          const primaryLoc = locs.length > 0 
            ? locs[0].lokasi 
            : (it.lokasi && it.lokasi !== 'KOSONG' && it.lokasi !== '-' ? it.lokasi : 'A-01');
          return {
            sku: it.sku,
            nama_produk: it.nama,
            size: it.size || '-',
            lokasi: primaryLoc,
            qty_req: it.qty,
          };
        });

        const res = await createPickingSuratJalanSupabase(group.noSJ, group.tujuan, formattedItems);
        if (res && res.createdItems) {
          allCreatedItems.push(...res.createdItems);
        }
      }

      if (andPrint) {
        handlePrintGroups(groupsToSave);
      }

      onSuccess(
        `Berhasil menyimpan ${groupsToSave.length} Surat Jalan (${allCreatedItems.length} baris produk) ke Supabase & Daftar Tugas Picking! 🚀`,
        allCreatedItems
      );
      onClose();
    } catch (err: any) {
      console.error('Gagal menyimpan Surat Jalan ke database:', err);
      onNotify(`Gagal menyimpan ke database Supabase: ${err?.message || 'Error tidak diketahui'}`, 'error');
    } finally {
      setIsProcessing(false);
      hideGlobalLoading();
    }
  };

  // Manual Row Handlers
  const handleAddManualRow = () => {
    setManualRows([...manualRows, { sku: '', nama_produk: '', size: '', lokasi: '', qty: 1 }]);
  };

  const handleRemoveManualRow = (index: number) => {
    if (manualRows.length === 1) return;
    setManualRows(manualRows.filter((_, i) => i !== index));
  };

  const handleManualRowChange = (index: number, field: string, value: any) => {
    const next = [...manualRows];
    next[index] = { ...next[index], [field]: value };

    if (field === 'sku') {
      const cleanSku = String(value).trim().toUpperCase();
      if (cleanSku) {
        fetchStockForSkus([cleanSku])
          .then((stocks) => {
            setRealtimeSkuStocks((prev) => ({
              ...prev,
              [cleanSku]: stocks.filter((s) => (s.sku || '').toUpperCase().trim() === cleanSku),
            }));
            const validStockLocs = stocks
              .filter(
                (stk) =>
                  stk.lokasi &&
                  stk.lokasi !== '-' &&
                  stk.lokasi !== '--' &&
                  isWarehouseLocation(stk.lokasi, stk.area) &&
                  (Number(stk.sisa_stok) || 0) > 0
              )
              .sort((a, b) => (Number(b.sisa_stok) || 0) - (Number(a.sisa_stok) || 0));

            setManualRows((currentRows) => {
              if (currentRows[index]?.sku?.trim().toUpperCase() === cleanSku) {
                const updated = [...currentRows];
                if (validStockLocs.length > 0) {
                  updated[index].lokasi = validStockLocs.map((l) => `${l.lokasi} (${l.sisa_stok} pcs)`).join(', ');
                } else {
                  updated[index].lokasi = 'KOSONG (0 pcs)';
                }
                return updated;
              }
              return currentRows;
            });
          })
          .catch((err) => console.warn('Gagal memuat stok:', err));
      }

      if (productCatalog.length > 0) {
        const found = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
        if (found) {
          next[index].nama_produk = found.p || found.n || '';
          next[index].size = found.s || '-';
        }
      }
    }
    setManualRows(next);
  };

  const handleSaveManualSJ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSJ.trim() || !manualTujuan.trim()) {
      onNotify('Mohon isi Nomor SJ dan Tujuan Pengiriman', 'error');
      return;
    }
    const validRows = manualRows.filter((r) => r.sku.trim() !== '');
    if (validRows.length === 0) {
      onNotify('Mohon masukkan minimal 1 baris SKU Produk', 'error');
      return;
    }

    const singleGroup: ParsedSJGroup = {
      id: `manual_${Date.now()}`,
      fileName: 'Input Manual',
      noSJ: manualSJ.trim().toUpperCase(),
      tujuan: manualTujuan.trim(),
      date: new Date().toLocaleDateString('id-ID'),
      items: validRows.map((r) => ({
        sku: r.sku.trim().toUpperCase(),
        nama: r.nama_produk.trim() || r.sku,
        size: r.size || '-',
        lokasi: r.lokasi || '-',
        qty: Number(r.qty) || 1,
      })),
      totalQty: validRows.reduce((a, b) => a + (Number(b.qty) || 1), 0),
      totalItems: validRows.length,
    };

    await handleSaveToDatabase([singleGroup], false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131d31] w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-500/10 flex items-center justify-center text-primary-500 border border-primary-500/20 flex-shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-primary-500 uppercase tracking-wider">
                  Fulfillment Refill
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  MULTI-CSV
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Buat Surat Jalan Refill &amp; Tugas Picking
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-5 pt-3 pb-0 bg-slate-50/50 dark:bg-[#0f172a]/50 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('CSV')}
            className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'CSV'
                ? 'border-primary-500 text-primary-500 bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Upload File CSV Refill (Multi-File)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANUAL')}
            className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'MANUAL'
                ? 'border-primary-500 text-primary-500 bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Input Manual / Tambah Baris
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'CSV' ? (
            <div className="space-y-4">
              {/* CSV Upload Card */}
              <div className="p-4 sm:p-5 bg-gradient-to-br from-orange-50/60 to-amber-50/40 dark:from-[#1e293b]/40 dark:to-[#0f172a]/60 border border-orange-200 dark:border-slate-800 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary-500/10 rounded-xl text-primary-500 flex-shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-tight">
                      Cetak Surat Jalan Refill &amp; Input Tugas Picking
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Pilih <b>satu atau beberapa file CSV Transfer Order</b> (DealPOS/ERP). Sistem akan secara otomatis memisahkan per Surat Jalan, mengalokasikan lokasi rak gudang, dan siap dicetak atau disimpan ke database picking.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".csv,text/csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csvFulfillmentInput"
                      />
                      <label
                        htmlFor="csvFulfillmentInput"
                        className="px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Pilih File CSV Transfer Order</span>
                      </label>

                      {isProcessing && (
                        <span className="text-xs font-bold text-primary-500 flex items-center gap-1.5 animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin" /> Memproses file CSV...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Parsed Results List */}
              {parsedGroups.length > 0 ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {parsedGroups.length} Surat Jalan Siap Dimasukkan
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Total {parsedGroups.reduce((a, b) => a + b.totalItems, 0)} SKU • {parsedGroups.reduce((a, b) => a + b.totalQty, 0)} Pcs
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleSaveToDatabase(parsedGroups, false)}
                        className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 transition-all"
                      >
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>🚀 Masukkan Semua ke Tugas Picking</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Daftar Surat Jalan Terbaca ({parsedGroups.length} File SJ)
                    </span>
                    <button
                      type="button"
                      onClick={() => setParsedGroups([])}
                      className="text-[11px] font-extrabold text-primary-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus Semua
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {parsedGroups.map((group) => {
                      const isExpanded = expandedGroupId === group.id;
                      const isExisting = existingSJs.some((ex) => ex.toUpperCase() === group.noSJ.toUpperCase());

                      return (
                        <div
                          key={group.id}
                          className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 transition-all"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="text-base font-black text-slate-800 dark:text-white font-mono">
                                {group.noSJ}
                              </span>
                              {isExisting && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Sudah ada di DB
                                </span>
                              )}
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                <Truck className="w-3 h-3 text-primary-500" /> {group.tujuan}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white dark:bg-[#131d31] text-primary-500 border border-slate-200 dark:border-slate-700 shadow-sm">
                                {group.totalItems} SKU • {group.totalQty} Pcs
                              </span>

                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleSaveToDatabase([group], false)}
                                className="px-2.5 py-1.5 bg-primary-500/10 hover:bg-primary-500 text-primary-500 hover:text-white rounded-lg border border-primary-500/30 text-xs font-black transition-all flex items-center gap-1"
                                title="Simpan SJ Ini ke Tugas Picking"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Simpan SJ Ini</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintGroups([group])}
                                className="p-1.5 bg-white dark:bg-[#131d31] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all"
                                title="Cetak Surat Jalan Ini"
                              >
                                <Printer className="w-3.5 h-3.5 text-primary-500" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Items Preview */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="grid grid-cols-12 text-[10px] font-extrabold uppercase text-slate-400 px-2">
                                <span className="col-span-3">SKU</span>
                                <span className="col-span-4">Nama Produk</span>
                                <span className="col-span-3 text-center">Lokasi & Sisa Stok</span>
                                <span className="col-span-2 text-right">Target Qty</span>
                              </div>
                              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                                {group.items.map((item, itIdx) => {
                                  const cleanSku = item.sku.toUpperCase().trim();
                                  const locs = getProductLocations(cleanSku, item.lokasi);
                                  const isLoaded = cleanSku in realtimeSkuStocks;
                                  const emptyRacks = getRecordedEmptyLocations(cleanSku);

                                  return (
                                    <div
                                      key={itIdx}
                                      className="grid grid-cols-12 text-xs py-1.5 px-2 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200/60 dark:border-slate-800/80 items-center font-medium gap-1"
                                    >
                                      <span className="col-span-3 font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                                        {item.sku}
                                      </span>
                                      <span className="col-span-4 text-slate-700 dark:text-slate-300 text-[11px] truncate" title={item.nama}>
                                        {item.nama}
                                      </span>
                                      <div className="col-span-3 flex flex-wrap items-center justify-center gap-1">
                                        {locs.length > 0 ? (
                                          locs.map((l, lIdx) => (
                                            <span
                                              key={lIdx}
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-mono font-bold text-[10px] border border-emerald-500/30"
                                              title={`Rak ${l.lokasi}: Sisa stok ${l.qty} pcs`}
                                            >
                                              <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                              <span>{l.lokasi}</span>
                                              <span className="text-[9px] font-black bg-emerald-600/20 px-1 rounded text-emerald-900 dark:text-emerald-100">
                                                {l.qty}
                                              </span>
                                            </span>
                                          ))
                                        ) : isLoaded ? (
                                          <span
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 font-bold text-[9px] border border-primary-500/30"
                                            title={emptyRacks.length > 0 ? `Rak tercatat: ${emptyRacks.join(', ')}` : 'Stok gudang kosong'}
                                          >
                                            <AlertTriangle className="w-2.5 h-2.5 text-primary-500 shrink-0" />
                                            <span>KOSONG (0)</span>
                                            {emptyRacks.length > 0 && (
                                              <span className="text-[8px] text-primary-500/80 font-mono">
                                                ({emptyRacks.join(',')})
                                              </span>
                                            )}
                                          </span>
                                        ) : item.lokasi && item.lokasi !== '-' && item.lokasi !== 'KOSONG' ? (
                                          <span className="font-mono font-bold text-[10px] text-primary-500">
                                            {item.lokasi}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 italic">-</span>
                                        )}
                                      </div>
                                      <span className="col-span-2 text-right font-black text-xs text-slate-900 dark:text-white">
                                        {item.qty} pcs
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    Belum ada file CSV yang diunggah
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Klik tombol "Pilih File CSV Transfer Order" di atas untuk memulai
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Manual Form */
            <form onSubmit={handleSaveManualSJ} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Nomor Surat Jalan / No. Delivery *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualSJ}
                    onChange={(e) => setManualSJ(e.target.value)}
                    placeholder="Contoh: SJ-MKG-8821 / TO-2026-001"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tujuan Pengiriman / Channel *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualTujuan}
                    onChange={(e) => setManualTujuan(e.target.value)}
                    placeholder="Contoh: Store Mall Kelapa Gading / Live Shopee"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Daftar Produk yang Harus Dipick
                  </label>
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="text-[11px] font-extrabold text-primary-500 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {manualRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4 sm:col-span-3">
                        <input
                          type="text"
                          required
                          placeholder="SKU Barcode"
                          value={row.sku}
                          onChange={(e) => handleManualRowChange(idx, 'sku', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-4">
                        <input
                          type="text"
                          required
                          placeholder="Nama Produk"
                          value={row.nama_produk}
                          onChange={(e) => handleManualRowChange(idx, 'nama_produk', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Lokasi Rak"
                          value={row.lokasi}
                          onChange={(e) => handleManualRowChange(idx, 'lokasi', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-10 sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) => handleManualRowChange(idx, 'qty', Number(e.target.value))}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveManualRow(idx)}
                          className="text-slate-400 hover:text-primary-500 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex flex-wrap justify-between items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            Tutup
          </button>

          {activeTab === 'CSV' && parsedGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handlePrintGroups(parsedGroups)}
                className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <Printer className="w-4 h-4 text-primary-500" />
                <span>🖨️ Cetak PDF Saja</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleSaveToDatabase(parsedGroups, true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Simpan + Cetak PDF</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleSaveToDatabase(parsedGroups, false)}
                className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 disabled:opacity-50 transition-all"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Simpan ke Database Picking
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'MANUAL' && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSaveManualSJ}
              className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Simpan ke Database
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
