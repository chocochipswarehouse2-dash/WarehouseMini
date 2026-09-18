import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { KatalogItem } from '../../types';

interface KatalogImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  item: KatalogItem | null;
  allItems?: KatalogItem[];
  onSelectNext?: () => void;
  onSelectPrev?: () => void;
}

export const KatalogImageLightbox: React.FC<KatalogImageLightboxProps> = ({
  isOpen,
  onClose,
  item,
  allItems = [],
  onSelectNext,
  onSelectPrev,
}) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
    }
  }, [isOpen, item]);

  // Keyboard shortcut ESC, Panah Kiri, Panah Kanan
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && onSelectNext) {
        onSelectNext();
      } else if (e.key === 'ArrowLeft' && onSelectPrev) {
        onSelectPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onSelectNext, onSelectPrev]);

  if (!isOpen || !item) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.3, 0.6));
  const handleResetZoom = () => setScale(1);

  const currentIndex = allItems.findIndex((it) => it.id === item.id);
  const hasMultiple = allItems.length > 1 && currentIndex >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Bar: Info Produk & Controls */}
      <div className="w-full px-4 sm:px-6 py-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-white text-black shrink-0">
            {item.catalog_name ? `Katalog ${item.catalog_name}` : 'Katalog'}
          </span>
          {item.nomor && (
            <span className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-white/20 text-white shrink-0">
              #{item.nomor}
            </span>
          )}
          <div className="min-w-0 truncate">
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              {item.deskripsi || 'Foto Produk'}
            </h3>
            <p className="text-xs text-emerald-400 font-bold">
              {item.price ? `Rp ${item.price}` : ''}
              {hasMultiple && (
                <span className="text-slate-400 font-normal ml-2">
                  ({currentIndex + 1} dari {allItems.length} produk)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
            title="Reset Ukuran"
          >
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {item.image_url && (
            <a
              href={item.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
              title="Buka foto asli di tab baru"
            >
              <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 ml-1 rounded-xl bg-red-600/80 hover:bg-red-600 text-white transition-colors cursor-pointer"
            title="Tutup (ESC)"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Main Container Foto Fullscreen (Utuh & Tidak Terpotong) */}
      <div
        className="flex-1 w-full flex items-center justify-center p-4 sm:p-8 relative overflow-hidden select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Tombol Navigasi Prev */}
        {hasMultiple && onSelectPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPrev();
            }}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all cursor-pointer z-20 shadow-lg"
            title="Produk Sebelumnya (Panah Kiri)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Gambar Utuh */}
        {item.image_url ? (
          <div
            className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
            style={{ transform: `scale(${scale})` }}
          >
            <img
              src={item.image_url}
              alt={item.deskripsi}
              className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg shadow-2xl transition-all"
              crossOrigin="anonymous"
            />
          </div>
        ) : (
          <div className="text-center text-slate-400 p-8">
            <p className="text-base font-semibold">Foto produk belum tersedia</p>
          </div>
        )}

        {/* Tombol Navigasi Next */}
        {hasMultiple && onSelectNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNext();
            }}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all cursor-pointer z-20 shadow-lg"
            title="Produk Berikutnya (Panah Kanan)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Info Bar: Varian Produk */}
      <div className="w-full px-6 py-2.5 bg-gradient-to-t from-black/80 to-transparent flex flex-wrap items-center justify-center gap-4 text-xs text-slate-300 z-10">
        <span>
          {item.variants?.length || 0} Varian Warna & Size
        </span>
        <span>•</span>
        <span>
          Total Stok:{' '}
          <strong className="text-white">
            {item.variants?.reduce((sum, v) => sum + (v.qty || 0), 0) || 0} pcs
          </strong>
        </span>
        <span className="hidden sm:inline">•</span>
        <span className="hidden sm:inline text-slate-400">
          Gunakan tombol Panah Kiri/Kanan keyboard untuk berpindah foto
        </span>
      </div>
    </div>
  );
};
