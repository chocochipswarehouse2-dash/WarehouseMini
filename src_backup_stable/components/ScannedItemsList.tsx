import React, { useEffect, useRef } from 'react';
import {
  Trash2,
  PackageOpen,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Clock,
  Copy,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  CheckSquare,
} from 'lucide-react';
import { ScannedItem } from '../types';

interface ScannedItemsListProps {
  items: ScannedItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

export const ScannedItemsList: React.FC<ScannedItemsListProps> = ({
  items,
  onRemoveItem,
  onClearAll,
}) => {
  const listBottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  const handleCopySummary = () => {
    if (!items.length) return;
    const textLines = items.map((i) => i.text).join('\n');
    navigator.clipboard.writeText(textLines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div id="scannedListSection" className="px-4 py-4 max-w-lg mx-auto">
      {/* Header Bar */}
      <div className="flex justify-between items-center mb-3 bg-white dark:bg-[#0F0F12] p-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
            <span>Daftar Pemindaian</span>
            <span
              id="scanCount"
              className="bg-emerald-500 text-black font-extrabold px-2 py-0.5 rounded-full text-xs shadow-[0_0_8px_rgba(16,185,129,0.35)]"
            >
              {items.length}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleCopySummary}
              title="Salin semua SKU"
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-500 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 transition-colors flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Tersalin' : 'Copy'}</span>
            </button>
          )}

          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-rose-500 hover:text-rose-400 font-bold hover:bg-rose-500/10 px-2.5 py-1 rounded-lg transition-colors uppercase tracking-wider cursor-pointer"
            >
              Kosongkan
            </button>
          )}
        </div>
      </div>

      {/* List Container */}
      <div id="scanList" className="space-y-2.5">
        {items.length === 0 ? (
          <div
            id="emptyState"
            className="text-center py-12 text-slate-400 dark:text-slate-500 bg-white dark:bg-[#0F0F12]/60 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 transition-colors"
          >
            <div className="bg-slate-100 dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <PackageOpen className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Belum ada antrean scan
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              Scan barcode fisik, gunakan kamera HP, atau ketik SKU manual untuk memulai pemindaian.
            </p>
          </div>
        ) : (
          items.map((item, index) => {
            const cat = item.category || 'SO';
            const loc = item.location;

            return (
              <div
                key={item.id}
                id={`scanned-item-${item.id}`}
                className={`border rounded-xl p-3.5 flex justify-between items-start transition-all ${
                  item.isInvalidSku
                    ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                    : 'bg-white dark:bg-[#0F0F12] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex-1 overflow-hidden pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-600">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <div
                      className={`font-bold font-mono text-sm sm:text-base truncate ${
                        item.isInvalidSku ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {item.text}
                    </div>
                  </div>

                  {item.productName && (
                    <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1 font-semibold truncate">
                      {item.productName}
                    </div>
                  )}

                  {item.isInvalidSku && (
                    <div className="text-xs text-rose-500 dark:text-rose-400 mt-1 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> SKU tidak terdaftar di database Supabase
                    </div>
                  )}

                  {/* Badges: Category, Location, Size */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {/* Category Label */}
                    {cat === 'IN' && (
                      <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase flex items-center gap-1">
                        <ArrowDownLeft className="w-3 h-3 text-indigo-500" /> #IN Masuk
                      </span>
                    )}
                    {cat === 'OUT' && (
                      <span className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3 text-purple-500" /> #OUT Keluar
                      </span>
                    )}
                    {cat === 'SO' && (
                      <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase flex items-center gap-1">
                        <CheckSquare className="w-3 h-3 text-emerald-500" /> #SO Opname
                      </span>
                    )}

                    {/* Location Label */}
                    {loc ? (
                      <span className="bg-slate-100 dark:bg-[#09090B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-500" /> #{loc}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono font-medium px-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 opacity-40" /> Rak: -
                      </span>
                    )}

                    {/* Size Label */}
                    {item.size && (
                      <span className="text-[10px] font-black bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase">
                        Size: {item.size}
                      </span>
                    )}

                    {/* Catalog Verified Status */}
                    {!item.isInvalidSku && (
                      <span className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.time}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    title="Hapus baris ini"
                    className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        <div ref={listBottomRef} />
      </div>
    </div>
  );
};

