import React, { useEffect } from 'react';
import { Printer, X, MapPin } from 'lucide-react';
import {
  KOMPARASI_5,
  KOMPARASI_LABEL,
  OFFLINE_COLS,
  ONLINE_COLS,
  STORE_COLS,
  isAreaOn,
  type AreaFilterType,
  type InventoryRow,
} from './inventoryModel';
import { SelisihCell } from './InventoryList';

interface DrawerProps {
  row: InventoryRow | null;
  areas: AreaFilterType[];
  onClose: () => void;
  onLoc: (loc: string) => void;
}

const Tile: React.FC<{ label: string; value: number; tone: 'amber' | 'slate' | 'auto' }> = ({ label, value, tone }) => {
  const color =
    tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'slate'
      ? 'text-slate-800 dark:text-slate-100'
      : value === 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : value > 0
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-rose-600 dark:text-rose-400';
  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`mt-0.5 text-xl font-black font-mono ${color}`}>
        {tone === 'auto' && value > 0 ? '+' : ''}
        {value.toLocaleString('id-ID')}
      </div>
    </div>
  );
};

const ChannelGroup: React.FC<{ title: string; codes: readonly string[]; values: Record<string, number>; accent: string }> = ({
  title,
  codes,
  values,
  accent,
}) => {
  let sum = 0;
  for (const c of codes) sum += values[c] || 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase">{title}</span>
        <span className={`text-[11px] font-black font-mono ${accent}`}>{sum.toLocaleString('id-ID')} pcs</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
        {codes.map((c) => {
          const v = values[c] || 0;
          return (
            <div
              key={c}
              className={`px-1.5 py-1 rounded-lg border text-center ${
                v === 0
                  ? 'border-slate-100 dark:border-slate-800 opacity-50'
                  : v < 0
                  ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E1420]'
              }`}
            >
              <div className="text-[9px] font-bold text-slate-400">{c}</div>
              <div
                className={`font-mono text-xs font-black ${
                  v < 0 ? 'text-rose-600 dark:text-rose-400' : v > 0 ? accent : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {v === 0 ? '·' : v}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const InventoryDetailDrawer: React.FC<DrawerProps> = ({ row, areas, onClose, onLoc }) => {
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;

  const showGudang = isAreaOn(areas, 'GUDANG');
  const showOffline = isAreaOn(areas, 'OFFLINE');
  const showStore = isAreaOn(areas, 'STORE');
  const showOnline = isAreaOn(areas, 'ONLINE');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail stok ${row.produk}`}
    >
      <div className="w-full sm:w-[480px] max-h-[90vh] sm:max-h-none sm:h-full overflow-y-auto bg-white dark:bg-[#161F30] rounded-t-3xl sm:rounded-none sm:rounded-l-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 bg-white/95 dark:bg-[#161F30]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-snug break-words">{row.produk}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">{row.sku}</span>
              <span className="px-1.5 rounded font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {row.size}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Fisik Gudang" value={row.totalFisik} tone="amber" />
            <Tile label="DealPOS" value={row.totalDp} tone="slate" />
            <Tile label="Selisih" value={row.selisih} tone="auto" />
          </div>

          {/* 5 Komparasi */}
          {showGudang && (
            <section>
              <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Fisik vs DealPOS per Area
              </h3>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="grid grid-cols-[1fr_56px_56px_64px] gap-x-2 px-3 py-1.5 bg-slate-100 dark:bg-[#121824] text-[10px] font-extrabold uppercase text-slate-500">
                  <span>Area</span>
                  <span className="text-center">Fisik</span>
                  <span className="text-center">DP</span>
                  <span className="text-center">Selisih</span>
                </div>
                {KOMPARASI_5.map((k) => {
                  const f = row.fisik[k] || 0;
                  const d = row.dp[k] || 0;
                  return (
                    <div
                      key={k}
                      className="grid grid-cols-[1fr_56px_56px_64px] gap-x-2 items-center px-3 py-2 border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-200">{KOMPARASI_LABEL[k]}</span>
                      <span className="text-center font-mono font-black text-amber-600 dark:text-amber-400">{f || '·'}</span>
                      <span className="text-center font-mono font-semibold text-slate-700 dark:text-slate-300">{d || '·'}</span>
                      <span className="flex justify-center">
                        <SelisihCell v={f - d} hasData={f !== 0 || d !== 0} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Lokasi rak */}
          <section>
            <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Lokasi Rak ({row.locs.length})
            </h3>
            {row.locs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Tidak ada stok fisik di rak manapun.</p>
            ) : (
              <div className="space-y-1.5">
                {row.locs.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 font-mono text-xs min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{l.name}</span>
                      <span
                        className={`px-1.5 rounded text-[10px] ${
                          l.neg
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold'
                            : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {l.qty} pcs
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLoc(l.name)}
                      className="shrink-0 text-[10px] px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer hover:border-amber-300"
                      title={`Ekspor / cetak lokasi ${l.name}`}
                    >
                      <Printer className="w-3 h-3" />
                      Cetak
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Channel DealPOS */}
          {(showOffline || showStore || showOnline) && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Stok DealPOS per Channel
              </h3>
              {showOffline && <ChannelGroup title="Offline" codes={OFFLINE_COLS} values={row.channels} accent="text-slate-800 dark:text-slate-100" />}
              {showStore && <ChannelGroup title="Store (15 Cabang)" codes={STORE_COLS} values={row.channels} accent="text-blue-600 dark:text-blue-400" />}
              {showOnline && <ChannelGroup title="Online" codes={ONLINE_COLS} values={row.channels} accent="text-emerald-600 dark:text-emerald-400" />}
            </section>
          )}

        </div>
      </div>
    </div>
  );
};
