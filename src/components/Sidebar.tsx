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
  LayoutGrid,
  Smartphone,
  Monitor,
  Bell,
  BellOff,
  BellRing,
  User,
  Clock,
  Calendar,
  Zap,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Star,
  SlidersHorizontal,
  Check,
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
  MessageSquare,
  PanelRightOpen,
  Sparkles,
  Bot,
} from 'lucide-react';
import { UserSession, ActivePage } from '../types';
import { hasPermission, isSuperadmin, canAccessSettings, canAccessJneRekap, canAccessLiveChat, canAccessWmsAi, canAccessAgendaTasks, ROLE_DETAILS } from '../services/permissions';
import { getUserPersonName } from '../utils/userResolver';
import { CURRENT_APP_VERSION, CURRENT_APP_VERSION_INFO, isNewerVersion } from '../config/appVersion';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { liveChatManager } from '../services/liveChatService';
import { UserProfileModal, UserAvatar, syncAvatarFromDb } from './UserProfileModal';

interface SidebarProps {
  session: UserSession | null;
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  companionPage?: ActivePage | null;
  onOpenCompanion?: (page: ActivePage | null) => void;
  isMobileOpen: boolean;
  onOpenMobile?: () => void;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenThemePicker: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  deviceNotificationEnabled?: boolean;
  onToggleDeviceNotification?: (enabled?: boolean) => void;
  isRealtimeConnected: boolean;
  onOpenSettings: () => void;
  onOpenApkModal: () => void;
  onOpenUpdateDatabase?: () => void;
  onOpenUpdateModal?: () => void;
  onOpenAiModal?: () => void;
  onLogout: () => void;
  totalScannedCount: number;
  hasNewPickingAlert?: boolean;
  hasNewPesananAlert?: boolean;
  onSessionUpdate?: (patch: Partial<UserSession>) => void;
}

import { AppLogo } from './Logo';

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  activePage,
  onSelectPage,
  companionPage = null,
  onOpenCompanion,
  isMobileOpen,
  onOpenMobile,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  onOpenThemePicker,
  notificationPermission,
  onRequestNotification,
  deviceNotificationEnabled = true,
  onToggleDeviceNotification,
  isRealtimeConnected,
  onOpenSettings,
  onOpenApkModal,
  onOpenUpdateDatabase,
  onOpenUpdateModal,
  onOpenAiModal,
  onLogout,
  totalScannedCount,
  hasNewPickingAlert = false,
  hasNewPesananAlert = false,
  onSessionUpdate,
}) => {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isDesktopHovered, setIsDesktopHovered] = React.useState(false);
  const effectiveCollapsed = isCollapsed && !isDesktopHovered;

  // Mobile Native App Launcher & Bottom Tab Bar States (< 1024px)
  const [mobileMenuSearch, setMobileMenuSearch] = React.useState('');
  const [isEditingBottomTabs, setIsEditingBottomTabs] = React.useState(false);
  const touchStartRef = React.useRef<{ x: number; y: number; atTop: boolean } | null>(null);
  const sheetScrollRef = React.useRef<HTMLDivElement | null>(null);

  const pinStorageKey = `wms_mobile_pinned_nav_${(session?.username || 'guest').toLowerCase()}`;
  const [pinnedPages, setPinnedPages] = React.useState<ActivePage[]>(() => {
    try {
      const raw = localStorage.getItem(pinStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(pinStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setPinnedPages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPinnedPages([]);
    }
  }, [pinStorageKey]);

  React.useEffect(() => {
    if (!isMobileOpen) {
      if (mobileMenuSearch) setMobileMenuSearch('');
      if (isEditingBottomTabs) setIsEditingBottomTabs(false);
    }
  }, [isMobileOpen, mobileMenuSearch, isEditingBottomTabs]);

  React.useEffect(() => {
    const handleOpenProfile = () => setIsProfileOpen(true);
    window.addEventListener('wms_open_user_profile', handleOpenProfile);
    return () => window.removeEventListener('wms_open_user_profile', handleOpenProfile);
  }, []);

  const togglePinPage = (pageId: ActivePage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPinnedPages((prev) => {
      const exists = prev.includes(pageId);
      const next = exists
        ? prev.filter((p) => p !== pageId)
        : [...prev, pageId].slice(-4);
      try {
        localStorage.setItem(pinStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    if (session?.username) syncAvatarFromDb(session.username);
  }, [session?.username]);
  const { status: updateStatus, latestVersion, currentVersion, releaseInfo } = useAppUpdate();
  const hasUpdatePending =
    updateStatus === 'available' ||
    updateStatus === 'ready' ||
    isNewerVersion(
      latestVersion,
      currentVersion,
      releaseInfo?.buildHash,
      CURRENT_APP_VERSION_INFO.buildHash
    );
  const isUpdateDownloading = updateStatus === 'downloading';

  const [chatUnreadCount, setChatUnreadCount] = React.useState<number>(() => liveChatManager.getTotalUnreadCount());
  const [chatOnlineCount, setChatOnlineCount] = React.useState<number>(() =>
    liveChatManager.getOnlineUsers().filter(u => u.username.toLowerCase() !== (session?.username || '').toLowerCase()).length
  );

  React.useEffect(() => {
    const unsub = liveChatManager.subscribe(() => {
      setChatUnreadCount(liveChatManager.getTotalUnreadCount());
      setChatOnlineCount(
        liveChatManager.getOnlineUsers().filter(
          u => u.username.toLowerCase() !== (session?.username || '').toLowerCase()
        ).length
      );
    });
    return unsub;
  }, [session?.username]);

  const userIsAdmin = isSuperadmin(session);
  const userCanAccessSettings = canAccessSettings(session);
  const userCanAccessAi = canAccessWmsAi(session);

  // Operasional
  const canViewDashboard = userIsAdmin || hasPermission(session, 'menu_ops_dashboard');
  const canLiveChat = canAccessLiveChat(session);
  const canAgenda = userIsAdmin || hasPermission(session, 'menu_ops_agenda') || 
    hasPermission(session, 'tab_ops_agenda_kalendar') || 
    hasPermission(session, 'tab_ops_agenda_task') ||
    hasPermission(session, 'tab_ops_agenda_project') ||
    canAccessAgendaTasks(session);
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
  const canTrello = userIsAdmin || hasPermission(session, 'menu_ops_trello') || canProduksi || canViewDashboard;
  const canPicking = userIsAdmin || hasPermission(session, 'menu_ops_picking');
  const canLoadingDock = userIsAdmin || hasPermission(session, 'menu_ops_loading_dock') ||
    hasPermission(session, 'tab_ops_loading_penerimaan') ||
    hasPermission(session, 'tab_ops_loading_pengiriman') ||
    hasPermission(session, 'tab_ops_loading_transfer_order') ||
    hasPermission(session, 'tab_ops_pesanan_transfer_order') ||
    canPicking;
  const canMutasi = userIsAdmin || hasPermission(session, 'menu_ops_mutasi') ||
    hasPermission(session, 'tab_ops_mutasi_scanner') ||
    hasPermission(session, 'tab_ops_mutasi_log');
  const canQC = userIsAdmin || hasPermission(session, 'menu_ops_qc') ||
    hasPermission(session, 'tab_ops_qc_reject') ||
    hasPermission(session, 'tab_ops_qc_cuci') ||
    hasPermission(session, 'tab_ops_qc_permak') ||
    hasPermission(session, 'tab_ops_qc_defect');
  const canInventory = userIsAdmin || hasPermission(session, 'menu_ops_inventory');
  const canKatalogProduk = userIsAdmin || hasPermission(session, 'menu_ops_katalog_produk');
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
      id: 'live_chat' as ActivePage,
      label: chatUnreadCount > 0 || chatOnlineCount > 0 ? 'Live Chat Tim' : 'Live Chat & Diskusi',
      shortLabel: 'Live Chat',
      icon: MessageSquare,
      description: chatOnlineCount > 0 ? `${chatOnlineCount} rekan online · Grup & Japri` : 'Ruang Diskusi & Chat Tim',
      access: canLiveChat,
      badgeText: chatUnreadCount > 0 ? `${chatUnreadCount} BARU` : (chatOnlineCount > 0 ? `${chatOnlineCount} ONLINE` : undefined),
    },
    {
      id: 'agenda' as ActivePage,
      label: 'Agenda, Task & Project',
      shortLabel: 'Agenda',
      icon: Calendar,
      description: 'Kalender, Tugas & Project',
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
      id: 'trello_up' as ActivePage,
      label: 'Koleksi UP (Trello)',
      shortLabel: 'Trello UP',
      icon: LayoutGrid,
      description: 'Susunan artikel upload & cetak A4',
      access: canTrello,
    },
    {
      id: 'loading_dock' as ActivePage,
      label: 'Loading Dock',
      shortLabel: 'Loading Dock',
      icon: Truck,
      description: 'Penerimaan, Pengiriman, TO & Picking',
      access: canLoadingDock,
    },
    {
      id: 'inventory' as ActivePage,
      label: 'Inventory',
      shortLabel: 'Inventory',
      icon: Layers,
      description: 'Kapasitas, Stok, Scanner & Log',
      access: canInventory || canMutasi,
      badgeText: totalScannedCount > 0 ? `${totalScannedCount} SCAN` : undefined,
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
      id: 'peminjaman' as ActivePage,
      label: 'Peminjaman (SPS)',
      shortLabel: 'Pinjam',
      icon: FileText,
      description: 'Log pinjam live TikTok/Shopee',
      access: canPeminjaman,
    },
    {
      id: 'cetak_label' as ActivePage,
      label: 'Cetak Label & Barcode',
      shortLabel: 'Cetak',
      icon: Printer,
      description: 'QR Prefix, Label Paket & Barcode',
      access: canCetakLabel || canCetakBarcode,
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
            const isCompanion = companionPage === item.id;
            const isPicking = item.id === 'loading_dock';
            const isPesanan = item.id === 'pesanan_saya';
            const showPickingBadge = isPicking && hasNewPickingAlert;
            const showPesananBadge = isPesanan && hasNewPesananAlert;
            const showAlertBadge = showPickingBadge || showPesananBadge;
            return (
              <div key={item.id} className="relative group/navitem">
                <button
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? `${item.label} - ${item.description}` : undefined}
                  className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative ${
                    isActive
                      ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25 font-extrabold'
                      : isCompanion
                      ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white font-bold'
                  } ${collapsed ? 'justify-center px-2' : ''}`}
                >
                  <div
                    className={`p-1.5 rounded-lg transition-colors shrink-0 relative ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : isCompanion
                        ? 'bg-purple-200/70 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:text-primary-500 group-hover:bg-primary-500/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {showAlertBadge && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-500 rounded-full animate-ping" />
                    )}
                  </div>

                  {!collapsed && (
                    <div className="flex-1 min-w-0 pr-5">
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

                {/* Desktop-Only Quick Companion Split Trigger */}
                {!collapsed && !isActive && onOpenCompanion && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCompanion(isCompanion ? null : item.id);
                    }}
                    title={
                      isCompanion
                        ? `Tutup Panel Samping (${item.shortLabel})`
                        : `Buka ${item.shortLabel} berdampingan di Panel Samping (Khusus Laptop/PC)`
                    }
                    className={`hidden lg:flex items-center justify-center p-1.5 rounded-lg absolute right-2 top-1/2 -translate-y-1/2 transition-all cursor-pointer ${
                      isCompanion
                        ? 'opacity-100 bg-purple-600 text-white shadow-xs'
                        : 'opacity-0 group-hover/navitem:opacity-100 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-indigo-600 hover:text-white border border-slate-200 dark:border-slate-600 shadow-xs'
                    }`}
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
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

      {/* Pengaturan Sistem (Halaman Utama) - Khusus Akun @warehouse / Pemilik Sistem */}
      {userCanAccessSettings && (
        <button
          type="button"
          onClick={() => {
            handleNavClick('pengaturan_sistem');
            onCloseMobile();
          }}
          title="Pengaturan Sistem, Database & User Role (Khusus Pemilik @warehouse)"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activePage === 'pengaturan_sistem'
              ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          } ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              activePage === 'pengaturan_sistem'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Settings className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="flex-1 text-left truncate flex items-center justify-between">
              <span className="truncate">Pengaturan Sistem</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                  activePage === 'pengaturan_sistem'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300'
                }`}
              >
                ADMIN
              </span>
            </div>
          )}
        </button>
      )}


      {/* Notifikasi Perangkat (HP / Laptop) - Toggle ON/OFF & Tes untuk Semua Pengguna */}
      {(() => {
        const isNotifOn = Boolean(deviceNotificationEnabled) && notificationPermission === 'granted';
        const isPermissionBlocked = notificationPermission === 'denied';
        const handleToggle = () => {
          if (onToggleDeviceNotification) {
            onToggleDeviceNotification(!isNotifOn);
          } else {
            onRequestNotification();
          }
        };

        if (collapsed) {
          return (
            <button
              type="button"
              onClick={() => {
                handleToggle();
                onCloseMobile();
              }}
              title={
                isNotifOn
                  ? 'Notifikasi Perangkat: ON — Klik untuk mematikan (OFF)'
                  : isPermissionBlocked
                  ? 'Izin notifikasi diblokir browser — Klik untuk panduan aktifkan'
                  : 'Notifikasi Perangkat: OFF — Klik untuk mengaktifkan (ON)'
              }
              className="w-full flex items-center justify-center px-2 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div
                className={`p-1.5 rounded-lg shrink-0 relative ${
                  isNotifOn
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : !deviceNotificationEnabled
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isNotifOn ? (
                  <BellRing className="w-4 h-4" />
                ) : !deviceNotificationEnabled ? (
                  <BellOff className="w-4 h-4" />
                ) : (
                  <Bell className="w-4 h-4 animate-bounce" />
                )}
              </div>
            </button>
          );
        }

        return (
          <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors">
            <button
              type="button"
              onClick={() => {
                if (isNotifOn) {
                  onRequestNotification();
                } else {
                  handleToggle();
                }
                onCloseMobile();
              }}
              title={
                isNotifOn
                  ? 'Notifikasi Perangkat Aktif — Klik untuk tes bunyi & pop-up'
                  : 'Aktifkan Notifikasi Perangkat di HP/Laptop ini'
              }
              className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
            >
              <div
                className={`p-1.5 rounded-lg shrink-0 relative ${
                  isNotifOn
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : !deviceNotificationEnabled
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isNotifOn ? (
                  <BellRing className="w-4 h-4" />
                ) : !deviceNotificationEnabled ? (
                  <BellOff className="w-4 h-4" />
                ) : (
                  <Bell className="w-4 h-4 animate-bounce" />
                )}
                {deviceNotificationEnabled && notificationPermission !== 'granted' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                  Notifikasi Perangkat
                </div>
                <div className="text-[10px] text-slate-400 font-normal truncate">
                  {isNotifOn
                    ? 'Aktif · Ketuk untuk tes'
                    : isPermissionBlocked
                    ? 'Diblokir browser'
                    : !deviceNotificationEnabled
                    ? 'Nonaktif'
                    : 'Ketuk untuk aktifkan'}
                </div>
              </div>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={isNotifOn}
              aria-label={isNotifOn ? 'Matikan Notifikasi Perangkat' : 'Aktifkan Notifikasi Perangkat'}
              onClick={handleToggle}
              title={isNotifOn ? 'Matikan Notifikasi Perangkat' : 'Aktifkan Notifikasi Perangkat'}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                isNotifOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                  isNotifOn ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        );
      })()}

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
                {userIsAdmin ? 'Pembaruan Sistem' : 'Pembaruan Aplikasi'}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-black border font-mono ${
                  hasUpdatePending
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 animate-pulse'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {hasUpdatePending ? `BARU ${latestVersion}` : CURRENT_APP_VERSION}
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
      {/* 1. MOBILE NATIVE APP NAVIGATION: BOTTOM TAB BAR + APP LAUNCHER SHEET      */}
      {/* ========================================================================= */}
      {session && (() => {
        const isNotifOn = Boolean(deviceNotificationEnabled) && notificationPermission === 'granted';
        const isPermissionBlocked = notificationPermission === 'denied';
        const handleToggleNotif = () => {
          if (onToggleDeviceNotification) {
            onToggleDeviceNotification(!isNotifOn);
          } else {
            onRequestNotification();
          }
        };

        const allAccessible = [...navItems, ...hrNavItems];
        const totalAccessibleItems = allAccessible.length;
        const normalizedSearch = mobileMenuSearch.trim().toLowerCase();

        // Build up to 4 quick bottom tabs (User Pinned first, then smart role defaults)
        const PRIORITY_MOBILE_TABS: ActivePage[] = [
          'dashboard',
          'loading_dock',
          'pesanan_saya',
          'inventory',
          'produksi',
          'presensi',
          'live_chat',
          'pusat_resolusi',
          'agenda',
          'katalog_produk',
          'perbaikan',
          'peminjaman',
          'cetak_label',
          'karyawan',
          'roster_shift',
          'lembur_cuti',
        ];

        const bottomQuickTabs: typeof allAccessible = [];
        const addedTabIds = new Set<ActivePage>();

        for (const pid of pinnedPages) {
          if (bottomQuickTabs.length >= 4) break;
          const found = allAccessible.find((item) => item.id === pid);
          if (found && !addedTabIds.has(found.id)) {
            bottomQuickTabs.push(found);
            addedTabIds.add(found.id);
          }
        }
        for (const pid of PRIORITY_MOBILE_TABS) {
          if (bottomQuickTabs.length >= 4) break;
          const found = allAccessible.find((item) => item.id === pid);
          if (found && !addedTabIds.has(found.id)) {
            bottomQuickTabs.push(found);
            addedTabIds.add(found.id);
          }
        }
        for (const item of allAccessible) {
          if (bottomQuickTabs.length >= 4) break;
          if (!addedTabIds.has(item.id)) {
            bottomQuickTabs.push(item);
            addedTabIds.add(item.id);
          }
        }

        const bottomTabIds = new Set(bottomQuickTabs.map((t) => t.id));
        const isCurrentPageInLauncherOnly = !bottomTabIds.has(activePage);

        const filteredOps = normalizedSearch
          ? navItems.filter(
              (item) =>
                item.label.toLowerCase().includes(normalizedSearch) ||
                item.shortLabel.toLowerCase().includes(normalizedSearch)
            )
          : navItems;
        const filteredHr = normalizedSearch
          ? hrNavItems.filter(
              (item) =>
                item.label.toLowerCase().includes(normalizedSearch) ||
                item.shortLabel.toLowerCase().includes(normalizedSearch)
            )
          : hrNavItems;

        const getAppTileTone = (id: ActivePage, isHr: boolean, isActive: boolean) => {
          if (isActive) {
            return 'bg-primary-600 text-white shadow-md shadow-primary-500/25 ring-2 ring-primary-500/30';
          }
          if (isHr) {
            return 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50';
          }
          if (id === 'dashboard' || id === 'pesanan_saya' || id === 'loading_dock' || id === 'pusat_resolusi') {
            return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50';
          }
          if (id === 'inventory' || id === 'produksi' || id === 'trello_up' || id === 'katalog_produk') {
            return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50';
          }
          if (id === 'live_chat' || id === 'agenda') {
            return 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50';
          }
          return 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50';
        };

        const renderAppLauncherTile = (
          item: (typeof navItems)[number] | (typeof hrNavItems)[number],
          isHr = false
        ) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          const isInBottomBar = bottomTabIds.has(item.id);
          const isUserPinned = pinnedPages.includes(item.id);
          const showPickingBadge = item.id === 'loading_dock' && hasNewPickingAlert;
          const showPesananBadge = item.id === 'pesanan_saya' && hasNewPesananAlert;
          const showAlertDot = showPickingBadge || showPesananBadge;
          const tileCountBadge =
            item.id === 'live_chat' && chatUnreadCount > 0
              ? String(chatUnreadCount > 99 ? '99+' : chatUnreadCount)
              : item.id === 'inventory' && totalScannedCount > 0
              ? String(totalScannedCount)
              : undefined;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (isEditingBottomTabs) {
                  togglePinPage(item.id);
                } else {
                  setMobileMenuSearch('');
                  handleNavClick(item.id);
                }
              }}
              className={`group flex flex-col items-center justify-start gap-1.5 py-1.5 px-1 rounded-2xl transition-transform active:scale-95 cursor-pointer ${
                isEditingBottomTabs && isUserPinned
                  ? 'bg-primary-50/70 dark:bg-primary-950/30 ring-1 ring-primary-300/70 dark:ring-primary-700/60'
                  : ''
              }`}
            >
              <div
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${getAppTileTone(
                  item.id,
                  isHr,
                  isActive
                )}`}
              >
                <Icon className="w-[22px] h-[22px]" />

                {isEditingBottomTabs ? (
                  <span
                    className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-[#101726] shadow-xs ${
                      isUserPinned
                        ? 'bg-amber-500 text-white'
                        : isInBottomBar
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {isUserPinned ? <Check className="w-3 h-3 stroke-[3]" /> : <Star className="w-2.5 h-2.5" />}
                  </span>
                ) : (
                  <>
                    {tileCountBadge && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black tabular-nums flex items-center justify-center border-2 border-white dark:border-[#101726] shadow-xs">
                        {tileCountBadge}
                      </span>
                    )}
                    {!tileCountBadge && showAlertDot && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white dark:border-[#101726] animate-pulse" />
                    )}
                  </>
                )}
              </div>

              <span
                className={`text-[11px] leading-tight text-center line-clamp-2 max-w-full px-0.5 ${
                  isActive
                    ? 'font-extrabold text-primary-600 dark:text-primary-400'
                    : 'font-semibold text-slate-700 dark:text-slate-200'
                }`}
              >
                {item.shortLabel}
              </span>
            </button>
          );
        };

        return (
          <>
            {/* A. FIXED NATIVE MOBILE BOTTOM TAB BAR (< 1024px) */}
            <nav
              aria-label="Navigasi Utama Aplikasi"
              className="fixed bottom-0 left-0 right-0 z-40 lg:hidden print:hidden bg-white/95 dark:bg-[#0d1424]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.45)]"
            >
              <div
                className="grid items-center h-[60px] px-1"
                style={{ gridTemplateColumns: `repeat(${bottomQuickTabs.length + 1}, minmax(0, 1fr))` }}
              >
                {bottomQuickTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = !isMobileOpen && activePage === item.id;
                  const showAlertDot =
                    (item.id === 'loading_dock' && hasNewPickingAlert) ||
                    (item.id === 'pesanan_saya' && hasNewPesananAlert);
                  const tabBadgeCount =
                    item.id === 'live_chat' && chatUnreadCount > 0
                      ? chatUnreadCount > 99
                        ? '99+'
                        : String(chatUnreadCount)
                      : item.id === 'inventory' && totalScannedCount > 0
                      ? String(totalScannedCount)
                      : null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (isMobileOpen) onCloseMobile();
                        handleNavClick(item.id);
                      }}
                      className="min-h-[52px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer active:scale-95 transition-transform"
                    >
                      <div
                        className={`relative px-3.5 py-1 rounded-full flex items-center justify-center transition-colors ${
                          isActive
                            ? 'bg-primary-500/12 dark:bg-primary-400/15 text-primary-600 dark:text-primary-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="w-[20px] h-[20px]" />
                        {tabBadgeCount && (
                          <span className="absolute -top-0.5 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-[#0d1424]">
                            {tabBadgeCount}
                          </span>
                        )}
                        {!tabBadgeCount && showAlertDot && (
                          <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0d1424]" />
                        )}
                      </div>
                      <span
                        className={`text-[10.5px] leading-none whitespace-nowrap truncate max-w-full tracking-tight ${
                          isActive
                            ? 'font-extrabold text-primary-600 dark:text-primary-400'
                            : 'font-medium text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.shortLabel}
                      </span>
                    </button>
                  );
                })}

                {/* 5th Fixed Slot: Semua Menu (App Launcher Bottom Sheet Trigger) */}
                <button
                  type="button"
                  onClick={() => {
                    if (isMobileOpen) {
                      onCloseMobile();
                    } else {
                      onOpenMobile?.();
                    }
                  }}
                  aria-expanded={isMobileOpen}
                  aria-label="Buka Semua Menu Aplikasi"
                  className="min-h-[52px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer active:scale-95 transition-transform"
                >
                  <div
                    className={`relative px-3.5 py-1 rounded-full flex items-center justify-center transition-colors ${
                      isMobileOpen || isCurrentPageInLauncherOnly
                        ? 'bg-primary-500/12 dark:bg-primary-400/15 text-primary-600 dark:text-primary-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="w-[20px] h-[20px]" />
                    {(hasUpdatePending ||
                      (!bottomTabIds.has('loading_dock') && hasNewPickingAlert) ||
                      (!bottomTabIds.has('pesanan_saya') && hasNewPesananAlert) ||
                      (!bottomTabIds.has('live_chat') && chatUnreadCount > 0)) && (
                      <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#0d1424]" />
                    )}
                  </div>
                  <span
                    className={`text-[10.5px] leading-none whitespace-nowrap truncate max-w-full tracking-tight ${
                      isMobileOpen || isCurrentPageInLauncherOnly
                        ? 'font-extrabold text-primary-600 dark:text-primary-400'
                        : 'font-medium text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Menu
                  </span>
                </button>
              </div>
            </nav>

            {/* B. NATIVE APP LAUNCHER BOTTOM SHEET (Replaces Web Left-Sidebar Drawer) */}
            <div
              className={`fixed inset-0 z-50 lg:hidden print:hidden transition-all duration-300 ${
                isMobileOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
              }`}
            >
              {/* Scrim Backdrop */}
              <div
                onClick={onCloseMobile}
                className={`absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 ${
                  isMobileOpen ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Bottom Sheet Panel (Swipe Down to Close + Drag Handle + Rounded Top) */}
              <section
                aria-label="Semua Menu Aplikasi"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  const atTop = (sheetScrollRef.current?.scrollTop ?? 0) <= 4;
                  touchStartRef.current = { x: t.clientX, y: t.clientY, atTop };
                }}
                onTouchEnd={(e) => {
                  if (!touchStartRef.current) return;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - touchStartRef.current.x;
                  const dy = t.clientY - touchStartRef.current.y;
                  const wasAtTop = touchStartRef.current.atTop;
                  touchStartRef.current = null;
                  if (wasAtTop && dy > 65 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                    onCloseMobile();
                  }
                }}
                className={`absolute bottom-0 left-0 right-0 max-h-[88dvh] bg-white dark:bg-[#101726] rounded-t-[28px] border-t border-slate-200/80 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out overflow-hidden ${
                  isMobileOpen ? 'translate-y-0' : 'translate-y-full'
                }`}
              >
                {/* Grab Pill Handle */}
                <div className="pt-2.5 pb-1 flex justify-center shrink-0">
                  <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>

                {/* Sheet Top Account & Quick Control Strip */}
                <div className="px-4 pt-1 pb-3 border-b border-slate-200/70 dark:border-slate-800/80 space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobile();
                        setIsProfileOpen(true);
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer active:opacity-80"
                    >
                      <div className="relative shrink-0">
                        <UserAvatar username={session.username} name={session.name} className="w-10 h-10 rounded-full" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#101726] ${
                            isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          title={isRealtimeConnected ? 'Live Database Terhubung' : 'Menghubungkan...'}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {session.name || getUserPersonName(session.username) || session.username}
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          @{session.username} · <span className="font-bold text-primary-600 dark:text-primary-400 uppercase">{session.role}</span>
                          {session.store_code || session.store_name ? ` · ${session.store_code || session.store_name}` : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isNotifOn) {
                            onRequestNotification();
                          } else {
                            handleToggleNotif();
                          }
                        }}
                        aria-label={isNotifOn ? 'Tes Notifikasi' : 'Aktifkan Notifikasi'}
                        title={isNotifOn ? 'Notifikasi Aktif (Ketuk untuk tes)' : 'Aktifkan Notifikasi Perangkat'}
                        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isNotifOn
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                            : isPermissionBlocked
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isNotifOn ? <BellRing className="w-[18px] h-[18px]" /> : <BellOff className="w-[18px] h-[18px]" />}
                        {deviceNotificationEnabled && notificationPermission !== 'granted' && (
                          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenThemePicker();
                          onCloseMobile();
                        }}
                        aria-label="Tema & Mode Gelap"
                        title="Tema, Warna & Mode Gelap"
                        className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                      >
                        <Palette className="w-[18px] h-[18px] text-primary-500" />
                      </button>

                      <button
                        type="button"
                        onClick={onCloseMobile}
                        aria-label="Tutup Menu"
                        className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                      >
                        <X className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                  </div>

                  {/* Pill Search Bar */}
                  {totalAccessibleItems > 6 && (
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={mobileMenuSearch}
                        onChange={(e) => setMobileMenuSearch(e.target.value)}
                        placeholder="Cari modul atau fitur..."
                        className="w-full h-10 pl-10 pr-9 rounded-full bg-slate-100 dark:bg-slate-800/90 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                      />
                      {mobileMenuSearch && (
                        <button
                          type="button"
                          onClick={() => setMobileMenuSearch('')}
                          aria-label="Hapus pencarian"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Scrollable App Launcher Content */}
                <div ref={sheetScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5 no-scrollbar">
                  {/* Section Title + Customize Bottom Bar Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {isEditingBottomTabs
                        ? `Pilih Tab Bawah (${pinnedPages.length}/4)`
                        : filteredHr.length > 0
                        ? 'Menu Operasional'
                        : 'Semua Modul'}
                    </span>

                    {totalAccessibleItems > 4 && (
                      <button
                        type="button"
                        onClick={() => setIsEditingBottomTabs((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                          isEditingBottomTabs
                            ? 'bg-primary-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>{isEditingBottomTabs ? 'Selesai' : 'Atur Tab Bawah'}</span>
                      </button>
                    )}
                  </div>

                  {isEditingBottomTabs && (
                    <div className="px-3 py-2 rounded-2xl bg-primary-50/80 dark:bg-primary-950/40 border border-primary-200/70 dark:border-primary-800/60 text-[11px] font-medium text-primary-700 dark:text-primary-300">
                      Ketuk ikon modul untuk menyematkan maksimal 4 pintasan di bar bawah layar.
                    </div>
                  )}

                  {/* 4-Column App Launcher Grid: Operasional */}
                  {filteredOps.length > 0 && (
                    <div className="grid grid-cols-4 gap-x-2 gap-y-3.5">
                      {filteredOps.map((item) => renderAppLauncherTile(item, false))}
                    </div>
                  )}

                  {/* 4-Column App Launcher Grid: Karyawan & Presensi */}
                  {filteredHr.length > 0 && (
                    <div className="space-y-3 pt-1">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Karyawan &amp; Presensi
                      </div>
                      <div className="grid grid-cols-4 gap-x-2 gap-y-3.5">
                        {filteredHr.map((item) => renderAppLauncherTile(item, true))}
                      </div>
                    </div>
                  )}

                  {normalizedSearch && filteredOps.length === 0 && filteredHr.length === 0 && (
                    <div className="py-8 text-center space-y-2.5">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        Modul "{mobileMenuSearch}" tidak ditemukan
                      </p>
                      <button
                        type="button"
                        onClick={() => setMobileMenuSearch('')}
                        className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Reset Pencarian
                      </button>
                    </div>
                  )}

                  {/* Grouped Native Settings List */}
                  <div className="space-y-2.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Sistem &amp; Akun
                    </div>

                    <div className="rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 divide-y divide-slate-200/70 dark:divide-slate-700/50 overflow-hidden">
                      {onOpenUpdateModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenUpdateModal();
                            onCloseMobile();
                          }}
                          className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-slate-200/60 dark:active:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              Pembaruan Aplikasi
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[11px] font-mono font-bold ${
                                hasUpdatePending ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {hasUpdatePending ? `Baru ${latestVersion}` : CURRENT_APP_VERSION}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </button>
                      )}

                      {userCanAccessSettings && (
                        <button
                          type="button"
                          onClick={() => handleNavClick('pengaturan_sistem')}
                          className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-slate-200/60 dark:active:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                              <Settings className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              Pengaturan Sistem
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onOpenApkModal();
                          onCloseMobile();
                        }}
                        className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-slate-200/60 dark:active:bg-slate-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <Download className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            Pasang Aplikasi di Layar Utama
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        onCloseMobile();
                      }}
                      className="w-full min-h-[46px] px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/35 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Keluar Akun</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </>
        );
      })()}

      {/* ========================================================================= */}
      {/* 2. DESKTOP AUTO-HIDE / HOVER-UNHIDE & PINNABLE SIDEBAR */}
      {/* ========================================================================= */}
      <div
        className={`hidden lg:block print:hidden shrink-0 transition-all duration-300 ${
          isCollapsed ? 'w-[70px]' : 'w-64'
        }`}
      >
        <aside
          onMouseEnter={() => setIsDesktopHovered(true)}
          onMouseLeave={() => setIsDesktopHovered(false)}
          className={`fixed top-0 bottom-0 left-0 h-screen flex flex-col justify-between bg-white dark:bg-[#131d31] border-r border-slate-200 dark:border-slate-800 transition-all duration-200 ease-out z-40 select-none ${
            effectiveCollapsed
              ? 'w-[70px] shadow-xs'
              : isCollapsed
              ? 'w-64 shadow-2xl ring-1 ring-black/10 dark:ring-white/10'
              : 'w-64 shadow-xs'
          }`}
        >
          {/* Top Brand Header */}
          <div
            className={`p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center ${
              effectiveCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AppLogo size={32} />
              {!effectiveCollapsed && (
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

            {/* Sidebar Pin / Auto-Hide Toggle Button */}
            {!effectiveCollapsed && (
              <button
                type="button"
                onClick={() => {
                  if (!isCollapsed) {
                    setIsDesktopHovered(false);
                  }
                  onToggleCollapse();
                }}
                title={
                  isCollapsed
                    ? 'Mode Auto-Hide Aktif — Klik untuk mengunci (Pin) sidebar tetap terbuka'
                    : 'Sidebar Terkunci Terbuka — Klik untuk mengaktifkan Auto-Hide (otomatis sembunyi saat kursor keluar)'
                }
                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  isCollapsed
                    ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 border border-primary-200/70 dark:border-primary-800/60 hover:bg-primary-100'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isCollapsed ? (
                  <>
                    <span>Auto</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>Pin</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Scrollable Navigation & Tools */}
          <div className="flex-1 overflow-y-auto py-3 space-y-4 no-scrollbar">
            {renderNavList(effectiveCollapsed)}
            {renderQuickTools(effectiveCollapsed)}
          </div>

          {/* Bottom User Card & Expand Button */}
          <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            {effectiveCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                {session && (
                  <button
                    type="button"
                    onClick={() => setIsProfileOpen(true)}
                    title={`Profil (${session.username})`}
                    className="cursor-pointer rounded-xl hover:ring-2 hover:ring-primary-500/40 transition"
                  >
                    <UserAvatar username={session.username} name={session.name} className="w-10 h-10 rounded-xl" />
                  </button>
                )}

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
                    <button
                      type="button"
                      onClick={() => setIsProfileOpen(true)}
                      title="Lihat & edit profil"
                      className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <UserAvatar username={session.username} name={session.name} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {session.name || getUserPersonName(session.username) || session.username}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                          @{session.username} • <span className="text-primary-500 font-bold uppercase">{session.role}</span>
                        </div>
                      </div>
                    </button>

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
      </div>
      {session && (
        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          session={session}
          onSessionUpdate={onSessionUpdate}
          onLogout={onLogout}
        />
      )}
    </>
  );
};
