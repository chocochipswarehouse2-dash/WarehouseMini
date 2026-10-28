---
name: wms-print-receipt-documents
description: Frontend print layout and thermal document design standard for WMS Inventory covering Label Pengiriman Thermal A6 (100x150mm), Picking List A4, Surat Jalan Struk Kasir 80mm (Rangkap 2), and SPK Penjahit / Gudang. Activate whenever creating or modifying print templates, @media print styles, QR codes, or receipt modals.
---

# WMS Print & Thermal Document Frontend Standard

All physical documents printed from the WMS Inventory frontend must be 100% compatible with both Desktop thermal/laser printers and Mobile (HP) print dialogs (`@media print` in-page rendering or dedicated print windows), using high-contrast monochrome typography so thermal printheads produce crisp, scannable output.

---

## 1. Document Types & Paper Dimensions

| Document Type | Paper / Thermal Size | Target Users | Core Purpose |
| :--- | :--- | :--- | :--- |
| **Label Pengiriman Paket (A6)** | `100mm x 150mm` / `105mm x 148mm` (Thermal Portrait) | Admin Gudang / Packing | Shipping label attached to customer parcel |
| **Picking List Gudang (A4)** | `A4 Portrait` (`210mm x 297mm`) | Admin Gudang / Picker | Checklist for retrieving items from warehouse racks |
| **Surat Jalan Struk Kasir (80mm)** | `80mm Thermal Roll` (Rangkap 2 / 2-Ply) | Store PIC & Admin | Handover proof for Store $\rightarrow$ Warehouse physical transfer |
| **SPK Penjahit / Alterasi** | `A4` / `A5` / `80mm Thermal` (Configurable) | Penjahit & Admin | Work order attached to garment for alteration/repair |

---

## 2. Design & Layout Rules per Document

### A. Label Pengiriman Paket A6 (`100mm x 150mm`)
1. **High-Contrast Monochrome**: Pure black (`#000000`) text and borders (`1.5px solid #000`) on pure white (`#ffffff`) background—never use pale gray text or low-contrast colored backgrounds that fade on thermal printers.
2. **Header Block**:
   - Brand header (`CHOCOCHIPS` / Store Pengirim) + prominent **Jasa Kirim / Courier Badge** + **QR Code** of `no_pesanan` for rapid scanner verification.
3. **Recipient & Sender Block**:
   - Large, bold Customer Name (`nama_tujuan`), phone number (`font-mono`), and full address (`alamat_tujuan`).
   - Sender Store (`nama_pengirim`), PIC, and Order Reference (`no_transaksi_customer` / `no_pesanan`).
4. **Item Table**:
   - Columns: `No`, `Produk & Size`, `SKU`, `Qty`.
   - Exclude items marked `sold_out` or `cancelled`.
   - **CRITICAL RULE FOR RETUR BARANG (`RTR-`)**: Label A6 and Picking List A4 in Pusat Resolusi (`ReturBarangTab`) MUST ALWAYS render `produk_pengganti` (Replacement Items), NEVER `produk_pesanan` (returned items).

### B. Picking List Gudang (A4)
1. **Strict Location Priority Sorting**:
   - Items on the Picking List MUST be enriched with live rack locations (`stok_real_fisik`) and sorted by the WMS Picking Prioritization Hierarchy:
     - **Priority 1**: `Warehouse` (`A001`–`D100`) + `Aksesoris` (`BELT`, `CARD`, `GIFT`, `BOX`) + `Transit` (`X`)
     - **Priority 2**: `Kolian` (`R0...`, `V0...`, `Z0...`)
     - **Priority 3**: `Blok F` (`TIKTOK`, `SHOPEE`, `STUDIO`)
     - **Store Fulfillment**: Displays Store Code / Name (e.g., `MKG`, `CPJ`)
     - **Excluded**: Never recommend `Perbaikan` (`CC`, `PMK`, `DF`) or `Anomali` locations for automated picking.
2. **Checklist Ergonomics**:
   - Provide a clear physical checkbox (`[  ]`) column, bold `Lokasi Rak` column, `SKU` (`font-mono`), `Nama Produk & Size`, and `Qty`.

### C. Surat Jalan Struk Kasir 80mm (Rangkap 2)
1. **2-Ply Structure (`Lembar 1` & `Lembar 2`)**:
   - **Lembar 1 (Arsip Store Pengirim)**: Kept by the store as proof of dispatch, signed by Store PIC and Driver/Courier.
   - **Lembar 2 (Lampirkan pada Fisik Barang / Gudang)**: Placed inside/on the polybag sent to the central warehouse.
   - Separated by a dashed cut line (`border-dashed border-black my-4`) and `page-break-after` support.

### D. 2-Step Print State Transition Rule
- In `ManualShipmentTab`, an order in **Pesanan Baru (`diterima`)** transitions automatically to **Sedang Diproses (`diproses`)** ONLY when **BOTH** `is_picking_printed` (Picking List A4) AND `is_label_printed` (Label Paket A6) are completed. Printing `SJ Struk` or `SPK` or sending `Picking WA Grup` must NEVER prematurely move a new order to `diproses`.
