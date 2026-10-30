const fs = require('fs');
const path = require('path');

// 1. UPDATE src/components/InventoryView.tsx
const invPath = path.resolve('src/components/InventoryView.tsx');
let invCode = fs.readFileSync(invPath, 'utf8').replace(/\r\n/g, '\n');

// Replace ADA STOK button styling
invCode = invCode.replace(
  `            {/* ADA STOK FILTER */}
            <button
              type="button"
              onClick={() => setOnlyActive((prev) => !prev)}
              className={\`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer \${
                onlyActive
                  ? 'bg-amber-500 text-black border-amber-500 shadow-xs'
                  : 'bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }\`}
              title="Tampilkan hanya produk yang memiliki stok fisik di rak"
            >
              <Package className="w-3.5 h-3.5" />
              <span>ADA STOK</span>
            </button>`,
  `            {/* ADA STOK FILTER */}
            <button
              type="button"
              onClick={() => setOnlyActive((prev) => !prev)}
              className={\`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs \${
                onlyActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }\`}
              title="Tampilkan hanya produk yang memiliki stok fisik di rak"
            >
              <Package className="w-3.5 h-3.5" />
              <span>ADA STOK</span>
            </button>`
);

// Replace LOKASI & PRINT button
invCode = invCode.replace(
  `            {/* LOKASI & PRINT MODAL BUTTON */}
            <button
              type="button"
              onClick={() => handleOpenLokasiExport()}
              className="px-3 py-2 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Ekspor Data & Cetak PDF per Lokasi Rak"
            >
              <MapPin className="w-3.5 h-3.5" />
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LOKASI &amp; PRINT</span>
            </button>`,
  `            {/* LOKASI & PRINT MODAL BUTTON */}
            <button
              type="button"
              onClick={() => handleOpenLokasiExport()}
              className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Ekspor Data & Cetak PDF per Lokasi Rak"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">LOKASI &amp; PRINT</span>
            </button>`
);

// Replace CSV button
invCode = invCode.replace(
  `            {/* CSV EXPORT */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Unduh hasil inventori per area sebagai file CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}`,
  `            {/* CSV EXPORT */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Unduh hasil inventori per area sebagai file CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}`
);

// Replace REFRESH button
invCode = invCode.replace(
  `            {/* REFRESH BUTTON */}
            <button
              type="button"
              disabled={isRefreshing || phase === 'syncing'}
              onClick={handleManualRefresh}
              className="px-3 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Sinkronkan data terbaru dari database"
            >
              <RefreshCw className={\`w-3.5 h-3.5 \${isRefreshing || phase === 'syncing' ? 'animate-spin' : ''}\`} />
              <span className="hidden sm:inline">
                {isRefreshing || phase === 'syncing' ? 'SYNCING...' : 'REFRESH'}
              </span>
            </button>`,
  `            {/* REFRESH BUTTON */}
            <button
              type="button"
              disabled={isRefreshing || phase === 'syncing'}
              onClick={handleManualRefresh}
              className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Sinkronkan data terbaru dari database"
            >
              <RefreshCw className={\`w-3.5 h-3.5 text-amber-500 \${isRefreshing || phase === 'syncing' ? 'animate-spin' : ''}\`} />
              <span className="hidden sm:inline">
                {isRefreshing || phase === 'syncing' ? 'SYNCING...' : 'REFRESH'}
              </span>
            </button>`
);

fs.writeFileSync(invPath, invCode, 'utf8');
console.log('✅ [1/4] InventoryView.tsx updated!');

// 2. UPDATE src/components/inventory/RackCapacityDashboard.tsx
const rackPath = path.resolve('src/components/inventory/RackCapacityDashboard.tsx');
let rackCode = fs.readFileSync(rackPath, 'utf8').replace(/\r\n/g, '\n');

// A. Add pb-20 sm:pb-6 to top container
rackCode = rackCode.replace(
  `<div className="space-y-4 w-full">`,
  `<div className="space-y-4 w-full pb-20 sm:pb-6">`
);

// B. Mobile 2x2 grid symmetry + full-width top Utilisasi card
rackCode = rackCode.replace(
  `        {/* Total Utilisasi Gudang */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800">`,
  `        {/* Total Utilisasi Gudang (Full width on mobile, 1 col on desktop) */}
        <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-2xs">`
);

// C. Fix text cutoffs (remove truncate, add line-clamp-2)
rackCode = rackCode.replace(
  `<div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Klik untuk filter rak melebihi kapasitas
          </div>`,
  `<div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-tight">
            Klik untuk filter rak melebihi kapasitas
          </div>`
);

rackCode = rackCode.replace(
  `<div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Mendekati batas maksimum rak
          </div>`,
  `<div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-tight">
            Mendekati batas maksimum rak
          </div>`
);

rackCode = rackCode.replace(
  `<div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Terisi 1% - 74% dari kapasitas
          </div>`,
  `<div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-tight">
            Terisi 1% - 74% dari kapasitas
          </div>`
);

rackCode = rackCode.replace(
  `<div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Siap ditempati stok baru
          </div>`,
  `<div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-tight">
            Siap ditempati stok baru
          </div>`
);

fs.writeFileSync(rackPath, rackCode, 'utf8');
console.log('✅ [2/4] RackCapacityDashboard.tsx updated!');

// 3. UPDATE src/components/inventory/InventoryList.tsx
const listPath = path.resolve('src/components/inventory/InventoryList.tsx');
let listCode = fs.readFileSync(listPath, 'utf8').replace(/\r\n/g, '\n');

// Add table-fixed and proportional widths
listCode = listCode.replace(
  `<table className="w-full border-collapse text-left">
          {/* STICKY TABLE HEADER */}
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10.5px] border-b border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs">
            <tr>
              <th className="py-2.5 px-3 min-w-[190px]">
                <SortHead label="Product" asc="NAME_ASC" desc="NAME_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2 text-center w-[64px]">
                <SortHead label="Variant" asc="SIZE_ASC" desc="SIZE_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 min-w-[130px]">
                <SortHead label="Code" asc="SKU_ASC" desc="SKU_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2.5 w-[115px]">
                <SortHead label="Area" asc="AREA_ASC" desc="AREA_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-3 text-center w-[90px] bg-blue-50/50 dark:bg-blue-950/20 border-x border-slate-200 dark:border-slate-800">
                <SortHead label="DP" asc="DP_ASC" desc="DP_DESC" sort={sort} onSort={onSort} className="justify-center text-blue-700 dark:text-blue-300" />
              </th>
              <th className="py-2.5 px-3 text-center w-[90px]">
                <SortHead label="Fisik" asc="FISIK_ASC" desc="FISIK_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 min-w-[200px]">`,
  `<table className="w-full border-collapse text-left lg:table-fixed">
          {/* STICKY TABLE HEADER */}
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10.5px] border-b border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs">
            <tr>
              <th className="py-2.5 px-3 w-[24%] min-w-[180px]">
                <SortHead label="Product" asc="NAME_ASC" desc="NAME_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2 text-center w-[6%] min-w-[60px]">
                <SortHead label="Variant" asc="SIZE_ASC" desc="SIZE_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 w-[16%] min-w-[130px]">
                <SortHead label="Code" asc="SKU_ASC" desc="SKU_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2.5 w-[12%] min-w-[110px]">
                <SortHead label="Area" asc="AREA_ASC" desc="AREA_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-3 text-center w-[8%] min-w-[70px] bg-blue-50/50 dark:bg-blue-950/20 border-x border-slate-200 dark:border-slate-800">
                <SortHead label="DP" asc="DP_ASC" desc="DP_DESC" sort={sort} onSort={onSort} className="justify-center text-blue-700 dark:text-blue-300" />
              </th>
              <th className="py-2.5 px-3 text-center w-[8%] min-w-[70px]">
                <SortHead label="Fisik" asc="FISIK_ASC" desc="FISIK_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 w-[26%] min-w-[180px]">`
);

fs.writeFileSync(listPath, listCode, 'utf8');
console.log('✅ [3/4] InventoryList.tsx updated!');

// 4. UPDATE src/components/MutasiLogView.tsx
const mutasiPath = path.resolve('src/components/MutasiLogView.tsx');
let mutasiCode = fs.readFileSync(mutasiPath, 'utf8').replace(/\r\n/g, '\n');

// A. Container clamping to max-w-[1600px]
mutasiCode = mutasiCode.replace(
  `<div id="mutasiLogViewContainer" className="space-y-2 max-w-7xl mx-auto pb-12">`,
  `<div id="mutasiLogViewContainer" className="space-y-2 w-full max-w-[1600px] mx-auto pb-16">`
);

// B. Table fixed and proportional columns
mutasiCode = mutasiCode.replace(
  `<table className="w-full min-w-[880px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-2 w-10 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded text-primary-500 focus:ring-primary-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
                          checked={allCurrentIds.size > 0 && selectedIds.size >= allCurrentIds.size}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="py-3 px-2">Tipe & Waktu</th>
                      <th className="py-3 px-2">Invoice</th>
                      <th className="py-3 px-2">SKU & Produk</th>
                      <th className="py-3 px-2">Lokasi & Area</th>
                      <th className="py-3 px-2 text-center">Qty</th>
                      <th className="py-3 px-2">Operator & Catatan</th>
                      <th className="py-3 px-2 text-right">Aksi</th>
                    </tr>
                  </thead>`,
  `<table className="w-full min-w-[880px] text-left text-xs border-collapse lg:table-fixed">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-2 w-[4%] text-center">
                        <input 
                          type="checkbox" 
                          className="rounded text-primary-500 focus:ring-primary-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
                          checked={allCurrentIds.size > 0 && selectedIds.size >= allCurrentIds.size}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="py-3 px-2 w-[12%]">Tipe & Waktu</th>
                      <th className="py-3 px-2 w-[15%]">Invoice</th>
                      <th className="py-3 px-2 w-[25%]">SKU & Produk</th>
                      <th className="py-3 px-2 w-[13%]">Lokasi & Area</th>
                      <th className="py-3 px-2 w-[6%] text-center">Qty</th>
                      <th className="py-3 px-2 w-[19%]">Operator & Catatan</th>
                      <th className="py-3 px-2 w-[6%] text-right">Aksi</th>
                    </tr>
                  </thead>`
);

fs.writeFileSync(mutasiPath, mutasiCode, 'utf8');
console.log('✅ [4/4] MutasiLogView.tsx updated!');
