import React from 'react';
import { X, ExternalLink, Download } from 'lucide-react';

interface PhotoLightboxModalProps {
  photoUrl: string | null;
  onClose: () => void;
  title?: string;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  photoUrl,
  onClose,
  title = 'Dokumentasi Foto Alterasi',
}) => {
  if (!photoUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-200">{title}</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-700/60 font-medium">
              Google Drive Cloud
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka di Google Drive</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Content */}
        <div className="flex-1 overflow-auto p-2 sm:p-4 flex items-center justify-center bg-black/40">
          <img
            src={photoUrl}
            alt="Dokumentasi Alterasi"
            className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-md"
          />
        </div>
      </div>
    </div>
  );
};
