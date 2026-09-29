import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export const GlobalLoading: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('Memproses...');

  useEffect(() => {
    const handleLoading = (event: Event) => {
      const customEvent = event as CustomEvent<{ isLoading: boolean; message?: string }>;
      setIsLoading(customEvent.detail.isLoading);
      if (customEvent.detail.message) {
        setMessage(customEvent.detail.message);
      } else {
        setMessage('Memproses...');
      }
    };

    window.addEventListener('global-loading', handleLoading);
    return () => {
      window.removeEventListener('global-loading', handleLoading);
    };
  }, []);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 min-w-[200px] border border-slate-200 dark:border-slate-800 scale-in-center animate-in zoom-in-95 duration-200">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full"></div>
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin relative z-10" />
        </div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 text-center animate-pulse">
          {message}
        </div>
      </div>
    </div>
  );
};
