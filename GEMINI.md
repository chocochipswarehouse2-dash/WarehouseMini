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
1. **Bump Version & Release Notes (When Frontend `src/` Changes)**:
   Gunakan aturan Semantic Versioning (`MAJOR.MINOR.PATCH`) yang tegas:
   - **`--major` (`v3.0.0`)**: Digunakan jika ada perombakan arsitektur besar / breaking changes menyeluruh pada aplikasi.
   - **`--minor` (`v2.X.0`)**: **WAJIB DIGUNAKAN saat ada Penambahan Fitur Baru / Modul Baru** (contoh: rilis fitur baru *Asisten AI Pintar*, modul baru *Fulfilment Pesanan Online*, integrasi baru). Angka minor naik (`v2.6.x` $\rightarrow$ `v2.7.0`) dan patch di-reset ke `0`.
     ```bash
     node tools/bump_version.cjs bump --minor --title "WMS v2.X.0 — <Judul Fitur Baru>" --notes "<Catatan 1>|<Catatan 2>"
     ```
   - **Default Patch (`v2.X.Y`)**: Digunakan untuk **Perbaikan Bug, Optimasi Performa, Penyesuaian Logic/UI Kecil, dan Hotfix**.
     ```bash
     node tools/bump_version.cjs bump --title "<Judul Rilis>" --notes "<Catatan 1>|<Catatan 2>"
     ```
   Pastikan `package.json`, `src/config/appVersion.ts`, dan `public/version.json` selalu tersinkronisasi (dikelola otomatis oleh `tools/bump_version.cjs`).
2. **Validate Build**: Run `npm run build` to verify that there are no compilation or bundling errors.
3. **Deploy Google Apps Script (GAS)**: If any file under `gas/` or GAS deployment scripts was touched, run:
   ```bash
   node tools/gas_deploy.cjs
   ```
   Confirm new project version and active deployment update.
4. **Commit & Push (Vercel)**: Stage changes (including `package.json`, `src/config/appVersion.ts`, and `public/version.json`), commit with a concise conventional commit message, and push to GitHub:
   ```bash
   git push origin main
   ```
5. **Mandatory Proactive Deployment Status**: ALWAYS include a dedicated `### 🚀 Deployment Status` table in the response detailing:
   - App Release Version (`v2.5.x`) & Build Hash
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
- **Blok F**: `TIKTOK`, `SHOPEE`, `STUDIO`, `IGLIVE` (termasuk `IGlive` / `IG LIVE`)
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
   - **Visual Neatness & Hierarchy**: Uniform button/input heights in toolbars, maximum 3 visual nesting levels, and **zero dangling separator dots (`·`)** when optional fields are empty.
   - **Toolbar & Button Hierarchy (Anti-Pelangi Tombol)**: Maksimal **1 tombol solid primary** per baris/toolbar (e.g. `bg-indigo-600 text-white`). Semua tombol sekunder (Refresh, CSV, Filter, Buka Sheet) WAJIB berupa netral outline/ghost (`bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`). DILARANG KERAS menjejalkan 4–5 tombol solid berbeda warna menyala (oranye + biru + hijau + kuning) berdampingan.
2. **Responsive Desktop & Mobile / HP Seluler (`.agents/skills/wms-responsive-desktop-mobile/SKILL.md`)**:
   - **Global Container & Zoom Out Elasticity (Anti-Dead Zones)**: Seluruh workspace utama WAJIB bersifat fluid elastis (`w-full max-w-full px-2 sm:px-4 lg:px-6`) dan DILARANG membatasi kontainer utama dengan `max-w-7xl` (1280px) atau `max-w-[1600px]` yang menyisakan area kosong putih melompong raksasa di tepi kiri-kanan saat browser **Zoom Out (67%–90%)** atau monitor lebar (`1920px+`). Grid kartu rak wajib menggunakan penambahan kolom dinamis (e.g. `2xl:grid-cols-12 min-[2200px]:grid-cols-14`), kalender roster shift 31 hari, serta tabel spreadsheet wajib memanfaatkan 100% lebar layar agar data terlihat maksimal. Saat **Zoom In (110%–150%)**, tabel terisolasi di dalam `overflow-x-auto` tanpa merusak layout luar.
   - **Mobile Tab Sub-Navigation (Swipe Horizontal vs Menumpuk Vertikal)**: Tab navigasi modul pada tampilan HP WAJIB swipe horizontal (`flex overflow-x-auto no-scrollbar whitespace-nowrap`). DILARANG menumpuk tab secara vertikal (`flex-wrap`) yang memakan sepertiga layar HP sebelum data terlihat.
   - **Mobile Metric Card Hygiene**: Kartu statistik pada HP tidak boleh memotong teks dengan `truncate` sembarangan (mencegah teks terpotong seperti `maksimu_` atau `rak m...`). Gunakan teks ringkas atau `line-clamp-2`.
   - **Desktop (`lg:` / `xl:`)**: Supports multi-pane Master-Detail workspaces (`lg:grid-cols-12` with sticky right detail panel), proportional fixed tables (`lg:table-fixed`), and hover tooltips.
   - **Mobile / HP Seluler (`< 640px`)**: Touch-friendly tap targets, collapsible secondary filter bars (behind a single `Filter` toggle button), zero unintended horizontal page scroll (`overflow-x-auto` isolated strictly to table wrappers), modals with scrollable bodies (`max-h-[90vh]`) and sticky action footers, serta safe-zone padding bawah `pb-20` jika ada FAB menu.
3. **Multi-View Presentation — Panel Rapi (Split), Versi Tabel & Versi Kartu (`.agents/skills/wms-table-card-split-views/SKILL.md`)**:
   - **Panel Rapi (`split`)**: Master-Detail layout dengan kartu ringkas + progress bar di kiri, dan full detail workspace di kanan.
   - **Versi Tabel (`table`)**: Gunakan `lg:table-fixed w-full` dengan proporsi lebar pasti (`w-[...]%`) pada header agar tidak ada kolom raksasa kosong melompong (*dead zones*).
   - **Versi Kartu (`card`)**: Responsive 1–4 column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) dengan kartu sama tinggi.
   - **Rendering Performance**: Selalu gunakan $O(1)$ `Map` lookups dibanding nested `.find()`.
4. **Operational Print, Thermal & Picking WA Documents (`.agents/skills/wms-print-receipt-documents/SKILL.md`)**:
   - Unified data-enrichment, live rack priority sorting (`Priority 1 Warehouse/Aksesoris/Transit` $\rightarrow$ `Priority 2 Kolian` $\rightarrow$ `Priority 3 Blok F` or `Store Code`), and high-contrast monochrome layouts across all 5 operational formats:
     1. **Picking List / SJ Cetak A4 (`210mm x 297mm`)**
     2. **Picking List WA Grup (Fonnte Tree Broadcast)**
     3. **Picking List Tugas Picking (`invoice_picking` + `no_sj` + QR)**
     4. **Label Pengiriman Paket Thermal A6 (`100mm x 150mm`)**
     5. **Cetak Ukuran Struk Kasir Thermal (`58mm/60mm` & `80mm` Rangkap 2 & SPK)**
5. **UI/UX Pro Max Design Intelligence (`.agents/skills/ui-ux-pro-max/SKILL.md`)**:
   - Integrasi database desain profesional (80 visual styles, 192 product palettes, 119 UX guidelines, 74 font pairings) menggunakan script `python .agents/skills/ui-ux-pro-max/scripts/search.py "<query>"`.
   - Mengarahkan implementasi antarmuka agar menghindari tampilan kaku / generik AI, mempertahankan 8pt spacing system, micro-interactions, dark mode elegance, dan visual hierarchy kelas enterprise tanpa mengganggu fungsionalitas dan logika bisnis yang sudah berjalan.

## 11. Zero-Reload Background Update & Active Screen Protection Blueprint

### A. Dual Update Architecture (Data vs Code Bundle)
- **Data Business Updates (Katalog, Stok, Resolusi, Pesanan)**: Wajib disinkronkan via Supabase Realtime / WebSocket events (`catalog_updated`, event listener). DILARANG KERAS memaksa reload halaman untuk memuat pembaruan data bisnis.
- **Application Code Bundle Updates (Vite / PWA SW)**: Saat versi baru (`v2.x.x`) dideploy, sistem Service Worker mengunduh bundle baru di background tanpa menginterupsi pengguna.

### B. Zero-Reload Background Update (Hard Constraint)
- **DILARANG FORCED RELOAD SAAT KLIK PERBARUI**: Mengklik tombol **"Perbarui"** pada widget mengambang (`AppUpdateFloatingWidget`) maupun modal detail (`AppUpdateModal`) **TIDAK BOLEH** langsung memicu `window.location.reload()`.
- **Background Preparation**: Tombol update bertugas mengeksekusi `prepareUpdateInBackground()`, yaitu mengirim sinyal `SKIP_WAITING` ke Service Worker dan menandai status lokal bahwa bundel baru telah tersimpan di cache. Widget wajib langsung berganti tampilan hijau bertuliskan **`✅ Tersimpan (Akan aktif saat pindah menu)`**.
- **Aktivasi Alami & Aman (Safe Menu Transition)**: Pembaruan kode baru hanya boleh diaktifkan saat transisi alami: ketika pengguna berpindah menu/halaman via sidebar (`handleSelectPage` di `App.tsx`) dan tidak ada sesi barcode scan staging yang belum tersimpan (`wms_active_staging_scans`).
- **Reload Eksplisit Hanya Atas Izin User**: Reload seketika HANYA diperbolehkan jika pengguna secara eksplisit menekan tombol **"Muat Ulang Sekarang"** di dalam modal rincian update.
- **Proteksi Pekerjaan Aktif (Zero Data Loss)**: Dilarang membuat fitur atau alur di modul manapun (Gudang, Produksi, Store, Packing, Resolusi, dll.) yang mengeksekusi `window.location.reload()` secara mendadak saat form, scanner, atau tabel sedang aktif dioperasikan.


## 12. Live Chat Guardrails
Setiap perubahan pada Live Chat (liveChatService.ts, LiveChatWorkspace.tsx, LiveChatFloatingWidget.tsx, public/pwa-extras.js, direktori user/role Customer Service) WAJIB membaca dan mematuhi `.agents/skills/wms-live-chat-guardrails/SKILL.md` (invarian + checklist regresi). Tambahkan bug baru yang ditemukan ke skill tersebut.

## 13. Desktop Multitasking Isolation & Mobile Operational Protection (HARD CONSTRAINT)
Fitur **Multitasking / Multi-Tab Keep-Alive & Slide-Over Companion Drawer** (misal membuka *Produksi* bersamaan dengan *Trello UP* tanpa reset halaman) WAJIB mematuhi aturan isolasi arsitektur berikut secara permanen pada setiap update fitur, perbaikan bug, atau penambahan halaman baru:
1. **100% Desktop-Only (`>= 1024px` / `lg:`)**:
   - Bar Multi-Tab Workspace, Keep-Alive multi-view, dan Slide-Over Drawer **HANYA BOLEH** aktif pada layar Laptop/PC (`window.innerWidth >= 1024`).
   - Pada perangkat HP Seluler / Mobile (`< 1024px`), sistem WAJIB merender **hanya 1 halaman aktif (`activePage`)** secara eksklusif (unmount halaman lain saat pindah menu) dan menyembunyikan seluruh UI multitasking (`hidden lg:flex`).
2. **Zero Mobile Performance & Viewport Degradation**:
   - DILARANG KERAS membiarkan komponen halaman yang sedang tidak aktif tetap hidup (*mounted/keep-alive*) di memori RAM HP Seluler, karena dapat menyebabkan lag, *out-of-memory*, atau mengganggu kamera/scanner barcode operasional.
   - DILARANG menambahkan bar navigasi ekstra yang memakan ruang vertikal pada layar HP (`< 1024px`).
3. **Desktop Memory Cap (Anti-Freeze)**:
   - Di Laptop/PC (`>= 1024px`), jumlah tab halaman yang ditahan tetap hidup (*Keep-Alive*) di latar belakang dibatasi maksimal **4 tab aktif** (LRU eviction otomatis jika membuka tab ke-5, atau dapat ditutup manual dengan tombol `×` pada tab).
   - Setiap penambahan halaman/modul baru di `App.tsx` wajib mengikuti pola render tunggal terpusat (`renderPageContent(pageId)`) agar otomatis kompatibel dengan Single-View di HP maupun Multi-Tab Keep-Alive & Slide-Over Drawer di Laptop/PC.

## 14. Dokumentasi Terstruktur, Pending Plans Persistence & Proactive Reminder Standard
1. **Struktur Penyimpanan Dokumen (`docs/`)**:
   Seluruh dokumen penting proyek wajib disimpan secara rapi sesuai fungsinya di dalam folder [`docs/`](file:///d:/Antigravity/WMS%20Inventory/docs/README.md) (dengan indeks utama di [`docs/README.md`](file:///d:/Antigravity/WMS%20Inventory/docs/README.md)):
   - [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md): Daftar indeks rencana fitur (*Plans* & PRD) yang masih menunggu review/eksekusi.
   - [`docs/plans/`](file:///d:/Antigravity/WMS%20Inventory/docs/plans): Tempat seluruh dokumen *Implementation Plan* dan *PRD* (contoh: `docs/plans/PLAN_<NAMA_FITUR>.md`).
   - [`docs/blueprints/`](file:///d:/Antigravity/WMS%20Inventory/docs/blueprints): Blueprint arsitektur modul dan standar sistem permanen.
   - [`docs/guides/`](file:///d:/Antigravity/WMS%20Inventory/docs/guides): Panduan setup teknis, migrasi, dan operasional.
   - [`docs/sql/`](file:///d:/Antigravity/WMS%20Inventory/docs/sql): Seluruh skema SQL database Supabase, migrasi, dan webhook.
2. **Penyimpanan Dokumen Plan & Auto-Remind jika User Skip / Pindah Task**:
   - Setiap kali agen membuat *Implementation Plan* atas permintaan user, selain menyimpannya di direktori artifact sesi, agen WAJIB menyimpan salinan permanennya di `docs/plans/` dan mencatatnya di [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md) dengan status `⏳ PENDING REVIEW`.
   - Apabila user belum mereview atau belum memproses plan tersebut dan tiba-tiba meminta mengerjakan hal/fitur lain terlebih dahulu, agen WAJIB tetap memprioritaskan permintaan baru user sampai tuntas, lalu **menyertakan pengingat singkat (*gentle reminder*)** di bagian akhir respons bahwa masih ada plan berstatus `⏳ PENDING REVIEW` di [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md) yang siap dieksekusi kapan saja.
3. **Update Status Saat Selesai**: Setelah plan tersebut disetujui dan selesai diimplementasikan, agen wajib memperbarui statusnya di `docs/PENDING_PLANS.md` menjadi `✅ SELESAI`.


## 14. Dokumentasi Terstruktur, Pending Plans Persistence & Proactive Reminder Standard
1. **Struktur Penyimpanan Dokumen (`docs/`)**:
   Seluruh dokumen penting proyek wajib disimpan secara rapi sesuai fungsinya di dalam folder [`docs/`](file:///d:/Antigravity/WMS%20Inventory/docs/README.md) (dengan indeks utama di [`docs/README.md`](file:///d:/Antigravity/WMS%20Inventory/docs/README.md)):
   - [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md): Daftar indeks rencana fitur (*Plans* & PRD) yang masih menunggu review/eksekusi.
   - [`docs/plans/`](file:///d:/Antigravity/WMS%20Inventory/docs/plans): Tempat seluruh dokumen *Implementation Plan* dan *PRD* (contoh: `docs/plans/PLAN_<NAMA_FITUR>.md`).
   - [`docs/blueprints/`](file:///d:/Antigravity/WMS%20Inventory/docs/blueprints): Blueprint arsitektur modul dan standar sistem permanen.
   - [`docs/guides/`](file:///d:/Antigravity/WMS%20Inventory/docs/guides): Panduan setup teknis, migrasi, dan operasional.
   - [`docs/sql/`](file:///d:/Antigravity/WMS%20Inventory/docs/sql): Seluruh skema SQL database Supabase, migrasi, dan webhook.
2. **Penyimpanan Dokumen Plan & Auto-Remind jika User Skip / Pindah Task**:
   - Setiap kali agen membuat *Implementation Plan* atas permintaan user, selain menyimpannya di direktori artifact sesi, agen WAJIB menyimpan salinan permanennya di `docs/plans/` dan mencatatnya di [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md) dengan status `⏳ PENDING REVIEW`.
   - Apabila user belum mereview atau belum memproses plan tersebut dan tiba-tiba meminta mengerjakan hal/fitur lain terlebih dahulu, agen WAJIB tetap memprioritaskan permintaan baru user sampai tuntas, lalu **menyertakan pengingat singkat (*gentle reminder*)** di bagian akhir respons bahwa masih ada plan berstatus `⏳ PENDING REVIEW` di [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md) yang siap dieksekusi kapan saja.
3. **Update Status Saat Selesai**: Setelah plan tersebut disetujui dan selesai diimplementasikan, agen wajib memperbarui statusnya di `docs/PENDING_PLANS.md` menjadi `✅ SELESAI`.



## 15. Product Lookup Integrity (HARD CONSTRAINT)
Setiap lookup nama produk / size WAJIB mengikuti `.agents/skills/wms-product-lookup-integrity/SKILL.md`:
1. Master Produk (`master_produk`) = satu-satunya kebenaran; VLOOKUP SKU persis (`lookupProductBySku`).
2. DILARANG menebak size dari akhiran SKU (regex) atau nama dari prefix SKU saudara; akhiran 2-3 huruf SKU umumnya kode warna (`YL`, `OL`, `VL`, `PL`, `SL`, `CL`, `TL`, `GL`, `BL`, `NL`, `RL`, `EL`, `KL`, `ML`, `EM`, `CM`, `DM`, `LM`, `BM`, `PM`, `SM`, `TM`, `GM`, `KM`, `BS`, `WS`, `NS`, `HS`, `RS`, `CS`, `GS`, `MS`, `SS`, `TS`, `KS`, `NVL`, `ORS`, `CRS`, `DBL`, dll.). Gunakan runtime guard `isCorruptedColorCodeSize(sku, size)` di seluruh view & resolver untuk mencegah pseudo-size kode warna.
3. Katalog marketing/Trello hanya untuk pencarian; nama & size yang disimpan/ditampilkan wajib disejajarkan ke master.
4. Koreksi data master yang tercemar: 7.020 data `master_produk` tercemar pseudo-size kode warna telah disanitasi menyeluruh ke `size: 'Default'` via background batch script. Pastikan seluruh resolver mengembalikan size `-` / `Default` untuk produk-produk ini.
