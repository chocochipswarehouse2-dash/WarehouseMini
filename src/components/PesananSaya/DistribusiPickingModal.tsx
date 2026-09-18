import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Printer, Send, Smartphone, Copy, Check, MessageSquare,
  Package, MapPin, Calendar, ArrowRight, ExternalLink, Loader2,
  CheckCircle2, AlertTriangle, FileText, ChevronRight
} from 'lucide-react';
import { PengecekanSJDraft, ProductItem, UserSession, ProductLocationInfo, StockRealtimeItem } from '../../types';
import { createPickingSuratJalanSupabase, fetchStockForSkus, isWarehouseLocation } from '../../services/supabase';
import { getWhatsAppWebUrl, getFonnteConfig, sendFonnteMessage } from '../../services/whatsapp';
import { playSaveSuccessChime, playSuccessBeep } from '../../services/audio';
import { extractSizeFromSku, cleanProductName, extractCleanSizeToken } from '../../utils/sortUtils';

interface DistribusiPickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: PengecekanSJDraft | null;
  productCatalog: ProductItem[];
  session: UserSession | null;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onSuccessSentToApp?: (draftId: string) => void;
  onNavigateToPickingTasks?: () => void;
}

type PickingTab = 'print' | 'whatsapp' | 'app';

export const DistribusiPickingModal: React.FC<DistribusiPickingModalProps> = ({
  isOpen,
  onClose,
  draft,
  productCatalog = [],
  session,
  onNotify,
  onSuccessSentToApp,
  onNavigateToPickingTasks,
}) => {
  const [activeTab, setActiveTab] = useState<PickingTab>('print');
  const [isSendingToApp, setIsSendingToApp] = useState<boolean>(false);
  const [isSentToAppSuccess, setIsSentToAppSuccess] = useState<boolean>(false);
  const [isSendingFonnte, setIsSendingFonnte] = useState<boolean>(false);
  const [assignedPicker, setAssignedPicker] = useState<string>('');
  const [isCopiedWa, setIsCopiedWa] = useState<boolean>(false);

  // Realtime warehouse stock state (stok_real_fisik dari Supabase)
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});
  const [loadingStock, setLoadingStock] = useState<boolean>(false);

  // Target WhatsApp group / nomor
  const fonnteCfg = getFonnteConfig();
  const [waTargetNumber, setWaTargetNumber] = useState<string>(() => fonnteCfg.groupTarget || '');

  // Key to track unique SKUs in draft items for reactive realtime stock fetching
  const draftSkusKey = useMemo(() => {
    return (draft?.items || [])
      .map((it) => (it.sku || '').trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(',');
  }, [draft?.items]);

  // Fetch realtime warehouse inventory by SKUs across warehouse locations whenever draft items change
  useEffect(() => {
    if (!isOpen || !draft || !draft.items || draft.items.length === 0) return;
    const skus = draft.items.map((it) => (it.sku || '').trim().toUpperCase()).filter(Boolean);
    const uniqueSkus = Array.from(new Set(skus));
    if (uniqueSkus.length === 0) return;

    setLoadingStock(true);
    fetchStockForSkus(uniqueSkus)
      .then((stocks) => {
        const map: Record<string, StockRealtimeItem[]> = {};
        // Pre-initialize all requested SKUs so we know they were checked
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
  }, [isOpen, draftSkusKey]);

  // Helper: Extract all locations for a given item / SKU (strictly warehouse area locations that actually have stock > 0)
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku) return [];
    const map = new Map<string, ProductLocationInfo>();

    // 1. Authoritative check: live Supabase stok_real_fisik data
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

    // 2. Fallback only while realtime data is still loading or not yet queried
    const strItemLokasi = String(itemLokasi || '').trim();
    if (strItemLokasi && strItemLokasi !== '-' && strItemLokasi !== '--' && !strItemLokasi.toUpperCase().includes('BLOK F')) {
      const parts = strItemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc));
      parts.forEach((loc, idx) => {
        map.set(loc, {
          lokasi: loc,
          isPrimary: idx === 0,
          source: 'SJ',
        });
      });
    }

    const catMatch = productCatalog.find((p) => p.k && p.k.trim().toUpperCase() === cleanSku);
    if (catMatch) {
      if (Array.isArray(catMatch.locList)) {
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
          } else if (typeof itemLoc === 'string') {
            const loc = itemLoc.trim().toUpperCase();
            if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc)) {
              if (!map.has(loc)) {
                map.set(loc, {
                  lokasi: loc,
                  isPrimary: map.size === 0,
                  source: 'CATALOG',
                });
              }
            }
          }
        });
      }
      if (catMatch.lokasi) {
        const loc = String(catMatch.lokasi).trim().toUpperCase();
        if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc)) {
          if (!map.has(loc)) {
            map.set(loc, {
              lokasi: loc,
              isPrimary: map.size === 0,
              source: 'CATALOG',
            });
          }
        }
      }
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

  // Map produk dari catalog dan realtime stok untuk mengambil lokasi rak dan size
  const enrichedItems = useMemo(() => {
    if (!draft || !draft.items) return [];

    const catalogMap = new Map<string, ProductItem>();
    productCatalog.forEach((p) => {
      if (p.k) catalogMap.set(p.k.toUpperCase().trim(), p);
      if ((p as any).sku) catalogMap.set(String((p as any).sku).toUpperCase().trim(), p);
    });

    const items = draft.items.map((it, idx) => {
      const cleanSku = it.sku.toUpperCase().trim();
      const prod = catalogMap.get(cleanSku)
        || productCatalog.find(p => (p.k && p.k.toUpperCase().trim() === cleanSku) || ((p as any).sku && String((p as any).sku).toUpperCase().trim() === cleanSku))
        || productCatalog.find(p => p.k && p.k.replace(/\s+/g, '').toUpperCase() === cleanSku.replace(/\s+/g, ''));

      let size = extractCleanSizeToken(prod?.s) || extractCleanSizeToken((it as any).size);
      const skuSize = extractSizeFromSku(cleanSku);
      if (skuSize && skuSize !== '-' && skuSize !== 'DEFAULT') {
        size = skuSize;
      }
      if (!size || size === '-') {
        size = '-';
      }

      const locs = getProductLocations(cleanSku, (it as any).lokasi);
      const emptyRacks = getRecordedEmptyLocations(cleanSku);
      const isRealtimeLoaded = cleanSku in realtimeSkuStocks;

      let lokasiDisplay = '-';
      let isKosong = false;

      const primaryLokasi = locs.length > 0
        ? locs[0].lokasi
        : (emptyRacks.length > 0
            ? emptyRacks[0]
            : ((it as any).lokasi && (it as any).lokasi !== '-' && (it as any).lokasi !== 'Warehouse'
                ? (it as any).lokasi
                : (prod?.lokasi && isWarehouseLocation(prod.lokasi) ? prod.lokasi : 'Warehouse')));

      if (locs.length > 0) {
        lokasiDisplay = locs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
      } else if (isRealtimeLoaded) {
        isKosong = true;
        if (emptyRacks.length > 0) {
          lokasiDisplay = emptyRacks.join(', ');
        } else if (primaryLokasi && primaryLokasi !== '-' && primaryLokasi !== 'Warehouse') {
          lokasiDisplay = primaryLokasi;
        } else {
          lokasiDisplay = 'Belum Ada Rak';
        }
      } else if ((it as any).lokasi && (it as any).lokasi !== '-' && (it as any).lokasi !== 'Warehouse') {
        lokasiDisplay = (it as any).lokasi;
      } else if (prod?.lokasi && isWarehouseLocation(prod.lokasi)) {
        lokasiDisplay = prod.lokasi;
      } else {
        lokasiDisplay = loadingStock ? 'Memeriksa Rak...' : 'Belum Ada Rak';
      }

      // Pastikan nama_produk mengambil nama asli dari katalog jika di draft isinya hanya SKU
      const catalogProdName = (prod?.p || prod?.nama_produk || prod?.n || (prod as any)?.name || (prod as any)?.nama || '').trim();
      const rawDraftName = (it.nama_produk || '').trim();
      const isDraftNameSku = !rawDraftName || rawDraftName.toUpperCase() === cleanSku || rawDraftName.toUpperCase().replace(/\s+/g, '') === cleanSku.replace(/\s+/g, '');
      const rawChosenName = (!isDraftNameSku && rawDraftName) ? rawDraftName : (catalogProdName || rawDraftName || cleanSku);
      // Clean product name so it never contains baked/nested "(Size: ...)"
      const nama = cleanProductName(rawChosenName);

      return {
        no: idx + 1,
        sku: cleanSku,
        nama_produk: nama,
        size: size || '-',
        lokasi: lokasiDisplay,
        primaryLokasi,
        locList: locs,
        emptyRacks,
        isKosong,
        qty: it.qty_sj || 1,
      };
    });

    // Urutkan berdasarkan Lokasi Rak agar memudahkan picker berjalan efisien di lorong gudang
    items.sort((a, b) => {
      const locComp = a.primaryLokasi.localeCompare(b.primaryLokasi, undefined, { numeric: true, sensitivity: 'base' });
      if (locComp !== 0) return locComp;
      return a.sku.localeCompare(b.sku);
    });

    return items;
  }, [draft, productCatalog, realtimeSkuStocks, loadingStock]);

  const totalQty = useMemo(() => {
    return enrichedItems.reduce((acc, it) => acc + it.qty, 0);
  }, [enrichedItems]);

  const totalSku = enrichedItems.length;

  // Generate teks WhatsApp otomatis
  const generatedWaText = useMemo(() => {
    if (!draft) return '';
    const dateStr = draft.tanggal_sj || new Date().toISOString().slice(0, 10);

    let text = `📋 *TUGAS PICKING GUDANG (PENGIRIMAN)*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*No SJ:* ${draft.no_sj}\n`;
    text += `*Tujuan:* ${draft.destination || 'Toko / Konsumen'}\n`;
    text += `*Asal:* ${draft.source || 'Warehouse'}\n`;
    text += `*Tanggal:* ${dateStr}\n`;
    text += `*Total:* ${totalSku} SKU | ${totalQty} Pcs\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*DAFTAR BARANG YANG HARUS DIAMBIL:*\n\n`;

    // Grouping per lokasi jika memungkinkan
    enrichedItems.forEach((it, idx) => {
      let locTag = '';
      if (it.locList && it.locList.length > 0) {
        locTag = `Rak ${it.locList.map(l => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ')}`;
      } else if (it.primaryLokasi && it.primaryLokasi !== '-' && it.primaryLokasi !== 'Warehouse') {
        locTag = `Rak ${it.primaryLokasi}`;
      } else if (it.lokasi && it.lokasi !== '-' && it.lokasi !== 'Belum Ada Rak') {
        locTag = `Rak ${it.lokasi}`;
      } else {
        locTag = 'Belum Ada Rak';
      }

      const stockNote = it.isKosong ? ' ⚠️ _(Stok sistem: 0 pcs - cek fisik)_' : '';
      const sizeTag = it.size && it.size !== '-' ? ` (Size: ${it.size})` : '';

      text += `${idx + 1}. 📍 *[${locTag}]*${stockNote}\n`;
      text += `   • SKU: \`${it.sku}\`\n`;
      text += `   • Produk: ${it.nama_produk}${sizeTag}\n`;
      text += `   • Qty Ambil: *${it.qty} pcs* [ ]\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Mohon picker yang bertugas mengonfirmasi di grup ini jika sudah mulai mengambil barang. Terima kasih!_ 🙏`;

    return text;
  }, [draft, enrichedItems, totalSku, totalQty]);

  const [customWaText, setCustomWaText] = useState<string>('');

  // Sinkronkan customWaText saat generatedWaText berubah
  React.useEffect(() => {
    setCustomWaText(generatedWaText);
  }, [generatedWaText]);

  if (!isOpen || !draft) return null;

  // 1. HANDLER CETAK SJ PICKING (PRINT OUT KERTAS A4)
  const handlePrintSjPicking = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotify('Jendela cetak terblokir. Harap izinkan popup di browser Anda.', 'warning');
      return;
    }

    const itemsRowsHtml = enrichedItems
      .map(
        (it, idx) => `
        <tr>
          <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
          <td style="font-weight:800; color:${it.isKosong ? '#e11d48' : '#0f172a'}; font-family:monospace; background:${it.isKosong ? '#fff1f2' : '#f8fafc'}; text-align:center;">${it.primaryLokasi || it.lokasi}</td>
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

    const qrText = encodeURIComponent(`PICKING:${draft.no_sj}:${draft.destination}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Jalan Picking List - ${draft.no_sj}</title>
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
        <div class="header">
          <div>
            <div class="logo-title">CHOCOCHIPS WAREHOUSE</div>
            <div class="doc-badge">SURAT JALAN PICKING LIST (PENGIRIMAN)</div>
          </div>
          <div style="text-align:right;">
            <img src="${qrUrl}" width="65" height="65" alt="QR Code SJ" style="display:block; margin-left:auto;" />
            <div style="font-size:9px; color:#64748b; margin-top:2px;">Scan Validasi</div>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <div class="info-item"><span class="info-label">No Surat Jalan:</span><span class="info-val font-mono" style="font-size:12px;">${draft.no_sj}</span></div>
            <div class="info-item"><span class="info-label">Asal Gudang:</span><span class="info-val">${draft.source || 'Warehouse'}</span></div>
            <div class="info-item"><span class="info-label">Tujuan Kirim:</span><span class="info-val" style="color:#2563eb;">${draft.destination}</span></div>
          </div>
          <div>
            <div class="info-item"><span class="info-label">Tanggal SJ:</span><span class="info-val">${draft.tanggal_sj}</span></div>
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
          <span>TOTAL KESELURUHAN ITEM:</span>
          <span>${totalSku} SKU &nbsp;|&nbsp; ${totalQty} Pcs</span>
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
    onNotify(`Dokumen Picking List untuk SJ "${draft.no_sj}" siap dicetak.`, 'success');
  };

  // 2. HANDLER WHATSAPP SHARE
  const handleCopyWaText = () => {
    navigator.clipboard.writeText(customWaText);
    setIsCopiedWa(true);
    setTimeout(() => setIsCopiedWa(false), 2500);
    onNotify('Daftar picking WhatsApp berhasil disalin ke clipboard!', 'success');
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
      const res = await sendFonnteMessage(target, customWaText, fonnteCfg.token);
      if (res.success) {
        playSuccessBeep();
        onNotify(`Berhasil mengirim daftar picking ke WhatsApp (${target})!`, 'success');
      } else {
        onNotify(`Gagal mengirim via Fonnte: ${res.message}`, 'error');
      }
    } catch (err: any) {
      onNotify(`Gagal mengirim WA: ${err.message || err}`, 'error');
    } finally {
      setIsSendingFonnte(false);
    }
  };

  // 3. HANDLER KIRIM KE TUGAS PICKING APP
  const handleSendToPickingApp = async () => {
    setIsSendingToApp(true);
    try {
      const itemsForApp = enrichedItems.map((it) => ({
        sku: it.sku,
        nama_produk: it.nama_produk,
        size: it.size,
        lokasi: it.primaryLokasi || it.lokasi,
        qty_req: it.qty,
      }));

      const res = await createPickingSuratJalanSupabase(
        draft.no_sj,
        draft.destination || 'Gudang',
        itemsForApp
      );

      if (res.success) {
        playSaveSuccessChime();
        setIsSentToAppSuccess(true);
        if (onSuccessSentToApp) {
          onSuccessSentToApp(draft.id);
        }
        onNotify(`Surat Jalan "${draft.no_sj}" (${totalQty} pcs) berhasil dikirim ke Tugas Picking App!`, 'success');
      }
    } catch (err: any) {
      console.error('Error send to picking app:', err);
      onNotify(`Gagal mengirim ke Tugas Picking App: ${err.message || err}`, 'error');
    } finally {
      setIsSendingToApp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Format Distribusi Picking
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  PENGIRIMAN
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                SJ <strong className="font-mono text-slate-800 dark:text-slate-200">{draft.no_sj}</strong> · Tujuan: <strong>{draft.destination}</strong> · {totalSku} SKU ({totalQty} pcs)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TAB CHOOSER (3 FORMAT PICKING UNTUK ADMIN) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Pilih Format Penugasan ke Picker:
          </label>
          <div className="grid grid-cols-3 gap-2">
            
            {/* OPSI 1: CETAK */}
            <button
              type="button"
              onClick={() => setActiveTab('print')}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                activeTab === 'print'
                  ? 'border-emerald-500 bg-white dark:bg-slate-800 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg ${activeTab === 'print' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <Printer className="w-4 h-4" />
                </div>
                {activeTab === 'print' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white">Cetak Kertas</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Lembar kerja fisik A4</div>
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
                <div className="text-xs font-bold text-slate-800 dark:text-white">Kirim WA Grup</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Teks WhatsApp siap kirim</div>
              </div>
            </button>

            {/* OPSI 3: TUGAS PICKING APP */}
            <button
              type="button"
              onClick={() => setActiveTab('app')}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                activeTab === 'app'
                  ? 'border-emerald-500 bg-white dark:bg-slate-800 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg ${activeTab === 'app' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <Smartphone className="w-4 h-4" />
                </div>
                {activeTab === 'app' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white">Tugas Picking App</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Digital di HP/Scanner</div>
              </div>
            </button>

          </div>
        </div>

        {/* TAB CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* TAB 1: CETAK LEMBAR KERJA PICKING */}
          {activeTab === 'print' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 flex items-start gap-3">
                <Printer className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-bold">Format Cetak Lembar Kerja Picking Fisik (Kertas A4)</p>
                  <p className="text-blue-600 dark:text-blue-400 mt-0.5 leading-relaxed">
                    Menghasilkan dokumen cetak resmi dengan daftar barang yang <strong>diurutkan sesuai Lokasi Rak</strong>, barcode SKU, kotak checklist centang, dan kolom paraf checker.
                  </p>
                </div>
              </div>

              {/* Preview item table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span>Daftar Item ({totalSku} SKU)</span>
                    {loadingStock && (
                      <span className="flex items-center gap-1 text-[10px] text-primary-600 dark:text-primary-400 font-semibold animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa stok rak...
                      </span>
                    )}
                  </div>
                  <span>Total: {totalQty} pcs</span>
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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Surat Jalan Picking (Print A4)</span>
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
                  <p className="font-bold">Format Teks WhatsApp untuk Grup Picker Gudang</p>
                  <p className="text-emerald-600 dark:text-emerald-400 mt-0.5 leading-relaxed">
                    Daftar picking otomatis diformat dengan tebal, rapi, dan urut lokasi rak agar mudah dibaca oleh picker langsung dari WhatsApp di smartphone.
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
                    Pratinjau Pesan WhatsApp:
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
                  <span>{isCopiedWa ? 'Tersalin ke Clipboard' : 'Salin Pesan'}</span>
                </button>

                {fonnteCfg.token && (
                  <button
                    type="button"
                    onClick={handleSendFonnteAuto}
                    disabled={isSendingFonnte}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSendingFonnte ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Kirim Otomatis (Fonnte Bot)</span>
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
                  <p className="font-bold">Format Digital: Modul Tugas Picking Aplikasi</p>
                  <p className="text-purple-600 dark:text-purple-400 mt-0.5 leading-relaxed">
                    Kirim daftar picking ini langsung ke database Supabase aplikasi WMS. Begitu dikirim, HP picker yang membuka aplikasi akan <strong>bergetar & berbunyi nada lonceng</strong> tanda tugas baru masuk.
                  </p>
                </div>
              </div>

              {isSentToAppSuccess ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">
                      Tugas Picking Berhasil Dikirim ke Aplikasi!
                    </h4>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 max-w-md mx-auto">
                      Surat Jalan <strong>{draft.no_sj}</strong> telah masuk ke antrean picking digital. Petugas picker sudah bisa mulai scan ambil barang.
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
                        <span>Item yang akan dibuatkan tugas ({totalSku} SKU)</span>
                        {loadingStock && (
                          <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa stok rak...
                          </span>
                        )}
                      </div>
                      <span>Total: {totalQty} pcs</span>
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

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSendToPickingApp}
                      disabled={isSendingToApp}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSendingToApp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengirim ke Database Supabase...</span>
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-4 h-4" />
                          <span>Kirim ke Tugas Picking App Sekarang 🚀</span>
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
            Pilih salah satu format penugasan sesuai alur kerja gudang Anda
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
