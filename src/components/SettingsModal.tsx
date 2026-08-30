import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Database,
  Cloud,
  Users,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Radio,
  Plus,
  Trash2,
  Edit2,
  Key,
  Shield,
  RefreshCw,
  Volume2,
  Vibrate,
  Smartphone,
  Bell,
  Sun,
  Moon,
  Copy,
  Check,
  Lock,
  ShieldCheck,
  UserCheck,
  CheckSquare,
  Square,
  HelpCircle,
  Layers,
  ScanBarcode,
  Package,
  FileText,
  SlidersHorizontal,
  Rocket,
  Github,
  Globe,
  Terminal,
  Download,
  ExternalLink,
  Laptop,
  Workflow,
  ArrowRight,
  Sparkles,
  Code2,
  FileCode,
  CheckCheck,
} from 'lucide-react';
import { UserSession, UserRole, UserPermissions, UserPermissionKey, LocalUserRecord } from '../types';
import {
  DEFAULT_GAS_ENDPOINT,
  getLocalUsers,
  saveLocalUsersList,
  apiCall,
} from '../services/gasApi';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  getSupabaseClient,
  saveWmsUserToSupabase,
  deleteWmsUserFromSupabase,
} from '../services/supabase';
import {
  hasPermission,
  isSuperadmin,
  ROLE_DETAILS,
  ROLE_DEFAULT_PERMISSIONS,
  PERMISSION_GROUPS,
  countGrantedPermissions,
  TOTAL_PERMISSIONS_COUNT,
} from '../services/permissions';
import {
  playSuccessBeep,
  playErrorBeep,
  playCategoryBeep,
  vibrateDevice,
} from '../services/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onUpdateSession: (newSession: UserSession) => void;
  onRefreshCatalog: (endpoint: string, token: string) => Promise<void>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  isRealtimeConnected: boolean;
  onNotify: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type SettingsTab = 'supabase' | 'gas' | 'users' | 'device' | 'deploy_apk';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  session,
  onUpdateSession,
  onRefreshCatalog,
  darkMode,
  onToggleDarkMode,
  notificationPermission,
  onRequestNotification,
  isRealtimeConnected,
  onNotify,
}) => {
  const userIsSuperadmin = isSuperadmin(session);
  const canManageUsers = hasPermission(session, 'can_manage_users');
  const canManageSettings = hasPermission(session, 'can_manage_settings');

  // Default tab based on permissions
  const [activeTab, setActiveTab] = useState<SettingsTab>('supabase');

  // Supabase Config State
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseKey, setSupabaseKey] = useState<string>('');
  const [isTestingDatabase, setIsTestingDatabase] = useState<boolean>(false);
  const [databaseStatus, setDatabaseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [databaseStatusMsg, setDatabaseStatusMsg] = useState<string>('');

  // GAS Config State
  const [gasEndpoint, setGasEndpoint] = useState<string>('');
  const [isTestingGas, setIsTestingGas] = useState<boolean>(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState<boolean>(false);
  const [gasStatus, setGasStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [gasStatusMsg, setGasStatusMsg] = useState<string>('');

  // Users Management State
  const [userList, setUserList] = useState<LocalUserRecord[]>([]);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('Operator');
  const [newPermissions, setNewPermissions] = useState<UserPermissions>({
    ...ROLE_DEFAULT_PERMISSIONS['Operator'],
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isPermissionFormOpen, setIsPermissionFormOpen] = useState<boolean>(false);

  // Copied helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Initialize values when modal opens
  useEffect(() => {
    if (isOpen) {
      const storedSupabase = getStoredSupabaseConfig();
      setSupabaseUrl(storedSupabase.url);
      setSupabaseKey(storedSupabase.key);

      const storedGas =
        session?.endpointUrl ||
        localStorage.getItem('wms_endpoint_url') ||
        DEFAULT_GAS_ENDPOINT;
      setGasEndpoint(storedGas);

      const loadedUsers = getLocalUsers();
      setUserList(loadedUsers);
      setDatabaseStatus('idle');
      setGasStatus('idle');
    }
  }, [isOpen, session]);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    onNotify(`Berhasil menyalin ${label}`, 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // --- SUPABASE ACTIONS ---
  const handleSaveDatabase = () => {
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();

    if (!cleanUrl || !cleanKey) {
      onNotify('URL dan Anon Key Supabase tidak boleh kosong!', 'warning');
      return;
    }

    saveSupabaseConfig(cleanUrl, cleanKey);
    onNotify('Konfigurasi Supabase berhasil disimpan!', 'success');
    playSuccessBeep();
  };

  const handleResetDatabase = () => {
    setSupabaseUrl(DEFAULT_SUPABASE_URL);
    setSupabaseKey(DEFAULT_SUPABASE_ANON_KEY);
    saveSupabaseConfig(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
    onNotify('Database di-reset ke konfigurasi default Chocochips!', 'info');
  };

  const handleTestDatabase = async () => {
    setIsTestingDatabase(true);
    setDatabaseStatus('idle');
    setDatabaseStatusMsg('');

    try {
      saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
      const client = getSupabaseClient();
      const { error } = await client.from('log_produk').select('id').limit(1);

      if (error) {
        throw new Error(error.message);
      }

      setDatabaseStatus('success');
      setDatabaseStatusMsg('Koneksi database berhasil! Siap menyimpan data.');
      playSuccessBeep();
      vibrateDevice(50);
      onNotify('Koneksi database berhasil terhubung!', 'success');
    } catch (err: unknown) {
      console.warn('Supabase test failed:', err);
      setDatabaseStatus('error');
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi database.';
      setDatabaseStatusMsg(msg);
      playErrorBeep();
      onNotify(`Koneksi database gagal: ${msg}`, 'error');
    } finally {
      setIsTestingDatabase(false);
    }
  };

  // --- GAS ACTIONS ---
  const handleSaveGas = () => {
    const cleanEndpoint = gasEndpoint.trim();
    if (!cleanEndpoint) {
      onNotify('Endpoint URL Google Apps Script tidak boleh kosong!', 'warning');
      return;
    }

    localStorage.setItem('wms_endpoint_url', cleanEndpoint);
    if (session) {
      const updated = { ...session, endpointUrl: cleanEndpoint };
      onUpdateSession(updated);
    }
    onNotify('Endpoint Google Apps Script berhasil disimpan!', 'success');
    playSuccessBeep();
  };

  const handleResetGas = () => {
    setGasEndpoint(DEFAULT_GAS_ENDPOINT);
    localStorage.setItem('wms_endpoint_url', DEFAULT_GAS_ENDPOINT);
    if (session) {
      onUpdateSession({ ...session, endpointUrl: DEFAULT_GAS_ENDPOINT });
    }
    onNotify('Endpoint GAS di-reset ke URL default!', 'info');
  };

  const handleTestGas = async () => {
    setIsTestingGas(true);
    setGasStatus('idle');
    setGasStatusMsg('');

    try {
      const cleanEndpoint = gasEndpoint.trim();
      await apiCall<{ status?: string; message?: string }>(cleanEndpoint, {
        action: 'ping',
      });

      setGasStatus('success');
      setGasStatusMsg('Endpoint Google Apps Script aktif dan merespon dengan baik.');
      playSuccessBeep();
      vibrateDevice(50);
      onNotify('Koneksi Google Apps Script berhasil!', 'success');
    } catch (err: unknown) {
      console.warn('GAS test error:', err);
      setGasStatus('error');
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi Google Apps Script.';
      setGasStatusMsg(msg);
      playErrorBeep();
      onNotify(`Koneksi GAS gagal: ${msg}`, 'error');
    } finally {
      setIsTestingGas(false);
    }
  };

  const handleSyncProductCatalog = async () => {
    setIsSyncingCatalog(true);
    try {
      await onRefreshCatalog(gasEndpoint.trim(), session?.token || '');
      playSuccessBeep();
      vibrateDevice(50);
      onNotify('Katalog produk master berhasil disinkronkan dari Cloud!', 'success');
    } catch {
      playErrorBeep();
      onNotify('Gagal menyinkronkan katalog produk.', 'error');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  // --- USER MANAGEMENT & ROLE ACTIONS ---
  const handleRolePresetSelect = (role: UserRole) => {
    setNewRole(role);
    setNewPermissions({ ...ROLE_DEFAULT_PERMISSIONS[role] });
  };

  const handleTogglePermission = (key: UserPermissionKey) => {
    setNewPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAllGroupPermissions = (keys: UserPermissionKey[], selectAll: boolean) => {
    setNewPermissions((prev) => {
      const updated = { ...prev };
      keys.forEach((k) => {
        updated[k] = selectAll;
      });
      return updated;
    });
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanU = newUsername.trim().toLowerCase();
    const cleanName = newName.trim() || cleanU;
    const cleanP = newPassword.trim();

    if (!cleanU) {
      onNotify('Username tidak boleh kosong!', 'warning');
      return;
    }

    let updated: LocalUserRecord[];
    const userToSave: LocalUserRecord = {
      username: cleanU,
      name: cleanName,
      password: cleanP || (editingIndex !== null ? userList[editingIndex].password : '123456'),
      role: newRole,
      permissions: { ...newPermissions },
    };

    if (editingIndex !== null) {
      // Edit existing user
      updated = [...userList];
      updated[editingIndex] = userToSave;
      setEditingIndex(null);
      onNotify(`User "${cleanU}" & izin akses berhasil diperbarui!`, 'success');
    } else {
      // Add new user
      if (userList.some((u) => u.username.toLowerCase() === cleanU)) {
        onNotify(`Username "${cleanU}" sudah terdaftar!`, 'warning');
        return;
      }
      updated = [...userList, userToSave];
      onNotify(`User "${cleanU}" berhasil ditambahkan dengan role ${newRole}!`, 'success');
    }

    setUserList(updated);
    saveLocalUsersList(updated);

    // Also sync to Database table if available
    saveWmsUserToSupabase({
      username: cleanU,
      name: cleanName,
      role: newRole,
      password: userToSave.password,
      permissions: newPermissions,
    });

    // If current logged-in user is updated, update active session
    if (session && session.username.toLowerCase() === cleanU) {
      onUpdateSession({
        ...session,
        name: cleanName,
        role: newRole,
        permissions: newPermissions,
      });
    }

    // Reset form
    setNewUsername('');
    setNewName('');
    setNewPassword('');
    setNewRole('Operator');
    setNewPermissions({ ...ROLE_DEFAULT_PERMISSIONS['Operator'] });
    setIsPermissionFormOpen(false);
    playSuccessBeep();
  };

  const handleEditUser = (idx: number) => {
    const u = userList[idx];
    setEditingIndex(idx);
    setNewUsername(u.username);
    setNewName(u.name || u.username);
    setNewPassword(u.password || '');
    setNewRole(u.role || 'Operator');
    setNewPermissions(
      u.permissions
        ? { ...ROLE_DEFAULT_PERMISSIONS[u.role || 'Operator'], ...u.permissions }
        : { ...ROLE_DEFAULT_PERMISSIONS[u.role || 'Operator'] }
    );
    setIsPermissionFormOpen(true);
  };

  const handleDeleteUser = (idx: number) => {
    const target = userList[idx];
    if (target.username.toLowerCase() === 'admin' || target.username.toLowerCase() === 'superadmin') {
      onNotify('User admin master tidak dapat dihapus!', 'warning');
      return;
    }
    if (!confirm(`Hapus pengguna "${target.name || target.username}" (${target.role})?`)) {
      return;
    }
    const updated = userList.filter((_, i) => i !== idx);
    setUserList(updated);
    saveLocalUsersList(updated);
    deleteWmsUserFromSupabase(target.username);
    onNotify(`User "${target.username}" berhasil dihapus.`, 'info');
  };

  const handleSwitchActiveRole = (targetRole: UserRole) => {
    if (!session) return;
    const targetPermissions = ROLE_DEFAULT_PERMISSIONS[targetRole];
    const updatedSession: UserSession = {
      ...session,
      role: targetRole,
      permissions: targetPermissions,
    };
    onUpdateSession(updatedSession);
    localStorage.setItem('wms_user_role', targetRole);
    onNotify(`Role aktif beralih ke: ${targetRole}`, 'info');
    playCategoryBeep();
  };

  return (
    <div
      id="settingsModalOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        id="settingsModalContent"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-[#0f172a]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff7a00]/10 border border-[#ff7a00]/30 flex items-center justify-center text-[#ff7a00]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Pengaturan Sistem & Hak Akses WMS
                </h2>
                {userIsSuperadmin && (
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded text-[10px] font-black tracking-wider uppercase border border-purple-300 dark:border-purple-800">
                    SUPERADMIN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cloud DB, Integrasi Google Apps Script, Manajemen Pengguna & Perangkat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 gap-1 bg-slate-100/50 dark:bg-[#0b1324] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Cloud Database</span>
            {isRealtimeConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gas')}
            className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'gas'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Google Apps Script</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Manajemen Pengguna ({userList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('device')}
            className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'device'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Preferensi Perangkat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('deploy_apk')}
            className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'deploy_apk'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span>Deploy & APK</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* ========================================================================= */}
          {/* TAB: USER MANAGEMENT (RBAC) */}
          {/* ========================================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Quick Role Simulation Switcher for Superadmin Testing */}
              {session && (
                <div className="p-4 bg-gradient-to-r from-[#ff7a00]/10 via-[#ff7a00]/5 to-transparent border border-[#ff7a00]/30 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#ff7a00]" />
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        Sesi Login Aktif: <b className="text-[#ff7a00]">{session.name || session.username}</b>
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 bg-[#ff7a00] text-white rounded-lg text-[11px] font-black uppercase">
                      {session.role}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Ganti role simulasi cepat untuk menguji tampilan menu & izin fitur:
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(['Superadmin', 'Operator', 'Produk', 'Fulfillment', 'Peminjaman'] as UserRole[]).map((r) => {
                      const details = ROLE_DETAILS[r];
                      const isCurrent = session.role === r || (r === 'Superadmin' && session.role === 'All');
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleSwitchActiveRole(r)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isCurrent
                              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/20'
                              : 'bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#ff7a00]'
                          }`}
                        >
                          <span>{details.badge}</span>
                          <span>{details.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add / Edit User Form Accordion */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-[#0f172a]/50">
                <div className="p-4 bg-white dark:bg-[#101726] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {editingIndex !== null ? (
                      <Edit2 className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Plus className="w-4 h-4 text-[#ff7a00]" />
                    )}
                    <span className="text-xs font-extrabold text-slate-800 dark:text-white">
                      {editingIndex !== null ? `Edit Data & Izin User: "${newUsername}"` : 'Tambah Pengguna & Pengaturan Role Baru'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isPermissionFormOpen) {
                        setIsPermissionFormOpen(false);
                        setEditingIndex(null);
                      } else {
                        setIsPermissionFormOpen(true);
                      }
                    }}
                    className="text-xs text-[#ff7a00] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {isPermissionFormOpen ? 'Tutup Form' : '+ Buka Form Tambah User'}
                  </button>
                </div>

                {isPermissionFormOpen && (
                  <form onSubmit={handleSaveUser} className="p-4 sm:p-5 space-y-4">
                    {/* Basic Info: Username, Name, Password */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Username / ID Login <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="e.g. gudang1"
                          className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nama Lengkap Staff
                        </label>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g. Budi Santoso"
                          className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Password
                        </label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Default: 123456"
                          className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                        />
                      </div>
                    </div>

                    {/* Role Preset Selector */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                        Pilih Template Role Utama:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(['Superadmin', 'Operator', 'Produk', 'Fulfillment', 'Peminjaman'] as UserRole[]).map((r) => {
                          const details = ROLE_DETAILS[r];
                          const isSelected = newRole === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleRolePresetSelect(r)}
                              className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-[#ff7a00]/10 border-[#ff7a00] text-[#ff7a00] shadow-sm'
                                  : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                              }`}
                            >
                              <div className="text-base mb-1">{details.badge}</div>
                              <div className="text-xs font-bold truncate">{details.title}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-2 mt-0.5">
                                {details.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Granular Permission Checkbox Matrix */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                        <div>
                          <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-[#ff7a00]" />
                            <span>Pengaturan Hak Akses Spesifik (Granular Permissions)</span>
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            Centang atau hapus centang untuk menyesuaikan fitur apa saja yang boleh dibuka oleh user ini
                          </p>
                        </div>

                        <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-300 dark:border-emerald-800">
                          {countGrantedPermissions(newPermissions)} / {TOTAL_PERMISSIONS_COUNT} Izin Aktif
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const groupKeys = group.permissions.map((p) => p.key);
                          const isAllGroupSelected = groupKeys.every((k) => newPermissions[k]);

                          return (
                            <div
                              key={group.id}
                              className="p-3.5 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 shadow-xs"
                            >
                              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{group.badge}</span>
                                  <div>
                                    <div className="text-xs font-bold text-slate-800 dark:text-white">
                                      {group.title}
                                    </div>
                                    <div className="text-[9px] text-slate-400">{group.description}</div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectAllGroupPermissions(groupKeys, !isAllGroupSelected)
                                  }
                                  className="text-[10px] font-bold text-[#ff7a00] hover:underline cursor-pointer"
                                >
                                  {isAllGroupSelected ? 'Batal' : 'Pilih Semua'}
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {group.permissions.map((perm) => {
                                  const isChecked = !!newPermissions[perm.key];
                                  return (
                                    <label
                                      key={perm.key}
                                      className={`flex items-start gap-2.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        isChecked
                                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-white'
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => handleTogglePermission(perm.key)}
                                        className="mt-0.5 rounded text-[#ff7a00] focus:ring-[#ff7a00] cursor-pointer"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold flex items-center gap-1">
                                          <span>{perm.label}</span>
                                          {perm.isSuperadminOnly && (
                                            <span className="text-[8px] font-extrabold px-1 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded">
                                              SUPERADMIN
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 leading-tight">
                                          {perm.description}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Form Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPermissionFormOpen(false);
                          setEditingIndex(null);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Batal
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2 bg-[#ff7a00] hover:bg-[#e66e00] text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{editingIndex !== null ? 'Simpan Perubahan User' : 'Simpan User Baru'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* User List Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#ff7a00]" />
                    <span>Daftar Pengguna Sistem & Hak Akses ({userList.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Klik Edit untuk mengubah role atau izin khusus per user
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0f172a]">
                  {userList.map((usr, idx) => {
                    const roleInfo = ROLE_DETAILS[usr.role || 'Operator'] || ROLE_DETAILS['Operator'];
                    const grantedCount = countGrantedPermissions(
                      usr.permissions || ROLE_DEFAULT_PERMISSIONS[usr.role || 'Operator']
                    );
                    const isCurrentUser = session?.username.toLowerCase() === usr.username.toLowerCase();

                    return (
                      <div
                        key={idx}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-black text-slate-700 dark:text-slate-300 shrink-0">
                            {roleInfo.badge}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                              <span className="truncate">{usr.name || usr.username}</span>
                              <span className="font-mono text-[10px] text-slate-400 font-normal">
                                (@{usr.username})
                              </span>
                              {isCurrentUser && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-bold">
                                  Akun Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>
                                Role: <b className="text-slate-700 dark:text-slate-200">{usr.role}</b>
                              </span>
                              <span>•</span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                {grantedCount}/{TOTAL_PERMISSIONS_COUNT} Izin Aktif
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-lg font-extrabold uppercase ${
                              usr.role === 'Superadmin' || usr.role === 'All'
                                ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                                : 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                            }`}
                          >
                            {usr.role}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleEditUser(idx)}
                            title="Edit Role & Izin"
                            className="px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg flex items-center gap-1 cursor-pointer border border-blue-200 dark:border-blue-800/60"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit Izin</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(idx)}
                            title="Hapus User"
                            disabled={usr.username.toLowerCase() === 'admin' || usr.username.toLowerCase() === 'superadmin'}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg disabled:opacity-20 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DATABASE CONFIG (SUPERADMIN ONLY) */}
          {/* ========================================================================= */}
          {activeTab === 'database' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black">
                    S
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                      Status Database Realtime
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isRealtimeConnected
                        ? '🟢 WebSocket Live Channel Terhubung (log_produk & picking_list sync)'
                        : '🟡 Menghubungkan ke Realtime Channel...'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestDatabase}
                    disabled={isTestingDatabase}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingDatabase ? 'animate-spin' : ''}`} />
                    <span>Tes Koneksi</span>
                  </button>
                </div>
              </div>

              {databaseStatus === 'success' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{databaseStatusMsg}</span>
                </div>
              )}

              {databaseStatus === 'error' && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{databaseStatusMsg}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Database Project URL
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopy(supabaseUrl, 'Database URL')}
                      className="text-[11px] text-slate-500 hover:text-[#ff7a00] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'Database URL' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>Salin</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xyz.database.co"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Database Anon / Public API Key
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopy(supabaseKey, 'Database Key')}
                      className="text-[11px] text-slate-500 hover:text-[#ff7a00] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'Database Key' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>Salin</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleResetDatabase}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDatabase}
                  className="px-4 py-2 bg-[#ff7a00] hover:bg-[#e66e00] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Konfigurasi Database</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: GOOGLE APPS SCRIPT CONFIG (SUPERADMIN ONLY) */}
          {/* ========================================================================= */}
          {activeTab === 'gas' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                    G
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                      Google Sheets Backend (GAS)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sinkronisasi katalog produk master, SPS peminjaman & mutasi stok
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncProductCatalog}
                    disabled={isSyncingCatalog}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                    <span>Sync Katalog</span>
                  </button>
                </div>
              </div>

              {gasStatus === 'success' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{gasStatusMsg}</span>
                </div>
              )}

              {gasStatus === 'error' && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{gasStatusMsg}</span>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Google Apps Script Web App Exec URL
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy(gasEndpoint, 'GAS Endpoint')}
                    className="text-[11px] text-slate-500 hover:text-[#ff7a00] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'GAS Endpoint' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>Salin</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={gasEndpoint}
                  onChange={(e) => setGasEndpoint(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00] focus:ring-1 focus:ring-[#ff7a00]"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetGas}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Default</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestGas}
                    disabled={isTestingGas}
                    className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Ping Server</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveGas}
                  className="px-4 py-2 bg-[#ff7a00] hover:bg-[#e66e00] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Endpoint GAS</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEVICE & SCANNER PREFERENCES (ACCESSIBLE TO ALL USERS) */}
          {/* ========================================================================= */}
          {activeTab === 'device' && (
            <div className="space-y-4">
              {/* Dark mode */}
              <div className="p-3.5 bg-slate-50 dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      Tema Tampilan Aplikasi
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Pilih antara Light Mode (Terang) atau Dark Mode (Gelap)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#ff7a00] cursor-pointer"
                >
                  {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
                </button>
              </div>

              {/* Audio & Vibration Test */}
              <div className="p-3.5 bg-slate-50 dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ff7a00]/10 text-[#ff7a00] flex items-center justify-center">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      Feedback Suara & Getaran Scanner
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Uji nada beep scanner fisik/kamera dan getaran haptic HP
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playSuccessBeep();
                      vibrateDevice(50);
                    }}
                    className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-200 cursor-pointer"
                  >
                    🔊 Test Beep Sukses
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playCategoryBeep();
                      vibrateDevice(60);
                    }}
                    className="px-3 py-1.5 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-xl text-xs font-bold hover:bg-blue-200 cursor-pointer"
                  >
                    🔊 Test Beep Kategori/Lokasi
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playErrorBeep();
                      vibrateDevice([100, 50, 100]);
                    }}
                    className="px-3 py-1.5 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-xl text-xs font-bold hover:bg-rose-200 cursor-pointer"
                  >
                    🔊 Test Beep Error
                  </button>
                </div>
              </div>

              {/* Push Notifications */}
              <div className="p-3.5 bg-slate-50 dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      Push Notifikasi Real-time
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Status: <b>{notificationPermission.toUpperCase()}</b>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRequestNotification}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#ff7a00] cursor-pointer"
                >
                  {notificationPermission === 'granted' ? '🔔 Aktif' : 'Minta Izin'}
                </button>
              </div>

              {/* Clear Cache */}
              <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300">
                    Bersihkan Cache & Reset Data Lokal
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Hapus cache katalog produk dan riwayat sementara di browser ini
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('wms_product_cache');
                    onNotify('Cache katalog produk lokal berhasil dibersihkan.', 'info');
                  }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Bersihkan Cache
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEPLOY & APK */}
          {/* ========================================================================= */}
          {activeTab === 'deploy_apk' && (
            <div className="space-y-6">
              {/* GitHub Pages */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Github className="w-5 h-5 text-slate-800 dark:text-white" />
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    1. Cara Deploy Langsung ke GitHub Pages (Gratis)
                  </h3>
                </div>
                
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
                      Aplikasi ini sudah dilengkapi dengan file otomatisasi <strong>GitHub Actions</strong> (<code>.github/workflows/deploy.yml</code>) yang langsung mem-build web WMS Anda ke GitHub Pages tanpa layanan tambahan.
                    </p>
                    <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal list-inside pl-1 font-medium">
                      <li>Buat <strong>Repository Baru</strong> di GitHub Anda.</li>
                      <li>Upload/push semua file dari proyek ini ke branch utama (<code>main</code> atau <code>master</code>).</li>
                      <li>Di repository GitHub Anda, masuk ke tab <strong>Settings</strong> {'>'} <strong>Pages</strong>.</li>
                      <li>Pada bagian <em>Build and deployment</em>, ubah <em>Source</em> menjadi <strong>GitHub Actions</strong>.</li>
                      <li>Selesai! GitHub akan otomatis memproses dan dalam 1-2 menit, link Web App Anda akan muncul di bagian atas halaman Settings tersebut.</li>
                    </ol>
                    <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg">
                      <p className="text-[10px] text-yellow-800 dark:text-yellow-400 font-semibold">
                        *Catatan penting untuk Vite: Jika URL GitHub Pages Anda memiliki subfolder (misal: <code>username.github.io/nama-repo/</code>), pastikan Anda mengubah pengaturan <code>base: '/nama-repo/'</code> di dalam file <code>vite.config.ts</code> sebelum melakukan push.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* PWABuilder Android */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    2. Cara Generate File APK Android (.apk / .aab)
                  </h3>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl space-y-3">
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Aplikasi ini sudah mendukung spesifikasi Progressive Web App (PWA) lengkap dengan <code className="font-mono text-emerald-700 dark:text-emerald-400">manifest.json</code> dan <code className="font-mono text-emerald-700 dark:text-emerald-400">sw.js</code>. Anda dapat mem-build APK nya secara gratis dalam 3 menit:
                  </p>
                  
                  <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal list-inside pl-1">
                    <li>Pastikan aplikasi Web sudah online (seperti panduan nomor 1).</li>
                    <li>Buka situs <a href="https://www.pwabuilder.com/" target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 underline font-bold flex inline-flex items-center gap-1">PWABuilder <ExternalLink className="w-3 h-3" /></a> di laptop.</li>
                    <li>Masukkan link URL web WMS Anda (contoh: <code className="text-[10px]">https://chocowms.vercel.app</code>) lalu klik <strong>Start</strong>.</li>
                    <li>Sistem akan menganalisa web Anda dan memberi skor (biasanya sempurna karena manifest dan SW sudah siap).</li>
                    <li>Klik tombol <strong>Package for Android</strong>.</li>
                    <li>Tunggu beberapa saat, lalu unduh file Zip yang berisi <strong>APK</strong> dan <strong>AAB</strong>.</li>
                    <li>Kirim file <code>app-release.apk</code> ke HP operator dan install.</li>
                  </ol>
                </div>
              </div>

              {/* Update & Bug Fixes */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Workflow className="w-5 h-5 text-[#ff7a00]" />
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    3. Tata Cara Update / Revisi (Tanpa Perlu Install APK Ulang)
                  </h3>
                </div>

                <div className="p-3 bg-[#ff7a00]/5 border border-[#ff7a00]/20 rounded-xl">
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
                    Keunggulan menggunakan PWABuilder (Webview) adalah Anda <strong>tidak perlu meminta operator install ulang APK</strong> setiap kali ada revisi bug atau fitur baru.
                  </p>
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                      <Code2 className="w-6 h-6 text-slate-400" />
                      <div className="flex-1">
                        <h5 className="text-[11px] font-bold text-slate-900 dark:text-white">A. Perbaiki Kode</h5>
                        <p className="text-[10px] text-slate-500">Edit kode fitur/bug di local/AI Studio</p>
                      </div>
                    </div>
                    
                    <div className="flex justify-center -my-1">
                      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 rotate-90 sm:rotate-0" />
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                      <Github className="w-6 h-6 text-slate-400" />
                      <div className="flex-1">
                        <h5 className="text-[11px] font-bold text-slate-900 dark:text-white">B. Push/Deploy Web</h5>
                        <p className="text-[10px] text-slate-500">Push kode baru ke GitHub / Vercel</p>
                      </div>
                    </div>
                    
                    <div className="flex justify-center -my-1">
                      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 rotate-90 sm:rotate-0" />
                    </div>

                    <div className="flex items-center gap-3 bg-[#ff7a00]/10 border border-[#ff7a00]/30 p-2.5 rounded-lg">
                      <Sparkles className="w-6 h-6 text-[#ff7a00]" />
                      <div className="flex-1">
                        <h5 className="text-[11px] font-bold text-[#ff7a00]">C. Update Otomatis!</h5>
                        <p className="text-[10px] text-[#ff7a00]/80">APK di HP akan otomatis merefresh & memuat fitur baru saat dibuka.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[#ff7a00]" />
            <span className="font-mono">WMS v2.4 Chocochips • RBAC Engine</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
