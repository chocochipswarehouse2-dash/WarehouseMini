---
name: wms-ui-ux-design-system
description: Master UI/UX design system for WMS Inventory covering color themes (Light/Dark), typography scale, component sizing, badge standards, visual neatness, and role-aware frontend hygiene. Activate whenever creating, styling, refactoring, or reviewing any React component or view.
---

# WMS UI/UX Design System & Visual Neatness Standard

Use this skill whenever designing, building, or tidying up any frontend interface in the WMS Inventory application. Every screen must look cohesive, scannable, and balanced across Light and Dark modes.

---

## 1. Color Theme & Semantic Palette Standard (Light & Dark Mode)

All components MUST support both Light Mode and Dark Mode (`dark:`) using the following semantic color tokens:

| Semantic Role | Usage Context | Light Mode Classes | Dark Mode Classes |
| :--- | :--- | :--- | :--- |
| **Primary Brand / Active** | Primary buttons, active tabs, selected cards, focus rings, links | `bg-indigo-600 text-white` / `bg-indigo-50 text-indigo-700 border-indigo-200` | `dark:bg-indigo-500` / `dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800` |
| **Success / Completed** | Status `Selesai` / `Dikirim`, `Sudah Terima`, `Label OK`, `SJ Lengkap`, `Resi` | `bg-emerald-50 text-emerald-700 border-emerald-300` (Solid: `bg-emerald-600 text-white`) | `dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700` |
| **Warning / Pending** | Status `Pesanan Baru`, `Menunggu Resi`, `Butuh SJ`, `Belum Terima WH`, `Belum Cetak` | `bg-amber-50 text-amber-800 border-amber-300` (Solid: `bg-amber-500 text-white`) | `dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700` |
| **In-Progress / Info** | Status `Sedang Diproses`, `Kirim ke WH`, active fulfillment | `bg-blue-50 text-blue-700 border-blue-300` or `bg-indigo-50 text-indigo-700 border-indigo-200` | `dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800` |
| **Danger / Critical** | Status `Dibatalkan`, `SOLD OUT`, `Anomali`, `Batalkan Pesanan`, delete actions | `bg-rose-50 text-rose-700 border-rose-200` (Solid: `bg-rose-600 text-white`) | `dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800` |
| **Special / Alteration** | Alteration & Repair indicators, `SPK Penjahit`, `Form Alter` | `bg-rose-50 text-rose-700 border-rose-200` or `bg-purple-50 text-purple-700 border-purple-200` | `dark:bg-rose-950/60 dark:text-rose-300` / `dark:bg-purple-950/60 dark:text-purple-300` |
| **Neutral Surface (L0)** | App background / scrollable workspace canvas | `bg-slate-50/50 text-slate-900` | `dark:bg-slate-900/50 dark:text-slate-100` |
| **Primary Card (L1)** | Main panels, table wrappers, master-detail panes, modals | `bg-white border-slate-200 shadow-2xs` | `dark:bg-slate-900 dark:border-slate-800` |
| **Sub-Card / Box (L2)** | Product item rows, metadata boxes, filter bars | `bg-slate-50/90 border-slate-200/80` | `dark:bg-slate-800/50 dark:border-slate-700/70` |

---

## 2. Typography & Sizing Scale (Standar Ukuran)

Maintain strict typographic hierarchy so high-density warehouse data remains effortless to scan:

1. **Page / Module Header Title**:
   - `text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight`
2. **Detail Panel / Customer Header Title**:
   - `text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight`
3. **Card Title / Primary Entity Name**:
   - `text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white`
4. **Standard Body / Product Name / Input Text**:
   - `text-xs font-semibold text-slate-800 dark:text-slate-100`
5. **Subtitle / Secondary Info (Store Name, Date, Address)**:
   - `text-[11px] text-slate-500 dark:text-slate-400 leading-snug`
6. **Compact Table Metadata / Micro Labels**:
   - `text-[10px]` or `text-[9.5px] font-medium text-slate-500 dark:text-slate-400`
7. **Status Badges & Pills**:
   - Pill shape (Stage / Filter / Status): `px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border`
   - Compact Tag (Table / Item Tag): `px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border`
8. **Monospace Identifiers (MANDATORY)**:
   - Always apply `font-mono` to `no_pesanan`, `sku`, `no_resi`, `no_sj_dealpos`, `no_transaksi_pengirim`, `no_transaksi_customer`, `invoice_picking`, and phone numbers.

---

## 3. Component Dimensions & Alignment Rules (Standar Kerapian)

1. **Uniform Toolbar Control Height**:
   - Every control in a header or filter bar (search inputs, `<select>` dropdowns, filter toggle buttons, action buttons) MUST share consistent vertical sizing: `py-1.5 px-2.5 text-xs rounded-lg` (or `rounded-xl` for primary panels).
2. **No Dangling Separators (`·` or `•`)**:
   - NEVER hardcode a separator dot (`·`) next to an optional field that might be empty.
   - Either join non-empty values dynamically (`[order.no_pesanan, order.nama_pengirim, dateStr].filter(Boolean).join(' · ')`) or use a structured key-value grid (`grid grid-cols-12` or `flex items-center justify-between`).
3. **Maximum 3 Visual Nesting Levels**:
   - Avoid putting bordered boxes inside bordered boxes inside bordered boxes.
   - Limit to: **Level 1** (Main Panel/Card) $\rightarrow$ **Level 2** (Item/Section Container) $\rightarrow$ **Level 3** (Inline Badge/Button).
4. **Truncation & Line Clamping**:
   - Use `truncate` for single-line IDs, store names, and SKUs (always pair with `title={fullValue}` so hovering reveals the full text).
   - Use `line-clamp-1` or `line-clamp-2` for long addresses or product names in compact views.
5. **Consistent Icon Sizing**:
   - Inside micro badges (`text-[9.5px]` / `text-[10px]`): `w-2.5 h-2.5 shrink-0`
   - Inside standard buttons & inputs (`text-xs`): `w-3.5 h-3.5 shrink-0`
   - Inside section headers (`text-base` / `text-lg`): `w-5 h-5 shrink-0`

---

## 4. Role-Aware UI Hygiene (Store vs. Admin Gudang)

1. **Strict Permission Guarding**:
   - Admin-only actions (`Batalkan Pesanan`, `Hapus Pesanan`, `Edit Pesanan`, `Tandai Sold`, `Tandai Terima`, `Input SJ DealPOS`, `Update Resi`, `Picking WA Grup`) MUST be guarded by `userIsAdmin`.
   - Store users (`isStoreUser`) must see clean, read-only status indicators (`Belum Terima WH`, `Sudah Terima`, `Menunggu Resi`, `Label OK`) and Store-authorized actions (`SJ Struk`, `Kirim` / `Tandai Dikirim Store`, `Notifikasi WA ke Store`, `Ajukan Batal ke Admin`).
2. **FAQ Synchronization**:
   - Whenever buttons, badges, or workflows are added or renamed in order/shipment tabs, immediately synchronize `src/data/initialStoreFaq.ts` so miniature UI badges (`button_badges`) match the live UI.

---

## 5. Toolbar & Button Hierarchy (Anti-Pelangi Tombol)

1. **Maximum ONE Primary Solid Action Button per Toolbar**:
   - In any header, toolbar, or filter row, there MUST only be **at most ONE** solid colored action button (e.g. `bg-indigo-600 text-white` or `bg-emerald-600 text-white` for the single most important action like `+ Tambah`, `Simpan`, or `Push Sheet`).
2. **Secondary & Utility Buttons MUST Be Neutral Outline/Ghost**:
   - All secondary actions (`Refresh`, `Export CSV`, `Buka Sheet`, `Filter`, `Lokasi & Print`, `Ada Stok`) MUST use neutral outline styling:
     `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs`
   - **HARD CONSTRAINT (NO RAINBOW BUTTONS)**: NEVER place multiple solid brightly colored buttons side-by-side (e.g., solid orange + solid blue + solid green + solid yellow in one bar). Solid colors are reserved strictly for status pills or critical primary triggers.
3. **Pills & State Filters**:
   - Toggle filters (e.g. `Ada Stok`, `Semua Area`) should use subtle active indicator states (`bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900` when active, or soft tint `bg-indigo-50 text-indigo-700 border-indigo-200` when selected) rather than heavy neon solids.

---

## 6. Global Layout Container & Zoom In/Out Clamping

1. **Max-Width Boundary (`max-w-[1600px] w-full mx-auto`)**:
   - All main view bodies and workspaces MUST be wrapped in a consistent container:
     `<div className="w-full max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">`
   - **Anti-Void & Anti-Infinite-Stretch**: This prevents ultra-wide monitors (`1920px`, `2560px`, `4K`) or browser Zoom-Out (`67%`–`90%`) from stretching table rows into endless single-line voids with miles of empty space between columns.
   - **No Ultra-Narrow Isolations**: Conversely, never isolate full desktop dashboards into an arbitrary `max-w-4xl` box unless it is explicitly an isolated single-form document.
2. **Fluid Elasticity Under Browser Zoom**:
   - **Zoom In (`110%`–`150%`)**: Flexible wrap layouts (`flex flex-wrap items-center gap-2`), collapsible secondary filters, and isolated table wrappers (`w-full overflow-x-auto`) ensure no horizontal breakage of the outer page.
   - **Zoom Out (`67%`–`90%`)**: Container auto-centering (`mx-auto`) keeps the visual focal point centered with balanced left and right margins.

---

## 7. Table Proportions & Dead Space Elimination (`table-fixed`)

1. **Mandatory Column Width Proportions**:
   - Large data tables on desktop (`lg:`) MUST use `lg:table-fixed w-full` with explicit proportional width classes (`w-[5%]`, `w-[15%]`, `w-[25%]`, `w-[10%]`) on `<th className="...">` headers.
   - Never allow a random middle column to absorb 80% of the screen width creating an unsightly visual void.
2. **Text Scanning Line-Length Guard**:
   - High-density data cells (SKU, Product, Operator, Lokasi) must have maximum column constraints with `truncate` or `line-clamp-1` to maintain visual rhythmic balance across columns.
