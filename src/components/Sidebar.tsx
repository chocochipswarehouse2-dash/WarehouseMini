import React from 'react';
import {
  ScanBarcode,
  Package,
  FileText,
  Settings,
  LogOut,
  Moon,
  Sun,
  Palette,
  Layers,
  Smartphone,
  Monitor,
  Bell,
  BellRing,
  User,
  Clock,
  Calendar,
  Zap,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ClipboardCheck,
  ClipboardList,
  BookOpen,
  ArrowRightLeft,
  Boxes,
  Lock,
  Database,
  BarChart3,
  Users,
  Scissors,
  Truck,
  Printer,
  QrCode,
  Send,
  Map,
  ShieldAlert,
  Factory,
  Receipt,
  Download,
} from 'lucide-react';
import { UserSession, ActivePage } from '../types';
import { hasPermission, isSuperadmin, canAccessSettings, canAccessJneRekap, ROLE_DETAILS } from '../services/permissions';
import { getUserPersonName } from '../utils/userResolver';
import { CURRENT_APP_VERSION } from '../config/appVersion';
import { useAppUpdate } from '../hooks/useAppUpdate';

interface SidebarProps {
  session: UserSession | null;
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenThemePicker: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  isRealtimeConnected: boolean;
  onOpenSettings: () => void;
  onOpenApkModal: () => void;
  onOpenUpdateDatabase?: () => void;
  onOpenUpdateModal?: () => void;
  onLogout: () => void;
  totalScannedCount: number;
  hasNewPickingAlert?: boolean;
  hasNewPesananAlert?: boolean;
}

import { AppLogo } from './Logo';

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  activePage,
  onSelectPage,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  onOpenThemePicker,
  notificationPermission,
  onRequestNotification,
  isRealtimeConnected,
  onOpenSettings,
  onOpenApkModal,
  onOpenUpdateDatabase,
  onOpenUpdateModal,
  onLogout,
  totalScannedCount,
  hasNewPickingAlert = false,
  hasNewPesananAlert = false,
}) => {
  const { status: updateStatus, latestVersion } = useAppUpdate();
  const hasUpdatePending = updateStatus === 'available' || updateStatus === 'ready';
  const isUpdateDownloading = updateStatus === 'downloading';

  const userIsAdmin = isSuperadmin(session);
  const userCanAccessSettings = canAccessSettings(session);

  // Operasional
  const canViewDashboard = userIsAdmin || hasPermission(session, 'menu_ops_dashboard');
  const canAgenda = userIsAdmin || hasPermission(session, 'menu_ops_agenda') || 
    hasPermission(session, 'tab_ops_agenda_kalendar') || 
    hasPermission(session, 'tab_ops_agenda_project');
  const canPesanan = userIsAdmin || hasPermission(session, 'menu_ops_pesanan_saya') ||
    hasPermission(session, 'tab_ops_pesanan_dashboard') ||
    hasPermission(session, 'tab_ops_pesanan_manual_shipment') ||
    hasPermission(session, 'tab_ops_pesanan_transfer_order') ||
    hasPermission(session, 'tab_ops_pesanan_shopee') ||
    hasPermission(session, 'tab_ops_pesanan_tiktok') ||
    hasPermission(session, 'tab_ops_pesanan_website') ||
    hasPermission(session, 'tab_ops_pesanan_woocommerce') ||
    hasPermission(session, 'tab_ops_pesanan_lazada');
  const canResolusi = userIsAdmin || hasPermission(session, 'menu_ops_resolusi') ||
    hasPermission(session, 'tab_ops_resolusi_retur') ||
    hasPermission(session, 'tab_ops_resolusi_refund') ||
    hasPermission(session, 'tab_ops_resolusi_gagal') ||
    hasPermission(session, 'tab_ops_resolusi_komplain') ||
    hasPermission(session, 'tab_ops_resolusi_rating');
  const canProduksi = userIsAdmin || hasPermission(session, 'menu_ops_produksi') ||
    hasPermission(session, 'tab_ops_loading_produksi');
  const canLoadingDock = userIsAdmin || hasPermission(session, 'menu_ops_loading_dock') ||
    hasPermission(session, 'tab_ops_loading_penerimaan') ||
    hasPermission(session, 'tab_ops_loading_pengiriman') ||
    hasPermission(session, 'tab_ops_loading_transfer_order') ||
    hasPermission(session, 'tab_ops_pesanan_transfer_order');
  const canMutasi = userIsAdmin || hasPermission(session, 'menu_ops_mutasi') ||
    hasPermission(session, 'tab_ops_mutasi_scanner') ||
    hasPermission(session, 'tab_ops_mutasi_log') ||
    hasPermission(session, 'tab_ops_mutasi_so');
  const canQC = userIsAdmin || hasPermission(session, 'menu_ops_qc') ||
    hasPermission(session, 'tab_ops_qc_reject') ||
    hasPermission(session, 'tab_ops_qc_cuci') ||
    hasPermission(session, 'tab_ops_qc_permak') ||
    hasPermission(session, 'tab_ops_qc_defect');
  const canInventory = userIsAdmin || hasPermission(session, 'menu_ops_inventory');
  const canKatalogProduk = userIsAdmin || hasPermission(session, 'menu_ops_katalog_produk');
  const canPicking = userIsAdmin || hasPermission(session, 'menu_ops_picking');
  const canPeminjaman = userIsAdmin || hasPermission(session, 'menu_ops_peminjaman');
  const canCetakLabel = userIsAdmin || hasPermission(session, 'action_cetak_label');
  const canCetakBarcode = userIsAdmin || hasPermission(session, 'menu_ops_cetak_barcode') || hasPermission(session, 'action_cetak_barcode') || canCetakLabel || canInventory;
  const canJneRekap = canAccessJneRekap(session);
  // HR
  const canViewKaryawan = userIsAdmin || hasPermission(session, 'menu_hr_karyawan');
  const canViewPresensi = userIsAdmin || hasPermission(session, 'menu_hr_presensi');
  const canViewRoster = userIsAdmin || hasPermission(session, 'menu_hr_roster');
  const canViewLemburCuti = userIsAdmin || hasPermission(session, 'menu_hr_lembur_cuti');
  const canApproveHr = userIsAdmin || hasPermission(session, 'menu_hr_approval');

  const navItems = [
    {
      id: 'dashboard' as ActivePage,
      label: 'Dashboard',
      shortLabel: 'Dashboard',
      icon: BarChart3,
      description: 'Ringkasan & Aktivitas',
      access: canViewDashboard,
    },
    {
      id: 'agenda' as ActivePage,
      label: 'Agenda dan Project',
      shortLabel: 'Agenda',
      icon: Calendar,
      description: 'Kalender Kerja & Project',
      access: canAgenda,
    },
    {
      id: 'pesanan_saya' as ActivePage,
      label: 'Pesanan Saya',
      shortLabel: 'Pesanan',
      icon: Package,
      description: 'Manajemen semua pesanan',
      access: canPesanan,
    },
    {
      id: 'pusat_resolusi' as ActivePage,
      label: 'Pusat Resolusi',
      shortLabel: 'Resolusi',
      icon: ShieldAlert,
      description: 'Layanan CS, Retur & Kendala',
      access: canResolusi,
    },
    {
      id: 'rekap_tagihan_jne' as ActivePage,
      label: 'Rekap Tagihan JNE',
      shortLabel: 'Tagihan JNE',
      icon: Receipt,
      description: 'Audit & Rekap Resi JNE',
      access: canJneRekap,
    },
    {
      id: 'produksi' as ActivePage,
      label: 'Produksi',
      shortLabel: 'Produksi',
      icon: Factory,
      description: 'Penerimaan Hasil Produksi CMT',
      access: canProduksi,
    },
    {
      id: 'loading_dock' as ActivePage,
      label: 'Loading Dock',
      shortLabel: 'Loading Dock',
      icon: Truck,
      description: 'Penerimaan & Pengiriman Terpadu',
      access: canLoadingDock,
    },
    {
      id: 'operasi_stok' as ActivePage,
      label: 'Scanner | LOG',
      shortLabel: 'Scanner | LOG',
      icon: ScanBarcode,
      description: 'Scan Rak, Mutasi Log & SO',
      access: canMutasi,
    },
    {
      id: 'katalog_produk' as ActivePage,
      label: 'Katalog Produk',
      shortLabel: 'Katalog',
      icon: BookOpen,
      description: 'Katalog Produk Manual',
      access: canKatalogProduk,
    },
    {
      id: 'perbaikan' as ActivePage,
      label: 'Laporan QC',
      shortLabel: 'QC',
      icon: ClipboardCheck,
      description: 'Laporan QC, Perbaikan & Defect',
      access: canQC,
    },
    {
      id: 'inventory' as ActivePage,
      label: 'Inventory',
      shortLabel: 'Inventory',
      icon: Layers,
      description: 'Stok fisik rak & per SKU',
      access: canInventory,
    },
    {
      id: 'picking_tasks' as ActivePage,
      label: 'Tugas Picking',
      shortLabel: 'Picking',
      icon: Package,
      description: 'Surat Jalan & Ambil Barang',
      access: canPicking,
    },
    {
      id: 'peminjaman' as ActivePage,
      label: 'Peminjaman (SPS)',
      shortLabel: 'Pinjam',
      icon: FileText,
      description: 'Log pinjam live TikTok/Shopee',
      access: canPeminjaman,
    },
    {
      id: 'cetak_label' as ActivePage,
      label: 'Cetak Label',
      shortLabel: 'Cetak Label',
      icon: Printer,
      description: 'Label Paket & Label Custom (QR Code Rak)',
      access: canCetakLabel,
    },
    {
      id: 'cetak_barcode' as ActivePage,
      label: 'Cetak Barcode Produk',
      shortLabel: 'Barcode 50x20',
      icon: QrCode,
      description: 'Stiker Thermal 50×20 mm & Import Massal',
      access: canCetakBarcode,
    },
  ].filter((item) => item.access);

  const hrNavItems = [
    {
      id: 'karyawan' as ActivePage,
      label: 'Data Karyawan',
      shortLabel: 'Karyawan',
      icon: Users,
      description: 'Daftar profil & direktori staf',
      access: canViewKaryawan,
    },
    {
      id: 'presensi' as ActivePage,
      label: 'Presensi & Shift Saya',
      shortLabel: 'Presensi',
      icon: Clock,
      description: 'Absen masuk/pulang & shift',
      access: canViewPresensi,
    },
    {
      id: 'roster_shift' as ActivePage,
      label: 'Jadwal Roster Tim',
      shortLabel: 'Roster',
      icon: Calendar,
      description: 'Jadwal shift seluruh tim',
      access: canViewRoster,
    },
    {
      id: 'lembur_cuti' as ActivePage,
      label: 'Lembur, Cuti & Approval',
      shortLabel: 'Lembur & Cuti',
      icon: Zap,
      description: 'Pengajuan & persetujuan lembur/cuti',
      access: canViewLemburCuti || canApproveHr,
      badge: canApproveHr ? 'ADMIN' : undefined,
    },
    {
      id: 'hr_rekap' as ActivePage,
      label: 'Rekap & Laporan',
      shortLabel: 'Rekap',
      icon: BarChart3,
      description: 'Rekap lembur, cuti & absensi',
      access: canApproveHr,
      badge: 'REKAP',
    },
  ].filter((item) => item.access);

  const handleNavClick = (page: ActivePage) => {
    onSelectPage(page);
    onCloseMobile();
  };

  // Common navigation item renderer
  const renderNavList = (collapsed: boolean) => (
    <div className="space-y-4 px-2">
      {/* SECTION 1: INVENTORY OPERASIONAL */}
      {navItems.length > 0 && (
        <div className="space-y-1.5">
          <div
            className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
              collapsed ? 'hidden' : 'block'
            }`}
          >
            Operasional Warehouse
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const isPicking = item.id === 'picking_tasks';
            const isPesanan = item.id === 'pesanan_saya';
            const showPickingBadge = isPicking && hasNewPickingAlert;
            const showPesananBadge = isPesanan && hasNewPesananAlert;
            const showAlertBadge = showPickingBadge || showPesananBadge;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={collapsed ? `${item.label} - ${item.description}` : undefined}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25 font-extrabold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white font-bold'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <div
                  className={`p-1.5 rounded-lg transition-colors shrink-0 relative ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:text-primary-500 group-hover:bg-primary-500/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {showAlertBadge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-500 rounded-full animate-ping" />
                  )}
                </div>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-xs truncate leading-snug">{item.label}</div>
                      {showAlertBadge && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black bg-primary-500 text-white rounded-full animate-pulse shrink-0">
                          BARU
                        </span>
                      )}
                      {(item as any).badgeText && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-400/30 rounded-full shrink-0">
                          {(item as any).badgeText}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] font-normal truncate ${
                        isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                )}

                {isActive && !collapsed && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white shrink-0 shadow-xs" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* SECTION 2: KARYAWAN & PRESENSI */}
      {hrNavItems.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div
            className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
              collapsed ? 'hidden' : 'block'
            }`}
          >
            Karyawan & Presensi
          </div>

          {hrNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={collapsed ? `${item.label} - ${item.description}` : undefined}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25 font-extrabold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white font-bold'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <div
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:text-primary-500 group-hover:bg-primary-500/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs truncate leading-snug">{item.label}</span>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] font-normal truncate ${
                        isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                )}

                {isActive && !collapsed && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white shrink-0 shadow-xs" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Common quick tools section
  const renderQuickTools = (collapsed: boolean) => {
    return (
    <div className="space-y-1 px-2 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
      <div
        className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
          collapsed ? 'hidden' : 'block'
        }`}
      >
        Alat & Utilitas
      </div>


      {/* Unduh Dokumen PDF Matriks Hak Akses (Admin Only) */}
      {userIsAdmin && (
        <a
          href="/DOKUMEN_HIERARKI_HAK_AKSES_WMS.pdf"
          download="DOKUMEN_HIERARKI_HAK_AKSES_WMS.pdf"
          target="_blank"
          rel="noopener noreferrer"
          title="Unduh Dokumen PDF Matriks 4 Hierarki Hak Akses WMS"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          {!collapsed && <span className="truncate">Unduh PDF Hak Akses</span>}
        </a>
      )}

      {/* Settings Modal - Khusus Admin / Superadmin */}
      {userIsAdmin && (
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          title="Pengaturan Sistem, Database & User Role (Admin Only)"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
            <Settings className="w-4 h-4 text-slate-500" />
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="truncate">Pengaturan Sistem</span>
              <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 rounded font-black">
                ADMIN
              </span>
            </div>
          )}
        </button>
      )}

      {/* Update Database (Superadmin only) */}
      {userIsAdmin && onOpenUpdateDatabase && (
        <button
          type="button"
          onClick={() => {
            onOpenUpdateDatabase();
            onCloseMobile();
          }}
          title="Update Database Master Produk (Import 2 CSV ke Supabase)"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/50 transition-colors cursor-pointer ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 shrink-0">
            <Database className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="truncate font-extrabold">Update Database</span>
              <span className="text-[9px] px-1.5 py-0.2 bg-primary-200 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded font-black">
                SUPERADMIN
              </span>
            </div>
          )}
        </button>
      )}

      {/* Migrasi Akun Supabase (Superadmin only - Bypass Egress Limit) */}
      {userIsAdmin && (
        <button
          type="button"
          onClick={() => {
            handleNavClick('supabase_migration');
            onCloseMobile();
          }}
          title="Migrasi & Kloning Data ke Akun Supabase Baru (Bypass Egress 5GB Limit)"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activePage === 'supabase_migration'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
              : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
          } ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              activePage === 'supabase_migration'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400'
            }`}
          >
            <Database className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="truncate font-extrabold">Migrasi Supabase</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                  activePage === 'supabase_migration'
                    ? 'bg-black/20 text-white'
                    : 'bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200'
                }`}
              >
                MIGRASI
              </span>
            </div>
          )}
        </button>
      )}


      {/* Notifikasi Admin (HP / Laptop Admin) */}
      {userIsAdmin && (
        <button
          type="button"
          onClick={() => {
            onRequestNotification();
            onCloseMobile();
          }}
          title={
            notificationPermission === 'granted'
              ? 'Notifikasi Admin (HP/Laptop) Aktif — Klik untuk tes bunyi & pop-up notifikasi'
              : 'Aktifkan Notifikasi di HP/Laptop Admin untuk Pesanan Baru dari Store'
          }
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <div
            className={`p-1.5 rounded-lg shrink-0 relative ${
              notificationPermission === 'granted'
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
            }`}
          >
            {notificationPermission === 'granted' ? (
              <BellRing className="w-4 h-4" />
            ) : (
              <Bell className="w-4 h-4 animate-bounce" />
            )}
            {notificationPermission !== 'granted' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                Notifikasi Admin
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-black border ${
                  notificationPermission === 'granted'
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 animate-pulse'
                }`}
              >
              {notificationPermission === 'granted' ? 'AKTIF · TES' : 'AKTIFKAN'}
            </span>
          </div>
        )}
      </button>
      )}

      {/* Tema & Tampilan (Untuk Semua Pengguna) */}
      <button
        type="button"
        onClick={() => {
          onOpenThemePicker();
          onCloseMobile();
        }}
        title="Kustomisasi Tema, Warna Aksen, Font & Mode Gelap"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 shrink-0">
          <Palette className="w-4 h-4 text-primary-500" />
        </div>
        {!collapsed && (
          <div className="flex-1 text-left truncate flex items-center justify-between">
            <span className="font-extrabold text-slate-800 dark:text-slate-200">Tema & Tampilan</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-primary-100 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
              TEMA
            </span>
          </div>
        )}
      </button>

      {/* Pembaruan Sistem (OTA Update ala Android) */}
      {onOpenUpdateModal && (
        <button
          type="button"
          onClick={() => {
            onOpenUpdateModal();
            onCloseMobile();
          }}
          title={`Pembaruan Sistem WMS (Versi ${CURRENT_APP_VERSION})${hasUpdatePending ? ` — Tersedia Versi ${latestVersion}` : ''}`}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            hasUpdatePending
              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          } ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0 relative">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {hasUpdatePending && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
            )}
            {isUpdateDownloading && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                Pembaruan Sistem
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-black border font-mono ${
                  hasUpdatePending
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 animate-pulse'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {hasUpdatePending ? 'UPDATE' : CURRENT_APP_VERSION}
              </span>
            </div>
          )}
        </button>
      )}
    </div>
    );
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE SLIDE-OVER DRAWER (HANDPHONE & TABLET) */}
      {/* ========================================================================= */}
      <div
        className={`fixed inset-0 z-50 lg:hidden print:hidden transition-all duration-300 ${
          isMobileOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div
          onClick={onCloseMobile}
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${
            isMobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Drawer panel */}
        <aside
          className={`absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-[#131d31] border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-out z-10 ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Top Brand Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AppLogo />
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  WMS
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-0.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isRealtimeConnected
                        ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span>{isRealtimeConnected ? 'Live Database' : 'Menghubungkan...'}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Navigation & Tools Content */}
          <div className="flex-1 overflow-y-auto py-3 space-y-4">
            {renderNavList(false)}
            {renderQuickTools(false)}
          </div>

          {/* Bottom User Card & Logout */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            {session ? (
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 shrink-0 font-extrabold text-xs">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {session.name || getUserPersonName(session.username) || session.username}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      @{session.username} • <span className="text-primary-500 font-bold uppercase">{session.role}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onCloseMobile();
                  }}
                  title="Logout"
                  className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-slate-400 py-1">Belum login</div>
            )}

            {/* Version & Update Indicator Mobile */}
            <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => {
                  onOpenUpdateModal?.();
                  onCloseMobile();
                }}
                className="flex items-center gap-1.5 hover:text-primary-500 font-mono font-bold transition-colors cursor-pointer"
                title="Buka Pusat Pembaruan Sistem"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${hasUpdatePending ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
                <span>WMS {CURRENT_APP_VERSION}</span>
              </button>
              {onOpenUpdateModal && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenUpdateModal();
                    onCloseMobile();
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold text-[9px] transition-colors cursor-pointer ${
                    hasUpdatePending
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                      : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40'
                  }`}
                >
                  {hasUpdatePending ? 'Update Baru' : 'Cek Update'}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* 2. DESKTOP PERMANENT / COLLAPSIBLE SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`hidden lg:flex print:hidden flex-col justify-between bg-white dark:bg-[#131d31] border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen transition-all duration-300 z-30 shrink-0 select-none shadow-xs ${
          isCollapsed ? 'w-[70px]' : 'w-64'
        }`}
      >
        {/* Top Brand Header */}
        <div
          className={`p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AppLogo size={32} />
            {!isCollapsed && (
              <div className="min-w-0">
                <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  WMS
                </h2>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRealtimeConnected ? 'bg-primary-500 shadow-[0_0_6px_var(--theme-500)]' : 'bg-amber-500'
                    }`}
                  />
                  <span>{isRealtimeConnected ? 'Live Database' : 'Syncing...'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Collapse Toggle Button */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Perkecil Sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable Navigation & Tools */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 no-scrollbar">
          {renderNavList(isCollapsed)}
          {renderQuickTools(isCollapsed)}
        </div>

        {/* Bottom User Card & Expand Button (When Collapsed) */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Buka / Perlebar Sidebar"
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-primary-500" />
              </button>

              <button
                type="button"
                onClick={onLogout}
                title={`Logout (${session?.username || 'User'})`}
                className="w-10 h-10 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-950/40 text-slate-400 hover:text-primary-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Collapsed Version / Update Icon */}
              {onOpenUpdateModal && (
                <button
                  type="button"
                  onClick={onOpenUpdateModal}
                  title={`Pembaruan Sistem WMS (${CURRENT_APP_VERSION})${hasUpdatePending ? ` — Ada Update ${latestVersion}` : ''}`}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer relative ${
                    hasUpdatePending
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-sm'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  {hasUpdatePending && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                  )}
                </button>
              )}
            </div>
          ) : (
            session && (
              <div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 shrink-0 font-extrabold text-xs">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {session.name || getUserPersonName(session.username) || session.username}
                      </div>
                      <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        @{session.username} • <span className="text-primary-500 font-bold uppercase">{session.role}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onLogout}
                    title="Logout"
                    className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {/* Version & Update Indicator Desktop Expanded */}
                <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between text-[10px] text-slate-400">
                  <button
                    type="button"
                    onClick={onOpenUpdateModal}
                    className="flex items-center gap-1.5 hover:text-primary-500 font-mono font-bold transition-colors cursor-pointer"
                    title="Buka Pusat Pembaruan Sistem"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${hasUpdatePending ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
                    <span>WMS {CURRENT_APP_VERSION}</span>
                  </button>
                  {onOpenUpdateModal && (
                    <button
                      type="button"
                      onClick={onOpenUpdateModal}
                      className={`px-2 py-0.5 rounded-md font-bold text-[9px] transition-colors cursor-pointer ${
                        hasUpdatePending
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                          : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40'
                      }`}
                    >
                      {hasUpdatePending ? 'Update Baru' : 'Cek Update'}
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </aside>
    </>
  );
};
