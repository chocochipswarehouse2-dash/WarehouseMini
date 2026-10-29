/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import confetti from 'canvas-confetti';
import {
  Menu, Scan, FileText, ShieldAlert, Package, X, Tag, BellRing, ShoppingBag } from 'lucide-react';

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
import { appUpdateManager } from './services/appUpdateService';
import { MobileOrientationWarning } from './components/MobileOrientationWarning';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { ThemePickerModal } from './components/ThemePickerModal';
import { UpdateDatabaseModal } from './components/UpdateDatabaseModal';
import { LocationPurgeModal } from './components/inventory/LocationPurgeModal';
import { OfflineProtectionBar } from './components/OfflineProtectionBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { globalRealtimeStore } from './services/store';
import {
  getAllProductsFromLocalDb,
  saveProductsToLocalDb,
  upsertProductInLocalDb,
  bulkUpsertProductsInLocalDb,
} from './services/localDb';

// Resilient Lazy Loader with auto-retry and cache-busting on network or server-restart glitches
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>,
  retries = 3,
  interval = 800
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then((module) => {
            const resolved = module?.default ? module : { default: module };
            resolve(resolved);
          })
          .catch((error) => {
            if (remaining > 0) {
              setTimeout(() => attempt(remaining - 1), interval);
            } else {
              const errorMsg = String(error?.message || '');
              const isModuleError =
                errorMsg.includes('Failed to fetch dynamically imported module') ||
                errorMsg.includes('Importing a module script failed') ||
                errorMsg.includes('error loading dynamically imported module');

              if (isModuleError && typeof window !== 'undefined') {
                const reloadKey = 'chunk_reload_' + window.location.pathname;
                const hasReloaded = sessionStorage.getItem(reloadKey);
                if (!hasReloaded) {
                  sessionStorage.setItem(reloadKey, 'true');
                  window.location.reload();
                  return;
                }
              }
              reject(error);
            }
          });
      };
      attempt(retries);
    })
  );
}

// Lazy load large components with resilient retry
const DashboardView = lazyWithRetry(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const ProduksiView = lazyWithRetry(() => import('./components/ProduksiView').then(m => ({ default: m.ProduksiView })));
const LoadingDockView = lazyWithRetry(() => import('./components/LoadingDockView').then(m => ({ default: m.LoadingDockView })));
const PackingView = lazyWithRetry(() => import('./components/PackingView').then(m => ({ default: m.PackingView })));
const AgendaView = lazyWithRetry(() => import('./components/AgendaView').then(m => ({ default: m.AgendaView })));
const PeminjamanView = lazyWithRetry(() => import('./components/PeminjamanView').then(m => ({ default: m.PeminjamanView })));
const QualityControlView = lazyWithRetry(() => import('./components/QualityControlView').then(m => ({ default: m.QualityControlView })));
const PickingTasksView = lazyWithRetry(() => import('./components/PickingTasksView').then(m => ({ default: m.PickingTasksView })));
const StockOpnameView = lazyWithRetry(() => import('./components/StockOpnameView').then(m => ({ default: m.StockOpnameView })));
const MutasiLogView = lazyWithRetry(() => import('./components/MutasiLogView').then(m => ({ default: m.MutasiLogView })));
const InventoryView = lazyWithRetry(() => import('./components/InventoryView').then(m => ({ default: m.InventoryView })));
const PresensiView = lazyWithRetry(() => import('./components/hr/PresensiView').then(m => ({ default: m.PresensiView })));
const KaryawanView = lazyWithRetry(() => import('./components/hr/KaryawanView').then(m => ({ default: m.KaryawanView })));
const RosterShiftView = lazyWithRetry(() => import('./components/hr/RosterShiftView').then(m => ({ default: m.RosterShiftView })));
const LemburCutiView = lazyWithRetry(() => import('./components/hr/LemburCutiView').then(m => ({ default: m.LemburCutiView })));
const HrApprovalView = lazyWithRetry(() => import('./components/hr/HrApprovalView').then(m => ({ default: m.HrApprovalView })));
const HrRekapView = lazyWithRetry(() => import('./components/hr/HrRekapView').then(m => ({ default: m.HrRekapView })));
const CetakLabelView = lazyWithRetry(() => import('./components/CetakLabelView').then(m => ({ default: m.CetakLabelView })));
const CetakBarcodeProdukView = lazyWithRetry(() => import('./components/CetakBarcodeProdukView').then(m => ({ default: m.CetakBarcodeProdukView })));
import { PesananSayaView } from './components/PesananSaya/PesananSayaView';
import PusatResolusiView from './components/PusatResolusi/PusatResolusiView';
const JneRekapView = lazyWithRetry(() => import('./components/JneRekapView').then(m => ({ default: m.JneRekapView })));

const SupabaseMigrationView = lazyWithRetry(() => import('./components/SupabaseMigrationView').then(m => ({ default: m.SupabaseMigrationView })));

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
  ALL_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from './services/permissions';
import { getUserPersonName, registerUserNames } from './utils/userResolver';
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
  syncNotifiedOrdersToServiceWorker,
} from './services/pushNotification';
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
};

const PATH_TO_PAGE: Record<string, ActivePage> = {
  'rekap-tagihan-jne': 'rekap_tagihan_jne',
  'tagihan-jne': 'rekap_tagihan_jne',
  'operasi-stok': 'operasi_stok',
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
  'scanner': 'scanner',
  'scan': 'scanner',
  'mutasi-log': 'mutasi_log',
  'mutasi': 'mutasi_log',
  'inventory': 'inventory',
  'stok': 'inventory',
  'stock-opname': 'stock_opname',
  'so': 'stock_opname',
  'tugas-picking': 'picking_tasks',
  'picking': 'picking_tasks',
  'picking-tasks': 'picking_tasks',
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

function getPageFromUrl(session: UserSession | null): ActivePage {
  if (typeof window === 'undefined') return getDefaultPageForSession(session);
  try {
    if (isRunningInIframe()) {
      const savedPage = localStorage.getItem('wms_last_active_page') as ActivePage | null;
      if (savedPage && PAGE_TO_PATH[savedPage]) {
        if (!session || canAccessPage(session, savedPage)) {
          return savedPage;
        }
      }
    }
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const matchedPage = PATH_TO_PAGE[path];
    if (matchedPage) {
      if (!session || canAccessPage(session, matchedPage)) {
        return matchedPage;
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

  // Sinkronisasi activePage ke browser URL address bar secara transparan (hanya di top-level window, dilewati di iframe agar bebas SecurityError)
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
  }, [activePage]);

  // Listener navigasi tombol Back & Forward di browser + klik Notifikasi HP (Service Worker)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const pageFromState = event.state?.page as ActivePage | undefined;
      if (pageFromState && canAccessPage(session, pageFromState)) {
        startTransition(() => {
          setActivePage(pageFromState);
        });
      } else {
        const pageFromPath = getPageFromUrl(session);
        startTransition(() => {
          setActivePage(pageFromPath);
        });
      }
    };

    const handleNavigateCustom = (event: Event) => {
      const targetPage = (event as CustomEvent)?.detail?.page as ActivePage | undefined;
      if (targetPage && (!session || canAccessPage(session, targetPage))) {
        startTransition(() => {
          setActivePage(targetPage);
        });
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'WMS_NOTIFICATION_CLICK') {
        const targetPage = (event.data.page || 'pesanan_saya') as ActivePage;
        if (!session || canAccessPage(session, targetPage)) {
          startTransition(() => {
            setActivePage(targetPage);
          });
        }
      }
    };

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
    };
  }, [session]);

  // Auto-redirect jika halaman aktif tidak diizinkan untuk sesi user
  useEffect(() => {
    if (session && !canAccessPage(session, activePage)) {
      const allowedPage = getDefaultPageForSession(session);
      setActivePage(allowedPage);
    }
    // Dismiss alert tugas picking jika user sedang berada di halaman picking
    if (activePage === 'picking_tasks') {
      setNewPickingTaskAlert(null);
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

    // Preload lazy components safely without unhandled rejections
    const preloadTimer = setTimeout(() => {
      const safePreload = (factory: () => Promise<any>) => {
        try {
          factory().catch((_val: boolean) => {});
        } catch {
          // Ignore background preload errors
        }
      };

      safePreload(() => import('./components/PeminjamanView'));
      safePreload(() => import('./components/PickingTasksView'));
      safePreload(() => import('./components/StockOpnameView'));
      safePreload(() => import('./components/MutasiLogView'));
      safePreload(() => import('./components/InventoryView'));
      safePreload(() => import('./components/hr/PresensiView'));
      safePreload(() => import('./components/hr/KaryawanView'));
      safePreload(() => import('./components/hr/RosterShiftView'));
      safePreload(() => import('./components/hr/LemburCutiView'));
      safePreload(() => import('./components/hr/HrApprovalView'));
      safePreload(() => import('./components/hr/HrRekapView'));
      safePreload(() => import('./components/PesananSaya/PesananSayaView'));
    }, 2500);

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

        const userDefaultPerms = ROLE_DEFAULT_PERMISSIONS[newRole] || ROLE_DEFAULT_PERMISSIONS['Operator'] || {};
        const newPermissions = isUserSuper
          ? { ...ALL_PERMISSIONS }
          : { ...userDefaultPerms, ...(u.permissions || {}) };

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
      clearTimeout(preloadTimer);
    };
  }, [session?.username]);

  // Handler navigasi dengan verifikasi izin halaman & Auto-Update Aman saat pindah menu utama
  const handleSelectPage = useCallback((page: ActivePage) => {
    if (!canAccessPage(session, page)) {
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
  }, [session, activePage]);

  // Handler pembukaan pengaturan sistem dengan verifikasi izin
  const handleOpenSettings = useCallback(() => {
    if (!session) {
      showToast('Akses ditolak: Silakan login terlebih dahulu.', 'error');
      return;
    }
    setIsSettingsOpen(true);
  }, [session]);

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

  // Modals & Drawers & Sidebar
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState<boolean>(false);
  const [isUpdateDatabaseOpen, setIsUpdateDatabaseOpen] = useState<boolean>(false);
  const [isLocationPurgeOpen, setIsLocationPurgeOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('wms_sidebar_collapsed') === 'true';
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
      localStorage.setItem('wms_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Apply dark mode class to html element
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
      if (metaThemeColor) metaThemeColor.setAttribute('content', '#0f172a');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
      if (metaThemeColor) metaThemeColor.setAttribute('content', '#ffffff');
    }
    localStorage.setItem('wms_dark_mode', String(darkMode));
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
  }, [darkMode, themeColor, themeFont, themeFontSize, themeIconStyle]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  // Toast helper
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      setToasts((prev) => [...prev, { id, message, type }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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

    // Periodic & Tab-Focus Low-Egress Watermark Check (every 3 minutes + on tab focus)
    let lastFocusCheck = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFocusCheck > 60 * 1000) {
        lastFocusCheck = Date.now();
        syncSmartLowEgressCache().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const deltaInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncSmartLowEgressCache().catch(() => {});
      }
    }, 3 * 60 * 1000);

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
              const newLog = payload.new as { type?: string; sku?: string; lokasi?: string; qty?: number, invoice?: string };
              showPushNotification('📦 Log Mutasi Baru', {
                body: `Mutasi #${newLog.type || 'LOG'}: ${newLog.sku || 'Barang'} di lokasi ${newLog.lokasi || '-'}`,
              });

              import('./services/pickingSync').then(({ processPickingSync }) => {
                processPickingSync(newLog);
              }).catch(console.error);

              // Local State Mutation to save egress: update locally instead of fetching the whole database
              if (newLog.sku && newLog.lokasi && newLog.qty) {
                setProductDatabase(prev => {
                  const skuUpper = newLog.sku!.toUpperCase();
                  const locUpper = newLog.lokasi!.toUpperCase();
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
                  s: raw.size || raw.s || 'ALL',
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

            // Notifikasi Realtime saat ada Tugas Picking / Surat Jalan / Refill baru diinput oleh Admin
            if (payload.eventType === 'INSERT' && payload.new) {
              const row = payload.new as any;
              const sj = row.no_sj || 'Tugas Baru';
              const tujuan = row.tujuan || 'Gudang';
              incomingPickingRows.push({
                no_sj: sj,
                tujuan,
                nama_produk: row.nama_produk,
                sku: row.sku,
              });

              if (pickingDebounceTimer) clearTimeout(pickingDebounceTimer);
              pickingDebounceTimer = setTimeout(() => {
                const totalItems = incomingPickingRows.length;
                const uniqueSjs = Array.from(new Set(incomingPickingRows.map((r) => r.no_sj))).filter(Boolean);
                const firstSj = uniqueSjs[0] || 'Surat Jalan';
                const firstTujuan = incomingPickingRows[0]?.tujuan || 'Gudang';
                incomingPickingRows = [];

                // 1. Putar nada lonceng tugas baru (jelas & nyaring di gudang)
                playNewTaskChime();

                // 2. Getarkan HP picker
                vibrateDevice([250, 100, 250, 100, 450]);

                // 3. Web Push / System Notification (muncul di status bar HP / Chrome)
                const notifTitle = '📋 Tugas Picking Baru Masuk!';
                const notifBody =
                  uniqueSjs.length > 1
                    ? `${uniqueSjs.length} Surat Jalan baru masuk (${totalItems} SKU). Buka untuk mulai picking.`
                    : `SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}. Buka untuk mulai picking.`;

                showPushNotification(notifTitle, {
                  body: notifBody,
                  tag: `picking-task-${firstSj}`,
                  page: 'picking_tasks',
                });

                // 4. In-App Toast
                showToast(
                  uniqueSjs.length > 1
                    ? `📋 ${uniqueSjs.length} Tugas Picking Baru Masuk (${totalItems} item)!`
                    : `📋 Tugas Picking Baru Masuk: SJ #${firstSj} (${totalItems} item) - Tujuan: ${firstTujuan}`,
                  'info'
                );

                // 5. Simpan state alert untuk banner & badge di UI
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
              handleIncomingManualShipmentRef.current(row);
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as any;
              const oldRow = (payload.old || {}) as any;
              // Jika resi baru saja diinput oleh Admin, beri notifikasi ke akun Store pengirim
              if (row.no_resi && row.no_resi !== oldRow.no_resi && !isSuperadmin(session)) {
                const orderId = row.no_transaksi_customer || row.no_pesanan || 'Pesanan';
                const storeName = row.nama_pengirim || 'Store';
                const userStore = (session.store_name || session.name || '').toLowerCase();
                if (userStore && storeName.toLowerCase().includes(userStore)) {
                  playNewTaskChime();
                  vibrateDevice([200, 100, 300]);
                  showPushNotification(`🚚 Resi Pesanan Diupdate (#${orderId})`, {
                    body: `Pesanan ${row.nama_tujuan || 'Customer'} telah diupdate dengan No. Resi: ${row.no_resi} (${row.jasa_kirim || 'Ekspedisi'})`,
                    tag: `resi-update-${orderId}`,
                    page: 'pesanan_saya',
                  });
                  showToast(`🚚 Resi pesanan #${orderId} telah diupdate: ${row.no_resi}`, 'info');
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
            if (payload.eventType === 'INSERT' && payload.new && isSuperadmin(session)) {
              const row = payload.new as any;
              const noRetur = row.no_retur || 'RTR-BARU';
              const customer = row.nama_customer || 'Customer';
              playNewTaskChime();
              vibrateDevice([250, 100, 250]);
              showPushNotification('🔄 Tiket Retur Barang Baru!', {
                body: `Tiket #${noRetur} atas nama ${customer} baru saja diajukan di Pusat Resolusi.`,
                tag: `retur-new-${noRetur}`,
                page: 'pusat_resolusi',
              });
              showToast(`🔄 Tiket Retur Barang Baru: #${noRetur} (${customer})`, 'info');
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

  // Handler terpusat KHUSUS ADMIN (Laptop & HP Admin) saat Toko A submit Pesanan Baru (Manual Shipment / Alter)
  // TIDAK AKAN berbunyi di HP / perangkat PIC Toko yang menginput.
  const handleIncomingManualShipmentNotification = useCallback(
    (row: any) => {
      if (!row || !session) return;

      // 1. HANYA muncul di Laptop / HP Admin (bukan di akun Store PIC)
      if (!isSuperadmin(session)) {
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

      const orderId = String(row.no_transaksi_customer || row.no_pesanan || 'Pesanan Baru').trim();
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

      // 1. Putar nada lonceng pesanan baru di Laptop / HP Admin
      playNewTaskChime();

      // 2. Getarkan HP Admin
      vibrateDevice([300, 120, 300, 120, 500]);

      // 3. Tampilkan Push Notification Sistem di Laptop Admin (Windows/Mac) & HP Admin (Android/iOS)
      const notifTitle = isAlter
        ? `✂️ Form Alter/Repair Baru — ${storeName}`
        : `🛍️ Pesanan Baru dari ${storeName}`;
      const notifBody = `Order #${orderId}${picStore ? ` (PIC: ${picStore})` : ''} • Customer: ${customerName} (${totalQty} pcs${skuPreview ? ` - ${skuPreview}` : ''} via ${jasaKirim})`;

      showPushNotification(notifTitle, {
        body: notifBody,
        tag: `manual-shipment-${primaryKey}`,
        page: 'pesanan_saya',
        requireInteraction: true,
      });

      // 4. Tampilkan Toast di layar Admin
      showToast(
        `${isAlter ? '✂️ Request Alter/Repair Baru' : '🛍️ Pesanan Baru'} dari ${storeName}: #${orderId} (${totalQty} pcs - ${customerName})`,
        'info'
      );

      // 5. Tampilkan Floating Alert Banner & Badge di layar Laptop / HP Admin
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

  // Handler terpusat KHUSUS ADMIN & PICKER saat ada Permintaan Peminjaman Sementara (SPS) baru
  const handleIncomingSpsNotification = useCallback(
    (rowOrRecord: any) => {
      if (!rowOrRecord || !session) return;

      const userIsAdmin = isSuperadmin(session);
      const userIsPicker = canAccessPage(session, 'picking_tasks');
      if (!userIsAdmin && !userIsPicker) {
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
        requireInteraction: true,
      });

      showToast(
        `📋 Permintaan SPS Baru: #${noSps} dari ${picName} (${keperluanText} - ${totalQty} pcs)`,
        'info'
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

  // Background, Service Worker & Screen-Wake Delta Poller KHUSUS ADMIN & PICKER
  // Termasuk Catch-Up Notification untuk pesanan toko & pengajuan SPS yang masuk saat aplikasi/browser ditutup
  useEffect(() => {
    const userIsAdmin = Boolean(session && isSuperadmin(session));
    const userIsPicker = Boolean(session && canAccessPage(session, 'picking_tasks'));

    if (!session || (!userIsAdmin && !userIsPicker)) {
      configureServiceWorkerOrderWatcher({
        enabled: false,
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
        isAdmin: false,
        isPicker: false,
      });
      return;
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

    // Sinkronkan konfigurasi ke Service Worker agar bisa mengecek pesanan & SPS di background (periodicsync / sync / push)
    const customUrl = localStorage.getItem('wms_supabase_url') || DEFAULT_SUPABASE_URL;
    const customKey = localStorage.getItem('wms_supabase_key') || DEFAULT_SUPABASE_ANON_KEY;
    configureServiceWorkerOrderWatcher({
      enabled: true,
      supabaseUrl: customUrl,
      supabaseAnonKey: customKey,
      isAdmin: userIsAdmin,
      isPicker: userIsPicker,
      username: session.username,
      notifiedIds: Array.from(notifiedOrderIdsRef.current),
      lastCheckedAt: getLastOrderCheckTimestamp() || Date.now(),
    });

    // Dengarkan pesan dari Service Worker (jika SW sudah menotifikasi pesanan saat tab di background, atau user klik notifikasi)
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'WMS_SW_ORDERS_NOTIFIED' && Array.isArray(data.notifiedIds)) {
        data.notifiedIds.forEach((id: string) => {
          if (id) notifiedOrderIdsRef.current.add(String(id).toUpperCase());
        });
        savePersistedNotifiedOrderIds(notifiedOrderIdsRef.current);
        if (data.timestamp) setLastOrderCheckTimestamp(Number(data.timestamp));
      } else if (data.type === 'WMS_NOTIFICATION_CLICK' && data.page) {
        setActivePage(data.page as ActivePage);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // 2. Cek pesanan baru & SPS baru setiap 10 detik, saat layar aktif kembali, & saat aplikasi baru dibuka (catch-up)
    const checkNewStoreOrdersDelta = async () => {
      if (!isSeeded) return;
      try {
        const nowMs = Date.now();
        const MAX_AGE_MS = 12 * 60 * 60 * 1000; // Hanya yang dibuat dalam 12 jam terakhir

        if (userIsAdmin) {
          const latestRows = await supabaseFetch<any[]>(
            'manual_shipment',
            'GET',
            null,
            'select=*&order=created_at.desc&limit=15'
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

          // Cek juga tiket Retur Barang baru untuk Admin
          try {
            const latestRetur = await supabaseFetch<any[]>(
              'retur_barang',
              'GET',
              null,
              'select=id,no_retur,nama_customer,created_at&order=created_at.desc&limit=6'
            );
            if (isMounted && Array.isArray(latestRetur)) {
              for (const r of [...latestRetur].reverse()) {
                const noRetur = String(r.no_retur || '').trim().toUpperCase();
                if (!noRetur || notifiedOrderIdsRef.current.has(noRetur)) continue;
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
                  showToast(`🔄 Tiket Retur Barang Baru: #${noRetur} (${r.nama_customer || 'Customer'})`, 'info');
                }
              }
            }
          } catch {}
        }

        // Cek Permintaan Peminjaman Sementara (SPS) baru untuk Admin & Picker
        if (userIsAdmin || userIsPicker) {
          try {
            const latestSps = await supabaseFetch<any[]>(
              'peminjaman',
              'GET',
              null,
              'select=id,no_peminjaman,pic,keperluan,sku,nama_produk,qty,created_at&order=created_at.desc&limit=20'
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

    const intervalId = setInterval(checkNewStoreOrdersDelta, 10000);
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        setNotificationPermission(getNotificationPermissionStatus());
        checkNewStoreOrdersDelta();
      } else if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Saat aplikasi di-minimize atau pindah tab, minta Service Worker siaga penuh
        navigator.serviceWorker.controller.postMessage({ type: 'WMS_CHECK_ORDERS_NOW' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('focus', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
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
      const firstPage = canAccessPage(newSession, pageFromUrl) ? pageFromUrl : getDefaultPageForSession(newSession);
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
    setSession(null);
    setScannedData([]);
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
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      playNewTaskChime();
      vibrateDevice([200, 100, 200]);
      showToast('Notifikasi Admin (Laptop & HP) aktif! Mengirim tes notifikasi...', 'success');
      await showPushNotification('🔔 Notifikasi Admin WMS Aktif!', {
        body: 'Laptop / HP Admin Anda siap menerima bunyi & pop-up otomatis saat Store (Toko A, dll.) menginput Pesanan Baru.',
        tag: `wms-test-notif-${Date.now()}`,
        page: 'pesanan_saya',
      });
    } else {
      showToast(
        'Izin notifikasi belum diizinkan di browser Laptop/HP Anda. Silakan klik ikon gembok di sebelah kiri URL lalu izinkan Notifications (Allow).',
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
        if (!cType || cType === 'ANOMALI') {
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

        if (cType === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast('Mode ANOMALI dilarang pada Web App Scanner. Pilih #IN, #OUT, atau #SO.', 'error');
          return;
        }

        // Fix invoice base to use extracted explicit invoice if available
        const currentLineInvoice = currentInvoiceRef.current || `WEB-${waktuPesan.getTime()}`;

        if (cType === 'IN' || cType === 'OUT' || cType === 'ANOMALI') {
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
            keterangan: ketText || (cType === 'ANOMALI' ? 'Scan Tanpa Tipe (Anomali)' : `${cType} Staging Scan`),
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
    <div className="min-h-screen flex flex-row bg-[#f4f6f8] dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors selection:bg-primary-500 selection:text-white">
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
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-3.5 rounded-2xl shadow-xl shadow-indigo-600/30 border border-indigo-300/40 flex items-center justify-between gap-3">
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
                onClick={() => {
                  handleSelectPage('pesanan_saya');
                  setNewManualShipmentAlert(null);
                }}
                className="px-3 py-1.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-black shadow-sm cursor-pointer transition-all active:scale-95"
              >
                Lihat
              </button>
              <button
                type="button"
                onClick={() => setNewManualShipmentAlert(null)}
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
      {newPickingTaskAlert && activePage !== 'picking_tasks' && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="Notifikasi Tugas Picking Baru"
          className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="bg-gradient-to-r from-primary-500 to-amber-600 text-white p-3.5 rounded-2xl shadow-xl shadow-primary-500/30 border border-orange-300/40 flex items-center justify-between gap-3">
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
                onClick={() => {
                  handleSelectPage('picking_tasks');
                  setNewPickingTaskAlert(null);
                }}
                className="px-3 py-1.5 bg-white text-primary-500 hover:bg-orange-50 rounded-xl text-xs font-black shadow-sm cursor-pointer transition-all active:scale-95"
              >
                Buka
              </button>
              <button
                type="button"
                onClick={() => setNewPickingTaskAlert(null)}
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
        onOpenThemePicker={() => setIsThemePickerOpen(true)}
        session={session}
        activePage={activePage}
        onSelectPage={handleSelectPage}
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
        onLogout={handleLogout}
        totalScannedCount={scannedData.length}
        hasNewPickingAlert={!!newPickingTaskAlert}
        hasNewPesananAlert={!!newManualShipmentAlert}
      />

      {/* Main App Container (Page Content) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Desktop PWA Hint Banner (Shown on PC when opened in regular browser tab) */}
        <div className="print:hidden">
          <DesktopPwaBanner onOpenInstallModal={() => setIsApkModalOpen(true)} />
          {/* Offline Connection & Work Protection Banner */}
          <OfflineProtectionBar onNotify={(msg, type) => showToast(msg, type)} />

          {/* Admin Only (Laptop & HP Admin) Push Notification Activation Prompt Bar */}
          {session &&
            isSuperadmin(session) &&
            isNotificationSupported() &&
            notificationPermission !== 'granted' &&
            !dismissedNotifPrompt && (
              <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800/70 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 animate-bounce">
                    <BellRing className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    <strong>Notifikasi Admin (Laptop / HP) Belum Aktif:</strong> Aktifkan di perangkat Admin ini agar otomatis berbunyi &amp; muncul pop-up saat{' '}
                    <strong>Store (Toko A, dll.) submit input pesanan baru</strong>.
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleRequestNotification}
                    className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    Aktifkan Notifikasi Admin
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

        {/* Floating Mobile Sidebar Toggle */}
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 z-40 p-3.5 bg-primary-500 text-white rounded-full shadow-lg shadow-primary-500/40 hover:bg-primary-600 hover:scale-105 active:scale-95 transition-all cursor-pointer print:hidden"
          title="Buka Menu Navigasi"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Main Content Area based on active navigation tab with Keep-Alive */}
        <main className={`flex-1 pb-16 sm:pb-8 p-2 sm:p-4 lg:p-6 w-full ${activePage === 'inventory' ? 'max-w-full' : 'max-w-7xl mx-auto'}`}>
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
            <>
              {activePage === 'operasi_stok' && (
                <OperasiStokView
                  session={session}
                  onOpenImportModal={() => setIsImportModalOpen(true)}
                  onOpenLocationPurge={() => setIsLocationPurgeOpen(true)}
                  scannerComponent={
                    <div className="w-full max-w-2xl mx-auto space-y-4">
                      {/* STICKY / FREEZE SCANNER METHOD & INPUT CARD */}
                      <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-[#0a0f1c]/95 pt-0 pb-1.5 backdrop-blur-md">
                        <div className="bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
                          <div className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-[#0F0F12] border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
                            <div className="flex-1 min-w-0">
                              <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowQuickTags(prev => !prev)}
                              className="p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap shadow-sm cursor-pointer select-none"
                              title={showQuickTags ? "Sembunyikan Pengaturan Tag" : "Tampilkan Pengaturan Tag"}
                            >
                              <Tag className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{showQuickTags ? "Sembunyikan Tag" : "Tampilkan Tag"}</span>
                            </button>
                          </div>
                          {(scanMode === 'fisik' || scanMode === 'manual') && (
                            <PhysicalScanInput onScan={handleScannedItem} products={productDatabase} />
                          )}
                          {scanMode === 'kamera' && (
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
                      </div>

                      {/* Scanned Items List */}
                      <ScannedItemsList
                        items={scannedData}
                        onRemoveItem={handleRemoveItem}
                        onClearAll={handleClearAll}
                        onUpdateCategory={handleUpdateItemCategory}
                        onUpdateQty={handleUpdateItemQty}
                      />

                      {/* Bottom Save Action Bar */}
                      <BottomSaveBar
                        items={scannedData}
                        keterangan={keterangan}
                        onChangeKeterangan={setKeterangan}
                        onSave={handleSaveData}
                        isSaving={isSaving}
                      />
                    </div>
                  }
                  mutasiLogComponent={
                    <MutasiLogView
                      session={session}
                      productCatalog={productDatabase}
                      onNotify={showToast}
                      onRefreshCatalog={loadProducts}
                    />
                  }
                  stockOpnameComponent={
                    <StockOpnameView
                      session={session}
                      productCatalog={productDatabase}
                      onNotify={showToast}
                      onRefreshCatalog={loadProducts}
                    />
                  }
                />
              )}

          <ErrorBoundary fallbackTitle="Kendala Memuat Halaman" onReset={() => window.location.reload()}>
            <React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳</span></div>}>
              {activePage === 'dashboard' && (
                  <DashboardView />
              )}
              {activePage === 'packing' && (
                  <PackingView />
              )}
              {activePage === 'agenda' && (
                  <AgendaView 
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'produksi' && (
                  <ProduksiView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'loading_dock' && (
                  <LoadingDockView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'inventory' && (
                  <InventoryView
                    session={session}
                    currentLocations={activeLocations}
                    productCatalog={productDatabase}
                    onNotify={showToast}
                    onRefreshCatalog={loadProducts}
                  />
              )}
              {activePage === 'peminjaman' && (
                  <PeminjamanView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                    onRefreshCatalog={loadProducts}
                  />
              )}
              {activePage === 'cetak_label' && (
                  <CetakLabelView />
              )}
              {activePage === 'cetak_barcode' && (
                  <CetakBarcodeProdukView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'picking_tasks' && (
                  <PickingTasksView
                    onNotify={showToast}
                    currentUser={session?.name || getUserPersonName(session?.username) || 'Operator'}
                    productCatalog={productDatabase}
                  />
              )}
              {activePage === 'perbaikan' && (
                  <QualityControlView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                    onRefreshCatalog={loadProducts}
                  />
              )}
              {activePage === 'karyawan' && (
                  <KaryawanView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'presensi' && (
                  <PresensiView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'roster_shift' && (
                  <RosterShiftView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'lembur_cuti' && (
                  <LemburCutiView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'hr_approval' && (
                  <HrApprovalView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'hr_rekap' && (
                  <HrRekapView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'pesanan_saya' && (
                  <PesananSayaView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                    onRefreshCatalog={() => loadProducts(true)}
                  />
              )}
              {activePage === 'pusat_resolusi' && (
                  <PusatResolusiView
                    session={session}
                    productCatalog={productDatabase}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'rekap_tagihan_jne' && (
                  <JneRekapView
                    session={session}
                    onShowToast={showToast}
                  />
              )}
              {activePage === 'katalog_produk' && (
                  <KatalogProdukView session={session} onNotify={showToast} />
              )}

              {activePage === 'roadmap' && (
                  <RoadmapView session={session} onShowToast={showToast} />
              )}
              {activePage === 'supabase_migration' && (
                  <SupabaseMigrationView
                    session={session}
                    onNotify={showToast}
                  />
              )}
            </React.Suspense>
          </ErrorBoundary>
            </>
          )}
        </main>
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
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
      />

      {/* Non-blocking Floating Download Progress Widget */}
      <AppUpdateFloatingWidget
        onOpenModal={() => setIsUpdateModalOpen(true)}
      />

      {/* Settings Modal (Supabase, GAS, Users, Device) */}
      <ThemePickerModal
        isOpen={isThemePickerOpen}
        onClose={() => setIsThemePickerOpen(false)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onToggleDarkMode={toggleDarkMode}
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
        themeFont={themeFont}
        setThemeFont={setThemeFont}
        themeFontSize={themeFontSize}
        setThemeFontSize={setThemeFontSize}
        themeIconStyle={themeIconStyle}
        setThemeIconStyle={setThemeIconStyle}
      />

      {/* Update Database Modal (Superadmin Only: 2 CSV Import to Supabase) */}
      <UpdateDatabaseModal
        isOpen={isUpdateDatabaseOpen}
        onClose={() => setIsUpdateDatabaseOpen(false)}
        session={session}
        onNotify={showToast}
        onSuccess={() => {
          loadProducts(true);
        }}
      />

      <LocationPurgeModal
        isOpen={isLocationPurgeOpen}
        onClose={() => setIsLocationPurgeOpen(false)}
        session={session}
        onNotify={showToast}
        onSuccess={() => {
          loadProducts(true);
        }}
        allExistingLocations={activeLocations}
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


