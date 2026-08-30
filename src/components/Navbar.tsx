import React from 'react';
import {
  Moon,
  Sun,
  Settings,
  LogOut,
  BellRing,
  Bell,
  Smartphone,
  Layers,
  WifiOff,
  User,
  Menu,
  ScanBarcode,
  Package,
  FileText,
  PanelLeft,
} from 'lucide-react';
import { UserSession, ActivePage } from '../types';

interface NavbarProps {
  session: UserSession | null;
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  onOpenMobileSidebar: () => void;
  onToggleSidebarCollapse: () => void;
  isSidebarCollapsed: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  isRealtimeConnected: boolean;
  onOpenSettings: () => void;
  onOpenApkModal: () => void;
  onOpenInventoryDrawer: () => void;
  onLogout: () => void;
  totalScannedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  activePage,
  onSelectPage,
  onOpenMobileSidebar,
  onToggleSidebarCollapse,
  isSidebarCollapsed,
  darkMode,
  onToggleDarkMode,
  notificationPermission,
  onRequestNotification,
  isRealtimeConnected,
  onOpenSettings,
  onOpenApkModal,
  onOpenInventoryDrawer,
  onLogout,
  totalScannedCount,
}) => {
  const getPageInfo = () => {
    switch (activePage) {
      case 'scanner':
        return { title: 'Scanner Barcode', subtitle: 'Tembak Lokasi & SKU', icon: ScanBarcode };
      case 'picking_tasks':
        return { title: 'Tugas Picking', subtitle: 'Ambil Barang Surat Jalan', icon: Package };
      case 'peminjaman':
        return { title: 'Peminjaman (SPS)', subtitle: 'Log Pinjam Live & Studio', icon: FileText };
      default:
        return { title: 'WMS Chocochips', subtitle: 'Warehouse System', icon: ScanBarcode };
    }
  };

  const pageInfo = getPageInfo();
  const PageIcon = pageInfo.icon;

  return (
    <header
      id="mainNavbar"
      className="bg-white/95 dark:bg-[#131d31]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 py-1.5 flex justify-between items-center sticky top-0 z-30 transition-colors shadow-xs"
    >
      {/* Left side: Hamburger Toggle & Active Page Title */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          title="Buka Menu Navigasi"
          className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-[#ff7a00] hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors cursor-pointer active:scale-95 border border-slate-200 dark:border-slate-700"
        >
          <Menu className="w-5 h-5 text-[#ff7a00]" />
        </button>

        {/* Desktop Sidebar Toggle Button */}
        <button
          type="button"
          onClick={onToggleSidebarCollapse}
          title={isSidebarCollapsed ? 'Buka Sidebar' : 'Sembunyikan Sidebar'}
          className="hidden lg:flex p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-[#ff7a00] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Active Page Indicator / Breadcrumb */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex w-8 h-8 rounded-xl bg-[#ff7a00]/10 border border-[#ff7a00]/20 items-center justify-center text-[#ff7a00]">
            <PageIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-1.5 font-sans">
              <span>{pageInfo.title}</span>
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium hidden xs:block">
              {pageInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Realtime Live Status Pill */}
        <div
          title={
            isRealtimeConnected
              ? 'Database Realtime: Terhubung'
              : 'Database Realtime: Menghubungkan...'
          }
          className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#0f172a] px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 ml-1"
        >
          {isRealtimeConnected ? (
            <>
              <div className="w-2 h-2 rounded-full bg-[#ff7a00] shadow-[0_0_8px_#ff7a00]"></div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#ff7a00]">
                Live
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Sync
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right side: Quick Action Buttons & User Summary */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Realtime Inventory Drawer */}
        <button
          id="btnOpenInventory"
          onClick={onOpenInventoryDrawer}
          title="Lihat Stok & Riwayat Real-time"
          className="relative p-2 text-slate-600 dark:text-slate-300 hover:text-[#ff7a00] bg-slate-100 hover:bg-slate-200 dark:bg-[#0f172a] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Layers className="w-4 h-4" />
          {totalScannedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-[#ff7a00] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
              {totalScannedCount}
            </span>
          )}
        </button>

        {/* APK / PWA Install Button */}
        <button
          id="btnOpenApkModal"
          onClick={onOpenApkModal}
          title="Download APK / Install ke Android"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 hover:text-[#ff7a00] hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all text-xs font-bold border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#ff7a00]" />
          <span>APK</span>
        </button>

        {/* Dark / Light Mode Toggle */}
        <button
          id="btnToggleDarkMode"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-[#0f172a] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
        >
          {darkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="hidden md:inline font-bold text-amber-400">Terang</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-700 fill-slate-700" />
              <span className="hidden md:inline font-bold text-slate-700">Gelap</span>
            </>
          )}
        </button>

        {/* Settings Button */}
        <button
          id="btnSettings"
          onClick={onOpenSettings}
          title="Pengaturan Sistem"
          className="p-2 text-slate-600 dark:text-slate-400 hover:text-[#ff7a00] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer hidden xs:flex"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Role Tag & Logout on Desktop */}
        {session && (
          <div className="hidden md:flex items-center gap-1.5 pl-1.5 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span className="px-2 py-0.5 rounded-lg bg-[#ff7a00]/10 text-[#ff7a00] font-extrabold border border-[#ff7a00]/20 text-[10px] uppercase">
                {session.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

