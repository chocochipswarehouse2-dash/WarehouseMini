import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Download,
  Share2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Layers,
  Search,
  Check,
  Copy,
  ChevronDown,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building,
  Smartphone,
} from 'lucide-react';
import { ProductItem, PeminjamanItemForm, PeminjamanRecord, ChannelStockItem, UserSession, PickingListItem } from '../types';
import {
  supabaseFetch,
  fetchPeminjamanFromSupabase,
  savePeminjamanToSupabase,
  returnPeminjamanSupabase,
  fetchRealtimeChannelStocksSupabase,
} from '../services/supabase';
import {
  getLocalPeminjamanRecords,
  saveLocalPeminjamanRecords,
  FALLBACK_CHANNEL_STOCKS,
} from '../services/gasApi';
import { sortAlphabeticalAndSize, fuzzySearchMultiple, fuzzySearch } from '../utils/sortUtils';

interface PeminjamanViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog: () => void;
}

export const PeminjamanView: React.FC<PeminjamanViewProps> = ({
  session,
  productCatalog,
  onShowToast,
  onRefreshCatalog,
}) => {
  // Navigation tabs for mobile / view switcher
  const [activeTab, setActiveTab] = useState<'form' | 'stok' | 'riwayat'>('form');

  // Form State
  const [namaPeminjam, setNamaPeminjam] = useState<string>('');
  const [keperluan, setKeperluan] = useState<string>('');
  const [tglPinjam, setTglPinjam] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PeminjamanItemForm[]>([
    {
      id: 'item-1',
      produk: '',
      size: '',
      sku: '',
      qty: 1,
      lokasi: 'BLOK F',
      stokMap: 0,
      stokStudio: 0,
      stokShp: 0,
      stokTtk: 0,
    },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Search & Combobox active state
  const [activeComboboxId, setActiveComboboxId] = useState<string | null>(null);
  const [comboboxSearch, setComboboxSearch] = useState<string>('');

  // Channel stock state - Loaded directly from Supabase realtime
  const [selectedChannel, setSelectedChannel] = useState<'BLOK_F' | 'STUDIO' | 'SHOPEE' | 'TIKTOK' | 'ALL'>('BLOK_F');
  const [searchStock, setSearchStock] = useState<string>('');
  const [channelStocks, setChannelStocks] = useState<ChannelStockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);

  // Load real channel stocks from Supabase
  const loadChannelStocks = async (showToast = false, keyword?: string) => {
    setLoadingStock(true);
    try {
      const liveStocks = await fetchRealtimeChannelStocksSupabase(keyword);
      if (liveStocks && liveStocks.length > 0) {
        setChannelStocks((prev) => {
          const map = new Map<string, ChannelStockItem>();
          // If searching, keep existing and merge/override with fresh query
          if (keyword) {
            prev.forEach((it) => map.set(it.sku.toUpperCase(), it));
          }
          liveStocks.forEach((it) => map.set(it.sku.toUpperCase(), it));
          return Array.from(map.values()).sort((a, b) => {
            if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
            return a.produk.localeCompare(b.produk);
          });
        });
        if (showToast) onShowToast(`Berhasil memuat ${liveStocks.length} data stok real-time dari Database!`, 'success');
      } else if (productCatalog && productCatalog.length > 0 && channelStocks.length === 0) {
        // Fallback to catalog if no stock logs yet
        const mapped: ChannelStockItem[] = productCatalog.map((p) => ({
          sku: p.k,
          produk: p.p,
          size: p.s || 'ALL',
          locStr: p.lokasi || 'BLOK F',
          studioQty: p.stokStudio || 0,
          shpQty: p.stokShp || 0,
          ttkQty: p.stokTtk || 0,
          totalQty: (p.stokStudio || 0) + (p.stokShp || 0) + (p.stokTtk || 0),
        }));
        setChannelStocks(mapped);
      }
    } catch (err) {
      console.warn('Error loading real stock from Supabase:', err);
      if (showToast) onShowToast('Gagal memuat stok real Database', 'error');
    } finally {
      setLoadingStock(false);
    }
  };

  // Live search debounce effect for realtime stock lookup
  useEffect(() => {
    if (!searchStock.trim() || searchStock.trim().length < 2) return;
    const timer = setTimeout(() => {
      loadChannelStocks(false, searchStock.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchStock]);

  // Loan Records history from Supabase with instant local cache
  const [records, setRecords] = useState<PeminjamanRecord[]>(() => {
    try {
      const cached = localStorage.getItem('wms_peminjaman_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return getLocalPeminjamanRecords();
  });

  // Modal State for Surat Jalan (PDF / Print / WhatsApp)
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<PeminjamanRecord | null>(null);
  const [copiedWaType, setCopiedWaType] = useState<'personal' | 'grup' | null>(null);

  // Load SPS records and real-time stocks from Supabase on mount
  useEffect(() => {
    const initData = async () => {
      try {
        const data = await fetchPeminjamanFromSupabase();
        if (data && data.length > 0) {
          setRecords(data);
        }
      } catch (err) {
        console.warn('Error loading SPS records from Supabase:', err);
      }
      await loadChannelStocks();
    };
    initData();
  }, []);

  // Synchronize when catalog updates if channelStocks is still empty
  useEffect(() => {
    if (channelStocks.length === 0 && productCatalog && productCatalog.length > 0) {
      loadChannelStocks();
    }
  }, [productCatalog]);

  // Add Item to Form
  const handleAddItem = () => {
    const newItem: PeminjamanItemForm = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      produk: '',
      size: '',
      sku: '',
      qty: 1,
      lokasi: 'BLOK F',
      stokMap: 0,
      stokStudio: 0,
      stokShp: 0,
      stokTtk: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Remove Item from Form
  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Update Item field
  const handleItemChange = (id: string, updates: Partial<PeminjamanItemForm>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  };

  // Select item from combobox
  const handleSelectProduct = (itemId: string, prod: any) => {
    const isChannel = 'studioQty' in prod;
    const prodSize: string = (isChannel ? prod.size : prod.s) || 'ALL';
    const prodSku: string = String(isChannel ? prod.sku : prod.k || '');
    const prodName: string = String((isChannel ? prod.produk : prod.p || prod.n) || '');
    
    // Look up in channel stocks for exact live inventory
    const matchedStock = channelStocks.find((c) => (c.sku || '').toUpperCase() === prodSku.toUpperCase());

    const studioQty = matchedStock?.studioQty ?? (isChannel ? prod.studioQty : prod.stokStudio ?? 0);
    const shpQty = matchedStock?.shpQty ?? (isChannel ? prod.shpQty : prod.stokShp ?? 0);
    const ttkQty = matchedStock?.ttkQty ?? (isChannel ? prod.ttkQty : prod.stokTtk ?? 0);
    const totalQty = matchedStock?.totalQty ?? (prod.stokMap ?? (studioQty + shpQty + ttkQty));
    const locStr: string = matchedStock?.locStr || (isChannel ? prod.locStr : prod.lokasi) || 'BLOK F';

    handleItemChange(itemId, {
      produk: prodName,
      sku: prodSku,
      size: prodSize,
      lokasi: locStr,
      stokMap: totalQty,
      stokStudio: studioQty,
      stokShp: shpQty,
      stokTtk: ttkQty,
    });
    setActiveComboboxId(null);
    setComboboxSearch('');
  };

  // Quick Add from Stock table to Form
  const handleQuickAddFromStock = (stock: ChannelStockItem) => {
    // Check if there is an empty item row
    const emptyIndex = items.findIndex((it) => !it.produk.trim());
    if (emptyIndex >= 0) {
      handleItemChange(items[emptyIndex].id, {
        produk: stock.produk,
        sku: stock.sku,
        size: stock.size,
        lokasi: stock.locStr || 'BLOK F',
        stokStudio: stock.studioQty,
        stokShp: stock.shpQty,
        stokTtk: stock.ttkQty,
        stokMap: stock.totalQty,
      });
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: `item-${Date.now()}`,
          produk: stock.produk,
          sku: stock.sku,
          size: stock.size,
          qty: 1,
          lokasi: stock.locStr || 'BLOK F',
          stokStudio: stock.studioQty,
          stokShp: stock.shpQty,
          stokTtk: stock.ttkQty,
          stokMap: stock.totalQty,
        },
      ]);
    }
    setActiveTab('form');
    onShowToast(`Ditambahkan ke form: ${stock.produk} (${stock.size})`, 'success');
  };

  // Submit Peminjaman Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPeminjam.trim()) {
      onShowToast('Nama / PIC Peminjam wajib diisi', 'error');
      return;
    }
    if (!keperluan.trim()) {
      onShowToast('Keperluan peminjaman wajib diisi', 'error');
      return;
    }
    if (!tglPinjam) {
      onShowToast('Tanggal pinjam wajib diisi', 'error');
      return;
    }

    const validItems = items.filter((it) => it.produk.trim() && it.qty > 0);
    if (validItems.length === 0) {
      onShowToast('Pilih minimal 1 item produk yang valid', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const noSps = `SPS-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      const newRecord: PeminjamanRecord = {
        id: noSps,
        noPeminjaman: noSps,
        namaPeminjam: namaPeminjam.trim(),
        keperluan: keperluan.trim(),
        tglPinjam,
        timestamp: nowIso,
        status: 'Dipinjam',
        items: validItems.map((it) => ({
          produk: it.produk,
          sku: it.sku || `SKU-${it.produk.slice(0, 4).toUpperCase()}`,
          size: it.size || 'ALL',
          qty: it.qty,
          lokasi: it.lokasi || 'BLOK F',
        })),
        username: session?.username || 'Operator',
      };

      // 1. Save directly to Supabase peminjaman_sps
      await savePeminjamanToSupabase(newRecord);

      // 2. Also create picking tasks in Supabase for Fulfillment
      try {
        const pickingTasks: PickingListItem[] = validItems.map((it) => ({
          no_sj: noSps,
          tanggal: tglPinjam,
          tujuan: `SPS: ${namaPeminjam.trim()} - ${keperluan.trim()}`,
          sku: it.sku.toUpperCase(),
          nama_produk: it.produk,
          qty_req: it.qty,
          qty_picked: 0,
          lokasi: it.lokasi || 'BLOK F',
          status: 'PENDING',
          created_at: nowIso,
        }));
        await supabaseFetch('picking_list', 'POST', pickingTasks);
      } catch (err) {
        console.warn('Gagal menambahkan ke picking_list Supabase', err);
      }

      // Update state & cache
      const updated = [newRecord, ...records.filter((r) => r.noPeminjaman !== noSps)];
      setRecords(updated);
      saveLocalPeminjamanRecords(updated);
      try {
        localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      } catch {}

      // Open Surat Jalan preview modal for the newly created record
      setSelectedRecordForModal(newRecord);

      // Reset form
      setNamaPeminjam('');
      setKeperluan('');
      setItems([
        {
          id: 'item-1',
          produk: '',
          size: '',
          sku: '',
          qty: 1,
          lokasi: 'BLOK F',
          stokMap: 0,
          stokStudio: 0,
          stokShp: 0,
          stokTtk: 0,
        },
      ]);

      onShowToast(`Peminjaman ${noSps} berhasil disimpan ke Database!`, 'success');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal mengirim pengajuan peminjaman';
      onShowToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export Channel Stock to CSV
  const handleExportStockCSV = () => {
    if (channelStocks.length === 0) {
      onShowToast('Tidak ada data stok untuk diexport', 'warning');
      return;
    }

    const headers = ['PRODUK', 'SIZE', 'SKU', 'LOKASI / RAK', 'STUDIO (BLOK F)', 'SHOPEE (SHP)', 'TIKTOK (TTK)', 'TOTAL QTY'];
    const rows = channelStocks.map((it) => [
      `"${it.produk.replace(/"/g, '""')}"`,
      `"${it.size}"`,
      `"${it.sku}"`,
      `"${it.locStr || '-'}"`,
      it.studioQty,
      it.shpQty,
      it.ttkQty,
      it.totalQty,
    ]);

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stok_live_peminjaman_${selectedChannel.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Data stok peminjaman berhasil diexport ke CSV', 'success');
  };

  // Filter channel stocks
  const filteredStocks = (() => {
    const filtered = channelStocks.filter((it) => {
      // Channel / Area filter
      if (selectedChannel === 'BLOK_F') {
        const inBlokF =
          it.locStr.toUpperCase().includes('BLOK F') ||
          it.locStr.toUpperCase().includes('RAK F') ||
          it.studioQty > 0 ||
          it.shpQty > 0 ||
          it.ttkQty > 0;
        if (!inBlokF && it.totalQty <= 0) return false;
      } else if (selectedChannel === 'STUDIO') {
        if (it.studioQty <= 0 && !it.locStr.toUpperCase().includes('STUDIO')) return false;
      } else if (selectedChannel === 'SHOPEE') {
        if (it.shpQty <= 0 && !it.locStr.toUpperCase().includes('SHOPEE') && !it.locStr.toUpperCase().includes('SHP')) return false;
      } else if (selectedChannel === 'TIKTOK') {
        if (it.ttkQty <= 0 && !it.locStr.toUpperCase().includes('TIKTOK') && !it.locStr.toUpperCase().includes('TTK')) return false;
      }

      // Search query filter
      if (!searchStock.trim()) return true;
      return fuzzySearchMultiple(searchStock, [it.sku, it.produk, it.size, it.locStr]);
    });
    
    return sortAlphabeticalAndSize(filtered, (i) => i.produk || i.sku || '', (i) => i.size || '');
  })();

  // Calculate totals
  const totalStockItems = filteredStocks.length;
  const totalStockPcs = filteredStocks.reduce((acc, curr) => {
    if (selectedChannel === 'STUDIO') return acc + curr.studioQty;
    if (selectedChannel === 'SHOPEE') return acc + curr.shpQty;
    if (selectedChannel === 'TIKTOK') return acc + curr.ttkQty;
    return acc + curr.totalQty;
  }, 0);

  // WhatsApp Message Generator
  const generateWaMessage = (record: PeminjamanRecord, type: 'personal' | 'grup') => {
    if (type === 'personal') {
      const itemsList = record.items.map((it) => `- ${it.produk} (Qty: ${it.qty})`).join('\n');
      return (
        `Halo Ka ${record.namaPeminjam},\n` +
        `Pengajuan peminjaman produk kamu telah kami terima:\n\n` +
        `No Invoice : ${record.noPeminjaman}\n` +
        `Keperluan  : ${record.keperluan}\n` +
        `Tanggal    : ${record.tglPinjam}\n\n` +
        `Daftar Produk:\n` +
        `${itemsList}\n\n` +
        `Telah kami terima dan akan segera diproses di gudang ya.`
      );
    } else {
      const itemsList = record.items
        .map((it) => `📦 ${it.produk}\n🔢 Qty: ${it.qty} pcs | 📍 Lokasi: ${it.lokasi}`)
        .join('\n\n');
      return (
        `@vina @yesi @novi @ria @nur\n` +
        `@eka Cetak SJ Peminjamannya ya\n\n` +
        `*PEMINJAMAN BARU (SPS)*\n` +
        `PIC: ${record.namaPeminjam}\n` +
        `No Invoice: ${record.noPeminjaman}\n` +
        `Keperluan: ${record.keperluan}\n` +
        `Tanggal: ${record.tglPinjam}\n\n` +
        `${itemsList}`
      );
    }
  };

  // Copy WhatsApp Text
  const handleCopyWa = (record: PeminjamanRecord, type: 'personal' | 'grup') => {
    const text = generateWaMessage(record, type);
    navigator.clipboard.writeText(text);
    setCopiedWaType(type);
    onShowToast(`Format pesan WA (${type === 'personal' ? 'Personal' : 'Grup'}) tersalin!`, 'success');
    setTimeout(() => setCopiedWaType(null), 2500);
  };

  // Print Surat Jalan
  const handlePrintSJ = (record: PeminjamanRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onShowToast('Popup terblokir, izinkan popup browser untuk cetak PDF', 'warning');
      return;
    }

    const itemsRows = record.items
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1;">${it.lokasi}</td>
      </tr>
    `
      )
      .join('');

    const qrText = encodeURIComponent(`#OUT "Peminjaman Invoice ${record.noPeminjaman}"`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Peminjaman Sementara - ${record.noPeminjaman}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .logo-sub { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .info-table td { padding: 4px 0; vertical-align: top; }
          .label { width: 160px; color: #64748b; font-weight: 600; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          .items-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; text-transform: uppercase; font-size: 11px; }
          .footer-sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; font-size: 12px; }
          .sign-box { height: 65px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">CHOCOCHIPS WMS</div>
            <div class="logo-sub">Surat Peminjaman Sementara (SPS)</div>
          </div>
          <div style="text-align:right;">
            <img src="${qrUrl}" width="80" height="80" alt="QR Code" style="display:block; margin-left:auto;" />
          </div>
        </div>

        <table class="info-table">
          <tr><td class="label">No Peminjaman</td><td><b>${record.noPeminjaman}</b></td></tr>
          <tr><td class="label">Tanggal Pengajuan</td><td>${new Date(record.timestamp).toLocaleString('id-ID')}</td></tr>
          <tr><td class="label">Nama / PIC Peminjam</td><td><b>${record.namaPeminjam}</b></td></tr>
          <tr><td class="label">Keperluan</td><td>${record.keperluan}</td></tr>
          <tr><td class="label">Tanggal Peminjaman</td><td>${record.tglPinjam}</td></tr>
          <tr><td class="label">Status Dokumen</td><td><b style="color:#059669;">${record.status}</b></td></tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:35px; text-align:center;">No</th>
              <th>Nama Produk</th>
              <th style="width:55px; text-align:center;">Size</th>
              <th style="width:110px;">SKU</th>
              <th style="width:45px; text-align:center;">Qty</th>
              <th style="width:110px;">Lokasi</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div>Peminjam / PIC</div>
            <div class="sign-box"></div>
            <div>( ${record.namaPeminjam} )</div>
          </div>
          <div>
            <div>Petugas Gudang / Scanner</div>
            <div class="sign-box"></div>
            <div>( ${session?.username || 'Petugas WMS'} )</div>
          </div>
          <div>
            <div>Kepala Gudang / Admin</div>
            <div class="sign-box"></div>
            <div>( .......................... )</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Toggle return status
  const handleToggleReturn = async (recordId: string) => {
    const target = records.find((r) => r.id === recordId || r.noPeminjaman === recordId);
    const nextStatus = target?.status === 'Dipinjam' ? 'Dikembalikan' : 'Dipinjam';

    const updated = records.map((r) => {
      if (r.id === recordId || r.noPeminjaman === recordId) {
        return { ...r, status: nextStatus as 'Dipinjam' | 'Dikembalikan' };
      }
      return r;
    });
    setRecords(updated);
    saveLocalPeminjamanRecords(updated);
    try {
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
    } catch {}

    if (target) {
      if (nextStatus === 'Dikembalikan') {
        await returnPeminjamanSupabase(target.noPeminjaman);
      } else {
        await savePeminjamanToSupabase({ ...target, status: 'Dipinjam' });
      }
    }
    onShowToast(`Status ${target?.noPeminjaman || 'peminjaman'} diubah menjadi ${nextStatus}!`, 'success');
  };

  return (
    <div id="peminjamanContainer" className="flex-1 p-3 sm:p-5 max-w-7xl mx-auto w-full space-y-4">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight uppercase">
              Form Peminjaman Sementara (SPS)
            </h2>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono">
              Live & Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Modul pengajuan peminjaman barang untuk Divisi Live TikTok, Shopee, Foto Studio, dan Warehouse.
          </p>
        </div>

        {/* View Switcher / Tab Buttons */}
        <div className="grid grid-cols-3 bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold w-full sm:w-auto gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'form'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Form Pengajuan</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stok')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'stok'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Stok Live <br className="sm:hidden"/>({totalStockPcs})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'riwayat'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Riwayat <br className="sm:hidden"/>({records.length})</span>
          </button>
        </div>
      </div>

      {/* Main 2-Panel Split Container for Desktop & Responsive Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: FORM PENGAJUAN (Visible in 'form' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-7 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 ${
            activeTab === 'stok' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                1. INFORMASI PEMINJAM
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              User: <b className="text-slate-700 dark:text-slate-300">{session?.username || 'Operator'}</b>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* PIC & Keperluan 2-Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  NAMA / PIC PEMINJAM <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={namaPeminjam}
                    onChange={(e) => setNamaPeminjam(e.target.value)}
                    placeholder="Contoh: Sarah / Host Live"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  KEPERLUAN PEMINJAMAN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={keperluan}
                  onChange={(e) => setKeperluan(e.target.value)}
                  placeholder="Contoh: Live TikTok / Shopee / Studio"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Tanggal Pinjam */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                TANGGAL PINJAM <span className="text-rose-500">*</span>
              </label>
              <div className="relative max-w-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="date"
                  required
                  value={tglPinjam}
                  onChange={(e) => setTglPinjam(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Multi-item rows section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  2. DAFTAR BARANG YANG DIPINJAM ({items.length} ITEM)
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3 text-emerald-500" />
                  <span>Tambah Item</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.map((item, index) => {
                  const isComboboxOpen = activeComboboxId === item.id;
                  const pool = channelStocks.length > 0 ? channelStocks : productCatalog;
                  const filteredProductOpts = (() => {
                    const filtered = pool.filter((p) => {
                      const name = 'p' in p ? p.p : p.produk;
                      const sku = 'k' in p ? p.k : p.sku;
                      return fuzzySearchMultiple(comboboxSearch, [name, sku]);
                    });
                    return sortAlphabeticalAndSize(filtered, (p) => ('p' in p ? p.p : p.produk) || ('k' in p ? p.k : p.sku) || '', (p) => ('s' in p ? p.s : p.size) || '');
                  })();

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-500 dark:text-slate-400">
                          Item #{index + 1}
                        </span>
                        {item.produk && (
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              (item.stokMap || 0) <= 0
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : item.qty > (item.stokMap || 0)
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            Lokasi: {item.lokasi || 'BLOK F'} | Studio: {item.stokStudio || 0} | Shopee: {item.stokShp || 0} | TikTok: {item.stokTtk || 0}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        {/* Combobox Select Product (7 cols) */}
                        <div className="sm:col-span-7 relative">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Pilih Produk & Size <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={item.produk ? `${item.produk} ${item.size ? `(${item.size})` : ''}` : comboboxSearch}
                              onFocus={() => {
                                setActiveComboboxId(item.id);
                                setComboboxSearch('');
                              }}
                              onChange={(e) => {
                                setComboboxSearch(e.target.value);
                                handleItemChange(item.id, { produk: e.target.value });
                              }}
                              placeholder="Ketik nama produk / SKU..."
                              className="w-full px-3 py-2 bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                          </div>

                          {/* Search dropdown panel */}
                          {isComboboxOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-1 space-y-1">
                              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                                <span>Pilih dari Real-Time Stok Database</span>
                                <span className="text-[9px] text-emerald-500 font-mono font-normal">Area BLOK F</span>
                              </div>
                              {filteredProductOpts.length === 0 ? (
                                <div className="p-3 text-center text-slate-400 italic text-xs">
                                  Produk tidak ditemukan
                                </div>
                              ) : (
                                filteredProductOpts.slice(0, 30).map((opt) => {
                                  const optName = 'p' in opt ? opt.p : opt.produk;
                                  const optSku = 'k' in opt ? opt.k : opt.sku;
                                  const optSize = 's' in opt ? opt.s : opt.size;
                                  const optStudio = 'studioQty' in opt ? opt.studioQty : (opt.stokStudio || 0);
                                  const optShp = 'shpQty' in opt ? opt.shpQty : (opt.stokShp || 0);
                                  const optTtk = 'ttkQty' in opt ? opt.ttkQty : (opt.stokTtk || 0);
                                  const optLoc = 'locStr' in opt ? opt.locStr : (opt.lokasi || 'BLOK F');

                                  return (
                                    <button
                                      key={optSku}
                                      type="button"
                                      onClick={() => handleSelectProduct(item.id, opt)}
                                      className="w-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800/70 rounded-lg text-left text-xs transition-colors flex items-center justify-between group cursor-pointer"
                                    >
                                      <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 flex items-center gap-1.5">
                                          <span>{optName}</span>
                                          {optStudio + optShp + optTtk === 0 && (
                                            <span className="text-[9px] font-black px-1.5 py-0.2 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded uppercase">
                                              Sold / Kosong
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400">
                                          SKU: {optSku} &bull; Size: {optSize || 'ALL'} &bull; <span className="text-slate-500">{optLoc}</span>
                                        </div>
                                      </div>
                                      <div className="text-right flex items-center gap-1">
                                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${optStudio > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`} title="Stok Studio">
                                          Studio: {optStudio}
                                        </span>
                                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${optShp > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`} title="Stok Shopee">
                                          SHP: {optShp}
                                        </span>
                                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${optTtk > 0 ? 'bg-slate-900 text-white dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`} title="Stok TikTok">
                                          TTK: {optTtk}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>

                        {/* Qty Stepper (3 cols) */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Jumlah (Qty) <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-[#09090B] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.id, { qty: Math.max(1, item.qty - 1) })}
                              className="px-2.5 py-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => handleItemChange(item.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              className="w-full text-center bg-transparent border-none outline-none text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.id, { qty: item.qty + 1 })}
                              className="px-2.5 py-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Delete Button (2 cols) */}
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            disabled={items.length <= 1}
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border border-rose-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="sm:hidden">Hapus</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Submit Buttons */}
            <div className="pt-3 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleAddItem}
                className="flex-[1] py-3 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all text-center leading-tight"
              >
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>+ Tambah<br className="sm:hidden" /> Item Lain</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex-[1.5] sm:flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] text-[11px] sm:text-xs tracking-wider uppercase flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all disabled:opacity-50 cursor-pointer text-center leading-tight"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>AJUKAN<br className="sm:hidden" /> PEMINJAMAN</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: STOK TERSEDIA (Visible in 'stok' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-5 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 ${
            activeTab === 'form' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          {/* Channel Header & Refresh */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  STOK TERSEDIA (DIVISI LIVE)
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Total: <b className="text-slate-800 dark:text-slate-200">{totalStockItems} SKU</b> &bull; <b className="text-emerald-500">{totalStockPcs} Pcs</b>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportStockCSV}
                title="Export Stok ke CSV"
                className="p-1.5 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-emerald-500 text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  loadChannelStocks(true);
                  onRefreshCatalog();
                }}
                title="Sinkronisasi Stok Real-Time Database"
                className={`p-1.5 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 hover:text-white text-xs transition-colors ${
                  loadingStock ? 'animate-spin text-emerald-500' : ''
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Segmented Channel & Location Buttons */}
          <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] sm:text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setSelectedChannel('BLOK_F')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'BLOK_F'
                  ? 'bg-blue-600 text-white font-extrabold shadow-[0_0_10px_rgba(37,99,235,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🏢 Blok F
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('SHOPEE')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'SHOPEE'
                  ? 'bg-amber-500 text-black font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🧡 Shopee
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('TIKTOK')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'TIKTOK'
                  ? 'bg-slate-800 text-white font-extrabold border border-slate-700 shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🖤 TikTok
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('STUDIO')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'STUDIO'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📍 Studio
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('ALL')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'ALL'
                  ? 'bg-slate-700 text-white font-extrabold shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🌐 Semua
            </button>
          </div>

          {/* Search stock input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchStock}
              onChange={(e) => setSearchStock(e.target.value)}
              placeholder="🔍 Cari nama produk / SKU di channel / lokasi..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Table of Available Stocks */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-100 dark:bg-[#0F0F12] text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-2.5">Produk & Lokasi</th>
                  <th className="p-2.5 text-center w-12">Size</th>
                  <th className="p-2.5 text-center w-14">Qty</th>
                  <th className="p-2.5 text-right w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {loadingStock ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400 italic text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                        <span>Memuat stok real-time dari Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400 italic text-xs">
                      Tidak ada stok pada filter ini
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((stk) => {
                    const displayQty =
                      selectedChannel === 'STUDIO'
                        ? stk.studioQty
                        : selectedChannel === 'SHOPEE'
                        ? stk.shpQty
                        : selectedChannel === 'TIKTOK'
                        ? stk.ttkQty
                        : stk.totalQty;

                    return (
                      <tr
                        key={stk.sku}
                        className="hover:bg-slate-50 dark:hover:bg-[#121217] transition-colors group"
                      >
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1 text-xs">
                            {stk.produk}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{stk.sku}</span>
                            <span>&bull;</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{stk.locStr}</span>
                          </div>
                          {/* Channel breakdown pills if multi-location */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stk.ttkQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 rounded font-mono font-bold">
                                🖤 TikTok: {stk.ttkQty}
                              </span>
                            )}
                            {stk.shpQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-mono font-bold">
                                🧡 Shopee: {stk.shpQty}
                              </span>
                            )}
                            {stk.studioQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded font-mono font-bold">
                                📍 Studio: {stk.studioQty}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold">
                            {stk.size}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {displayQty > 0 ? (
                            <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                              {displayQty}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                              Sold
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            disabled={displayQty <= 0}
                            onClick={() => handleQuickAddFromStock(stk)}
                            className={`px-2 py-1 rounded text-[10px] font-extrabold tracking-wider uppercase transition-colors ${
                              displayQty > 0
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 cursor-pointer active:scale-95'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
                            }`}
                          >
                            {displayQty > 0 ? '+ Pinjam' : 'Kosong'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FULL WIDTH: RIWAYAT PENGAJUAN (Visible in 'riwayat' tab) */}
        {activeTab === 'riwayat' && (
          <div className="col-span-12 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
              <div>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  RIWAYAT PENGAJUAN PEMINJAMAN SEMENTARA
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar transaksi peminjaman barang, cetak surat jalan, dan kirim notifikasi WhatsApp.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-extrabold text-emerald-500">
                      {rec.noPeminjaman}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleReturn(rec.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-all ${
                        rec.status === 'Dipinjam'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {rec.status}
                    </button>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rec.namaPeminjam}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {rec.keperluan} &bull; {rec.tglPinjam}
                    </div>
                  </div>

                  <div className="p-2 bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 rounded-lg space-y-1 text-[11px]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                      Barang Dipinjam ({rec.items.length} SKU):
                    </div>
                    {rec.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="line-clamp-1">
                          &bull; {it.produk} ({it.size})
                        </span>
                        <span className="font-mono font-bold text-emerald-500">{it.qty} Pcs</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRecordForModal(rec)}
                      className="py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span>Detail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintSJ(rec)}
                      className="py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Cetak SJ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyWa(rec, 'grup')}
                      className="py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>Kirim WA</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL PREVIEW SURAT JALAN & WHATSAPP FONNTE */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0F0F12]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    Surat Peminjaman Sementara ({selectedRecordForModal.noPeminjaman})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    PIC: {selectedRecordForModal.namaPeminjam} &bull; {selectedRecordForModal.tglPinjam}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Document Summary Card */}
              <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">No Invoice:</span>
                  <span className="font-bold text-emerald-400">{selectedRecordForModal.noPeminjaman}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">PIC Peminjam:</span>
                  <span className="text-slate-200">{selectedRecordForModal.namaPeminjam}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Keperluan:</span>
                  <span className="text-slate-200">{selectedRecordForModal.keperluan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal:</span>
                  <span className="text-slate-200">{selectedRecordForModal.tglPinjam}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Daftar Barang ({selectedRecordForModal.items.length} Item):
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-[#0F0F12] text-slate-400 text-[10px] font-bold uppercase">
                      <tr>
                        <th className="p-2">Produk</th>
                        <th className="p-2 text-center">Size</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2">Lokasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {selectedRecordForModal.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-sans font-semibold text-slate-800 dark:text-slate-200">{it.produk}</td>
                          <td className="p-2 text-center text-slate-400">{it.size}</td>
                          <td className="p-2 text-center font-bold text-emerald-400">{it.qty}</td>
                          <td className="p-2 text-slate-400">{it.lokasi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WhatsApp Fonnte Templates */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kirim Notifikasi WhatsApp (Fonnte):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyWa(selectedRecordForModal, 'personal')}
                    className="p-3 bg-slate-50 dark:bg-[#0F0F12] hover:bg-slate-100 dark:hover:bg-[#16161a] border border-slate-200 dark:border-slate-800 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-400">
                        1. Pesan Personal PIC
                      </span>
                      {copiedWaType === 'personal' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kirim konfirmasi pengajuan langsung ke WhatsApp peminjam.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyWa(selectedRecordForModal, 'grup')}
                    className="p-3 bg-slate-50 dark:bg-[#0F0F12] hover:bg-slate-100 dark:hover:bg-[#16161a] border border-slate-200 dark:border-slate-800 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-400">
                        2. Pesan Grup Gudang
                      </span>
                      {copiedWaType === 'grup' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kirim perintah cetak Surat Jalan ke grup WhatsApp gudang.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => handlePrintSJ(selectedRecordForModal)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-[0_0_12px_rgba(16,185,129,0.3)] text-xs flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Surat Jalan (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
