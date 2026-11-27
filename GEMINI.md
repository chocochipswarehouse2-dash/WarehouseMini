# Antigravity Agent Guidelines — WMS Inventory Chocochips

Aturan permanen ini berlaku untuk **SEMUA tugas & SEMUA agen coding** yang bekerja pada proyek WMS Inventory. File ini dijaga ringkas (< 15 KB) agar 100% terbaca utuh tanpa terpotong.

---

## 1. Pre-Task: Sync GitHub, GAS, Memori Permanen & AI Dev Backlog
Sebelum memulai analisis, perencanaan, edit kode, atau perintah apa pun:
1. **Pull Git Updates**: Jalankan `git pull --rebase` untuk memastikan repositori lokal sinkron dengan `origin/main`.
2. **Check GAS Live Status**: Jalankan `node tools/gas_status.cjs` untuk cek versi deployment Google Apps Script.
3. **Pull AI Dev Reports**: Jalankan `node tools/pull_ai_dev_reports.cjs` untuk menarik laporan tugas yang belum bisa dieksekusi AI dari Supabase ke `docs/memory/AI_CAPABILITY_GAPS.md`.
4. **Baca Memori Permanen**: Tinjau `docs/memory/WMS_FEATURE_REGISTRY.md`, `docs/memory/WMS_MODULE_CHANGELOG.md`, dan `docs/PENDING_PLANS.md` sebelum mengubah modul apa pun agar tidak melanggar invarian fitur yang sudah tertanam.

---

## 2. Supabase Migration, Schema & Egress Guardrails
- Setiap perubahan skema tabel, payload model, `src/services/supabase.ts`, file `.sql`, atau sinkronisasi GAS wajib menyelaraskan modul migrasi (`migrate.js`, `tools/migrate-supabase.cjs`, `test-webhook.ts`).
- **Egress Minimal (`.agents/skills/wms-supabase-egress-guardrails/SKILL.md`)**: Wajib baca skill guardrail egress sebelum menambah/mengubah fetch Supabase atau polling. Gunakan SWR cache / IndexedDB (`localDb.ts`), **watermark gate ~150B** (`fetchSupabaseWatermark`) sebelum re-fetch tabel sedang/besar (`pengecekan_sj`, `wms_settings`, `penerimaan_produksi`, `manual_shipment`, `wms_system_docs`), probe ringan (~200B) untuk interval polling, lazy-load tab berat, selalu pakai `select=...` spesifik + `limit=...`, serta patuhi skema kolom nyata (mis. `penerimaan_produksi` & `picking_list` tidak memiliki `updated_at`).
- **Penyimpanan**: Data bisnis ke Supabase; foto dokumentasi ke Google Drive (via GAS).

---

## 3. Post-Task: Memori Permanen, Bump Version, Build & Auto-Deploy
Setelah modifikasi selesai, jalankan siklus rilis penuh:
1. **Update Memori Permanen Global & Upgrade Skill (WAJIB)**: Perbarui skill terkait di `.agents/skills/` (atau buat skill guardrail baru setiap temuan bug/fitur baru agar semua agen memahami invarian terbarunya), perbarui `docs/memory/WMS_FEATURE_REGISTRY.md` (jika ada modul/fitur/invarian baru), dan tambahkan ringkasan perubahan di paling atas `docs/memory/WMS_MODULE_CHANGELOG.md`.
2. **Semantic Versioning (`tools/bump_version.cjs`)**:
   - `--major` (`v3.0.0`): Perombakan arsitektur besar / breaking changes.
   - `--minor` (`v2.X.0`): **WAJIB** untuk penambahan fitur/modul baru.
   - Default Patch (`v2.X.Y`): Bug fix, optimasi performa, penyesuaian UI/logic kecil.
   - Jalankan `node tools/bump_version.cjs verify-release` untuk memastikan sinkronisasi versi, safety Service Worker, & memori permanen lolos (`passed: true`).
3. **Validate Build & Lint**: Jalankan `npm run build` dan `npm run lint`.
4. **Deploy GAS (jika `gas/` berubah)**: Jalankan `node tools/gas_deploy.cjs`.
5. **Commit & Push**: Commit perubahan beserta `package.json`, `src/config/appVersion.ts`, `public/version.json`, dan `docs/memory/*`, lalu `git push origin main`.
6. **Mandatory Proactive Deployment Status**: Selalu sertakan tabel `### 🚀 Deployment Status` di akhir jawaban (Versi & Build Hash, Git Commit, Vercel Auto-Deploy, GAS Status).

---

## 4. WMS Stock Opname (SO) Blueprint
- Dihitung ketat per invoice scan tipe `SO` (WA `#SO`, Web Scanner, atau CSV/Excel).
- **0-Scan Rule**: SKU di `stok_real_fisik` pada lokasi terkait yang tidak discan dianggap `Scan Fisik = 0`.
- **Formula Wajib**: `Selisih = Scan Fisik - Stok Sistem Database`.
  - `Selisih > 0` -> `ADJ_IN`; `Selisih < 0` -> `ADJ_OUT`; `Selisih = 0` -> Skip.
- Penyesuaian (`ADJ_IN`/`ADJ_OUT`) HANYA boleh dibuat saat user berwenang klik **Approve Stock Opname**.

---

## 5. Core Flow (`log_produk`) & Picking Task Sync
- **`log_produk` adalah Single Source of Truth (Append-Only)**: DILARANG auto-generate shadow `#IN`/`#OUT` saat operasi normal. Semua mutasi fisik wajib berasal dari scan operator (kecuali Approve SO).
- **Explicit Picking Correlation**: Korelasi scan WA (`#OUT [invoice_picking]`) wajib menggunakan `invoice_picking` unik — DILARANG menebak dari `no_sj`, lokasi, atau timestamp.
- **Human Accountability**: Sistem dilarang menutup anomali under-pick/over-pick otomatis; operator wajib menyelesaikan lewat scan fisik.
- **Picking Completion & Continuation Guardrails**: Setiap perubahan `PickingTasksView`, `completePickingSuratJalanSupabase`, `reopenRemainingPickingSJSupabase`, atau outbox picking WAJIB mematuhi `.agents/skills/wms-picking-completion-sync-guardrails/SKILL.md` (parallel chunk `PATCH` + SJ-wide sweep `status=neq.SELESAI`, regenerasi lokasi live `stok_real_fisik`, serta anti-double `#OUT` delta).

---

## 6. Restore Point
- Tag stabil pra-picking-sync: `restore-point-pre-picking-sync` (`docs/blueprints/RESTORE_POINT.md`).

---

## 7. Area Mapping & Picking Prioritization (`getAreaFromLokasi`)
- **Priority 1**: Warehouse (`A/B/C/D/E001-100`), Aksesoris (`BELT/CARD/GIFT/BOX...`), Transit (`X`/`TRANSIT`).
- **Priority 2**: Kolian (`R0/V0/Z0...`).
- **Priority 3**: Blok F (`TIKTOK`, `SHOPEE`, `STUDIO`, `IGLIVE`).
- **DO NOT PICK**: Perbaikan (`CC...`, `PMK...`, `DF...`, `SORTIR`) & Anomali selalu dikecualikan dari picking otomatis. Khusus Pengecekan SJ hanya Priority 1 & 2 (`isPickingEligibleForPengecekan`).
- **Resolusi Anomali**: Jika lokasi valid namun salah label area -> koreksi label `area` saja (DILARANG `ADJ_OUT`/`ADJ_IN`). Jika lokasi tidak valid di denah -> wajib verifikasi & approval manusia.

---

## 8. Master Produk Lookup & Role-Aware FAQ Sync
- **Master Produk Integrity**: Nama produk dan size di seluruh modul WAJIB menggunakan lookup SKU Master Produk (`lookupProductBySku` di `src/utils/productLookup.ts`). Dilarang memunculkan anomali nama/size di luar master data.
- **Mandatory FAQ Sync**: Perubahan fitur/tombol/alur di `ManualShipmentTab`, `AlterationRepairTab`, atau `ReturBarangTab` wajib menyinkronkan `src/data/initialStoreFaq.ts` dengan perspektif peran ketat (Store PIC tidak boleh disuruh klik tombol khusus Admin).

---

## 9. Pusat Resolusi — Retur Barang (`PUSAT_RESOLUSI_RETUR_BLUEPRINT.md`)
- Disimpan terisolasi di `public.retur_barang` dengan prefix `RTR-` (difilter keluar dari `manual_shipment`).
- 3 tahap deterministik: `diterima` (email via GAS) -> `diproses` (cetak Label A6 / Picking List / input SJ DealPOS Gudang Retur) -> `dikirim` (input `no_resi`).
- Label A6 (`100mm x 150mm`) & Picking List A4 wajib mencetak `produk_pengganti`, bukan `produk_pesanan`.

---

## 10. UI/UX, Responsive Desktop & Mobile Native, 2-Mode & Print Standards
Patuhi skills di `.agents/skills/`:
- **Theme & Anti-Pelangi Tombol**: Maksimal **1 tombol solid primary** (`bg-indigo-600 text-white`) per baris/toolbar; tombol sekunder berupa outline netral. Gunakan `font-mono` untuk SKU, Order ID, Resi, SJ, DealPOS.
- **Fluid Desktop & Native Mobile**:
  - Desktop (`>= 768px`): Web-based, fluid elastis (`w-full max-w-full`, anti dead-zone saat zoom-out), default mode `Tabel`.
  - Mobile (`< 640px`): Rasa aplikasi seluler native, target sentuh `40–48px`, tab navigasi horizontal swipe (`overflow-x-auto no-scrollbar`), filter sekunder via **Slide-Up Bottom Sheet**, mode Tabel compact pas layar (zero horizontal scroll), default mode `Kartu`.
- **2-Mode Standard**: Hanya `Tabel` & `Kartu` (`split` dideprekasi). Gunakan $O(1)$ `Map` lookups.
- **5 Format Cetak**: A4 Picking/SJ, WA Grup Tree, Picking Task QR, Label Thermal A6, Struk Thermal 58/80mm.

---

## 11. Zero-Reload Background Update & Active Screen Protection
- Data bisnis disinkronkan realtime tanpa reload halaman.
- Update bundel PWA diunduh di background; klik **"Perbarui"** hanya menjalankan `prepareUpdateInBackground()` (TIDAK boleh `window.location.reload()` langsung) dan aktif aman saat berpindah menu (kecuali staging scan sedang aktif) atau saat user klik eksplisit **"Muat Ulang Sekarang"**.

---

## 12. Live Chat Guardrails
- Perubahan pada `liveChatService.ts`, `LiveChatWorkspace.tsx`, `LiveChatFloatingWidget.tsx`, atau `public/pwa-extras.js` wajib membaca `.agents/skills/wms-live-chat-guardrails/SKILL.md`.

---

## 13. Desktop Multitasking Isolation (`>= 1024px` Only)
- Multi-Tab Keep-Alive & Slide-Over Companion Drawer HANYA aktif di Desktop (`>= 1024px`).
- Pada HP Seluler (`< 1024px`), render **hanya 1 halaman aktif (`activePage`)** secara eksklusif (unmount halaman lain) agar RAM ringan dan kamera/scanner tidak terganggu.

---

## 14. Mandatory Permanent Global Feature Memory, Cross-Agent GitHub Sync & AI Self-Reporting Backlog
1. **Sinkronisasi Memori Dua Arah (AI Studio <-> GitHub <-> Antigravity)**:
   - GitHub (`origin/main`) adalah satu-satunya perantara kebenaran (*Single Source of Truth*) antara agen **AI Studio** dan **Antigravity**.
   - Semua berkas memori (`GEMINI.md`, `docs/memory/*`, `docs/PENDING_PLANS.md`, `docs/plans/*`) wajib memakai **relative path Markdown** (bukan `file:///d:/...`) agar terbaca konsisten di kedua lingkungan.
   - Setiap perpindahan kerja antar agen wajib mendokumentasikan status pending & checklist eksekusi di `docs/PENDING_PLANS.md` dan `docs/plans/PRD_PLAN_*.md`.
2. **Memori Permanen Menyeluruh & Continuous Skill Upgrade**: Setiap temuan perbaikan bug atau penambahan fitur baru pada modul apa pun **WAJIB** memperbarui:
   - Skill terkait di `.agents/skills/*/SKILL.md` (tanamkan pola/invarian/log bug baru agar seluruh agen coding memahami lesson-learned secara otomatis).
   - `docs/memory/WMS_FEATURE_REGISTRY.md` (jika ada modul, tab, tool, tabel, skill, atau invarian baru/berubah).
   - `docs/memory/WMS_MODULE_CHANGELOG.md` (ringkasan perubahan terstruktur di entri teratas).
3. **AI Self-Reporting Loop**:
   - Saat Asisten AI WMS menerima permintaan pengguna yang belum bisa dieksekusi, AI mencatat spesifikasi ke Supabase (`wms_system_docs` -> `wms_ai_capability_gaps_index`) melalui tool `report_ai_capability_gap`.
   - Agen coding menarik laporan ini lewat `node tools/pull_ai_dev_reports.cjs` ke `docs/memory/AI_CAPABILITY_GAPS.md`, lalu menandai selesai setelah diimplementasikan dengan `node tools/pull_ai_dev_reports.cjs --resolve <GAP-ID> "<catatan>"`.
4. **Pending Plans Awareness**: Hormati status rencana yang ditandai `⏳ PENDING REVIEW` di `docs/PENDING_PLANS.md` (jangan dieksekusi sebelum disetujui user), dan eksekusi/verifikasi item berstatus `⏳ PENDING EXECUTION (ANTIGRAVITY)` sesuai PRD-nya.
