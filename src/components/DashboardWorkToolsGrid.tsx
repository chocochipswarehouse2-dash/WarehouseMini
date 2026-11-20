import React, { useMemo, useState, useEffect } from 'react';
import {
  ScanBarcode,
  ArrowRightLeft,
  ClipboardList,
  Sparkles,
  Trash2,
  Truck,
  ClipboardPlus,
  Scale,
  FileSpreadsheet,
  ShieldAlert,
  Box,
  FileDown,
  History,
  ClipboardCheck,
  PackageCheck,
  Send,
  FileCheck2,
  PackageOpen,
  ShoppingBag,
  Wrench,
  RotateCcw,
  HandHelping,
  QrCode,
  Barcode,
  Clock,
  Bot,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  LayoutGrid,
} from 'lucide-react';
import type { UserSession } from '../types';
import {
  canAccessPage,
  canAccessSettings,
  canAccessWmsAi,
  hasPermission,
  isStoreAccountSession,
  isSuperadmin,
} from '../services/permissions';
import { fetchPutawayTasks } from '../services/putawayService';

export type WorkToolCategory = 'all' | 'warehouse' | 'inbound_outbound' | 'order_qc' | 'utility';

interface WorkToolItem {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  category: Exclude<WorkToolCategory, 'all'>;
  priority?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconTint: string;
  badgeText?: string;
  badgeTone?: 'indigo' | 'amber' | 'rose' | 'emerald' | 'cyan';
  keywords: string;
  allowed: boolean;
  onTrigger: () => void;
}

export interface DashboardWorkToolsGridProps {
  session?: UserSession | null;
  onNavigate: (page: string, subTab?: string) => void;
  onOpenAnomalyModal: () => void;
  activePickingCount?: number;
  recountPendingCount?: number;
  anomalyTotalCount?: number;
  hasProduksiDraft?: boolean;
}

const CATEGORY_TABS: Array<{ id: WorkToolCategory; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'warehouse', label: 'Gudang & Rak' },
  { id: 'inbound_outbound', label: 'Inbound & Outbound' },
  { id: 'order_qc', label: 'Order & QC' },
  { id: 'utility', label: 'Cetak & Utilitas' },
];

export const DashboardWorkToolsGrid: React.FC<DashboardWorkToolsGridProps> = ({
  session = null,
  onNavigate,
  onOpenAnomalyModal,
  activePickingCount = 0,
  recountPendingCount = 0,
  anomalyTotalCount = 0,
  hasProduksiDraft = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<WorkToolCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePutawayCount, setActivePutawayCount] = useState(0);

  // Lightly hydrate active Putaway task count for live shortcut feedback
  useEffect(() => {
    let mounted = true;
    const loadPutawayCount = async () => {
      try {
        const tasks = await fetchPutawayTasks(false);
        if (mounted && Array.isArray(tasks)) {
          setActivePutawayCount(tasks.filter((t) => t.status === 'AKTIF').length);
        }
      } catch {}
    };
    loadPutawayCount();
    const onUpdated = () => {
      loadPutawayCount();
    };
    window.addEventListener('wms_putaway_tasks_updated', onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('wms_putaway_tasks_updated', onUpdated);
    };
  }, []);

  const userIsAdmin = isSuperadmin(session);
  const isStore = isStoreAccountSession(session);

  const canUseScanner = !session || canAccessPage(session, 'scanner');
  const canViewInventory = !session || userIsAdmin || hasPermission(session, 'menu_ops_inventory');
  const canRelocateRack =
    !isStore &&
    (!session ||
      userIsAdmin ||
      hasPermission(session, 'menu_ops_inventory') ||
      hasPermission(session, 'tab_ops_mutasi_scanner') ||
      hasPermission(session, 'menu_ops_mutasi'));
  const canUsePutaway =
    !isStore &&
    (!session ||
      userIsAdmin ||
      hasPermission(session, 'menu_ops_putaway') ||
      hasPermission(session, 'menu_ops_picking') ||
      hasPermission(session, 'menu_ops_inventory'));
  const canViewPicking =
    !session ||
    userIsAdmin ||
    hasPermission(session, 'menu_ops_picking') ||
    hasPermission(session, 'menu_ops_loading_dock');
  const canViewLogs =
    !session ||
    userIsAdmin ||
    hasPermission(session, 'tab_ops_mutasi_log') ||
    hasPermission(session, 'menu_ops_mutasi') ||
    hasPermission(session, 'menu_ops_inventory');
  const canImportStock =
    !isStore &&
    (!session ||
      userIsAdmin ||
      hasPermission(session, 'tab_ops_mutasi_scanner') ||
      hasPermission(session, 'menu_ops_mutasi') ||
      hasPermission(session, 'menu_ops_inventory'));
  const canOpenProduksi = !session || canAccessPage(session, 'produksi');
  const canOpenPenerimaanDock =
    !session ||
    userIsAdmin ||
    hasPermission(session, 'tab_ops_loading_penerimaan') ||
    hasPermission(session, 'menu_ops_loading_dock');
  const canOpenPengirimanDock =
    !session ||
    userIsAdmin ||
    hasPermission(session, 'tab_ops_loading_pengiriman') ||
    hasPermission(session, 'menu_ops_loading_dock');
  const canOpenTransferOrder =
    !session ||
    userIsAdmin ||
    hasPermission(session, 'tab_ops_loading_transfer_order') ||
    hasPermission(session, 'tab_ops_pesanan_transfer_order') ||
    hasPermission(session, 'menu_ops_loading_dock');
  const canOpenPacking = !session || canAccessPage(session, 'packing');
  const canOpenPesanan = !session || canAccessPage(session, 'pesanan_saya');
  const canOpenQc = !session || canAccessPage(session, 'perbaikan');
  const canOpenResolusi = !session || canAccessPage(session, 'pusat_resolusi');
  const canOpenPeminjaman = !session || canAccessPage(session, 'peminjaman');
  const canOpenCetakLabel = !session || canAccessPage(session, 'cetak_label');
  const canOpenPresensi = !session || canAccessPage(session, 'presensi');
  const canOpenStockOpname = Boolean(session && canAccessSettings(session) && userIsAdmin);
  const canOpenAi = Boolean(session && canAccessWmsAi(session));

  const openRackCapacityTool = (tool: 'relocation' | 'putaway' | 'recommendation' | 'setup' | 'multiselect') => {
    if (typeof window !== 'undefined') {
      (window as any).__wms_pending_rack_tool = tool;
      window.dispatchEvent(new CustomEvent('wms_rack_capacity_tool', { detail: { tool } }));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('wms_rack_capacity_tool', { detail: { tool } }));
      }, 140);
    }
    onNavigate('inventory', 'capacity');
  };

  const allTools: WorkToolItem[] = useMemo(
    () => [
      // === GUDANG & RAK (UTAMA) ===
      {
        id: 'scanner',
        title: 'Scanner Barcode',
        shortTitle: 'Scanner',
        subtitle: 'Scan IN / OUT / SO (popup offline)',
        category: 'warehouse',
        priority: true,
        icon: ScanBarcode,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: 'scanner barcode scan in out so kamera fisik',
        allowed: canUseScanner,
        onTrigger: () => onNavigate('scanner'),
      },
      {
        id: 'relokasi_rak',
        title: 'Relokasi Rak',
        shortTitle: 'Relokasi',
        subtitle: 'Pindah stok antar rak (#OUT + #IN)',
        category: 'warehouse',
        priority: true,
        icon: ArrowRightLeft,
        iconTint: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
        keywords: 'relokasi pindah rak lokasi mutasi',
        allowed: canRelocateRack,
        onTrigger: () => openRackCapacityTool('relocation'),
      },
      {
        id: 'tugas_picking',
        title: 'Tugas Picking',
        shortTitle: 'Picking',
        subtitle: 'Antrean ambil barang SJ & SPS',
        category: 'inbound_outbound',
        priority: true,
        icon: Truck,
        iconTint: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
        badgeText: activePickingCount > 0 ? `${activePickingCount} SJ` : undefined,
        badgeTone: 'amber',
        keywords: 'picking tugas ambil barang surat jalan sj invoice',
        allowed: canViewPicking,
        onTrigger: () => onNavigate('loading_dock', 'picking_tasks'),
      },
      {
        id: 'tugas_putaway',
        title: 'Tugas Putaway',
        shortTitle: 'Putaway',
        subtitle: 'Distribusi Koli/Transit ke Rak ABCD',
        category: 'warehouse',
        priority: true,
        icon: ClipboardList,
        iconTint: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400',
        badgeText: activePutawayCount > 0 ? `${activePutawayCount} aktif` : undefined,
        badgeTone: 'cyan',
        keywords: 'putaway tugas koli transit rak abcd simpan',
        allowed: canUsePutaway,
        onTrigger: () => openRackCapacityTool('putaway'),
      },
      {
        id: 'rekomendasi_pindah',
        title: 'Rekomendasi Pindah',
        shortTitle: 'Saran Rak',
        subtitle: 'Refill Koli, Overload & konsolidasi SKU',
        category: 'warehouse',
        priority: true,
        icon: Sparkles,
        iconTint: 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400',
        keywords: 'rekomendasi pindah refill overload konsolidasi rak',
        allowed: canViewInventory && !isStore,
        onTrigger: () => openRackCapacityTool('recommendation'),
      },
      {
        id: 'kosongkan_rak',
        title: 'Kosongkan Rak',
        shortTitle: 'Kosongkan',
        subtitle: 'Reset lokasi ke 0 + backup JSON',
        category: 'warehouse',
        priority: true,
        icon: Trash2,
        iconTint: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
        keywords: 'kosongkan rak reset 0 purge hapus lokasi',
        allowed: userIsAdmin,
        onTrigger: () => {
          window.dispatchEvent(new CustomEvent('wms_open_location_purge', { detail: { locations: [] } }));
        },
      },
      {
        id: 'input_produksi',
        title: 'Terima Produksi',
        shortTitle: 'Produksi',
        subtitle: 'Input penerimaan barang produksi',
        category: 'inbound_outbound',
        priority: true,
        icon: ClipboardPlus,
        iconTint: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
        badgeText: hasProduksiDraft ? 'Draft' : undefined,
        badgeTone: 'emerald',
        keywords: 'produksi input penerimaan konveksi barang masuk',
        allowed: canOpenProduksi,
        onTrigger: () => onNavigate('popup_produksi_input'),
      },
      {
        id: 'hitung_ulang',
        title: 'Audit Hitung Ulang',
        shortTitle: 'Hitung Ulang',
        subtitle: 'Verifikasi fisik kode produksi',
        category: 'inbound_outbound',
        priority: true,
        icon: Scale,
        iconTint: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
        badgeText: recountPendingCount > 0 ? `${recountPendingCount} kode` : undefined,
        badgeTone: 'amber',
        keywords: 'hitung ulang recount audit verifikasi fisik produksi',
        allowed: canOpenProduksi,
        onTrigger: () => onNavigate('popup_hitung_ulang'),
      },

      // === FITUR KERJA TAMBAHAN (GUDANG & RAK) ===
      {
        id: 'cek_anomali',
        title: 'Cek Anomali Stok',
        shortTitle: 'Anomali',
        subtitle: 'Audit lokasi non-rak, minus & SKU',
        category: 'warehouse',
        priority: true,
        icon: ShieldAlert,
        iconTint: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
        badgeText: anomalyTotalCount > 0 ? `${anomalyTotalCount} temuan` : undefined,
        badgeTone: 'rose',
        keywords: 'anomali audit stok minus lokasi rusak master',
        allowed: canViewInventory && !isStore,
        onTrigger: onOpenAnomalyModal,
      },
      {
        id: 'impor_stok',
        title: 'Impor Excel / CSV',
        shortTitle: 'Impor CSV',
        subtitle: 'Unggah massal mutasi IN / OUT / SO',
        category: 'warehouse',
        priority: true,
        icon: FileSpreadsheet,
        iconTint: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
        keywords: 'impor import excel csv stok massal upload',
        allowed: canImportStock,
        onTrigger: () => {
          window.dispatchEvent(new CustomEvent('wms_open_import_stok_modal'));
        },
      },
      {
        id: 'kapasitas_rak',
        title: 'Kapasitas & Denah',
        shortTitle: 'Kapasitas',
        subtitle: 'Peta isi rak ABCD, Koli & Blok F',
        category: 'warehouse',
        priority: true,
        icon: LayoutGrid,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: 'kapasitas rak denah abcd koli blok f overload',
        allowed: canViewInventory || canUsePutaway,
        onTrigger: () => onNavigate('inventory', 'capacity'),
      },
      {
        id: 'visual_3d',
        title: 'Denah Gudang 3D',
        shortTitle: 'Denah 3D',
        subtitle: 'Visualisasi 3D interaktif rak gudang',
        category: 'warehouse',
        icon: Box,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: '3d visual denah gudang peta rak',
        allowed: canViewInventory && !isStore,
        onTrigger: () => onNavigate('inventory', 'visual_3d'),
      },
      {
        id: 'ekspor_lokasi',
        title: 'Ekspor Isi Lokasi',
        shortTitle: 'Ekspor Rak',
        subtitle: 'Rekap & cetak daftar SKU per rak',
        category: 'warehouse',
        icon: FileDown,
        iconTint: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        keywords: 'ekspor export cetak isi lokasi rak pdf csv',
        allowed: canViewInventory && !isStore,
        onTrigger: () => {
          if (typeof window !== 'undefined') {
            (window as any).__wms_pending_lokasi_export = true;
            window.dispatchEvent(new CustomEvent('wms_open_lokasi_export_modal'));
          }
          onNavigate('inventory', 'capacity');
        },
      },
      {
        id: 'log_mutasi',
        title: 'Log Mutasi Produk',
        shortTitle: 'Log Mutasi',
        subtitle: 'Audit trail riwayat scan IN/OUT/SO',
        category: 'warehouse',
        icon: History,
        iconTint: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        keywords: 'log mutasi riwayat produk scan history',
        allowed: canViewLogs,
        onTrigger: () => onNavigate('inventory', 'logs'),
      },
      {
        id: 'stock_opname',
        title: 'Stock Opname (SO)',
        shortTitle: 'Opname SO',
        subtitle: 'Rekonsiliasi & approval hasil scan SO',
        category: 'warehouse',
        icon: ClipboardCheck,
        iconTint: 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400',
        keywords: 'stock opname so rekonsiliasi selisih adjustment',
        allowed: canOpenStockOpname,
        onTrigger: () => {
          if (typeof window !== 'undefined') {
            (window as any).__wms_pending_settings_tab = 'opname';
            window.dispatchEvent(new CustomEvent('wms_open_settings_tab', { detail: { tab: 'opname' } }));
          }
          onNavigate('pengaturan_sistem');
        },
      },

      // === INBOUND & OUTBOUND ===
      {
        id: 'penerimaan_dock',
        title: 'Penerimaan Dock',
        shortTitle: 'Penerimaan',
        subtitle: 'Catat barang masuk Loading Dock',
        category: 'inbound_outbound',
        icon: PackageCheck,
        iconTint: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
        keywords: 'penerimaan loading dock inbound barang masuk',
        allowed: canOpenPenerimaanDock,
        onTrigger: () => onNavigate('loading_dock', 'penerimaan'),
      },
      {
        id: 'pengiriman_dock',
        title: 'Pengiriman Store',
        shortTitle: 'Pengiriman',
        subtitle: 'Kirim koli toko, kurir & cetak SJ',
        category: 'inbound_outbound',
        icon: Send,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: 'pengiriman store paket kurir surat jalan koli',
        allowed: canOpenPengirimanDock,
        onTrigger: () => onNavigate('loading_dock', 'pengiriman'),
      },
      {
        id: 'transfer_order',
        title: 'Cek Surat Jalan',
        shortTitle: 'Cek SJ',
        subtitle: 'Transfer Order & distribusi stok',
        category: 'inbound_outbound',
        icon: FileCheck2,
        iconTint: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
        keywords: 'pengecekan surat jalan transfer order distribusi store',
        allowed: canOpenTransferOrder,
        onTrigger: () => onNavigate('loading_dock', 'transfer_order'),
      },
      {
        id: 'packing',
        title: 'Stasiun Packing',
        shortTitle: 'Packing',
        subtitle: 'Scan verifikasi resi & barang keluar',
        category: 'inbound_outbound',
        icon: PackageOpen,
        iconTint: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
        keywords: 'packing stasiun resi verifikasi keluar paket',
        allowed: canOpenPacking,
        onTrigger: () => onNavigate('packing'),
      },

      // === ORDER, QC & RESOLUSI ===
      {
        id: 'manual_shipment_form',
        title: 'Input Order Store',
        shortTitle: 'Order Baru',
        subtitle: 'Form Manual Shipment & Alteration',
        category: 'order_qc',
        priority: isStore,
        icon: ShoppingBag,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: 'manual shipment alteration permak form order store pesanan',
        allowed: canOpenPesanan,
        onTrigger: () => {
          if (typeof window !== 'undefined') {
            const target = {
              tab: 'manual_shipment',
              subTab: 'manual_shipment',
              manualSubTab: 'form',
            };
            (window as any).__wms_pending_pesanan_target = target;
            window.dispatchEvent(new CustomEvent('wms_open_pesanan_target', { detail: target }));
          }
          onNavigate('pesanan_saya');
        },
      },
      {
        id: 'qc_perbaikan',
        title: 'QC & Perbaikan',
        shortTitle: 'QC / Cuci',
        subtitle: 'Laporan QC, Cuci, Permak & Defect',
        category: 'order_qc',
        icon: Wrench,
        iconTint: 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400',
        keywords: 'qc quality control perbaikan cuci permak defect reject',
        allowed: canOpenQc,
        onTrigger: () => onNavigate('perbaikan'),
      },
      {
        id: 'pusat_resolusi',
        title: 'Retur Barang',
        shortTitle: 'Retur',
        subtitle: 'Tiket retur CS & penggantian SKU',
        category: 'order_qc',
        icon: RotateCcw,
        iconTint: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
        keywords: 'retur barang pusat resolusi cs pengganti',
        allowed: canOpenResolusi,
        onTrigger: () => onNavigate('pusat_resolusi'),
      },
      {
        id: 'peminjaman',
        title: 'Peminjaman SPS',
        shortTitle: 'Peminjaman',
        subtitle: 'Catat pinjam stok Studio / Event',
        category: 'order_qc',
        icon: HandHelping,
        iconTint: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400',
        keywords: 'peminjaman sps studio pinjam barang event',
        allowed: canOpenPeminjaman,
        onTrigger: () => onNavigate('peminjaman'),
      },

      // === CETAK & UTILITAS ===
      {
        id: 'cetak_qr_paket',
        title: 'Cetak Label QR',
        shortTitle: 'Label QR',
        subtitle: 'Stiker #LOK / #IN / #OUT & Label Paket',
        category: 'utility',
        priority: true,
        icon: QrCode,
        iconTint: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        keywords: 'cetak label qr prefix rak paket thermal stiker',
        allowed: canOpenCetakLabel,
        onTrigger: () => onNavigate('cetak_label', 'qr_prefix'),
      },
      {
        id: 'cetak_barcode',
        title: 'Cetak Barcode SKU',
        shortTitle: 'Barcode',
        subtitle: 'Stiker barcode produk 50×20mm',
        category: 'utility',
        icon: Barcode,
        iconTint: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        keywords: 'cetak barcode produk sku stiker thermal 50x20',
        allowed: canOpenCetakLabel,
        onTrigger: () => onNavigate('cetak_barcode', 'barcode'),
      },
      {
        id: 'presensi',
        title: 'Presensi Harian',
        shortTitle: 'Presensi',
        subtitle: 'Absensi masuk & pulang shift kerja',
        category: 'utility',
        icon: Clock,
        iconTint: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
        keywords: 'presensi absen masuk pulang shift kehadiran',
        allowed: canOpenPresensi,
        onTrigger: () => onNavigate('presensi'),
      },
      {
        id: 'asisten_ai',
        title: 'Asisten AI WMS',
        shortTitle: 'Tanya AI',
        subtitle: 'Cek stok, rak & pesanan via chat cepat',
        category: 'utility',
        icon: Bot,
        iconTint: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        keywords: 'ai asisten pintar tanya stok rak',
        allowed: canOpenAi,
        onTrigger: () => {
          window.dispatchEvent(new CustomEvent('wms_open_ai_modal'));
        },
      },
    ],
    [
      canUseScanner,
      canRelocateRack,
      canViewPicking,
      canUsePutaway,
      canViewInventory,
      isStore,
      userIsAdmin,
      canOpenProduksi,
      canImportStock,
      canViewLogs,
      canOpenStockOpname,
      canOpenPenerimaanDock,
      canOpenPengirimanDock,
      canOpenTransferOrder,
      canOpenPacking,
      canOpenPesanan,
      canOpenQc,
      canOpenResolusi,
      canOpenPeminjaman,
      canOpenCetakLabel,
      canOpenPresensi,
      canOpenAi,
      activePickingCount,
      activePutawayCount,
      recountPendingCount,
      anomalyTotalCount,
      hasProduksiDraft,
      onNavigate,
      onOpenAnomalyModal,
    ]
  );

  const allowedTools = useMemo(() => allTools.filter((t) => t.allowed), [allTools]);

  const filteredTools = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allowedTools.filter((t) => {
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.keywords.includes(q)
      );
    });
  }, [allowedTools, selectedCategory, searchTerm]);

  // Show compact top set when 'all' is selected and not searching/expanded, so dashboard stays crisp above the fold
  const shouldCompactDefault = selectedCategory === 'all' && !searchTerm.trim() && !isExpanded;
  const mobileVisibleTools = shouldCompactDefault ? filteredTools.slice(0, 8) : filteredTools;
  const desktopVisibleTools = shouldCompactDefault ? filteredTools.slice(0, 12) : filteredTools;

  if (allowedTools.length === 0) return null;

  const getBadgeTextColor = (tone?: WorkToolItem['badgeTone']) => {
    switch (tone) {
      case 'rose':
        return 'text-rose-600 dark:text-rose-400';
      case 'amber':
        return 'text-amber-600 dark:text-amber-400';
      case 'emerald':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'cyan':
        return 'text-cyan-600 dark:text-cyan-400';
      default:
        return 'text-indigo-600 dark:text-indigo-400';
    }
  };

  return (
    <section
      aria-label="Alat Bantu Kerja"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3 sm:p-4 space-y-3"
    >
      {/* Header Row: Title + Category Tabs + Compact Search + Expand Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight">
                Alat Bantu Kerja
              </h2>
              <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                {allowedTools.length} pintasan
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              Akses cepat 1 klik ke scanner, relokasi rak, picking, putaway, dan modul kerja harian
            </p>
          </div>

          {/* Mobile Expand/Collapse button */}
          {selectedCategory === 'all' && !searchTerm.trim() && filteredTools.length > 8 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 cursor-pointer shrink-0"
            >
              <span>{isExpanded ? 'Ringkas' : `Semua (${filteredTools.length})`}</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Category Filter Tabs (Horizontal Swipe on Mobile) + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap -mx-1 px-1 sm:mx-0 sm:px-0">
            {CATEGORY_TABS.map((tab) => {
              const count =
                tab.id === 'all'
                  ? allowedTools.length
                  : allowedTools.filter((t) => t.category === tab.id).length;
              if (tab.id !== 'all' && count === 0) return null;
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-indigo-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Compact Search Input (Desktop & Expanded) */}
          <div className="relative sm:w-44 lg:w-52 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari alat kerja..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Hapus pencarian alat kerja"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty Search State */}
      {filteredTools.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          Tidak ditemukan alat kerja untuk &ldquo;{searchTerm}&rdquo;.
        </div>
      ) : (
        <>
          {/* MOBILE LAUNCHER VIEW (< 640px): Native 4-Column App Shortcut Grid */}
          <div className="grid grid-cols-4 gap-2 sm:hidden">
            {mobileVisibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={tool.onTrigger}
                  className="group relative flex flex-col items-center justify-start gap-1.5 p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 active:scale-[0.96] active:bg-slate-100 dark:active:bg-slate-800 border border-slate-200/70 dark:border-slate-800 transition-all cursor-pointer min-h-[82px]"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tool.iconTint}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight text-center line-clamp-2">
                    {tool.shortTitle}
                  </span>
                  {tool.badgeText && (
                    <span
                      className={`text-[9px] font-mono font-extrabold tabular-nums leading-none ${getBadgeTextColor(
                        tool.badgeTone
                      )}`}
                    >
                      {tool.badgeText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TABLET & DESKTOP GRID (>= 640px): Fluid Multi-Column Operational Tiles */}
          <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2">
            {desktopVisibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={tool.onTrigger}
                  title={`${tool.title} — ${tool.subtitle}`}
                  className="group flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600/80 text-left transition-all cursor-pointer min-w-0 active:scale-[0.99]"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${tool.iconTint}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {tool.title}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 leading-snug">
                      {tool.subtitle}
                    </p>
                    {tool.badgeText && (
                      <div
                        className={`text-[10px] font-mono font-extrabold tabular-nums mt-1 ${getBadgeTextColor(
                          tool.badgeTone
                        )}`}
                      >
                        {tool.badgeText}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop Expand / Collapse Footer Row */}
          {selectedCategory === 'all' && !searchTerm.trim() && filteredTools.length > 12 && (
            <div className="hidden sm:flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Menampilkan{' '}
                <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  {desktopVisibleTools.length}
                </strong>{' '}
                dari{' '}
                <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  {filteredTools.length}
                </strong>{' '}
                alat bantu kerja
              </span>
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
              >
                <span>
                  {isExpanded
                    ? 'Tampilkan Lebih Ringkas'
                    : `Lihat Semua Alat Kerja (+${filteredTools.length - 12})`}
                </span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default DashboardWorkToolsGrid;
