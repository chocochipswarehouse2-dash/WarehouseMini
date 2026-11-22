---
name: wms-table-card-split-views
description: Standard blueprint for designing and maintaining the unified 2-Mode Views — Table View (Desktop Executive Table + Mobile Fit-to-Screen Compact List) and Card View (Single-Elevation Native App Cards) — across all WMS modules. Supersedes the deprecated 3-mode Panel Rapi (split) view. Always pair with wms-app-view-consistency.
---

# WMS Unified 2-Mode Views: Versi Tabel & Versi Kartu

> **Update Standar Global**: Mode **`Panel Rapi` (`split`) resmi dihapus/dideprekasi** pada halaman rekap dan daftar operasional WMS demi kesederhanaan, konsistensi lintas modul, dan ruang kerja yang lebih lega. Seluruh modul daftar/rekap WAJIB hanya menyediakan **2 opsi tampilan (`Tabel` & `Kartu`)** dengan merujuk pada `.agents/skills/wms-app-view-consistency/SKILL.md`.

---

## 1. 2-Mode View Switcher Standard

Persist the user's preferred view mode in `sessionStorage` with responsive default (`'card'` on `< 768px`, `'table'` on `>= 768px`), and render a clean 2-option segmented switcher in the top-right toolbar:

```tsx
const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem('module_view_mode');
    if (saved === 'table' || saved === 'card') return saved;
    return window.innerWidth < 768 ? 'card' : 'table';
  }
  return 'table';
});
```

```tsx
<div className="inline-flex p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800">
  <button type="button" onClick={() => handleSetViewMode('table')} className={...}>
    <Table className="w-3.5 h-3.5" />
    <span>Tabel</span>
  </button>
  <button type="button" onClick={() => handleSetViewMode('card')} className={...}>
    <LayoutGrid className="w-3.5 h-3.5" />
    <span>Kartu</span>
  </button>
</div>
```

---

## 2. Mode 1: Versi Tabel (`viewMode === 'table'`) — Dual-Mode Desktop & Mobile

### A. Desktop Executive Table (`hidden md:block`)
1. **Maksimal 5–6 Kolom Proporsional (`lg:table-fixed w-full`)**:
   - Checkbox (`w-10`)
   - Col 1 (`Pesanan & Store`): `lg:w-[20%]` — `#no_pesanan` (mono), 1 status badge, Store · Tanggal, PIC · Ref/DPOS (tipografi bersih, **TANPA kotak abu-abu bersarang**).
   - Col 2 (`Customer & Kurir`): `lg:w-[17%]` — Nama Customer, No. Telp (mono), Kurir, alamat clamped 2 baris.
   - Col 3 (`Produk`): `lg:w-[27%]` — Daftar item dengan pembatas hairline `divide-y` (Nama, Size, `×qty`, SKU, fulfillment, catatan alter).
   - Col 4 (`Dokumen & Resi`): `lg:w-[20%]` — Ringkasan 2–3 baris rapi (`SJ DealPOS`, `Resi / Jadwal`, `Pick ✓ · Label ✓`).
   - Col 5 (`Aksi`): `lg:w-[16%] text-right` — **Hanya 2 kontrol seragam**: `1 Primary Contextual CTA` + tombol `⋯` pembuka **Action Sheet Terkelompok** (DILARANG menaruh `<select>` mentah atau menebar tombol aksi di banyak kolom!).

### B. Mobile Native Compact List-Table (`md:hidden`) — ZERO Horizontal Scroll
- Di layar HP (`< 768px`), mode `Tabel` **WAJIB** tampil sebagai daftar ringkas pas 100% lebar layar (`divide-y bg-white dark:bg-slate-900`) tanpa scroll horizontal:
  - Ketuk baris langsung membuka modal Detail Lengkap.
  - Baris 1: Nama Customer (bold) + 1 status badge ringkas.
  - Baris 2: `#no_pesanan` (mono) · Store · Total Pcs · Kurir.
  - Baris 3: Item pertama (`+N item`) + indikator status mikro (`Alter`, `Resi ✓`, `SJ ✓`).
  - Sisi kanan: Tombol `⋯` (`w-10 h-10`) membuka **Native Slide-Up Bottom Action Sheet**.

---

## 3. Mode 2: Versi Kartu (`viewMode === 'card'`) — Single-Elevation App Cards

- Grid responsif: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4 p-1.5 sm:p-4`.
- **Single-Elevation Discipline**: 1 permukaan kartu bersih (`rounded-2xl border bg-white dark:bg-slate-900`) dipisah garis tipis `border-slate-100 dark:border-slate-800` — **ZERO kotak berwarna bersarang di dalam kartu**.
- **Footer Seragam 2 Kontrol**: `1 Primary Contextual CTA` (`flex-1 h-10 sm:h-9 rounded-xl`) + tombol `Aksi ⋯` (`h-10 sm:h-9 rounded-xl`) yang membuka Bottom Action Sheet di HP / Action Modal di Desktop.

---

## 4. Legacy Reference Notes (Sorting & Performance)
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
