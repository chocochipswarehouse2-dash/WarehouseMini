# Antigravity Agent Guidelines

These rules apply to all tasks and agents working on the WMS Inventory project:

## 1. Pre-Task: Always Sync with GitHub & Check GAS Status
Before starting any analysis, planning, edits, or commands:
1. **Pull Git Updates**: Run `git pull --rebase` to ensure the local repository has the latest commits from `origin/main`.
2. **Check GAS Live Status**: Run `node tools/gas_status.cjs` to check Google Apps Script deployment version and connectivity.

## 2. Supabase Migration & Schema Synchronization
Whenever database schemas, table structures, or payload models are updated (whether from git pull, changes to `src/services/supabase.ts`, `.sql` files, TypeScript interfaces in `src/types/`, or GAS sync logic):
- Immediately review and update Supabase migration modules (e.g., `migrate.js`, `tools/migrate-supabase.cjs`, and `test-webhook.ts`).
- Ensure all column mappings, field names, and payload structures match the latest schema specifications.

## 3. Post-Task: Build, Auto-Deploy & Proactive Status Reporting
Whenever modifications are completed, execute the full deployment lifecycle without waiting for user prompts:
1. **Validate Build**: Run `npm run build` to verify that there are no compilation or bundling errors.
2. **Deploy Google Apps Script (GAS)**: If any file under `gas/` or GAS deployment scripts was touched, run:
   ```bash
   node tools/gas_deploy.cjs
   ```
   Confirm new project version and active deployment update.
3. **Commit & Push (Vercel)**: Stage changes, commit with a concise conventional commit message, and push to GitHub:
   ```bash
   git push origin main
   ```
4. **Mandatory Proactive Deployment Status**: ALWAYS include a dedicated `### 🚀 Deployment Status` table in the response detailing:
   - Git Commit Hash & Message
   - GitHub / Vercel auto-deploy status
   - Google Apps Script version & deployment status
   The user must never need to ask whether changes are deployed.

## 4. WMS Stock Opname (SO) Blueprint & Calculation Standard

### A. Core Principles
- **Unit of Calculation**: Every Stock Opname queue is calculated strictly **per scan invoice with type `SO`** (from WA `#SO`, Web Scanner, or CSV/Excel import).
- **Full Location Reconciliation**: The scan invoice represents the **exhaustive physical reality** of the specified location(s) at that time.
- **Unscanned Items (0-Scan Rule)**: Any SKU recorded in the database (`stok_real_fisik`) at that location that is **NOT scanned** during that SO session is deemed to have **`Scan Fisik = 0`**.
- **Target Equilibrium**: Upon approval, the final physical stock in the database for that location **MUST MATCH THE PHYSICAL SCAN EXACTLY**.

### B. Standard Formula
$$\mathbf{Selisih\ /\ Adjustment} = \mathbf{Scan\ Fisik} - \mathbf{Stok\ Sistem\ Database}$$
- **Selisih > 0 (+)** $\rightarrow$ **`ADJ_IN`** (Add stock to match physical reality)
- **Selisih < 0 (-)** $\rightarrow$ **`ADJ_OUT`** (Deduct stock to match physical reality)
- **Selisih = 0** $\rightarrow$ Matched / In Sync (No adjustment log created)

### C. Standard Calculation Truth Table
| No | Scenario | Stok Sistem (DB) | Scan Fisik (SO) | Formula ($Scan - Sistem$) | Action upon Approval | Final Stock |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | Unscanned item (lost/zeroed) | `1` | `0` | $0 - 1 = \mathbf{-1}$ | `ADJ_OUT (1)` | `0` |
| 2 | Newly discovered item in rack | `0` | `1` | $1 - 0 = \mathbf{+1}$ | `ADJ_IN (1)` | `1` |
| 3 | Physical count higher | `2` | `5` | $5 - 2 = \mathbf{+3}$ | `ADJ_IN (3)` | `5` |
| 4 | Physical count lower | `5` | `3` | $3 - 5 = \mathbf{-2}$ | `ADJ_OUT (2)` | `3` |
| 5 | Negative DB anomaly, physical empty | `-2` | `0` | $0 - (-2) = \mathbf{+2}$ | `ADJ_IN (2)` | `0` |
| 6 | Negative DB anomaly, physical found | `-1` | `3` | $3 - (-1) = \mathbf{+4}$ | `ADJ_IN (4)` | `3` |
| 7 | In sync | `4` | `4` | $4 - 4 = \mathbf{0}$ | Skip (no adjustment) | `4` |

### D. Multi-Channel Ingestion Standards
All 3 ingestion methods MUST follow the exact same reconciliation blueprint:
1. **WhatsApp Ingestion**: `#SO [Lokasi]` $\rightarrow$ logged as `log_produk (type: 'SO')` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
2. **Web Scanner Ingestion**: Operator selects SO mode $\rightarrow$ scans items for a rack $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
3. **CSV/Excel Ingestion**: User uploads CSV/Excel containing columns `SKU`, `Qty`, `Lokasi` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for the specified location(s).

## 5. WMS Core Flow (IN, OUT) & Picking Task Sync Blueprint

### A. The Supremacy of `log_produk` (Single Source of Truth)
- **Append-Only Ledger**: `log_produk` is the immutable ledger for all movements (IN, OUT, SO, ADJ).
- **Equal Ingestion Channels**: WhatsApp (WA), Web App Scanner, and CSV Import are strictly ingestion channels. They share the same hierarchy and logic rules.
- **HARD CONSTRAINT (NO AUTO-ADJUSTMENT)**: During normal operations (Picking, Inbound, Outbound), agents and systems are **STRICTLY FORBIDDEN** from automatically generating shadow `#IN` or `#OUT` mutations to artificially balance stock. All physical stock mutations MUST originate from explicit physical operator scans.
- **SOLE EXCEPTION**: The system is ONLY permitted to inject automated mutation data (`ADJ_IN` or `ADJ_OUT`) strictly when the "Approve Stock Opname" function is executed by an authorized user, to force database stock to match the physical reality.

### B. The Picking Task Sync (Explicit Invoicing)
- **Entity Definitions**:
  - `no_sj` (e.g., 26.10.00010) is a Business Document ID. It is NOT guaranteed to be globally unique (may be duplicated across routes).
  - **`invoice_picking`** (e.g., WA20261003IZZO) is a Queue Registration ID. It is **GUARANTEED UNIQUE** and is auto-generated by the system *when a request module (Refill, SPS, Shopee) registers a task into the Picking Queue*.
- **HARD CONSTRAINT (NO GUESSWORK)**: The system MUST use `invoice_picking` to correlate WA scans (e.g., `#OUT WA20261003IZZO`) with Picking targets. Agents are FORBIDDEN from using `no_sj`, location, or timestamps to infer correlations.

### C. Anomaly Resolution & Self-Healing
The WMS acts purely as a stateless calculator and notification auditor.
- **Under-pick Scenario**: Fonnte WA alerts operator $\rightarrow$ Operator physically retrieves item $\rightarrow$ Operator scans `#OUT [invoice_picking]`.
- **Wrong/Over-pick Scenario**: Fonnte WA alerts operator $\rightarrow$ Operator physically returns item to shelf $\rightarrow$ Operator scans standard `#IN`.
- **HARD CONSTRAINT (HUMAN ACCOUNTABILITY)**: The system is FORBIDDEN from automatically closing anomalies. It only recalculates the `invoice_picking` totals and updates the warning status (e.g., "Still missing 2"). Final task resolution is the absolute responsibility of the human operator.

## 6. System Restore Points (Safe Fallback)
If the system becomes unstable or logic breaks during the implementation of the "Smart Picking & WA Sync" architecture, agents MUST offer the user to revert to the pre-picking-sync stable state.
- **Git Tag**: `restore-point-pre-picking-sync`
- **Agent Instruction**: To rollback, execute `git reset --hard restore-point-pre-picking-sync` and push force if necessary, then confirm GAS/Supabase states. This tag guarantees a pristine state before any Picking/WA sync codebase changes were made.

## 7. WMS Area & Location Prioritization Blueprint

### A. Location Definitions & Mapping
All location string inputs MUST be strictly mapped to their respective areas using the master function (`getAreaFromLokasi`).
- **Warehouse**: `A001`-`A100`, `B001`-`B100`, `C001`-`C100`, `D001`-`D100`
- **Aksesoris**: `BELT...`, `CARD...`, `GIFT...`, `BOX...`
- **Transit**: `X` / `TRANSIT`
- **Kolian**: `R0...`, `V0...`, `Z0...`
- **Blok F**: `TIKTOK`, `SHOPEE`, `STUDIO`
- **Perbaikan**: `CC...` (Cuci), `PMK...` (Permak), `DF...` (Defect)
- **Anomaly**: Any location string not fitting the above patterns MUST be flagged as an anomaly.

### B. Picking Prioritization Hierarchy
Agents modifying UI sorting or task allocation MUST strictly enforce the following hierarchy (Priority 1 = Top):
1. **Priority 1**: Warehouse + Aksesoris + Transit
2. **Priority 2**: Kolian
3. **Priority 3**: Blok F
4. **Priority 4 (Fallback)**: Empty / Null locations
5. **DO NOT PICK**: `Perbaikan` (Cuci, Permak, Defect) and `Anomali` areas are strictly excluded from automated picking recommendations.

*Note: The frontend UI must display ALL valid picking locations simultaneously (grouped/sorted by priority) so that pickers have full visibility if Priority 1 stock is insufficient.*

### C. Standar Resolusi Anomali Area vs Anomali Lokasi
1. **Kasus 1: Lokasi Valid, Area Salah/Anomali (Area Mismatch)**:
   - Contoh: Lokasi `R024` tercatat area `Warehouse`, `DF010` tercatat area `Warehouse`, atau `BELT001` tercatat `Anomali`.
   - **Tindakan**: Sistem/script hanya boleh mengoreksi label `area`-nya secara langsung (`UPDATE area = getAreaFromLokasi(lokasi)`).
   - **HARD CONSTRAINT**: DILARANG KERAS menyuntikkan `ADJ_OUT` / `ADJ_IN` atau menolkan stok fisik hanya karena salah nama area. Kuantitas fisik barang tidak boleh berkurang 1 pcs pun.
2. **Kasus 2: Lokasi Tidak Valid / Tidak Ada di Denah (Anomali Lokasi)**:
   - Contoh: Lokasi berupa salah ketik operator, tanda strip `-`, nama non-rak, atau string acak.
   - **Tindakan**: DILARANG melakukan pembersihan (*cleanup*) otomatis oleh script tanpa izin.
   - **Wajib Verifikasi & Persetujuan Manusia**: Wajib melalui audit fisik di lapangan dan memerlukan konfirmasi/persetujuan eksplisit (*approval*) dari user/admin sebelum tindakan penyesuaian stok dilakukan.

## 8. WMS Feature Update & Dynamic FAQ Auto-Maintenance Standard

### A. Mandatory Auto-Update of FAQs on Feature Changes
Whenever features, buttons, modal flows, validation rules, or business logic are added, modified, or revised in `ManualShipmentTab`, `AlterationRepairTab`, or Order Workflows (e.g., Split Fulfil, Form Alter, Multi-Store, Kirim ke Gudang, Resi, DealPOS, Pembatalan):
1. **Mandatory FAQ Synchronization**: The agent MUST automatically review and update `src/data/initialStoreFaq.ts` (and corresponding Supabase FAQ seeds) so that the user and store teams do not have to write documentation manually.
2. **Strict Role-Aware Perspective (Store vs. Admin)**:
   - Instructions and action steps in FAQs MUST be strictly written from the **real perspective of the role performing the action**.
   - **HARD CONSTRAINT (NO MISLEADING BUTTONS)**: NEVER instruct a Store PIC to click a button or perform an action that is restricted only to Admin (e.g., `Batalkan Pesanan`, `Tandai Sold Out`, `Update Resi`).
   - If an action requires Admin authority, the FAQ for Store MUST instruct them on how to request/escalate it (e.g., via the "Ajukan Kendala ke Superadmin" tab in `StoreHelpModal` or chat), while clearly describing that Admin will execute the button in the system.
3. **Miniature UI Badges Consistency**: Always verify that the miniature UI badges listed in the FAQ (`button_badges`) correspond to actual buttons in the interface that match the operator's permission scope.

## 9. Pusat Resolusi — Retur Barang Blueprint
For any modifications to `PusatResolusiView`, `ReturBarangTab`, or `returBarangService.ts`, agents MUST read and adhere to `PUSAT_RESOLUSI_RETUR_BLUEPRINT.md`:
1. **Data Isolation & Storage**: Retur Barang tickets are stored in the dedicated table `public.retur_barang` with `no_retur` prefixed by `RTR-`. The service `returBarangService.ts` automatically manages CRUD on `public.retur_barang` (with fallback to `manual_shipment` if needed). `fetchManualShipments()` and `gasSync.ts` strictly filter out any `RTR-` records to guarantee 100% isolation from Store Manual Shipment Rekap and Dashboards.
2. **3-Stage Deterministic Flow**:
   - **Pesanan Baru (`diterima`)**: Newly submitted by CS; auto-sends email notification via GAS (`MailApp.sendEmail`) to recipients configured in `pusat_resolusi_settings` (`wms_system_docs`).
   - **Pesanan Diproses (`diproses`)**: Triggered when Label A6 or Picking List is printed, WA Group Picking is requested, or Admin inputs `no_sj_gudang_retur` / `no_invoice_return`.
   - **Pesanan Selesai (`dikirim`)**: Triggered when Admin inputs `no_resi` (replacement shipment tracking number).
3. **Print & DealPOS Rules**:
   - **Label A6 (`100mm x 150mm`)** and **Picking List (`A4`)** MUST always render `produk_pengganti` (Replacement Items), NEVER `produk_pesanan` (returned items).
   - Admin manages two distinct DealPOS documents: `no_sj_gudang_retur` (SJ DealPOS to Gudang Retur) and `no_invoice_return` (Invoice Return DealPOS when return is completed).

## 10. WMS UI/UX, Responsive (Desktop & HP Seluler) & Multi-View Frontend Standards
Whenever designing, modifying, or tidying up any frontend component, table, card, modal, or print template, agents MUST activate and adhere to the workspace frontend skills in `.agents/skills/`:
1. **UI/UX Design System (`.agents/skills/wms-ui-ux-design-system/SKILL.md`)**:
   - **Semantic Color Theme (Light & Dark Mode)**: Primary `indigo-600`, Success `emerald-600`, Warning `amber-500`, Danger `rose-600`, Alteration `rose`/`purple`, Neutral `slate`.
   - **Typography & Sizing**: Consistent scale (`text-base sm:text-lg` headers, `text-xs` body, `text-[11px]` subtitles, `text-[10px]` badges, and mandatory `font-mono` for all SKUs, Order IDs, Resi, SJ, and DealPOS numbers).
   - **Visual Neatness**: Uniform button/input heights in toolbars, maximum 3 visual nesting levels, and **zero dangling separator dots (`·`)** when optional fields are empty.
2. **Responsive Desktop & Mobile / HP Seluler (`.agents/skills/wms-responsive-desktop-mobile/SKILL.md`)**:
   - **Desktop (`lg:` / `xl:`)**: Supports multi-pane Master-Detail workspaces (`lg:grid-cols-12` with sticky right detail panel), proportional fixed tables (`lg:table-fixed`), and hover tooltips.
   - **Mobile / HP Seluler (`< 640px`)**: Touch-friendly tap targets, collapsible secondary filter bars (behind a single `Filter` toggle button), zero unintended horizontal page scroll (`overflow-x-auto` isolated strictly to table wrappers), and modals with scrollable bodies (`max-h-[90vh]`) and sticky action footers.
3. **Multi-View Presentation — Panel Rapi (Split), Versi Tabel & Versi Kartu (`.agents/skills/wms-table-card-split-views/SKILL.md`)**:
   - **Panel Rapi (`split`)**: Master-Detail layout with compact order cards + 4-step progress bar on the left, and full detail workspace (4-step interactive stepper, 2-column product/info body, and 2-column `Cetak` / `Aksi lainnya` footer) on the right.
   - **Versi Tabel (`table`)**: Proportional column widths, interactive sortable headers (`ArrowUpDown`), structured metadata boxes, and aligned action columns.
   - **Versi Kartu (`card`)**: Responsive 1–4 column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) with equal-height flex cards.
   - **Rendering Performance**: Always use $O(1)$ `Map` lookups instead of nested `.find()` inside render loops, and paginate heavy grouped spreadsheet views.
4. **Print & Thermal Documents (`.agents/skills/wms-print-receipt-documents/SKILL.md`)**:
   - High-contrast monochrome layouts for **Label Pengiriman A6 (`100mm x 150mm`)**, **Picking List A4** (sorted by Warehouse Location Priority), **Surat Jalan Struk Kasir 80mm (Rangkap 2)**, and **SPK Penjahit**.
