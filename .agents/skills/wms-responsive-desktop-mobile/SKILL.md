---
name: wms-responsive-desktop-mobile
description: Responsive frontend engineering standard for WMS Inventory across Desktop (wide screens, multi-pane, keyboard/scanner) and Mobile/HP Seluler (touch targets, collapsible filters, portrait handheld UX). Activate whenever building or modifying layouts, modals, toolbars, forms, or views.
---

# WMS Desktop & Mobile (HP / Seluler) Responsive Design Standard

The WMS Inventory application is used simultaneously by **Admin Gudang on Desktop monitors** (`1366px`–`1920px+`) and **Warehouse Pickers / Store Staff on Mobile phones (HP Seluler)** (`360px`–`430px` portrait). Every view, modal, toolbar, and form MUST be engineered for both form factors without compromise.

---

## 1. Breakpoint Architecture

Use Tailwind CSS responsive prefixes consistently across all components:
- **Base (`< 640px` — HP / Seluler Portrait)**: Single-column stacks (`grid-cols-1`), compact padding (`p-3`), wrapped toolbars (`flex-wrap`), touch-friendly buttons.
- **`sm:` (`>= 640px` — Large Phone / Small Tablet)**: 2-column form grids (`sm:grid-cols-2`), inline filter rows (`sm:flex-row`), visible button text labels (`hidden sm:inline`).
- **`md:` (`>= 768px` — Tablet)**: 2-to-3 column card grids (`md:grid-cols-2`), expanded metadata columns.
- **`lg:` (`>= 1024px` — Desktop Standard)**: Split-pane Master-Detail (`lg:grid-cols-12`), fixed-proportion tables (`lg:table-fixed`), sticky detail panels (`lg:sticky lg:top-3`), 3-column card grids (`lg:grid-cols-3`).
- **`xl:` (`>= 1280px` — Widescreen Desktop)**: 4-column card grids (`xl:grid-cols-4`), side-by-side internal sub-columns inside detail panels (`xl:grid-cols-12`).

---

## 2. Mobile (HP / Seluler) Ergonomics & Rules

1. **Zero Unintended Horizontal Page Scroll**:
   - Never allow a child element to push the mobile viewport wider than `100vw`.
   - Always add `min-w-0` to flex/grid children that contain long strings (`truncate` or `break-all` for long Order IDs, resi numbers, and URLs).
   - For wide data tables (`viewMode === 'table'`), wrap the `<table>` inside `<div className="w-full overflow-x-auto">` so horizontal scrolling is strictly isolated to the table container.
2. **Touch Target Sizing**:
   - Interactive buttons, checkboxes, and stage pills on mobile must be easy to tap without mis-clicks (`py-1.5 px-2.5` minimum for pills, `w-4 h-4` or padded `<label>` for checkboxes).
   - Keep destructive actions (`Hapus`, `Batalkan Pesanan`) visually separated from primary actions (`Kirim`, `Simpan`, `SJ Struk`).
3. **Collapsible Filter Toolbars (Hemat Ruang Layar HP)**:
   - On mobile, never stack 8 dropdown filters permanently open at the top of the screen (which pushes data below the fold).
   - Keep only the **Search Input**, **Sort Selector**, and **Filter Toggle Button** (with active filter count badge) visible on the main row, and render secondary filter dropdowns inside a collapsible `{isFilterExpanded && (...)}` grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2`).
4. **Responsive Modals & Bottom-Safe Footers**:
   - Modal overlays: `fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4`.
   - Modal container: `w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl`.
   - Always make the modal body `flex-1 overflow-y-auto p-4 sm:p-5` while keeping the modal header and footer `shrink-0` so the **Simpan / Konfirmasi** button is never hidden off-screen on small phone displays.
5. **Responsive Action Labels**:
   - For secondary utility buttons in top headers (e.g., `Refresh`, `Muat Ulang Penuh`, `Export CSV`), use `<span className="hidden sm:inline">Label Lengkap</span>` paired with an icon or short label `<span className="sm:hidden">Ringkas</span>` so the header bar stays clean on 360px screens.

---

## 3. Desktop Ergonomics & High-Density Productivity

1. **Master-Detail Split Workspace (`lg:grid-cols-12`)**:
   - On desktop (`lg:`), Master-Detail views place the scrollable Master List on the left (`lg:col-span-5 xl:col-span-4 max-h-[calc(100vh-270px)] overflow-y-auto`) and the sticky Detail & Action Workspace on the right (`lg:col-span-7 xl:col-span-8 lg:sticky lg:top-3`).
   - On mobile (`< 1024px`), the Master-Detail layout stacks vertically (`grid-cols-1`) so mobile users can tap an order card and scroll smoothly to its detail workspace.
2. **Hover & Tooltip Affordances**:
   - Always provide descriptive `title="..."` attributes on truncated text, icon buttons, and sortable table headers (`ArrowUpDown`) for instant desktop mouse-over clarity.
3. **Hardware Barcode Scanner Compatibility**:
   - Ensure scan inputs (`PhysicalScanInput`) handle rapid keyboard-wedge barcode input and `Enter` key submission cleanly without triggering unintended form resets.
