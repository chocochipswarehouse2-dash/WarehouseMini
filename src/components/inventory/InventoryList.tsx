import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Layers, MapPin, ExternalLink, Printer } from 'lucide-react';
import type { InventoryAreaRow, InventorySortOption } from './inventoryModel';

export const ROW_H = 48;
export const EXPANDED_EXTRA_H = 72;
const HEADER_H = 40;
const OVERSCAN = 6;

// Grid layout matching: Kategori | Nama Produk | Size | SKU | Area | Qty | Caret
const GRID =
  'grid grid-cols-[minmax(140px,1.4fr)_minmax(180px,2fr)_56px_minmax(120px,1.2fr)_110px_84px_36px] items-center gap-x-2.5 px-3';

// ----------------------------------------------------------------
// Helper: Area Color Badges
// ----------------------------------------------------------------
export const AreaBadge: React.FC<{ area: string }> = ({ area }) => {
  const a = (area || '').trim();
  let color = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  if (a === 'Warehouse') {
    color = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  } else if (a === 'Blok F') {
    color = 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
  } else if (a === 'Perbaikan') {
    color = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  } else if (a === 'Koli' || a === 'Kolian') {
    color = 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  } else if (a === 'Aksesoris') {
    color = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  } else if (a === 'Transit') {
    color = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }

  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10.5px] font-bold border tracking-wide uppercase ${color}`}>
      {a}
    </span>
  );
};

// ----------------------------------------------------------------
// SelisihCell for Detail Drawer
// ----------------------------------------------------------------
const Dot = () => <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>;

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
// Number / Qty Cell
// ----------------------------------------------------------------
const QtyCell: React.FC<{ v: number }> = ({ v }) => {
  if (v > 0) {
    return (
      <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
        {v.toLocaleString('id-ID')}
      </span>
    );
  }
  if (v < 0) {
    return (
      <span className="font-mono text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 rounded border border-rose-200/80 dark:border-rose-900/60">
        {v}
      </span>
    );
  }
  return <span className="text-slate-300 dark:text-slate-600 text-[10px] font-mono">0</span>;
};

// ----------------------------------------------------------------
// Row Component - Produk & Area dengan Detail Lokasi Rak saat diklik
// ----------------------------------------------------------------
interface AreaRowProps {
  row: InventoryAreaRow;
  top: number;
  height: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onOpen: (sku: string) => void;
  onLoc: (loc: string) => void;
}

const InventoryAreaRowItem = React.memo(function InventoryAreaRowItem({
  row,
  top,
  height,
  isExpanded,
  onToggle,
  onOpen,
  onLoc,
}: AreaRowProps) {
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onToggle(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(row.id);
        }
      }}
      style={{ top, height }}
      className={`absolute inset-x-0 border-b border-slate-100 dark:border-slate-800/60 cursor-pointer transition-colors ${
        isExpanded
          ? 'bg-amber-500/5 dark:bg-[#131b2a] z-10'
          : 'hover:bg-slate-50 dark:hover:bg-[#161F30]'
      }`}
    >
      {/* Baris Utama (Tabel Ringkas: Kategori, Nama Produk, Size, SKU, Area, Qty) */}
      <div style={{ height: ROW_H }} className={`${GRID}`}>
        {/* 1. Kategori */}
        <div className="min-w-0 pr-1">
          <span
            className="font-mono text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate block uppercase tracking-tight"
            title={row.kategori}
          >
            {row.kategori}
          </span>
        </div>

        {/* 2. Nama Produk */}
        <div className="min-w-0 pr-1">
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={row.produk}>
            {row.produk}
          </div>
        </div>

        {/* 3. Size */}
        <div className="flex justify-center">
          <span className="px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {row.size}
          </span>
        </div>

        {/* 4. SKU */}
        <div className="min-w-0">
          <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 truncate block" title={row.sku}>
            {row.sku}
          </span>
        </div>

        {/* 5. Area */}
        <div className="flex items-center">
          <AreaBadge area={row.area} />
        </div>

        {/* 6. Qty Fisik */}
        <div className="flex justify-center">
          <QtyCell v={row.qty} />
        </div>

        {/* 7. Caret / Expand Icon */}
        <div className="flex justify-center text-slate-400 hover:text-amber-500 transition-transform">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-amber-500 animate-in fade-in duration-100" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Detail Rincian Lokasi Rak (Tampil Saat Diklik) */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-4 py-2.5 bg-amber-50/60 dark:bg-[#101724] border-t border-amber-200/50 dark:border-slate-800 text-xs animate-in fade-in slide-in-from-top-1 duration-150 flex flex-wrap items-center justify-between gap-2 overflow-hidden"
          style={{ height: EXPANDED_EXTRA_H }}
        >
          {/* Titik Lokasi Rak di Area ini */}
          <div className="flex flex-wrap items-center gap-1.5 max-w-[80%] overflow-x-auto py-0.5">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 shrink-0 mr-1">
              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Titik Rak di {row.area}:</span>
            </span>

            {row.locations.length === 0 ? (
              <span className="text-[11px] italic text-slate-400">Belum ada lokasi rak tercatat</span>
            ) : (
              row.locations.map((loc) => (
                <button
                  key={loc.lokasi}
                  type="button"
                  onClick={() => onLoc(loc.lokasi)}
                  title={`Cetak / Ekspor Rak ${loc.lokasi} (${loc.qty} pcs)`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-bold bg-white hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/60 text-slate-800 hover:text-amber-800 dark:text-slate-200 dark:hover:text-amber-300 border border-slate-200 hover:border-amber-400 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0"
                >
                  <span>{loc.lokasi}</span>
                  <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                    ({loc.qty} pcs)
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpen(row.sku)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
              title="Lihat riwayat mutasi & audit stok lengkap untuk SKU ini"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Detail Kartu SKU</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ----------------------------------------------------------------
// Table Sort Header
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
    className={`flex items-center gap-1 font-extrabold uppercase hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer transition-colors ${className}`}
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
// Main Inventory List Component (Virtualized 60 FPS)
// ----------------------------------------------------------------
export interface InventoryListProps {
  rows: InventoryAreaRow[];
  sort: InventorySortOption;
  onSort: (s: InventorySortOption) => void;
  onOpen: (sku: string) => void;
  onLoc: (loc: string) => void;
  /** When this value changes the list scrolls back to the top (new search / filter). */
  resetKey: string;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  rows = [],
  sort,
  onSort,
  onOpen,
  onLoc,
  resetKey,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(560);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const itemCount = rows.length;

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

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
    setExpandedId(null);
  }, [resetKey]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const expandedIndex = useMemo(() => {
    if (!expandedId) return -1;
    return rows.findIndex((r) => r.id === expandedId);
  }, [expandedId, rows]);

  // Virtualizer windowing logic with dynamic height for the single expanded row
  const bodyTop = Math.max(0, scrollTop - HEADER_H);
  const start = Math.max(0, Math.floor(bodyTop / ROW_H) - OVERSCAN);
  const end = Math.min(itemCount, Math.ceil((bodyTop + viewportH) / ROW_H) + OVERSCAN);

  const totalHeight = itemCount * ROW_H + (expandedIndex >= 0 ? EXPANDED_EXTRA_H : 0);

  const visible: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const row = rows[i];
    if (!row) continue;
    const isExpanded = expandedIndex === i;

    // Dynamic top position taking expanded row into account
    let top = i * ROW_H;
    if (expandedIndex >= 0 && i > expandedIndex) {
      top += EXPANDED_EXTRA_H;
    }
    const height = isExpanded ? ROW_H + EXPANDED_EXTRA_H : ROW_H;

    visible.push(
      <InventoryAreaRowItem
        key={row.id}
        row={row}
        top={top}
        height={height}
        isExpanded={isExpanded}
        onToggle={handleToggleExpand}
        onOpen={onOpen}
        onLoc={onLoc}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="table"
      aria-rowcount={itemCount}
      className="h-[68vh] min-h-[360px] overflow-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E1420] relative shadow-xs"
    >
      <div className="min-w-[820px] relative">
        {/* Sticky Header */}
        <div
          role="row"
          style={{ height: HEADER_H }}
          className={`sticky top-0 z-20 ${GRID} bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10px] border-b border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs`}
        >
          <SortHead label="Kategori" asc="KATEGORI_ASC" desc="KATEGORI_DESC" sort={sort} onSort={onSort} />
          <SortHead label="Nama Produk" asc="NAME_ASC" desc="NAME_DESC" sort={sort} onSort={onSort} />
          <SortHead label="Size" asc="SIZE_ASC" desc="SIZE_DESC" sort={sort} onSort={onSort} className="justify-center" />
          <SortHead label="SKU" asc="SKU_ASC" desc="SKU_DESC" sort={sort} onSort={onSort} />
          <SortHead label="Area" asc="AREA_ASC" desc="AREA_DESC" sort={sort} onSort={onSort} />
          <SortHead label="Qty" asc="QTY_ASC" desc="QTY_DESC" sort={sort} onSort={onSort} className="justify-center" />
          <span className="text-center font-bold uppercase text-[9px] text-slate-400">Info</span>
        </div>

        {/* Virtualized Rows Container */}
        <div style={{ height: totalHeight }} className="relative">
          {visible}
        </div>
      </div>
    </div>
  );
};

export default InventoryList;
