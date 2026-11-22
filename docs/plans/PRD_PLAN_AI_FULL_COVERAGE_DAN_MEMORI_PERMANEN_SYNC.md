# PRD & Plan: Optimasi Full-Coverage Asisten AI WMS, AI Self-Reporting Backlog & Sinkronisasi Memori Permanen Lintas Agen (GitHub)

Dokumen spesifikasi produk (*Product Requirements Document*) dan rencana eksekusi teknis (*Implementation Plan*) agar seluruh pekerjaan pengembangan WMS — khususnya fondasi memori permanen global, sistem laporan otomatis kapabilitas AI, dan ekspansi skill Asisten AI — **sinkron 100% antara AI Studio dan Antigravity melalui perantara GitHub**, serta siap langsung dieksekusi, diuji live, dan di-deploy oleh Antigravity.

Status: Siap Eksekusi & Verifikasi Antigravity (`v2.25.0` codebase baseline sudah tertulis, menunggu uji live, commit/push GitHub & deployment) · Pemilik produk: pengelola gudang Chocochips · Stack: React 19 + Vite + TypeScript, Supabase, Vercel, Google Apps Script (GAS), GitHub

---

## 1. Ringkasan

Selama pengembangan WMS Inventory Chocochips yang melibatkan dua lingkungan agen coding (**AI Studio** dan **Antigravity lokal**), muncul tiga kebutuhan struktural:

1. **Memori Permanen Global Semua Modul (Menyeluruh, Bukan Hanya AI)**: Setiap penambahan fitur, revisi logika bisnis, atau perbaikan bug pada 25 modul tertanam harus tercatat permanen di repositori GitHub (`docs/memory/`) agar **agen mana pun** (AI Studio maupun Antigravity) tidak pernah lupa fitur yang sudah ada atau melanggar invarian sistem (Master Produk, `log_produk` append-only, prioritas picking, isolasi Retur `RTR-`, Zero-Reload PWA, dll.).
2. **Asisten AI WMS Full-Coverage + Export/Import Lengkap**: Mengoptimalkan Asisten AI WMS agar mencakup seluruh modul operasional gudang, produksi, pengiriman, order multi-kanal, SO/Putaway, Store Help, QnA SOP/FAQ berbasis peran, ringkasan eksekutif harian, validasi impor lampiran (Excel/CSV/PDF/Foto) terhadap Master Produk, ekspor 3 format (**Excel `.xlsx`**, **CSV `.csv` UTF-8 BOM**, **PDF `.pdf`**) + **Markdown `.md`**, serta navigasi modul 1 klik.
3. **AI Self-Reporting Capability Gap Loop**: Setiap kali pengguna meminta tugas WMS yang belum bisa dikerjakan oleh Asisten AI, AI tidak sekadar menolak, melainkan otomatis mencatat laporan spesifikasi pengembangan ke Supabase (`wms_system_docs`) sehingga saat agen coding (Antigravity) melakukan pull update, laporan tersebut otomatis tertarik ke `docs/memory/AI_CAPABILITY_GAPS.md` untuk segera dikembangkan.

> **Status Baseline Kode Saat Ini (`v2.25.0`)**: Implementasi kode inti Tahap 1–3 sudah selesai ditulis di workspace ini. Dokumen ini menjadi **kontrak kerja resmi & daftar pekerjaan pending** bagi Antigravity untuk melakukan sinkronisasi GitHub, uji live terhadap Supabase/GAS/Vercel, penyelesaian item pending, serta menjaga protokol memori lintas agen tetap sinkron seterusnya.

---

## 2. Masalah, Tujuan, dan Ruang Lingkup

| Masalah Saat Ini | Tujuan | Indikator Keberhasilan |
| --- | --- | --- |
| Konteks antar sesi AI Studio dan Antigravity terputus jika tidak disimpan di repositori | Sinkronisasi memori kerja 2 arah via GitHub sebagai *Single Source of Truth* | 100% perubahan modul & status plan tercatat di `docs/memory/*` & `docs/PENDING_PLANS.md` pada setiap commit |
| `GEMINI.md` sebelumnya > 34 KB (melebihi batas baca 24 KB sehingga terpotong) dan memiliki duplikasi aturan | Menjaga `GEMINI.md` ringkas (< 15 KB) dan memindahkan detail modul ke `docs/memory/` | `GEMINI.md` terbaca utuh 100% di semua agen tanpa terpotong |
| Asisten AI belum mencakup Loading Dock, Distribusi SJ, Pengiriman Store, SO/Putaway, Store Help, QnA SOP, & Export CSV | Ekspansi penuh lintas modul WMS + ekspor Excel/CSV/PDF + validasi Master Produk | 29+ tool AI aktif, semua tabel mendukung unduh `.xlsx`, `.csv`, `.pdf` |
| Permintaan user yang gagal dieksekusi AI hilang di riwayat chat dan tidak sampai ke agen developer | Siklus *AI Self-Reporting Capability Gap* otomatis (UI -> Supabase -> CLI -> GitHub -> Antigravity) | Setiap tugas tak terdukung tercatat dengan `GAP-ID` di Supabase & tersinkron ke `docs/memory/AI_CAPABILITY_GAPS.md` via CLI |
| Sandbox AI Studio tidak memiliki akses Git remote & kredensial `.clasprc.json` lokal | Handoff terstruktur ke Antigravity untuk uji live, `git push`, Vercel deploy, & GAS sync | Build & lint 0 error, `verify-release` lolos, live Supabase sync teruji, dan ter-deploy di Vercel |

### Di Luar Ruang Lingkup Plan Ini
- **Modul Fulfilment Pesanan Online (Jalur C)**: Tetap berstatus `⏳ PENDING REVIEW` di `docs/plans/PRD_PLAN_FULFILMENT_PESANAN_ONLINE_JALUR_C.md` dan **TIDAK** dieksekusi sebelum disetujui user secara eksplisit.
- Mutasi otomatis stok fisik (`log_produk`) oleh AI tanpa konfirmasi operator (AI tetap ketat *Human-in-the-Loop* / draft form).

---

## 3. Pengguna dan Peran

| Peran | Pengguna / Aktor | Kebutuhan & Batas Akses |
| --- | --- | --- |
| **Owner / Superadmin** | Akun `@warehouse`, `admin`, `chocoadm` | Akses penuh seluruh 29+ tool AI, panel **Backlog Dev** (ubah status/hapus/unduh `.md`), dan pengaturan whitelist AI. |
| **Warehouse Ops** | Tim operasional gudang & produksi | Akses tool stok, produksi, picking, SO/Putaway, Loading Dock, pengiriman, validasi lampiran, & lihat/tandai selesai Backlog Dev. |
| **HR & Admin** | Tim HR (`menu_hr_*`) | Akses tambahan tool HR (`query_hr_operations`) & ringkasan approval pending di KPI harian. |
| **Store PIC** | Pengguna cabang store (`role = store`) | Akses terisolasi: hanya melihat data store sendiri, FAQ khusus perspektif Store, draft Manual Shipment/Retur, & QnA SOP tanpa menu internal gudang/HR. |
| **Agen Coding (AI Studio & Antigravity)** | Dua agen kolaboratif via GitHub | Wajib mematuhi protokol Pre-Task Sync & Post-Task Memory Sync agar konteks kerja identik di kedua lingkungan. |

---

## 4. Arsitektur Sinkronisasi Memori Dua Arah (AI Studio <-> GitHub <-> Antigravity)

Agar memori pekerjaan **selalu sinkron antara AI Studio dan Antigravity**, GitHub ditetapkan sebagai **satu-satunya perantara kebenaran (*Single Source of Truth*)** yang menggabungkan kode, memori fitur, rencana pending, dan backlog AI:

```text
[ Pengguna di Aplikasi WMS ]
          │ (Tugas belum bisa dieksekusi AI)
          ▼
[ Supabase: wms_system_docs (doc_key = wms_ai_capability_gaps_index) ]
          │
          │  node tools/pull_ai_dev_reports.cjs
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GITHUB REPOSITORY (origin/main)                      │
│  1. GEMINI.md                          -> Aturan permanen (< 15 KB)     │
│  2. docs/memory/WMS_FEATURE_REGISTRY.md -> Peta 25 modul & invarian     │
│  3. docs/memory/WMS_MODULE_CHANGELOG.md -> Log revisi kronologis        │
│  4. docs/memory/AI_CAPABILITY_GAPS.md   -> Backlog gap dari AI live     │
│  5. docs/PENDING_PLANS.md               -> Daftar PRD & status eksekusi │
│  6. docs/plans/PRD_PLAN_*.md            -> Spesifikasi & checklist plan │
│  7. src/config/appVersion.ts & public/version.json -> Versi aktif       │
└──────────────────────────┬───────────────────────────┬──────────────────┘
                           │                           │
            git pull / sync│                           │git pull --rebase
            & export/push  │                           │& git push origin main
                           ▼                           ▼
                  [ AI Studio Agent ]        [ Antigravity Local Agent ]
                  (Desain, PRD, Kode,        (Pull AI Gaps Supabase, Uji Live,
                   Build/Lint Lokal)          GAS Deploy, Git Push, Vercel)
```

### Protokol Wajib Sinkronisasi Setiap Sesi (Berlaku untuk AI Studio & Antigravity)

1. **Fase Pembuka (*Pre-Task Sync*)**:
   - Di Antigravity: jalankan `git pull --rebase`, `node tools/gas_status.cjs`, dan `node tools/pull_ai_dev_reports.cjs`.
   - Di kedua agen (AI Studio & Antigravity): baca `docs/memory/WMS_FEATURE_REGISTRY.md`, `docs/memory/WMS_MODULE_CHANGELOG.md`, `docs/memory/AI_CAPABILITY_GAPS.md`, dan `docs/PENDING_PLANS.md`.
2. **Fase Penutup (*Post-Task Memory & Handoff Sync*)**:
   - Perbarui `docs/memory/WMS_FEATURE_REGISTRY.md` jika ada modul, tab, tool, tabel, atau aturan bisnis baru/berubah.
   - Tambahkan entri terbaru di bagian **paling atas** `docs/memory/WMS_MODULE_CHANGELOG.md`.
   - Perbarui status item pada `docs/PENDING_PLANS.md` (`⏳ PENDING REVIEW` -> `🚧 IN PROGRESS` -> `✅ SELESAI`).
   - Jika menyelesaikan item dari `docs/memory/AI_CAPABILITY_GAPS.md`, jalankan:
     ```bash
     node tools/pull_ai_dev_reports.cjs --resolve <GAP-ID> "Ringkasan implementasi di v2.X.Y"
     ```
   - Jalankan `node tools/bump_version.cjs verify-release`, `npm run build`, dan `npm run lint`.
   - Di Antigravity: commit seluruh perubahan (termasuk `docs/memory/*` dan `docs/PENDING_PLANS.md`) lalu `git push origin main` agar AI Studio menerima state terbaru saat sinkronisasi berikutnya.

> **Catatan Teknis Lingkungan AI Studio**: Saat memperbarui `package.json` di AI Studio, gunakan editor file terkontrol (jangan menimpa `package.json` secara paksa lewat shell) agar file watcher sandbox tidak terganggu. Di Antigravity lokal, `node tools/bump_version.cjs bump` dapat berjalan normal.

---

## 5. Kebutuhan Fungsional (F1–F7)

### F1. Fondasi Memori Permanen Global Semua Modul
- Direktori `docs/memory/` menyimpan 3 berkas inti yang wajib diperbarui untuk perubahan modul apa pun:
  - `docs/memory/WMS_FEATURE_REGISTRY.md` (peta 25 modul WMS, komponen, service, tabel Supabase, dan invarian).
  - `docs/memory/WMS_MODULE_CHANGELOG.md` (riwayat revisi kronologis per versi).
  - `docs/memory/AI_CAPABILITY_GAPS.md` (backlog laporan kapabilitas AI).
- `GEMINI.md` dipadatkan di bawah 15 KB tanpa duplikasi section, memuat kewajiban Pre-Task & Post-Task sync memori.
- `tools/bump_version.cjs verify-release` memvalidasi keberadaan seluruh file `docs/memory/*` (`permanentMemoryReady: true`) serta menghitung jumlah `openAiCapabilityGaps`.

### F2. Sistem AI Self-Reporting Capability Gap
- Service `src/services/wmsAiGapReportService.ts` menyimpan laporan ke Supabase tabel `wms_system_docs` (`doc_key = 'wms_ai_capability_gaps_index'`).
- Fitur hemat egress & anti-spam:
  - Disimpan dalam 1 dokumen JSON tunggal (maksimal 100 item terbaru).
  - SWR cache 60 detik + mirror `localStorage`.
  - Deduplikasi otomatis berdasarkan normalisasi `(moduleArea, title)` yang menaikkan counter `occurrences` dan mengangkat prioritas jika sering diminta.
- Skrip CLI `tools/pull_ai_dev_reports.cjs`:
  - Membaca kredensial dari environment / `.env` / `.env.local` (tanpa hardcode secret).
  - Menarik backlog dari Supabase dan merender ulang `docs/memory/AI_CAPABILITY_GAPS.md`.
  - Mendukung `--resolve <GAP-ID> "<catatan>"` untuk memperbarui status ke `done` di Supabase sekaligus menyegarkan file Markdown lokal.
- Antarmuka `WmsAiModal.tsx`:
  - Kartu konfirmasi kuning/amber di bubble chat saat tool `report_ai_capability_gap` terpanggil (menampilkan `GAP-ID`, modul, usulan tool, dan tombol **Unduh Laporan (.md)**).
  - Panel **Backlog Dev** pada header modal AI (untuk Superadmin & Warehouse Ops) dengan badge jumlah open, toggle `Open`/`Selesai`, muat ulang, hapus (Owner), dan **Unduh Semua (.md)**.

### F3. Ekspansi 10 Extended WMS AI Tools (`src/services/wmsAiExtendedTools.ts`)
Melengkapi 19 tool yang sudah ada menjadi 29+ tool penuh:
1. `query_wms_knowledge_and_sop` — QnA fitur, SOP operasional (SO, prioritas picking, retur, Master Produk, Zero-Reload), & live `fetchStoreFaqs()` berbasis peran.
2. `query_loading_dock_and_packing` — Status batch `loading_dock_batches` dan ringkasan kesiapan picking-ke-packing.
3. `query_distribusi_and_pengiriman` — Distribusi SJ (`distribusi_sj`), Laporan Pengiriman Store, Trip Armada, Handover Paket Kurir, Penerimaan Paket Masuk, & Mutasi Store.
4. `query_all_order_channels` — Ringkasan & pencarian lintas kanal: Manual Shipment, Alteration/Permak, Shopee, Website, & IG Live (otomatis memfilter keluar `RTR-` dan mengisolasi store untuk user Store).
5. `query_so_and_putaway` — Antrean Stock Opname (`fetchStockOpnameQueue`) & tugas Putaway (`fetchPutawayTasks`).
6. `query_store_help_tickets` — Daftar tiket kendala Store (`fetchStoreHelpTickets`), terisolasi per store jika role `store`.
7. `get_executive_daily_summary` — Ringkasan KPI harian lintas modul (Produksi masuk hari ini, Picking aktif, Pengiriman Store, Retur Baru/Diproses, Putaway, Perbaikan, dan HR Pending jika berhak).
8. `validate_items_against_master` — Validasi daftar item hasil unggah Excel/CSV/PDF/Foto menggunakan `lookupProductBySku` + katalog Master Produk + live `fetchStockForSkus`, menandai `VALID`, `ANOMALI_SIZE`, atau `TIDAK_DITEMUKAN`.
9. `open_wms_module_shortcut` — Menampilkan kartu tombol pintasan 1 klik untuk membuka langsung halaman/modul WMS (`onNavigateToPage`).
10. `report_ai_capability_gap` — Mencatat permintaan di luar kapabilitas tool saat ini ke backlog Supabase.

### F4. Multi-Format Export (`Excel .xlsx`, `CSV .csv`, `PDF .pdf`, `Markdown .md`)
- `src/utils/aiReportExporter.ts` diperluas dengan:
  - `exportAiTableToCsv`: ekspor CSV standar RFC-4180 dengan **UTF-8 BOM (`\uFEFF`)** agar aman dibuka di Excel & sistem impor DealPOS.
  - `exportMarkdownFile`: ekspor dokumen `.md` untuk laporan backlog pengembangan AI.
- Tombol **Excel (.xlsx)** (solid primary), **CSV (.csv)** (outline netral), dan **PDF (.pdf)** (outline netral) tersedia konsisten pada setiap tabel Markdown inline chat maupun kartu hasil `generate_exportable_report`.

### F5. Smart Navigation 1-Klik (`App.tsx` -> `WmsAiModal.tsx`)
- `App.tsx` meneruskan prop `onNavigateToPage={(page) => handleSelectPage(page)}` ke `WmsAiModal`.
- Saat user mengklik tombol pintasan di chat AI, aplikasi langsung berpindah ke halaman tujuan dan mengecilkan (minimize) modal AI agar pengguna bisa bekerja sambil tetap menyimpan sesi chat.

### F6. Verifikasi Live & Hardening oleh Antigravity (PENDING EKSEKUSI)
Pekerjaan verifikasi yang perlu dieksekusi langsung oleh Antigravity di lingkungan lokal/produksi yang terhubung penuh ke Supabase, GitHub, Vercel, dan GAS:
1. Uji `node tools/pull_ai_dev_reports.cjs` menggunakan `.env.local` live Supabase untuk memastikan baca/tulis `wms_system_docs` (`wms_ai_capability_gaps_index`) berjalan tanpa error RLS/CORS.
2. Uji minimal 5 skenario prompt live pada Asisten AI:
   - Prompt QnA SOP (role Admin vs role Store — pastikan role Store tidak disuruh klik tombol Admin).
   - Prompt ringkasan eksekutif harian & ekspor ke `.xlsx`, `.csv`, dan `.pdf`.
   - Prompt unggah Excel/CSV/Foto untuk `validate_items_against_master` (cek integritas nama & size Master Produk).
   - Prompt navigasi modul (`open_wms_module_shortcut`) di Desktop & HP Seluler.
   - Prompt tugas yang belum didukung (misal: *"kirim otomatis invoice WA ke 50 supplier setiap jam 5 sore"*) untuk memverifikasi `report_ai_capability_gap` tercatat di Supabase, muncul di Panel **Backlog Dev**, lalu ditarik oleh `node tools/pull_ai_dev_reports.cjs` ke `docs/memory/AI_CAPABILITY_GAPS.md`, kemudian dibersihkan/ditandai `--resolve` setelah uji coba.
3. Audit tampilan **Desktop (`>= 1024px`)** dan **HP Seluler (`< 640px`)** untuk Panel Backlog Dev dan tombol ekspor CSV/Excel/PDF (target sentuh 40–48px, tidak ada overflow horizontal, anti-pelangi tombol).

### F7. Rilis GitHub, Deploy Vercel & Otomasi Pre-Task Antigravity (PENDING EKSEKUSI)
1. Sinkronkan seluruh file `v2.25.0` (termasuk `docs/memory/*`, `docs/plans/*`, `docs/PENDING_PLANS.md`, dan `GEMINI.md`) ke `origin/main` di GitHub.
2. Pastikan `.agents/skills/pre-task-sync/SKILL.md` dan `.agents/skills/auto-deploy/SKILL.md` di lokal Antigravity juga memanggil `node tools/pull_ai_dev_reports.cjs` dan memeriksa `docs/memory/*` bila belum diselaraskan.
3. Verifikasi Vercel Auto-Deploy berhasil untuk build `v2.25.0` dan Zero-Reload update berjalan mulus di perangkat desktop & seluler.

---

## 6. Inventaris File & Status Implementasi

| File | Status | Keterangan |
| --- | :---: | --- |
| `docs/memory/WMS_FEATURE_REGISTRY.md` | ✅ Selesai ditulis | Peta permanen 25 modul WMS & invarian sistem |
| `docs/memory/WMS_MODULE_CHANGELOG.md` | ✅ Selesai ditulis | Log kronologis revisi modul (termasuk `v2.24.8` – `v2.25.0`) |
| `docs/memory/AI_CAPABILITY_GAPS.md` | ✅ Selesai ditulis | Target sinkronisasi backlog gap dari Supabase |
| `docs/plans/PRD_PLAN_AI_FULL_COVERAGE_DAN_MEMORI_PERMANEN_SYNC.md` | ✅ Selesai ditulis | Dokumen PRD & Plan ini |
| `docs/PENDING_PLANS.md` | ✅ Diperbarui | Mencatat plan ini + mempertahankan Jalur C sebagai `PENDING REVIEW` |
| `docs/README.md` | ✅ Diperbarui | Menambahkan seksi `0. docs/memory/` & referensi PRD baru |
| `GEMINI.md` | ✅ Diperbarui | Dipadatkan < 15 KB + protokol sinkronisasi memori AI Studio <-> GitHub <-> Antigravity |
| `tools/bump_version.cjs` | ✅ Diperbarui | Menambah cek `permanentMemoryReady` & `openAiCapabilityGaps` di `verify-release` |
| `tools/pull_ai_dev_reports.cjs` | ✅ Selesai ditulis | CLI tarik & `--resolve` backlog gap Supabase -> `docs/memory/AI_CAPABILITY_GAPS.md` |
| `src/services/wmsAiGapReportService.ts` | ✅ Selesai ditulis | Service Supabase + SWR 60s + deduplikasi + formatter Markdown |
| `src/services/wmsAiExtendedTools.ts` | ✅ Selesai ditulis | 10 tool baru lintas modul WMS + dispatcher |
| `src/utils/aiReportExporter.ts` | ✅ Diperbarui | Tambah `exportAiTableToCsv` (UTF-8 BOM) & `exportMarkdownFile` |
| `src/services/wmsAiService.ts` | ✅ Diperbarui | Wiring 10 tool baru, RBAC Store/HR, system prompt self-reporting & CSV |
| `src/components/ai/WmsAiModal.tsx` | ✅ Diperbarui | Tombol CSV, 10 label tool, Panel Backlog Dev, Kartu Gap & Kartu Shortcut |
| `src/App.tsx` | ✅ Diperbarui | Meneruskan prop `onNavigateToPage` ke `WmsAiModal` |
| `.agents/skills/pre-task-sync/SKILL.md` & `auto-deploy/SKILL.md` | ⏳ Pending Antigravity | Selaraskan checklist skill lokal agar ikut menjalankan `pull_ai_dev_reports.cjs` & cek `docs/memory/` |
| Uji Live Supabase + AI + Git Push + Vercel Deploy | ⏳ Pending Antigravity | Eksekusi pada mesin lokal yang memiliki `.env.local`, Git remote, & akses Vercel/GAS |

---

## 7. Model Data & Guardrails Egress Supabase

- **Tabel yang digunakan kembali (Zero Migration Breaking Change)**: `public.wms_system_docs` (sudah tersedia & dipakai `wms_ai_config` dan `pusat_resolusi_settings`).
- **Kunci Dokumen**: `doc_key = 'wms_ai_capability_gaps_index'`, `section_id = 'wms_ai_capability_gaps_index'`.
- **Struktur Item JSON (`AiCapabilityGapReport`)**:
  - `id` (`GAP-YYYYMMDD-XXXX`), `title`, `userPrompt`, `moduleArea`, `reasonCannotExecute`, `proposedToolOrFeature`, `expectedBehavior`, `priority` (`high | medium | low`), `reportedBy`, `reportedRole`, `createdAt`, `updatedAt`, `status` (`open | in_progress | done`), `resolutionNote?`, `occurrences`.
- **Guardrail Egress**:
  - Maksimal **100 entri** disimpan per dokumen JSON (entry terlama otomatis terpangkas).
  - Query selalu eksplisit memakai `select=content,updated_at&limit=1`.
  - Seluruh query daftar di `wmsAiExtendedTools.ts` dibatasi `limit=40` sampai `limit=100` dan memakai cache layanan yang sudah ada (`putawayService`, `localDb`, `productLookup`).

---

## 8. Kebutuhan Non-Fungsional & Keamanan

- **Zero Hardcoded Secrets**: `tools/pull_ai_dev_reports.cjs` hanya membaca `SUPABASE_URL`/`VITE_SUPABASE_URL` dan key dari `process.env` atau `.env`/`.env.local`. Jika tidak ada, script keluar dengan kode `0` agar tidak memblokir Pre-Task Sync.
- **API Key AI Server-Side**: Seluruh panggilan Gemini tetap melalui `/api/ai` (`@google/genai` server-side); dilarang mengimpor `@google/genai` di sisi klien.
- **Role-Based Access Control (RBAC)**:
  - Role `store` tidak mendapat akses tool internal (`query_hr_operations`, `audit_stock_and_mutations`, `query_so_and_putaway`, `query_loading_dock_and_packing`, `get_executive_daily_summary`) dan data order/help ticket disaring ketat ke `store_name` miliknya.
  - Panel **Backlog Dev** hanya tampil untuk `superadmin` dan `warehouse_ops`; tombol hapus laporan hanya untuk akun Owner (`@warehouse`).
- **Integritas Master Produk**: Validasi lampiran/impor wajib melewati `lookupProductBySku` dan `resolveProductDisplaySize` agar tidak pernah menampilkan anomali nama/size.

---

## 9. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Salah satu agen (AI Studio atau Antigravity) lupa memperbarui `docs/memory/*` | Memori kerja meleset (*drift*) antar lingkungan | Wajibkan cek `permanentMemoryReady` di `bump_version.cjs verify-release` dan jadikan bagian checklist Pre-Task/Post-Task di `GEMINI.md` |
| Konflik merge Git pada `WMS_MODULE_CHANGELOG.md` atau `package.json` | Push tertahan saat dua lingkungan mengubah versi | Selalu jalankan `git pull --rebase` sebelum mulai kerja; bumpping versi resmi hanya dilakukan sekali sebelum `git push` |
| RLS `wms_system_docs` menolak write dari anon key | Gap report hanya tersimpan di `localStorage` | Antigravity verifikasi policy `wms_system_docs` pada Fase 1 uji live; fallback `localStorage` + tombol Unduh `.md` menjaga data tidak hilang |
| AI terlalu sering memanggil `report_ai_capability_gap` untuk pertanyaan biasa | Backlog Dev penuh noise | System prompt mengarahkan AI memanggil tool eksisting terlebih dahulu; deduplikasi berdasarkan `(moduleArea, title)` mencegah duplikasi |

---

## 10. Rencana Eksekusi Bertahap untuk Antigravity

| Fase | Target | Langkah Eksekusi Antigravity | Kriteria Selesai (*Done*) |
| --- | --- | --- | --- |
| **Fase 1: Sinkronisasi Git & Verifikasi Build** | Menyelaraskan repo lokal dengan hasil AI Studio | 1. Tarik kode `v2.25.0` ke repo lokal.<br>2. Jalankan `npm run lint`, `npm run build`, dan `node tools/bump_version.cjs verify-release`.<br>3. Cek `git status` & pastikan tidak ada file tak sengaja tertinggal. | `build` & `lint` 0 error, `verify-release` -> `passed: true`, `permanentMemoryReady: true` |
| **Fase 2: Uji Live Supabase & AI Self-Reporting** | Memastikan loop Supabase <-> CLI <-> UI bekerja nyata | 1. Pastikan `.env.local` berisi kredensial Supabase aktif.<br>2. Uji trigger `report_ai_capability_gap` dari UI Asisten AI.<br>3. Jalankan `node tools/pull_ai_dev_reports.cjs` dan verifikasi entry muncul di `docs/memory/AI_CAPABILITY_GAPS.md`.<br>4. Uji `--resolve <GAP-ID>` dan bersihkan dummy test jika perlu. | Siklus UI -> Supabase -> `AI_CAPABILITY_GAPS.md` -> Resolve berjalan 100% tanpa error |
| **Fase 3: Uji Fungsional 10 Tool Baru, Export CSV & Mobile/Desktop UI** | Memastikan kualitas UX & akurasi data operasional | 1. Uji prompt untuk QnA SOP (Admin & Store), KPI Harian, Distribusi/Pengiriman, SO/Putaway, Loading Dock, Store Help, Validasi Master Produk, & Navigasi 1-Klik.<br>2. Uji unduh `.xlsx`, `.csv` (buka di Excel cek encoding), `.pdf`, dan `.md`.<br>3. Cek tampilan Desktop (`>= 1024px`) dan Mobile (`< 640px`). | Semua 10 tool merespons akurat sesuai RBAC, CSV rapi di Excel, zero horizontal overflow di HP |
| **Fase 4: Selaraskan Skill Lokal, Commit, Push & Deploy** | Menutup loop sinkronisasi GitHub & rilis produksi | 1. Selaraskan `.agents/skills/pre-task-sync/SKILL.md` dan `auto-deploy/SKILL.md` bila perlu.<br>2. Ubah status plan ini di `docs/PENDING_PLANS.md` menjadi `✅ SELESAI`.<br>3. `git commit` + `git push origin main` -> verifikasi Vercel Auto-Deploy & GAS status. | Kode & memori `v2.25.0` live di GitHub & Vercel, siap ditarik kembali oleh AI Studio kapan saja |

---

## 11. Keputusan dan Item Konfirmasi Terbuka

- [ ] **Konfirmasi Policy Supabase `wms_system_docs`**: Pastikan role `authenticated`/anon yang dipakai frontend WMS diizinkan `UPSERT` pada `doc_key = 'wms_ai_capability_gaps_index'` (sama seperti `wms_ai_config`).
- [ ] **Konfirmasi Batas Retensi Backlog AI**: Saat ini dibatasi 100 laporan terbaru untuk menjaga egress Supabase minimal — apakah cukup atau perlu arsip berkala ke Google Drive/Sheet via GAS?
- [ ] **Konfirmasi Notifikasi Backlog Baru**: Apakah saat `report_ai_capability_gap` terpanggil perlu mengirim notifikasi ringkas ke WhatsApp/Email admin lewat GAS, atau cukup tampil di Panel **Backlog Dev** + ditarik CLI Antigravity?
- [ ] **Konfirmasi Prioritas Berikutnya**: Setelah plan ini berstatus `✅ SELESAI`, apakah lanjut review & eksekusi `PRD & Plan: Modul Fulfilment Pesanan Online (Jalur C)`?
