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
} from 'lucide-react';
import { UserSession, ActivePage } from '../types';
import { hasPermission, isSuperadmin, canAccessSettings, ROLE_DETAILS } from '../services/permissions';
import { getUserPersonName } from '../utils/userResolver';

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
  onLogout: () => void;
  totalScannedCount: number;
  hasNewPickingAlert?: boolean;
  onLogoClick?: () => void;
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
  onLogout,
  totalScannedCount,
  hasNewPickingAlert = false,
  onLogoClick,
}) => {
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
  const canLoadingDock = userIsAdmin || hasPermission(session, 'menu_ops_loading_dock') ||
    hasPermission(session, 'tab_ops_loading_produksi') ||
    hasPermission(session, 'tab_ops_loading_penerimaan') ||
    hasPermission(session, 'tab_ops_loading_pengiriman');
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
  const canPicking = userIsAdmin || hasPermission(session, 'menu_ops_picking');
  const canPeminjaman = userIsAdmin || hasPermission(session, 'menu_ops_peminjaman');
  const canCetakLabel = userIsAdmin || hasPermission(session, 'action_cetak_label');
  const canCetakBarcode = userIsAdmin || hasPermission(session, 'menu_ops_cetak_barcode') || hasPermission(session, 'action_cetak_barcode') || canCetakLabel || canInventory;

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
      id: 'loading_dock' as ActivePage,
      label: 'Loading Dock',
      shortLabel: 'Loading Dock',
      icon: Truck,
      description: 'Penerimaan & Pengiriman Terpadu',
      access: canLoadingDock,
    },
    {
      id: 'operasi_stok' as ActivePage,
      label: 'Scanner | Mutasi | SO',
      shortLabel: 'Scan | Mutasi',
      icon: ScanBarcode,
      description: 'Scan Rak, Mutasi Log & SO',
      access: canMutasi,
    },
    {
      id: 'perbaikan' as ActivePage,
      label: 'Quality Control',
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
      label: 'Cetak Label A6',
      shortLabel: 'Label A6',
      icon: Printer,
      description: 'Cetak resi pengiriman manual',
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
      label: 'Lembur & Cuti',
      shortLabel: 'Lembur',
      icon: Zap,
      description: 'Form lembur, ijin & cuti',
      access: canViewLemburCuti,
    },
    {
      id: 'hr_approval' as ActivePage,
      label: 'Approval HR',
      shortLabel: 'Approval',
      icon: ShieldCheck,
      description: 'Validasi lembur & cuti tim',
      access: canApproveHr,
      badge: 'ADMIN',
    },
    {
      id: 'hr_rekap' as ActivePage,
      label: 'Rekap & Laporan HR',
      shortLabel: 'Rekap HR',
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
            const showPickingBadge = isPicking && hasNewPickingAlert;
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
                  {showPickingBadge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-500 rounded-full animate-ping" />
                  )}
                </div>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-xs truncate leading-snug">{item.label}</div>
                      {showPickingBadge && (
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
    if (!userIsAdmin) return null;
    
    return (
    <div className="space-y-1 px-2 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
      <div
        className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
          collapsed ? 'hidden' : 'block'
        }`}
      >
        Alat & Utilitas
      </div>

      {/* PWA App Install Modal (Android & iPhone) */}
      <button
        type="button"
        onClick={() => {
          onOpenApkModal();
          onCloseMobile();
        }}
        title="Pasang Aplikasi ke Android & iPhone (PWA Instan)"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
          <Smartphone className="w-4 h-4 text-primary-500" />
        </div>
        {!collapsed && <span className="truncate">Install Aplikasi HP (PWA)</span>}
      </button>

      {/* Push Notification Toggle */}
      <button
        type="button"
        onClick={onRequestNotification}
        title={
          notificationPermission === 'granted'
            ? 'Notifikasi Suara & Push Aktif'
            : 'Aktifkan Notifikasi'
        }
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
          {notificationPermission === 'granted' ? (
            <BellRing className="w-4 h-4 text-primary-500" />
          ) : (
            <Bell className="w-4 h-4 text-slate-400" />
          )}
        </div>
        {!collapsed && (
          <div className="flex-1 text-left truncate flex items-center justify-between">
            <span>Notifikasi</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {notificationPermission === 'granted' ? 'ON' : 'OFF'}
            </span>
          </div>
        )}
      </button>

      {/* Settings Modal - Hanya untuk Superadmin atau user dengan izin Konfigurasi Sistem / Manajemen User */}
      {userCanAccessSettings && (
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          title={
            userIsAdmin
              ? 'Pengaturan Sistem, Database & User Role'
              : 'Pengaturan Sistem & Hak Akses'
          }
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
              {userIsAdmin && (
                <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 rounded font-black">
                  ADMIN
                </span>
              )}
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

      

      {/* Roadmap & Fitur (Semua User dapat Request Fitur & Pantau Dev) */}
      <button
        type="button"
        onClick={() => {
          handleNavClick('roadmap');
          onCloseMobile();
        }}
        title="Roadmap Pengembangan & Request Fitur"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          activePage === 'roadmap'
            ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            activePage === 'roadmap'
              ? 'bg-white/20 text-white'
              : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400'
          }`}
        >
          <Map className="w-4 h-4" />
        </div>
        {!collapsed && (
          <div className="flex-1 text-left truncate flex items-center justify-between">
            <span className="truncate font-extrabold">Roadmap & Fitur</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                activePage === 'roadmap'
                  ? 'bg-black/20 text-white'
                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
              }`}
            >
              NEW
            </span>
          </div>
        )}
      </button>

      {/* Dark Mode Switcher */}
      <button
        type="button"
        onClick={onOpenThemePicker}
        title="Pilih Tema"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
          <Palette className="w-4 h-4 text-slate-500" />
        </div>
        {!collapsed && (
          <div className="flex-1 text-left truncate flex items-center justify-between">
            <span>Pilih Tema</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
              'TEMA'
            </span>
          </div>
        )}
      </button>
    </div>
    );
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE SLIDE-OVER DRAWER (HANDPHONE & TABLET) */}
      {/* ========================================================================= */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
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
              <AppLogo onClick={userIsAdmin ? onLogoClick : undefined} />
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
          </div>
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* 2. DESKTOP PERMANENT / COLLAPSIBLE SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`hidden lg:flex flex-col justify-between bg-white dark:bg-[#131d31] border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen transition-all duration-300 z-30 shrink-0 select-none shadow-xs ${
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
            <AppLogo size={32} onClick={userIsAdmin ? onLogoClick : undefined} />
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
            </div>
          ) : (
            session && (
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
            )
          )}
        </div>
      </aside>
    </>
  );
};
