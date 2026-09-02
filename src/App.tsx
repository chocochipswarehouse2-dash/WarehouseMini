/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Scan, FileText } from 'lucide-react';
import {
  CategoryType,
  ProductItem,
  ScanMode,
  ScannedItem,
  ToastMessage,
  UserSession,
  ActivePage,
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import { ScanMethodSelector } from './components/ScanMethodSelector';
import { PhysicalScanInput } from './components/PhysicalScanInput';
import { CameraScanner } from './components/CameraScanner';
import { ScannerTabRecap } from './components/ScannerTabRecap';
import { QuickTagToolbar } from './components/QuickTagToolbar';
import { ScannedItemsList } from './components/ScannedItemsList';
import { BottomSaveBar } from './components/BottomSaveBar';
import { ApkInstallModal } from './components/ApkInstallModal';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { UpdateDatabaseModal } from './components/UpdateDatabaseModal';
import { globalRealtimeStore } from './services/store';

// Lazy load large components
const PeminjamanView = React.lazy(() => import('./components/PeminjamanView').then(m => ({ default: m.PeminjamanView })));
const PickingTasksView = React.lazy(() => import('./components/PickingTasksView').then(m => ({ default: m.PickingTasksView })));
const StockOpnameView = React.lazy(() => import('./components/StockOpnameView').then(m => ({ default: m.StockOpnameView })));
const MutasiLogView = React.lazy(() => import('./components/MutasiLogView').then(m => ({ default: m.MutasiLogView })));
const InventoryView = React.lazy(() => import('./components/InventoryView').then(m => ({ default: m.InventoryView })));

import {
  fetchStockForLocations,
  getAreaFromLokasi,
  getSupabaseClient,
  insertLogProduk,
  insertStockOpnameQueue,
  fetchMasterProductsFromSupabase,
  verifySupabaseLogin,
  isDummyProduct,
} from './services/supabase';
import {
  playCategoryBeep,
  playErrorBeep,
  playSaveSuccessChime,
  playSuccessBeep,
  vibrateDevice,
} from './services/audio';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  showPushNotification,
} from './services/pushNotification';
import { releaseScreenWakeLock, requestScreenWakeLock } from './services/wakeLock';

export default function App() {
  // Session & Auth (Multi-Role User Session)
  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('wms_session_token');
    const username = localStorage.getItem('wms_session_username');
    const role = localStorage.getItem('wms_user_role');
    const endpointUrl = localStorage.getItem('wms_endpoint_url');
    const sessionExpiry = localStorage.getItem('wms_session_expiry');
    const permissionsStr = localStorage.getItem('wms_user_permissions');

    // Cek expiry session (7 hari)
    if (sessionExpiry && Date.now() > parseInt(sessionExpiry, 10)) {
      localStorage.removeItem('wms_session_token');
      localStorage.removeItem('wms_session_username');
      localStorage.removeItem('wms_user_role');
      localStorage.removeItem('wms_endpoint_url');
      localStorage.removeItem('wms_session_expiry');
      localStorage.removeItem('wms_user_permissions');
      return null;
    }
    
    if (token && username && role) {
      let permissions = undefined;
      try {
        if (permissionsStr) permissions = JSON.parse(permissionsStr);
      } catch (e) {}
      return { token, username, role: role as any, permissions, endpointUrl: endpointUrl || '' };
    }
    return null;
  });

  // Dark / Light Theme Mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('wms_dark_mode');
    if (saved !== null) return saved === 'true';
    return false; // Default to Light Mode as requested by user
  });

  // Notifications
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    getNotificationPermissionStatus()
  );

  // Active module page
  const [activePage, setActivePage] = useState<ActivePage>('inventory');
  const [visitedPages, setVisitedPages] = useState<Set<ActivePage>>(() => new Set<ActivePage>(['inventory']));

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
  const [scannedData, setScannedData] = useState<ScannedItem[]>([]);
  const [currentCategory, setCurrentCategory] = useState<CategoryType>('SO');
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [productDatabase, setProductDatabase] = useState<ProductItem[]>([]);
  const [hasScannedSku, setHasScannedSku] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Modals & Drawers & Sidebar
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isUpdateDatabaseOpen, setIsUpdateDatabaseOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('wms_sidebar_collapsed') === 'true';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  // Custom confirm dialog (replaces window.confirm which is blocked in TWA/PWA Builder)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('wms_dark_mode', String(darkMode));
  }, [darkMode]);

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
    async () => {
      const mergedMap = new Map<string, ProductItem>();

      // 1. Load local cache immediately for 0ms instant UI availability (filter out any old dummy data)
      try {
        const cache: ProductItem[] = JSON.parse(localStorage.getItem('wms_product_cache') || '[]');
        if (Array.isArray(cache) && cache.length > 0) {
          const cleanCache = cache.filter((it) => it && (it.k || (it as any).sku) && !isDummyProduct(it));
          cleanCache.forEach((it) => {
            const sku = String(it.k || (it as any).sku || '').trim().toUpperCase();
            if (sku) mergedMap.set(sku, { ...it, k: sku });
          });
        }

        const invCache = JSON.parse(localStorage.getItem('wms_cache_inventory_v38') || '[]');
        if (Array.isArray(invCache) && invCache.length > 0) {
          invCache.forEach((it: any) => {
            const sku = String(it.k || it.sku || '').trim().toUpperCase();
            if (sku && !mergedMap.has(sku)) {
              mergedMap.set(sku, {
                k: sku,
                sku: sku,
                p: it.p || it.produk || it.nama_produk || sku,
                s: it.s || it.size || '-',
                f: it.f || {},
                d: it.d || {},
                b: it.b || {},
                l: it.l || [],
              });
            }
          });
        }

        if (mergedMap.size > 0) {
          setProductDatabase(Array.from(mergedMap.values()));
        }
      } catch {}

      // 2. Fetch fresh master products from Supabase (master_produk, view_stok_realtime, log_produk)
      try {
        const supabaseProducts = await fetchMasterProductsFromSupabase();
        if (supabaseProducts && supabaseProducts.length > 0) {
          supabaseProducts.forEach((it) => {
            if (it && it.k && !isDummyProduct(it)) {
              mergedMap.set(it.k.toUpperCase(), it);
            }
          });
        }
      } catch (err) {
        console.warn('Supabase product sync error:', err);
      }

      const finalList = Array.from(mergedMap.values()).filter((it) => !isDummyProduct(it));
      setProductDatabase(finalList);
      try {
        localStorage.setItem('wms_product_cache', JSON.stringify(finalList));
      } catch {}
    },
    []
  );

  const handleAddDiscoveredProducts = useCallback((newItems: ProductItem[]) => {
    setProductDatabase((prev) => {
      const map = new Map<string, ProductItem>();
      prev.forEach((it) => {
        if (it && it.k && !isDummyProduct(it)) map.set(it.k.toUpperCase(), it);
      });
      let hasNew = false;
      newItems.forEach((it) => {
        if (it && it.k && !isDummyProduct(it) && !map.has(it.k.toUpperCase())) {
          map.set(it.k.toUpperCase(), it);
          hasNew = true;
        }
      });
      if (!hasNew) return prev;
      const merged = Array.from(map.values()).filter((it) => !isDummyProduct(it));
      try {
        localStorage.setItem('wms_product_cache', JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  // Load product database on mount & session ready
  useEffect(() => {
    loadProducts();
    if (session) {
      requestScreenWakeLock();
    }
  }, [session, loadProducts]);

  // Set up Supabase Real-time listener for log_produk, master_produk, & other warehouse activity
  useEffect(() => {
    if (!session) return;

    let debounceCatalogTimer: any = null;
    try {
      const supabase = getSupabaseClient();
      const channel = supabase
        .channel('wms-realtime-activity')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'log_produk' },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const newLog = payload.new as { type?: string; sku?: string; lokasi?: string };
              showPushNotification('📦 Log Mutasi Baru', {
                body: `Mutasi #${newLog.type || 'LOG'}: ${newLog.sku || 'Barang'} di lokasi ${newLog.lokasi || '-'}`,
              });
            }
            globalRealtimeStore.notify('log_produk', payload);
            if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
            debounceCatalogTimer = setTimeout(() => {
              loadProducts();
            }, 300);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'master_produk' },
          (payload) => {
            globalRealtimeStore.notify('master_produk', payload);
            if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
            debounceCatalogTimer = setTimeout(() => {
              loadProducts();
            }, 300);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stock_opname_queue' },
          (payload) => {
            globalRealtimeStore.notify('stock_opname_queue', payload);
            if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
            debounceCatalogTimer = setTimeout(() => {
              loadProducts();
            }, 300);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'peminjaman' },
          (payload) => {
            globalRealtimeStore.notify('peminjaman', payload);
            if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
            debounceCatalogTimer = setTimeout(() => {
              loadProducts();
            }, 300);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'picking_list' },
          (payload) => {
            globalRealtimeStore.notify('picking_list', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'view_stok_realtime' },
          (payload) => {
            globalRealtimeStore.notify('view_stok_realtime', payload);
          }
        )
        .subscribe((status) => {
          setIsRealtimeConnected(status === 'SUBSCRIBED');
        });

      return () => {
        if (debounceCatalogTimer) clearTimeout(debounceCatalogTimer);
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Supabase realtime subscription error:', err);
    }
  }, [session, loadProducts]);

  const handleLogin = async (user: string, pass: string) => {
    const res = await verifySupabaseLogin(user, pass);
    if (res.success && res.token) {
      const newSession: UserSession = {
        token: res.token,
        username: res.user || user,
        role: res.role || 'Operator',
        permissions: res.permissions,
        endpointUrl: '',
      };
      setSession(newSession);
      localStorage.setItem('wms_session_token', res.token);
      localStorage.setItem('wms_session_username', res.user || user);
      localStorage.setItem('wms_user_role', res.role || 'Operator');
      localStorage.setItem('wms_endpoint_url', '');
      if (res.permissions) {
        localStorage.setItem('wms_user_permissions', JSON.stringify(res.permissions));
      } else {
        localStorage.removeItem('wms_user_permissions');
      }
      
      // Set session expiry to 7 days from now
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem('wms_session_expiry', expiry.toString());

      showToast(`Selamat datang, ${res.user || user} (${res.role || 'Operator'})!`, 'success');
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
    localStorage.removeItem('wms_user_role');
    localStorage.removeItem('wms_endpoint_url');
    localStorage.removeItem('wms_session_expiry');
    localStorage.removeItem('wms_user_permissions');
    setSession(null);
    setScannedData([]);
    releaseScreenWakeLock();
    showToast('Berhasil keluar dari akun.', 'info');
  };

  // Notification permission requester
  const handleRequestNotification = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      showToast('Push Notifikasi berhasil diaktifkan!', 'success');
      showPushNotification('🔔 Notifikasi Aktif', {
        body: 'WMS Scanner Gudang siap mengirim update aktivitas real-time.',
      });
    } else {
      showToast('Izin notifikasi tidak diizinkan oleh browser.', 'warning');
    }
  };

  // Handle Scanned Item
  const handleScannedItem = (rawText: string) => {
    const text = rawText.trim().toUpperCase();
    if (!text) return;

    // 1. Detect Category tag (#IN, #OUT, #SO) -> Just light up category indicator, do NOT add to scan list
    if (['#IN', '#OUT', '#SO', 'IN', 'OUT', 'SO'].includes(text) && (text.startsWith('#') || ['IN', 'OUT', 'SO'].includes(text))) {
      const cleanText = text.startsWith('#') ? text : `#${text}`;
      if (['#IN', '#OUT', '#SO'].includes(cleanText)) {
        const cat = cleanText.replace('#', '') as CategoryType;
        setCurrentCategory(cat);
        playCategoryBeep();
        vibrateDevice(60);
        showToast(`Kategori aktif: #${cat} (${cat === 'SO' ? 'Opname' : cat === 'IN' ? 'Masuk' : 'Keluar'})`, 'info');
        return;
      }
    }

    // 2. Detect Location tag (#LOK xxx, LOK xxx, #LOK:xxx) -> Just light up location indicator, do NOT add to scan list
    if (text.startsWith('#LOK') || text.startsWith('LOK ') || text.startsWith('LOK:')) {
      const loc = text.replace(/^#?LOK:?\s*/i, '').trim();
      if (loc) {
        setCurrentLocation(loc);
        playCategoryBeep();
        vibrateDevice(60);
        showToast(`Lokasi aktif: #${loc}`, 'info');
        return;
      }
    }

    // 3. Detect SKU Item
    let isInvalidSku = false;
    let productName = '';
    let size = '';

    let found = productDatabase.find((p) => p.k.toUpperCase() === text);
    if (!found) {
      // Fallback: partial match by SKU or Name (like Stok Lokasi)
      found = productDatabase.find((p) => 
        p.k.toUpperCase().includes(text) || 
        (p.p && p.p.toUpperCase().includes(text)) ||
        (p.n && p.n.toUpperCase().includes(text))
      );
    }

    if (!found) {
      if (productDatabase.length > 0) {
        isInvalidSku = true;
        playErrorBeep();
        vibrateDevice([100, 100, 100]);
        showToast(`Peringatan: SKU "${text}" tidak terdaftar di katalog!`, 'warning');
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

    if (!hasScannedSku && currentCategory === 'SO') {
      showToast('SKU discan dengan kategori default #SO (Opname).', 'info');
    }
    setHasScannedSku(true);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newItem: ScannedItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: found ? found.k : text,
      time: timeStr,
      isCategory: false,
      isLocation: false,
      isInvalidSku,
      productName,
      size,
      category: currentCategory,
      location: currentLocation || (found ? found.lokasi || '' : ''),
    };

    setScannedData((prev) => [...prev, newItem]);
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
    playCategoryBeep();
    vibrateDevice(40);
    showToast(`Kategori aktif diubah ke #${cat}`, 'info');
  };

  const handleSelectQuickLocation = (loc: string) => {
    setCurrentLocation(loc);
    playCategoryBeep();
    vibrateDevice(40);
    showToast(`Lokasi aktif diubah ke #${loc}`, 'info');
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
      const operatorName = `${session?.username || 'ScannerWeb'} | Staging`;
      const invoiceBase = `WEB-${waktuPesan.getTime()}`;

      for (let i = 0; i < scannedData.length; i++) {
        const item = scannedData[i];
        if (!item || item.isCategory || item.isLocation) continue;

        const line = item.text.trim().toUpperCase();
        if (!line) continue;

        const cType: CategoryType = item.category || currentCategory || 'SO';
        const cLokasi = item.location || currentLocation || 'DEFAULT';

        if (cType === 'IN' || cType === 'OUT') {
          const pData = productDatabase.find((p) => p.k.toUpperCase() === line);
          logsToInsert.push({
            type: cType,
            invoice: invoiceBase,
            sku: line,
            nama_produk: item.productName || (pData ? pData.p : line),
            size: item.size || (pData ? pData.s : ''),
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: 1,
            operator: operatorName,
            keterangan: ketText || `${cType} Staging Scan`,
            created_at: waktuPesan.toISOString(),
          });
        } else if (cType === 'SO') {
          if (!soFisik[cLokasi]) soFisik[cLokasi] = {};
          soFisik[cLokasi][line] = (soFisik[cLokasi][line] || 0) + 1;

          // Add to log_produk for SO scan as well
          const pData = productDatabase.find((p) => p.k.toUpperCase() === line);
          logsToInsert.push({
            type: 'SO',
            invoice: invoiceBase,
            sku: line,
            nama_produk: item.productName || (pData ? pData.p : line),
            size: item.size || (pData ? pData.s : ''),
            area: getAreaFromLokasi(cLokasi),
            lokasi: cLokasi,
            qty: 1,
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

            const pData = productDatabase.find((p) => p.k.toUpperCase() === sku.toUpperCase());
            soQueueToInsert.push({
              sesi_id: invoiceBase,
              tanggal: waktuPesan.toISOString(),
              sku,
              nama_produk: sysRow?.nama_produk || pData?.p || sku,
              size: sysRow?.size || pData?.s || '',
              lokasi,
              alasan: ketText
                ? `Pending Adjustment - ${ketText}`
                : selisih !== 0
                ? `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`
                : 'Opname Sesuai (Fisik = Sistem)',
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
          colors: ['#ff7a00', '#ffa726', '#ffffff'],
        });
      } catch {}

      showToast('Data scan berhasil disimpan ke Database!', 'success');
      showPushNotification('✅ Data Scan Tersimpan', {
        body: `Berhasil mencatat ${scannedData.length} item scan ke Database.`,
      });

      setScannedData([]);
      setKeterangan('');
      setCurrentCategory('SO');
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
    <div className="min-h-screen flex flex-row bg-[#f4f6f8] dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors font-sans selection:bg-[#ff7a00] selection:text-white">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Login Modal Overlay */}
      <LoginModal
        isOpen={!session}
        onLogin={handleLogin}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Modern Collapsible Sidebar (Mobile Drawer + Desktop Sidebar) */}
      <Sidebar
        session={session}
        activePage={activePage}
        onSelectPage={setActivePage}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotification}
        isRealtimeConnected={isRealtimeConnected}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenApkModal={() => setIsApkModalOpen(true)}
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
        onLogout={handleLogout}
        totalScannedCount={scannedData.length}
      />

      {/* Main App Container (Navbar + Page Content) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Navigation Header with Hamburger Toggle & Quick Actions */}
        <Navbar
          session={session}
          activePage={activePage}
          onSelectPage={setActivePage}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onToggleSidebarCollapse={toggleSidebarCollapse}
          isSidebarCollapsed={isSidebarCollapsed}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          notificationPermission={notificationPermission}
          onRequestNotification={handleRequestNotification}
          isRealtimeConnected={isRealtimeConnected}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenApkModal={() => setIsApkModalOpen(true)}
          onLogout={handleLogout}
          totalScannedCount={scannedData.length}
        />

        {/* Main Content Area based on active navigation tab with Keep-Alive */}
        <main className="flex-1 pb-6 p-1.5 sm:p-4">
          {activePage === 'scanner' && (
            <div className="block">
              <div className="grid grid-cols-2 bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold w-full sm:w-auto gap-1 mb-4">
                <button 
                  onClick={() => setScannerActiveTab('scan')} 
                  className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                    scannerActiveTab === 'scan'
                      ? 'bg-[#ff7a00] text-white font-extrabold shadow-[0_0_10px_rgba(255,122,0,0.3)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-center">Scan Barang</span>
                </button>
                <button 
                  onClick={() => setScannerActiveTab('recap')} 
                  className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                    scannerActiveTab === 'recap'
                      ? 'bg-[#ff7a00] text-white font-extrabold shadow-[0_0_10px_rgba(255,122,0,0.3)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-center">Rekap Scan</span>
                </button>
              </div>

              {scannerActiveTab === 'scan' ? (
                <div className="space-y-2">
                  {/* STICKY SCANNER CONTAINER ON MAIN SCANNER PAGE */}
                  <div className="sticky top-[48px] sm:top-[52px] z-20 bg-[#f4f6f8]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pb-1 -mt-1">
                    <div className="bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
                      <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />

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
                        currentCategory={currentCategory}
                        currentLocation={currentLocation}
                        onSelectCategory={handleSelectQuickCategory}
                        onSelectLocation={handleSelectQuickLocation}
                      />
                    </div>
                  </div>

                  <ScannedItemsList
                    items={scannedData}
                    onRemoveItem={handleRemoveItem}
                    onClearAll={handleClearAll}
                  />
                  
                  <BottomSaveBar
                    items={scannedData}
                    keterangan={keterangan}
                    onChangeKeterangan={setKeterangan}
                    onSave={handleSaveData}
                    isSaving={isSaving}
                  />
                </div>
              ) : (
                <ScannerTabRecap />
              )}
            </div>
          )}

          <React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳</span></div>}>
            {activePage === 'inventory' && (
                <InventoryView
                  session={session}
                  currentLocations={activeLocations}
                  productCatalog={productDatabase}
                  onNotify={showToast}
                  onRefreshCatalog={loadProducts}
                />
            )}

            {activePage === 'stock_opname' && (
                <StockOpnameView
                  session={session}
                  productCatalog={productDatabase}
                  onNotify={showToast}
                  onRefreshCatalog={loadProducts}
                />
            )}

            {activePage === 'mutasi_log' && (
                <MutasiLogView
                  session={session}
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

            {activePage === 'picking_tasks' && (
                <PickingTasksView
                  onNotify={showToast}
                  currentUser={session?.username || 'Operator'}
                  productCatalog={productDatabase}
                />
            )}
          </React.Suspense>
        </main>
      </div>

      {/* APK Installation Guide Modal */}
      <ApkInstallModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
        onNotify={showToast}
      />

      {/* Settings Modal (Supabase, GAS, Users, Device) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        session={session}
        onUpdateSession={(updated) => {
          setSession(updated);
          localStorage.setItem('wms_session_username', updated.username);
          localStorage.setItem('wms_user_role', updated.role);
          localStorage.setItem('wms_endpoint_url', updated.endpointUrl);
          if (updated.permissions) {
            localStorage.setItem('wms_user_permissions', JSON.stringify(updated.permissions));
          } else {
            localStorage.removeItem('wms_user_permissions');
          }
        }}
        onRefreshCatalog={loadProducts}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotification}
        isRealtimeConnected={isRealtimeConnected}
        onOpenUpdateDatabase={() => setIsUpdateDatabaseOpen(true)}
        onNotify={showToast}
      />

      {/* Update Database Modal (Superadmin Only: 2 CSV Import to Supabase) */}
      <UpdateDatabaseModal
        isOpen={isUpdateDatabaseOpen}
        onClose={() => setIsUpdateDatabaseOpen(false)}
        session={session}
        onNotify={showToast}
        onSuccess={() => {
          loadProducts();
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
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-sm shadow-rose-500/20 transition-all active:scale-95"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
