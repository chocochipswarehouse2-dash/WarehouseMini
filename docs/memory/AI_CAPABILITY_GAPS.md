# AI Capability Gaps — Dev Agent Backlog

> File ini disinkronkan otomatis dari Supabase (`wms_system_docs` -> `wms_ai_capability_gaps_index`) menggunakan perintah:
> ```bash
> node tools/pull_ai_dev_reports.cjs
> ```
> Setiap kali Asisten AI WMS menerima permintaan pengguna yang belum dapat dieksekusi oleh tool yang tersedia, AI akan memanggil `report_ai_capability_gap` dan menyimpannya ke backlog ini agar otomatis dibaca dan dikembangkan oleh agen coding saat pull update.

## Panduan Agen Coding
1. Jalankan `node tools/pull_ai_dev_reports.cjs` pada tahap Pre-Task Sync untuk menarik laporan terbaru dari Supabase.
2. Tinjau item pada bagian **Open / In Progress** di bawah ini sebelum merencanakan update.
3. Setelah fitur/tool baru selesai dikembangkan dan diverifikasi, tandai selesai dengan:
   ```bash
   node tools/pull_ai_dev_reports.cjs --resolve <GAP-ID> "Sudah diimplementasikan di v2.X.Y"
   ```
4. Perbarui `docs/memory/WMS_FEATURE_REGISTRY.md` dan `docs/memory/WMS_MODULE_CHANGELOG.md`.

## Open / In Progress

_Belum ada laporan gap kapabilitas AI yang terbuka._

## Resolved / Selesai

_Belum ada laporan yang diselesaikan._
