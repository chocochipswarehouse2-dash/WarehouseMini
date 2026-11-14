/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import confetti from 'canvas-confetti';
import {
  Menu, Scan, FileText, ShieldAlert, Package, X, Tag, BellRing, ShoppingBag, Sparkles } from 'lucide-react';

import {
  CategoryType,
  ProductItem,
  ScanMode,
  ScannedItem,
  ToastMessage,
  UserSession,
  ActivePage,
  UserPermissions,
} from './types';
import RoadmapView from "./components/RoadmapView";
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { KatalogProdukView } from './components/KatalogProdukView';
import { OperasiStokView } from './components/OperasiStokView';
import { ImportStokModal, ImportRow } from './components/ImportStokModal';
import { LoginModal } from './components/LoginModal';
import { ScanMethodSelector } from './components/ScanMethodSelector';
import { PhysicalScanInput } from './components/PhysicalScanInput';
import { CameraScanner } from './components/CameraScanner';
import { QuickTagToolbar } from './components/QuickTagToolbar';
import { ScannedItemsList } from './components/ScannedItemsList';
import { BottomSaveBar } from './components/BottomSaveBar';
import { ApkInstallModal } from './components/ApkInstallModal';
import { DesktopPwaBanner } from './components/DesktopPwaBanner';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { AppUpdateModal } from './components/common/AppUpdateModal';
import { AppUpdateFloatingWidget } from './components/common/AppUpdateFloatingWidget';
import {
  DesktopWorkspaceTabBar,
  DesktopCompanionDrawer,
  getWorkspacePageMeta,
} from './components/common/DesktopWorkspaceTabBar';
import {
  NotificationHubModal,
  NotificationHubButton,
} from './components/common/NotificationHubModal';
import {
  addNotificationToHub,
  syncNotificationHubWithLiveSources,
} from './services/notificationHubService';
import { appUpdateManager } from './services/appUpdateService';
import { MobileOrientationWarning } from './components/MobileOrientationWarning';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { ThemePickerModal } from './components/ThemePickerModal';
import { UpdateDatabaseModal } from './components/UpdateDatabaseModal';
import { LocationPurgeModal } from './components/inventory/LocationPurgeModal';
import { WmsAiModal } from './components/ai/WmsAiModal';
import { fetchAiConfig } from './services/wmsAiService';
import { OfflineProtectionBar } from './components/OfflineProtectionBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { globalRealtimeStore } from './services/store';
import {
  getAllProductsFromLocalDb,
  saveProductsToLocalDb,
  upsertProductInLocalDb,
  bulkUpsertProductsInLocalDb,
} from './services/localDb';

// MANDATORY ZERO-CHUNK-ERROR POLICY:
// Seluruh halaman utama wajib di-import secara statis agar perpindahan menu
// (Loading Dock, Produksi, Picking, Presensi, dll.) 100% bebas dari error
// "Failed to fetch dynamically imported module" saat ada update Vercel di background
// maupun saat koneksi internet gudang sedang tidak stabil / offline.
import { DashboardView } from './components/DashboardView';
import { ProduksiView } from './components/ProduksiView';
import { TrelloView } from './components/Trello/TrelloView';
import { LoadingDockView } from './components/LoadingDockView';
import { PackingView } from './components/PackingView';
import { AgendaView } from './components/AgendaView';
import { PeminjamanView } from './components/PeminjamanView';
import { QualityControlView } from './components/QualityControlView';
import { PickingTasksView } from './components/PickingTasksView';
import { MutasiLogView } from './components/MutasiLogView';
import { InventoryView } from './components/InventoryView';
import { PresensiView } from './components/hr/PresensiView';
import { KaryawanView } from './components/hr/KaryawanView';
import { RosterShiftView } from './components/hr/RosterShiftView';
import { LemburCutiView } from './components/hr/LemburCutiView';
import { HrApprovalView } from './components/hr/HrApprovalView';
import { HrRekapView } from './components/hr/HrRekapView';
import { CetakLabelView } from './components/CetakLabelView';
import { CetakBarcodeProdukView } from './components/CetakBarcodeProdukView';
import { PesananSayaView } from './components/PesananSaya/PesananSayaView';
import PusatResolusiView from './components/PusatResolusi/PusatResolusiView';
import { JneRekapView } from './components/JneRekapView';
import { LiveChatWorkspace } from './components/LiveChat/LiveChatWorkspace';
import { LiveChatFloatingWidget } from './components/LiveChat/LiveChatFloatingWidget';
import { liveChatManager } from './services/liveChatService';
import { SupabaseMigrationView } from './components/SupabaseMigrationView';
import { SettingsView } from './components/SettingsView';
import { processPickingSync } from './services/pickingSync';

import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  fetchStockForLocations,
  getAreaFromLokasi,
  normalizeLokasi,
  getSupabaseClient,
  insertLogProduk,
  insertStockOpnameQueue,
  fetchMasterProductsFromSupabase,
  fetchSupabaseStokFisikDirect,
  verifySupabaseLogin,
  isDummyProduct,
  supabaseFetch,
  fetchWmsUsersFromSupabase,
  invalidatePerbaikanTicketsCache,
  invalidatePickingListCache,
  invalidatePenerimaanProduksiCache,
  invalidateQcReportsCache,
  invalidateStokFisikCache,
  syncPendingStockOpnameFromLogProduk,
  syncSmartLowEgressCache,
  getPickingPriority,
  isWarehouseLocation,
} from './services/supabase';
import { WmsUser } from './types';
import {
  getDefaultPageForSession,
  canAccessPage,
  canAccessSettings,
  isSuperadmin,
  isWarehouseAccountOnly,
  isStoreAccountSession,
  isStoreMatchingOrderRecord,
  canReceiveAdminOrderNotif,
  canReceivePickingAndSpsNotif,
  canReceiveRecountNotif,
  canReceiveEmployeeOwnHrNotif,
  isCustomerServiceSession,
  isPeminjamOnlySession,
  isEmployeeMatchingRecord,
  resolveRoleDefaultPermissions,
  ALL_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from './services/permissions';
import { getUserPersonName, registerUserNames } from './utils/userResolver';
import { setGlobalProductCatalog } from './utils/productLookup';
import {
  playCategoryBeep,
  playErrorBeep,
  playNewTaskChime,
  playSaveSuccessChime,
  playSuccessBeep,
  vibrateDevice,
} from './services/audio';
import {
  configureServiceWorkerOrderWatcher,
  getLastOrderCheckTimestamp,
  getNotificationPermissionStatus,
  isNotificationSupported,
  loadPersistedNotifiedOrderIds,
  requestNotificationPermission,
  savePersistedNotifiedOrderIds,
  setLastOrderCheckTimestamp,
  showPushNotification,
  needsIosHomeScreenInstall,
  syncNotifiedOrdersToServiceWorker,
  triggerServiceWorkerCheckNow,
} from './services/pushNotification';
import { subscribeToWebPush, unsubscribeFromWebPush } from './services/webPush';
import { releaseScreenWakeLock, requestScreenWakeLock } from './services/wakeLock';
import { isRunningInIframe } from './services/orientationLock';
import { getStoredGasEndpoint, fetchWmsSettings } from './services/settings';

// URL Path mapping untuk mendukung Deep-linking dan sinkronisasi address bar browser
const PAGE_TO_PATH: Record<ActivePage, string> = {
  dashboard: 'dashboard',
  produksi: 'produksi',
  operasi_stok: 'operasi-stok',
  katalog_produk: 'katalog-produk',
  agenda: 'agenda',
  pesanan_saya: 'pesanan-saya',
  loading_dock: 'loading-dock',
  perbaikan: 'quality-control',
  scanner: 'scanner',
  mutasi_log: 'mutasi-log',
  inventory: 'inventory',
  stock_opname: 'stock-opname',
  picking_tasks: 'tugas-picking',
  peminjaman: 'peminjaman',
  cetak_label: 'cetak-label',
  cetak_barcode: 'cetak-barcode',
  supabase_migration: 'migrasi-supabase',
  karyawan: 'karyawan',
  presensi: 'presensi',
  roster_shift: 'roster-shift',
  lembur_cuti: 'lembur-cuti',
  hr_approval: 'hr-approval',
  hr_rekap: 'hr-rekap',
  roadmap: 'roadmap',
    penerimaan_barang: 'penerimaan-barang',
  packing: 'packing',
  pengiriman: 'pengiriman',
  penerimaan: 'penerimaan',
  manual_shipment: 'manual-shipment',
  pusat_resolusi: 'pusat-resolusi',
  rekap_tagihan_jne: 'rekap-tagihan-jne',
  live_chat: 'live-chat',
  trello_up: 'trello-up',
  pengaturan_sistem: 'pengaturan-sistem',
};

const PATH_TO_PAGE: Record<string, ActivePage> = {
  'pengaturan-sistem': 'pengaturan_sistem',
  'pengaturan': 'pengaturan_sistem',
  'settings': 'pengaturan_sistem',
  'setting': 'pengaturan_sistem',
  'live-chat': 'live_chat',
  'chat': 'live_chat',
  'diskusi': 'live_chat',
  'rekap-tagihan-jne': 'rekap_tagihan_jne',
  'tagihan-jne': 'rekap_tagihan_jne',
  'operasi-stok': 'inventory',
  'katalog-produk': 'katalog_produk',
  'katalog': 'katalog_produk',
  '': 'dashboard',
  'dashboard': 'dashboard',
  'agenda': 'agenda',
  'pesanan-saya': 'pesanan_saya',
  'pesanan': 'pesanan_saya',
  'manual-shipment': 'pesanan_saya',
  'tarikan-md': 'pesanan_saya',
  'pusat-resolusi': 'pusat_resolusi',
  'resolusi': 'pusat_resolusi',
  'cs': 'pusat_resolusi',
  'loading-dock': 'loading_dock',
  'produksi': 'produksi',
  'quality-control': 'perbaikan',
  'qc': 'perbaikan',
  'perbaikan': 'perbaikan',
  'scanner': 'inventory',
  'scan': 'inventory',
  'mutasi-log': 'inventory',
  'mutasi': 'inventory',
  'inventory': 'inventory',
  'stok': 'inventory',
  'stock-opname': 'inventory',
  'so': 'inventory',
  'tugas-picking': 'loading_dock',
  'picking': 'loading_dock',
  'picking-tasks': 'loading_dock',
  'peminjaman': 'peminjaman',
  'sps': 'peminjaman',
  'cetak-label': 'cetak_label',
  'label': 'cetak_label',
  'cetak-barcode': 'cetak_barcode',
  'barcode': 'cetak_barcode',
  'barcode-produk': 'cetak_barcode',
  'migrasi-supabase': 'supabase_migration',
  'supabase-migration': 'supabase_migration',
  'supabase': 'supabase_migration',
  'migrasi': 'supabase_migration',
  'karyawan': 'karyawan',
  'presensi': 'presensi',
  'roster-shift': 'roster_shift',
  'roster': 'roster_shift',
  'lembur-cuti': 'lembur_cuti',
  'lembur': 'lembur_cuti',
  'cuti': 'lembur_cuti',
  'hr-approval': 'hr_approval',
  'hr-rekap': 'hr_rekap',
  'roadmap': 'roadmap',
    'packing': 'packing',
  'pengiriman': 'pengiriman',
  'penerimaan-barang': 'penerimaan_barang',
  'penerimaan': 'penerimaan',
};

function normalizeConsolidatedPage(page: ActivePage): ActivePage {
  if (page === 'supabase_migration') {
    return 'pengaturan_sistem';
  }
  if (page === 'operasi_stok' || page === 'scanner' || page === 'mutasi_log' || page === 'stock_opname') {
    return 'inventory';
  }
  if (page === 'picking_tasks') {
    return 'loading_dock';
  }
  if (page === 'cetak_barcode') {
    return 'cetak_label';
  }
  return page;
}

function getPageFromUrl(session: UserSession | null): ActivePage {
  if (typeof window === 'undefined') return getDefaultPageForSession(session);
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const pageParam = urlParams.get('page');
    const subTabParam = urlParams.get('subTab');
    const manualSubTabParam = urlParams.get('manualSubTab');
    const orderParam = urlParams.get('order');
    const hrSectionParam = urlParams.get('hrSection');

    if (subTabParam || manualSubTabParam || orderParam || pageParam === 'pesanan_saya' || pageParam === 'manual_shipment') {
      (window as any).__wms_pending_pesanan_target = {
        tab: subTabParam || 'manual_shipment',
        subTab: subTabParam || 'manual_shipment',
        manualSubTab: manualSubTabParam || 'rekap',
        orderId: orderParam || undefined,
      };
    }
    if (hrSectionParam) {
      (window as any).__wms_pending_hr_tab = hrSectionParam;
    }
    if (roomParam) {
      if (!session || canAccessPage(session, 'live_chat')) {
        return 'live_chat';
      }
    }
    if (pageParam) {
      const cleanParam = pageParam.replace(/^\/+|\/+$/g, '').toLowerCase();
      const mapped = PATH_TO_PAGE[cleanParam] || (cleanParam as ActivePage);
      const normalized = normalizeConsolidatedPage(mapped);
      if (PAGE_TO_PATH[normalized] && (!session || canAccessPage(session, normalized))) {
        return normalized;
      }
    }

    if (isRunningInIframe()) {
      const rawSavedPage = localStorage.getItem('wms_last_active_page') as ActivePage | null;
      const savedPage = rawSavedPage ? normalizeConsolidatedPage(rawSavedPage) : null;
      if (savedPage && PAGE_TO_PATH[savedPage]) {
        if (!session || canAccessPage(session, savedPage)) {
          return savedPage;
        }
      }
    }
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const matchedPage = PATH_TO_PAGE[path];
    if (matchedPage) {
      const normalized = normalizeConsolidatedPage(matchedPage);
      if (!session || canAccessPage(session, normalized)) {
        return normalized;
      }
    }
  } catch {}
  return getDefaultPageForSession(session);
}

export default function App() {
  // Session & Auth (Multi-Role User Session)
  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('wms_session_token');
    const username = localStorage.getItem('wms_session_username');
    const role = localStorage.getItem('wms_user_role');
    const endpointUrl = getStoredGasEndpoint();
    const sessionExpiry = localStorage.getItem('wms_session_expiry');
    const permissionsStr = localStorage.getItem('wms_user_permissions');

    // Cek expiry session (7 hari)
    if (sessionExpiry && Date.now() > parseInt(sessionExpiry, 10)) {
      localStorage.removeItem('wms_session_token');
      localStorage.removeItem('wms_session_username');
      localStorage.removeItem('wms_user_role');
      localStorage.removeItem('wms_session_expiry');
      localStorage.removeItem('wms_user_permissions');
      return null;
    }
    
    if (token && username && role) {
      let permissions = undefined;
      try {
        if (permissionsStr) permissions = JSON.parse(permissionsStr);
      } catch (e) {}
      const nik = localStorage.getItem('wms_user_nik') || undefined;
      const storedName = localStorage.getItem('wms_session_name');
      const name = storedName || getUserPersonName(username);
      const store_code = localStorage.getItem('wms_user_store_code') || undefined;
      const store_name = localStorage.getItem('wms_user_store_name') || undefined;
      return { token, username, name, role: role as any, permissions, nik, store_code, store_name, endpointUrl: endpointUrl || '' };
    }
    return null;
  });

  // Dark / Light Theme Mode
  const [themeColor, setThemeColor] = useState<string>(() => localStorage.getItem("wms_theme_color") || "rose");
  const [themeFont, setThemeFont] = useState<string>(() => localStorage.getItem("wms_theme_font") || "sans");
  const [themeFontSize, setThemeFontSize] = useState<string>(() => localStorage.getItem("wms_theme_font_size") || "normal");
  const [themeIconStyle, setThemeIconStyle] = useState<string>(() => localStorage.getItem("wms_theme_icon") || "regular");

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('wms_dark_mode');
    if (saved !== null) return saved === 'true';
    return false; // Default to Light Mode as requested by user
  });
  const [darkVariant, setDarkVariant] = useState<string>(() => localStorage.getItem('wms_dark_variant') || 'soft');

  // Notifications
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    getNotificationPermissionStatus()
  );
  const [dismissedNotifPrompt, setDismissedNotifPrompt] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('wms_dismiss_notif_prompt') === 'true';
    } catch {
      return false;
    }
  });

  // Realtime Incoming Picking Task Alert
  const [newPickingTaskAlert, setNewPickingTaskAlert] = useState<{
    no_sj: string;
    count: number;
    tujuan: string;
    timestamp: number;
  } | null>(null);

  // Realtime Incoming Manual Shipment (Store Order) Alert
  const [newManualShipmentAlert, setNewManualShipmentAlert] = useState<{
    orderId: string;
    storeName: string;
    customerName: string;
    itemCount: number;
    jasaKirim: string;
    isAlter: boolean;
    timestamp: number;
  } | null>(null);

  // Deduplication set for notified Manual Shipment & Retur order IDs (persisted across restarts)
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set(loadPersistedNotifiedOrderIds()));

  // Active module page (mendukung deep link & reload F5 dari URL)
  const [activePage, setActivePage] = useState<ActivePage>(() => getPageFromUrl(session));
  const [visitedPages, setVisitedPages] = useState<Set<ActivePage>>(() => new Set<ActivePage>([getPageFromUrl(session)]));
  const [inventoryInitialTab, setInventoryInitialTab] = useState<'capacity' | 'inventory' | 'scanner' | 'logs' | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (p === 'scanner' || p === 'scan' || p === 'operasi-stok') return 'scanner';
    if (p === 'mutasi-log' || p === 'mutasi') return 'logs';
    return undefined;
  });
  const [loadingDockInitialTab, setLoadingDockInitialTab] = useState<'penerimaan' | 'pengiriman' | 'transfer_order' | 'picking_tasks' | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const pageParam = new URLSearchParams(window.location.search).get('page')?.toLowerCase();
    if (p === 'tugas-picking' || p === 'picking' || p === 'picking-tasks' || pageParam === 'picking_tasks') return 'picking_tasks';
    return undefined;
  });
  const [agendaInitialTab, setAgendaInitialTab] = useState<'calendar' | 'project' | 'notes'>('calendar');
  const [cetakLabelInitialTab, setCetakLabelInitialTab] = useState<'qr_prefix' | 'paket' | 'barcode' | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (p === 'cetak-barcode' || p === 'barcode' || p === 'barcode-produk') return 'barcode';
    return undefined;
  });

  // Sinkronisasi activePage ke browser URL address bar secara transparan (hanya di top-level window, dilewati di iframe agar bebas SecurityError)
  useEffect(() => {
    if (typeof window === 'undefined' || !session) return;
    if (!canAccessPage(session, activePage)) return;
    try {
      localStorage.setItem('wms_last_active_page', activePage);
    } catch {}
    if (isRunningInIframe()) return;
    try {
      const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const targetPath = PAGE_TO_PATH[activePage] || activePage;
      const expectedUrl = targetPath === 'dashboard' && currentPath === '' ? '/' : `/${targetPath}`;
      const currentUrl = currentPath === '' ? '/' : `/${currentPath}`;

      if (currentUrl !== expectedUrl) {
        window.history.pushState({ page: activePage }, '', expectedUrl);
      }
    } catch {
      // In sandboxed iframes (e.g. AI Studio preview), history.pushState may throw SecurityError
    }
  }, [activePage, session]);

  const navigateToNotificationTargetRef = useRef<(target: any) => void>(() => {});

  // Listener navigasi tombol Back & Forward di browser + klik Notifikasi HP (Service Worker & BroadcastChannel)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const pageFromState = event.state?.page as ActivePage | undefined;
      if (pageFromState && canAccessPage(session, pageFromState)) {
        startTransition(() => {
          setActivePage(normalizeConsolidatedPage(pageFromState));
        });
      } else {
        const pageFromPath = getPageFromUrl(session);
        startTransition(() => {
          setActivePage(pageFromPath);
        });
      }
    };

    const handleNavigateCustom = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail) return;
      navigateToNotificationTargetRef.current(detail);
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'WMS_NOTIFICATION_CLICK') {
        navigateToNotificationTargetRef.current(data);
      } else if (data.type === 'WMS_SW_CHAT_REPLIED') {
        liveChatManager.syncRoomsIndexFromCloud().catch(() => {});
      }
    };

    let notifBroadcastChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        notifBroadcastChannel = new BroadcastChannel('wms_notif_click_channel_v1');
        notifBroadcastChannel.onmessage = (event: MessageEvent) => {
          if (event.data && event.data.type === 'WMS_NOTIFICATION_CLICK') {
            navigateToNotificationTargetRef.current(event.data);
          }
        };
      }
    } catch {}

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('wms_navigate_page', handleNavigateCustom);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('wms_navigate_page', handleNavigateCustom);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      if (notifBroadcastChannel) {
        try {
          notifBroadcastChannel.close();
        } catch {}
      }
    };
  }, [session]);

  // Initialize & sync Live Chat presence + room index for any active user session
  useEffect(() => {
    if (!session) {
      liveChatManager.teardown();
      return;
    }
    liveChatManager.initForSession(session, activePage).catch(() => {});
  }, [session?.username, session?.role]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__wms_active_page = activePage;
    }
    if (session) {
      liveChatManager.setActivePage(activePage);
    }
  }, [session, activePage]);

  // Auto-redirect jika halaman aktif tidak diizinkan untuk sesi user
  useEffect(() => {
    if (session && !canAccessPage(session, activePage)) {
      const allowedPage = getDefaultPageForSession(session);
      setActivePage(allowedPage);
    }
  }, [session, activePage]);

  // Add generic settings loader (fetch from Supabase Cloud on mount & keep in sync)
  useEffect(() => {
    fetchWmsSettings(true).then((settings) => {
      if (settings && settings.gas_endpoint) {
        setSession((prev) => {
          if (!prev) return prev;
          if (prev.endpointUrl !== settings.gas_endpoint) {
            return { ...prev, endpointUrl: settings.gas_endpoint || '' };
          }
          return prev;
        });
      }
    }).catch(err => console.warn('Failed to load global settings from Supabase', err));

    // Preload konfigurasi WMS AI & centralized API Key dari Supabase Cloud
    fetchAiConfig().catch((err) => console.warn('[WMS AI] Gagal preload AI config dari Supabase:', err));

    const handleSettingsChanged = (e: any) => {
      const settings = e.detail;
      if (settings?.gas_endpoint !== undefined) {
        setSession((prev) => {
          if (!prev) return prev;
          const newEndpoint = settings.gas_endpoint || '';
          if (prev.endpointUrl === newEndpoint) return prev; // Do not create a new object if unchanged
          return { ...prev, endpointUrl: newEndpoint };
        });
      }
    };
    window.addEventListener('wms_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('wms_settings_changed', handleSettingsChanged);
  }, []);

  // Sync permissions logic...
  useEffect(() => {
    if (!session || !session.username) return;
    let isMounted = true;

    // Semua halaman utama kini di-import statis (Zero Chunk Error Policy)

    const syncSessionPermissions = async () => {
      try {
        if (!session) return;

        // If user is superadmin, ensure full permissions
        if (isSuperadmin(session)) {
          const hasMissingPerms =
            !session.permissions ||
            Object.keys(ALL_PERMISSIONS).some(
              (k) => session.permissions?.[k as keyof UserPermissions] !== true
            );
          if (hasMissingPerms || session.role !== 'Superadmin') {
            const updatedSuperSession: UserSession = {
              ...session,
              role: 'Superadmin',
              permissions: { ...ALL_PERMISSIONS },
            };
            setSession(updatedSuperSession);
            localStorage.setItem('wms_user_role', 'Superadmin');
            localStorage.setItem('wms_user_permissions', JSON.stringify(ALL_PERMISSIONS));
          }
          return;
        }

        const cleanUser = session.username.trim().toLowerCase();
        const data = await supabaseFetch<WmsUser[]>(
          'wms_users',
          'GET',
          null,
          `or=(username.ilike.${encodeURIComponent(cleanUser)},nik.ilike.${encodeURIComponent(cleanUser)})&limit=1`
        );
        if (!isMounted || !data || data.length === 0) return;

        const u = data[0];
        const newRole = u.role || session.role || 'Operator';
        const isUserSuper =
          newRole.toLowerCase() === 'superadmin' ||
          newRole.toLowerCase() === 'admin' ||
          u.username.toLowerCase() === 'admin' ||
          u.username.toLowerCase() === 'admin2' ||
          u.username.toLowerCase() === 'warehouse' ||
          u.username.toLowerCase() === 'chocoadm' ||
          (u.nik && u.nik.toLowerCase() === 'wh0001');

        const hasExplicitUserPerms =
          u.permissions && typeof u.permissions === 'object' && Object.keys(u.permissions).length > 0;
        const userDefaultPerms = resolveRoleDefaultPermissions({
          ...session,
          role: newRole as any,
          nik: u.nik || session.nik,
        });
        const newPermissions = isUserSuper
          ? { ...ALL_PERMISSIONS }
          : hasExplicitUserPerms
          ? { menu_ops_live_chat: true, ...u.permissions }
          : { ...userDefaultPerms };

        const roleChanged = newRole !== session.role;
        const permsChanged = JSON.stringify(newPermissions || {}) !== JSON.stringify(session.permissions || {});

        if (roleChanged || permsChanged) {
          const updatedSession: UserSession = {
            ...session,
            role: isUserSuper ? 'Superadmin' : newRole,
            permissions: newPermissions,
            name: u.name || session.name,
            nik: u.nik || session.nik,
          };
          setSession(updatedSession);
          localStorage.setItem('wms_user_role', isUserSuper ? 'Superadmin' : newRole);
          if (newPermissions) {
            localStorage.setItem('wms_user_permissions', JSON.stringify(newPermissions));
          } else {
            localStorage.removeItem('wms_user_permissions');
          }
        }
      } catch (err) {
        // Silent catch agar tidak mengganggu operasional jika offline
      }
    };

    syncSessionPermissions();
    return () => {
      isMounted = false;
    };
  }, [session?.username]);

  // Handler navigasi dengan verifikasi izin halaman & Auto-Update Aman saat pindah menu utama
  const handleSelectPage = useCallback((rawPage: ActivePage) => {
    if (rawPage === 'cetak_barcode') setCetakLabelInitialTab('barcode');
    if (rawPage === 'picking_tasks') {
      setLoadingDockInitialTab('picking_tasks');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wms_open_loading_dock_tab', { detail: { tab: 'picking_tasks' } }));
      }
    }
    if (rawPage === 'operasi_stok' || rawPage === 'scanner') setInventoryInitialTab('scanner');
    if (rawPage === 'mutasi_log') setInventoryInitialTab('logs');
    if (rawPage === 'pesanan_saya' || rawPage === 'manual_shipment') {
      if (typeof window !== 'undefined') {
        if (newManualShipmentAlert && !(window as any).__wms_pending_pesanan_target) {
          const autoTarget = {
            tab: 'manual_shipment',
            subTab: 'manual_shipment',
            manualSubTab: 'rekap',
            orderId: newManualShipmentAlert.orderId,
            isAlter: newManualShipmentAlert.isAlter,
          };
          (window as any).__wms_pending_pesanan_target = autoTarget;
          window.dispatchEvent(new CustomEvent('wms_open_pesanan_target', { detail: autoTarget }));
          setNewManualShipmentAlert(null);
        }
      }
    }
    const page = normalizeConsolidatedPage(rawPage === 'manual_shipment' ? 'pesanan_saya' : rawPage);

    if (session && !canAccessPage(session, page)) {
      showToast('Akses ditolak: Akun Anda tidak memiliki hak akses untuk modul ini.', 'warning');
      return;
    }

    // Jika ada pembaruan versi yang menunggu dan user sedang berpindah menu utama (tanpa draft scan yang belum disimpan)
    if (page !== activePage && appUpdateManager.hasPendingUpdate()) {
      let hasStagingScans = false;
      try {
        const rawDraft = localStorage.getItem('wms_active_staging_scans');
        hasStagingScans = Boolean(rawDraft && JSON.parse(rawDraft)?.length > 0);
      } catch {}

      if (!hasStagingScans) {
        try {
          localStorage.setItem('wms_last_active_page', page);
          if (!isRunningInIframe()) {
            const targetPath = PAGE_TO_PATH[page] || page;
            const expectedUrl = targetPath === 'dashboard' ? '/' : `/${targetPath}`;
            window.history.pushState({ page }, '', expectedUrl);
          }
        } catch {}
        appUpdateManager.applyUpdate();
        return;
      }
    }

    startTransition(() => {
      setActivePage(page);
    });
  }, [session, activePage, newManualShipmentAlert]);

  const navigateToNotificationTarget = useCallback(
    (target: {
      page?: string;
      subTab?: string;
      manualSubTab?: string;
      orderId?: string;
      isAlter?: boolean;
      hrSection?: string;
      produksiTab?: string;
      kodeProduksi?: string;
      roomId?: string;
      tag?: string;
    }) => {
      if (!target) return;
      const rawPage = (target.page || (target.roomId ? 'live_chat' : 'pesanan_saya')) as ActivePage;

      // 1. Deep-target Pesanan Saya -> Store -> Rekap Pesanan (+ pilih Order ID)
      if (
        rawPage === 'pesanan_saya' ||
        rawPage === 'manual_shipment' ||
        target.subTab === 'manual_shipment' ||
        target.manualSubTab ||
        target.orderId
      ) {
        const pesananTarget = {
          tab: target.subTab || 'manual_shipment',
          subTab: target.subTab || 'manual_shipment',
          manualSubTab: target.manualSubTab || 'rekap',
          orderId: target.orderId ? String(target.orderId).replace(/^#/, '').trim() : undefined,
          isAlter: target.isAlter,
        };
        if (typeof window !== 'undefined') {
          (window as any).__wms_pending_pesanan_target = pesananTarget;
          window.dispatchEvent(new CustomEvent('wms_open_pesanan_target', { detail: pesananTarget }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wms_open_pesanan_target', { detail: pesananTarget }));
          }, 150);
        }
        setNewManualShipmentAlert(null);
      }

      // 2. Deep-target Loading Dock -> Tugas Picking
      if (rawPage === 'picking_tasks' || (rawPage === 'loading_dock' && target.subTab === 'picking_tasks')) {
        setLoadingDockInitialTab('picking_tasks');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wms_open_loading_dock_tab', { detail: { tab: 'picking_tasks' } }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wms_open_loading_dock_tab', { detail: { tab: 'picking_tasks' } }));
          }, 150);
        }
        setNewPickingTaskAlert(null);
      }

      // 3. Deep-target HR Approval -> Lembur / Cuti / Ijin Pulang Cepat
      if (rawPage === 'hr_approval') {
        const tagLower = String(target.tag || '').toLowerCase();
        const hrSec =
          target.hrSection ||
          (tagLower.includes('cuti')
            ? 'cuti'
            : tagLower.includes('ipa') || tagLower.includes('pulang')
            ? 'izin_pulang'
            : 'lembur');
        if (typeof window !== 'undefined') {
          (window as any).__wms_pending_hr_tab = hrSec;
          window.dispatchEvent(new CustomEvent('wms_open_hr_approval_tab', { detail: { section: hrSec } }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wms_open_hr_approval_tab', { detail: { section: hrSec } }));
          }, 150);
        }
      }

      // 4. Deep-target Produksi -> Audit Hitung Ulang (+ pilih Kode Produksi)
      if (
        rawPage === 'produksi' ||
        rawPage === 'penerimaan' ||
        target.produksiTab ||
        target.kodeProduksi
      ) {
        const prodTarget = {
          tab: target.produksiTab || 'audit_hitung_ulang',
          kodeProduksi: target.kodeProduksi ? String(target.kodeProduksi).trim().toUpperCase() : undefined,
        };
        if (typeof window !== 'undefined') {
          (window as any).__wms_pending_produksi_target = prodTarget;
          window.dispatchEvent(new CustomEvent('wms_open_produksi_tab', { detail: prodTarget }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wms_open_produksi_tab', { detail: prodTarget }));
          }, 150);
        }
      }

      // 5. Deep-target Live Chat -> Buka Room Spesifik
      if (rawPage === 'live_chat' || target.roomId) {
        const rid = target.roomId ? String(target.roomId).trim() : '';
        if (rid) {
          void liveChatManager.selectRoom(rid);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('wms_open_live_chat_room', {
                detail: { roomId: rid, openFullPage: true },
              })
            );
            setTimeout(() => {
              void liveChatManager.selectRoom(rid);
              window.dispatchEvent(
                new CustomEvent('wms_open_live_chat_room', {
                  detail: { roomId: rid, openFullPage: true },
                })
              );
            }, 220);
          }
        }
      }

      handleSelectPage(rawPage);
    },
    [handleSelectPage]
  );

  navigateToNotificationTargetRef.current = navigateToNotificationTarget;

  // Handler pembukaan pengaturan sistem dengan verifikasi izin ketat (Hanya @warehouse / Pemilik)
  const handleOpenSettings = useCallback(() => {
    if (!session) {
      showToast('Akses ditolak: Silakan login terlebih dahulu.', 'error');
      return;
    }
    if (!canAccessSettings(session)) {
      showToast('Akses ditolak: Menu Pengaturan Sistem hanya dapat diakses oleh akun @warehouse (Pemilik Sistem).', 'warning');
      return;
    }
    handleSelectPage('pengaturan_sistem');
  }, [session, handleSelectPage]);

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(activePage)) return prev;
      const next = new Set(prev);
      next.add(activePage);
      return next;
    });
  }, [activePage]);

  // Scan states
  const [scannerActiveTab, setScannerActiveTab] = useState<'scan' | 'recap'>('scan');
  const [scanMode, setScanMode] = useState<ScanMode>('fisik');
  const [scannedData, setScannedData] = useState<ScannedItem[]>(() => {
    try {
      const saved = localStorage.getItem('wms_active_staging_scans');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [currentCategory, setCurrentCategory] = useState<CategoryType>('');
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [currentInvoice, setCurrentInvoice] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [productDatabase, setProductDatabase] = useState<ProductItem[]>([]);
  const [hasScannedSku, setHasScannedSku] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showQuickTags, setShowQuickTags] = useState<boolean>(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Auto-backup staging scanned items to localStorage to prevent data loss on reload or force-close
  useEffect(() => {
    try {
      if (scannedData.length > 0) {
        localStorage.setItem('wms_active_staging_scans', JSON.stringify(scannedData));
      } else {
        localStorage.removeItem('wms_active_staging_scans');
      }
    } catch {}
  }, [scannedData]);

  // BeforeUnload guard to prevent losing scanned data on accidental tab close or reload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (scannedData.length > 0) {
        e.preventDefault();
        e.returnValue = 'Terdapat data hasil scan yang belum disimpan ke Database. Data telah tersimpan di draft lokal, yakin ingin menutup atau me-reload?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [scannedData]);

  // Synchronous refs to prevent stale closure during camera barcode callbacks
  const currentCategoryRef = useRef<CategoryType>(currentCategory);
  currentCategoryRef.current = currentCategory;

  const currentInvoiceRef = useRef<string>(currentInvoice);
  currentInvoiceRef.current = currentInvoice;

  const currentLocationRef = useRef<string>(currentLocation);
  currentLocationRef.current = currentLocation;

  const productDatabaseRef = useRef<ProductItem[]>(productDatabase);
  productDatabaseRef.current = productDatabase;

  // Register master product catalog into high-speed in-memory O(1) map for instant VLOOKUP across entire app
  useEffect(() => {
    if (productDatabase && productDatabase.length > 0) {
      setGlobalProductCatalog(productDatabase);
    }
  }, [productDatabase]);

  // Modals & Drawers & Sidebar
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState<boolean>(false);
  const [isUpdateDatabaseOpen, setIsUpdateDatabaseOpen] = useState<boolean>(false);
  const [isLocationPurgeOpen, setIsLocationPurgeOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isNotificationHubOpen, setIsNotificationHubOpen] = useState<boolean>(false);
  const [allowedAiUsers, setAllowedAiUsers] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('wms_ai_allowed_users');
      return cached ? JSON.parse(cached) : ['admin', 'warehouse', 'chocoadm'];
    } catch {
      return ['admin', 'warehouse', 'chocoadm'];
    }
  });

  const userCanAccessAi = useMemo(() => {
    if (!session) return false;
    if (isSuperadmin(session)) return true;
    const u = (session.username || '').toLowerCase();
    return allowedAiUsers.includes(u);
  }, [session, allowedAiUsers]);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('wms_sidebar_autohide_v2');
    if (saved !== null) return saved === 'true';
    return true; // Default: Auto-Hide active on desktop (unhides automatically on cursor hover)
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  // Periodik & Otomatis Cek Pembaruan Versi WMS (Aman untuk Multi-User Login)
  useEffect(() => {
    const bootTimer = setTimeout(() => {
      appUpdateManager.checkForUpdates(true);
    }, 4000);

    const intervalTimer = setInterval(() => {
      appUpdateManager.checkForUpdates(true);
    }, 10 * 60 * 1000); // Setiap 10 menit

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        appUpdateManager.checkForUpdates(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(bootTimer);
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", handleQuota);
    return () => window.removeEventListener("gmp-quota-exceeded", handleQuota);
  }, []);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  // Custom confirm dialog (replaces window.confirm which is blocked in TWA/PWA Builder)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    cancelText?: string;
    confirmText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const showConfirmDialog = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('wms_sidebar_autohide_v2', String(next));
      return next;
    });
  };

  // Apply dark mode class to html element
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const darkMetaColors: Record<string, string> = {
      soft: '#22252a',
      dim: '#2a3038',
      warm: '#252220',
      sage: '#212826',
      zinc: '#18181b',
    };
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
      if (metaThemeColor) metaThemeColor.setAttribute('content', darkMetaColors[darkVariant] || '#22252a');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
      if (metaThemeColor) metaThemeColor.setAttribute('content', '#ffffff');
    }
    localStorage.setItem('wms_dark_mode', String(darkMode));
    document.documentElement.setAttribute('data-dark-variant', darkVariant);
    localStorage.setItem('wms_dark_variant', darkVariant);
    document.documentElement.setAttribute('data-theme-color', themeColor);
    localStorage.setItem('wms_theme_color', themeColor);
    document.documentElement.setAttribute('data-theme-font', themeFont);
    localStorage.setItem('wms_theme_font', themeFont);
    document.documentElement.setAttribute('data-theme-font-size', themeFontSize);
    localStorage.setItem('wms_theme_font_size', themeFontSize);
    
    // Remove previous font classes
    document.documentElement.classList.remove('font-sans', 'font-ios', 'font-samsung', 'font-inter', 'font-mono', 'font-serif', 'font-rounded');
    document.documentElement.classList.add(`font-${themeFont}`);
    
    document.documentElement.setAttribute('data-theme-icon', themeIconStyle);
    localStorage.setItem('wms_theme_icon', themeIconStyle);
  }, [darkMode, darkVariant, themeColor, themeFont, themeFontSize, themeIconStyle]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  // Toast helper (mendukung klik langsung ke halaman tujuan & auto-hide maksimal 10 detik)
  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'info' | 'warning' = 'success',
      options?: { onClick?: () => void; actionLabel?: string }
    ) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      setToasts((prev) => [
        ...prev,
        { id, message, type, onClick: options?.onClick, actionLabel: options?.actionLabel },
      ]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, options?.onClick ? 10000 : 4500);
    },
    []
  );

  // Auto-hide floating popup banners strictly after 10 seconds (10000 ms)
  // User dapat melihat kembali semua notifikasi yang belum dibaca di Notification Hub
  useEffect(() => {
    if (!newManualShipmentAlert) return;
    const timer = setTimeout(() => {
      setNewManualShipmentAlert(null);
    }, 10000);
    return () => clearTimeout(timer);
  }, [newManualShipmentAlert]);

  useEffect(() => {
    if (!newPickingTaskAlert) return;
    const timer = setTimeout(() => {
      setNewPickingTaskAlert(null);
    }, 10000);
    return () => clearTimeout(timer);
  }, [newPickingTaskAlert]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ============================================================================
  // DESKTOP-ONLY MULTITASKING WORKSPACE (>= 1024px / Laptop & PC)
  // HARD CONSTRAINT (GEMINI.md Rule #13):
  // Pada perangkat HP Seluler (< 1024px), fitur Keep-Alive Multi-Tab & Companion Drawer
  // WAJIB MATI TOTAL (0 background mounted pages) demi menjaga RAM HP & kamera scanner.
  // ============================================================================
  const MAX_KEEP_ALIVE_TABS = 3;
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });
  const [openDesktopTabs, setOpenDesktopTabs] = useState<ActivePage[]>(() => [getPageFromUrl(session)]);
  const [companionPage, setCompanionPage] = useState<ActivePage | null>(null);
  const prevUsernameRef = useRef<string | null>(session?.username || null);

  // Reset multi-tab & companion state saat ganti akun / logout, serta bersihkan tab tanpa izin akses
  useEffect(() => {
    const currentUsername = session?.username || null;
    if (prevUsernameRef.current !== currentUsername) {
      prevUsernameRef.current = currentUsername;
      setCompanionPage(null);
      if (!session) {
        setOpenDesktopTabs(['dashboard']);
        setVisitedPages(new Set(['dashboard']));
        return;
      }
      const allowedPage = normalizeConsolidatedPage(
        canAccessPage(session, activePage) ? activePage : getDefaultPageForSession(session)
      );
      setOpenDesktopTabs([allowedPage]);
      setVisitedPages(new Set([allowedPage]));
      if (allowedPage !== activePage) {
        setActivePage(allowedPage);
      }
      return;
    }

    if (!session) return;
    setCompanionPage((prevComp) =>
      prevComp && canAccessPage(session, prevComp) ? prevComp : null
    );
    setOpenDesktopTabs((prev) => {
      const allowed = prev.filter((p) => canAccessPage(session, p));
      if (allowed.length === prev.length && allowed.length > 0) return prev;
      if (allowed.length > 0) return allowed;
      return [normalizeConsolidatedPage(getDefaultPageForSession(session))];
    });
  }, [session, activePage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleViewportChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const desktop = Boolean(e.matches);
      setIsDesktopViewport(desktop);
      if (!desktop) {
        setCompanionPage(null);
        setOpenDesktopTabs((prev) => (prev.length > 1 ? [activePage] : prev));
      }
    };
    handleViewportChange(mq);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleViewportChange);
      return () => mq.removeEventListener('change', handleViewportChange);
    } else {
      const onResize = () => handleViewportChange(mq);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
  }, [activePage]);

  useEffect(() => {
    if (!session) return;
    if (!isDesktopViewport) {
      setOpenDesktopTabs((prev) => (prev.length === 1 && prev[0] === activePage ? prev : [activePage]));
      return;
    }
    setOpenDesktopTabs((prev) => {
      const allowedPrev = prev.filter((p) => canAccessPage(session, p));
      const normalized = normalizeConsolidatedPage(activePage);
      if (!canAccessPage(session, normalized)) {
        return allowedPrev.length > 0 ? allowedPrev : [normalizeConsolidatedPage(getDefaultPageForSession(session))];
      }
      if (allowedPrev.includes(normalized)) {
        return allowedPrev.length === prev.length ? prev : allowedPrev;
      }
      const next = [...allowedPrev, normalized];
      if (next.length > MAX_KEEP_ALIVE_TABS) {
        const evictIdx = next.findIndex((p) => p !== normalized && p !== companionPage);
        if (evictIdx >= 0) {
          next.splice(evictIdx, 1);
        } else {
          next.shift();
        }
      }
      return next;
    });
    setCompanionPage((prevComp) =>
      prevComp && prevComp !== activePage && canAccessPage(session, prevComp) ? prevComp : null
    );
  }, [activePage, isDesktopViewport, companionPage, session]);

  const handleCloseDesktopTab = useCallback(
    (tabToClose: ActivePage) => {
      setOpenDesktopTabs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((p) => p !== tabToClose);
        if (tabToClose === activePage && next.length > 0) {
          const fallbackPage = next[next.length - 1];
          startTransition(() => {
            setActivePage(fallbackPage);
          });
        }
        return next;
      });
      setCompanionPage((prevComp) => (prevComp === tabToClose ? null : prevComp));
    },
    [activePage]
  );

  const handleOpenCompanion = useCallback(
    (targetPage: ActivePage | null) => {
      if (!isDesktopViewport) return;
      if (!targetPage) {
        setCompanionPage(null);
        return;
      }
      const normalized = normalizeConsolidatedPage(targetPage);
      if (!canAccessPage(session, normalized)) {
        showToast('Akses ditolak: Akun Anda tidak memiliki hak akses untuk modul ini.', 'warning');
        return;
      }
      if (normalized === activePage) {
        showToast('Halaman ini sudah terbuka sebagai layar utama di sebelah kiri.', 'info');
        return;
      }
      setCompanionPage(normalized);
      setOpenDesktopTabs((prev) => {
        if (prev.includes(normalized)) return prev;
        const next = [...prev, normalized];
        if (next.length > MAX_KEEP_ALIVE_TABS) {
          const evictIdx = next.findIndex((p) => p !== activePage && p !== normalized);
          if (evictIdx >= 0) next.splice(evictIdx, 1);
        }
        return next;
      });
    },
    [isDesktopViewport, session, activePage, showToast]
  );

  const handleSwapCompanionWithMain = useCallback(
    (compPage: ActivePage) => {
      if (!isDesktopViewport) return;
      const oldMain = activePage;
      startTransition(() => {
        setActivePage(compPage);
        setCompanionPage(oldMain);
      });
    },
    [isDesktopViewport, activePage]
  );

  // Load product database on session ready (100% directly from Supabase with instant local cache)
  const loadProducts = useCallback(
    async (forceRefresh = false) => {
      // 1. Instant 0ms load from Native Local Database (IndexedDB)
      let hasLocalData = false;
      if (!forceRefresh) {
        try {
          const localProducts = await getAllProductsFromLocalDb();
          if (localProducts && localProducts.length > 0) {
            const clean = localProducts.filter((it) => !isDummyProduct(it));
            if (clean.length > 0) {
              setProductDatabase(clean);
              hasLocalData = true;
              // If local indexedDB contains products without dealpos_channels, auto-refresh immediately
              const hasDealposChannels = clean.some((it) => it.dealpos_channels && Object.keys(it.dealpos_channels).length > 0);
              if (!hasDealposChannels) {
                setTimeout(() => fetchFromSupabase(true), 100);
              }
            }
          }
        } catch (err) {
          console.warn('Local indexedDB initial read error:', err);
        }

        // Fallback check legacy localStorage if localDb was empty
        if (!hasLocalData) {
          try {
            const cache: ProductItem[] = JSON.parse(localStorage.getItem('wms_product_cache') || '[]');
            if (Array.isArray(cache) && cache.length > 0) {
              const cleanCache = cache.filter((it) => it && (it.k || (it as any).sku) && !isDummyProduct(it));
              if (cleanCache.length > 0) {
                setProductDatabase(cleanCache);
                hasLocalData = true;
                saveProductsToLocalDb(cleanCache, 'merge').catch((_val: boolean) => {});
              }
            }
          } catch {}
        }
      }

      // 2. Fetch fresh master products directly from Supabase (Stale-While-Revalidate pattern)
      const fetchFromSupabase = async (doForceRefresh = forceRefresh) => {
        try {
          const supabaseProducts = await fetchMasterProductsFromSupabase(50000, doForceRefresh);
          if (supabaseProducts && supabaseProducts.length > 0) {
            const finalList = supabaseProducts.filter((it) => !isDummyProduct(it));
            setProductDatabase(finalList);
            await saveProductsToLocalDb(finalList, 'replace');
            try {
              localStorage.setItem('wms_master_products_last_sync', String(Date.now()));
              localStorage.setItem('wms_catalog_v3_dealpos_channels', 'true');
            } catch {}
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('wms_catalog_updated'));
            }
            if (forceRefresh) {
              showToast(`Katalog berhasil disinkronkan (${finalList.length} produk dari Supabase)!`, 'success');
            }
          }
        } catch (err) {
          console.warn('Supabase product sync error:', err);
          if (forceRefresh) {
            showToast('Gagal menyinkronkan katalog dari Supabase.', 'error');
          }
        }
      };

      if (!hasLocalData || forceRefresh) {
        // Blocking fetch ONLY if local IndexedDB is empty or user explicitly clicked manual Force Refresh
        await fetchFromSupabase(forceRefresh);
        try {
          localStorage.setItem('wms_loc_sync_v6_done', 'true');
        } catch {}
      } else {
        // Ultra-Low Egress Background Sync:
        // Never re-download 28,000 rows of `master_produk` unless `masterImportEpoch` changed!
        // Instead, check 250-byte watermark and delta-sync only mutated SKUs or active stock locations.
        syncSmartLowEgressCache().catch((err) => {
          console.warn('Smart low-egress delta sync warning:', err);
        });
      }
    },
    [showToast]
  );

  // Listen for targeted SKU location patches & full location refreshes so `productDatabase` in memory stays 100% up-to-date
  useEffect(() => {
    const handleSkuPatched = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (!detail || !Array.isArray(detail.skus)) return;
      const skuSet = new Set<string>(detail.skus.map((s: string) => String(s || '').trim().toUpperCase()));
      const stocks: any[] = Array.isArray(detail.stocks) ? detail.stocks : [];

      const stockBySku = new Map<string, any[]>();
      skuSet.forEach((s) => stockBySku.set(s, []));
      stocks.forEach((r) => {
        const clean = String(r.sku || '').trim().toUpperCase();
        if (stockBySku.has(clean)) stockBySku.get(clean)!.push(r);
      });

      setProductDatabase((prev) => {
        if (!prev || prev.length === 0) return prev;
        let mutated = false;
        const next = prev.map((prod) => {
          const clean = String(prod.k || (prod as any).sku || '').trim().toUpperCase();
          if (!skuSet.has(clean)) return prod;
          mutated = true;
          const rows = stockBySku.get(clean) || [];
          const locMap = new Map<string, { lokasi: string; qty: number; area: string }>();
          rows.forEach((r) => {
            const loc = String(r.lokasi || '').trim().toUpperCase();
            const qty = Number(r.sisa_stok) || 0;
            const area = getAreaFromLokasi(loc, r.area);
            if (loc && loc !== '-' && loc !== 'KOSONG' && qty > 0 && isWarehouseLocation(loc, area)) {
              const prevLoc = locMap.get(loc);
              if (prevLoc) prevLoc.qty += qty;
              else locMap.set(loc, { lokasi: loc, qty, area });
            }
          });
          const sortedLocs = Array.from(locMap.values()).sort((a, b) => {
            const pA = getPickingPriority(a.lokasi, a.area);
            const pB = getPickingPriority(b.lokasi, b.area);
            if (pA !== pB) return pA - pB;
            if (b.qty !== a.qty) return b.qty - a.qty;
            return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
          });
          return {
            ...prod,
            locList: sortedLocs.map((l) => ({ lokasi: l.lokasi, qty: l.qty })),
            lokasi: sortedLocs.map((l) => l.lokasi).join(', '),
          };
        });
        return mutated ? next : prev;
      });
    };

    const handleFullLocationsRefreshed = (ev: Event) => {
      const updatedProducts = (ev as CustomEvent)?.detail;
      if (Array.isArray(updatedProducts) && updatedProducts.length > 0) {
        setProductDatabase(updatedProducts.filter((it: ProductItem) => !isDummyProduct(it)));
      }
    };

    window.addEventListener('wms_sku_locations_patched', handleSkuPatched);
    window.addEventListener('wms_full_locations_refreshed', handleFullLocationsRefreshed);

    // Periodic & Tab-Focus Low-Egress Watermark Check (every 5 minutes + on tab focus throttled 2 min)
    let lastFocusCheck = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFocusCheck > 2 * 60 * 1000) {
        lastFocusCheck = Date.now();
        syncSmartLowEgressCache().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const deltaInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncSmartLowEgressCache().catch(() => {});
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('wms_sku_locations_patched', handleSkuPatched);
      window.removeEventListener('wms_full_locations_refreshed', handleFullLocationsRefreshed);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(deltaInterval);
    };
  }, []);

  const handleAddDiscoveredProducts = useCallback((newItems: ProductItem[]) => {
    setProductDatabase((prev) => {
      const map = new Map<string, ProductItem>();
      prev.forEach((it) => {
        if (it && it.k && !isDummyProduct(it)) map.set(it.k.toUpperCase(), it);
      });
      let hasNew = false;
      const validNew: ProductItem[] = [];
      newItems.forEach((it) => {
        if (it && it.k && !isDummyProduct(it) && !map.has(it.k.toUpperCase())) {
          map.set(it.k.toUpperCase(), it);
          validNew.push(it);
          hasNew = true;
        }
      });
      if (!hasNew) return prev;
      if (validNew.length > 0) {
        bulkUpsertProductsInLocalDb(validNew).catch((_val: boolean) => {});
      }
      return Array.from(map.values()).filter((it) => !isDummyProduct(it));
    });
  }, []);

  const sessionLoadedRef = React.useRef<string | null>(null);

  // Load product database on mount & session ready
  useEffect(() => {
    if (!session) {
      sessionLoadedRef.current = null;
      return;
    }

    if (sessionLoadedRef.current === session.username) {
      return;
    }
    
    sessionLoadedRef.current = session.username;

    loadProducts();
    // Preload physical stock in background so Inventory tab opens instantly with full 4,500+ items
    fetchSupabaseStokFisikDirect().catch((err) => {
      console.warn('Background physical stock preload warning:', err);
    });
    
    requestScreenWakeLock();
  }, [session, loadProducts]);

  // Set up Supabase Real-time listener for log_produk, master_produk, & other warehouse activity
  useEffect(() => {
    if (!session) return;

    let debounceCatalogTimer: any = null;
    let pickingDebounceTimer: any = null;
    let incomingPickingRows: Array<{ no_sj: string; tujuan?: string; nama_produk?: string; sku?: string }> = [];
    try {
      const supabase = getSupabaseClient();
      const channel = supabase
        .channel('wms-realtime-activity')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'log_produk' },
          (payload) => {
            invalidateStokFisikCache();
            if (payload.eventType === 'INSERT' && payload.new) {
              const newLog = payload.new as { type?: string; sku?: string; lokasi?: string; qty?: number; invoice?: string };

              // Jangan kirim push notification spam global untuk setiap scan barcode #IN / #OUT biasa!
              // Hanya kirim notifikasi ke Admin & Warehouse jika ada scan antrian Stock Opname (#SO) baru
              if (newLog.type === 'SO' && canReceiveAdminOrderNotif(session)) {
                const soDedupKey = `SO_SCAN_${String(newLog.invoice || newLog.lokasi || Date.now()).toUpperCase()}`;
                if (!notifiedOrderIdsRef.current.has(soDedupKey)) {
                  notifiedOrderIdsRef.current.add(soDedupKey);
                  showPushNotification(`📋 Antrian Stock Opname Baru — Rak ${newLog.lokasi || '-'}`, {
                    body: `Scan #SO diterima (${newLog.sku || 'Produk'}). Buka Stock Opname untuk review & approval.`,
                    tag: `so-queue-${newLog.lokasi || 'rak'}`,
                    page: 'stock_opname',
                  });
                }
              }

              void processPickingSync(newLog).catch(console.error);

              // Local State Mutation to save egress: update locally instead of fetching the whole database
              if (newLog.sku && newLog.lokasi && newLog.qty) {
                setProductDatabase(prev => {
                  const skuUpper = newLog.sku!.toUpperCase();
                  return prev.map(p => {
                    if (p.k.toUpperCase() === skuUpper) {
                      const updated = { ...p };
                      const qty = Number(newLog.qty) || 0;
                      if (typeof updated.q === 'number') {
                        if (newLog.type === 'IN' || newLog.type === 'ADJ_IN') {
                          updated.q += qty;
                        } else if (newLog.type === 'OUT' || newLog.type === 'ADJ_OUT') {
                          updated.q = Math.max(0, updated.q - qty);
                        }
                      }
                      upsertProductInLocalDb(updated).catch((_val: boolean) => {});
                      return updated;
                    }
                    return p;
                  });
                });
              }
            }
            if (payload.eventType === 'INSERT') {
              const newRow = payload.new as any;
              if (newRow && newRow.type === 'SO') {
                syncPendingStockOpnameFromLogProduk().catch(() => {});
              }
            }
            globalRealtimeStore.notify('log_produk', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'master_produk' },
          (payload) => {
            globalRealtimeStore.notify('master_produk', payload);
            if (payload.new) {
              const raw = payload.new as any;
              const sku = String(raw.sku || raw.k || '').toUpperCase().trim();
              if (sku) {
                const item: ProductItem = {
                  k: sku,
                  sku: sku,
                  p: raw.nama_produk || raw.nama || raw.p || sku,
                  s: raw.size || raw.s || '-',
                  lokasi: raw.lokasi || 'Warehouse',
                  category: raw.kategori || raw.category || 'IN',
                  price: Number(raw.harga || raw.price) || 0,
                };
                upsertProductInLocalDb(item).catch((_val: boolean) => {});
                setProductDatabase(prev => {
                  const idx = prev.findIndex(p => p.k.toUpperCase() === sku);
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...item };
                    return next;
                  }
                  return [...prev, item];
                });
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stock_opname_queue' },
          (payload) => {
            invalidateStokFisikCache();
            globalRealtimeStore.notify('stock_opname_queue', payload);
          }
        )
        .on(
          'broadcast',
          { event: 'new_sps_request' },
          ({ payload }) => {
            if (payload) {
              invalidatePickingListCache();
              globalRealtimeStore.notify('peminjaman', { eventType: 'INSERT', new: payload });
              handleIncomingSpsRef.current(payload);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'peminjaman' },
          (payload) => {
            invalidatePickingListCache();
            globalRealtimeStore.notify('peminjaman', payload);
            if (payload.eventType === 'INSERT' && payload.new) {
              handleIncomingSpsRef.current(payload.new);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'penerimaan_produksi' },
          (payload) => {
            invalidatePenerimaanProduksiCache();
            globalRealtimeStore.notify('penerimaan_produksi', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'perbaikan_tickets' },
          (payload) => {
            invalidatePerbaikanTicketsCache();
            globalRealtimeStore.notify('perbaikan_tickets', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'qc_reports' },
          (payload) => {
            invalidateQcReportsCache();
            globalRealtimeStore.notify('qc_reports', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'picking_list' },
          (payload) => {
            invalidatePickingListCache();
            globalRealtimeStore.notify('picking_list', payload);

            // Notifikasi Realtime Tugas Picking HANYA untuk Admin, Warehouse, Picker & Operator Gudang
            if (payload.eventType === 'INSERT' && payload.new) {
              if (!canReceivePickingAndSpsNotif(session)) return;

              const row = payload.new as any;
              const sj = String(row.no_sj || 'Tugas Baru').trim();
              if (
                globalRealtimeStore.isOrderSubmittedLocally(sj) ||
                globalRealtimeStore.isOrderSubmittedLocally(row.invoice_picking)
              ) {
                return;
              }
              const tujuan = row.tujuan || 'Gudang';
              incomingPickingRows.push({
                no_sj: sj,
                tujuan,
                nama_produk: row.nama_produk,
                sku: row.sku,
              });

              if (pickingDebounceTimer) clearTimeout(pickingDebounceTimer);
              pickingDebounceTimer = setTimeout(() => {
                const rowsSnapshot = [...incomingPickingRows];
                incomingPickingRows = [];
                const uniqueSjs = Array.from(
                  new Set(rowsSnapshot.map((r) => String(r.no_sj || '').trim().toUpperCase()))
                ).filter(Boolean);
                const unnotifiedSjs = uniqueSjs.filter((s) => !notifiedOrderIdsRef.current.has(s));
                if (unnotifiedSjs.length === 0) return;

                unnotifiedSjs.forEach((s) => notifiedOrderIdsRef.current.add(s));
                savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
                setLastOrderCheckTimestamp(Date.now());
                syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

                const totalItems = rowsSnapshot.length;
                const firstSj = unnotifiedSjs[0] || uniqueSjs[0] || 'Surat Jalan';
                const firstTujuan = rowsSnapshot[0]?.tujuan || 'Gudang';

                playNewTaskChime();
                vibrateDevice([250, 100, 250, 100, 450]);

                const notifTitle = '📋 Tugas Picking Baru Masuk!';
                const notifBody =
                  unnotifiedSjs.length > 1
                    ? `${unnotifiedSjs.length} Surat Jalan baru masuk (${totalItems} SKU). Buka untuk mulai picking.`
                    : `SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}. Buka untuk mulai picking.`;

                showPushNotification(notifTitle, {
                  body: notifBody,
                  tag: `picking-task-${firstSj}`,
                  page: 'picking_tasks',
                  subTab: 'picking_tasks',
                });

                showToast(
                  unnotifiedSjs.length > 1
                    ? `📋 ${unnotifiedSjs.length} Tugas Picking Baru Masuk (${totalItems} item)!`
                    : `📋 Tugas Picking Baru Masuk: SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}`,
                  'info',
                  {
                    actionLabel: 'Buka Picking →',
                    onClick: () =>
                      navigateToNotificationTargetRef.current({
                        page: 'picking_tasks',
                        subTab: 'picking_tasks',
                      }),
                  }
                );

                setNewPickingTaskAlert({
                  no_sj: firstSj,
                  count: totalItems,
                  tujuan: firstTujuan,
                  timestamp: Date.now(),
                });
              }, 650);
            }
          }
        )
        .on(
          'broadcast',
          { event: 'new_picking_task' },
          ({ payload }) => {
            invalidatePickingListCache();
            globalRealtimeStore.notify('picking_list', { eventType: 'INSERT', new: payload });
            // HANYA Admin, Warehouse, Picker & Operator Gudang yang menerima notifikasi Tugas Picking
            if (!canReceivePickingAndSpsNotif(session)) return;

            const rows: any[] = Array.isArray(payload?.rows) ? payload.rows : [];
            if (rows.length === 0) return;
            rows.forEach((row) => {
              const sj = String(row.no_sj || 'Tugas Baru').trim();
              if (
                globalRealtimeStore.isOrderSubmittedLocally(sj) ||
                globalRealtimeStore.isOrderSubmittedLocally(row.invoice_picking)
              ) {
                return;
              }
              incomingPickingRows.push({
                no_sj: sj,
                tujuan: row.tujuan || 'Gudang',
                nama_produk: row.nama_produk,
                sku: row.sku,
              });
            });
            if (incomingPickingRows.length === 0) return;
            if (pickingDebounceTimer) clearTimeout(pickingDebounceTimer);
            pickingDebounceTimer = setTimeout(() => {
              const rowsSnapshot = [...incomingPickingRows];
              incomingPickingRows = [];
              const uniqueSjs = Array.from(
                new Set(rowsSnapshot.map((r) => String(r.no_sj || '').trim().toUpperCase()))
              ).filter(Boolean);
              const unnotifiedSjs = uniqueSjs.filter((s) => !notifiedOrderIdsRef.current.has(s));
              if (unnotifiedSjs.length === 0) return;

              unnotifiedSjs.forEach((s) => notifiedOrderIdsRef.current.add(s));
              savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
              setLastOrderCheckTimestamp(Date.now());
              syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

              const totalItems = rowsSnapshot.length;
              const firstSj = unnotifiedSjs[0] || uniqueSjs[0] || 'Surat Jalan';
              const firstTujuan = rowsSnapshot[0]?.tujuan || 'Gudang';

              playNewTaskChime();
              vibrateDevice([250, 100, 250, 100, 450]);

              showPushNotification('📋 Tugas Picking Baru Masuk!', {
                body:
                  unnotifiedSjs.length > 1
                    ? `${unnotifiedSjs.length} Surat Jalan baru masuk (${totalItems} SKU). Buka untuk mulai picking.`
                    : `SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}. Buka untuk mulai picking.`,
                tag: `picking-task-${firstSj}`,
                page: 'picking_tasks',
                subTab: 'picking_tasks',
              });

              showToast(
                unnotifiedSjs.length > 1
                  ? `📋 ${unnotifiedSjs.length} Tugas Picking Baru Masuk (${totalItems} item)!`
                  : `📋 Tugas Picking Baru Masuk: SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}`,
                'info',
                {
                  actionLabel: 'Buka Picking →',
                  onClick: () =>
                    navigateToNotificationTargetRef.current({
                      page: 'picking_tasks',
                      subTab: 'picking_tasks',
                    }),
                }
              );

              setNewPickingTaskAlert({
                no_sj: firstSj,
                count: totalItems,
                tujuan: firstTujuan,
                timestamp: Date.now(),
              });
            }, 350);
          }
        )
        .on(
          'broadcast',
          { event: 'catalog_updated' },
          ({ payload }) => {
            console.log('[REALTIME] Catalog updated broadcast received:', payload);
            syncSmartLowEgressCache().then((res) => {
              if (res.action === 'NONE') {
                loadProducts(false);
              }
            }).catch(() => {
              loadProducts(false);
            });
          }
        )
        .on(
          'broadcast',
          { event: 'new_manual_shipment' },
          ({ payload }) => {
            if (payload) {
              globalRealtimeStore.notify('manual_shipment', { eventType: 'INSERT', new: payload });
              handleIncomingManualShipmentRef.current(payload);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'manual_shipment' },
          (payload) => {
            globalRealtimeStore.notify('manual_shipment', payload);

            if (payload.eventType === 'INSERT' && payload.new) {
              const row = payload.new as any;
              if (canReceiveAdminOrderNotif(session)) {
                handleIncomingManualShipmentRef.current(row);
              } else if (isStoreAccountSession(session) && isStoreMatchingOrderRecord(session, row)) {
                const orderId = String(row.no_pesanan || row.no_transaksi_customer || 'Pesanan').trim();
                const rawNotes = String(row.notes_paket || '');
                const isAlter =
                  orderId.toUpperCase().startsWith('AR-') ||
                  orderId.toUpperCase().startsWith('ALT-') ||
                  orderId.toUpperCase().startsWith('REP-') ||
                  rawNotes.includes('[ALTERATION_REPAIR]:');
                const submitKey = `STORE_SELF_SUBMIT_${orderId.toUpperCase()}`;
                if (!notifiedOrderIdsRef.current.has(submitKey)) {
                  notifiedOrderIdsRef.current.add(submitKey);
                  savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
                  showPushNotification(
                    isAlter
                      ? `✅ Form Alter/Repair #${orderId} Terkirim`
                      : `✅ Pesanan #${orderId} Berhasil Disubmit`,
                    {
                      body: `Customer: ${row.nama_tujuan || 'Customer'} • Menunggu diproses oleh Gudang.`,
                      tag: `resi-update-submit-${orderId}`,
                      page: 'pesanan_saya',
                      subTab: 'manual_shipment',
                      manualSubTab: 'rekap',
                      orderId,
                      isAlter,
                    }
                  );
                }
              }
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              // Khusus akun Store pengirim: Notifikasi saat Resi baru diinput atau status pesanan/alter tokonya diupdate oleh Admin
              if (isStoreAccountSession(session) && isStoreMatchingOrderRecord(session, row)) {
                const orderId = String(row.no_pesanan || row.no_transaksi_customer || 'Pesanan').trim();
                const rawNotes = String(row.notes_paket || '');
                const isAlter =
                  orderId.toUpperCase().startsWith('AR-') ||
                  orderId.toUpperCase().startsWith('ALT-') ||
                  orderId.toUpperCase().startsWith('REP-') ||
                  rawNotes.includes('[ALTERATION_REPAIR]:');

                if (row.no_resi && row.no_resi !== oldRow.no_resi) {
                  playNewTaskChime();
                  vibrateDevice([200, 100, 300]);
                  showPushNotification(`🚚 Resi Pesanan Diupdate (#${orderId})`, {
                    body: `Pesanan ${row.nama_tujuan || 'Customer'} telah diupdate dengan No. Resi: ${row.no_resi} (${row.jasa_kirim || 'Ekspedisi'})`,
                    tag: `resi-update-${orderId}`,
                    page: 'pesanan_saya',
                    subTab: 'manual_shipment',
                    manualSubTab: 'rekap',
                    orderId,
                    isAlter,
                  });
                  showToast(`🚚 Resi pesanan #${orderId} telah diupdate: ${row.no_resi}`, 'info', {
                    actionLabel: 'Lihat Rekap →',
                    onClick: () =>
                      navigateToNotificationTargetRef.current({
                        page: 'pesanan_saya',
                        subTab: 'manual_shipment',
                        manualSubTab: 'rekap',
                        orderId,
                        isAlter,
                      }),
                  });
                } else if (row.status && row.status !== oldRow.status) {
                  const statusStr = String(row.status || '').toUpperCase();
                  playNewTaskChime();
                  vibrateDevice([200, 100, 250]);
                  showPushNotification(`📦 Status Pesanan #${orderId}: ${statusStr}`, {
                    body: `Pesanan Customer ${row.nama_tujuan || '-'} kini berstatus: ${statusStr}.`,
                    tag: `resi-update-status-${orderId}-${statusStr}`,
                    page: 'pesanan_saya',
                    subTab: 'manual_shipment',
                    manualSubTab: 'rekap',
                    orderId,
                    isAlter,
                  });
                  showToast(`📦 Status pesanan #${orderId} diupdate menjadi: ${statusStr}`, 'info', {
                    actionLabel: 'Lihat Rekap →',
                    onClick: () =>
                      navigateToNotificationTargetRef.current({
                        page: 'pesanan_saya',
                        subTab: 'manual_shipment',
                        manualSubTab: 'rekap',
                        orderId,
                        isAlter,
                      }),
                  });
                }
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'retur_barang' },
          (payload) => {
            globalRealtimeStore.notify('retur_barang', payload);
            if (payload.eventType === 'INSERT' && payload.new) {
              // 1. Tiket Retur Baru: Notifikasi HANYA ke Admin & Warehouse
              if (!canReceiveAdminOrderNotif(session)) return;
              const row = payload.new as any;
              const noRetur = String(row.no_retur || 'RTR-BARU').trim().toUpperCase();
              if (globalRealtimeStore.isOrderSubmittedLocally(noRetur)) return;
              if (notifiedOrderIdsRef.current.has(noRetur)) return;
              notifiedOrderIdsRef.current.add(noRetur);
              savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);

              const customer = row.nama_customer || 'Customer';
              playNewTaskChime();
              vibrateDevice([250, 100, 250]);
              showPushNotification('🔄 Tiket Retur Barang Baru!', {
                body: `Tiket #${noRetur} atas nama ${customer} baru saja diajukan di Pusat Resolusi.`,
                tag: `retur-new-${noRetur}`,
                page: 'pusat_resolusi',
              });
              showToast(`🔄 Tiket Retur Barang Baru: #${noRetur} (${customer})`, 'info', {
                actionLabel: 'Buka Resolusi →',
                onClick: () =>
                  navigateToNotificationTargetRef.current({
                    page: 'pusat_resolusi',
                  }),
              });
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              // 2. Update Status Retur oleh Gudang/Admin: Notifikasi khusus ke Customer Service (CS)
              if (!isCustomerServiceSession(session)) return;
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              const noRetur = String(row.no_retur || 'RTR').trim().toUpperCase();
              const customer = String(row.nama_customer || 'Customer').trim();

              const newResi = String(row.no_resi || '').trim();
              const oldResi = String(oldRow.no_resi || '').trim();
              const newStatus = String(row.status || '').trim().toLowerCase();
              const oldStatus = String(oldRow.status || '').trim().toLowerCase();
              const newSj = String(row.no_sj_gudang_retur || '').trim();
              const oldSj = String(oldRow.no_sj_gudang_retur || '').trim();
              const newInv = String(row.no_invoice_return || '').trim();
              const oldInv = String(oldRow.no_invoice_return || '').trim();

              let updateTitle = '';
              let updateBody = '';
              let dedupSuffix = '';

              if (newResi && newResi !== oldResi) {
                updateTitle = `🚚 Retur Selesai — Resi Pengganti Terbit (#${noRetur})`;
                updateBody = `Customer: ${customer} • No. Resi Pengganti: ${newResi}`;
                dedupSuffix = `RESI_${newResi}`;
              } else if (newStatus && newStatus !== oldStatus) {
                const statusLabel =
                  newStatus === 'dikirim'
                    ? 'Pesanan Selesai (Dikirim)'
                    : newStatus === 'diproses'
                    ? 'Pesanan Sedang Diproses Gudang'
                    : newStatus.toUpperCase();
                updateTitle = `🔄 Update Status Retur #${noRetur}`;
                updateBody = `Customer: ${customer} • Status beralih ke: ${statusLabel}`;
                dedupSuffix = `STATUS_${newStatus}`;
              } else if (newSj && newSj !== oldSj) {
                updateTitle = `📦 SJ Gudang Retur Diinput (#${noRetur})`;
                updateBody = `Customer: ${customer} • No. SJ DealPOS: ${newSj}`;
                dedupSuffix = `SJ_${newSj}`;
              } else if (newInv && newInv !== oldInv) {
                updateTitle = `🧾 Invoice Return Diinput (#${noRetur})`;
                updateBody = `Customer: ${customer} • No. Invoice Return: ${newInv}`;
                dedupSuffix = `INV_${newInv}`;
              }

              if (updateTitle && dedupSuffix) {
                const dedupKey = `RTR_UPD_${noRetur}_${dedupSuffix}`;
                if (notifiedOrderIdsRef.current.has(dedupKey)) return;
                notifiedOrderIdsRef.current.add(dedupKey);
                savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);

                playNewTaskChime();
                vibrateDevice([200, 100, 250]);
                showPushNotification(updateTitle, {
                  body: updateBody,
                  tag: `retur-upd-${noRetur}`,
                  page: 'pusat_resolusi',
                  orderId: noRetur,
                });
                showToast(`${updateTitle} — ${updateBody}`, 'info', {
                  actionLabel: 'Lihat Retur →',
                  onClick: () =>
                    navigateToNotificationTargetRef.current({
                      page: 'pusat_resolusi',
                      orderId: noRetur,
                    }),
                });
              }
            }
          }
        )
        .on(
          'broadcast',
          { event: 'new_hr_request' },
          ({ payload }) => {
            if (payload && payload.sourceTable && payload.record) {
              handleIncomingHrRequestRef.current(payload.sourceTable, payload.record);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lembur' },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const row = payload.new as any;
              if (isWarehouseAccountOnly(session)) {
                handleIncomingHrRequestRef.current('lembur', row);
              } else if (canReceiveEmployeeOwnHrNotif(session) && isEmployeeMatchingRecord(session, row)) {
                const tgl = String(row.tanggal || '').slice(0, 10);
                showPushNotification(`✅ Pengajuan Lembur Terkirim (${tgl})`, {
                  body: `Pengajuan lembur Anda tanggal ${tgl} telah dikirim dan menunggu persetujuan HR/Warehouse.`,
                  tag: `hr-emp-self-lmb-${row.id || tgl}`,
                  page: 'lembur_cuti',
                });
              }
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              const status = String(row.status || '').trim();
              if (
                (status === 'Disetujui' || status === 'Ditolak') &&
                status !== oldRow.status &&
                canReceiveEmployeeOwnHrNotif(session) &&
                isEmployeeMatchingRecord(session, row)
              ) {
                const tgl = String(row.tanggal || '').slice(0, 10);
                const icon = status === 'Disetujui' ? '✅' : '❌';
                playNewTaskChime();
                vibrateDevice([200, 100, 250]);
                showPushNotification(`${icon} Pengajuan Lembur ${status}`, {
                  body: `Lembur tanggal ${tgl} telah ${status.toLowerCase()} oleh HR/Warehouse.`,
                  tag: `hr-emp-lmb-${row.id}`,
                  page: 'lembur_cuti',
                });
                showToast(`${icon} Pengajuan Lembur Anda (${tgl}) telah ${status}!`, status === 'Disetujui' ? 'success' : 'warning');
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'perijinan_cuti' },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const row = payload.new as any;
              if (isWarehouseAccountOnly(session)) {
                handleIncomingHrRequestRef.current('perijinan_cuti', row);
              } else if (canReceiveEmployeeOwnHrNotif(session) && isEmployeeMatchingRecord(session, row)) {
                const jenis = String(row.jenis || 'Ijin/Cuti').trim();
                const tgl = String(row.tgl_mulai || row.tanggal_mulai || '').slice(0, 10);
                showPushNotification(`✅ Pengajuan ${jenis} Terkirim (${tgl})`, {
                  body: `Pengajuan ${jenis} Anda tanggal ${tgl} telah dikirim dan menunggu persetujuan HR/Warehouse.`,
                  tag: `hr-emp-self-cuti-${row.id || tgl}`,
                  page: 'lembur_cuti',
                });
              }
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              const status = String(row.status || '').trim();
              if (
                (status === 'Disetujui' || status === 'Ditolak') &&
                status !== oldRow.status &&
                canReceiveEmployeeOwnHrNotif(session) &&
                isEmployeeMatchingRecord(session, row)
              ) {
                const jenis = String(row.jenis || 'Ijin/Cuti').trim();
                const tgl = String(row.tgl_mulai || row.tanggal_mulai || '').slice(0, 10);
                const icon = status === 'Disetujui' ? '✅' : '❌';
                playNewTaskChime();
                vibrateDevice([200, 100, 250]);
                showPushNotification(`${icon} Pengajuan ${jenis} ${status}`, {
                  body: `Pengajuan ${jenis} tanggal ${tgl} telah ${status.toLowerCase()} oleh HR/Warehouse.`,
                  tag: `hr-emp-cuti-${row.id}`,
                  page: 'lembur_cuti',
                });
                showToast(`${icon} Pengajuan ${jenis} Anda (${tgl}) telah ${status}!`, status === 'Disetujui' ? 'success' : 'warning');
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'izin_pulang_cepat' },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const row = payload.new as any;
              if (isWarehouseAccountOnly(session)) {
                handleIncomingHrRequestRef.current('izin_pulang_cepat', row);
              } else if (canReceiveEmployeeOwnHrNotif(session) && isEmployeeMatchingRecord(session, row)) {
                const tgl = String(row.tanggal || '').slice(0, 10);
                showPushNotification(`✅ Ijin Pulang Cepat Terkirim (${tgl})`, {
                  body: `Pengajuan Ijin Pulang Cepat Anda tanggal ${tgl} telah dikirim dan menunggu persetujuan HR/Warehouse.`,
                  tag: `hr-emp-self-ipc-${row.id || tgl}`,
                  page: 'lembur_cuti',
                });
              }
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              const status = String(row.status || '').trim();
              if (
                (status === 'Disetujui' || status === 'Ditolak') &&
                status !== oldRow.status &&
                canReceiveEmployeeOwnHrNotif(session) &&
                isEmployeeMatchingRecord(session, row)
              ) {
                const tgl = String(row.tanggal || '').slice(0, 10);
                const icon = status === 'Disetujui' ? '✅' : '❌';
                playNewTaskChime();
                vibrateDevice([200, 100, 250]);
                showPushNotification(`${icon} Ijin Pulang Cepat ${status}`, {
                  body: `Pengajuan Ijin Pulang Cepat tanggal ${tgl} telah ${status.toLowerCase()}.`,
                  tag: `hr-emp-ipc-${row.id}`,
                  page: 'lembur_cuti',
                });
                showToast(`${icon} Pengajuan Ijin Pulang Cepat Anda (${tgl}) telah ${status}!`, status === 'Disetujui' ? 'success' : 'warning');
              }
            }
          }
        )
        .on(
          'broadcast',
          { event: 'new_recount_queue' },
          ({ payload }) => {
            if (payload && Array.isArray(payload.items)) {
              payload.items.forEach((item: any) => {
                handleIncomingRecountRef.current(item);
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'penerimaan_recount_queue' },
          (payload) => {
            if (payload.new) {
              handleIncomingRecountRef.current(payload.new);
            }
          }
        )
        .subscribe((status) => {
          setIsRealtimeConnected(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED') {
            globalRealtimeStore.setActiveChannel(channel);
          }
        });

      return () => {
        if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
        if (pickingDebounceTimer) clearTimeout(pickingDebounceTimer);
        globalRealtimeStore.setActiveChannel(null);
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Supabase realtime subscription error:', err);
    }
  }, [session, loadProducts]);

  // Handler terpusat saat ada tugas Antrian Hitung Ulang Fisik baru (HANYA Admin, Warehouse & Produksi)
  const handleIncomingRecountNotification = useCallback(
    (row: any) => {
      if (!row || !session) return;

      if (!canReceiveRecountNotif(session)) return;

      const kode = String(row.kode_produksi || row.kode || '').trim().toUpperCase();
      if (!kode || kode === 'DUMMY') return;

      // Jangan bunyikan dua kali di tab yang baru saja meng-submit antrian hitung ulang secara lokal
      if (globalRealtimeStore.isOrderSubmittedLocally(`RECOUNT_${kode}`)) {
        return;
      }

      const dedupKey = `RECOUNT_${kode}`;
      if (notifiedOrderIdsRef.current.has(dedupKey)) return;

      notifiedOrderIdsRef.current.add(dedupKey);
      savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
      setLastOrderCheckTimestamp(Date.now());
      syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

      const addedBy = String(row.added_by || 'Buyer / Auditor').trim();
      const catatan = String(row.catatan_petunjuk || 'Perlu verifikasi hitung ulang fisik').trim();

      playNewTaskChime();
      vibrateDevice([250, 100, 250, 100, 400]);

      showPushNotification(`🔄 Tugas Hitung Ulang Fisik — Kode ${kode}`, {
        body: `Oleh: ${addedBy} • ${catatan}`,
        tag: `recount-queue-${kode}`,
        page: 'produksi',
        produksiTab: 'audit_hitung_ulang',
        kodeProduksi: kode,
        requireInteraction: true,
      });

      showToast(
        `🔄 Tugas Hitung Ulang Baru: Kode ${kode} (${catatan.slice(0, 65)}${catatan.length > 65 ? '...' : ''})`,
        'warning',
        {
          actionLabel: 'Buka Hitung Ulang →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'produksi',
              produksiTab: 'audit_hitung_ulang',
              kodeProduksi: kode,
            }),
        }
      );
    },
    [session, showToast]
  );

  const handleIncomingRecountRef = useRef(handleIncomingRecountNotification);
  handleIncomingRecountRef.current = handleIncomingRecountNotification;

  // Handler terpusat KHUSUS AKUN `warehouse` ONLY saat ada pengajuan Lembur, Ijin/Cuti, atau Ijin Pulang Cepat
  const handleIncomingHrRequestNotification = useCallback(
    (sourceTable: 'lembur' | 'perijinan_cuti' | 'izin_pulang_cepat', row: any) => {
      if (!row || !session) return;

      // WAJIB HANYA untuk akun `warehouse`
      if (!isWarehouseAccountOnly(session)) {
        return;
      }

      const rawId = String(row.id || '').trim().toUpperCase();
      if (!rawId) return;

      if (sourceTable === 'lembur') {
        const key = `HR_LMB_${rawId}`;
        if (notifiedOrderIdsRef.current.has(key)) return;
        notifiedOrderIdsRef.current.add(key);
        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        setLastOrderCheckTimestamp(Date.now());
        syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

        const empName = String(row.nama || row.nik || 'Karyawan').trim();
        const tgl = String(row.tanggal || '').slice(0, 10);
        const jam = `${String(row.jam_mulai || '--:--').slice(0, 5)} - ${String(row.jam_selesai || '--:--').slice(0, 5)}`;
        const alasan = String(row.alasan_lembur || row.deskripsi || '-').trim();

        playNewTaskChime();
        vibrateDevice([250, 100, 250, 100, 400]);
        showPushNotification(`⚡ Pengajuan Lembur Baru — ${empName}`, {
          body: `Tanggal: ${tgl} (${jam}) • Alasan: ${alasan}`,
          tag: `hr-lembur-${rawId}`,
          page: 'hr_approval',
          hrSection: 'lembur',
          requireInteraction: true,
        });
        showToast(`⚡ Pengajuan Lembur Baru: ${empName} (${tgl} • ${jam})`, 'info', {
          actionLabel: 'Buka Approval →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'hr_approval',
              hrSection: 'lembur',
            }),
        });
      } else if (sourceTable === 'perijinan_cuti') {
        const key = `HR_CUTI_${rawId}`;
        const rawTglMulai = String(row.tgl_mulai || row.tanggal_mulai || '').slice(0, 10);
        const rawTglSelesai = String(row.tgl_selesai || row.tanggal_selesai || '').slice(0, 10);
        const ipcDedupKey = `HR_IPC_${String(row.nik || '').trim().toUpperCase()}_${rawTglMulai}`;
        if (notifiedOrderIdsRef.current.has(key)) return;
        notifiedOrderIdsRef.current.add(key);
        if (String(row.jenis || '').toLowerCase().includes('pulang')) {
          notifiedOrderIdsRef.current.add(ipcDedupKey);
        }
        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        setLastOrderCheckTimestamp(Date.now());
        syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

        const empName = String(row.nama || row.nik || 'Karyawan').trim();
        const jenis = String(row.jenis || 'Ijin/Cuti').trim();
        const tglLabel = rawTglSelesai && rawTglSelesai !== rawTglMulai ? `${rawTglMulai} s/d ${rawTglSelesai}` : rawTglMulai;
        const ket = String(row.alasan || row.keterangan || '-').trim();

        playNewTaskChime();
        vibrateDevice([250, 100, 250, 100, 400]);
        showPushNotification(`🌴 Pengajuan ${jenis} Baru — ${empName}`, {
          body: `Tanggal: ${tglLabel} • Ket: ${ket}`,
          tag: `hr-cuti-${rawId}`,
          page: 'hr_approval',
          hrSection: 'cuti',
          requireInteraction: true,
        });
        showToast(`🌴 Pengajuan ${jenis} Baru: ${empName} (${tglLabel})`, 'info', {
          actionLabel: 'Buka Approval →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'hr_approval',
              hrSection: 'cuti',
            }),
        });
      } else if (sourceTable === 'izin_pulang_cepat') {
        const key = `HR_IPA_${rawId}`;
        const ipcDedupKey = `HR_IPC_${String(row.nik || '').trim().toUpperCase()}_${String(row.tanggal || '').slice(0, 10)}`;
        if (notifiedOrderIdsRef.current.has(key) || notifiedOrderIdsRef.current.has(ipcDedupKey)) return;
        notifiedOrderIdsRef.current.add(key);
        notifiedOrderIdsRef.current.add(ipcDedupKey);
        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        setLastOrderCheckTimestamp(Date.now());
        syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

        const empName = String(row.nama || row.nik || 'Karyawan').trim();
        const tgl = String(row.tanggal || '').slice(0, 10);
        const jamPulang = String(row.jam_pulang_rencana || row.jam_pulang_awal || '--:--').slice(0, 5);
        const alasan = String(row.alasan || '-').trim();

        playNewTaskChime();
        vibrateDevice([250, 100, 250, 100, 400]);
        showPushNotification(`🏃 Pengajuan Ijin Pulang Cepat — ${empName}`, {
          body: `Tanggal: ${tgl} (Pulang Jam ${jamPulang}) • Ket: ${alasan}`,
          tag: `hr-ipa-${rawId}`,
          page: 'hr_approval',
          hrSection: 'izin_pulang',
          requireInteraction: true,
        });
        showToast(`🏃 Pengajuan Ijin Pulang Cepat: ${empName} (${tgl} • Jam ${jamPulang})`, 'info', {
          actionLabel: 'Buka Approval →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'hr_approval',
              hrSection: 'izin_pulang',
            }),
        });
      }
    },
    [session, showToast]
  );

  const handleIncomingHrRequestRef = useRef(handleIncomingHrRequestNotification);
  handleIncomingHrRequestRef.current = handleIncomingHrRequestNotification;

  // Handler terpusat KHUSUS ADMIN & WAREHOUSE saat Toko submit Pesanan Baru (Manual Shipment / Alter)
  // TIDAK AKAN berbunyi di HP / perangkat PIC Toko, Picker, CS, atau Peminjam.
  const handleIncomingManualShipmentNotification = useCallback(
    (row: any) => {
      if (!row || !session) return;

      // 1. HANYA muncul di Laptop / HP Admin & Warehouse
      if (!canReceiveAdminOrderNotif(session)) {
        return;
      }

      // 2. Jangan bunyikan di perangkat/tab tempat pesanan itu baru saja di-submit secara lokal
      if (
        globalRealtimeStore.isOrderSubmittedLocally(row.no_pesanan) ||
        globalRealtimeStore.isOrderSubmittedLocally(row.no_transaksi_customer)
      ) {
        return;
      }

      const noPesanan = String(row.no_pesanan || '').trim().toUpperCase();
      const noTransCustomer = String(row.no_transaksi_customer || '').trim().toUpperCase();
      const rowId = String(row.id || '').trim().toUpperCase();
      const rawNotes = String(row.notes_paket || '');

      // Abaikan jika record retur barang
      if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) {
        return;
      }

      const primaryKey = noPesanan || noTransCustomer || rowId;
      if (!primaryKey) return;

      if (
        (noPesanan && notifiedOrderIdsRef.current.has(noPesanan)) ||
        (noTransCustomer && notifiedOrderIdsRef.current.has(noTransCustomer)) ||
        (rowId && notifiedOrderIdsRef.current.has(rowId))
      ) {
        return;
      }

      if (noPesanan) notifiedOrderIdsRef.current.add(noPesanan);
      if (noTransCustomer) notifiedOrderIdsRef.current.add(noTransCustomer);
      if (rowId) notifiedOrderIdsRef.current.add(rowId);
      savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
      setLastOrderCheckTimestamp(Date.now());
      syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

      const orderId = String(row.no_pesanan || row.no_transaksi_customer || 'Pesanan Baru').trim();
      const storeName = String(row.nama_pengirim || 'Store').trim();
      const picStore = String(row.pic_store || row.submitted_by || '').trim();
      const customerName = String(row.nama_tujuan || 'Customer').trim();
      const jasaKirim = String(row.jasa_kirim || 'Ekspedisi').trim();
      const isAlter =
        noPesanan.startsWith('AR-') ||
        noPesanan.startsWith('ALT-') ||
        noPesanan.startsWith('REP-') ||
        rawNotes.includes('[ALTERATION_REPAIR]:');

      // Hitung jumlah kuantitas & daftar ringkas SKU
      let parsedItems: any[] = [];
      if (Array.isArray(row.items)) {
        parsedItems = row.items;
      } else if (typeof row.items === 'string' && row.items.trim()) {
        try {
          const parsed = JSON.parse(row.items);
          if (Array.isArray(parsed)) parsedItems = parsed;
        } catch {}
      }
      const totalQty =
        parsedItems.length > 0
          ? parsedItems.reduce((sum, it) => sum + (Number(it?.qty) || 1), 0)
          : Number(row.qty) || 1;
      const skuPreview = parsedItems
        .slice(0, 2)
        .map((it) => it?.sku || it?.nama_produk || '')
        .filter(Boolean)
        .join(', ');

      playNewTaskChime();
      vibrateDevice([300, 120, 300, 120, 500]);

      const notifTitle = isAlter
        ? `✂️ Form Alter/Repair Baru — ${storeName}`
        : `🛍️ Pesanan Baru dari ${storeName}`;
      const notifBody = `Order #${orderId}${picStore ? ` (PIC: ${picStore})` : ''} • Customer: ${customerName} (${totalQty} pcs${skuPreview ? ` - ${skuPreview}` : ''} via ${jasaKirim})`;

      showPushNotification(notifTitle, {
        body: notifBody,
        tag: `manual-shipment-${primaryKey}`,
        page: 'pesanan_saya',
        subTab: 'manual_shipment',
        manualSubTab: 'rekap',
        orderId,
        isAlter,
        requireInteraction: true,
      });

      showToast(
        `${isAlter ? '✂️ Request Alter/Repair Baru' : '🛍️ Pesanan Baru'} dari ${storeName}: #${orderId} (${totalQty} pcs - ${customerName})`,
        'info',
        {
          actionLabel: 'Lihat Rekap →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'pesanan_saya',
              subTab: 'manual_shipment',
              manualSubTab: 'rekap',
              orderId,
              isAlter,
            }),
        }
      );

      setNewManualShipmentAlert({
        orderId,
        storeName,
        customerName,
        itemCount: totalQty,
        jasaKirim,
        isAlter,
        timestamp: Date.now(),
      });
    },
    [session, showToast]
  );

  const handleIncomingManualShipmentRef = useRef(handleIncomingManualShipmentNotification);
  handleIncomingManualShipmentRef.current = handleIncomingManualShipmentNotification;

  // Handler terpusat KHUSUS ADMIN, WAREHOUSE, PICKER & OPERATOR GUDANG saat ada Permintaan Peminjaman Sementara (SPS) baru
  const handleIncomingSpsNotification = useCallback(
    (rowOrRecord: any) => {
      if (!rowOrRecord || !session) return;

      // HANYA Admin, Warehouse, Picker & Operator Gudang (Akun Peminjam / Store / CS tidak boleh terganggu)
      if (!canReceivePickingAndSpsNotif(session)) {
        return;
      }

      const noSps = String(rowOrRecord.no_peminjaman || rowOrRecord.noPeminjaman || rowOrRecord.id || '')
        .trim()
        .toUpperCase();
      if (!noSps || !noSps.startsWith('SPS')) return;

      // Jangan bunyikan di perangkat/tab tempat SPS itu baru saja di-submit secara lokal
      if (globalRealtimeStore.isOrderSubmittedLocally(noSps)) {
        return;
      }

      if (notifiedOrderIdsRef.current.has(noSps)) {
        return;
      }

      notifiedOrderIdsRef.current.add(noSps);
      savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
      setLastOrderCheckTimestamp(Date.now());
      syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));

      const picName = String(rowOrRecord.pic || rowOrRecord.namaPeminjam || 'Divisi Live / Studio').trim();
      const keperluanText = String(rowOrRecord.keperluan || 'Peminjaman SPS').trim();
      const itemsList = Array.isArray(rowOrRecord.items) ? rowOrRecord.items : null;
      const itemCount = itemsList
        ? itemsList.length
        : Number(rowOrRecord.skuCount) || 1;
      const totalQty = itemsList
        ? itemsList.reduce((acc: number, it: any) => acc + (Number(it?.qty) || 1), 0)
        : Number(rowOrRecord.totalQty || rowOrRecord.qty) || 1;

      playNewTaskChime();
      vibrateDevice([250, 100, 250, 100, 450]);

      const notifTitle = `📋 Permintaan SPS Baru — ${picName}`;
      const notifBody = `Invoice #${noSps} • ${keperluanText} (${itemCount} SKU / ${totalQty} pcs). Buka untuk proses picking.`;

      showPushNotification(notifTitle, {
        body: notifBody,
        tag: `sps-new-${noSps}`,
        page: 'picking_tasks',
        subTab: 'picking_tasks',
        requireInteraction: true,
      });

      showToast(
        `📋 Permintaan SPS Baru: #${noSps} dari ${picName} (${keperluanText} - ${totalQty} pcs)`,
        'info',
        {
          actionLabel: 'Buka Picking →',
          onClick: () =>
            navigateToNotificationTargetRef.current({
              page: 'picking_tasks',
              subTab: 'picking_tasks',
            }),
        }
      );

      setNewPickingTaskAlert({
        no_sj: noSps,
        count: itemCount,
        tujuan: `SPS: ${picName} - ${keperluanText}`,
        timestamp: Date.now(),
      });
    },
    [session, showToast]
  );

  const handleIncomingSpsRef = useRef(handleIncomingSpsNotification);
  handleIncomingSpsRef.current = handleIncomingSpsNotification;

  // Web Push (VAPID): daftarkan perangkat sesuai role masing-masing
  useEffect(() => {
    if (!session?.username || notificationPermission !== 'granted') return;
    void subscribeToWebPush({
      username: session.username,
      isAdmin: Boolean(canReceiveAdminOrderNotif(session)),
      isPicker: Boolean(canReceivePickingAndSpsNotif(session)),
      storeName: session.store_name || session.store_code || '',
    });
  }, [session, notificationPermission]);

  // Background, Service Worker & Screen-Wake Delta Poller (Strict Role-Aware Matrix)
  useEffect(() => {
    const userIsAdmin = Boolean(session && canReceiveAdminOrderNotif(session));
    const userIsPicker = Boolean(session && canReceivePickingAndSpsNotif(session));
    const userIsWarehouseOnly = Boolean(session && isWarehouseAccountOnly(session));
    const userCanProduksi = Boolean(session && canReceiveRecountNotif(session));
    const userIsCustomerService = Boolean(session && isCustomerServiceSession(session));

    if (!session) {
      configureServiceWorkerOrderWatcher({
        enabled: false,
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
        isAdmin: false,
        isPicker: false,
        isWarehouseOnly: false,
        canProduksi: false,
        isCustomerService: false,
      });
      return;
    }

    const customUrl = localStorage.getItem('wms_supabase_url') || DEFAULT_SUPABASE_URL;
    const customKey = localStorage.getItem('wms_supabase_key') || DEFAULT_SUPABASE_ANON_KEY;
    configureServiceWorkerOrderWatcher({
      enabled: true,
      supabaseUrl: customUrl,
      supabaseAnonKey: customKey,
      isAdmin: userIsAdmin,
      isPicker: userIsPicker,
      isWarehouseOnly: userIsWarehouseOnly,
      canProduksi: userCanProduksi,
      isCustomerService: userIsCustomerService,
      username: session.username,
      displayName: session.name || getUserPersonName(session.username) || session.username,
      userRole: session.role,
      storeName: session.store_name || session.store_code || '',
      notifiedIds: Array.from(notifiedOrderIdsRef.current),
      lastCheckedAt: getLastOrderCheckTimestamp() || Date.now(),
    });

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'WMS_SW_NOTIFICATION_FIRED' && data.title) {
        addNotificationToHub({
          title: String(data.title || ''),
          body: String(data.body || ''),
          timestamp: Number(data.timestamp) || Date.now(),
          target: data.target || {},
        });
      } else if (data.type === 'WMS_SW_ORDERS_NOTIFIED' && Array.isArray(data.notifiedIds)) {
        data.notifiedIds.forEach((id: string) => {
          if (id) notifiedOrderIdsRef.current.add(String(id).toUpperCase());
        });
        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        if (data.timestamp) setLastOrderCheckTimestamp(Number(data.timestamp));
        void syncNotificationHubWithLiveSources(true);
      } else if (data.type === 'WMS_NOTIFICATION_CLICK') {
        navigateToNotificationTargetRef.current(data);
      }
    };

    const handleInAppNotifClick = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (!detail) return;
      navigateToNotificationTargetRef.current(detail);
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    window.addEventListener('wms_inapp_notification_click', handleInAppNotifClick);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      const pageParam = urlParams.get('page');
      const subTabParam = urlParams.get('subTab');
      const manualSubTabParam = urlParams.get('manualSubTab');
      const orderParam = urlParams.get('order');
      const hrSectionParam = urlParams.get('hrSection');
      const produksiTabParam = urlParams.get('produksiTab');
      const kodeProduksiParam = urlParams.get('kodeProduksi');

      if (
        roomParam ||
        pageParam ||
        subTabParam ||
        manualSubTabParam ||
        orderParam ||
        hrSectionParam ||
        produksiTabParam ||
        kodeProduksiParam
      ) {
        setTimeout(() => {
          navigateToNotificationTargetRef.current({
            page: pageParam || (roomParam ? 'live_chat' : kodeProduksiParam ? 'produksi' : 'pesanan_saya'),
            subTab: subTabParam || undefined,
            manualSubTab: manualSubTabParam || undefined,
            orderId: orderParam || undefined,
            hrSection: hrSectionParam || undefined,
            produksiTab: produksiTabParam || undefined,
            kodeProduksi: kodeProduksiParam || undefined,
            roomId: roomParam || undefined,
          });
        }, 250);
      }
    } catch {}

    const handleFirstGesturePermission = () => {
      if (isNotificationSupported() && getNotificationPermissionStatus() === 'default') {
        requestNotificationPermission()
          .then((perm) => setNotificationPermission(perm))
          .catch(() => {});
      }
      window.removeEventListener('pointerdown', handleFirstGesturePermission);
    };
    if (isNotificationSupported() && getNotificationPermissionStatus() === 'default') {
      window.addEventListener('pointerdown', handleFirstGesturePermission, { once: true });
    }

    if (!userIsAdmin && !userIsPicker && !userIsWarehouseOnly && !userCanProduksi && !userIsCustomerService) {
      const swChatKeepAlive = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          void triggerServiceWorkerCheckNow();
        }
      }, 20000);
      return () => {
        clearInterval(swChatKeepAlive);
        window.removeEventListener('pointerdown', handleFirstGesturePermission);
        window.removeEventListener('wms_inapp_notification_click', handleInAppNotifClick);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleSwMessage);
        }
      };
    }

    let isMounted = true;
    let isSeeded = false;

    const recordOrderKeys = (r: any) => {
      const k1 = String(r.no_pesanan || '').trim().toUpperCase();
      const k2 = String(r.no_transaksi_customer || '').trim().toUpperCase();
      const k3 = String(r.id || '').trim().toUpperCase();
      if (k1) notifiedOrderIdsRef.current.add(k1);
      if (k2) notifiedOrderIdsRef.current.add(k2);
      if (k3) notifiedOrderIdsRef.current.add(k3);
    };

    const checkNewStoreOrdersDelta = async () => {
      if (!isSeeded) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        void triggerServiceWorkerCheckNow();
      }
      try {
        const nowMs = Date.now();
        const MAX_AGE_MS = 12 * 60 * 60 * 1000;
        const prevCheck = getLastOrderCheckTimestamp();
        const deltaSinceIso = prevCheck && prevCheck > 0 && Math.abs(nowMs - prevCheck) <= MAX_AGE_MS
          ? new Date(Math.max(nowMs - MAX_AGE_MS, prevCheck - 5000)).toISOString()
          : null;

        if (userIsAdmin) {
          const manualShipmentQuery = deltaSinceIso
            ? `select=id,no_pesanan,no_transaksi_customer,nama_pengirim,pic_store,nama_tujuan,jasa_kirim,qty,notes_paket,created_at&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=15`
            : 'select=id,no_pesanan,no_transaksi_customer,nama_pengirim,pic_store,nama_tujuan,jasa_kirim,qty,notes_paket,created_at&order=created_at.desc&limit=12';

          const latestRows = await supabaseFetch<any[]>(
            'manual_shipment',
            'GET',
            null,
            manualShipmentQuery
          );
          if (!isMounted) return;

          if (Array.isArray(latestRows) && latestRows.length > 0) {
            for (const r of [...latestRows].reverse()) {
              const k1 = String(r.no_pesanan || '').trim().toUpperCase();
              const k2 = String(r.no_transaksi_customer || '').trim().toUpperCase();
              const k3 = String(r.id || '').trim().toUpperCase();
              const alreadyKnown =
                (k1 && notifiedOrderIdsRef.current.has(k1)) ||
                (k2 && notifiedOrderIdsRef.current.has(k2)) ||
                (k3 && notifiedOrderIdsRef.current.has(k3));

              if (!alreadyKnown) {
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  handleIncomingManualShipmentRef.current(r);
                  globalRealtimeStore.notify('manual_shipment', { eventType: 'INSERT', new: r });
                } else {
                  recordOrderKeys(r);
                }
              }
            }
          }

          // Cek juga tiket Retur Barang baru untuk Admin & Warehouse
          try {
            const returQuery = deltaSinceIso
              ? `select=id,no_retur,nama_customer,created_at&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=10`
              : 'select=id,no_retur,nama_customer,created_at&order=created_at.desc&limit=6';

            const latestRetur = await supabaseFetch<any[]>(
              'retur_barang',
              'GET',
              null,
              returQuery
            );
            if (isMounted && Array.isArray(latestRetur)) {
              for (const r of [...latestRetur].reverse()) {
                const noRetur = String(r.no_retur || '').trim().toUpperCase();
                if (!noRetur || notifiedOrderIdsRef.current.has(noRetur) || globalRealtimeStore.isOrderSubmittedLocally(noRetur)) continue;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
                notifiedOrderIdsRef.current.add(noRetur);
                if (!isNaN(rowTs) && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  playNewTaskChime();
                  vibrateDevice([250, 100, 250]);
                  showPushNotification('🔄 Tiket Retur Barang Baru!', {
                    body: `Tiket #${noRetur} atas nama ${r.nama_customer || 'Customer'} baru diajukan di Pusat Resolusi.`,
                    tag: `retur-new-${noRetur}`,
                    page: 'pusat_resolusi',
                  });
                  showToast(`🔄 Tiket Retur Barang Baru: #${noRetur} (${r.nama_customer || 'Customer'})`, 'info', {
                    actionLabel: 'Buka Resolusi →',
                    onClick: () =>
                      navigateToNotificationTargetRef.current({
                        page: 'pusat_resolusi',
                      }),
                  });
                }
              }
            }
          } catch {}
        }

        // Khusus Customer Service (CS): Cek update status tiket Retur Barang (diproses / dikirim / resi terbit)
        if (userIsCustomerService) {
          try {
            const csReturQuery = deltaSinceIso
              ? `select=id,no_retur,nama_customer,status,no_resi,no_sj_gudang_retur,no_invoice_return,updated_at&updated_at=gt.${encodeURIComponent(deltaSinceIso)}&order=updated_at.desc&limit=10`
              : 'select=id,no_retur,nama_customer,status,no_resi,no_sj_gudang_retur,no_invoice_return,updated_at&order=updated_at.desc&limit=8';
            const updatedReturs = await supabaseFetch<any[]>('retur_barang', 'GET', null, csReturQuery);
            if (isMounted && Array.isArray(updatedReturs)) {
              for (const r of [...updatedReturs].reverse()) {
                const noRetur = String(r.no_retur || '').trim().toUpperCase();
                if (!noRetur) continue;
                const status = String(r.status || '').trim().toLowerCase();
                const resi = String(r.no_resi || '').trim();
                const sj = String(r.no_sj_gudang_retur || '').trim();
                if (status === 'diterima' && !resi && !sj) continue;

                const stateSignature = resi ? `RESI_${resi}` : sj ? `SJ_${sj}` : `STATUS_${status}`;
                const dedupKey = `RTR_UPD_${noRetur}_${stateSignature}`;
                if (notifiedOrderIdsRef.current.has(dedupKey)) continue;
                notifiedOrderIdsRef.current.add(dedupKey);

                const updTs = r.updated_at ? new Date(r.updated_at).getTime() : nowMs;
                if (!isNaN(updTs) && Math.abs(nowMs - updTs) <= MAX_AGE_MS) {
                  const customer = r.nama_customer || 'Customer';
                  const title = resi
                    ? `🚚 Retur Selesai — Resi Pengganti Terbit (#${noRetur})`
                    : `🔄 Update Status Retur #${noRetur}`;
                  const body = resi
                    ? `Customer: ${customer} • No. Resi Pengganti: ${resi}`
                    : `Customer: ${customer} • Status: ${status === 'diproses' ? 'Diproses Gudang' : status.toUpperCase()}${sj ? ` (SJ: ${sj})` : ''}`;

                  playNewTaskChime();
                  vibrateDevice([200, 100, 250]);
                  showPushNotification(title, {
                    body,
                    tag: `retur-upd-${noRetur}`,
                    page: 'pusat_resolusi',
                    orderId: noRetur,
                  });
                  showToast(`${title} — ${body}`, 'info', {
                    actionLabel: 'Lihat Retur →',
                    onClick: () =>
                      navigateToNotificationTargetRef.current({
                        page: 'pusat_resolusi',
                        orderId: noRetur,
                      }),
                  });
                }
              }
            }
          } catch {}
        }

        // Cek Pengajuan Lembur, Ijin/Cuti, dan Ijin Pulang Cepat KHUSUS Akun `warehouse` ONLY
        if (userIsWarehouseOnly) {
          try {
            const lmbQuery = deltaSinceIso
              ? `select=*&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=10`
              : 'select=*&order=created_at.desc&limit=8';
            const latestLembur = await supabaseFetch<any[]>('lembur', 'GET', null, lmbQuery);
            if (isMounted && Array.isArray(latestLembur)) {
              for (const r of [...latestLembur].reverse()) {
                const rawId = String(r.id || '').trim().toUpperCase();
                const key = `HR_LMB_${rawId}`;
                if (!rawId || notifiedOrderIdsRef.current.has(key)) continue;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  handleIncomingHrRequestRef.current('lembur', r);
                } else {
                  notifiedOrderIdsRef.current.add(key);
                }
              }
            }
          } catch {}

          try {
            const cutiQuery = deltaSinceIso
              ? `select=*&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=10`
              : 'select=*&order=created_at.desc&limit=8';
            const latestCuti = await supabaseFetch<any[]>('perijinan_cuti', 'GET', null, cutiQuery);
            if (isMounted && Array.isArray(latestCuti)) {
              for (const r of [...latestCuti].reverse()) {
                const rawId = String(r.id || '').trim().toUpperCase();
                const key = `HR_CUTI_${rawId}`;
                if (!rawId || notifiedOrderIdsRef.current.has(key)) continue;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  handleIncomingHrRequestRef.current('perijinan_cuti', r);
                } else {
                  notifiedOrderIdsRef.current.add(key);
                }
              }
            }
          } catch {}

          try {
            const ipcQuery = deltaSinceIso
              ? `select=*&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=8`
              : 'select=*&order=created_at.desc&limit=6';
            const latestIpc = await supabaseFetch<any[]>('izin_pulang_cepat', 'GET', null, ipcQuery);
            if (isMounted && Array.isArray(latestIpc)) {
              for (const r of [...latestIpc].reverse()) {
                const rawId = String(r.id || '').trim().toUpperCase();
                const key = `HR_IPA_${rawId}`;
                const ipcDedupKey = `HR_IPC_${String(r.nik || '').trim().toUpperCase()}_${String(r.tanggal || '').slice(0, 10)}`;
                if (!rawId || notifiedOrderIdsRef.current.has(key) || notifiedOrderIdsRef.current.has(ipcDedupKey)) continue;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  handleIncomingHrRequestRef.current('izin_pulang_cepat', r);
                } else {
                  notifiedOrderIdsRef.current.add(key);
                  notifiedOrderIdsRef.current.add(ipcDedupKey);
                }
              }
            }
          } catch {}
        }

        // Cek Antrian Hitung Ulang Fisik baru untuk Admin & Produksi
        if (userCanProduksi) {
          try {
            const docRows = await supabaseFetch<any[]>(
              'wms_system_docs',
              'GET',
              null,
              'select=content,updated_at&section_id=eq.recount_active_queue&limit=1'
            );
            if (isMounted && Array.isArray(docRows) && docRows.length > 0 && docRows[0]?.content) {
              let parsedMap = docRows[0].content;
              if (typeof parsedMap === 'string') {
                try {
                  parsedMap = JSON.parse(parsedMap);
                } catch {
                  parsedMap = {};
                }
              }
              if (parsedMap && typeof parsedMap === 'object') {
                for (const [code, val] of Object.entries(parsedMap)) {
                  const cleanCode = String(code || '').trim().toUpperCase();
                  if (!cleanCode || cleanCode === 'DUMMY') continue;
                  const dedupKey = `RECOUNT_${cleanCode}`;
                  if (notifiedOrderIdsRef.current.has(dedupKey)) continue;
                  const meta = typeof val === 'object' && val !== null ? (val as any) : {};
                  const addedTs = meta.added_at ? new Date(meta.added_at).getTime() : nowMs;
                  if (isNaN(addedTs) || Math.abs(nowMs - addedTs) <= MAX_AGE_MS) {
                    handleIncomingRecountRef.current({
                      kode_produksi: cleanCode,
                      catatan_petunjuk: meta.catatan_petunjuk || (typeof val === 'string' ? val : ''),
                      added_by: meta.added_by || 'Buyer / Auditor',
                      created_at: meta.added_at,
                    });
                  } else {
                    notifiedOrderIdsRef.current.add(dedupKey);
                  }
                }
              }
            }
          } catch {}
        }

        // Cek Permintaan Peminjaman Sementara (SPS) baru untuk Admin & Picker
        if (userIsAdmin || userIsPicker) {
          try {
            const spsQuery = deltaSinceIso
              ? `select=id,no_peminjaman,pic,keperluan,sku,nama_produk,qty,created_at&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=15`
              : 'select=id,no_peminjaman,pic,keperluan,sku,nama_produk,qty,created_at&order=created_at.desc&limit=20';

            const latestSps = await supabaseFetch<any[]>(
              'peminjaman',
              'GET',
              null,
              spsQuery
            );
            if (isMounted && Array.isArray(latestSps) && latestSps.length > 0) {
              const spsGroups = new Map<string, any>();
              for (const r of latestSps) {
                const noSps = String(r.no_peminjaman || '').trim().toUpperCase();
                if (!noSps) continue;
                if (!spsGroups.has(noSps)) {
                  spsGroups.set(noSps, {
                    no_peminjaman: noSps,
                    pic: r.pic || 'Divisi Live / Studio',
                    keperluan: r.keperluan || 'Peminjaman SPS',
                    created_at: r.created_at,
                    skuCount: 0,
                    totalQty: 0,
                  });
                }
                const g = spsGroups.get(noSps)!;
                g.skuCount += 1;
                g.totalQty += Number(r.qty) || 1;
              }
              for (const g of Array.from(spsGroups.values()).reverse()) {
                if (notifiedOrderIdsRef.current.has(g.no_peminjaman)) continue;
                const rowTs = g.created_at ? new Date(g.created_at).getTime() : nowMs;
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  handleIncomingSpsRef.current(g);
                } else {
                  notifiedOrderIdsRef.current.add(g.no_peminjaman);
                }
              }
            }
          } catch {}
        }

        // Cek Tugas Picking baru (picking_list) untuk Admin & Picker (menjamin notifikasi masuk walau WebSocket sempat suspend di HP)
        if (userIsAdmin || userIsPicker) {
          try {
            const pickingQuery = deltaSinceIso
              ? `select=id,no_sj,tujuan,nama_produk,sku,created_at&created_at=gt.${encodeURIComponent(deltaSinceIso)}&order=created_at.desc&limit=25`
              : 'select=id,no_sj,tujuan,nama_produk,sku,created_at&order=created_at.desc&limit=15';

            const latestPicking = await supabaseFetch<any[]>(
              'picking_list',
              'GET',
              null,
              pickingQuery
            );
            if (isMounted && Array.isArray(latestPicking) && latestPicking.length > 0) {
              const pickingGroups = new Map<string, any>();
              for (const r of latestPicking) {
                const noSj = String(r.no_sj || '').trim().toUpperCase();
                if (!noSj) continue;
                if (!pickingGroups.has(noSj)) {
                  pickingGroups.set(noSj, {
                    no_sj: noSj,
                    tujuan: r.tujuan || 'Gudang',
                    created_at: r.created_at,
                    skuCount: 0,
                  });
                }
                const g = pickingGroups.get(noSj)!;
                g.skuCount += 1;
              }
              for (const g of Array.from(pickingGroups.values()).reverse()) {
                if (notifiedOrderIdsRef.current.has(g.no_sj)) continue;
                const rowTs = g.created_at ? new Date(g.created_at).getTime() : nowMs;
                notifiedOrderIdsRef.current.add(g.no_sj);
                if (isNaN(rowTs) || Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                  playNewTaskChime();
                  vibrateDevice([250, 100, 250, 100, 450]);
                  showPushNotification('📋 Tugas Picking Baru Masuk!', {
                    body: `SJ #${g.no_sj} (${g.skuCount} item) - Tujuan: ${g.tujuan}. Buka untuk mulai picking.`,
                    tag: `picking-task-${g.no_sj}`,
                    page: 'picking_tasks',
                    subTab: 'picking_tasks',
                  });
                  showToast(
                    `📋 Tugas Picking Baru Masuk: SJ #${g.no_sj} (${g.skuCount} item) - Tujuan: ${g.tujuan}`,
                    'info',
                    {
                      actionLabel: 'Buka Picking →',
                      onClick: () =>
                        navigateToNotificationTargetRef.current({
                          page: 'picking_tasks',
                          subTab: 'picking_tasks',
                        }),
                    }
                  );
                  setNewPickingTaskAlert({
                    no_sj: g.no_sj,
                    count: g.skuCount,
                    tujuan: g.tujuan,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          } catch {}
        }

        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        setLastOrderCheckTimestamp(nowMs);
        syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));
      } catch {}
    };

    // 1. Seed existing order & SPS IDs (tapi JANGAN telan pesanan/SPS yang masuk saat aplikasi ditutup!)
    const seedExistingOrders = async () => {
      const prevLastCheckTs = getLastOrderCheckTimestamp();
      const hasPersistedHistory = notifiedOrderIdsRef.current.size > 0 && prevLastCheckTs !== null;

      try {
        if (userIsAdmin) {
          const recent = await supabaseFetch<any[]>(
            'manual_shipment',
            'GET',
            null,
            'select=id,no_pesanan,no_transaksi_customer,created_at&order=created_at.desc&limit=30'
          );
          if (!isMounted) return;
          if (Array.isArray(recent)) {
            if (!hasPersistedHistory) {
              recent.forEach(recordOrderKeys);
            } else {
              for (const r of recent) {
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                if (rowTs > 0 && rowTs < prevLastCheckTs) {
                  recordOrderKeys(r);
                }
              }
            }
          }

          if (!hasPersistedHistory) {
            try {
              const recentRetur = await supabaseFetch<any[]>(
                'retur_barang',
                'GET',
                null,
                'select=no_retur,created_at&order=created_at.desc&limit=15'
              );
              if (Array.isArray(recentRetur)) {
                recentRetur.forEach((r) => {
                  const nr = String(r.no_retur || '').trim().toUpperCase();
                  if (nr) notifiedOrderIdsRef.current.add(nr);
                });
              }
            } catch {}
          }
        }

        if (userIsCustomerService && !hasPersistedHistory) {
          try {
            const recentCsRetur = await supabaseFetch<any[]>(
              'retur_barang',
              'GET',
              null,
              'select=no_retur,status,no_resi,no_sj_gudang_retur&order=updated_at.desc&limit=20'
            );
            if (Array.isArray(recentCsRetur)) {
              recentCsRetur.forEach((r) => {
                const nr = String(r.no_retur || '').trim().toUpperCase();
                if (!nr) return;
                const status = String(r.status || '').trim().toLowerCase();
                const resi = String(r.no_resi || '').trim();
                const sj = String(r.no_sj_gudang_retur || '').trim();
                if (resi) notifiedOrderIdsRef.current.add(`RTR_UPD_${nr}_RESI_${resi}`);
                if (sj) notifiedOrderIdsRef.current.add(`RTR_UPD_${nr}_SJ_${sj}`);
                if (status) notifiedOrderIdsRef.current.add(`RTR_UPD_${nr}_STATUS_${status}`);
              });
            }
          } catch {}
        }

        if (userCanProduksi) {
          try {
            const docRows = await supabaseFetch<any[]>(
              'wms_system_docs',
              'GET',
              null,
              'select=content,updated_at&section_id=eq.recount_active_queue&limit=1'
            );
            if (Array.isArray(docRows) && docRows.length > 0 && docRows[0]?.content) {
              let parsedMap = docRows[0].content;
              if (typeof parsedMap === 'string') {
                try {
                  parsedMap = JSON.parse(parsedMap);
                } catch {
                  parsedMap = {};
                }
              }
              if (parsedMap && typeof parsedMap === 'object') {
                for (const [code, val] of Object.entries(parsedMap)) {
                  const cleanCode = String(code || '').trim().toUpperCase();
                  if (!cleanCode) continue;
                  const meta = typeof val === 'object' && val !== null ? (val as any) : {};
                  const rowTs = meta.added_at ? new Date(meta.added_at).getTime() : 0;
                  if (!hasPersistedHistory || (rowTs > 0 && prevLastCheckTs && rowTs < prevLastCheckTs)) {
                    notifiedOrderIdsRef.current.add(`RECOUNT_${cleanCode}`);
                  }
                }
              }
            }
          } catch {}
        }

        if (userIsWarehouseOnly) {
          try {
            const [recentLembur, recentCuti, recentIpc] = await Promise.all([
              supabaseFetch<any[]>('lembur', 'GET', null, 'select=*&order=created_at.desc&limit=25').catch(() => []),
              supabaseFetch<any[]>('perijinan_cuti', 'GET', null, 'select=*&order=created_at.desc&limit=25').catch(() => []),
              supabaseFetch<any[]>('izin_pulang_cepat', 'GET', null, 'select=*&order=created_at.desc&limit=20').catch(() => []),
            ]);

            if (Array.isArray(recentLembur)) {
              for (const r of recentLembur) {
                const key = `HR_LMB_${String(r.id || '').trim().toUpperCase()}`;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                if (!hasPersistedHistory || (rowTs > 0 && prevLastCheckTs && rowTs < prevLastCheckTs)) {
                  if (r.id) notifiedOrderIdsRef.current.add(key);
                }
              }
            }
            if (Array.isArray(recentCuti)) {
              for (const r of recentCuti) {
                const key = `HR_CUTI_${String(r.id || '').trim().toUpperCase()}`;
                const rawTglMulai = String(r.tgl_mulai || r.tanggal_mulai || '').slice(0, 10);
                const ipcDedupKey = `HR_IPC_${String(r.nik || '').trim().toUpperCase()}_${rawTglMulai}`;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                if (!hasPersistedHistory || (rowTs > 0 && prevLastCheckTs && rowTs < prevLastCheckTs)) {
                  if (r.id) notifiedOrderIdsRef.current.add(key);
                  if (String(r.jenis || '').toLowerCase().includes('pulang')) {
                    notifiedOrderIdsRef.current.add(ipcDedupKey);
                  }
                }
              }
            }
            if (Array.isArray(recentIpc)) {
              for (const r of recentIpc) {
                const key = `HR_IPA_${String(r.id || '').trim().toUpperCase()}`;
                const ipcDedupKey = `HR_IPC_${String(r.nik || '').trim().toUpperCase()}_${String(r.tanggal || '').slice(0, 10)}`;
                const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                if (!hasPersistedHistory || (rowTs > 0 && prevLastCheckTs && rowTs < prevLastCheckTs)) {
                  if (r.id) {
                    notifiedOrderIdsRef.current.add(key);
                    notifiedOrderIdsRef.current.add(ipcDedupKey);
                  }
                }
              }
            }
          } catch {}
        }

        if (userIsAdmin || userIsPicker) {
          try {
            const recentSps = await supabaseFetch<any[]>(
              'peminjaman',
              'GET',
              null,
              'select=no_peminjaman,created_at&order=created_at.desc&limit=30'
            );
            if (Array.isArray(recentSps)) {
              if (!hasPersistedHistory) {
                recentSps.forEach((r) => {
                  const ns = String(r.no_peminjaman || '').trim().toUpperCase();
                  if (ns) notifiedOrderIdsRef.current.add(ns);
                });
              } else {
                for (const r of recentSps) {
                  const ns = String(r.no_peminjaman || '').trim().toUpperCase();
                  const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                  if (ns && rowTs > 0 && rowTs < prevLastCheckTs) {
                    notifiedOrderIdsRef.current.add(ns);
                  }
                }
              }
            }
          } catch {}
        }

        if (userIsAdmin || userIsPicker) {
          try {
            const recentPicking = await supabaseFetch<any[]>(
              'picking_list',
              'GET',
              null,
              'select=no_sj,created_at&order=created_at.desc&limit=30'
            );
            if (Array.isArray(recentPicking)) {
              if (!hasPersistedHistory) {
                recentPicking.forEach((r) => {
                  const ns = String(r.no_sj || '').trim().toUpperCase();
                  if (ns) notifiedOrderIdsRef.current.add(ns);
                });
              } else {
                for (const r of recentPicking) {
                  const ns = String(r.no_sj || '').trim().toUpperCase();
                  const rowTs = r.created_at ? new Date(r.created_at).getTime() : 0;
                  if (ns && rowTs > 0 && rowTs < prevLastCheckTs) {
                    notifiedOrderIdsRef.current.add(ns);
                  }
                }
              }
            }
          } catch {}
        }

        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        if (!hasPersistedHistory) {
          setLastOrderCheckTimestamp(Date.now());
        }
        syncNotifiedOrdersToServiceWorker(Array.from(notifiedOrderIdsRef.current));
        isSeeded = true;

        // Jika ada pesanan atau SPS yang masuk saat aplikasi ditutup, langsung cek & bunyikan sekarang!
        if (hasPersistedHistory) {
          checkNewStoreOrdersDelta();
        }
      } catch {
        isSeeded = true;
      }
    };

    seedExistingOrders();

    // Polling responsif setiap 45 detik (pause otomatis saat tab hidden untuk hemat egress)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkNewStoreOrdersDelta();
      }
    }, 45000);
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        setNotificationPermission(getNotificationPermissionStatus());
        checkNewStoreOrdersDelta(); // Catch-up instan saat layar dibuka kembali
      } else {
        void triggerServiceWorkerCheckNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('focus', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('pointerdown', handleFirstGesturePermission);
      window.removeEventListener('wms_inapp_notification_click', handleInAppNotifClick);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('focus', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [session, showToast]);

  const handleLogin = async (user: string, pass: string) => {
    const res = await verifySupabaseLogin(user, pass);
    if (res.success && res.token) {
      const sharedGasEndpoint = getStoredGasEndpoint();
      const resolvedName = res.name || getUserPersonName(res.user || user) || res.user || user;
      const newSession: UserSession = {
        token: res.token,
        username: res.user || user,
        name: resolvedName,
        role: res.role || 'Operator',
        permissions: res.permissions,
        nik: res.nik,
        store_code: res.store_code,
        store_name: res.store_name,
        no_hp: res.no_hp,
        email: res.email,
        endpointUrl: sharedGasEndpoint,
      };
      setSession(newSession);
      localStorage.setItem('wms_session_token', res.token);
      localStorage.setItem('wms_session_username', res.user || user);
      localStorage.setItem('wms_session_name', resolvedName);
      localStorage.setItem('wms_user_role', res.role || 'Operator');
      if (res.store_code) {
        localStorage.setItem('wms_user_store_code', res.store_code);
      } else {
        localStorage.removeItem('wms_user_store_code');
      }
      if (res.store_name) {
        localStorage.setItem('wms_user_store_name', res.store_name);
      } else {
        localStorage.removeItem('wms_user_store_name');
      }
      if (sharedGasEndpoint) {
        localStorage.setItem('wms_endpoint_url', sharedGasEndpoint);
      }
      if (res.nik) {
        localStorage.setItem('wms_user_nik', res.nik);
      } else {
        localStorage.removeItem('wms_user_nik');
      }
      if (res.permissions) {
        localStorage.setItem('wms_user_permissions', JSON.stringify(res.permissions));
      } else {
        localStorage.removeItem('wms_user_permissions');
      }
      
      // Set session expiry to 7 days from now
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem('wms_session_expiry', expiry.toString());

      // Navigate to the user's url page or primary allowed module page
      const pageFromUrl = getPageFromUrl(newSession);
      const firstPage = normalizeConsolidatedPage(
        canAccessPage(newSession, pageFromUrl) ? pageFromUrl : getDefaultPageForSession(newSession)
      );
      prevUsernameRef.current = newSession.username;
      setCompanionPage(null);
      setOpenDesktopTabs([firstPage]);
      setVisitedPages(new Set([firstPage]));
      setActivePage(firstPage);

      showToast(`Selamat datang, ${resolvedName} (${res.role || 'Operator'})!`, 'success');
      playSuccessBeep();
      vibrateDevice(50);
      requestScreenWakeLock();
    } else {
      throw new Error(res.message || 'Login gagal!');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    void unsubscribeFromWebPush();
    liveChatManager.teardown();
    localStorage.removeItem('wms_session_token');
    localStorage.removeItem('wms_session_username');
    localStorage.removeItem('wms_session_name');
    localStorage.removeItem('wms_user_role');
    localStorage.removeItem('wms_session_expiry');
    localStorage.removeItem('wms_user_permissions');
    localStorage.removeItem('wms_user_nik');
    localStorage.removeItem('wms_user_store_code');
    localStorage.removeItem('wms_user_store_name');
    localStorage.removeItem('wms_last_active_page');
    prevUsernameRef.current = null;
    setSession(null);
    setScannedData([]);
    setCompanionPage(null);
    setOpenDesktopTabs(['dashboard']);
    setVisitedPages(new Set(['dashboard']));
    setActivePage('dashboard');
    setIsSettingsOpen(false);
    setNewPickingTaskAlert(null);
    setNewManualShipmentAlert(null);
    releaseScreenWakeLock();
    if (!isRunningInIframe()) {
      try {
        if (typeof window !== 'undefined') {
          window.history.pushState({ page: 'dashboard' }, '', '/');
        }
      } catch {
        // In sandboxed iframes, pushState may be restricted
      }
    }
    showToast('Berhasil keluar dari akun.', 'info');
  };

  // Notification permission requester & live test trigger
  const handleRequestNotification = async () => {
    if (needsIosHomeScreenInstall()) {
      showToast(
        "iPhone/iPad: ketuk tombol Bagikan (kotak panah) di Safari lalu pilih \"Tambah ke Layar Utama\", buka aplikasi dari ikon Layar Utama, lalu aktifkan notifikasi lagi (butuh iOS 16.4+).",
        'warning'
      );
      return;
    }
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      playNewTaskChime();
      vibrateDevice([200, 100, 200]);
      showToast('Notifikasi HP / Browser aktif! Mengirim tes notifikasi...', 'success');
      await showPushNotification('🔔 Notifikasi WMS Aktif (Gaya WhatsApp)!', {
        body: isSuperadmin(session)
          ? 'HP / Laptop Anda siap menerima bunyi & pop-up otomatis saat Pesanan Baru, Retur, atau Live Chat masuk.'
          : 'HP / Laptop Anda siap menerima bunyi & pop-up otomatis saat Pesan Live Chat atau Update Resi masuk.',
        tag: `wms-test-notif-${Date.now()}`,
        page: isSuperadmin(session) ? 'pesanan_saya' : 'live_chat',
        actions: [
          {
            action: 'chat_mark_read',
            title: '✓✓ Mengerti',
          },
        ],
      });
    } else {
      showToast(
        'Izin notifikasi belum diizinkan di browser Laptop/HP Anda. Silakan klik ikon gembok/pengaturan di sebelah URL lalu izinkan Notifications (Allow).',
        'warning'
      );
    }
  };

  // Handle Scanned Item
  const handleScannedItem = (rawText: string) => {
    const text = rawText.trim().toUpperCase();
    if (!text) return;

    // 1. Detect Category tag (#IN, #OUT, #SO) -> Just light up category indicator, do NOT add to scan list
    const isCatTag = /^#?(IN|OUT|SO|MASUK|KELUAR)(\s|:|$)/i.test(text);
    if (isCatTag) {
      let cat: CategoryType = 'ANOMALI';
      let explicitInvoice = '';
      
      if (/^#?(IN|MASUK)(\s|:|$)/i.test(text)) {
        cat = 'IN';
        const restIn = text.replace(/^#?(IN|MASUK)[:\s]*/i, '').trim();
        if (restIn && (restIn.startsWith('WA') || restIn.length > 5)) {
          explicitInvoice = restIn;
        } else if (restIn && !currentLocationRef.current && !/^[A-Z0-9_]{5,}$/i.test(restIn)) {
          const normIn = normalizeLokasi(restIn);
          setCurrentLocation(normIn);
          currentLocationRef.current = normIn;
        }
      } else if (/^#?(OUT|KELUAR)(\s|:|$)/i.test(text)) {
        cat = 'OUT';
        const restOut = text.replace(/^#?(OUT|KELUAR)[:\s]*/i, '').trim();
        if (restOut && (restOut.startsWith('WA') || restOut.length > 5)) {
          explicitInvoice = restOut;
        } else if (restOut && !currentLocationRef.current && !/^[A-Z0-9_]{5,}$/i.test(restOut)) {
          const normOut = normalizeLokasi(restOut);
          setCurrentLocation(normOut);
          currentLocationRef.current = normOut;
        }
      } else if (/^#?(SO|STOCK OPNAME|OPNAME)(\s|:|$)/i.test(text)) {
        cat = 'SO';
      }

      setCurrentCategory(cat);
      currentCategoryRef.current = cat;
      if (explicitInvoice) {
        setCurrentInvoice(explicitInvoice);
        currentInvoiceRef.current = explicitInvoice;
      }
      playCategoryBeep();
      vibrateDevice(60);
      showToast(`Kategori aktif: #${cat} (${cat === 'SO' ? 'Opname' : cat === 'IN' ? 'Masuk' : 'Keluar'})${explicitInvoice ? ` Invoice: ${explicitInvoice}` : ''}`, 'info');
      return;
    }

    // 2. Detect Location tag (#LOK xxx, LOK xxx, #LOK:xxx) -> Just light up location indicator, do NOT add to scan list
    if (text.startsWith('#LOK') || text.startsWith('LOK ') || text.startsWith('LOK:')) {
      const rawLoc = text.replace(/^#?LOK:?\s*/i, '').trim();
      const loc = normalizeLokasi(rawLoc);
      if (loc) {
        setCurrentLocation(loc);
        currentLocationRef.current = loc;
        playCategoryBeep();
        vibrateDevice(60);
        showToast(`Lokasi aktif: #${loc}`, 'info');
        return;
      }
    }

    // 3. Validasi Dini: Tolak scan jika Mode (#IN/#OUT/#SO) belum dipilih atau Lokasi kosong
    if (!currentCategoryRef.current || currentCategoryRef.current === 'ANOMALI') {
      playErrorBeep();
      vibrateDevice([150, 50, 150]);
      showToast('Wajib pilih mode scan terlebih dahulu (#IN, #OUT, atau #SO) sebelum scan barang!', 'error');
      return;
    }

    if (!currentLocationRef.current || currentLocationRef.current === 'DEFAULT' || currentLocationRef.current === 'ANOMALI') {
      playErrorBeep();
      vibrateDevice([150, 50, 150]);
      showToast('Wajib tentukan / pilih lokasi rak terlebih dahulu sebelum scan barang!', 'error');
      return;
    }

    // 3. Detect SKU Item
    let isInvalidSku = false;
    let productName = '';
    let size = '';

    const activeDatabase = productDatabaseRef.current.length > 0 ? productDatabaseRef.current : productDatabase;
    let found = activeDatabase.find((p) => p.k.toUpperCase() === text);
    if (!found) {
      // Fallback: partial match by SKU or Name (like Stok Lokasi)
      found = activeDatabase.find((p) => 
        p.k.toUpperCase().includes(text) || 
        (p.p && p.p.toUpperCase().includes(text)) ||
        (p.n && p.n.toUpperCase().includes(text))
      );
    }

    if (!found) {
      if (activeDatabase.length > 0) {
        isInvalidSku = true;
        playErrorBeep();
        vibrateDevice([100, 100, 100]);
        showToast(`Peringatan: SKU "${text}" tidak terdaftar!`, 'warning');
      } else {
        playSuccessBeep();
        vibrateDevice(40);
      }
    } else {
      productName = found.p;
      size = found.s || '';
      playSuccessBeep();
      vibrateDevice(40);
    }

    const catToMatch = currentCategoryRef.current;
    const locToMatch = currentLocationRef.current || (found ? found.lokasi || '' : '');

    if (!hasScannedSku && catToMatch === 'SO') {
      showToast('SKU discan dengan kategori default #SO (Opname).', 'info');
    }
    setHasScannedSku(true);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const textToMatch = found ? found.k : text;

    setScannedData((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.text === textToMatch && item.category === catToMatch && item.location === locToMatch
      );
      
      if (existingIdx >= 0) {
        const updatedItem = {
          ...prev[existingIdx],
          qty: (prev[existingIdx].qty || 1) + 1,
          time: timeStr
        };
        const newArr = [...prev];
        newArr.splice(existingIdx, 1);
        newArr.push(updatedItem);
        return newArr;
      } else {
        const newItem: ScannedItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: textToMatch,
          time: timeStr,
          isCategory: false,
          isLocation: false,
          isInvalidSku,
          productName,
          size,
          category: catToMatch,
          location: locToMatch,
          qty: 1,
        };
        return [...prev, newItem];
      }
    });
  };

  const handleRemoveItem = (id: string) => {
    setScannedData((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearAll = () => {
    if (!scannedData.length) return;
    showConfirmDialog(
      'Hapus Daftar Scan',
      'Hapus semua daftar hasil scan saat ini?',
      () => {
        setScannedData([]);
        showToast('Daftar scan dikosongkan.', 'info');
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    );
  };

  const handleSelectQuickCategory = (cat: CategoryType) => {
    setCurrentCategory(cat);
    currentCategoryRef.current = cat;
    playCategoryBeep();
    vibrateDevice(40);

    showToast(`Kategori aktif diubah ke #${cat} (${cat === 'SO' ? 'Opname' : cat === 'IN' ? 'Masuk' : 'Keluar'})`, 'info');
  };

  const handleSelectQuickLocation = (loc: string) => {
    setCurrentLocation(loc);
    currentLocationRef.current = loc;
    playCategoryBeep();
    vibrateDevice(40);

    showToast(loc ? `Lokasi aktif diubah ke #${loc}` : 'Lokasi aktif dikosongkan', 'info');
  };

  const handleUpdateItemCategory = (id: string, newCat: CategoryType) => {
    setScannedData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category: newCat } : item))
    );
    playCategoryBeep();
    vibrateDevice(30);
    showToast(`Kategori item diubah ke #${newCat} (${newCat === 'SO' ? 'Opname' : newCat === 'IN' ? 'Masuk' : 'Keluar'})`, 'info');
  };

  const handleUpdateItemQty = (id: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(id);
      return;
    }
    setScannedData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
    );
  };

  const handleProcessImport = async (validRows: ImportRow[]) => {
    try {
      const logsToInsert: Parameters<typeof insertLogProduk>[0] = [];
      const soFisik: Record<string, Record<string, number>> = {};
      const waktuPesan = new Date();
      const personName = session?.name || getUserPersonName(session?.username) || 'Petugas';
      const operatorName = `${personName} | Import`;
      const invoiceBase = `IMP-${waktuPesan.getTime()}`;

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const line = row.sku.toUpperCase();
        const cType: CategoryType = row.tipe;
        const cLokasi = row.lokasi || 'DEFAULT';
        const ketText = row.keterangan || 'Hasil Import Data';
        
        if (cType === 'IN' || cType === 'OUT') {
          logsToInsert.push({
            type: cType,
            invoice: invoiceBase,
            sku: line,
            nama_produk: row.productName || line,
            size: '', // Since size isn't easily extracted from name, leave blank or lookup
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: row.qty,
            operator: operatorName,
            keterangan: ketText,
            created_at: waktuPesan.toISOString(),
          });
        } else if (cType === 'SO') {
          if (!soFisik[cLokasi]) soFisik[cLokasi] = {};
          soFisik[cLokasi][line] = (soFisik[cLokasi][line] || 0) + row.qty;
          
          logsToInsert.push({
            type: 'SO',
            invoice: invoiceBase,
            sku: line,
            nama_produk: row.productName || line,
            size: '',
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: row.qty,
            operator: operatorName,
            keterangan: ketText,
            created_at: waktuPesan.toISOString(),
          });
        }
      }

      if (logsToInsert.length > 0) {
        await insertLogProduk(logsToInsert);
      }

      const lokasis = Object.keys(soFisik);
      if (lokasis.length > 0) {
        const currentStock = await fetchStockForLocations(lokasis);
        const soQueueToInsert: Parameters<typeof insertStockOpnameQueue>[0] = [];

        lokasis.forEach((lokasi) => {
          const physicalCounts = soFisik[lokasi];
          const systemStockForLokasi = currentStock.filter(
            (s) => s.lokasi.toUpperCase() === lokasi.toUpperCase()
          );

          const allSkus = new Set([
            ...Object.keys(physicalCounts),
            ...systemStockForLokasi.map((s) => s.sku),
          ]);

          allSkus.forEach((sku) => {
            const qty_fisik = physicalCounts[sku] || 0;
            const sysRow = systemStockForLokasi.find(
              (s) => s.sku.toUpperCase() === sku.toUpperCase()
            );
            const qty_sistem = sysRow ? Number(sysRow.sisa_stok) : 0;
            const selisih = qty_fisik - qty_sistem;

            if (selisih === 0) return; // Skip if no difference

            soQueueToInsert.push({
              sesi_id: invoiceBase,
              tanggal: waktuPesan.toISOString(),
              sku,
              nama_produk: sysRow?.nama_produk || sku,
              size: sysRow?.size || '',
              lokasi,
              alasan: `Import Opname (${selisih > 0 ? `+${selisih}` : selisih})`,
              area: sysRow?.area || getAreaFromLokasi(lokasi),
              qty_sistem,
              qty_fisik,
              selisih,
              status: 'PENDING',
              jenis: 'Opname',
              operator: operatorName,
              invoice: invoiceBase,
            });
          });
        });

        if (soQueueToInsert.length > 0) {
          await insertStockOpnameQueue(soQueueToInsert);
        }
      }
    } catch (error: any) {
      console.error(error);
      throw new Error(error.message || 'Gagal menyimpan ke database Supabase');
    }
  };

  // Save to Supabase & Sheets
  const handleSaveData = async () => {
    if (scannedData.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      const ketText = keterangan.trim();

      const logsToInsert: Parameters<typeof insertLogProduk>[0] = [];
      const soFisik: Record<string, Record<string, number>> = {};

      const waktuPesan = new Date();
      const personName = session?.name || getUserPersonName(session?.username) || 'Petugas';
      const operatorName = `${personName} | Staging`;
      const invoiceBase = `WEB-${waktuPesan.getTime()}`;

      for (let i = 0; i < scannedData.length; i++) {
        const item = scannedData[i];
        if (!item || item.isCategory || item.isLocation) continue;

        const line = item.text.trim().toUpperCase();
        if (!line) continue;

        const cType: CategoryType = item.category || currentCategory;
        if (!cType || (cType as string) === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast(`Item "${line}" tidak memiliki mode scan valid (#IN/#OUT/#SO)! Mohon pilih mode terlebih dahulu.`, 'error');
          return;
        }

        const cLokasi = (item.location || currentLocation || '').trim();
        if (!cLokasi || cLokasi === 'DEFAULT' || cLokasi === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast(`Item "${line}" belum memiliki lokasi rak fisik yang valid! Mohon tentukan lokasi rak.`, 'error');
          return;
        }

        // Fix invoice base to use extracted explicit invoice if available
        const currentLineInvoice = currentInvoiceRef.current || `WEB-${waktuPesan.getTime()}`;

        if (cType === 'IN' || cType === 'OUT') {
          const pData = productDatabase.find((p) => p.k.toUpperCase() === line);
          logsToInsert.push({
            type: cType,
            invoice: currentLineInvoice,
            sku: line,
            nama_produk: pData ? pData.p : (item.productName || line),
            size: item.size || (pData ? pData.s : ''),
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: item.qty || 1,
            operator: operatorName,
            keterangan: ketText || `${cType} Staging Scan`,
            created_at: waktuPesan.toISOString(),
          });
        } else if (cType === 'SO') {
          if (!soFisik[cLokasi]) soFisik[cLokasi] = {};
          soFisik[cLokasi][line] = (soFisik[cLokasi][line] || 0) + (item.qty || 1);

          // Add to log_produk for SO scan as well
          const pData = productDatabase.find((p) => p.k.toUpperCase() === line);
          logsToInsert.push({
            type: 'SO',
            invoice: currentLineInvoice,
            sku: line,
            nama_produk: pData ? pData.p : (item.productName || line),
            size: item.size || (pData ? pData.s : ''),
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: item.qty || 1,
            operator: operatorName,
            keterangan: ketText || 'Stock Opname Scan',
            created_at: waktuPesan.toISOString(),
          });
        }
      }

      // 1. Eksekusi Mutasi Langsung (#IN / #OUT) ke Supabase
      if (logsToInsert.length > 0) {
        await insertLogProduk(logsToInsert);
      }

      // 2. Eksekusi Stock Opname (#SO) ke Supabase
      const lokasis = Object.keys(soFisik);
      if (lokasis.length > 0) {
        const currentStock = await fetchStockForLocations(lokasis);
        const soQueueToInsert: Parameters<typeof insertStockOpnameQueue>[0] = [];

        lokasis.forEach((lokasi) => {
          const physicalCounts = soFisik[lokasi];
          const systemStockForLokasi = currentStock.filter(
            (s) => s.lokasi.toUpperCase() === lokasi.toUpperCase()
          );

          const allSkus = new Set([
            ...Object.keys(physicalCounts),
            ...systemStockForLokasi.map((s) => s.sku),
          ]);

          allSkus.forEach((sku) => {
            const qty_fisik = physicalCounts[sku] || 0;
            const sysRow = systemStockForLokasi.find(
              (s) => s.sku.toUpperCase() === sku.toUpperCase()
            );
            const qty_sistem = sysRow ? Number(sysRow.sisa_stok) : 0;
            const selisih = qty_fisik - qty_sistem;

            // OPTIMIZATION: Lewati jika fisik == sistem (selisih 0), tidak perlu antrean adjustment approval
            if (selisih === 0) return;

            const pData = productDatabase.find((p) => p.k.toUpperCase() === sku.toUpperCase());
            soQueueToInsert.push({
              sesi_id: invoiceBase,
              tanggal: waktuPesan.toISOString(),
              sku,
              nama_produk: pData?.p || sysRow?.nama_produk || sku,
              size: sysRow?.size || pData?.s || '',
              lokasi,
              alasan: ketText
                ? `Pending Adjustment - ${ketText}`
                : `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`,
              area: sysRow?.area || getAreaFromLokasi(lokasi),
              qty_sistem,
              qty_fisik,
              selisih,
              status: 'PENDING',
              jenis: 'Opname',
              operator: operatorName,
              invoice: invoiceBase,
            });
          });
        });

        if (soQueueToInsert.length > 0) {
          await insertStockOpnameQueue(soQueueToInsert);
        }
      }

      playSaveSuccessChime();
      vibrateDevice([100, 50, 100]);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.85 },
          colors: ['var(--theme-500)', '#ffa726', '#ffffff'],
        });
      } catch {}

      showToast('Data scan berhasil disimpan ke Database!', 'success');
      showPushNotification('✅ Data Scan Tersimpan', {
        body: `Berhasil mencatat ${scannedData.length} item scan ke Database.`,
      });

      setScannedData([]);
      setKeterangan('');
      setCurrentCategory('');
      currentCategoryRef.current = '';
      setCurrentInvoice('');
      setCurrentLocation('');
      setHasScannedSku(false);
    } catch (err: unknown) {
      console.error(err);
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan atau Database Error';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const activeLocations = Array.from(
    new Set(
      [
        currentLocation,
        ...scannedData.map((i) => i.location).filter(Boolean),
        ...scannedData
          .filter((i) => i.isLocation)
          .map((i) => i.text.replace(/^#?LOK:?\s*/i, '').trim()),
      ].filter(Boolean) as string[]
    )
  );

  return (
    <div className="min-h-screen w-full max-w-[100vw] flex flex-row bg-[#f4f6f8] dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors selection:bg-primary-500 selection:text-white">
      {/* Google Maps Quota Warning Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm w-full">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{" "}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{" "}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Floating Incoming Manual Shipment (Store Order) Banner — Tampil di semua halaman Laptop & HP Admin */}
      {newManualShipmentAlert && isSuperadmin(session) && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="Notifikasi Pesanan Store Baru"
          className="fixed bottom-36 sm:bottom-24 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div
            onClick={() => {
              navigateToNotificationTarget({
                page: 'pesanan_saya',
                subTab: 'manual_shipment',
                manualSubTab: 'rekap',
                orderId: newManualShipmentAlert.orderId,
                isAlter: newManualShipmentAlert.isAlter,
              });
            }}
            className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-3.5 rounded-2xl shadow-xl shadow-indigo-600/30 border border-indigo-300/40 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>
                    {newManualShipmentAlert.isAlter
                      ? 'Form Alter / Repair Store Masuk!'
                      : 'Pesanan Baru Store Masuk!'}
                  </span>
                </div>
                <div className="text-sm font-black truncate">
                  {newManualShipmentAlert.storeName} • #{newManualShipmentAlert.orderId}
                </div>
                <div className="text-[11px] text-indigo-100 truncate font-medium">
                  Customer: {newManualShipmentAlert.customerName} ({newManualShipmentAlert.itemCount} pcs •{' '}
                  {newManualShipmentAlert.jasaKirim})
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToNotificationTarget({
                    page: 'pesanan_saya',
                    subTab: 'manual_shipment',
                    manualSubTab: 'rekap',
                    orderId: newManualShipmentAlert.orderId,
                    isAlter: newManualShipmentAlert.isAlter,
                  });
                }}
                className="px-3 py-1.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-black shadow-sm cursor-pointer transition-all active:scale-95"
              >
                Lihat Rekap
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNewManualShipmentAlert(null);
                }}
                aria-label="Tutup pemberitahuan pesanan baru"
                className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Floating Incoming Picking Task Banner */}
      {newPickingTaskAlert && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="Notifikasi Tugas Picking Baru"
          className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div
            onClick={() => {
              navigateToNotificationTarget({
                page: 'picking_tasks',
                subTab: 'picking_tasks',
              });
            }}
            className="bg-gradient-to-r from-primary-500 to-amber-600 text-white p-3.5 rounded-2xl shadow-xl shadow-primary-500/30 border border-orange-300/40 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-orange-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Tugas Picking Masuk!</span>
                </div>
                <div className="text-sm font-black truncate">
                  SJ #{newPickingTaskAlert.no_sj} ({newPickingTaskAlert.count} Item)
                </div>
                <div className="text-[11px] text-orange-100 truncate font-medium">
                  Tujuan: {newPickingTaskAlert.tujuan}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToNotificationTarget({
                    page: 'picking_tasks',
                    subTab: 'picking_tasks',
                  });
                }}
                className="px-3 py-1.5 bg-white text-primary-500 hover:bg-orange-50 rounded-xl text-xs font-black shadow-sm cursor-pointer transition-all active:scale-95"
              >
                Buka
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNewPickingTaskAlert(null);
                }}
                aria-label="Tutup pemberitahuan tugas picking baru"
                className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Login Modal Overlay */}
      <LoginModal
        onOpenThemePicker={() => setIsThemePickerOpen(true)}
        isOpen={!session}
        onLogin={handleLogin}
      />

      {/* Modern Collapsible Sidebar (Mobile Drawer + Desktop Sidebar) */}
      <Sidebar
        onSessionUpdate={(patch) => setSession((prev) => (prev ? { ...prev, ...patch } : prev))}
        onOpenThemePicker={() => setIsThemePickerOpen(true)}
        session={session}
        activePage={activePage}
        onSelectPage={handleSelectPage}
        companionPage={isDesktopViewport ? companionPage : null}
        onOpenCompanion={isDesktopViewport ? handleOpenCompanion : undefined}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotification}
        isRealtimeConnected={isRealtimeConnected}
        onOpenSettings={handleOpenSettings}
        onOpenApkModal={() => setIsApkModalOpen(true)}
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onLogout={handleLogout}
        totalScannedCount={scannedData.length}
        hasNewPickingAlert={!!newPickingTaskAlert}
        hasNewPesananAlert={!!newManualShipmentAlert}
      />

      {/* Main App Container (Page Content) */}
      <div className="flex-1 min-w-0 max-w-full flex flex-col min-h-screen">
        {/* Desktop PWA Hint Banner (Shown on PC when opened in regular browser tab) */}
        <div className="print:hidden">
          <DesktopPwaBanner onOpenInstallModal={() => setIsApkModalOpen(true)} />
          {/* Offline Connection & Work Protection Banner */}
          <OfflineProtectionBar onNotify={(msg, type) => showToast(msg, type)} />

          {/* Push Notification Activation Prompt Bar (Semua User untuk Live Chat & Pesanan) */}
          {session &&
            isNotificationSupported() &&
            notificationPermission !== 'granted' &&
            !dismissedNotifPrompt && (
              <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800/70 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 animate-bounce">
                    <BellRing className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    <strong>Notifikasi HP / Browser Belum Aktif:</strong> Aktifkan agar muncul pop-up &amp; nada dering layaknya WhatsApp saat ada{' '}
                    <strong>
                      {isSuperadmin(session)
                        ? 'Pesanan Baru Store, Tiket Retur, atau Pesan Live Chat masuk'
                        : 'Pesan Live Chat / Ruang Diskusi atau Update Resi masuk'}
                    </strong>
                    .
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleRequestNotification}
                    className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    Aktifkan Notifikasi HP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDismissedNotifPrompt(true);
                      try {
                        sessionStorage.setItem('wms_dismiss_notif_prompt', 'true');
                      } catch {}
                    }}
                    className="p-1 text-amber-700 dark:text-amber-400 hover:opacity-75 cursor-pointer"
                    title="Sembunyikan sementara"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Sticky Mobile Top Header Bar (< 1024px) — 100% Untouched for Mobile */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-3 sm:px-4 py-2 bg-white/95 dark:bg-[#101726]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-2xs print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-1.5 -ml-1 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700/60 shrink-0"
              title="Buka Menu Navigasi"
              aria-label="Buka Menu Navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight truncate">Chocochips</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/60 shrink-0 truncate max-w-[130px]">
                {activePage.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Tombol Notification Hub di Header Mobile */}
            {session && (
              <NotificationHubButton
                onClick={() => setIsNotificationHubOpen(true)}
                username={session.username}
                compact
              />
            )}
            {/* Tombol AI di Header Mobile (Khusus Superadmin & Whitelisted User) */}
            {userCanAccessAi && (
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 via-indigo-600 to-primary-600 text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Buka Asisten AI Pintar WMS"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI</span>
              </button>
            )}
            {session && (
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 truncate max-w-[120px]">
                {session.name || getUserPersonName(session.username) || session.username}
              </span>
            )}
          </div>
        </header>

        {/* Desktop-Only Multitasking Tab Bar & Companion Trigger (>= 1024px) */}
        {isDesktopViewport && session && (
          <DesktopWorkspaceTabBar
            session={session}
            activePage={activePage}
            openTabs={openDesktopTabs}
            companionPage={companionPage}
            onSelectTab={handleSelectPage}
            onCloseTab={handleCloseDesktopTab}
            onOpenCompanion={handleOpenCompanion}
            onOpenAiModal={userCanAccessAi ? () => setIsAiModalOpen(true) : undefined}
            onOpenNotificationHub={() => setIsNotificationHubOpen(true)}
            maxKeepAliveTabs={MAX_KEEP_ALIVE_TABS}
          />
        )}

        {/* Main Content Area + Optional Desktop Companion Drawer */}
        <div className="flex-1 flex flex-row min-w-0 w-full max-w-full items-start">
          <main className={`flex-1 min-w-0 ${activePage === 'live_chat' ? 'pb-2 sm:pb-4' : 'pb-16 sm:pb-8'} p-2 sm:p-4 lg:p-6 w-full max-w-full`}>
            {session && !canAccessPage(session, activePage) ? (
              <div className="min-h-[60vh] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center shadow-lg space-y-4">
                  <div className="w-14 h-14 bg-primary-100 dark:bg-primary-950/60 rounded-2xl flex items-center justify-center mx-auto text-primary-600 dark:text-primary-400">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Akses Halaman Dibatasi
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Akun Anda (<span className="font-bold text-slate-700 dark:text-slate-200">{session.name || session.username}</span> - Role: <span className="font-extrabold text-primary-500">{session.role}</span>) tidak memiliki izin untuk mengakses halaman ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage(getDefaultPageForSession(session))}
                    className="px-4 py-2.5 bg-primary-500 text-white rounded-xl text-xs font-extrabold hover:bg-primary-600 transition-colors cursor-pointer"
                  >
                    Buka Modul Utama Anda
                  </button>
                </div>
              </div>
            ) : (
              <ErrorBoundary fallbackTitle="Kendala Memuat Halaman" onReset={() => window.location.reload()}>
                <React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳</span></div>}>
                  {(isDesktopViewport
                    ? openDesktopTabs.filter((p) => p !== companionPage && (!session || canAccessPage(session, p)))
                    : [activePage]
                  ).map((pageKey) => {
                    const isVisible = pageKey === activePage;
                    return (
                      <div
                        key={`${session?.username || 'anon'}:${pageKey}`}
                        className={isVisible ? 'block w-full' : 'hidden'}
                        aria-hidden={!isVisible}
                      >
                        {pageKey === 'dashboard' && (
                          <DashboardView
                            session={session}
                            onNavigate={(page, subTab) => {
                              if (page === 'agenda' && subTab) setAgendaInitialTab(subTab as any);
                              if (page === 'loading_dock' && subTab) setLoadingDockInitialTab(subTab as any);
                              if (page === 'inventory' && subTab) setInventoryInitialTab(subTab as any);
                              handleSelectPage(page as any);
                            }}
                            productCatalog={productDatabase}
                            currentLocations={activeLocations}
                            onShowToast={showToast}
                          />
                        )}
                        {pageKey === 'packing' && <PackingView />}
                        {pageKey === 'agenda' && (
                          <AgendaView
                            session={session}
                            onShowToast={showToast}
                            initialTab={agendaInitialTab}
                          />
                        )}
                        {pageKey === 'produksi' && (
                          <ProduksiView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                          />
                        )}
                        {pageKey === 'trello_up' && (
                          <TrelloView
                            session={session}
                            productCatalog={productDatabase}
                            onNotify={showToast}
                          />
                        )}
                        {(pageKey === 'loading_dock' || pageKey === 'picking_tasks') && (
                          <LoadingDockView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                            initialTab={pageKey === 'picking_tasks' ? 'picking_tasks' : loadingDockInitialTab}
                            hasNewPickingAlert={!!newPickingTaskAlert}
                            onClearPickingAlert={() => setNewPickingTaskAlert(null)}
                          />
                        )}
                        {(pageKey === 'inventory' || pageKey === 'operasi_stok' || pageKey === 'scanner' || pageKey === 'mutasi_log') && (
                          <InventoryView
                            session={session}
                            currentLocations={activeLocations}
                            productCatalog={productDatabase}
                            onNotify={showToast}
                            onRefreshCatalog={loadProducts}
                            initialTab={
                              pageKey === 'operasi_stok' || pageKey === 'scanner'
                                ? 'scanner'
                                : pageKey === 'mutasi_log'
                                ? 'logs'
                                : inventoryInitialTab
                            }
                            scannedCount={scannedData.length}
                            onOpenImportModal={() => setIsImportModalOpen(true)}
                            scannerComponent={(layoutMode) => {
                              const inputCard = (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 rounded-t-xl">
                                    <div className="flex-1 min-w-0">
                                      <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setShowQuickTags((prev) => !prev)}
                                      className="py-1 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap shadow-2xs cursor-pointer select-none"
                                      title={showQuickTags ? 'Sembunyikan Pengaturan Tag' : 'Tampilkan Pengaturan Tag'}
                                    >
                                      <Tag className="w-3.5 h-3.5 text-indigo-500" />
                                      <span className="hidden sm:inline">
                                        {showQuickTags ? 'Sembunyikan Tag' : 'Tampilkan Tag'}
                                      </span>
                                    </button>
                                  </div>
                                  {(scanMode === 'fisik' || scanMode === 'manual') && (
                                    <PhysicalScanInput onScan={handleScannedItem} products={productDatabase} />
                                  )}
                                  {scanMode === 'kamera' && isVisible && (
                                    <CameraScanner
                                      onScan={handleScannedItem}
                                      onRequestWakeLock={requestScreenWakeLock}
                                    />
                                  )}
                                  <QuickTagToolbar
                                    isVisible={showQuickTags}
                                    currentCategory={currentCategory}
                                    currentLocation={currentLocation}
                                    onSelectCategory={handleSelectQuickCategory}
                                    onSelectLocation={handleSelectQuickLocation}
                                  />
                                </div>
                              );

                              const saveBar = (
                                <BottomSaveBar
                                  items={scannedData}
                                  keterangan={keterangan}
                                  onChangeKeterangan={setKeterangan}
                                  onSave={handleSaveData}
                                  isSaving={isSaving}
                                />
                              );

                              if (layoutMode === 'split') {
                                return (
                                  <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                                    <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-3 space-y-3">
                                      {inputCard}
                                      {saveBar}
                                    </div>
                                    <div className="lg:col-span-7 xl:col-span-8">
                                      <ScannedItemsList
                                        items={scannedData}
                                        onRemoveItem={handleRemoveItem}
                                        onClearAll={handleClearAll}
                                        onUpdateCategory={handleUpdateItemCategory}
                                        onUpdateQty={handleUpdateItemQty}
                                      />
                                    </div>
                                  </div>
                                );
                              }

                              if (layoutMode === 'table') {
                                return (
                                  <div className="w-full space-y-3">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
                                      <div className="lg:col-span-8">{inputCard}</div>
                                      <div className="lg:col-span-4 flex flex-col justify-end">{saveBar}</div>
                                    </div>
                                    <ScannedItemsList
                                      items={scannedData}
                                      onRemoveItem={handleRemoveItem}
                                      onClearAll={handleClearAll}
                                      onUpdateCategory={handleUpdateItemCategory}
                                      onUpdateQty={handleUpdateItemQty}
                                      forceTableMode={true}
                                    />
                                  </div>
                                );
                              }

                              return (
                                <div className="w-full max-w-3xl mx-auto space-y-3">
                                  <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-[#0a0f1c]/95 pb-1 backdrop-blur-md">
                                    {inputCard}
                                  </div>
                                  <ScannedItemsList
                                    items={scannedData}
                                    onRemoveItem={handleRemoveItem}
                                    onClearAll={handleClearAll}
                                    onUpdateCategory={handleUpdateItemCategory}
                                    onUpdateQty={handleUpdateItemQty}
                                  />
                                  {saveBar}
                                </div>
                              );
                            }}
                          />
                        )}
                        {pageKey === 'peminjaman' && (
                          <PeminjamanView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                            onRefreshCatalog={loadProducts}
                          />
                        )}
                        {(pageKey === 'cetak_label' || pageKey === 'cetak_barcode') && (
                          <CetakLabelView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                            initialTab={cetakLabelInitialTab}
                          />
                        )}
                        {pageKey === 'perbaikan' && (
                          <QualityControlView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                            onRefreshCatalog={loadProducts}
                          />
                        )}
                        {pageKey === 'karyawan' && (
                          <KaryawanView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'presensi' && (
                          <PresensiView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'roster_shift' && (
                          <RosterShiftView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'lembur_cuti' && (
                          <LemburCutiView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'hr_approval' && (
                          <HrApprovalView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'hr_rekap' && (
                          <HrRekapView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'pesanan_saya' && (
                          <PesananSayaView
                            session={session}
                            productCatalog={productDatabase}
                            onShowToast={showToast}
                            onRefreshCatalog={() => loadProducts(true)}
                          />
                        )}
                        {pageKey === 'pusat_resolusi' && (
                          <PusatResolusiView
                            session={session}
                            productCatalog={productDatabase}
                            onNotify={showToast}
                          />
                        )}
                        {pageKey === 'rekap_tagihan_jne' && (
                          <JneRekapView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'katalog_produk' && (
                          <KatalogProdukView session={session} onNotify={showToast} />
                        )}
                        {pageKey === 'roadmap' && (
                          <RoadmapView session={session} onShowToast={showToast} />
                        )}
                        {pageKey === 'live_chat' && session && (
                          <LiveChatWorkspace
                            session={session}
                            productCatalog={productDatabase}
                            onNotify={showToast}
                            mode="full"
                            initialRoomId={liveChatManager.getSnapshot().activeRoomId}
                            allSkus={productDatabase.map((p) => p.k).filter(Boolean)}
                            onQuickSearchContext={(tagLabel) => {
                              showToast(`Tag Referensi: ${tagLabel}`, 'info');
                            }}
                          />
                        )}
                        {pageKey === 'supabase_migration' && (
                          <SupabaseMigrationView session={session} onNotify={showToast} />
                        )}
                        {pageKey === 'pengaturan_sistem' && (
                          <SettingsView
                            session={session}
                            onUpdateSession={(updated) => {
                              setSession(updated);
                              localStorage.setItem('wms_session_username', updated.username);
                              localStorage.setItem('wms_user_role', updated.role);
                              localStorage.setItem('wms_endpoint_url', updated.endpointUrl);
                              if (updated.store_code) {
                                localStorage.setItem('wms_user_store_code', updated.store_code);
                              } else {
                                localStorage.removeItem('wms_user_store_code');
                              }
                              if (updated.store_name) {
                                localStorage.setItem('wms_user_store_name', updated.store_name);
                              } else {
                                localStorage.removeItem('wms_user_store_name');
                              }
                              if (updated.permissions) {
                                localStorage.setItem('wms_user_permissions', JSON.stringify(updated.permissions));
                              } else {
                                localStorage.removeItem('wms_user_permissions');
                              }
                            }}
                            onRefreshCatalog={() => loadProducts(true)}
                            notificationPermission={notificationPermission}
                            onRequestNotification={handleRequestNotification}
                            isRealtimeConnected={isRealtimeConnected}
                            onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
                            onOpenLocationPurge={() => setIsLocationPurgeOpen(true)}
                            onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
                            onNotify={showToast}
                            productCatalog={productDatabase}
                            themeColor={themeColor}
                            setThemeColor={setThemeColor}
                            darkMode={darkMode}
                            setDarkMode={setDarkMode}
                            onToggleDarkMode={toggleDarkMode}
                            darkVariant={darkVariant}
                            setDarkVariant={setDarkVariant}
                            themeFont={themeFont}
                            setThemeFont={setThemeFont}
                            themeFontSize={themeFontSize}
                            setThemeFontSize={setThemeFontSize}
                            themeIconStyle={themeIconStyle}
                            setThemeIconStyle={setThemeIconStyle}
                          />
                        )}
                      </div>
                    );
                  })}
                </React.Suspense>
              </ErrorBoundary>
            )}
          </main>

          {/* Desktop-Only Slide-Over / Side-by-Side Companion Drawer (>= 1024px) */}
          {isDesktopViewport && session && companionPage && canAccessPage(session, companionPage) && (
            <DesktopCompanionDrawer
              companionPage={companionPage}
              activePage={activePage}
              onClose={() => setCompanionPage(null)}
              onSwapWithMain={handleSwapCompanionWithMain}
            >
              <ErrorBoundary fallbackTitle="Kendala Memuat Panel Samping" onReset={() => setCompanionPage(null)}>
                <React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-2xl">⏳</span></div>}>
                  {companionPage === 'dashboard' && (
                    <DashboardView
                      session={session}
                      onNavigate={(page) => handleSelectPage(page as any)}
                      productCatalog={productDatabase}
                      currentLocations={activeLocations}
                      onShowToast={showToast}
                    />
                  )}
                  {companionPage === 'packing' && <PackingView />}
                  {companionPage === 'agenda' && (
                    <AgendaView session={session} onShowToast={showToast} initialTab={agendaInitialTab} />
                  )}
                  {companionPage === 'produksi' && (
                    <ProduksiView session={session} productCatalog={productDatabase} onShowToast={showToast} />
                  )}
                  {companionPage === 'trello_up' && (
                    <TrelloView session={session} productCatalog={productDatabase} onNotify={showToast} />
                  )}
                  {(companionPage === 'loading_dock' || companionPage === 'picking_tasks') && (
                    <LoadingDockView
                      session={session}
                      productCatalog={productDatabase}
                      onShowToast={showToast}
                      initialTab={companionPage === 'picking_tasks' ? 'picking_tasks' : loadingDockInitialTab}
                      hasNewPickingAlert={!!newPickingTaskAlert}
                      onClearPickingAlert={() => setNewPickingTaskAlert(null)}
                    />
                  )}
                  {(companionPage === 'inventory' || companionPage === 'operasi_stok' || companionPage === 'scanner' || companionPage === 'mutasi_log') && (
                    <InventoryView
                      session={session}
                      currentLocations={activeLocations}
                      productCatalog={productDatabase}
                      onNotify={showToast}
                      onRefreshCatalog={loadProducts}
                      initialTab={inventoryInitialTab}
                      scannedCount={scannedData.length}
                      onOpenImportModal={() => setIsImportModalOpen(true)}
                      scannerComponent={() => null}
                    />
                  )}
                  {companionPage === 'peminjaman' && (
                    <PeminjamanView
                      session={session}
                      productCatalog={productDatabase}
                      onShowToast={showToast}
                      onRefreshCatalog={loadProducts}
                    />
                  )}
                  {(companionPage === 'cetak_label' || companionPage === 'cetak_barcode') && (
                    <CetakLabelView
                      session={session}
                      productCatalog={productDatabase}
                      onShowToast={showToast}
                      initialTab={cetakLabelInitialTab}
                    />
                  )}
                  {companionPage === 'perbaikan' && (
                    <QualityControlView
                      session={session}
                      productCatalog={productDatabase}
                      onShowToast={showToast}
                      onRefreshCatalog={loadProducts}
                    />
                  )}
                  {companionPage === 'karyawan' && <KaryawanView session={session} onShowToast={showToast} />}
                  {companionPage === 'presensi' && <PresensiView session={session} onShowToast={showToast} />}
                  {companionPage === 'roster_shift' && <RosterShiftView session={session} onShowToast={showToast} />}
                  {companionPage === 'lembur_cuti' && <LemburCutiView session={session} onShowToast={showToast} />}
                  {companionPage === 'hr_approval' && <HrApprovalView session={session} onShowToast={showToast} />}
                  {companionPage === 'hr_rekap' && <HrRekapView session={session} onShowToast={showToast} />}
                  {companionPage === 'pesanan_saya' && (
                    <PesananSayaView
                      session={session}
                      productCatalog={productDatabase}
                      onShowToast={showToast}
                      onRefreshCatalog={() => loadProducts(true)}
                    />
                  )}
                  {companionPage === 'pusat_resolusi' && (
                    <PusatResolusiView session={session} productCatalog={productDatabase} onNotify={showToast} />
                  )}
                  {companionPage === 'rekap_tagihan_jne' && <JneRekapView session={session} onShowToast={showToast} />}
                  {companionPage === 'katalog_produk' && <KatalogProdukView session={session} onNotify={showToast} />}
                  {companionPage === 'roadmap' && <RoadmapView session={session} onShowToast={showToast} />}
                  {companionPage === 'live_chat' && (
                    <LiveChatWorkspace
                      session={session}
                      productCatalog={productDatabase}
                      onNotify={showToast}
                      mode="full"
                      initialRoomId={liveChatManager.getSnapshot().activeRoomId}
                      allSkus={productDatabase.map((p) => p.k).filter(Boolean)}
                      onQuickSearchContext={(tagLabel) => {
                        showToast(`Tag Referensi: ${tagLabel}`, 'info');
                      }}
                    />
                  )}
                  {companionPage === 'supabase_migration' && (
                    <SupabaseMigrationView session={session} onNotify={showToast} />
                  )}
                  {companionPage === 'pengaturan_sistem' && (
                    <SettingsView
                      session={session}
                      onUpdateSession={(updated) => {
                        setSession(updated);
                        localStorage.setItem('wms_session_username', updated.username);
                        localStorage.setItem('wms_user_role', updated.role);
                        localStorage.setItem('wms_endpoint_url', updated.endpointUrl);
                        if (updated.store_code) {
                          localStorage.setItem('wms_user_store_code', updated.store_code);
                        } else {
                          localStorage.removeItem('wms_user_store_code');
                        }
                        if (updated.store_name) {
                          localStorage.setItem('wms_user_store_name', updated.store_name);
                        } else {
                          localStorage.removeItem('wms_user_store_name');
                        }
                        if (updated.permissions) {
                          localStorage.setItem('wms_user_permissions', JSON.stringify(updated.permissions));
                        } else {
                          localStorage.removeItem('wms_user_permissions');
                        }
                      }}
                      onRefreshCatalog={() => loadProducts(true)}
                      notificationPermission={notificationPermission}
                      onRequestNotification={handleRequestNotification}
                      isRealtimeConnected={isRealtimeConnected}
                      onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
                      onOpenLocationPurge={() => setIsLocationPurgeOpen(true)}
                      onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
                      onNotify={showToast}
                      productCatalog={productDatabase}
                      themeColor={themeColor}
                      setThemeColor={setThemeColor}
                      darkMode={darkMode}
                      setDarkMode={setDarkMode}
                      onToggleDarkMode={toggleDarkMode}
                      darkVariant={darkVariant}
                      setDarkVariant={setDarkVariant}
                      themeFont={themeFont}
                      setThemeFont={setThemeFont}
                      themeFontSize={themeFontSize}
                      setThemeFontSize={setThemeFontSize}
                      themeIconStyle={themeIconStyle}
                      setThemeIconStyle={setThemeIconStyle}
                    />
                  )}
                </React.Suspense>
              </ErrorBoundary>
            </DesktopCompanionDrawer>
          )}
        </div>
      </div>

      {/* APK Installation Guide Modal */}
      <ApkInstallModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
        onNotify={showToast}
      />

      {/* Mobile Landscape Orientation Warning & Quick Portrait Lock */}
      <MobileOrientationWarning />

      {/* PWA Background Update Prompt Banner */}
      <PwaUpdatePrompt />

      {/* Android-Style System Update Modal (OTA & 0-100% Progress) */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        session={session}
        activePage={activePage}
        onNotify={showToast}
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
      />

      {/* Non-blocking Floating Download Progress Widget */}
      <AppUpdateFloatingWidget
        onOpenModal={() => setIsUpdateModalOpen(true)}
        onNotify={showToast}
      />

      {/* Floating Quick Live Chat & Group Discussion Drawer + Toast */}
      {session && (
        <LiveChatFloatingWidget
          session={session}
          activePage={activePage}
          onSelectPage={handleSelectPage}
          productCatalog={productDatabase}
          onNotify={showToast}
          allSkus={productDatabase.slice(0, 600).map(p => p.k).filter(Boolean)}
          onQuickSearchContext={(tagLabel) => {
            showToast(`Tag Referensi: ${tagLabel}`, 'info');
          }}
        />
      )}

      {/* Settings Modal (Supabase, GAS, Users, Device) */}
      <ThemePickerModal
        isOpen={isThemePickerOpen}
        onClose={() => setIsThemePickerOpen(false)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onToggleDarkMode={toggleDarkMode}
        darkVariant={darkVariant}
        setDarkVariant={setDarkVariant}
        themeColor={themeColor}
        setThemeColor={setThemeColor}
        themeFont={themeFont}
        setThemeFont={setThemeFont}
        themeFontSize={themeFontSize}
        setThemeFontSize={setThemeFontSize}
        themeIconStyle={themeIconStyle}
        setThemeIconStyle={setThemeIconStyle}
      />

      <ImportStokModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        productCatalog={productDatabase}
        onNotify={showToast}
        onProcess={handleProcessImport}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        session={session}
        onUpdateSession={(updated) => {
          setSession(updated);
          localStorage.setItem('wms_session_username', updated.username);
          localStorage.setItem('wms_user_role', updated.role);
          localStorage.setItem('wms_endpoint_url', updated.endpointUrl);
          if (updated.store_code) {
            localStorage.setItem('wms_user_store_code', updated.store_code);
          } else {
            localStorage.removeItem('wms_user_store_code');
          }
          if (updated.store_name) {
            localStorage.setItem('wms_user_store_name', updated.store_name);
          } else {
            localStorage.removeItem('wms_user_store_name');
          }
          if (updated.permissions) {
            localStorage.setItem('wms_user_permissions', JSON.stringify(updated.permissions));
          } else {
            localStorage.removeItem('wms_user_permissions');
          }
        }}
        onRefreshCatalog={() => loadProducts(true)}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotification}
        isRealtimeConnected={isRealtimeConnected}
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
        onOpenLocationPurge={() => setIsLocationPurgeOpen(true)}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        onNotify={showToast}
        themeColor={themeColor}
        setThemeColor={setThemeColor}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onToggleDarkMode={toggleDarkMode}
        darkVariant={darkVariant}
        setDarkVariant={setDarkVariant}
        themeFont={themeFont}
        setThemeFont={setThemeFont}
        themeFontSize={themeFontSize}
        setThemeFontSize={setThemeFontSize}
        themeIconStyle={themeIconStyle}
        setThemeIconStyle={setThemeIconStyle}
      />

      {/* Update Database Modal (Warehouse Only: 2 CSV Import to Supabase) */}
      <UpdateDatabaseModal
        isOpen={isUpdateDatabaseOpen}
        onClose={() => setIsUpdateDatabaseOpen(false)}
        onExpand={() => setIsUpdateDatabaseOpen(true)}
        session={session}
        onRefreshCatalog={() => loadProducts(false)}
        onNotify={showToast}
        onSuccess={() => {
          loadProducts(false).then(() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('wms_catalog_updated'));
            }
          });
        }}
      />

      <LocationPurgeModal
        isOpen={isLocationPurgeOpen}
        onClose={() => setIsLocationPurgeOpen(false)}
        onExpand={() => setIsLocationPurgeOpen(true)}
        session={session}
        onNotify={showToast}
        onSuccess={() => {
          loadProducts(true);
        }}
        allExistingLocations={activeLocations}
      />

      {/* Asisten AI Pintar WMS Modal (Gemini Flash) */}
      <WmsAiModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        session={session}
        onNotify={showToast}
        onNavigateToInventoryCart={() => {
          handleSelectPage('inventory');
          if (typeof window !== 'undefined') {
            (window as any).__wms_open_inventory_cart = true;
          }
        }}
        onNavigateToProduksiInput={() => {
          if (typeof window !== 'undefined') {
            (window as any).__wms_pending_produksi_target = { tab: 'input', reloadDraft: true };
            window.dispatchEvent(
              new CustomEvent('wms_open_produksi_tab', {
                detail: { tab: 'input', reloadDraft: true }
              })
            );
          }
          handleSelectPage('produksi');
        }}
      />

      {/* Notification Hub Modal (Riwayat Notifikasi Belum Dibaca & Mark All Read) */}
      <NotificationHubModal
        isOpen={isNotificationHubOpen}
        onClose={() => setIsNotificationHubOpen(false)}
        username={session?.username}
        onNavigateTarget={(target) => {
          navigateToNotificationTarget(target);
        }}
      />

      {/* Custom Confirm Dialog (replaces window.confirm for PWA Builder / TWA compat) */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {confirmDialog.cancelText || 'Batal'}
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                  setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm shadow-red-500/20 cursor-pointer"
              >
                {confirmDialog.confirmText || 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


