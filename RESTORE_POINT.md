# 🛡️ RESTORE POINT: STABLE RELEASE v2.5.0

- **Tanggal Snapshot**: 29 September 2026
- **Status Versi**: STABLE (Siap Produksi & Terverifikasi)
- **Git Commit Hash**: `d8b366f`
- **Git Tag**: `v2.5.0-stable`

---

## 📦 Fitur & Modul yang Termasuk dalam Restore Point Ini:

1. **Penerimaan Produksi (Matrix Spreadsheet & Per Tanggal)**:
   - Tampilan Matrix Spreadsheet bergaya Master Spreadsheet dengan formula `=IMAGE(...)`
   - Opsi Dual Push: **Push Sheet Master** dan **Push Sheet Per Tanggal Kedatangan** (1 Tab = 1 Tanggal)
   - Dukungan Hitung Ulang Fisik (Koreksi Selisih Qty & Berita Acara QC)
   - Filter Kategori: Lokal CMT & Kargo

2. **Google Apps Script Integration (Active & Sanitized)**:
   - Endpoint Master Web App: `https://script.google.com/macros/s/AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg/exec`
   - Mekanisme Auto-Sanitizer Cache URL (mencegah HTTP 404 pada browser user)

3. **Vercel & Build Configuration**:
   - `vercel.json` dengan konfigurasi framework Vite, `npm run build`, dan `--include=dev`
   - PWA Service Worker auto-update & cache invalidator

4. **Supabase Multi-Role & Realtime Database**:
   - Sinkronisasi realtime stok, penerimaan produksi, pesanan saya, pengiriman, dan modul HR.

---

## 🔄 Cara Mengembalikan ke Titik Ini (Jika Diperlukan):

Jika di kemudian hari terjadi kendala atau ingin kembali ke versi ini:

```bash
# Mengembalikan repository ke restore point stabil ini:
git checkout v2.5.0-stable
```
