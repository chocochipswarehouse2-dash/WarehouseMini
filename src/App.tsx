/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
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
import { ManualScanInput } from './components/ManualScanInput';
import { CameraScanner } from './components/CameraScanner';
import { QuickTagToolbar } from './components/QuickTagToolbar';
import { ScannedItemsList } from './components/ScannedItemsList';
import { BottomSaveBar } from './components/BottomSaveBar';
import { LiveInventoryDrawer } from './components/LiveInventoryDrawer';
import { ApkInstallModal } from './components/ApkInstallModal';
import { ToastContainer } from './components/Toast';
import { PeminjamanView } from './components/PeminjamanView';
import { PickingTasksView } from './components/PickingTasksView';
import { SettingsModal } from './components/SettingsModal';

import {
  DEFAULT_GAS_ENDPOINT,
  triggerSheetSync,
} from './services/gasApi';
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
    
    if (token && username && role) {
      return { token, username, role, endpointUrl: endpointUrl || DEFAULT_GAS_ENDPOINT };
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
  const [activePage, setActivePage] = useState<ActivePage>('scanner');

  // Scan states
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
  const [isInventoryOpen, setIsInventoryOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('wms_sidebar_collapsed') === 'true';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

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
          const cleanCache = cache.filter((it) => it && it.k && !isDummyProduct(it));
          cleanCache.forEach((it) => {
            mergedMap.set(it.k.toUpperCase(), it);
          });
          if (cleanCache.length !== cache.length) {
            localStorage.setItem('wms_product_cache', JSON.stringify(cleanCache));
          }
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

  // Set up Supabase Real-time listener for log_produk & stock_opname_queue
  useEffect(() => {
    if (!session) return;

    try {
      const supabase = getSupabaseClient();
      const channel = supabase
        .channel('wms-realtime-activity')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'log_produk' },
          (payload) => {
            const newLog = payload.new as { type?: string; sku?: string; lokasi?: string };
            showPushNotification('📦 Log Mutasi Baru', {
              body: `Mutasi #${newLog.type || 'LOG'}: ${newLog.sku || 'Barang'} di lokasi ${newLog.lokasi || '-'}`,
            });
          }
        )
        .subscribe((status) => {
          setIsRealtimeConnected(status === 'SUBSCRIBED');
        });

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Supabase realtime subscription error:', err);
    }
  }, [session]);

  // Handle Login directly authenticated with Supabase
  const handleLogin = async (endpoint: string, user: string, pass: string) => {
    const res = await verifySupabaseLogin(user, pass);
    if (res.success && res.token) {
      const newSession: UserSession = {
        token: res.token,
        username: res.user || user,
        role: res.role || 'Operator',
        endpointUrl: endpoint || DEFAULT_GAS_ENDPOINT,
      };
      setSession(newSession);
      localStorage.setItem('wms_session_token', res.token);
      localStorage.setItem('wms_session_username', res.user || user);
      localStorage.setItem('wms_user_role', res.role || 'Operator');
      localStorage.setItem('wms_endpoint_url', endpoint || DEFAULT_GAS_ENDPOINT);

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

    const found = productDatabase.find((p) => p.k.toUpperCase() === text);
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
      text,
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
    if (confirm('Hapus semua daftar hasil scan saat ini?')) {
      setScannedData([]);
      showToast('Daftar scan dikosongkan.', 'info');
    }
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
          const systemStockForLokasi = currentStock.filter((s) => s.lokasi === lokasi);

          const allSkus = new Set([
            ...Object.keys(physicalCounts),
            ...systemStockForLokasi.map((s) => s.sku),
          ]);

          allSkus.forEach((sku) => {
            const qty_fisik = physicalCounts[sku] || 0;
            const sysRow = systemStockForLokasi.find((s) => s.sku === sku);
            const qty_sistem = sysRow ? sysRow.sisa_stok : 0;
            const selisih = qty_fisik - qty_sistem;

            if (selisih !== 0) {
              const pData = productDatabase.find((p) => p.k === sku);
              soQueueToInsert.push({
                sesi_id: invoiceBase,
                tanggal: waktuPesan.toISOString(),
                sku,
                nama_produk: sysRow?.nama_produk || pData?.p || sku,
                size: sysRow?.size || pData?.s || '',
                lokasi,
                alasan: ketText
                  ? `Pending Adjustment - ${ketText}`
                  : 'Pending Adjustment (Staging)',
                keterangan: ketText || 'Pending Adjustment',
                area: sysRow?.area || getAreaFromLokasi(lokasi),
                qty_sistem,
                qty_fisik,
                selisih,
                status: 'PENDING',
                jenis: 'Opname',
                operator: operatorName,
                invoice: invoiceBase,
              });
            }
          });
        });

        if (soQueueToInsert.length > 0) {
          await insertStockOpnameQueue(soQueueToInsert);
        }
      }

      // 3. Optional background sheet sync (non-blocking, running in background)
      if (session?.endpointUrl) {
        triggerSheetSync(session.endpointUrl).catch(() => {});
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

      showToast('Data scan berhasil disimpan ke Supabase!', 'success');
      showPushNotification('✅ Data Scan Tersimpan', {
        body: `Berhasil mencatat ${scannedData.length} item scan ke Supabase.`,
      });

      setScannedData([]);
      setKeterangan('');
      setCurrentCategory('SO');
      setCurrentLocation('');
      setHasScannedSku(false);
    } catch (err: unknown) {
      console.error(err);
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan atau Supabase Error';
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
        onOpenInventoryDrawer={() => setIsInventoryOpen(true)}
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
          onOpenInventoryDrawer={() => setIsInventoryOpen(true)}
          onLogout={handleLogout}
          totalScannedCount={scannedData.length}
        />

        {/* Main Content Area based on active navigation tab */}
        <main className="flex-1 pb-6 p-1.5 sm:p-4">
          {activePage === 'scanner' && (
            <div className="space-y-2">
              {/* STICKY SCANNER CONTAINER ON MAIN SCANNER PAGE */}
              <div className="sticky top-[48px] sm:top-[52px] z-20 bg-[#f4f6f8]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pb-1 -mt-1">
                <div className="bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
                  <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />

                  {scanMode === 'fisik' && (
                    <PhysicalScanInput onScan={handleScannedItem} products={productDatabase} />
                  )}

                  {scanMode === 'manual' && (
                    <ManualScanInput
                      onScan={handleScannedItem}
                      products={productDatabase}
                      onRefreshProducts={loadProducts}
                      onAddDiscoveredProducts={handleAddDiscoveredProducts}
                    />
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
        </main>
      </div>

      {/* Live Inventory & Real-time Audit Drawer */}
      <LiveInventoryDrawer
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        currentLocations={activeLocations}
        productCatalog={productDatabase}
        session={session}
        onRefreshCatalog={loadProducts}
        onNotify={showToast}
      />

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
        }}
        onRefreshCatalog={loadProducts}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        notificationPermission={notificationPermission}
        onRequestNotification={handleRequestNotification}
        isRealtimeConnected={isRealtimeConnected}
        onNotify={showToast}
      />
    </div>
  );
}
