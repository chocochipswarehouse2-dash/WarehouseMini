import React, { useState, useRef, useEffect } from 'react';
import {
  BarChart3,
  MessageSquare,
  Calendar,
  Package,
  ShieldAlert,
  Receipt,
  Factory,
  LayoutGrid,
  Truck,
  Layers,
  BookOpen,
  ClipboardCheck,
  FileText,
  Printer,
  Users,
  Clock,
  Zap,
  Map,
  Database,
  Settings,
  X,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ActivePage, UserSession } from '../../types';
import { canAccessPage } from '../../services/permissions';
import { NotificationHubButton } from './NotificationHubModal';

export interface WorkspacePageMeta {
  id: ActivePage;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor?: string;
  pickerHidden?: boolean;
}

export const WORKSPACE_PAGE_META: Record<string, WorkspacePageMeta> = {
  dashboard: { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: BarChart3 },
  live_chat: { id: 'live_chat', label: 'Live Chat Tim', shortLabel: 'Live Chat', icon: MessageSquare },
  agenda: { id: 'agenda', label: 'Agenda & Project', shortLabel: 'Agenda', icon: Calendar },
  pesanan_saya: { id: 'pesanan_saya', label: 'Pesanan Saya', shortLabel: 'Pesanan', icon: Package },
  manual_shipment: { id: 'manual_shipment', label: 'Pesanan Saya', shortLabel: 'Pesanan', icon: Package, pickerHidden: true },
  pusat_resolusi: { id: 'pusat_resolusi', label: 'Pusat Resolusi', shortLabel: 'Resolusi', icon: ShieldAlert },
  rekap_tagihan_jne: { id: 'rekap_tagihan_jne', label: 'Rekap Tagihan JNE', shortLabel: 'Tagihan JNE', icon: Receipt },
  produksi: { id: 'produksi', label: 'Produksi', shortLabel: 'Produksi', icon: Factory },
  trello_up: { id: 'trello_up', label: 'Koleksi UP (Trello)', shortLabel: 'Trello UP', icon: LayoutGrid },
  loading_dock: { id: 'loading_dock', label: 'Loading Dock & Picking', shortLabel: 'Loading Dock', icon: Truck },
  picking_tasks: { id: 'picking_tasks', label: 'Tugas Picking', shortLabel: 'Picking', icon: Truck, pickerHidden: true },
  penerimaan_barang: { id: 'penerimaan_barang', label: 'Penerimaan Barang', shortLabel: 'Penerimaan', icon: Truck, pickerHidden: true },
  penerimaan: { id: 'penerimaan', label: 'Penerimaan Produksi', shortLabel: 'Penerimaan', icon: Truck, pickerHidden: true },
  pengiriman: { id: 'pengiriman', label: 'Pengiriman Barang', shortLabel: 'Pengiriman', icon: Truck, pickerHidden: true },
  inventory: { id: 'inventory', label: 'Inventory', shortLabel: 'Inventory', icon: Layers },
  operasi_stok: { id: 'operasi_stok', label: 'Scanner & Log Stok', shortLabel: 'Scanner', icon: Layers, pickerHidden: true },
  scanner: { id: 'scanner', label: 'Scanner Barcode', shortLabel: 'Scanner', icon: Layers, pickerHidden: true },
  mutasi_log: { id: 'mutasi_log', label: 'Mutasi & Log Stok', shortLabel: 'Mutasi Log', icon: Layers, pickerHidden: true },
  stock_opname: { id: 'stock_opname', label: 'Stock Opname', shortLabel: 'Stock Opname', icon: Layers, pickerHidden: true },
  katalog_produk: { id: 'katalog_produk', label: 'Katalog Produk', shortLabel: 'Katalog', icon: BookOpen },
  perbaikan: { id: 'perbaikan', label: 'Laporan QC & Perbaikan', shortLabel: 'Laporan QC', icon: ClipboardCheck },
  peminjaman: { id: 'peminjaman', label: 'Peminjaman (SPS)', shortLabel: 'Peminjaman', icon: FileText },
  cetak_label: { id: 'cetak_label', label: 'Cetak Label & Barcode', shortLabel: 'Cetak Label', icon: Printer },
  cetak_barcode: { id: 'cetak_barcode', label: 'Cetak Barcode Produk', shortLabel: 'Cetak Barcode', icon: Printer, pickerHidden: true },
  csv_barcode: { id: 'csv_barcode', label: 'CSV Barcode (DealPOS)', shortLabel: 'CSV Barcode', icon: FileText },
  csv_distribusi: { id: 'csv_distribusi', label: 'CSV Distribusi (Excel)', shortLabel: 'CSV Distribusi', icon: FileText },
  karyawan: { id: 'karyawan', label: 'Data Karyawan', shortLabel: 'Karyawan', icon: Users },
  presensi: { id: 'presensi', label: 'Presensi & Shift', shortLabel: 'Presensi', icon: Clock },
  roster_shift: { id: 'roster_shift', label: 'Jadwal Roster Tim', shortLabel: 'Roster Shift', icon: Calendar },
  lembur_cuti: { id: 'lembur_cuti', label: 'Lembur & Cuti', shortLabel: 'Lembur & Cuti', icon: Zap },
  hr_approval: { id: 'hr_approval', label: 'Approval HR', shortLabel: 'Approval HR', icon: ClipboardCheck },
  hr_rekap: { id: 'hr_rekap', label: 'Rekap & Laporan HR', shortLabel: 'Rekap HR', icon: BarChart3 },
  roadmap: { id: 'roadmap', label: 'Roadmap Sistem', shortLabel: 'Roadmap', icon: Map },
  supabase_migration: { id: 'supabase_migration', label: 'Migrasi Database', shortLabel: 'Migrasi DB', icon: Database, pickerHidden: true },
  packing: { id: 'packing', label: 'Meja Packing', shortLabel: 'Packing', icon: Package },
  pengaturan_sistem: { id: 'pengaturan_sistem', label: 'Pengaturan Sistem', shortLabel: 'Pengaturan', icon: Settings },
};

export function getWorkspacePageMeta(page: ActivePage): WorkspacePageMeta {
  return (
    WORKSPACE_PAGE_META[page] || {
      id: page,
      label: page.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      shortLabel: page.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: Layers,
    }
  );
}

interface DesktopWorkspaceTabBarProps {
  session: UserSession | null;
  activePage: ActivePage;
  openTabs: ActivePage[];
  companionPage: ActivePage | null;
  onSelectTab: (page: ActivePage) => void;
  onCloseTab: (page: ActivePage) => void;
  onOpenCompanion: (page: ActivePage | null) => void;
  onOpenAiModal?: () => void;
  onOpenNotificationHub?: () => void;
  maxKeepAliveTabs: number;
}

export const DesktopWorkspaceTabBar: React.FC<DesktopWorkspaceTabBarProps> = ({
  session,
  activePage,
  openTabs,
  companionPage,
  onSelectTab,
  onCloseTab,
  onOpenCompanion,
  onOpenAiModal,
  onOpenNotificationHub,
  maxKeepAliveTabs,
}) => {
  const [openPicker, setOpenPicker] = useState<'tab' | 'companion' | null>(null);
  const tabDropdownRef = useRef<HTMLDivElement>(null);
  const companionDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openPicker) return;
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      const inTab = tabDropdownRef.current?.contains(target);
      const inCompanion = companionDropdownRef.current?.contains(target);
      if (!inTab && !inCompanion) {
        setOpenPicker(null);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpenPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openPicker]);

  if (!session) return null;

  const allowedPages = Object.values(WORKSPACE_PAGE_META).filter(
    (meta) => !meta.pickerHidden && canAccessPage(session, meta.id)
  );
  const visibleTabs = openTabs.filter((tabPage) => canAccessPage(session, tabPage));

  const renderPickerList = (mode: 'tab' | 'companion') => (
    <div
      className={`absolute top-full mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-2 z-50 ${
        mode === 'companion' ? 'right-0' : 'left-0'
      }`}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1.5">
        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
          {mode === 'companion' ? 'Pilih Halaman untuk Disandingkan' : 'Buka Halaman di Tab Baru'}
        </span>
        <button
          type="button"
          onClick={() => setOpenPicker(null)}
          aria-label="Tutup daftar halaman"
          className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
        {allowedPages
          .filter((p) => (mode === 'companion' ? p.id !== activePage : true))
          .map((meta) => {
            const Icon = meta.icon;
            const isAlreadyOpen = openTabs.includes(meta.id);
            const isCurrent = meta.id === activePage;
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => {
                  setOpenPicker(null);
                  if (mode === 'companion') {
                    onOpenCompanion(meta.id);
                  } else {
                    onSelectTab(meta.id);
                  }
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{meta.label}</span>
                </div>
                {isAlreadyOpen && (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                    Aktif
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );

  return (
    <div className="hidden lg:flex items-center justify-between gap-2 px-4 py-1.5 bg-white dark:bg-[#101726] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 print:hidden select-none">
      {/* Left: Multi-Tab Keep-Alive Bar + Anchored "Buka Tab" Trigger */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0"
        >
          <div
            className="flex items-center gap-1 h-8 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0 border border-slate-200/60 dark:border-slate-700/60 font-mono tabular-nums"
            title={`Mode Multitasking Laptop/PC Aktif: Maksimal ${maxKeepAliveTabs} halaman ditahan tetap hidup (Keep-Alive) tanpa reset form/filter.`}
          >
            <Layers className="w-3 h-3 text-indigo-500" />
            <span>Tab {visibleTabs.length}/{maxKeepAliveTabs}</span>
          </div>

          {visibleTabs.map((tabPage) => {
            const meta = getWorkspacePageMeta(tabPage);
            const Icon = meta.icon;
            const isActive = tabPage === activePage;
            const isCompanion = tabPage === companionPage;

            return (
              <div
                key={tabPage}
                className={`group flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-xl text-xs transition-all shrink-0 border whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                    : isCompanion
                    ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/70 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTab(tabPage)}
                  className="flex items-center gap-1.5 cursor-pointer truncate max-w-[160px]"
                  title={`Buka tab ${meta.label} (Instan tanpa reset halaman)`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
                  <span className="truncate">{meta.shortLabel}</span>
                  {isActive && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-300 shrink-0"
                      title="Halaman Utama Aktif"
                    />
                  )}
                </button>

                {/* Close Tab Button (if more than 1 tab open) */}
                {visibleTabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabPage);
                    }}
                    className={`p-0.5 rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? 'text-indigo-200 hover:text-white hover:bg-white/20'
                        : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    }`}
                    title={`Tutup tab ${meta.shortLabel} & bebaskan memori`}
                    aria-label={`Tutup tab ${meta.shortLabel}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Anchored outside overflow-x-auto so dropdown never clips horizontally or vertically */}
        <div className="relative shrink-0" ref={tabDropdownRef}>
          <button
            type="button"
            onClick={() => setOpenPicker((prev) => (prev === 'tab' ? null : 'tab'))}
            className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer whitespace-nowrap"
            title="Buka halaman apa saja di Tab Baru (Tanpa menutup halaman ini)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buka Tab</span>
          </button>

          {openPicker === 'tab' && renderPickerList('tab')}
        </div>
      </div>

      {/* Right: Notification Hub, Asisten AI & Universal Companion Slide-Over Trigger */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenNotificationHub && (
          <NotificationHubButton
            onClick={onOpenNotificationHub}
            username={session?.username}
          />
        )}

        {onOpenAiModal && (
          <button
            type="button"
            onClick={onOpenAiModal}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            title="Buka Asisten AI Pintar WMS (Cek Stok, Rekap, Input Keranjang, Vision)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Asisten AI</span>
          </button>
        )}

        {companionPage ? (
          <button
            type="button"
            onClick={() => onOpenCompanion(null)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/70 transition-all cursor-pointer whitespace-nowrap"
            title="Tutup Panel Samping"
          >
            <PanelRightClose className="w-3.5 h-3.5 shrink-0" />
            <span>Tutup: {getWorkspacePageMeta(companionPage).shortLabel}</span>
          </button>
        ) : (
          <div className="relative shrink-0" ref={companionDropdownRef}>
            <button
              type="button"
              onClick={() => setOpenPicker((prev) => (prev === 'companion' ? null : 'companion'))}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all cursor-pointer whitespace-nowrap"
              title="Pilih halaman/fitur apa saja untuk dibuka berdampingan di Panel Samping"
            >
              <PanelRightOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>Panel Samping</span>
            </button>

            {openPicker === 'companion' && renderPickerList('companion')}
          </div>
        )}
      </div>
    </div>
  );
};

interface DesktopCompanionDrawerProps {
  companionPage: ActivePage | null;
  activePage: ActivePage;
  onClose: () => void;
  onSwapWithMain: (companionPage: ActivePage) => void;
  children: React.ReactNode;
}

export const DesktopCompanionDrawer: React.FC<DesktopCompanionDrawerProps> = ({
  companionPage,
  activePage,
  onClose,
  onSwapWithMain,
  children,
}) => {
  const [drawerWidth, setDrawerWidth] = useState<'normal' | 'wide' | 'half'>('half');
  const [isDockedSplit, setIsDockedSplit] = useState<boolean>(true);

  if (!companionPage) return null;

  const companionMeta = getWorkspacePageMeta(companionPage);
  const mainMeta = getWorkspacePageMeta(activePage);
  const CompanionIcon = companionMeta.icon;

  const widthClass =
    drawerWidth === 'wide'
      ? 'w-[62vw] max-w-[1200px]'
      : drawerWidth === 'half'
      ? 'w-[48vw] max-w-[960px]'
      : 'w-[40vw] max-w-[760px]';

  return (
    <aside
      aria-label={`Panel Pendamping ${companionMeta.label}`}
      className={`hidden lg:flex flex-col ${
        isDockedSplit
          ? `${widthClass} shrink-0 border-l-2 border-indigo-500/30 dark:border-indigo-500/40 bg-[#f8fafc] dark:bg-[#0b1120] sticky top-[45px] h-[calc(100vh-45px)] z-20 shadow-xl`
          : `fixed top-[45px] right-0 bottom-0 ${widthClass} z-40 border-l-2 border-indigo-500/40 bg-[#f8fafc] dark:bg-[#0b1120] shadow-2xl`
      } transition-all duration-200 print:hidden`}
    >
      {/* Top Header of Companion Panel */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-white dark:bg-[#101726] border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <CompanionIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                {companionMeta.label}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                Panel Pendamping
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              Aktif berdampingan dengan {mainMeta.shortLabel}
            </p>
          </div>
        </div>

        {/* Controls: Mode (Berdampingan vs Mengambang), Ukuran Lebar, Tukar, Tutup */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsDockedSplit((prev) => !prev)}
            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 cursor-pointer"
            title={
              isDockedSplit
                ? 'Saat ini: Mode Berdampingan (Tidak menutupi halaman kiri). Klik untuk ubah ke Mode Mengambang (Slide-Over).'
                : 'Saat ini: Mode Mengambang di atas halaman. Klik untuk ubah ke Mode Berdampingan.'
            }
          >
            {isDockedSplit ? '◫ Berdampingan' : '❐ Mengambang'}
          </button>

          <button
            type="button"
            onClick={() =>
              setDrawerWidth((prev) =>
                prev === 'normal' ? 'half' : prev === 'half' ? 'wide' : 'normal'
              )
            }
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 cursor-pointer"
            title="Ubah lebar Panel Samping (40% / 50% / 62%)"
          >
            {drawerWidth === 'wide' ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSwapWithMain(companionPage)}
            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 cursor-pointer"
            title={`Jadikan ${companionMeta.shortLabel} sebagai layar utama di kiri dan pindahkan ${mainMeta.shortLabel} ke kanan`}
          >
            ⇄ Tukar Posisi
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/60 dark:border-rose-800/60 cursor-pointer"
            title="Tutup Panel Pendamping"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body of Companion Panel */}
      <div
        className={
          companionPage === 'live_chat'
            ? 'flex-1 flex flex-col min-h-0 overflow-hidden p-0'
            : 'flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4'
        }
      >
        <div
          key={companionPage}
          className={
            companionPage === 'live_chat'
              ? 'flex-1 flex flex-col min-h-0 h-full w-full wms-page-enter'
              : 'w-full wms-page-enter'
          }
        >
          {children}
        </div>
      </div>
    </aside>
  );
};
