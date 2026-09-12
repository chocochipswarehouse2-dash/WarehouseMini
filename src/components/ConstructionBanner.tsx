import React from 'react';
import { Construction } from 'lucide-react';

export const ConstructionBanner: React.FC = () => {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-6 flex items-start gap-3">
      <Construction className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-amber-800 dark:text-amber-400">🚧 Sedang Proses Konstruksi (Work in Progress)</p>
        <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-0.5">
          Halaman ini masih dalam tahap pengembangan (dummy). Layout dan fitur dapat berubah dan belum terhubung dengan database utama.
        </p>
      </div>
    </div>
  );
};
