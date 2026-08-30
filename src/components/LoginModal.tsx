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
interface LoginModalProps {
  isOpen: boolean;
  onLogin: (user: string, pass: string) => Promise<void>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLogin,
  darkMode,
  onToggleDarkMode,
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Mohon isi field username dan password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onLogin(username.trim(), password.trim());
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
      await onLogin(u, p);
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

        <div className="px-6 sm:px-8 pb-7 pt-4">
          <form id="loginForm" onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Email */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-[#ff7a00]" /> Email / Username
              </label>
              <input
                id="loginUsername"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="email@example.com / admin / operator..."
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
