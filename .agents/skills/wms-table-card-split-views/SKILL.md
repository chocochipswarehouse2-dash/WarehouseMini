---
name: wms-table-card-split-views
description: Standard blueprint for designing and maintaining Table View (Versi Tabel), Card Grid View (Versi Kartu), and Master-Detail Split View (Panel Rapi) in WMS Inventory, including column proportions, sorting, multi-select batch actions, and rendering performance. Activate whenever working on data tables, order recaps, inventory lists, or view mode switchers.
---

# WMS Multi-View Architecture: Panel Rapi (Split), Versi Tabel & Versi Kartu

Whenever a module displays a collection of orders, shipments, returns, or inventory records, follow these exact structural standards for the View Mode Switcher and its three presentation modes (`split`, `table`, `card`), as well as rendering performance rules.

---

## 1. View Mode Switcher Standard

Persist the user's preferred view mode in `sessionStorage` and render a unified segmented button group in the top-right toolbar:

```tsx
<div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
  {/* 1. Panel Rapi (Master-Detail Split View) */}
  <button type="button" onClick={() => handleSetViewMode('split')} className={...}>
    <Layers className="w-3.5 h-3.5" />
    <span>Panel Rapi</span>
  </button>
  {/* 2. Versi Tabel (Full Spreadsheet Table) */}
  <button type="button" onClick={() => handleSetViewMode('table')} className={...}>
    <Table className="w-3.5 h-3.5" />
    <span>Tabel</span>
  </button>
  {/* 3. Versi Kartu (Responsive Card Grid) */}
  <button type="button" onClick={() => handleSetViewMode('card')} className={...}>
    <LayoutGrid className="w-3.5 h-3.5" />
    <span>Kartu</span>
  </button>
</div>
```

---

## 2. Mode 1: Versi Panel Rapi / Master-Detail Split View (`viewMode === 'split'`)

Designed for maximum visual clarity without cramped columns. Splits the workspace into a **Left Master List** and a **Right Detail & Action Workspace** (`grid grid-cols-1 lg:grid-cols-12 gap-4 items-start`):

### A. Left Pane (`lg:col-span-5 xl:col-span-4`) — Master List & Quick Filters
1. **Header**: Module title on the left (`font-extrabold text-base`), `{filteredOrders.length} ditampilkan` on the right.
2. **Stage Filter Pills (`rounded-full`)**: `Pesanan Baru`, `Sedang Diproses`, `Selesai`, `Dibatalkan`, `Semua` with live counts. Active pill uses `bg-indigo-600 text-white border-indigo-600 font-bold`.
3. **Search & Compact Sort/Filter Bar**: Search input + `Urutkan` dropdown + `Jenis` selector + `Filter` button (expands advanced filters inline) + `Reset` button.
4. **Sub-Filter Pills (Print Status)**: `Semua Status Cetak`, `Belum Cetak Label`, `Belum Cetak Picking`, `Sudah Cetak Label`.
5. **Multi-Select Row**: `Pilih semua` checkbox + compact batch action buttons (`SJ Struk`, `Label A6`, `Picking`, `WA Grup`) when `selectedOrders.size > 0`.
6. **Scrollable Master Card List (`max-h-[calc(100vh-270px)] overflow-y-auto divide-y`)**:
   - Active card highlight: `border-l-4 border-l-indigo-600 bg-indigo-50/35 dark:bg-indigo-950/30`.
   - **Row 1**: Checkbox + Customer Name (`font-extrabold text-xs sm:text-sm truncate`) + Stage Pill on the right.
   - **Row 2**: `{order.no_pesanan} · {order.nama_pengirim}` (`text-[11px] text-slate-500 pl-6 truncate`).
   - **Row 3**: First product name & size + `+{extraCount} lainnya` (`text-xs font-semibold pl-6 truncate`).
   - **Row 4**: **4-Segment Progress Bar** (`grid-cols-4 gap-1.5 h-1` for `Label`, `Picking`, `Resi`, `Kirim`) + status text on the right (`Menunggu resi` or resi number).

### B. Right Pane (`lg:col-span-7 xl:col-span-8 lg:sticky lg:top-3`) — Detail & Action Workspace
1. **Top Header**:
   - Left: Customer Name (`text-lg sm:text-xl font-extrabold`) + Stage Badge + `Fulfillment Anda` badge + subtitle (`#no_pesanan · nama_pengirim · tanggal · jasa_kirim`).
   - Right: Primary action buttons (`Kirim` / `Sudah Kirim WH`, `SJ Struk`, and `Detail` eye icon).
2. **4-Step Interactive Workflow Stepper (`grid-cols-2 sm:grid-cols-4 gap-2.5`)**:
   - `1. Label`, `2. Picking`, `3. Resi`, `4. Kirim`.
   - Completed steps show light emerald background (`bg-emerald-50/70 border-emerald-400`) and an indigo circle with a white checkmark (`✓`). Clicking steps 1–3 triggers the corresponding print or resi modal (for authorized roles).
3. **Middle 2-Column Body (`grid-cols-1 xl:grid-cols-12 gap-5`)**:
   - **Left (`xl:col-span-7`) — `Rincian produk ({totalPcs} pcs)`**: Clean item cards showing product name, size, `x{qty}`, fulfillment store/marketplace, SKU, alteration instructions/photos, and right-aligned item status/action (`Tandai Terima`, `Sudah Terima`, `Belum Terima WH`, `Tandai Sold`, `Pulihkan`).
   - **Right (`xl:col-span-5`) — `Resi` & `Info pesanan`**:
     - `Resi`: Shows `Menunggu resi` + `+ Input Resi` button, or the resi number + Copy + `WA Customer` + `Ubah Resi`.
     - `Info pesanan`: 12-column key-value grid (`PIC`, `Ref`, `DealPOS`, `SJ & Jadwal`, `SJ DealPOS`, `No. Telp`, `Alamat`, `Catatan`).
4. **Bottom 2-Column Footer (`Cetak` & `Aksi lainnya`)**:
   - **Left (`Cetak`)**: Pill buttons for `✓ Label A6`, `✓ Picking A4`, `Picking WA Grup`, `SJ Struk Kasir`, `SPK Penjahit`.
   - **Right (`Aksi lainnya`)**: Pill buttons for all role-authorized actions (`Cetak SPK Gudang`, `Tandai Dikirim Store`, `Tandai Diterima Warehouse`, `Input Bukti Kirim & Selesai`, `Input SJ DealPOS`, `Update Resi`, `Notifikasi WA ke Store`, `Kirim WA Alter`, `Edit Pesanan`, `Batalkan Pesanan`, `Hapus`, or `Ajukan Batal ke Admin`).

---

## 3. Mode 2: Versi Tabel (`viewMode === 'table'`)

For users who prefer a traditional multi-column spreadsheet view:

1. **Proportional Column Widths (`table-auto lg:table-fixed`)**:
   - Explicitly assign percentage widths on `lg:` headers so columns never crush each other:
     - Checkbox: `w-9 text-center`
     - Col 1 (`No. Pesanan & Store`): `lg:w-[20%]`
     - Col 2 (`Customer & Pengiriman`): `lg:w-[16%]`
     - Col 3 (`Rincian Produk & Alteration`): `lg:w-[23%]`
     - Col 4 (`DealPOS (SJ & Jadwal)`): `lg:w-[15%]`
     - Col 5 (`Resi & Cetak`): `lg:w-[14%]`
     - Col 6 (`Aksi`): `lg:w-[12%] text-right`
2. **Interactive Sortable Headers**:
   - Clicking column headers (`No. Pesanan & Store`, `Customer & Pengiriman`, `Rincian Produk`, `Resi & Cetak`) cycles `sortBy` state and highlights the `ArrowUpDown` icon in indigo.
3. **Structured Cell Content**:
   - **Col 1**: Row 1 = Status badge + Store badge; Row 2 = Clickable `#no_pesanan` + Date; Row 3 = Bordered metadata box (`PIC Store`, `ID Ref`, `DPOS`) with `justify-between` rows (no hanging dots).
   - **Col 3**: Total Pcs badge + Alter/Photo count badges on top, followed by a single clean `divide-y` container listing each item with its name, `x{qty}`, SKU/Size, fulfillment badge (left), and action button (right).
   - **Col 5**: Resi box on top + 2-column print button grid (`Label A6` | `Pick A4`) + full-width `Picking WA Grup` button below.
   - **Col 6 (`Aksi`)**: Right-aligned container (`max-w-[138px] ml-auto flex flex-col gap-1`) with Row 1 (`SJ Struk` + `WA Store` + `Detail` icons), Row 2 (`Kirim ke WH` / `Sudah Kirim WH`), and Row 3 (`Pilih Aksi...` select dropdown).

---

## 4. Mode 3: Versi Kartu (`viewMode === 'card'`)

For visual scanning across a responsive multi-column grid:

1. **Grid Container**:
   - `p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
2. **Card Anatomy (`flex flex-col justify-between rounded-xl border bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-shadow`)**:
   - **Card Header**: Checkbox + Clickable `#no_pesanan` + Quick status/print badges (`renderOrderBadges`) + Date on the left; Stage status badge on the right.
   - **Card Body (`flex-1 p-4 space-y-3`)**:
     - Store & PIC info block (`nama_pengirim`, `pic_store`, `no_transaksi_customer`, `no_transaksi_pengirim`).
     - Customer & Courier block (`nama_tujuan`, `no_telp_tujuan`, `alamat_tujuan`, `jasa_kirim`).
     - Scrollable/compact product list with per-item fulfillment and `Tandai Terima` / `Tandai Sold` actions.
     - DealPOS SJ & Resi status boxes.
   - **Card Footer (`p-3 bg-slate-50 dark:bg-slate-800/60 border-t flex items-center justify-between gap-2`)**:
     - Quick print/WA buttons + `Pilih Aksi...` dropdown.

---

## 5. Frontend Performance & Pagination Rules for Heavy Views

1. **$O(1)$ Lookup Maps Over Nested `.find()`**:
   - NEVER call `productCatalog.find(...)` inside a table or card `.map()` loop (which causes $O(N \times M)$ UI freezes on tabs like `Produksi` or `Inventory`).
   - Always precompute a `useMemo` `Map<string, string>` (e.g., `catalogNameMap`) once and perform $O(1)$ `.get(sku)` lookups inside render loops.
2. **Client-Side Pagination for Multi-Table / Spreadsheet Views**:
   - When rendering grouped tables or spreadsheets with dozens of groups (e.g., `ProduksiSpreadsheetView`), always paginate the groups (`10`, `20`, `50`, or `Semua` per page) with `Prev` / `Next` controls so initial tab mount is instantaneous (`< 100ms`).
3. **Non-Blocking Mounts**:
   - Never `await` heavy database cleanup or full-table scans before rendering cached/initial state; run background maintenance asynchronously without blocking the UI thread.
