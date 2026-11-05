---
name: wms-live-chat-guardrails
description: Guardrail, arsitektur, dan checklist regresi untuk fitur Live Chat WMS Inventory (liveChatService.ts, LiveChatWorkspace.tsx, LiveChatFloatingWidget.tsx, public/pwa-extras.js, permissions.ts, userResolver.ts). Aktifkan SETIAP kali menyentuh chat, room, pesan, notifikasi chat, direktori user/rekan, role Customer Service (chococs1/chococs2), atau Service Worker chat action.
---

# WMS Live Chat Guardrails

Skill ini mengamankan fungsi Live Chat agar agent mana pun tidak mengulang bug yang sudah pernah terjadi (audit v2.6.59).

## 1. Peta Arsitektur

| Lapisan | File | Peran |
|---|---|---|
| Manager (singleton) | `src/services/liveChatService.ts` (`liveChatManager`) | State rooms/messages/presence, sync, tombstone, upsert |
| UI penuh & drawer | `src/components/LiveChat/LiveChatWorkspace.tsx` | Daftar chat, tab Rekan, pencarian, modal grup, composer |
| FAB/drawer/toast | `src/components/LiveChat/LiveChatFloatingWidget.tsx` | Open/close drawer, toast pesan masuk |
| Service Worker | `public/pwa-extras.js` (`handleBackgroundChatAction`) | Aksi notifikasi: Balas Cepat, Tandai Dibaca |
| Akses & nama | `src/services/permissions.ts`, `src/utils/userResolver.ts`, `src/services/supabase.ts` (`fetchWmsUsersFromSupabase`) | `menu_ops_live_chat`, nama tampilan, store resolver |

Penyimpanan (tabel `wms_system_docs`, key = `section_id` = `doc_key`):
- `wms_chat_rooms_index_v1` → array room (otoritatif)
- `wms_chat_deleted_rooms_v1` → tombstone `{roomId: deletedAtISO}`
- `wms_chat_room_msgs_<roomId>` → pesan hot (maks `HOT_MESSAGE_LIMIT_PER_ROOM`)
- Lokal: IndexedDB (rooms + messages permanen), localStorage tombstone.
- Room direct ID: `direct_<userA>_<userB>` (username lowercase, diurutkan).

## 2. Invariant WAJIB (jangan dilanggar)

1. **Buka chat baru = optimistis 0ms.** `openOrCreateDirectRoom` harus mengisi `state.rooms`, `messagesByRoom[id]=[]`, `activeRoomId`, lalu `notify()` SEBELUM request jaringan (`upsertRoomToServer`). Jangan pindahkan `await` ke depan.
2. **Grace window `recentlyUpsertedRooms` (20 dtk).** `syncRoomsFromServer` memperlakukan indeks server sebagai otoritatif dan menghapus room lokal yang tidak ada di server. Room yang baru dibuat/diupdate (`upsertRoomToServer`, `persistHotMessagesAndRoomIndex`, `openOrCreateDirectRoom`) harus tetap dijaga lewat `pendingUpsertRooms` + `recentlyUpsertedRooms`. Hapus entri keduanya di `deleteChatRoom` & `handleIncomingRoomDeleted`.
3. **Tombstone clock-skew.** Saat membuat ulang direct room yang pernah dihapus: hapus tombstone-nya (lokal + server) dan pastikan `created_at` > `deletedAt` (+2 dtk). `isRoomDeletedByTombstone` memakai `createdMs <= deletedMs`.
4. **Jangan pernah menimpa pesan dengan `[]` secara sembarangan.** Pengosongan hanya jika hot store kosong, tidak ada `archive_urls`, DAN tidak ada pesan lokal < 20 dtk (pesan in-flight).
5. **Service Worker: query WAJIB memakai `encodeURIComponent(msgsDocKey)`** di `or=(section_id.eq.<key>,doc_key.eq.<key>)`. Jangan POST balik `messages`/`rooms` jika array kosong (`if (messages.length > 0)`, `if (rooms.length > 0)`). Bug lama: query terpotong → riwayat chat terhapus.
6. **Pencarian rekan harus tersedia di tab "Semua Chat".** Saat `searchQuery` terisi, tampilkan seksi "Mulai Chat 1-on-1 dengan Rekan" dari direktori user. Tab ke-3 berlabel `Rekan (total)` (bukan hitungan online) — user offline tetap bisa di-chat.
7. **Pencocokan user** lewat `matchesUserSearch`: normalisasi spasi/`-`/`_` (`cs 2` = `cs2` = `chococs2`) dan alias `cs`, `cs1`, `cs2`. Modal grup memakai `allColleagueUsers` (tidak terfilter pencarian sidebar).
8. **Role `Customer Service`** harus ada di `INITIAL_ROLE_DEFAULT_PERMISSIONS` & `INITIAL_ROLE_DETAILS` dengan `menu_ops_live_chat: true`. Akun `chococs*` BUKAN Store: jangan auto-resolve `store_code/store_name` dari username `choco...` untuk role CS.
9. **Nama tampilan**: jika `name` DB sama dengan username mentah, pakai `getUserPersonName`. `BASELINE_USER_NAMES` memuat `chococs1` → `CS 1 (Customer Service)`, `chococs2` → `CS 2 (Customer Service)`. Cache `wms_user_name_map` di localStorage tidak boleh menimpa nama baseline dengan username mentah.
10. **FloatingWidget**: state `isOpen`/`selectedRoomId` dibaca lewat ref di dalam subscriber; jangan masukkan `isOpen`/`selectedRoomId` ke dependency effect subscribe (menyebabkan loop/overwrite). Buka/tutup drawer lewat `setFloatingDrawerOpen`.
11. **Tombol Kirim** tidak boleh disabled jika ada `pendingOrderContext` (kirim konteks pesanan tanpa teks).
12. **Dilarang `window.location.reload()`** di alur chat (aturan Zero-Reload GEMINI.md §11). Data chat disinkronkan via Realtime + polling 8 dtk.
13. Base64 gambar dilarang di pesan (`data:`); wajib upload GDrive dulu.

## 3. Alur Kerja Saat Mengubah Live Chat

1. `git pull --rebase` + `node tools/gas_status.cjs` (aturan pre-task).
2. Baca bagian terkait di 5 file pada peta di atas; jangan edit buta.
3. Jika menyentuh room/pesan, cek invarian 1–5 secara eksplisit.
4. Jalankan checklist regresi (bagian 4) — minimal secara baca kode; idealnya manual di browser dengan 2 akun.
5. UI mengikuti `wms-ui-ux-design-system` & `wms-responsive-desktop-mobile` (1 tombol solid per toolbar, `font-mono` untuk ID, tanpa titik pemisah menggantung).
6. Bump versi → `npm run build` → commit → push → laporan `### 🚀 Deployment Status`.
7. Jika `public/pwa-extras.js` berubah, sebutkan bahwa Service Worker baru aktif setelah user berpindah menu (zero-reload).

## 4. Checklist Regresi Live Chat

- [ ] Ketik `cs2`, `cs 2`, `chococs2` di tab Semua Chat → muncul seksi rekan → klik → ruang terbuka instan (drawer & halaman penuh, desktop & HP).
- [ ] Tab `Rekan (n)` menampilkan user offline & bisa di-chat.
- [ ] Tunggu ≥ 10 dtk setelah membuka chat baru (satu siklus polling) → room tidak tertutup.
- [ ] Hapus chat lalu buka lagi dengan user yang sama → room muncul & tidak langsung hilang.
- [ ] Kirim pesan → muncul di akun lawan (Realtime), unread badge naik, buka → ✓✓.
- [ ] Notifikasi push: "Tandai Dibaca" & "Balas Cepat" → riwayat pesan tetap utuh (cek `wms_chat_room_msgs_<id>` di Supabase tidak menjadi `[]`).
- [ ] Login `chococs1`/`chococs2` → FAB/menu Live Chat tampil; nama tampil `CS 1/2 (Customer Service)`.
- [ ] Tombol "Tanya Pesanan / Chat ke Gudang" (`openOrderChat`) membuka room & konteks pesanan terlampir.
- [ ] `npm run build` bersih.

## 5. Diagnosa Cepat (Supabase REST, anon key dari `DEFAULT_SUPABASE_ANON_KEY`)

```
GET /rest/v1/wms_system_docs?select=content&section_id=eq.wms_chat_rooms_index_v1
GET /rest/v1/wms_system_docs?select=content&section_id=eq.wms_chat_deleted_rooms_v1
GET /rest/v1/wms_system_docs?select=content&section_id=eq.wms_chat_room_msgs_<roomId>
GET /rest/v1/wms_users?username=in.(chococs1,chococs2)&select=*
```
Tool bantu: `tools/check_chat.cjs`.

Gejala → penyebab umum:
- Room terbuka lalu menutup sendiri → grace window/tombstone (invarian 2–3).
- Riwayat chat tiba-tiba kosong → SW query/POST kosong (invarian 4–5) atau tombstone.
- User tidak ketemu → `matchesUserSearch`/direktori belum dimuat (`refreshUsersDirectory(true)`), atau role tanpa `menu_ops_live_chat`.
- Drawer berkedip/menutup → dependency effect FloatingWidget (invarian 10).

## 6. Jangan Lakukan
- Jangan menghapus tombstone/room/pesan massal di Supabase tanpa persetujuan user.
- Jangan menyuntikkan pesan sistem otomatis atas nama user.
- Jangan mengubah format key `wms_chat_*` atau struktur `ChatRoom`/`ChatMessage` tanpa migrasi & update skill ini.

> Setiap bug Live Chat baru yang ditemukan: tambahkan sebagai invarian/checklist di skill ini.
