---
name: wms-print-receipt-documents
description: Unified operational document, print layout, thermal receipt, and WhatsApp broadcast standard for WMS Inventory covering (1) Picking List / SJ Cetak A4, (2) Picking List WA Grup, (3) Picking List Tugas Picking (Refill/SPS/Shopee), (4) Label Pengiriman Paket A6 (100x150mm), and (5) Cetak Ukuran Struk Kasir Thermal (58mm/60mm & 80mm). Activate whenever creating, modifying, or reviewing print templates, @media print styles, QR codes, receipt modals, or WA Picking broadcast messages.
---

# WMS Operational Documents, Print & Picking WA Unified Standard

All 5 operational outputs in WMS Inventory (**Picking List / SJ Cetak A4**, **Picking List WA Grup**, **Picking List Tugas Picking**, **Label Pengiriman Paket A6**, and **Cetak Ukuran Struk Kasir 58mm/80mm**) MUST follow a single unified data-enrichment, sorting, and visual layout standard across all modules (`ManualShipmentTab`, `AlterationRepairTab`, `ReturBarangTab`, `IGLiveTab`, `SuratJalanPeminjamanView`, and `PickingTasksView`).

---

## 1. The 5 Unified Operational Formats Matrix

| No | Format Name | Media / Dimensions | Primary Modules | Core Purpose |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Picking List / SJ Cetak A4** | `A4 Portrait` (`210mm x 297mm`, margin `4mm 6mm`) | Manual Shipment, Retur Barang (`RTR-`), IG Live, SPS, Tugas Picking | Physical multi-order or single-SJ rack checklist for warehouse pickers & QC |
| **2** | **Picking List WA Grup** | WhatsApp Monospace + Tree Format via Fonnte API | Manual Shipment, Retur Barang, SPS (`generatePeminjamanGroupMessage`), Refill (`generateRefillPickingGroupMessage`) | Instant mobile picking broadcast to Warehouse WhatsApp Group |
| **3** | **Picking List Tugas Picking** | Interactive Web / Scanner View + Print (`PickingTasksView.tsx`) | Refill Store, SPS Peminjaman, Shopee / Marketplace Queue | Real-time queue synced with `#OUT [invoice_picking]` WA/Scanner mutations |
| **4** | **Label Pengiriman Paket A6** | `100mm x 150mm` (`h-[148mm] max-h-[148mm]`) Thermal Sticker | Manual Shipment, Retur Barang (`RTR-`), IG Live | Outer parcel shipping sticker with QR, Courier, Recipient/Sender, and Item Table |
| **5** | **Cetak Ukuran Struk Kasir** | `58mm/60mm` (Mini POS 6cm) & `80mm` (Standard POS 8cm) Roll | `SuratJalanAlterReceiptModal`, `AlterationRepairReceiptModal`, Thermal Picking | Rangkap 2 physical handover receipt (Store $\leftrightarrow$ Warehouse / Penjahit) |

---

## 2. Shared Data Enrichment & Filtering Rules (Mandatory Across All 5 Formats)

Before rendering any of the 5 formats, the data pipeline MUST enforce the exact same 4 rules:

1. **Active Item Filtering**:
   - Exclude any item marked `is_sold_out` / `status === 'sold_out'` or `cancelled` from active picking totals, or explicitly render Qty as `0` with strikethrough on historical receipts.
2. **Retur Barang (`RTR-`) Isolation Rule**:
   - In `ReturBarangTab` (`PusatResolusiView`), **Label A6**, **Picking List A4**, and **Picking WA Grup** MUST ALWAYS render `produk_pengganti` (Replacement Items), NEVER `produk_pesanan` (returned items).
3. **Live Location Enrichment & Picking Prioritization Hierarchy**:
   - Enrich every SKU against `stok_real_fisik` (`fetchStockForSkus`) and sort candidate locations strictly by priority:
     - **Priority 1**: `Warehouse` (`A001`–`D100`) + `Aksesoris` (`BELT`, `CARD`, `GIFT`, `BOX`) + `Transit` (`X` / `TRANSIT`)
     - **Priority 2**: `Kolian` (`R0...`, `V0...`, `Z0...`)
     - **Priority 3**: `Blok F` (`TIKTOK`, `SHOPEE`, `STUDIO`)
     - **Priority 4 (Fallback)**: Empty / `Belum Ada Rak`
     - **Store Fulfillment Override**: If `item.fulfillment` is a Store (not `Warehouse`/`Gudang`/`Marketplace`), display the **Store Code** (`getStoreCode(ful)`, e.g., `MKG`, `CPJ`, `LVT`) instead of a warehouse rack.
     - **STRICTLY EXCLUDED**: Never recommend `Perbaikan` (`CC...`, `PMK...`, `DF...`) or `Anomali` locations for picking.
4. **Clean Product & Size Formatting**:
   - Strip redundant size suffixes from `nama_produk` (`cleanProductName`) and resolve `size` cleanly (`resolveProductDisplaySize` / `extractSizeFromSku`) so `Nama Produk`, `Size`, and `SKU` never duplicate or collide.

---

## 3. Detailed Specification per Format

### Format 1: Picking List / SJ Cetak A4 (`210mm x 297mm`)
- **Print CSS Isolation**:
  - `@page { size: A4 portrait; margin: 4mm 6mm; }`
  - High-contrast pure monochrome (`#000000` text and `1px solid #000` borders on `#ffffff` background).
- **Header Block**:
  - Title (`SURAT JALAN & PICKING LIST ...`), print timestamp (`id-ID`), operator name, and summary bar (`Total Pesanan`, `Total Barang (Pcs)`, `Petugas Picking`, `Petugas QC / Packing`).
- **Standard Table Columns**:
  - `No` (`4%`) | `No. Pesanan & Resi / DealPOS` (`15%`, `font-mono`) | `Opsi Pengiriman` (`12%`) | `Nama Penerima & HP` (`15%`) | `Lokasi Rak / Store` (`10%`, bold `font-mono` shaded `bg-gray-50`) | `SKU & Nama Barang (+ Size & Flag Alterasi)` (`25%`) | `Qty` (`5%`, bold) | `Pick [ ]` (`4%`, physical checkbox `w-3.5 h-3.5 border border-black`) | `Catatan` (`10%`).

### Format 2: Picking List WA Grup (Fonnte Broadcast)
- **Unified Tree Structure**:
  Every Picking WA message (Manual Shipment, Retur Barang, SPS Peminjaman, and Refill Store) MUST use the exact same scannable tree format per item:
  ```text
  1. 📦 *[Nama Produk Bersih]*
     ├ Size    : *[Size]*
     ├ SKU     : `[SKU]`
     ├ QTY     : *[Qty] pcs*
     └ 📍 Lokasi: *[Lokasi Rak Prioritas / Kode Store]*
  ```
- **Header & Footer Metadata**:
  - Header: Document Title (`*🚨 PICKING LIST [MODUL]*`), Document ID (`No. Pesanan` / `No. SJ` in backticks), Store/Customer info, PIC, Date/Time (`WIB`), Operator, and `Kode Antrian` (`invoice_picking` if applicable).
  - Summary: `📋 *DAFTAR ITEM UNTUK PICKING ([X] Item / [Y] Pcs):*`
- **Role & State Rule**:
  - Sending Picking WA Grup is an **Admin helper broadcast**; in `ManualShipmentTab`, it does **NOT** replace the mandatory 2-step physical print (`is_picking_printed` A4 + `is_label_printed` A6) required to transition an order from `Pesanan Baru` to `Sedang Diproses`.

### Format 3: Picking List Tugas Picking (`PickingTasksView.tsx`)
- **Dual Identifier Standard (`no_sj` + `invoice_picking`)**:
  - Always display both **`no_sj`** (Business Document ID, e.g., `26.10.00010`) AND **`invoice_picking`** (Unique Queue Registration ID, e.g., `WA20261003IZZO`, plus its scannable QR Code).
  - **Hard Constraint**: `#OUT [invoice_picking]` WA scans and web scanner actions correlate strictly via `invoice_picking`.
- **Full Location Visibility**:
  - Display ALL valid warehouse locations for each SKU simultaneously (grouped and badged by Priority 1 $\rightarrow$ Priority 2 $\rightarrow$ Priority 3 with live rack quantities) so the picker has immediate fallback visibility if Priority 1 rack stock is insufficient.

### Format 4: Label Pengiriman Paket Thermal A6 (`100mm x 150mm`)
- **Print Container**:
  - `@page { size: 100mm 150mm; margin: 0mm; }`
  - Outer frame: `w-[100mm] h-[148mm] max-h-[148mm] border-[2px] border-black p-2.5 box-border bg-white text-black flex flex-col justify-between overflow-hidden`.
- **4-Zone Vertical Architecture**:
  1. **Zone 1 — Top Brand & Courier Bar**: `CHOCOCHIPS` logo (`h-[24px]`) on the left + bold uppercase `jasa_kirim` (`18px`) on the right, separated by `border-b-[2px] border-black`.
  2. **Zone 2 — Recipient, Sender & QR Split Box**:
     - Left column (`flex-1 pr-2.5`): **Kepada / Penerima** (`18px` bold name, `14px` mono phone, `13px` address, `NOTE`) stacked above `border-t border-dashed border-black` **Dari / Pengirim** (`CHOCOCHIPS - [Store]`, PIC, Telp).
     - Right column (`w-[110px] border-l-[1.5px] border-black`): Centered **QR Code** (`75x75px`) of `no_pesanan`, followed by `ID: [no_pesanan]` and `Ref: [no_transaksi_customer]`.
  3. **Zone 3 — Unboxing Warning Banner**: Full-width centered notice (`MOHON LAKUKAN DOKUMENTASI SAAT MEMBUKA PAKET`).
  4. **Zone 4 — Compact Product Table**: Columns `No.`, `Nama Produk`, `Size`, `SKU`, `Qty`, and bottom `Total Item` row.

### Format 5: Cetak Ukuran Struk Kasir Thermal (`58mm/60mm` & `80mm` Roll)
- **Configurable Thermal Width & Font**:
  - Supports **58mm / 60mm** (Mini POS 6cm, default to prevent clipping on small printers) and **80mm** (Standard POS 8cm), persisted in `localStorage` (`wms_pos_printer_width`), with selectable font scale (`normal` / `large` / `xl`).
- **Rangkap 2 (2-Ply) Handover Architecture (`SuratJalanAlterReceiptModal`)**:
  - **Lembar 1 — Arsip Store Pengirim**: Retained by the store as dispatch proof.
  - **Lembar 2 — Ditempel pada Fisik Barang (Gudang / Penjahit)**: Attached to the physical parcel sent to Warehouse / Tailor.
  - Separated by a clear cut line (`✂️ POTONG DI SINI ✂️` with `border-dashed border-black`) and `page-break-after: always`.
- **Content Elements**:
  - Monochrome header, Order ID + QR Code (`65px` for 58mm, `90px` for 80mm), Origin Store $\rightarrow$ Destination Store/Warehouse, itemized list (with alteration instructions if applicable), and 2-column signature block (`Diserahkan Oleh` | `Diterima Oleh`).
