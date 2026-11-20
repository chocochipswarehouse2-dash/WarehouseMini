/**
 * Web Push (VAPID) client — membuat notifikasi tetap masuk walau aplikasi / browser ditutup.
 * Subscription disimpan di tabel Supabase `push_subscriptions`; pengiriman dilakukan
 * server (api/push.js) saat trigger database mendeteksi pesanan / retur / SPS / chat baru.
 */
import { supabaseFetch } from './supabase';
import { isDeviceNotificationEnabled } from './pushNotification';

const SUBSCRIBED_ENDPOINT_KEY = 'wms_push_endpoint_v1';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function fetchVapidPublicKey(): Promise<string> {
  const envKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (envKey) return envKey;
  try {
    const res = await fetch('/api/push', { cache: 'no-store' });
    if (!res.ok) return '';
    const json = await res.json();
    return String(json?.publicKey || '');
  } catch {
    return '';
  }
}

export interface WebPushIdentity {
  username: string;
  isAdmin: boolean;
  isPicker: boolean;
  storeName?: string;
}

/**
 * Daftarkan perangkat ini ke Web Push (idempoten). Aman dipanggil berulang kali.
 * Mengembalikan true bila perangkat terdaftar di server.
 */
let lastWebPushError = '';

/** Alasan kegagalan pendaftaran Web Push terakhir (untuk ditampilkan ke pengguna). */
export function getLastWebPushError(): string {
  return lastWebPushError;
}

function sameApplicationServerKey(sub: PushSubscription, publicKey: string): boolean {
  try {
    const current = sub.options?.applicationServerKey;
    if (!current) return true; // tidak bisa diverifikasi → anggap cocok
    const a = new Uint8Array(current as ArrayBuffer);
    const b = urlBase64ToUint8Array(publicKey);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  } catch {
    return true;
  }
}

async function waitForServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 15000)),
  ]);
  if (ready) return ready;
  return (await navigator.serviceWorker.getRegistration().catch(() => null)) || null;
}

export async function subscribeToWebPush(identity: WebPushIdentity): Promise<boolean> {
  lastWebPushError = '';
  if (!isWebPushSupported()) {
    lastWebPushError = 'Browser ini tidak mendukung Web Push.';
    return false;
  }
  if (!isDeviceNotificationEnabled() || Notification.permission !== 'granted' || !identity.username) {
    return false;
  }
  try {
    const reg = await waitForServiceWorkerRegistration();
    if (!reg) {
      lastWebPushError = 'Service Worker belum aktif. Tutup lalu buka ulang aplikasi.';
      return false;
    }

    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) {
      lastWebPushError = 'Server push belum dikonfigurasi (VAPID key tidak ditemukan).';
      return false;
    }

    const subscribeFresh = () =>
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });

    let sub = await reg.pushManager.getSubscription();
    // Subscription lama dengan kunci VAPID berbeda tidak akan pernah menerima push → buang & buat ulang
    if (sub && !sameApplicationServerKey(sub, publicKey)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      try {
        sub = await subscribeFresh();
      } catch {
        // Subscription rusak/kedaluwarsa di browser → bersihkan lalu coba sekali lagi
        const stale = await reg.pushManager.getSubscription().catch(() => null);
        if (stale) await stale.unsubscribe().catch(() => {});
        sub = await subscribeFresh();
      }
    }
    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh || toB64Url(sub.getKey('p256dh'));
    const auth = json.keys?.auth || toB64Url(sub.getKey('auth'));
    if (!sub.endpoint || !p256dh || !auth) {
      lastWebPushError = 'Data langganan push tidak lengkap dari browser.';
      return false;
    }

    await supabaseFetch(
      'push_subscriptions',
      'POST',
      {
        endpoint: sub.endpoint,
        p256dh,
        auth,
        username: identity.username.trim().toLowerCase(),
        is_admin: identity.isAdmin,
        is_picker: identity.isPicker,
        store_name: identity.storeName || null,
        user_agent: navigator.userAgent.slice(0, 200),
        updated_at: new Date().toISOString(),
      },
      'on_conflict=endpoint'
    );
    try {
      localStorage.setItem(SUBSCRIBED_ENDPOINT_KEY, sub.endpoint);
    } catch {}
    return true;
  } catch (e: any) {
    console.warn('Web Push subscribe gagal:', e);
    lastWebPushError = String(e?.message || e || 'Pendaftaran push gagal').slice(0, 160);
    return false;
  }
}

/** Hapus pendaftaran perangkat ini (dipanggil saat logout agar notifikasi akun lama berhenti). */
export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;
  try {
    let endpoint = '';
    try {
      endpoint = localStorage.getItem(SUBSCRIBED_ENDPOINT_KEY) || '';
    } catch {}
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    endpoint = endpoint || sub?.endpoint || '';
    if (endpoint) {
      await supabaseFetch('push_subscriptions', 'DELETE', undefined, `endpoint=eq.${encodeURIComponent(endpoint)}`).catch(
        () => {}
      );
    }
    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }
    localStorage.removeItem(SUBSCRIBED_ENDPOINT_KEY);
  } catch {}
}

