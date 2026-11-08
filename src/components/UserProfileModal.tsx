import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, Camera, Trash2, User, Phone, Mail, Lock, Eye, EyeOff, Save, Loader2,
  ShieldCheck, KeyRound, Check, Award, Calendar, MapPin, HeartPulse,
  Briefcase, Clock, AlertTriangle, CheckCircle2, Sparkles, Building2
} from 'lucide-react';
import { UserSession, KaryawanRecord, KpiAbsensiSummary } from '../types';
import {
  supabaseFetch, computeSha256, fetchKaryawanDirectory, fetchPresensiRange,
  fetchRosterShiftList, fetchLemburRecords, fetchCutiRecords, fetchIzinPulangAwalList
} from '../services/supabase';
import { getUserPersonName, getUserNik } from '../utils/userResolver';
import { calculateKpiAbsensi } from '../utils/kpiCalculator';
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

function formatTanggalIndo(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcMasaKerja(tglBergabung?: string): string {
  if (!tglBergabung) return '';
  const start = new Date(tglBergabung);
  if (isNaN(start.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';
  if (years === 0 && months === 0) return 'Baru bergabung';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} thn`);
  if (months > 0) parts.push(`${months} bln`);
  return parts.join(' ');
}

function getMonthRange(ym: string): { startDate: string; endDate: string; label: string } {
  const [yStr, mStr] = ym.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10); // 1-12
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  let endDate: string;
  if (year === curY && month === curM) {
    endDate = `${curY}-${String(curM).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  const monthName = new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  return { startDate, endDate, label: monthName };
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

type Tab = 'profil' | 'performa' | 'password';

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

  // Employee profile & KPI state
  const [effectiveNik, setEffectiveNik] = React.useState<string>(session.nik || '');
  const [karyawanData, setKaryawanData] = React.useState<KaryawanRecord | null>(null);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [kpiLoading, setKpiLoading] = React.useState(false);
  const [kpiSummary, setKpiSummary] = React.useState<KpiAbsensiSummary | null>(null);

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
      fetchKaryawanDirectory().catch(() => [] as KaryawanRecord[]),
      storeName ? fetchOutlets().catch(() => []) : Promise.resolve([]),
    ])
      .then(([rows, karyawanList]) => {
        const u = rows?.[0];
        const sc = storeName ? getStoreContact(storeName) : null;
        const p = ((u && u.permissions) || {}) as Record<string, any>;
        setRowPerms(p);

        // Resolve NIK & KaryawanRecord
        const unameLower = (session.username || '').trim().toLowerCase();
        const candidateNik = (u?.nik || p.nik || session.nik || (unameLower !== 'warehouse' ? getUserNik(session.username) : '') || '').trim();
        const matched = (karyawanList || []).find(
          (k) =>
            (candidateNik && k.nik.toLowerCase() === candidateNik.toLowerCase()) ||
            (k.username && k.username.toLowerCase() === unameLower) ||
            k.nik.toLowerCase() === unameLower
        ) || null;

        const finalNik = matched?.nik || candidateNik || '';
        setEffectiveNik(finalNik);
        setKaryawanData(matched);

        const resolvedName = matched?.nama || u?.name || displayName;
        const resolvedPhone = matched?.no_hp || u?.no_hp || u?.phone || p.no_hp || p.phone || session.no_hp || sc?.no_wa || '';
        const resolvedEmail = matched?.email || u?.email || p.email || session.email || sc?.email_store || '';

        setName(resolvedName);
        setPhone(resolvedPhone);
        setEmail(resolvedEmail);
        if (p._avatar !== undefined) setAvatar(p._avatar || '');

        if (finalNik && session.nik !== finalNik) {
          onSessionUpdate?.({ nik: finalNik, name: resolvedName });
        }
      })
      .catch(() => { /* offline: keep session values */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session.username]);

  // Load KPI Absensi whenever user has effectiveNik and opens modal / changes selectedMonth
  React.useEffect(() => {
    if (!isOpen || !effectiveNik) {
      setKpiSummary(null);
      return;
    }
    let cancelled = false;
    const { startDate, endDate } = getMonthRange(selectedMonth);
    setKpiLoading(true);
    Promise.all([
      fetchPresensiRange(startDate, endDate, effectiveNik).catch(() => []),
      fetchRosterShiftList(effectiveNik, startDate, endDate).catch(() => []),
      fetchLemburRecords(effectiveNik, startDate, endDate).catch(() => []),
      fetchCutiRecords(effectiveNik, startDate, endDate).catch(() => []),
      fetchIzinPulangAwalList(effectiveNik, undefined, startDate, endDate).catch(() => []),
    ])
      .then(([presensiList, rosterList, lemburList, cutiList, izinPulangAwalList]) => {
        if (cancelled) return;
        const summary = calculateKpiAbsensi({
          karyawan: karyawanData || {
            nik: effectiveNik,
            nama: name || displayName,
            divisi: session.role,
          },
          startDate,
          endDate,
          presensiList,
          rosterList,
          lemburList,
          cutiList,
          izinPulangAwalList,
        });
        setKpiSummary(summary);
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, effectiveNik, selectedMonth, karyawanData?.nama, karyawanData?.divisi, name, displayName, session.role]);

  React.useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasEmployeeNik = Boolean(effectiveNik);

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
      await patchRow(fallback);
    }
  };

  const saveProfile = async () => {
    // Jika user memiliki NIK Karyawan, data profil dikunci sesuai Master HR; hanya Foto/Avatar yang dapat diubah oleh user
    if (hasEmployeeNik) {
      setSaving(true); setMsg(null);
      const perms = { ...rowPerms, _avatar: avatar };
      try {
        await patchRow({ permissions: perms, updated_at: new Date().toISOString() });
        setRowPerms(perms);
        storeAvatar(session.username, avatar);
        setMsg({ ok: true, text: 'Foto profil berhasil disimpan.' });
      } catch (err: any) {
        setMsg({ ok: false, text: `Gagal menyimpan foto profil: ${err?.message || 'koneksi bermasalah'}` });
      } finally {
        setSaving(false);
      }
      return;
    }

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

  const now = new Date();
  const thisMonthYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const masaKerja = calcMasaKerja(karyawanData?.tgl_bergabung);

  const gradeBadgeStyle = (grade?: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'B':
        return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
      case 'C':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      default:
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-[#0f1523] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent border-b border-slate-200 dark:border-slate-800">
          <button type="button" onClick={onClose} title="Tutup" className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="relative">
              <UserAvatar username={session.username} name={karyawanData?.nama || name || displayName} value={avatar} className="w-16 h-16 rounded-2xl" textClass="text-xl" />
              <button type="button" onClick={() => { setTab('profil'); fileRef.current?.click(); }} title="Ganti foto" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#0f1523] cursor-pointer hover:bg-primary-700">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">
                  {karyawanData?.nama || name || displayName}
                </h2>
                {hasEmployeeNik && kpiSummary && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${gradeBadgeStyle(kpiSummary.grade)}`}>
                    <Award className="w-3 h-3" />
                    KPI {kpiSummary.nilaiKpiAbsensi} ({kpiSummary.grade})
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">@{session.username}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <ShieldCheck className="w-3 h-3" />{session.role}
                </span>
                {effectiveNik && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                    NIK: {effectiveNik}
                  </span>
                )}
                {karyawanData?.divisi && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {karyawanData.divisi}
                  </span>
                )}
                {session.store_name && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {session.store_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 overflow-x-auto no-scrollbar">
            {(hasEmployeeNik
              ? ([
                  ['profil', 'Profil Karyawan', User],
                  ['performa', 'Performa & KPI', Award],
                  ['password', 'Ganti Password', KeyRound],
                ] as const)
              : ([
                  ['profil', 'Data Profil', User],
                  ['password', 'Ganti Password', KeyRound],
                ] as const)
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTab(id); setMsg(null); }}
                className={`flex-1 min-w-[105px] h-8 px-2 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  tab === id
                    ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          {tab === 'profil' && (
            <>
              {loading && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />Memuat data profil terbaru...
                </div>
              )}

              {/* Avatar / Foto Section (tetap bisa diubah oleh semua user) */}
              <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Foto / Avatar Profil</label>
                <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                  {PRESET_AVATARS.map((p) => {
                    const val = `preset:${p.id}`;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setAvatar(val)}
                        className={`aspect-square rounded-lg flex items-center justify-center text-lg cursor-pointer transition-transform hover:scale-105 ${
                          avatar === val ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-[#0f1523]' : ''
                        }`}
                        style={{ background: p.bg }}
                      >
                        {p.emoji}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />Upload Foto
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => setAvatar('')}
                      className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Hapus
                    </button>
                  )}
                </div>
              </div>

              {hasEmployeeNik ? (
                /* ============================================================
                 * LOCKED EMPLOYEE PROFILE (User dengan NIK Karyawan)
                 * ============================================================ */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/50 flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                      <span className="font-extrabold">Data Profil Karyawan Terkunci (Master HR)</span> — Data kepegawaian di bawah ini terhubung langsung dengan NIK Karyawan dan tidak dapat diedit secara bebas. Hubungi HR / Superadmin jika terdapat perubahan data diri.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />NIK Karyawan</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                        {effectiveNik}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />Divisi & Role</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {karyawanData?.divisi || session.role}
                        <span className="ml-1.5 text-[10px] font-semibold text-slate-500">({session.role})</span>
                      </div>
                    </div>

                    <div className="sm:col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />Nama Lengkap Karyawan</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                        {karyawanData?.nama || name || displayName}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Tgl Bergabung</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                        {formatTanggalIndo(karyawanData?.tgl_bergabung)}
                        {masaKerja && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                            {masaKerja}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Tanggal Lahir</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                        {formatTanggalIndo(karyawanData?.tgl_lahir)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />No. HP / WhatsApp</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold font-mono text-slate-800 dark:text-slate-100">
                        {karyawanData?.no_hp || phone || '-'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />Email</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {karyawanData?.email || email || '-'}
                      </div>
                    </div>

                    <div className="sm:col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><HeartPulse className="w-3 h-3" />Kontak Darurat</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-bold font-mono text-slate-800 dark:text-slate-100">
                        {karyawanData?.kontak_darurat || '-'}
                      </div>
                    </div>

                    <div className="sm:col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />Alamat Domisili</span>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
                        {karyawanData?.alamat || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ============================================================
                 * EDITABLE PROFILE (Akun Store / Non-NIK)
                 * ============================================================ */
                <>
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
              )}
            </>
          )}

          {tab === 'performa' && hasEmployeeNik && (
            <div className="space-y-3">
              {/* Filter Periode Bulan */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Periode Penilaian</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(thisMonthYm)}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      selectedMonth === thisMonthYm
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMonth(lastMonthYm)}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      selectedMonth === lastMonthYm
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Bulan Lalu
                  </button>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                    className="h-7 px-2 rounded-lg text-[11px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              {kpiLoading ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                  <span>Menghitung performa absensi & kedisiplinan...</span>
                </div>
              ) : kpiSummary ? (
                <>
                  {/* Hero Score Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">
                          Total Nilai Performa User ({getMonthRange(selectedMonth).label})
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-3xl font-black font-mono">{kpiSummary.nilaiKpiAbsensi}</span>
                          <span className="text-xs font-bold text-indigo-200">/ 100 Poin</span>
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/15 text-[11px] font-bold">
                          <Award className="w-3.5 h-3.5 text-amber-300" />
                          <span>Predikat: {kpiSummary.labelStatus}</span>
                        </div>
                      </div>
                      <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold uppercase text-indigo-100">Grade</span>
                        <span className="text-xl font-black font-mono leading-none mt-0.5">{kpiSummary.grade}</span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-black/25 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-white transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, kpiSummary.nilaiKpiAbsensi))}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-indigo-100">
                        <span>Periode: {getMonthRange(selectedMonth).startDate} s/d {getMonthRange(selectedMonth).endDate}</span>
                        <span className="font-mono font-bold">Bobot Aktif: 100% Absensi</span>
                      </div>
                    </div>
                  </div>

                  {/* Rincian Indikator Absensi */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Kehadiran (20%)</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <div className="mt-1 text-base font-extrabold font-mono text-slate-800 dark:text-slate-100">
                        {kpiSummary.persenKehadiran}%
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Hadir <span className="font-bold font-mono text-slate-700 dark:text-slate-200">{kpiSummary.totalHadir}</span> / {kpiSummary.totalHariKerja} hari kerja
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Jam Berangkat (45%)</span>
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      </div>
                      <div className="mt-1 text-base font-extrabold font-mono text-slate-800 dark:text-slate-100">
                        {kpiSummary.skorBerangkat} <span className="text-[11px] font-normal text-slate-400">/ 100</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        On-Time <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{kpiSummary.totalOnTime}x</span> · Telat <span className="font-bold font-mono text-rose-600 dark:text-rose-400">{kpiSummary.totalTerlambat}x</span> ({kpiSummary.totalMenitTerlambat}m)
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Jam Pulang (35%)</span>
                        <Clock className="w-3.5 h-3.5 text-violet-500" />
                      </div>
                      <div className="mt-1 text-base font-extrabold font-mono text-slate-800 dark:text-slate-100">
                        {kpiSummary.skorPulang} <span className="text-[11px] font-normal text-slate-400">/ 100</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Normal <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{kpiSummary.totalPulangNormal}x</span> · Izin Awal <span className="font-bold font-mono">{kpiSummary.totalPulangAwalIzin}x</span> · Tanpa Izin <span className="font-bold font-mono text-rose-600">{kpiSummary.totalPulangAwalTanpaIzin}x</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Bolos, Cuti & Lembur</span>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs font-extrabold font-mono">
                        <span className={kpiSummary.totalAlpha > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}>
                          Bolos: {kpiSummary.totalAlpha} hr
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-indigo-600 dark:text-indigo-400">
                          Cuti/Izin: {kpiSummary.totalCutiIzin} hr
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Lembur Disetujui: <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{kpiSummary.totalLemburJam} jam</span> (+{Math.min(5, Math.round(kpiSummary.totalLemburJam * 0.5 * 10) / 10)} poin)
                      </div>
                    </div>
                  </div>

                  {/* Komponen Penilaian Performa (Saat Ini + Roadmap KPI Pekerjaan) */}
                  <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                        Komponen Penilaian Performa User
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary-500/10 text-primary-600 dark:text-primary-400">
                        Modular KPI
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span>1. KPI Absensi & Kedisiplinan</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              Aktif (100%)
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Dihitung otomatis dari kehadiran, ketepatan jam datang, disiplin jam pulang, & lembur.
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {kpiSummary.nilaiKpiAbsensi} Pts
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                            <span>2. KPI Pekerjaan & Produktivitas</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              Segera Hadir
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            Komponen nilai performa dari target pekerjaan operasional akan ditambahkan pada pengembangan berikutnya.
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-mono font-bold text-slate-400">—</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Belum ada data absensi untuk periode ini.
                </div>
              )}
            </div>
          )}

          {tab === 'password' && (
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
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
            Tutup
          </button>
          {tab !== 'performa' && (
            <button
              type="button"
              disabled={saving || loading || logoutCountdown !== null}
              onClick={tab === 'profil' ? saveProfile : savePassword}
              className="flex-1 h-9 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : tab === 'profil' ? (
                <Save className="w-3.5 h-3.5" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              {tab === 'profil'
                ? hasEmployeeNik
                  ? 'Simpan Foto Profil'
                  : 'Simpan Profil'
                : 'Ganti Password'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
