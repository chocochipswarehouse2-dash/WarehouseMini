import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MapPin } from 'lucide-react';
import type { InventoryRow, InventorySortOption } from './inventoryModel';

export const ROW_H = 60;
const HEADER_H = 38;
const OVERSCAN = 6;

const GRID =
  'grid grid-cols-[minmax(0,1fr)_52px_52px_56px] sm:grid-cols-[minmax(0,1fr)_56px_minmax(120px,190px)_72px_72px_76px] items-center gap-x-2 px-3';

// ----------------------------------------------------------------
// Number cells
// ----------------------------------------------------------------
const Dot = () => <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>;

const FisikCell: React.FC<{ v: number }> = ({ v }) =>
  v > 0 ? (
    <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">{v}</span>
  ) : v < 0 ? (
    <span className="font-mono text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 rounded border border-rose-200/80 dark:border-rose-900/60">
      {v}
    </span>
  ) : (
    <Dot />
  );

const DpCell: React.FC<{ v: number }> = ({ v }) =>
  v > 0 ? (
    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{v}</span>
  ) : v < 0 ? (
    <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">{v}</span>
  ) : (
    <Dot />
  );

export const SelisihCell: React.FC<{ v: number; hasData: boolean }> = ({ v, hasData }) => {
  if (v === 0) {
    return hasData ? (
      <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400" title="Fisik = DealPOS">
        =
      </span>
    ) : (
      <Dot />
    );
  }
  return v > 0 ? (
    <span
      className="font-mono text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-200/80 dark:border-amber-900/60"
      title="Fisik lebih banyak dari DealPOS"
    >
      +{v}
    </span>
  ) : (
    <span
      className="font-mono text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 rounded border border-rose-200/80 dark:border-rose-900/60"
      title="Fisik kurang dari DealPOS"
    >
      {v}
    </span>
  );
};

// ----------------------------------------------------------------
// Row
// ----------------------------------------------------------------
interface RowProps {
  row: InventoryRow;
  top: number;
  onOpen: (sku: string) => void;
  onLoc: (loc: string) => void;
}

const InventoryListRow = React.memo(function InventoryListRow({ row, top, onOpen, onLoc }: RowProps) {
  const locs = row.locs;
  const extra = locs.length - 2;
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onOpen(row.sku)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row.sku);
        }
      }}
      style={{ top, height: ROW_H }}
      className={`absolute inset-x-0 ${GRID} border-b border-slate-100 dark:border-slate-800/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#161F30] focus:outline-none focus-visible:bg-amber-50 dark:focus-visible:bg-amber-950/20 transition-colors`}
    >
      {/* Produk */}
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={row.produk}>
          {row.produk}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10.5px] font-bold text-slate-500 dark:text-slate-400 truncate">{row.sku}</span>
          <span className="sm:hidden shrink-0 px-1 rounded font-mono text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {row.size}
          </span>
          {locs.length > 0 && (
            <span
              className={`sm:hidden shrink-0 font-mono text-[9.5px] font-bold ${
                locs[0].neg ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {locs[0].name}
              {extra >= 0 ? ` +${extra + 1}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Size (desktop) */}
      <div className="hidden sm:flex justify-center">
        <span className="px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {row.size}
        </span>
      </div>

      {/* Lokasi rak (desktop) */}
      <div className="hidden sm:flex flex-wrap items-center gap-1 min-w-0 overflow-hidden max-h-[44px]">
        {locs.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">-</span>
        ) : (
          <>
            {locs.slice(0, 2).map((l) => (
              <button
                key={l.name}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoc(l.name);
                }}
                title={`Ekspor / cetak lokasi ${l.name} (${l.qty} pcs)`}
                className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold border inline-flex items-center gap-0.5 cursor-pointer transition-colors ${
                  l.neg
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : 'bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/60 text-slate-700 hover:text-amber-800 dark:text-slate-300 dark:hover:text-amber-300 border-slate-200 hover:border-amber-300 dark:border-slate-700'
                }`}
              >
                <MapPin className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                {l.name}
                {l.qty !== 0 && <span className="text-[8.5px] font-normal opacity-80">({l.qty})</span>}
              </button>
            ))}
            {extra > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/40">
                +{extra}
              </span>
            )}
          </>
        )}
      </div>

      {/* Angka */}
      <div className="flex justify-center">
        <FisikCell v={row.totalFisik} />
      </div>
      <div className="flex justify-center">
        <DpCell v={row.totalDp} />
      </div>
      <div className="flex justify-center">
        <SelisihCell v={row.selisih} hasData={row.totalFisik !== 0 || row.totalDp !== 0} />
      </div>
    </div>
  );
});

// ----------------------------------------------------------------
// Header
// ----------------------------------------------------------------
const SortHead: React.FC<{
  label: string;
  asc: InventorySortOption;
  desc: InventorySortOption;
  sort: InventorySortOption;
  onSort: (s: InventorySortOption) => void;
  className?: string;
}> = ({ label, asc, desc, sort, onSort, className = '' }) => (
  <button
    type="button"
    onClick={() => onSort(sort === desc ? asc : desc)}
    className={`flex items-center gap-1 font-extrabold uppercase hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer ${className}`}
  >
    <span>{label}</span>
    {sort === asc ? (
      <ArrowUp className="w-3 h-3 text-amber-500" />
    ) : sort === desc ? (
      <ArrowDown className="w-3 h-3 text-amber-500" />
    ) : (
      <ArrowUpDown className="w-3 h-3 opacity-40" />
    )}
  </button>
);

// ----------------------------------------------------------------
// Virtual list
// ----------------------------------------------------------------
interface InventoryListProps {
  rows: InventoryRow[];
  sort: InventorySortOption;
  onSort: (s: InventorySortOption) => void;
  onOpen: (sku: string) => void;
  onLoc: (loc: string) => void;
  /** When this value changes the list scrolls back to the top (new search / filter). */
  resetKey: string;
}

export const InventoryList: React.FC<InventoryListProps> = ({ rows, sort, onSort, onOpen, onLoc, resetKey }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(560);

  const onScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const bodyTop = Math.max(0, scrollTop - HEADER_H);
  const start = Math.max(0, Math.floor(bodyTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((bodyTop + viewportH) / ROW_H) + OVERSCAN);

  const visible: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const row = rows[i];
    visible.push(<InventoryListRow key={row.sku} row={row} top={i * ROW_H} onOpen={onOpen} onLoc={onLoc} />);
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="table"
      aria-rowcount={rows.length}
      className="h-[68vh] min-h-[320px] overflow-y-auto overflow-x-hidden border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E1420] relative"
    >
      <div
        role="row"
        style={{ height: HEADER_H }}
        className={`sticky top-0 z-10 ${GRID} bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10px] border-b border-slate-200 dark:border-slate-800`}
      >
        <SortHead label="Produk" asc="NAME_ASC" desc="NAME_DESC" sort={sort} onSort={onSort} />
        <div className="hidden sm:block text-center font-extrabold uppercase">Size</div>
        <div className="hidden sm:block font-extrabold uppercase">Lokasi Rak</div>
        <SortHead label="Fisik" asc="FISIK_ASC" desc="FISIK_DESC" sort={sort} onSort={onSort} className="justify-center" />
        <SortHead label="DP" asc="DP_ASC" desc="DP_DESC" sort={sort} onSort={onSort} className="justify-center" />
        <SortHead label="Selisih" asc="SELISIH_ASC" desc="SELISIH_DESC" sort={sort} onSort={onSort} className="justify-center" />
      </div>
      <div style={{ height: rows.length * ROW_H }} className="relative">
        {visible}
      </div>
    </div>
  );
};
