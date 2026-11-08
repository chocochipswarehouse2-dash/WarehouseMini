/**
 * WMS Web Push Sender (Vercel Serverless Function)
 * ------------------------------------------------------------------
 * GET  /api/push  -> mengembalikan VAPID public key (dipakai browser untuk subscribe)
 * POST /api/push  -> dipanggil oleh trigger database Supabase (pg_net) saat ada
 *                    pesanan / retur / SPS / pesan chat baru, lalu mengirim Web Push
 *                    ke semua perangkat terdaftar sehingga notifikasi muncul
 *                    walau aplikasi / browser sudah ditutup (seperti WhatsApp).
 *
 * ENV (Vercel Project Settings -> Environment Variables):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   (mailto:...)
 *   PUSH_WEBHOOK_SECRET                                  (sama dengan di trigger SQL)
 *   SUPABASE_URL (atau VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */
import webpushRaw from 'web-push';
const webpush = (webpushRaw && webpushRaw.default) ? webpushRaw.default : webpushRaw;

const CHAT_INDEX_KEY = 'wms_chat_rooms_index_v1';

function supaConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, key };
}

function supaHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

const clean = (v) => String(v == null ? '' : v).trim();
const lower = (v) => clean(v).toLowerCase();

function parseJsonish(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return v;
}

/** Bangun daftar pesan { audience, payload } dari payload webhook database. */
function buildMessages(body) {
  const messages = [];
  const table = clean(body.table);

  if (table === 'manual_shipment') {
    for (const r of body.records || []) {
      const noPesanan = clean(r.no_pesanan).toUpperCase();
      const noTrans = clean(r.no_transaksi_customer).toUpperCase();
      const rawNotes = clean(r.notes_paket);
      if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) continue;
      const key = noPesanan || noTrans || clean(r.id).toUpperCase();
      if (!key) continue;
      const isAlter =
        noPesanan.startsWith('AR-') ||
        noPesanan.startsWith('ALT-') ||
        noPesanan.startsWith('REP-') ||
        rawNotes.includes('[ALTERATION_REPAIR]:');
      const store = clean(r.nama_pengirim) || 'Store';
      const orderId = clean(r.no_transaksi_customer || r.no_pesanan) || 'Pesanan Baru';
      const items = parseJsonish(r.items, []);
      const qty = Array.isArray(items) && items.length
        ? items.reduce((s, it) => s + (Number(it && it.qty) || 1), 0)
        : Number(r.qty) || 1;
      messages.push({
        audience: { admin: true },
        payload: {
          title: isAlter ? `✂️ Form Alter/Repair Baru — ${store}` : `🛍️ Pesanan Baru dari ${store}`,
          body: `Order #${orderId} • Customer: ${clean(r.nama_tujuan) || 'Customer'} (${qty} pcs via ${clean(r.jasa_kirim) || 'Ekspedisi'})`,
          tag: `manual-shipment-${key}`,
          page: 'pesanan_saya',
          url: '/',
        },
      });
    }
  } else if (table === 'retur_barang') {
    for (const r of body.records || []) {
      const no = clean(r.no_retur).toUpperCase();
      if (!no) continue;
      messages.push({
        audience: { admin: true },
        payload: {
          title: '🔄 Tiket Retur Barang Baru!',
          body: `Tiket #${no} atas nama ${clean(r.nama_customer) || 'Customer'} baru diajukan di Pusat Resolusi.`,
          tag: `retur-new-${no}`,
          page: 'pusat_resolusi',
          url: '/',
        },
      });
    }
  } else if (table === 'peminjaman') {
    const groups = new Map();
    for (const r of body.records || []) {
      const no = clean(r.no_peminjaman).toUpperCase();
      if (!no) continue;
      const g = groups.get(no) || { no, pic: clean(r.pic) || 'Peminjam', keperluan: clean(r.keperluan) || 'Peminjaman SPS', qty: 0, sku: 0 };
      g.qty += Number(r.qty) || 1;
      g.sku += 1;
      groups.set(no, g);
    }
    for (const g of groups.values()) {
      messages.push({
        audience: { admin: true, picker: true },
        payload: {
          title: `📋 Permintaan SPS Baru — ${g.pic}`,
          body: `Invoice #${g.no} • ${g.keperluan} (${g.sku} SKU / ${g.qty} pcs). Buka untuk proses picking.`,
          tag: `sps-new-${g.no}`,
          page: 'picking_tasks',
          url: '/',
        },
      });
    }
  } else if (table === 'wms_system_docs') {
    const rec = body.record || {};
    const docId = clean(rec.section_id || rec.doc_key);
    if (docId !== CHAT_INDEX_KEY) return messages;
    const newRooms = parseJsonish(rec.content, []);
    const oldRooms = parseJsonish((body.old_record || {}).content, []);
    const oldLast = new Map();
    for (const r of Array.isArray(oldRooms) ? oldRooms : []) {
      if (r && r.id) oldLast.set(r.id, clean(r.last_message_id));
    }
    for (const room of Array.isArray(newRooms) ? newRooms : []) {
      if (!room || !room.id || !Array.isArray(room.participants)) continue;
      const lastId = clean(room.last_message_id);
      if (!lastId || oldLast.get(room.id) === lastId) continue; // tidak ada pesan baru
      const sender = lower(room.last_message_sender);
      const unread = (Array.isArray(room.unread_by) ? room.unread_by : []).map(lower);
      const recipients = room.participants.map(lower).filter((u) => u && u !== sender && unread.includes(u));
      if (!recipients.length) continue;
      const senderLabel = clean(room.last_message_sender_name || room.last_message_sender) || 'Rekan Tim';
      messages.push({
        audience: { users: recipients },
        payload: {
          title: room.type === 'group' ? `💬 [${clean(room.name) || 'Grup Diskusi'}] ${senderLabel}` : `💬 Pesan dari ${senderLabel}`,
          body: clean(room.last_message_text) || 'Mengirim pesan baru',
          tag: `wms-chat-${room.id}`,
          page: 'live_chat',
          url: '/live-chat',
          roomId: room.id,
          roomName: clean(room.name) || senderLabel,
          roomType: room.type || 'direct',
          lastMessageId: lastId,
          chat: true,
        },
      });
    }
  } else if (table === 'lembur') {
    for (const r of body.records || []) {
      const id = clean(r.id);
      if (!id) continue;
      const empName = clean(r.nama || r.nik) || 'Karyawan';
      const tgl = clean(r.tanggal).slice(0, 10);
      const jam = `${clean(r.jam_mulai || '--:--').slice(0, 5)} - ${clean(r.jam_selesai || '--:--').slice(0, 5)}`;
      const alasan = clean(r.alasan_lembur) || '-';
      messages.push({
        audience: { users: ['warehouse', 'chocochips.warehouse2@gmail.com'] },
        payload: {
          title: `⚡ Pengajuan Lembur Baru — ${empName}`,
          body: `Tanggal: ${tgl} (${jam}) • Alasan: ${alasan}`,
          tag: `hr-lembur-${id}`,
          page: 'hr_approval',
          url: '/hr-approval',
        },
      });
    }
  } else if (table === 'perijinan_cuti') {
    for (const r of body.records || []) {
      const id = clean(r.id);
      if (!id) continue;
      const empName = clean(r.nama || r.nik) || 'Karyawan';
      const jenis = clean(r.jenis) || 'Ijin/Cuti';
      const tglMulai = clean(r.tanggal_mulai).slice(0, 10);
      const tglSelesai = clean(r.tanggal_selesai).slice(0, 10);
      const tglLabel = tglSelesai && tglSelesai !== tglMulai ? `${tglMulai} s/d ${tglSelesai}` : tglMulai;
      const ket = clean(r.keterangan) || '-';
      messages.push({
        audience: { users: ['warehouse', 'chocochips.warehouse2@gmail.com'] },
        payload: {
          title: `🌴 Pengajuan ${jenis} Baru — ${empName}`,
          body: `Tanggal: ${tglLabel} • Ket: ${ket}`,
          tag: `hr-cuti-${id}`,
          page: 'hr_approval',
          url: '/hr-approval',
        },
      });
    }
  } else if (table === 'izin_pulang_cepat') {
    for (const r of body.records || []) {
      const id = clean(r.id);
      if (!id) continue;
      const empName = clean(r.nama || r.nik) || 'Karyawan';
      const tgl = clean(r.tanggal).slice(0, 10);
      const jamPulang = clean(r.jam_pulang_awal || '--:--').slice(0, 5);
      const alasan = clean(r.alasan) || '-';
      messages.push({
        audience: { users: ['warehouse', 'chocochips.warehouse2@gmail.com'] },
        payload: {
          title: `🏃 Pengajuan Ijin Pulang Cepat — ${empName}`,
          body: `Tanggal: ${tgl} (Pulang Jam ${jamPulang}) • Ket: ${alasan}`,
          tag: `hr-ipa-${id}`,
          page: 'hr_approval',
          url: '/hr-approval',
        },
      });
    }
  }
  return messages;
}

function matches(sub, audience) {
  if (audience.users && audience.users.includes(lower(sub.username))) return true;
  if (audience.admin && sub.is_admin) return true;
  if (audience.picker && sub.is_picker) return true;
  return false;
}

function cleanEnv(v) {
  if (!v) return '';
  return String(v).trim().replace(/^["']|["']$/g, '');
}

export default async function handler(req, res) {
  try {
    const pubKey = cleanEnv(process.env.VAPID_PUBLIC_KEY);
    const privKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
    const subject = cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@example.com';
    const secret = cleanEnv(process.env.PUSH_WEBHOOK_SECRET);

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).json({ publicKey: pubKey });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (!secret || req.headers['x-push-secret'] !== secret) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { url, key } = supaConfig();
    if (!url || !key || !pubKey || !privKey) {
      return res.status(500).json({ error: 'server_not_configured' });
    }
    webpush.setVapidDetails(subject, pubKey, privKey);

    const body = typeof req.body === 'string' ? parseJsonish(req.body, {}) : req.body || {};
    const messages = buildMessages(body);
    if (!messages.length) return res.status(200).json({ sent: 0, skipped: true });

    const subRes = await fetch(
      `${url}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth,username,is_admin,is_picker`,
      { headers: supaHeaders(key) }
    );
    if (!subRes.ok) return res.status(502).json({ error: 'subscriptions_fetch_failed' });
    const subs = await subRes.json();

    let sent = 0;
    const dead = new Set();
    const jobs = [];
    for (const m of messages) {
      const data = JSON.stringify(m.payload);
      for (const s of subs) {
        if (!matches(s, m.audience)) continue;
        jobs.push(
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, {
              TTL: 60 * 60 * 24,
              urgency: 'high',
              topic: String(m.payload.tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
            })
            .then(() => {
              sent += 1;
            })
            .catch((err) => {
              if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.add(s.endpoint);
            })
        );
      }
    }
    await Promise.all(jobs);

    if (dead.size) {
      const list = Array.from(dead).map((e) => `"${e.replace(/"/g, '')}"`).join(',');
      await fetch(`${url}/rest/v1/push_subscriptions?endpoint=in.(${encodeURIComponent(list)})`, {
        method: 'DELETE',
        headers: supaHeaders(key),
      }).catch(() => {});
    }
    return res.status(200).json({ sent, removed: dead.size });
  } catch (err) {
    console.error('[PUSH ERROR]', err);
    return res.status(500).json({
      error: 'internal_push_error',
      message: String(err && err.message ? err.message : err),
    });
  }
}

