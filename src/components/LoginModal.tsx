import React, { useState } from 'react';
import {
  User,
  Lock,
  ArrowRight,
  Loader2,
  Sparkles,
  Moon,
  Sun,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  UserCheck,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { DEFAULT_GAS_ENDPOINT } from '../services/gasApi';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (endpoint: string, user: string, pass: string) => Promise<void>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLogin,
  darkMode,
  onToggleDarkMode,
}) => {
  const [endpoint, setEndpoint] = useState<string>(() => {
    return localStorage.getItem('wms_endpoint_url') || DEFAULT_GAS_ENDPOINT;
  });
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('admin123');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint.trim() || !username.trim()) {
      setError('Mohon isi field username dan password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onLogin(endpoint.trim(), username.trim(), password.trim());
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Login gagal. Periksa username dan password.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
    setLoading(true);
    try {
      await onLogin(endpoint.trim(), u, p);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Login gagal.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="loginOverlay"
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        id="loginCard"
        className="bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors my-auto"
      >
        {/* Header Style (Orange Brand Accent) */}
        <div className="pt-7 pb-3 text-center px-6 relative">
          <div className="flex justify-center mb-2.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff7a00] to-[#ff9e40] text-white flex items-center justify-center font-extrabold text-xl shadow-[0_4px_16px_rgba(255,122,0,0.4)]">
              W
            </div>
          </div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center justify-center gap-1.5">
            <span className="text-[#ff7a00]">WMS</span>
            <span className="text-slate-300 dark:text-slate-700 font-normal">&bull;</span>
            <span>CHOCOCHIPS</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold tracking-wider mt-1 uppercase">
            Multi-Role Smart Warehouse System
          </p>

          {/* Dark / Light Mode toggle in login */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Beralih ke Tema Terang (Light Mode)' : 'Beralih ke Tema Gelap (Dark Mode)'}
            className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>

        <div className="px-8 pb-2">
          <hr className="border-t border-slate-100 dark:border-slate-800" />
        </div>

        <div className="px-6 sm:px-8 pb-7 pt-1">
          {/* Quick 1-Click Role Login Buttons */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#ff7a00]" />
                1-Klik Masuk Sesuai Role:
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btnQuickAdmin"
                disabled={loading}
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="p-2.5 bg-[#ff7a00]/10 hover:bg-[#ff7a00]/20 active:bg-[#ff7a00]/30 border border-[#ff7a00]/30 hover:border-[#ff7a00]/60 rounded-xl text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold text-[#ff7a00] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff7a00]" /> Super Admin
                  </div>
                  <CheckCircle2 className="w-3 h-3 text-[#ff7a00] opacity-70 group-hover:opacity-100" />
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Full Akses (All Modul)
                </div>
              </button>

              <button
                type="button"
                id="btnQuickOperator"
                disabled={loading}
                onClick={() => handleQuickLogin('operator', '123456')}
                className="p-2.5 bg-slate-100 dark:bg-[#0f172a] hover:bg-slate-200 dark:hover:bg-[#1e293b] active:bg-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#ff7a00] flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#ff7a00]" /> Operator
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Khusus Scanner Gudang
                </div>
              </button>
            </div>
          </div>

          <div className="relative flex py-1.5 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Atau Masuk Akun Anda
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          <form id="loginForm" onSubmit={handleSubmit} className="space-y-3 mt-1.5">
            {/* Username */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-[#ff7a00]" /> Username
              </label>
              <input
                id="loginUsername"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin / operator / nama akun..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-[#ff7a00] focus:border-[#ff7a00] outline-none text-xs sm:text-sm text-slate-900 dark:text-slate-100 transition-all placeholder-slate-400 font-medium"
              />
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5 text-[#ff7a00]" /> Password
              </label>
              <input
                id="loginPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-[#ff7a00] focus:border-[#ff7a00] outline-none text-xs sm:text-sm text-slate-900 dark:text-slate-100 transition-all placeholder-slate-400 font-medium"
              />
            </div>



            {/* Error message */}
            {error && (
              <div
                id="loginError"
                className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs rounded-xl font-medium"
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                id="btnLogin"
                disabled={loading}
                className="w-full bg-[#ff7a00] hover:bg-[#e06c00] active:bg-[#c95f00] text-white font-extrabold py-3 rounded-xl transition-all shadow-[0_4px_14px_rgba(255,122,0,0.3)] flex justify-center items-center gap-2 tracking-wider uppercase text-xs disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>MEMVERIFIKASI...</span>
                  </>
                ) : (
                  <>
                    <span>MASUK KE SISTEM</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
