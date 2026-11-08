import React from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Trash2, User, Phone, Mail, Lock, Eye, EyeOff, Save, Loader2, ShieldCheck, KeyRound, Check } from 'lucide-react';
import { UserSession } from '../types';
import { supabaseFetch, computeSha256 } from '../services/supabase';
import { getUserPersonName } from '../utils/userResolver';
import { getStoreContact, saveStoreContact, fetchOutlets } from '../services/gasManualShipment';

/* ============================================================
 * Avatar helpers (stored in localStorage + wms_users.permissions._avatar)
 * ============================================================ */
const AVATAR_KEY = (username: string) => `wms_user_avatar_${username.toLowerCase()}`;
export const AVATAR_EVENT = 'wms_avatar_updated';

export const PRESET_AVATARS: { id: string; emoji: string; bg: string }[] = [
  { id: 'p1', emoji: '🦊', bg: '#fde68a' },
  { id: 'p2', emoji: '🐼', bg: '#e2e8f0' },
  { id: 'p3', emoji: '🐯', bg: '#fed7aa' },
  { id: 'p4', emoji: '🐨', bg: '#cbd5e1' },
  { id: 'p5', emoji: '🦁', bg: '#fef08a' },
  { id: 'p6', emoji: '🐸', bg: '#bbf7d0' },
  { id: 'p7', emoji: '🐧', bg: '#bae6fd' },
  { id: 'p8', emoji: '🦄', bg: '#f5d0fe' },
  { id: 'p9', emoji: '🐻', bg: '#e7d3c1' },
  { id: 'p10', emoji: '🐱', bg: '#fecdd3' },
  { id: 'p11', emoji: '🚀', bg: '#c7d2fe' },
  { id: 'p12', emoji: '📦', bg: '#ddd6fe' },
];

export function getStoredAvatar(username?: string): string {
  if (!username) return '';
  try { return localStorage.getItem(AVATAR_KEY(username)) || ''; } catch { return ''; }
}

function storeAvatar(username: string, value: string) {
  try {
    if (value) localStorage.setItem(AVATAR_KEY(username), value);
    else localStorage.removeItem(AVATAR_KEY(username));
  } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { username, value } }));
}

/** Sync avatar from DB once (cross-device). */
export async function syncAvatarFromDb(username: string): Promise<void> {
  try {
    const rows = await supabaseFetch<any[]>('wms_users', 'GET', null, `username=eq.${encodeURIComponent(username)}&select=permissions&limit=1`);
    const av = rows?.[0]?.permissions?._avatar || '';
    if (av !== getStoredAvatar(username)) storeAvatar(username, av);
  } catch { /* offline */ }
}

/** Renders avatar: data-URL photo, preset emoji (preset:pX) or initials fallback. */
export const UserAvatar: React.FC<{ username?: string; name?: string; value?: string; className?: string; textClass?: string }> = ({
  username, name, value, className = 'w-8 h-8 rounded-lg', textClass = 'text-xs',
}) => {
  const [stored, setStored] = React.useState(() => getStoredAvatar(username));
  React.useEffect(() => {
    setStored(getStoredAvatar(username));
    const h = (e: any) => { if (e.detail?.username?.toLowerCase() === username?.toLowerCase()) setStored(e.detail.value || ''); };
    window.addEventListener(AVATAR_EVENT, h);
    return () => window.removeEventListener(AVATAR_EVENT, h);
  }, [username]);
  const av = value !== undefined ? value : stored;
  if (av.startsWith('data:image')) {
    return <img src={av} alt="avatar" className={`${className} object-cover shrink-0 border border-slate-200 dark:border-slate-700`} />;
  }
  if (av.startsWith('preset:')) {
    const p = PRESET_AVATARS.find((x) => x.id === av.slice(7));
    if (p) return <div className={`${className} shrink-0 flex items-center justify-center`} style={{ background: p.bg }}><span className={textClass === 'text-xs' ? 'text-base' : 'text-4xl'}>{p.emoji}</span></div>;
  }
  const initials = (name || username || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${className} shrink-0 bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-extrabold ${textClass}`}>
      {initials}
    </div>
  );
};

/** Resize & compress an image file to a square JPEG data URL (~256px). */
function compressImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
 * Modal
 * ============================================================ */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
  onSessionUpdate?: (patch: Partial<UserSession>) => void;
  onLogout?: () => void;
}

type Tab = 'profil' | 'password';

const inputCls =
  'w-full h-9 pl-9 pr-3 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 disabled:opacity-60';

export const UserProfileModal: React.FC<Props> = ({ isOpen, onClose, session, onSessionUpdate, onLogout }) => {
  const [tab, setTab] = React.useState<Tab>('profil');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const [rowPerms, setRowPerms] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const [oldPass, setOldPass] = React.useState('');
  const [newPass, setNewPass] = React.useState('');
  const [confirmPass, setConfirmPass] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [logoutCountdown, setLogoutCountdown] = React.useState<number | null>(null);

  // Auto-logout after successful password change (forces re-login with new password)
  React.useEffect(() => {
    if (logoutCountdown === null) return;
    if (logoutCountdown <= 0) {
      setLogoutCountdown(null);
      onClose();
      onLogout?.();
      return;
    }
    const t = setTimeout(() => setLogoutCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [logoutCountdown, onClose, onLogout]);

  const displayName = session.name || getUserPersonName(session.username) || session.username;
  const storeName = session.role === 'Store' ? session.store_name || '' : '';

  React.useEffect(() => {
    if (!isOpen) return;
    setTab('profil'); setMsg(null);
    setOldPass(''); setNewPass(''); setConfirmPass('');
    setName(displayName);
    setPhone(session.no_hp || '');
    setEmail(session.email || '');
    setAvatar(getStoredAvatar(session.username));
    setLoading(true);
    Promise.all([
      supabaseFetch<any[]>('wms_users', 'GET', null, `username=eq.${encodeURIComponent(session.username)}&limit=1`),
      storeName ? fetchOutlets().catch(() => []) : Promise.resolve([]),
    ])
      .then(([rows]) => {
        const u = rows?.[0];
        // Akun Store: No. HP & email resmi diambil dari Master Kontak Store (Pengaturan → Kontak Store)
        const sc = storeName ? getStoreContact(storeName) : null;
        const p = ((u && u.permissions) || {}) as Record<string, any>;
        setRowPerms(p);
        if (u?.name) setName(u.name);
        setPhone(u?.no_hp || u?.phone || p.no_hp || p.phone || session.no_hp || sc?.no_wa || '');
        setEmail(u?.email || p.email || session.email || sc?.email_store || '');
        if (p._avatar !== undefined) setAvatar(p._avatar || '');
      })
      .catch(() => { /* offline: keep session values */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session.username]);

  React.useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setMsg({ ok: false, text: 'Ukuran foto maksimal 8 MB.' }); return; }
    try { setAvatar(await compressImage(f)); setMsg(null); }
    catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  /** PATCH wms_users and verify at least 1 row was actually updated in Supabase. */
  const patchRow = async (payload: Record<string, any>) => {
    const q = `username=eq.${encodeURIComponent(session.username)}`;
    const res = await supabaseFetch<any[]>('wms_users', 'PATCH', payload, q, true);
    if (Array.isArray(res) && res.length === 0) {
      throw new Error('Akun tidak ditemukan di database Supabase (wms_users). Hubungi Superadmin.');
    }
  };

  const patchUser = async (payload: Record<string, any>, fallback: Record<string, any>) => {
    try {
      await patchRow(payload);
    } catch (err: any) {
      if (String(err?.message || '').includes('tidak ditemukan')) throw err;
      // Older schema without no_hp/email columns → store in permissions JSON only
      await patchRow(fallback);
    }
  };

  const saveProfile = async () => {
    const cleanName = name.trim();
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const cleanEmail = email.trim();
    if (!cleanName) { setMsg({ ok: false, text: 'Nama tidak boleh kosong.' }); return; }
    if (cleanPhone && !/^(\+?62|0)8\d{7,12}$/.test(cleanPhone)) { setMsg({ ok: false, text: 'Format No. HP tidak valid (contoh: 08123456789).' }); return; }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setMsg({ ok: false, text: 'Format email tidak valid.' }); return; }
    setSaving(true); setMsg(null);
    const perms = { ...rowPerms, no_hp: cleanPhone, phone: cleanPhone, email: cleanEmail, _avatar: avatar };
    try {
      await patchUser(
        { name: cleanName, no_hp: cleanPhone, email: cleanEmail, permissions: perms, updated_at: new Date().toISOString() },
        { name: cleanName, permissions: perms }
      );
      setRowPerms(perms);
      storeAvatar(session.username, avatar);
      // Akun Store: sinkronkan juga ke Master Kontak Store agar konsisten di Pengaturan & dokumen pengiriman
      if (storeName) {
        try {
          const sc = getStoreContact(storeName);
          saveStoreContact(storeName, cleanPhone, sc?.alamat_store, cleanEmail, sc?.pic_default, sc?.kode);
        } catch (e) { console.warn('Sync kontak store gagal:', e); }
      }
      localStorage.setItem('wms_session_name', cleanName);
      onSessionUpdate?.({ name: cleanName, no_hp: cleanPhone || undefined, email: cleanEmail || undefined });
      setMsg({ ok: true, text: 'Profil berhasil disimpan.' });
    } catch (err: any) {
      setMsg({ ok: false, text: `Gagal menyimpan: ${err?.message || 'koneksi bermasalah'}` });
    } finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (!oldPass) { setMsg({ ok: false, text: 'Masukkan password lama.' }); return; }
    if (newPass.length < 6) { setMsg({ ok: false, text: 'Password baru minimal 6 karakter.' }); return; }
    if (newPass !== confirmPass) { setMsg({ ok: false, text: 'Konfirmasi password tidak sama.' }); return; }
    if (newPass === oldPass) { setMsg({ ok: false, text: 'Password baru harus berbeda dari password lama.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const rows = await supabaseFetch<any[]>('wms_users', 'GET', null, `username=eq.${encodeURIComponent(session.username)}&select=password&limit=1`);
      const stored = rows?.[0]?.password || '';
      const oldHash = await computeSha256(oldPass);
      const valid = stored ? stored === oldPass || stored === oldHash : oldPass === '123456';
      if (!valid) { setMsg({ ok: false, text: 'Password lama salah.' }); return; }
      const newHash = await computeSha256(newPass);
      await patchRow({ password: newHash, updated_at: new Date().toISOString() });
      setOldPass(''); setNewPass(''); setConfirmPass('');
      setMsg({ ok: true, text: 'Password berhasil diganti & tersimpan di Supabase. Anda akan logout otomatis dalam 3 detik, silakan login ulang dengan password baru.' });
      setLogoutCountdown(3);
    } catch (err: any) {
      setMsg({ ok: false, text: `Gagal mengganti password: ${err?.message || 'koneksi bermasalah'}` });
    } finally { setSaving(false); }
  };

  const strength = newPass.length === 0 ? 0 : [/.{8,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(newPass)).length + (newPass.length >= 6 ? 1 : 0);
  const strengthLabel = ['', 'Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat'][strength];
  const strengthColor = ['bg-slate-200', 'bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'][strength];

  const PassInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative">
      <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type={showPass ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="new-password" className={`${inputCls} pr-9`} />
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-[#0f1523] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent border-b border-slate-200 dark:border-slate-800">
          <button type="button" onClick={onClose} title="Tutup" className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <UserAvatar username={session.username} name={name || displayName} value={avatar} className="w-16 h-16 rounded-2xl" textClass="text-xl" />
              <button type="button" onClick={() => { setTab('profil'); fileRef.current?.click(); }} title="Ganti foto" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#0f1523] cursor-pointer hover:bg-primary-700">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">{name || displayName}</h2>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">@{session.username}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary-500/10 text-primary-600 dark:text-primary-400"><ShieldCheck className="w-3 h-3" />{session.role}</span>
                {session.nik && <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{session.nik}</span>}
                {session.store_name && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{session.store_name}</span>}
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="mt-3 flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60">
            {([['profil', 'Data Profil', User], ['password', 'Ganti Password', KeyRound]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => { setTab(id); setMsg(null); }} className={`flex-1 h-8 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${tab === id ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {tab === 'profil' ? (
            <>
              {loading && <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin" />Memuat data terbaru...</div>}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Foto / Avatar</label>
                <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                  {PRESET_AVATARS.map((p) => {
                    const val = `preset:${p.id}`;
                    return (
                      <button key={p.id} type="button" onClick={() => setAvatar(val)} className={`aspect-square rounded-lg flex items-center justify-center text-lg cursor-pointer transition-transform hover:scale-105 ${avatar === val ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-[#0f1523]' : ''}`} style={{ background: p.bg }}>
                        {p.emoji}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />Upload Foto
                  </button>
                  {avatar && (
                    <button type="button" onClick={() => setAvatar('')} className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />Hapus
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Nama Lengkap</label>
                <div className="relative mt-1"><User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Nama lengkap" /></div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">No. HP / WhatsApp</label>
                <div className="relative mt-1"><Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={`${inputCls} font-mono`} placeholder="08123456789" /></div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Email</label>
                <div className="relative mt-1"><Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} placeholder="nama@email.com" /></div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Username</label>
                <div className="relative mt-1"><ShieldCheck className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={session.username} disabled className={`${inputCls} font-mono`} /></div>
                <p className="mt-1 text-[10px] text-slate-400">Username & role hanya bisa diubah oleh Superadmin.</p>
              </div>
            </>
          ) : (
            <>
              <div><label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Password Lama</label><div className="mt-1">{PassInput({ value: oldPass, onChange: setOldPass, placeholder: 'Password saat ini' })}</div></div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Password Baru</label>
                <div className="mt-1">{PassInput({ value: newPass, onChange: setNewPass, placeholder: 'Minimal 6 karakter' })}</div>
                {newPass && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 flex gap-1">{[1, 2, 3, 4, 5].map((i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength ? strengthColor : 'bg-slate-200 dark:bg-slate-700'}`} />)}</div>
                    <span className="text-[10px] font-bold text-slate-500">{strengthLabel}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Konfirmasi Password Baru</label>
                <div className="mt-1">{PassInput({ value: confirmPass, onChange: setConfirmPass, placeholder: 'Ulangi password baru' })}</div>
                {confirmPass && newPass === confirmPass && <p className="mt-1 text-[10px] font-bold text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" />Password cocok</p>}
              </div>
              <button type="button" onClick={() => setShowPass((s) => !s)} className="text-[11px] font-bold text-slate-500 hover:text-primary-600 flex items-center gap-1.5 cursor-pointer">
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{showPass ? 'Sembunyikan' : 'Tampilkan'} password
              </button>
            </>
          )}
          {msg && (
            <div className={`text-[11px] font-semibold px-3 py-2 rounded-lg border ${msg.ok ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400'}`}>
              {msg.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-slate-50/60 dark:bg-slate-900/40">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Tutup</button>
          <button type="button" disabled={saving || loading || logoutCountdown !== null} onClick={tab === 'profil' ? saveProfile : savePassword} className="flex-1 h-9 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tab === 'profil' ? <Save className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
            {tab === 'profil' ? 'Simpan Profil' : 'Ganti Password'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

