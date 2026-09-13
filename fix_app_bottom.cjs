const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const lines = code.split('\n');
const errorBoundaryIdx = lines.findIndex(l => l.includes('<ErrorBoundary fallbackTitle="Kendala Memuat Halaman" onReset={() => window.location.reload()}>'));

if (errorBoundaryIdx !== -1) {
  const bottomCode = `          <ErrorBoundary fallbackTitle="Kendala Memuat Halaman" onReset={() => window.location.reload()}>
            <React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳</span></div>}>
              {activePage === 'dashboard' && (
                  <DashboardView />
              )}
              {activePage === 'packing' && (
                  <PackingView />
              )}
              {activePage === 'agenda' && (
                  <AgendaView />
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
                    onNotify={showToast}
                    onRefreshCatalog={loadProducts}
                  />
              )}
              {activePage === 'karyawan' && (
                  <KaryawanView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'presensi' && (
                  <PresensiView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'roster_shift' && (
                  <RosterShiftView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'lembur_cuti' && (
                  <LemburCutiView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'hr_approval' && (
                  <HrApprovalView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'hr_rekap' && (
                  <HrRekapView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'pesanan_saya' && (
                  <PesananSayaView
                    session={session}
                    productCatalog={productDatabase}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'pusat_resolusi' && (
                  <PusatResolusiView
                    session={session}
                    onNotify={showToast}
                  />
              )}
              {activePage === 'roadmap' && (
                  <RoadmapView />
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

      {/* Settings Modal (Supabase, GAS, Users, Device) */}
      <ThemePickerModal
        isOpen={isThemePickerOpen}
        onClose={() => setIsThemePickerOpen(false)}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        themeColor={themeColor}
        setThemeColor={setThemeColor}
        themeFont={themeFont}
        setThemeFont={setThemeFont}
        themeIconStyle={themeIconStyle}
        setThemeIconStyle={setThemeIconStyle}
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
        onNotify={showToast}
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

export default App;
`;
  
  const newCode = lines.slice(0, errorBoundaryIdx).join('\n') + '\n' + bottomCode;
  fs.writeFileSync('src/App.tsx', newCode);
  console.log('Fixed successfully');
}
