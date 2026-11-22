import React, { useEffect, useRef, useState } from 'react';
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
  Table2,
  LayoutList,
} from 'lucide-react';
import { CategoryType, ScannedItem } from '../types';

interface ScannedItemsListProps {
  items: ScannedItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onUpdateCategory?: (id: string, newCategory: CategoryType) => void;
  onUpdateQty?: (id: string, newQty: number) => void;
  forceTableMode?: boolean;
}

export const ScannedItemsList: React.FC<ScannedItemsListProps> = ({
  items,
  onRemoveItem,
  onClearAll,
  onUpdateCategory,
  onUpdateQty,
  forceTableMode = false,
}) => {
  const totalScannedQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);
  const listBottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [internalView, setInternalView] = useState<'table' | 'card'>('table');

  const effectiveView = forceTableMode ? 'table' : internalView;

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
    <div id="scannedListSection" className="w-full min-w-0 space-y-2.5">
      {/* Header Bar */}
      <div className="flex flex-wrap justify-between items-center gap-2 bg-white dark:bg-slate-900 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
            <span>Daftar Pemindaian</span>
            <span
              id="scanCount"
              className="bg-emerald-600 text-white font-extrabold font-mono px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] shrink-0"
            >
              {totalScannedQty} pcs
            </span>
          </h3>
          {items.length > 0 && (
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              · {items.length} SKU
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {!forceTableMode && items.length > 0 && (
            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setInternalView('table')}
                className={`py-1 px-2 text-[11px] font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  effectiveView === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
                title="Tampilan Tabel"
              >
                <Table2 className="w-3 h-3" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setInternalView('card')}
                className={`py-1 px-2 text-[11px] font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  effectiveView === 'card'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
                title="Tampilan Kartu"
              >
                <LayoutList className="w-3 h-3" />
                <span>Kartu</span>
              </button>
            </div>
          )}

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleCopySummary}
              title="Salin semua SKU"
              className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 px-2 sm:px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Tersalin' : 'Copy SKU'}</span>
              <span className="sm:hidden">{copied ? 'OK' : 'Copy'}</span>
            </button>
          )}

          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] sm:text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold px-2 sm:px-2.5 py-1 rounded-lg border border-rose-200/70 dark:border-rose-800/60 transition-colors cursor-pointer"
            >
              Kosongkan
            </button>
          )}
        </div>
      </div>

      {/* List / Table Container */}
      <div id="scanList" className="w-full min-w-0 space-y-2">
        {items.length === 0 ? (
          <div
            id="emptyState"
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-8 text-center transition-colors shadow-2xs"
          >
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3">
              <PackageOpen className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              Belum Ada Antrean Scan
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Scan barcode fisik dengan alat scanner, gunakan kamera HP, atau ketik SKU produk secara manual di kolom input untuk mulai memindai.
            </p>

            {/* Quick Command Reference Cards */}
            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left max-w-xl mx-auto">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="font-mono text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                  #IN / #OUT / #SO
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Scan tag mode untuk ganti jenis transaksi otomatis.
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="font-mono text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                  #A001 / #SHOPEE
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Scan barcode rak untuk mengunci lokasi penyimpanan.
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
                  SKU Otomatis +1
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Scan SKU berulang otomatis menambah jumlah Qty.
                </div>
              </div>
            </div>
          </div>
        ) : effectiveView === 'table' ? (
          <div className="w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="w-full overflow-x-auto scrollbar-thin">
              <table className="w-full table-fixed text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="hidden sm:table-cell py-2.5 px-2.5 w-[6%] text-center">No</th>
                    <th className="py-2 sm:py-2.5 px-2.5 sm:px-3 w-auto sm:w-[22%]">
                      <span className="sm:hidden">Item / SKU</span>
                      <span className="hidden sm:inline">SKU</span>
                    </th>
                    <th className="hidden sm:table-cell py-2.5 px-3 w-[26%]">Nama Produk &amp; Size</th>
                    <th className="hidden sm:table-cell py-2.5 px-2.5 w-[13%]">Mode</th>
                    <th className="hidden sm:table-cell py-2.5 px-2.5 w-[13%]">Lokasi Rak</th>
                    <th className="py-2 sm:py-2.5 px-1.5 sm:px-2.5 w-[82px] sm:w-[13%] text-center">Qty</th>
                    <th className="py-2 sm:py-2.5 px-1.5 sm:px-2.5 w-[36px] sm:w-[7%] text-right">
                      <span className="sr-only sm:not-sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((item, index) => {
                    const cat = item.category || 'SO';
                    const loc = item.location;

                    const renderModeBadge = (compact = false) => (
                      <button
                        type="button"
                        onClick={() => {
                          if (!onUpdateCategory) return;
                          const nextCat: CategoryType = cat === 'IN' ? 'OUT' : cat === 'OUT' ? 'SO' : 'IN';
                          onUpdateCategory(item.id, nextCat);
                        }}
                        title="Klik untuk ubah mode (#IN / #OUT / #SO)"
                        className="cursor-pointer select-none inline-flex items-center active:scale-95 transition-transform"
                      >
                        {cat === 'IN' && (
                          <span
                            className={`bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-extrabold rounded-md uppercase inline-flex items-center gap-0.5 ${
                              compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5 gap-1'
                            }`}
                          >
                            <ArrowDownLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-500 shrink-0" /> #IN
                          </span>
                        )}
                        {cat === 'OUT' && (
                          <span
                            className={`bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-extrabold rounded-md uppercase inline-flex items-center gap-0.5 ${
                              compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5 gap-1'
                            }`}
                          >
                            <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-500 shrink-0" /> #OUT
                          </span>
                        )}
                        {cat === 'SO' && (
                          <span
                            className={`bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-extrabold rounded-md uppercase inline-flex items-center gap-0.5 ${
                              compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5 gap-1'
                            }`}
                          >
                            <CheckSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-500 shrink-0" /> #SO
                          </span>
                        )}
                        {cat === 'ANOMALI' && (
                          <span
                            className={`bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-extrabold rounded-md uppercase inline-flex items-center gap-0.5 ${
                              compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5 gap-1'
                            }`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500 shrink-0" /> #ANOMALI
                          </span>
                        )}
                      </button>
                    );

                    return (
                      <tr
                        key={item.id ? `scan-${item.id}` : `scan-idx-${index}`}
                        id={`scanned-item-${item.id}`}
                        className={`transition-colors ${
                          item.isInvalidSku
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="hidden sm:table-cell py-2.5 px-2.5 text-center font-mono text-[11px] font-bold text-slate-400">
                          {index + 1}
                        </td>

                        {/* SKU (+ Compact Product, Mode & Rack stacked on Mobile < 640px so table fits 100% phone width) */}
                        <td className="py-2 sm:py-2.5 px-2.5 sm:px-3 align-top sm:align-middle min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="sm:hidden font-mono text-[10px] font-bold text-slate-400 shrink-0">
                              {index + 1}.
                            </span>
                            <span
                              className={`font-mono font-bold text-[11px] sm:text-xs truncate ${
                                item.isInvalidSku
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                              title={item.text}
                            >
                              {item.text}
                            </span>
                            {!item.isInvalidSku ? (
                              <span title="Terdaftar di katalog" className="inline-flex shrink-0">
                                <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500" />
                              </span>
                            ) : (
                              <span title="SKU tidak terdaftar" className="inline-flex shrink-0">
                                <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500" />
                              </span>
                            )}
                          </div>

                          {/* Desktop timestamp under SKU */}
                          <div className="hidden sm:block text-[10px] font-mono text-slate-400 mt-0.5">{item.time}</div>

                          {/* Mobile stacked details (Name, Size, Mode, Rack, Time) */}
                          <div className="sm:hidden mt-0.5 space-y-1 min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                                {item.productName || (item.isInvalidSku ? 'SKU Tidak Terdaftar' : '-')}
                              </span>
                              {item.size && (
                                <span className="shrink-0 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1 py-0.2 rounded">
                                  {item.size}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center flex-wrap gap-1">
                              {renderModeBadge(true)}
                              {loc ? (
                                <span className="inline-flex items-center gap-0.5 font-mono font-bold text-[9px] bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md">
                                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                                  #{loc}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-slate-400 px-1">Rak: -</span>
                              )}
                              {item.time && (
                                <span className="text-[9px] font-mono text-slate-400 ml-auto">
                                  {item.time}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="hidden sm:table-cell py-2.5 px-3 min-w-0">
                          <div
                            className="font-semibold text-slate-800 dark:text-slate-200 truncate"
                            title={item.productName || ''}
                          >
                            {item.productName || (item.isInvalidSku ? 'SKU Tidak Terdaftar' : '-')}
                          </div>
                          {item.size && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1.5 py-0.2 rounded">
                              Size: {item.size}
                            </span>
                          )}
                        </td>

                        <td className="hidden sm:table-cell py-2.5 px-2.5">
                          {renderModeBadge(false)}
                        </td>

                        <td className="hidden sm:table-cell py-2.5 px-2.5">
                          {loc ? (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 truncate max-w-full">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">#{loc}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                          )}
                        </td>

                        <td className="py-2 sm:py-2.5 px-1 sm:px-2.5 text-center align-middle">
                          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {onUpdateQty && (
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.id, Math.max(1, (item.qty || 1) - 1))}
                                aria-label="Kurangi Qty"
                                className="w-6 h-7 sm:w-auto sm:h-auto sm:px-2 sm:py-0.5 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold cursor-pointer"
                              >
                                -
                              </button>
                            )}
                            <span className="text-[11px] sm:text-xs font-black font-mono text-slate-900 dark:text-white px-1.5 sm:px-2 py-0.5 min-w-[22px] text-center">
                              {item.qty || 1}
                            </span>
                            {onUpdateQty && (
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.id, (item.qty || 1) + 1)}
                                aria-label="Tambah Qty"
                                className="w-6 h-7 sm:w-auto sm:h-auto sm:px-2 sm:py-0.5 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold cursor-pointer"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-2 sm:py-2.5 px-1 sm:px-2.5 text-right align-middle">
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            title="Hapus baris ini"
                            aria-label="Hapus baris"
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          items.map((item, index) => {
            const cat = item.category || 'SO';
            const loc = item.location;

            return (
              <div
                key={item.id ? `scan-${item.id}` : `scan-idx-${index}`}
                id={`scanned-item-${item.id}`}
                className={`border rounded-xl p-2.5 sm:p-3 flex justify-between items-start gap-2 transition-all ${
                  item.isInvalidSku
                    ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-600 shrink-0">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <div
                      className={`font-bold font-mono text-xs sm:text-sm truncate ${
                        item.isInvalidSku ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {item.text}
                    </div>
                  </div>

                  {item.productName && (
                    <div className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 font-semibold truncate">
                      {item.productName}
                    </div>
                  )}

                  {item.isInvalidSku && (
                    <div className="text-xs text-rose-500 dark:text-rose-400 mt-0.5 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> SKU tidak terdaftar
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (!onUpdateCategory) return;
                        const nextCat: CategoryType = cat === 'IN' ? 'OUT' : cat === 'OUT' ? 'SO' : 'IN';
                        onUpdateCategory(item.id, nextCat);
                      }}
                      title="Klik untuk ubah mode (#IN / #OUT / #SO)"
                      className="cursor-pointer transition-transform active:scale-95 text-left select-none inline-flex items-center"
                    >
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
                    </button>

                    {loc ? (
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-500" /> #{loc}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono font-medium px-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 opacity-40" /> Rak: -
                      </span>
                    )}

                    {item.size && (
                      <span className="text-[10px] font-bold bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase">
                        Size: {item.size}
                      </span>
                    )}

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                      {onUpdateQty && (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.id, Math.max(1, (item.qty || 1) - 1))}
                          className="px-2.5 py-0.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold cursor-pointer"
                        >
                          -
                        </button>
                      )}
                      <span className="text-[11px] font-black font-mono text-slate-900 dark:text-white px-2 py-0.5">
                        x{item.qty || 1}
                      </span>
                      {onUpdateQty && (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.id, (item.qty || 1) + 1)}
                          className="px-2.5 py-0.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold cursor-pointer"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.time}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    title="Hapus baris ini"
                    className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
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

