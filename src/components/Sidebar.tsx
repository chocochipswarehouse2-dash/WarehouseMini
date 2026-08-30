import React from 'react';
import {
  ScanBarcode,
  Package,
  FileText,
  Settings,
  LogOut,
  Moon,
  Sun,
  Layers,
  Smartphone,
  Bell,
  BellRing,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ClipboardCheck,
  ClipboardList,
  ArrowRightLeft,
  Boxes,
  Lock,
} from 'lucide-react';
import { UserSession, ActivePage } from '../types';
import { hasPermission, isSuperadmin, ROLE_DETAILS } from '../services/permissions';

interface SidebarProps {
  session: UserSession | null;
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  isRealtimeConnected: boolean;
  onOpenSettings: () => void;
  onOpenApkModal: () => void;
  onLogout: () => void;
  totalScannedCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  activePage,
  onSelectPage,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  darkMode,
  onToggleDarkMode,
  notificationPermission,
  onRequestNotification,
  isRealtimeConnected,
  onOpenSettings,
  onOpenApkModal,
  onLogout,
  totalScannedCount,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canScan = hasPermission(session, 'can_scan');
  const canPicking = hasPermission(session, 'can_picking');
  const canPeminjaman = hasPermission(session, 'can_peminjaman');
  const canViewInventory = hasPermission(session, 'can_view_inventory');
  const canApproveSo = hasPermission(session, 'can_approve_so');
  const canManageUsers = hasPermission(session, 'can_manage_users');

  const navItems = [
    {
      id: 'scanner' as ActivePage,
      label: 'Scanner Barcode',
      shortLabel: 'Scan',
      icon: ScanBarcode,
      description: 'Tembak lokasi rak & SKU',
      access: canScan,
    },
    {
      id: 'inventory' as ActivePage,
      label: 'Inventory Realtime',
      shortLabel: 'Inventory',
      icon: Layers,
      description: 'Stok fisik rak & per SKU',
      access: canViewInventory || canScan || userIsAdmin,
    },
    {
      id: 'stock_opname' as ActivePage,
      label: 'Stock Opname',
      shortLabel: 'SO',
      icon: ClipboardList,
      description: 'Audit fisik & antrean approval',
      access: canViewInventory || canScan || userIsAdmin || canApproveSo,
    },
    {
      id: 'mutasi_log' as ActivePage,
      label: 'Mutasi Log',
      shortLabel: 'Mutasi',
      icon: ArrowRightLeft,
      description: 'Riwayat IN/OUT & edit invoice',
      access: canViewInventory || canScan || userIsAdmin,
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
  ].filter((item) => item.access);

  const handleNavClick = (page: ActivePage) => {
    onSelectPage(page);
    onCloseMobile();
  };

  // Common navigation item renderer
  const renderNavList = (collapsed: boolean) => (
    <div className="space-y-1.5 px-2">
      <div
        className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
          collapsed ? 'hidden' : 'block'
        }`}
      >
        Menu Navigasi
      </div>

      {navItems.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400 italic text-center">
          Tidak ada menu aktif untuk role ini
        </div>
      ) : (
        navItems.map((item) => {
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
                  ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/25 font-extrabold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white font-bold'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:text-[#ff7a00] group-hover:bg-[#ff7a00]/10'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate leading-snug">{item.label}</div>
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
        })
      )}
    </div>
  );

  // Common quick tools section
  const renderQuickTools = (collapsed: boolean) => (
    <div className="space-y-1 px-2 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
      <div
        className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
          collapsed ? 'hidden' : 'block'
        }`}
      >
        Alat & Utilitas
      </div>

      {/* APK / PWA Modal */}
      <button
        type="button"
        onClick={() => {
          onOpenApkModal();
          onCloseMobile();
        }}
        title="Download APK / Install ke Android"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
          <Smartphone className="w-4 h-4 text-[#ff7a00]" />
        </div>
        {!collapsed && <span className="truncate">Download APK Android</span>}
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
            <BellRing className="w-4 h-4 text-[#ff7a00]" />
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

      {/* Settings Modal */}
      <button
        type="button"
        onClick={() => {
          onOpenSettings();
          onCloseMobile();
        }}
        title={
          canManageUsers || userIsAdmin
            ? 'Pengaturan Sistem, Database & User Role'
            : 'Pengaturan Preferensi Perangkat'
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

      {/* Dark Mode Switcher */}
      <button
        type="button"
        onClick={onToggleDarkMode}
        title={darkMode ? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
          {darkMode ? (
            <Sun className="w-4 h-4 text-amber-400 fill-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700 fill-slate-700" />
          )}
        </div>
        {!collapsed && (
          <div className="flex-1 text-left truncate flex items-center justify-between">
            <span>{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
              {darkMode ? 'DARK' : 'LIGHT'}
            </span>
          </div>
        )}
      </button>
    </div>
  );

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
              <div className="w-9 h-9 bg-gradient-to-br from-[#ff7a00] to-[#ff9e40] rounded-xl flex items-center justify-center shadow-md shadow-[#ff7a00]/30 shrink-0">
                <span className="text-white font-extrabold text-sm">W</span>
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  WMS <span className="text-[#ff7a00]">CHOCOCHIPS</span>
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
                  <div className="w-8 h-8 rounded-lg bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex items-center justify-center text-[#ff7a00] shrink-0 font-extrabold text-xs">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {session.username}
                    </div>
                    <div className="text-[10px] font-extrabold text-[#ff7a00] uppercase tracking-wider">
                      Role: {session.role}
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
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
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
            <div className="w-8 h-8 bg-gradient-to-br from-[#ff7a00] to-[#ff9e40] rounded-xl flex items-center justify-center shadow-md shadow-[#ff7a00]/30 shrink-0">
              <span className="text-white font-extrabold text-xs">W</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  WMS <span className="text-[#ff7a00]">CHOCOCHIPS</span>
                </h2>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRealtimeConnected ? 'bg-[#ff7a00] shadow-[0_0_6px_#ff7a00]' : 'bg-amber-500'
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
                <ChevronRight className="w-4 h-4 text-[#ff7a00]" />
              </button>

              <button
                type="button"
                onClick={onLogout}
                title={`Logout (${session?.username || 'User'})`}
                className="w-10 h-10 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            session && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex items-center justify-center text-[#ff7a00] shrink-0 font-extrabold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {session.username}
                    </div>
                    <div className="text-[9px] font-extrabold text-[#ff7a00] uppercase tracking-wider">
                      {session.role}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  title="Logout"
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
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
