/**
 * Web Push (VAPID) client — membuat notifikasi tetap masuk walau aplikasi / browser ditutup.
 * Subscription disimpan di tabel Supabase `push_subscriptions`; pengiriman dilakukan
 * server (api/push.js) saat trigger database mendeteksi pesanan / retur / SPS / chat baru.
 */
import { supabaseFetch } from './supabase';

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
export async function subscribeToWebPush(identity: WebPushIdentity): Promise<boolean> {
  if (!isWebPushSupported() || Notification.permission !== 'granted' || !identity.username) return false;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);
    if (!reg) return false;

    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return false; // server push belum dikonfigurasi

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh || toB64Url(sub.getKey('p256dh'));
    const auth = json.keys?.auth || toB64Url(sub.getKey('auth'));
    if (!sub.endpoint || !p256dh || !auth) return false;

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
  } catch (e) {
    console.warn('Web Push subscribe gagal:', e);
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
    localStorage.removeItem(SUBSCRIBED_ENDPOINT_KEY);
  } catch {}
}
