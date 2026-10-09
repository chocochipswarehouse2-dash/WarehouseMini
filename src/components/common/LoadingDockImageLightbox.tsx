import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, ChevronLeft, ChevronRight, Camera } from 'lucide-react';

export interface LightboxPhotoItem {
  url: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  date?: string;
}

interface LoadingDockImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  photo: LightboxPhotoItem | null;
  allPhotos?: Array<LightboxPhotoItem | string>;
  currentIndex?: number;
  onSelectNext?: () => void;
  onSelectPrev?: () => void;
  onSelectIndex?: (index: number) => void;
}

export const LoadingDockImageLightbox: React.FC<LoadingDockImageLightboxProps> = ({
  isOpen,
  onClose,
  photo,
  allPhotos = [],
  currentIndex: explicitIndex,
  onSelectNext,
  onSelectPrev,
  onSelectIndex,
}) => {
  const [scale, setScale] = useState(1);

  // Normalize photos list to LightboxPhotoItem[]
  const normalizedPhotos: LightboxPhotoItem[] = allPhotos.map((p, idx) => {
    if (typeof p === 'string') {
      return {
        url: p,
        title: `Dokumentasi Foto #${idx + 1}`,
        badge: 'Loading Dock',
      };
    }
    return p;
  });

  const activeUrl = photo?.url || '';
  const currentIdx = explicitIndex !== undefined 
    ? explicitIndex 
    : normalizedPhotos.findIndex((it) => it.url === activeUrl);

  const hasMultiple = normalizedPhotos.length > 1;

  useEffect(() => {
    if (isOpen) {
      setScale(1);
    }
  }, [isOpen, activeUrl]);

  // Keyboard navigation: ESC, Left, Right
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (onSelectNext) {
          onSelectNext();
        } else if (hasMultiple && onSelectIndex) {
          const nextIdx = (currentIdx + 1) % normalizedPhotos.length;
          onSelectIndex(nextIdx);
        }
      } else if (e.key === 'ArrowLeft') {
        if (onSelectPrev) {
          onSelectPrev();
        } else if (hasMultiple && onSelectIndex) {
          const prevIdx = (currentIdx - 1 + normalizedPhotos.length) % normalizedPhotos.length;
          onSelectIndex(prevIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onSelectNext, onSelectPrev, onSelectIndex, currentIdx, hasMultiple, normalizedPhotos.length]);

  if (!isOpen || !photo || !activeUrl) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.3, 0.6));
  const handleResetZoom = () => setScale(1);

  const handlePrev = () => {
    if (onSelectPrev) {
      onSelectPrev();
    } else if (hasMultiple && onSelectIndex) {
      const prevIdx = (currentIdx - 1 + normalizedPhotos.length) % normalizedPhotos.length;
      onSelectIndex(prevIdx);
    }
  };

  const handleNext = () => {
    if (onSelectNext) {
      onSelectNext();
    } else if (hasMultiple && onSelectIndex) {
      const nextIdx = (currentIdx + 1) % normalizedPhotos.length;
      onSelectIndex(nextIdx);
    }
  };

  const displayTitle = photo.title || 'Preview Foto Loading Dock';
  const displaySubtitle = photo.subtitle || (photo.date ? `Diambil: ${photo.date}` : '');
  const displayBadge = photo.badge || 'Loading Dock';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-black/92 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Bar: Info Foto & Action Controls (Identik dengan Katalog Produk) */}
      <div className="w-full px-4 sm:px-6 py-3 bg-gradient-to-b from-black/85 via-black/50 to-transparent flex items-center justify-between z-20 text-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-white text-black shrink-0 flex items-center gap-1.5 shadow-sm">
            <Camera className="w-3.5 h-3.5" />
            <span>{displayBadge}</span>
          </span>

          <div className="min-w-0 truncate">
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              {displayTitle}
            </h3>
            <p className="text-xs text-emerald-400 font-medium truncate flex items-center gap-2">
              {displaySubtitle && <span>{displaySubtitle}</span>}
              {hasMultiple && currentIdx >= 0 && (
                <span className="text-slate-400 font-normal">
                  ({currentIdx + 1} dari {normalizedPhotos.length} foto)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-3">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Perbesar (Zoom In)"
          >
            <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Perkecil (Zoom Out)"
          >
            <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Reset Ukuran (100%)"
          >
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <a
            href={activeUrl}
            download="Foto_LoadingDock.jpg"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer hidden sm:flex"
            title="Unduh / Simpan Foto"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>

          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
            title="Buka foto asli di tab baru"
          >
            <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="p-2 ml-1 rounded-xl bg-red-600/80 hover:bg-red-600 text-white transition-colors cursor-pointer shadow-md"
            title="Tutup (ESC)"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Main Container Foto Fullscreen (Utuh & Tidak Terpotong) */}
      <div
        className="flex-1 w-full flex items-center justify-center p-3 sm:p-8 relative overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Tombol Navigasi Prev */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all cursor-pointer z-30 shadow-xl backdrop-blur-xs"
            title="Foto Sebelumnya (Panah Kiri)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Gambar Utuh dengan Dynamic Transform Scale */}
        <div
          className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            src={activeUrl}
            alt={displayTitle}
            className="max-w-[92vw] max-h-[80vh] object-contain rounded-xl shadow-2xl transition-all"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Tombol Navigasi Next */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all cursor-pointer z-30 shadow-xl backdrop-blur-xs"
            title="Foto Berikutnya (Panah Kanan)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Info Bar: Quick Navigation Tips */}
      <div className="w-full px-6 py-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-slate-300 z-20 shrink-0">
        <span className="text-slate-400">
          Tersimpan aman di Cloud / Google Drive
        </span>
        {hasMultiple && (
          <>
            <span>•</span>
            <span className="hidden sm:inline text-slate-400">
              Gunakan tombol Panah Kiri / Kanan keyboard atau klik panah untuk berpindah foto
            </span>
          </>
        )}
        <span>•</span>
        <span className="text-slate-400">
          Tekan <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">ESC</kbd> untuk menutup
        </span>
      </div>
    </div>
  );
};
