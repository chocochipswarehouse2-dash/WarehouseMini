import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Printer, Send, Smartphone, Copy, Check, MessageSquare,
  Package, MapPin, Calendar, ArrowRight, ExternalLink, Loader2,
  CheckCircle2, AlertTriangle, FileText, ChevronRight, Layers
} from 'lucide-react';
import { PengecekanSJDraft, ProductItem, UserSession, ProductLocationInfo, StockRealtimeItem } from '../../types';
import { createPickingSuratJalanSupabase, fetchStockForSkus, isWarehouseLocation, getPickingPriority } from '../../services/supabase';
import { getWhatsAppWebUrl, getFonnteConfig, sendFonnteMessage, generateRefillPickingGroupMessage } from '../../services/whatsapp';
import { playSaveSuccessChime, playSuccessBeep } from '../../services/audio';
import { cleanProductName, extractCleanSizeToken } from '../../utils/sortUtils';
import { lookupProductBySku } from '../../utils/productLookup';

export type PickingTab = 'print' | 'whatsapp' | 'app';

interface DistribusiPickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: PengecekanSJDraft | null;
  drafts?: PengecekanSJDraft[];
  initialTab?: PickingTab;
  productCatalog: ProductItem[];
  session: UserSession | null;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onSuccessSentToApp?: (draftId: string, invoicePicking?: string) => void;
  onNavigateToPickingTasks?: () => void;
}

export interface EnrichedPickingItem {
  no: number;
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  primaryLokasi: string;
  locList: ProductLocationInfo[];
  emptyRacks: string[];
  isKosong: boolean;
  qty: number;
}

export interface EnrichedDraftGroup {
  draft: PengecekanSJDraft;
  items: EnrichedPickingItem[];
  totalSku: number;
  totalQty: number;
  waText: string;
}

export const DistribusiPickingModal: React.FC<DistribusiPickingModalProps> = ({
  isOpen,
  onClose,
  draft,
  drafts,
  initialTab = 'app',
  productCatalog = [],
  session,
  onNotify,
  onSuccessSentToApp,
  onNavigateToPickingTasks,
}) => {
  const targetDrafts = useMemo<PengecekanSJDraft[]>(() => {
    if (Array.isArray(drafts) && drafts.length > 0) {
      return drafts.filter((d) => d && Array.isArray(d.items) && d.items.length > 0);
    }
    if (draft && Array.isArray(draft.items) && draft.items.length > 0) {
      return [draft];
    }
    return [];
  }, [draft, drafts]);

  const isBulkMode = targetDrafts.length > 1;
  const primaryDraft = targetDrafts[0] || null;

  const [activeTab, setActiveTab] = useState<PickingTab>(initialTab);
  const [isSendingToApp, setIsSendingToApp] = useState<boolean>(false);
  const [isSentToAppSuccess, setIsSentToAppSuccess] = useState<boolean>(false);
  const [sentCount, setSentCount] = useState<number>(0);
  const [progressStep, setProgressStep] = useState<{ current: number; total: number; label: string } | null>(null);
  const [isSendingFonnte, setIsSendingFonnte] = useState<boolean>(false);
  const [alsoSendWaOnAppSubmit, setAlsoSendWaOnAppSubmit] = useState<boolean>(false);
  const [isCopiedWa, setIsCopiedWa] = useState<boolean>(false);
  const [selectedPreviewDraftIdx, setSelectedPreviewDraftIdx] = useState<number>(0);

  // Realtime warehouse stock state (stok_real_fisik dari Supabase)
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});
  const [loadingStock, setLoadingStock] = useState<boolean>(false);

  // Target WhatsApp group / nomor
  const fonnteCfg = getFonnteConfig();
  const [waTargetNumber, setWaTargetNumber] = useState<string>(() => fonnteCfg.groupTarget || '');

  // Reset state when modal opens or targetDrafts change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'app');
      setIsSentToAppSuccess(false);
      setSentCount(0);
      setProgressStep(null);
      setSelectedPreviewDraftIdx(0);
    }
  }, [isOpen, initialTab, targetDrafts.length]);

  // Key to track all unique SKUs across all targetDrafts for a single batched Supabase query
  const allDraftsSkusKey = useMemo(() => {
    const skuSet = new Set<string>();
    targetDrafts.forEach((d) => {
      (d.items || []).forEach((it) => {
        const s = (it.sku || '').trim().toUpperCase();
        if (s) skuSet.add(s);
      });
    });
    return Array.from(skuSet).sort().join(',');
  }, [targetDrafts]);

  // Fetch realtime warehouse inventory by SKUs across all selected drafts in 1 request
  useEffect(() => {
    if (!isOpen || !allDraftsSkusKey) return;
    const uniqueSkus = allDraftsSkusKey.split(',').filter(Boolean);
    if (uniqueSkus.length === 0) return;

    setLoadingStock(true);
    fetchStockForSkus(uniqueSkus)
      .then((stocks) => {
        const map: Record<string, StockRealtimeItem[]> = {};
        uniqueSkus.forEach((s) => {
          map[s] = [];
        });
        stocks.forEach((stk) => {
          const key = (stk.sku || '').toUpperCase().trim();
          if (!map[key]) map[key] = [];
          map[key].push(stk);
        });
        setRealtimeSkuStocks(map);
      })
      .catch((err) => {
        console.warn('Gagal memuat stok lokasi realtime untuk picking SJ:', err);
      })
      .finally(() => {
        setLoadingStock(false);
      });
  }, [isOpen, allDraftsSkusKey]);

  // Helper: Extract all warehouse locations for a given item / SKU across realtime stock, master catalog, and draft items
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku) return [];
    const map = new Map<string, ProductLocationInfo>();

    // 1. Authoritative check: live Supabase stok_real_fisik data
    const isRealtimeChecked = cleanSku in realtimeSkuStocks;
    if (isRealtimeChecked) {
      const realtimeList = realtimeSkuStocks[cleanSku] || [];
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

      const sorted = Array.from(map.values()).sort((a, b) => {
        const pA = getPickingPriority(a.lokasi, a.area);
        const pB = getPickingPriority(b.lokasi, b.area);
        if (pA !== pB) return pA - pB;
        const qtyDiff = (b.qty || 0) - (a.qty || 0);
        if (qtyDiff !== 0) return qtyDiff;
        return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
      });
      if (sorted.length > 0) {
        sorted[0].isPrimary = true;
      }
      return sorted;
    }

    // 2. Fallback only while realtime data is still loading
    const catMatch = productCatalog.find(
      (p) => (p.k && p.k.trim().toUpperCase() === cleanSku) || ((p as any).sku && String((p as any).sku).trim().toUpperCase() === cleanSku)
    );
    if (catMatch) {
      if (Array.isArray(catMatch.locList)) {
        catMatch.locList.forEach((itemLoc) => {
          if (typeof itemLoc === 'object' && itemLoc && itemLoc.lokasi) {
            const rawLocStr = String(itemLoc.lokasi || '').trim();
            const qty = Number(itemLoc.qty) || 0;
            const parts = rawLocStr.split(/[,/;\n|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
            parts.forEach((loc) => {
              if (loc && isWarehouseLocation(loc) && qty > 0 && !map.has(loc)) {
                map.set(loc, {
                  lokasi: loc,
                  qty: parts.length === 1 ? qty : 0,
                  isPrimary: false,
                  source: 'CATALOG',
                });
              }
            });
          } else if (typeof itemLoc === 'string') {
            const parts = itemLoc.split(/[,/;\n|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
            parts.forEach((loc) => {
              if (loc && isWarehouseLocation(loc) && !map.has(loc)) {
                map.set(loc, {
                  lokasi: loc,
                  qty: 0,
                  isPrimary: false,
                  source: 'CATALOG',
                });
              }
            });
          }
        });
      }
      if (catMatch.lokasi && map.size === 0) {
        const parts = String(catMatch.lokasi).split(/[,/;\n|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        parts.forEach((loc) => {
          if (loc && isWarehouseLocation(loc) && !map.has(loc)) {
            map.set(loc, {
              lokasi: loc,
              qty: 0,
              isPrimary: false,
              source: 'CATALOG',
            });
          }
        });
      }
    }

    // 3. Check Surat Jalan Item Lokasi (if specified in CSV/document and still loading)
    const strItemLokasi = String(itemLokasi || '').trim();
    if (strItemLokasi && strItemLokasi !== '-' && strItemLokasi !== '--' && map.size === 0) {
      const parts = strItemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && isWarehouseLocation(loc));
      parts.forEach((loc) => {
        if (!map.has(loc)) {
          map.set(loc, {
            lokasi: loc,
            qty: 0,
            isPrimary: false,
            source: 'SJ',
          });
        }
      });
    }

    const allLocs = Array.from(map.values()).filter((l) => l && l.lokasi && isWarehouseLocation(l.lokasi, l.area));
    allLocs.sort((a, b) => {
      const pA = getPickingPriority(a.lokasi, a.area);
      const pB = getPickingPriority(b.lokasi, b.area);
      if (pA !== pB) return pA - pB;
      const qtyDiff = (b.qty || 0) - (a.qty || 0);
      if (qtyDiff !== 0) return qtyDiff;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (allLocs.length > 0) {
      allLocs[0].isPrimary = true;
    }
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
      if (loc && isWarehouseLocation(loc, stk.area) && qty <= 0) {
        if (!emptyLocs.includes(loc)) emptyLocs.push(loc);
      }
    });
    return emptyLocs;
  };

  // Enrich all target drafts
  const enrichedDraftGroups = useMemo<EnrichedDraftGroup[]>(() => {
    if (targetDrafts.length === 0) return [];

    const catalogMap = new Map<string, ProductItem>();
    productCatalog.forEach((p) => {
      if (p.k) catalogMap.set(p.k.toUpperCase().trim(), p);
      if ((p as any).sku) catalogMap.set(String((p as any).sku).toUpperCase().trim(), p);
    });

    return targetDrafts.map((d) => {
      const items: EnrichedPickingItem[] = (d.items || []).map((it, idx) => {
        const cleanSku = it.sku.toUpperCase().trim();
        const prod =
          catalogMap.get(cleanSku) ||
          productCatalog.find(
            (p) =>
              (p.k && p.k.toUpperCase().trim() === cleanSku) ||
              ((p as any).sku && String((p as any).sku).toUpperCase().trim() === cleanSku)
          ) ||
          productCatalog.find(
            (p) => p.k && p.k.replace(/\s+/g, '').toUpperCase() === cleanSku.replace(/\s+/g, '')
          );

        const lookup = lookupProductBySku(cleanSku, productCatalog, it.nama_produk, (it as any).size);
        let size = (lookup.found && lookup.size !== '-' && lookup.size !== 'Default') 
          ? lookup.size 
          : '-';

        const locs = getProductLocations(cleanSku, (it as any).lokasi);
        const locsWithStock = locs.filter((l) => (l.qty || 0) > 0);
        const recordedEmpty = getRecordedEmptyLocations(cleanSku);
        const isRealtimeChecked = cleanSku in realtimeSkuStocks;

        let lokasiDisplay = '-';
        let isKosong = false;
        let primaryLokasi = 'Belum Ada Rak';

        if (locsWithStock.length > 0) {
          lokasiDisplay = locsWithStock.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
          primaryLokasi = locsWithStock[0].lokasi;
          isKosong = false;
        } else if (isRealtimeChecked) {
          isKosong = true;
          if (recordedEmpty.length > 0) {
            lokasiDisplay = recordedEmpty.join(', ');
            primaryLokasi = recordedEmpty[0];
          } else {
            lokasiDisplay = 'KOSONG (0 pcs)';
            primaryLokasi = 'KOSONG';
          }
        } else if ((it as any).lokasi && (it as any).lokasi !== '-' && (it as any).lokasi !== 'KOSONG') {
          lokasiDisplay = (it as any).lokasi;
          primaryLokasi = (it as any).lokasi;
        } else if (prod?.lokasi && prod.lokasi !== '-' && prod.lokasi !== 'KOSONG') {
          lokasiDisplay = prod.lokasi;
          primaryLokasi = prod.lokasi;
        } else {
          lokasiDisplay = prod?.lokasi || 'Belum Ada Rak';
          primaryLokasi = prod?.lokasi || 'Belum Ada Rak';
          isKosong = false;
        }

        const catalogProdName = (
          prod?.p ||
          prod?.nama_produk ||
          prod?.n ||
          (prod as any)?.name ||
          (prod as any)?.nama ||
          ''
        ).trim();
        const rawDraftName = (it.nama_produk || '').trim();
        const isDraftNameSku =
          !rawDraftName ||
          rawDraftName.toUpperCase() === cleanSku ||
          rawDraftName.toUpperCase().replace(/\s+/g, '') === cleanSku.replace(/\s+/g, '');
        const rawChosenName = !isDraftNameSku && rawDraftName ? rawDraftName : catalogProdName || rawDraftName || cleanSku;
        const nama = cleanProductName(rawChosenName);

        return {
          no: idx + 1,
          sku: cleanSku,
          nama_produk: nama,
          size: size || '-',
          lokasi: lokasiDisplay,
          primaryLokasi,
          locList: locs,
          emptyRacks: recordedEmpty,
          isKosong,
          qty: it.qty_sj || 1,
        };
      });

      items.sort((a, b) => {
        const locComp = a.primaryLokasi.localeCompare(b.primaryLokasi, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (locComp !== 0) return locComp;
        return a.sku.localeCompare(b.sku);
      });

      const dateStr = d.tanggal_sj || new Date().toISOString().slice(0, 10);
      const waText = generateRefillPickingGroupMessage({
        no_sj: d.no_sj,
        destination: d.destination || 'Toko / Store',
        source: d.source || 'Warehouse',
        tanggal_sj: dateStr,
        operatorName: session?.name || session?.username || 'Admin Warehouse',
        items: items.map((it) => {
          const activeStockLocs = (it.locList || []).filter((l) => (l.qty || 0) > 0);
          let locTag = '';
          if (activeStockLocs.length > 0) {
            locTag = activeStockLocs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
          } else if (it.primaryLokasi && it.primaryLokasi !== '-' && it.primaryLokasi !== 'Warehouse') {
            locTag = it.primaryLokasi;
          } else if (it.lokasi && it.lokasi !== '-' && it.lokasi !== 'Belum Ada Rak') {
            locTag = it.lokasi;
          } else {
            locTag = 'Belum Ada Rak';
          }

          return {
            sku: it.sku,
            nama_produk: it.nama_produk,
            size: it.size,
            qty: it.qty,
            lokasi: locTag,
            isKosong: it.isKosong,
          };
        }),
      });

      return {
        draft: d,
        items,
        totalSku: items.length,
        totalQty: items.reduce((acc, it) => acc + it.qty, 0),
        waText,
      };
    });
  }, [targetDrafts, productCatalog, realtimeSkuStocks, loadingStock, session]);

  const activePreviewGroup = enrichedDraftGroups[selectedPreviewDraftIdx] || enrichedDraftGroups[0] || null;
  const enrichedItems = activePreviewGroup ? activePreviewGroup.items : [];
  const totalQtyAll = useMemo(() => enrichedDraftGroups.reduce((s, g) => s + g.totalQty, 0), [enrichedDraftGroups]);
  const totalSkuAll = useMemo(() => enrichedDraftGroups.reduce((s, g) => s + g.totalSku, 0), [enrichedDraftGroups]);

  // Combined WA text (or single SJ text)
  const generatedWaText = useMemo(() => {
    if (enrichedDraftGroups.length === 0) return '';
    if (!isBulkMode) return enrichedDraftGroups[0].waText;
    return enrichedDraftGroups.map((g) => g.waText).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
  }, [enrichedDraftGroups, isBulkMode]);

  const [customWaText, setCustomWaText] = useState<string>('');

  useEffect(() => {
    setCustomWaText(generatedWaText);
  }, [generatedWaText]);

  if (!isOpen || targetDrafts.length === 0) return null;

  // 1. HANDLER CETAK SJ PICKING (PRINT OUT KERTAS A4 — MENDUKUNG MULTI-SJ SEKALIGUS)
  const handlePrintSjPicking = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotify('Jendela cetak terblokir. Harap izinkan popup di browser Anda.', 'warning');
      return;
    }

    const pagesHtml = enrichedDraftGroups
      .map((group, gIdx) => {
        const d = group.draft;
        const itemsRowsHtml = group.items
          .map(
            (it, idx) => `
            <tr>
              <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
              <td style="font-weight:800; color:${it.isKosong ? '#e11d48' : '#0f172a'}; font-family:monospace; background:${it.isKosong ? '#fff1f2' : '#f8fafc'}; text-align:center;">${it.lokasi}</td>
              <td style="font-family:monospace; font-weight:700;">${it.sku}</td>
              <td>${it.nama_produk}</td>
              <td style="text-align:center; font-weight:bold;">${it.size}</td>
              <td style="text-align:center; font-weight:900; font-size:13px; color:#0f172a;">${it.qty}</td>
              <td style="text-align:center;"><div class="check-box"></div></td>
              <td style="text-align:center;"><div class="blank-line"></div></td>
              <td style="font-size:10px; color:${it.isKosong ? '#e11d48' : '#64748b'}; font-weight:${it.isKosong ? '700' : '400'};">${it.isKosong ? 'Stok 0 (Cek Fisik)' : '-'}</td>
            </tr>
          `
          )
          .join('');

        const qrText = encodeURIComponent(`PICKING:${d.no_sj}:${d.destination}`);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;
        const isLast = gIdx === enrichedDraftGroups.length - 1;

        return `
        <div class="${isLast ? 'sj-page-last' : 'sj-page'}">
          <div class="header">
            <div>
              <div class="logo-title">CHOCOCHIPS WAREHOUSE</div>
              <div class="doc-badge">SURAT JALAN PICKING LIST (PENGIRIMAN)${enrichedDraftGroups.length > 1 ? ` — [${gIdx + 1}/${enrichedDraftGroups.length}]` : ''}</div>
            </div>
            <div style="text-align:right;">
              <img src="${qrUrl}" width="65" height="65" alt="QR Code SJ" style="display:block; margin-left:auto;" />
              <div style="font-size:9px; color:#64748b; margin-top:2px;">Scan Validasi</div>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <div class="info-item"><span class="info-label">No Surat Jalan:</span><span class="info-val font-mono" style="font-size:12px;">${d.no_sj}</span></div>
              <div class="info-item"><span class="info-label">Asal Gudang:</span><span class="info-val">${d.source || 'Warehouse'}</span></div>
              <div class="info-item"><span class="info-label">Tujuan Kirim:</span><span class="info-val" style="color:#2563eb;">${d.destination}</span></div>
            </div>
            <div>
              <div class="info-item"><span class="info-label">Tanggal SJ:</span><span class="info-val">${d.tanggal_sj}</span></div>
              <div class="info-item"><span class="info-label">Waktu Cetak:</span><span class="info-val">${new Date().toLocaleString('id-ID')}</span></div>
              <div class="info-item"><span class="info-label">Admin Pembuat:</span><span class="info-val">${session?.name || session?.username || 'Admin Warehouse'}</span></div>
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width:30px; text-align:center;">No</th>
                <th style="width:120px; text-align:center;">Lokasi Rak</th>
                <th style="width:130px;">Barcode / SKU</th>
                <th>Nama Produk</th>
                <th style="width:50px; text-align:center;">Size</th>
                <th style="width:55px; text-align:center;">Qty Order</th>
                <th style="width:50px; text-align:center;">Ambil [✓]</th>
                <th style="width:55px; text-align:center;">Qty Real</th>
                <th style="width:70px;">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>

          <div class="summary-box">
            <span>TOTAL KESELURUHAN ITEM (${d.no_sj}):</span>
            <span>${group.totalSku} SKU &nbsp;|&nbsp; ${group.totalQty} Pcs</span>
          </div>

          <div class="instruction-note">
            ⚠️ <strong>Instruksi Petugas Picker:</strong> Ambil barang sesuai urutan Lokasi Rak di atas. Berikan tanda centang [✓] saat barang dimasukkan ke keranjang picking. Jika ada stok kosong/rusak, tuliskan qty real yang terambil di kolom "Qty Real".
          </div>

          <div class="footer-sign">
            <div>
              <div class="sign-role">Dibuat Oleh (Admin),</div>
              <div class="sign-line"></div>
              <div class="sign-sub">Admin Gudang</div>
            </div>
            <div>
              <div class="sign-role">Diambil Oleh (Picker),</div>
              <div class="sign-line"></div>
              <div class="sign-sub">Petugas Picker</div>
            </div>
            <div>
              <div class="sign-role">Dicek & QC Oleh,</div>
              <div class="sign-line"></div>
              <div class="sign-sub">Checker / Tim Packing</div>
            </div>
          </div>
        </div>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Jalan Picking List - ${isBulkMode ? `${enrichedDraftGroups.length} SJ Massal` : primaryDraft?.no_sj}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 10px;
            font-size: 11px;
            background: #fff;
          }
          .sj-page {
            page-break-after: always;
            break-after: page;
            padding-bottom: 16px;
          }
          .sj-page-last {
            page-break-after: auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .logo-title {
            font-size: 18px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: -0.5px;
          }
          .doc-badge {
            display: inline-block;
            background: #0f172a;
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 4px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 14px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 11px;
          }
          .info-item { display: flex; margin-bottom: 3px; }
          .info-label { width: 110px; color: #64748b; font-weight: 600; }
          .info-val { font-weight: 700; color: #0f172a; }
          
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          .items-table th {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 6px;
            text-align: left;
            text-transform: uppercase;
            font-size: 10px;
            font-weight: 800;
            color: #334155;
          }
          .items-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 6px;
            vertical-align: middle;
          }
          .check-box {
            width: 16px;
            height: 16px;
            border: 1.5px solid #475569;
            border-radius: 3px;
            margin: 0 auto;
          }
          .blank-line {
            width: 35px;
            border-bottom: 1px dashed #94a3b8;
            margin: 0 auto;
            height: 14px;
          }
          .summary-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 12px;
            font-weight: 800;
            margin-bottom: 24px;
            font-size: 12px;
          }
          .footer-sign {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            text-align: center;
            margin-top: 20px;
            page-break-inside: avoid;
          }
          .sign-role { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 45px; }
          .sign-line { border-bottom: 1px solid #0f172a; width: 80%; margin: 0 auto 4px auto; }
          .sign-sub { font-size: 10px; color: #64748b; }
          .instruction-note {
            margin-top: 18px;
            padding: 8px;
            border-left: 3px solid #f59e0b;
            background: #fffbeb;
            font-size: 10px;
            color: #92400e;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    onNotify(
      isBulkMode
        ? `${enrichedDraftGroups.length} Dokumen Picking List siap dicetak sekaligus!`
        : `Dokumen Picking List untuk SJ "${primaryDraft?.no_sj}" siap dicetak.`,
      'success'
    );
  };

  // 2. HANDLER WHATSAPP SHARE (SINGLE & MASSAL)
  const handleCopyWaText = () => {
    navigator.clipboard.writeText(customWaText);
    setIsCopiedWa(true);
    setTimeout(() => setIsCopiedWa(false), 2500);
    onNotify(
      isBulkMode
        ? `Daftar picking WhatsApp (${enrichedDraftGroups.length} SJ) berhasil disalin ke clipboard!`
        : 'Daftar picking WhatsApp berhasil disalin ke clipboard!',
      'success'
    );
  };

  const handleOpenWhatsAppWeb = () => {
    const url = getWhatsAppWebUrl(waTargetNumber, customWaText);
    window.open(url, '_blank');
    onNotify('Membuka WhatsApp...', 'info');
  };

  const handleSendFonnteAuto = async () => {
    if (!fonnteCfg.token) {
      onNotify('Token WhatsApp Fonnte belum diatur di Pengaturan Sistem.', 'warning');
      return;
    }
    const target = waTargetNumber.trim() || fonnteCfg.groupTarget;
    if (!target) {
      onNotify('Target nomor atau Group ID WhatsApp belum diisi.', 'warning');
      return;
    }

    setIsSendingFonnte(true);
    try {
      if (!isBulkMode) {
        const res = await sendFonnteMessage(target, customWaText, fonnteCfg.token);
        if (res.success) {
          playSuccessBeep();
          onNotify(`Berhasil mengirim daftar picking SJ ${primaryDraft?.no_sj} ke WhatsApp!`, 'success');
        } else {
          onNotify(`Gagal mengirim via Fonnte: ${res.message}`, 'error');
        }
      } else {
        // Kirim masing-masing SJ secara berurutan agar rapi per balon chat di grup WA
        let okCount = 0;
        for (let i = 0; i < enrichedDraftGroups.length; i++) {
          const g = enrichedDraftGroups[i];
          setProgressStep({
            current: i + 1,
            total: enrichedDraftGroups.length,
            label: `Mengirim WA SJ ${g.draft.no_sj} (${i + 1}/${enrichedDraftGroups.length})...`,
          });
          const res = await sendFonnteMessage(target, g.waText, fonnteCfg.token);
          if (res.success) okCount++;
        }
        setProgressStep(null);
        if (okCount > 0) {
          playSuccessBeep();
          onNotify(
            `✅ Berhasil mengirim ${okCount}/${enrichedDraftGroups.length} Tugas Picking ke Grup WhatsApp via Fonnte!`,
            'success'
          );
        } else {
          onNotify('Gagal mengirim pesan ke Fonnte.', 'error');
        }
      }
    } catch (err: any) {
      onNotify(`Gagal mengirim WA: ${err.message || err}`, 'error');
    } finally {
      setIsSendingFonnte(false);
      setProgressStep(null);
    }
  };

  // 3. HANDLER KIRIM KE TUGAS PICKING APP (SINGLE & MASSAL)
  const handleSendToPickingApp = async () => {
    setIsSendingToApp(true);
    let successCount = 0;
    let waSentCount = 0;
    const target = waTargetNumber.trim() || fonnteCfg.groupTarget;
    const canSendWa = alsoSendWaOnAppSubmit && Boolean(fonnteCfg.token && target);

    try {
      for (let i = 0; i < enrichedDraftGroups.length; i++) {
        const group = enrichedDraftGroups[i];
        const d = group.draft;
        setProgressStep({
          current: i + 1,
          total: enrichedDraftGroups.length,
          label: `Mengirim SJ ${d.no_sj} ke Tugas Picking App (${i + 1}/${enrichedDraftGroups.length})...`,
        });

        const itemsForApp = group.items.map((it) => {
          const allValidCodes = (it.locList || [])
            .filter((l) => (l.qty || 0) > 0)
            .map((l) => l.lokasi)
            .join(', ');
          return {
            sku: it.sku,
            nama_produk: it.nama_produk,
            size: it.size,
            lokasi: allValidCodes || it.primaryLokasi || it.lokasi,
            qty_req: it.qty,
          };
        });

        const res = await createPickingSuratJalanSupabase(
          d.no_sj,
          d.destination || 'Gudang',
          itemsForApp
        );

        if (res.success) {
          successCount++;
          if (onSuccessSentToApp) {
            onSuccessSentToApp(d.id, res.invoice_picking);
          }

          // Jika opsi "Sekaligus Kirim WA Grup (Fonnte)" dicentang, kirim WA lengkap dengan invoice_picking
          if (canSendWa) {
            try {
              const dateStr = d.tanggal_sj || new Date().toISOString().slice(0, 10);
              const waMsgWithInvoice = generateRefillPickingGroupMessage({
                no_sj: d.no_sj,
                destination: d.destination || 'Toko / Store',
                source: d.source || 'Warehouse',
                tanggal_sj: dateStr,
                operatorName: session?.name || session?.username || 'Admin Warehouse',
                invoice_picking: res.invoice_picking,
                items: group.items.map((it) => {
                  const activeStockLocs = (it.locList || []).filter((l) => (l.qty || 0) > 0);
                  const locTag =
                    activeStockLocs.length > 0
                      ? activeStockLocs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ')
                      : it.primaryLokasi && it.primaryLokasi !== '-' && it.primaryLokasi !== 'Warehouse'
                      ? it.primaryLokasi
                      : it.lokasi || 'Belum Ada Rak';
                  return {
                    sku: it.sku,
                    nama_produk: it.nama_produk,
                    size: it.size,
                    qty: it.qty,
                    lokasi: locTag,
                    isKosong: it.isKosong,
                  };
                }),
              });
              const waRes = await sendFonnteMessage(target, waMsgWithInvoice, fonnteCfg.token);
              if (waRes.success) waSentCount++;
            } catch (waErr) {
              console.warn('Gagal kirim WA otomatis untuk SJ', d.no_sj, waErr);
            }
          }
        }
      }

      if (successCount > 0) {
        playSaveSuccessChime();
        setSentCount(successCount);
        setIsSentToAppSuccess(true);
        if (isBulkMode) {
          const waInfo = waSentCount > 0 ? ` + ${waSentCount} WA Grup Terkirim` : '';
          onNotify(
            `✅ ${successCount} Surat Jalan (${totalQtyAll} pcs) berhasil dikirim massal ke Tugas Picking App!${waInfo}`,
            'success'
          );
        } else {
          const waInfo = waSentCount > 0 ? ' & Grup WA' : '';
          onNotify(
            `Surat Jalan "${primaryDraft?.no_sj}" (${totalQtyAll} pcs) berhasil dikirim ke Tugas Picking App${waInfo}!`,
            'success'
          );
        }
      }
    } catch (err: any) {
      console.error('Error send to picking app:', err);
      onNotify(`Gagal mengirim ke Tugas Picking App: ${err.message || err}`, 'error');
    } finally {
      setIsSendingToApp(false);
      setProgressStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {isBulkMode ? <Layers className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {isBulkMode ? `Kirim Tugas Picking Massal (${targetDrafts.length} SJ)` : 'Format Distribusi Picking'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {isBulkMode ? 'MODE MASSAL' : 'PENGIRIMAN'}
                </span>
              </div>
              {isBulkMode ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Total <strong>{targetDrafts.length} Surat Jalan</strong> · <strong>{totalSkuAll} SKU</strong> ({totalQtyAll} pcs) siap diproses sekaligus
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  SJ <strong className="font-mono text-slate-800 dark:text-slate-200">{primaryDraft?.no_sj}</strong> · Tujuan: <strong>{primaryDraft?.destination}</strong> · {totalSkuAll} SKU ({totalQtyAll} pcs)
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TAB CHOOSER (3 FORMAT PICKING UNTUK ADMIN) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Pilih Format Penugasan ke Picker ({isBulkMode ? `${targetDrafts.length} SJ Sekaligus` : '1 SJ'}):
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* OPSI 1: TUGAS PICKING APP */}
            <button
              type="button"
              onClick={() => setActiveTab('app')}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                activeTab === 'app'
                  ? 'border-purple-500 bg-white dark:bg-slate-800 ring-2 ring-purple-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg ${activeTab === 'app' ? 'bg-purple-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <Smartphone className="w-4 h-4" />
                </div>
                {activeTab === 'app' && <span className="w-2 h-2 rounded-full bg-purple-600" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white">
                  {isBulkMode ? `Tugas App (${targetDrafts.length} SJ)` : 'Tugas Picking App'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Digital di HP/Scanner</div>
              </div>
            </button>

            {/* OPSI 2: WA GRUP */}
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                activeTab === 'whatsapp'
                  ? 'border-emerald-500 bg-white dark:bg-slate-800 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg ${activeTab === 'whatsapp' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <MessageSquare className="w-4 h-4" />
                </div>
                {activeTab === 'whatsapp' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white">
                  {isBulkMode ? `WA Grup (${targetDrafts.length} SJ)` : 'Kirim WA Grup'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Fonnte Bot / Salin WA</div>
              </div>
            </button>

            {/* OPSI 3: CETAK */}
            <button
              type="button"
              onClick={() => setActiveTab('print')}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                activeTab === 'print'
                  ? 'border-blue-500 bg-white dark:bg-slate-800 ring-2 ring-blue-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg ${activeTab === 'print' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <Printer className="w-4 h-4" />
                </div>
                {activeTab === 'print' && <span className="w-2 h-2 rounded-full bg-blue-600" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white">
                  {isBulkMode ? `Cetak Kertas (${targetDrafts.length})` : 'Cetak Kertas'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Lembar kerja fisik A4</div>
              </div>
            </button>
          </div>
        </div>

        {/* PROGRESS BAR WHEN RUNNING BULK */}
        {progressStep && (
          <div className="px-5 py-2.5 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-800/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-800 dark:text-purple-200">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600 shrink-0" />
              <span>{progressStep.label}</span>
            </div>
            <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-300">
              {Math.round((progressStep.current / Math.max(1, progressStep.total)) * 100)}%
            </span>
          </div>
        )}

        {/* TAB CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* MULTI-SJ SELECTOR PILLS FOR PREVIEW */}
          {isBulkMode && !isSentToAppSuccess && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Daftar Surat Jalan Terpilih ({enrichedDraftGroups.length} SJ):
                </span>
                {loadingStock && (
                  <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Memuat lokasi rak live...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {enrichedDraftGroups.map((g, idx) => {
                  const isActivePill = idx === selectedPreviewDraftIdx;
                  return (
                    <button
                      key={g.draft.id}
                      type="button"
                      onClick={() => setSelectedPreviewDraftIdx(idx)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActivePill
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span className="font-mono font-black">{g.draft.no_sj}</span>
                      <span className="text-[10px] opacity-80">({g.draft.destination} · {g.totalQty} pcs)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 1: CETAK LEMBAR KERJA PICKING */}
          {activeTab === 'print' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 flex items-start gap-3">
                <Printer className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-bold">
                    {isBulkMode
                      ? `Cetak Massal ${enrichedDraftGroups.length} Surat Jalan Sekaligus (Otomatis Pisah Halaman A4)`
                      : 'Format Cetak Lembar Kerja Picking Fisik (Kertas A4)'}
                  </p>
                  <p className="text-blue-600 dark:text-blue-400 mt-0.5 leading-relaxed">
                    Menghasilkan dokumen cetak resmi dengan daftar barang yang <strong>diurutkan sesuai Lokasi Rak</strong>, barcode SKU, kotak checklist centang, dan kolom paraf checker.
                  </p>
                </div>
              </div>

              {/* Preview item table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span>
                      Pratinjau Item {activePreviewGroup?.draft.no_sj} ({activePreviewGroup?.totalSku || 0} SKU)
                    </span>
                    {loadingStock && (
                      <span className="flex items-center gap-1 text-[10px] text-primary-600 dark:text-primary-400 font-semibold animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa stok rak...
                      </span>
                    )}
                  </div>
                  <span>Subtotal: {activePreviewGroup?.totalQty || 0} pcs</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                  {enrichedItems.map((it) => (
                    <div key={it.sku} className="px-3.5 py-2 text-xs flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{it.sku}</span>
                          {it.isKosong ? (
                            <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 rounded text-[10px] font-extrabold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Rak: {it.primaryLokasi || it.lokasi} (Stok 0)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 rounded text-[10px] font-extrabold flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              Rak: {it.lokasi}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">{it.nama_produk}{it.size && it.size !== '-' ? ` (Size: ${it.size})` : ''}</div>
                      </div>
                      <div className="font-extrabold text-slate-900 dark:text-white shrink-0">
                        {it.qty} pcs
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handlePrintSjPicking}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {isBulkMode
                      ? `Cetak Semua ${enrichedDraftGroups.length} Surat Jalan Picking (A4)`
                      : 'Cetak Surat Jalan Picking (Print A4)'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: KIRIM WA GRUP */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  <p className="font-bold">
                    {isBulkMode
                      ? `Kirim WA Massal (${enrichedDraftGroups.length} Surat Jalan) ke Grup Picker Gudang`
                      : 'Format Teks WhatsApp untuk Grup Picker Gudang'}
                  </p>
                  <p className="text-emerald-600 dark:text-emerald-400 mt-0.5 leading-relaxed">
                    {isBulkMode
                      ? 'Saat dikirim via Fonnte Bot, setiap Surat Jalan akan dikirim sebagai pesan terpisah secara otomatis agar mudah dibaca oleh tim picker.'
                      : 'Daftar picking otomatis diformat dengan tebal, rapi, dan urut lokasi rak agar mudah dibaca oleh picker langsung dari WhatsApp di smartphone.'}
                  </p>
                </div>
              </div>

              {/* Target phone / group */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor WhatsApp / Group ID (Opsional):
                </label>
                <input
                  type="text"
                  value={waTargetNumber}
                  onChange={(e) => setWaTargetNumber(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 12036302...@g.us (biarkan kosong untuk pilih kontak di WA)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Preview Message */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Pratinjau Pesan WhatsApp {isBulkMode ? `(${enrichedDraftGroups.length} SJ Digabung)` : ''}:
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyWaText}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {isCopiedWa ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopiedWa ? 'Tersalin!' : 'Salin Teks'}</span>
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={customWaText}
                  onChange={(e) => setCustomWaText(e.target.value)}
                  className="w-full p-3 font-mono text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCopyWaText}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Copy className="w-4 h-4" />
                  <span>{isCopiedWa ? 'Tersalin ke Clipboard' : isBulkMode ? `Salin Semua (${enrichedDraftGroups.length} SJ)` : 'Salin Pesan'}</span>
                </button>

                {fonnteCfg.token && (
                  <button
                    type="button"
                    onClick={handleSendFonnteAuto}
                    disabled={isSendingFonnte}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSendingFonnte ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>
                      {isBulkMode
                        ? `Kirim Semua via Fonnte Bot (${enrichedDraftGroups.length} SJ)`
                        : 'Kirim Otomatis (Fonnte Bot)'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleOpenWhatsAppWeb}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Buka di WhatsApp (Web / HP)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: KIRIM KE TUGAS PICKING APP */}
          {activeTab === 'app' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 flex items-start gap-3">
                <Smartphone className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-800 dark:text-purple-300">
                  <p className="font-bold">
                    {isBulkMode
                      ? `Kirim Massal ${enrichedDraftGroups.length} Surat Jalan ke Modul Tugas Picking Aplikasi`
                      : 'Format Digital: Modul Tugas Picking Aplikasi'}
                  </p>
                  <p className="text-purple-600 dark:text-purple-400 mt-0.5 leading-relaxed">
                    {isBulkMode
                      ? `Seluruh ${enrichedDraftGroups.length} Surat Jalan (${totalQtyAll} pcs) akan langsung didaftarkan ke antrean Tugas Picking dengan kode antrean unik masing-masing tanpa perlu klik satu per satu.`
                      : 'Kirim daftar picking ini langsung ke database Supabase aplikasi WMS. Begitu dikirim, HP picker yang membuka aplikasi akan bergetar & berbunyi nada lonceng tanda tugas baru masuk.'}
                  </p>
                </div>
              </div>

              {isSentToAppSuccess ? (
                <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">
                      {isBulkMode
                        ? `${sentCount} Surat Jalan Berhasil Dikirim ke Tugas Picking App!`
                        : 'Tugas Picking Berhasil Dikirim ke Aplikasi!'}
                    </h4>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 max-w-md mx-auto">
                      {isBulkMode
                        ? `Total ${sentCount} SJ (${totalQtyAll} pcs) telah masuk ke antrean picking digital. Petugas picker sudah bisa langsung scan ambil barang.`
                        : `Surat Jalan ${primaryDraft?.no_sj} telah masuk ke antrean picking digital. Petugas picker sudah bisa mulai scan ambil barang.`}
                    </p>
                  </div>

                  {onNavigateToPickingTasks && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToPickingTasks();
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <span>Buka Modul Tugas Picking</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Item table preview */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs font-extrabold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <span>
                          {isBulkMode
                            ? `Rincian Item SJ ${activePreviewGroup?.draft.no_sj} (${activePreviewGroup?.totalSku || 0} SKU)`
                            : `Item yang akan dibuatkan tugas (${totalSkuAll} SKU)`}
                        </span>
                        {loadingStock && (
                          <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa stok rak...
                          </span>
                        )}
                      </div>
                      <span>
                        {isBulkMode
                          ? `SJ ini: ${activePreviewGroup?.totalQty || 0} pcs · Total ${enrichedDraftGroups.length} SJ: ${totalQtyAll} pcs`
                          : `Total: ${totalQtyAll} pcs`}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                      {enrichedItems.map((it) => (
                        <div key={it.sku} className="px-3.5 py-2 text-xs flex items-center justify-between">
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{it.sku}</span>
                              {it.isKosong ? (
                                <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 rounded text-[10px] font-extrabold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  Rak: {it.primaryLokasi || it.lokasi} (Stok 0)
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800/60 rounded text-[10px] font-extrabold flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                  Rak: {it.lokasi}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">{it.nama_produk}{it.size && it.size !== '-' ? ` (Size: ${it.size})` : ''}</div>
                          </div>
                          <div className="font-extrabold text-slate-900 dark:text-white shrink-0">
                            {it.qty} pcs
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Option to also send WA via Fonnte at the same time */}
                  {fonnteCfg.token && (waTargetNumber.trim() || fonnteCfg.groupTarget) && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={alsoSendWaOnAppSubmit}
                        onChange={(e) => setAlsoSendWaOnAppSubmit(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-extrabold text-emerald-800 dark:text-emerald-200">
                          Sekaligus Kirim Pesan ke Grup WA Gudang (Fonnte Bot)
                        </span>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Otomatis menyertakan Kode Antrean Picking (#OUT WA...) pada pesan WhatsApp setiap SJ
                        </p>
                      </div>
                    </label>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSendToPickingApp}
                      disabled={isSendingToApp || loadingStock}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSendingToApp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {progressStep
                              ? progressStep.label
                              : 'Mengirim ke Database Supabase...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-4 h-4" />
                          <span>
                            {isBulkMode
                              ? `Kirim Semua ${enrichedDraftGroups.length} SJ ke Tugas Picking App 🚀`
                              : 'Kirim ke Tugas Picking App Sekarang 🚀'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {isBulkMode
              ? `${enrichedDraftGroups.length} Surat Jalan (${totalSkuAll} SKU · ${totalQtyAll} pcs)`
              : 'Pilih salah satu format penugasan sesuai alur kerja gudang Anda'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};

