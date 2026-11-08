# Aktivasi Web Push (notifikasi saat aplikasi ditutup)

Kode sudah ter-deploy. Agar jalan, lakukan **3 langkah satu kali** berikut (±5 menit).

## 1. Env var di Vercel

Vercel → Project → Settings → Environment Variables (Production), lalu **Redeploy**.

| Nama | Nilai |
| --- | --- |
| `VAPID_PUBLIC_KEY` | dari file `C:\Users\Chocochips Warehouse\.gemini\antigravity\brain\332a2c49-4f24-41ca-8ccd-a913c7c0e33b\scratch\push_secrets.json` |
| `VAPID_PRIVATE_KEY` | dari file `C:\Users\Chocochips Warehouse\.gemini\antigravity\brain\332a2c49-4f24-41ca-8ccd-a913c7c0e33b\scratch\push_secrets.json` (RAHASIA) |
| `VAPID_SUBJECT` | `mailto:chocochips.warehouse2@gmail.com` |
| `PUSH_WEBHOOK_SECRET` | dari file `C:\Users\Chocochips Warehouse\.gemini\antigravity\brain\332a2c49-4f24-41ca-8ccd-a913c7c0e33b\scratch\push_secrets.json` |
| `SUPABASE_URL` | `https://ilhqerecxbywqrhfpbbc.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → **service_role / secret key** |

## 2. SQL di Supabase

Supabase → SQL Editor → tempel isi `docs/push_notifications_setup.sql`.
Ganti `<DOMAIN_VERCEL>` (mis. `wms-xxx.vercel.app`) dan `<PUSH_WEBHOOK_SECRET>` (sama dengan Vercel) → Run.

## 3. Aktifkan di tiap perangkat

Buka aplikasi, login, izinkan notifikasi (sekali). Perangkat otomatis terdaftar.
Di iPhone: aplikasi harus di-**Add to Home Screen** dulu (syarat iOS 16.4+).

## Uji

Tutup aplikasi/browser → buat pesanan manual atau kirim chat dari akun lain → notifikasi muncul.
