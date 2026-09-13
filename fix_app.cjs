const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const lines = code.split('\n');
const startIdx = lines.findIndex(l => l.includes("{activePage === 'operasi_stok' && ("));
const endIdx = lines.findIndex(l => l.includes("{activePage === 'peminjaman' && ("));

if (startIdx !== -1 && endIdx !== -1) {
  const newLines = `
              {activePage === 'operasi_stok' && (
                <OperasiStokView
                  scannerComponent={
                    <div className="block">
                      <div className="max-w-2xl mx-auto space-y-4">
                        <div className="space-y-2">
                          <div className="sticky top-[48px] sm:top-[52px] z-20 bg-[#f4f6f8]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pb-1 -mt-1">
                            <div className="bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 shadow-md">
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
                            onUpdateCategory={handleUpdateItemCategory}
                          />
                          <BottomSaveBar
                            items={scannedData}
                            keterangan={keterangan}
                            onChangeKeterangan={setKeterangan}
                            onSave={handleSaveData}
                            isSaving={isSaving}
                          />
                        </div>
                      </div>
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
`;

  code = lines.slice(0, startIdx).join('\n') + newLines + lines.slice(endIdx).join('\n');
  fs.writeFileSync('src/App.tsx', code);
  console.log("Fixed successfully!");
} else {
  console.log("Indices not found", startIdx, endIdx);
}
