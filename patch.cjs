const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const search = `          {activePage === 'scanner' && (
            <div className="block">
              <div className="grid grid-cols-2 bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold w-full sm:max-w-sm gap-1 mb-4 lg:hidden">
                <button 
                  onClick={() => setScannerActiveTab('scan')} 
                  className={\`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 \${
                    scannerActiveTab === 'scan' 
                      ? 'bg-[#ff7a00] text-white font-extrabold shadow-[0_0_10px_rgba(255,122,0,0.3)]' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }\`}
                >
                  <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-center">Scan Barang</span>
                </button>
                <button 
                  onClick={() => setScannerActiveTab('recap')} 
                  className={\`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 \${
                    scannerActiveTab === 'recap' 
                      ? 'bg-[#ff7a00] text-white font-extrabold shadow-[0_0_10px_rgba(255,122,0,0.3)]' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }\`}
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-center">Rekap Scan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className={\`lg:col-span-5 xl:col-span-5 space-y-2 \${scannerActiveTab === 'recap' ? 'hidden lg:block' : 'block'}\`}>
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

                <div className={\`lg:col-span-7 xl:col-span-7 \${scannerActiveTab === 'scan' ? 'hidden lg:block' : 'block'}\`}>
                  <ScannerTabRecap />
                </div>
              </div>
            </div>
          )}`;
const replace = `          {activePage === 'scanner' && (
            <div className="max-w-2xl mx-auto block">
              <div className="space-y-4">
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
              </div>
            </div>
          )}`;
fs.writeFileSync('src/App.tsx', code.replace(search, replace));
