import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, MapPin, Package, Wrench, Boxes } from 'lucide-react';
import {
  type InventoryAreaRow,
  type InventorySortOption,
  groupRowsBySku,
} from './inventoryModel';

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
const QtyCell: React.FC<{ v: number; isBold?: boolean }> = ({ v, isBold = false }) => {
  if (v > 0) {
    return (
      <span className={`font-mono ${isBold ? 'text-xs font-black text-amber-600 dark:text-amber-400' : 'text-xs font-extrabold text-slate-900 dark:text-slate-100'}`}>
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
  return <span className="text-slate-300 dark:text-slate-600 text-xs font-mono">0</span>;
};

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
// Main Inventory List Component
// Side-by-Side (Desktop: Merged DP Table | Mobile: Grouped Cards)
// Strictly No Discrepancy (Selisih) Column
// ----------------------------------------------------------------
export interface InventoryListProps {
  rows: InventoryAreaRow[];
  sort: InventorySortOption;
  onSort: (s: InventorySortOption) => void;
  onOpen: (sku: string) => void;
  onLoc: (loc: string) => void;
  resetKey: string;
}

const CHUNK_SIZE = 60;

export const InventoryList: React.FC<InventoryListProps> = ({
  rows = [],
  sort,
  onSort,
  onOpen,
  onLoc,
  resetKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);

  // Group rows by SKU
  const skuGroups = useMemo(() => {
    return groupRowsBySku(rows);
  }, [rows]);

  // Reset scroll and chunk pagination on search or filter change
  useEffect(() => {
    setVisibleCount(CHUNK_SIZE);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  // Infinite scroll trigger when reaching bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      setVisibleCount((prev) => Math.min(prev + CHUNK_SIZE, skuGroups.length));
    }
  }, [skuGroups.length]);

  const displayedGroups = useMemo(() => {
    return skuGroups.slice(0, visibleCount);
  }, [skuGroups, visibleCount]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-[70vh] min-h-[400px] overflow-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E1420] relative shadow-xs"
    >
      {/* ========================================================
          1. DESKTOP VIEW: SIDE-BY-SIDE TABLE DENGAN CELL MERGED
          Sesuai Blueprint Blueprint Spreadsheet:
          Product | Variant | Code | Area | DP (Merged) | Fisik | Lokasi
          ======================================================== */}
      <div className="hidden md:block min-w-[880px]">
        <table className="w-full border-collapse text-left">
          {/* STICKY TABLE HEADER */}
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10.5px] border-b border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs">
            <tr>
              <th className="py-2.5 px-3 min-w-[190px]">
                <SortHead label="Product" asc="NAME_ASC" desc="NAME_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2 text-center w-[64px]">
                <SortHead label="Variant" asc="SIZE_ASC" desc="SIZE_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 min-w-[130px]">
                <SortHead label="Code" asc="SKU_ASC" desc="SKU_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-2.5 w-[115px]">
                <SortHead label="Area" asc="AREA_ASC" desc="AREA_DESC" sort={sort} onSort={onSort} />
              </th>
              <th className="py-2.5 px-3 text-center w-[90px] bg-blue-50/50 dark:bg-blue-950/20 border-x border-slate-200 dark:border-slate-800">
                <SortHead label="DP" asc="DP_ASC" desc="DP_DESC" sort={sort} onSort={onSort} className="justify-center text-blue-700 dark:text-blue-300" />
              </th>
              <th className="py-2.5 px-3 text-center w-[90px]">
                <SortHead label="Fisik" asc="FISIK_ASC" desc="FISIK_DESC" sort={sort} onSort={onSort} className="justify-center" />
              </th>
              <th className="py-2.5 px-3 min-w-[200px]">
                <span className="font-extrabold uppercase text-[10.5px] text-slate-500 dark:text-slate-400">
                  Lokasi Rak
                </span>
              </th>
            </tr>
          </thead>

          {/* TABLE BODY (Per SKU Group) */}
          {displayedGroups.map((group) => {
            const totalSkuRows = group.commercialAreas.length + group.perbaikanAreas.length;

            return (
              <tbody
                key={group.sku}
                className="border-b-2 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50/60 dark:hover:bg-[#131b2a]/60 transition-colors"
              >
                {/* 1. COMMERCIAL ROWS (Warehouse, Koli, Blok F, Transit, Aksesoris) */}
                {group.commercialAreas.map((row, idx) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                    {/* Kolom Product, Variant, Code SPAN across seluruh baris SKU */}
                    {idx === 0 && (
                      <>
                        <td
                          rowSpan={totalSkuRows}
                          className="py-2.5 px-3 align-top border-r border-slate-100 dark:border-slate-800/40 bg-white/40 dark:bg-transparent"
                        >
                          <div
                            className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug line-clamp-2"
                            title={group.produk}
                          >
                            {group.produk}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tight mt-0.5 truncate">
                            {group.kategori}
                          </div>
                        </td>

                        <td
                          rowSpan={totalSkuRows}
                          className="py-2.5 px-2 align-top text-center border-r border-slate-100 dark:border-slate-800/40 bg-white/40 dark:bg-transparent"
                        >
                          <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {group.size}
                          </span>
                        </td>

                        <td
                          rowSpan={totalSkuRows}
                          className="py-2.5 px-3 align-top border-r border-slate-100 dark:border-slate-800/40 bg-white/40 dark:bg-transparent"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 truncate"
                              title={group.sku}
                            >
                              {group.sku}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpen(group.sku)}
                              title="Audit kartu SKU & riwayat mutasi"
                              className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors cursor-pointer shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}

                    {/* Area Badge */}
                    <td className="py-2 px-2.5 align-middle">
                      <AreaBadge area={row.area} />
                    </td>

                    {/* DealPOS Commercial Cell (MERGED SPAN across all commercial rows) */}
                    {idx === 0 && (
                      <td
                        rowSpan={group.commercialAreas.length}
                        className="py-2 px-3 align-middle text-center font-mono text-sm font-black text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 border-x border-slate-200/80 dark:border-slate-800/80"
                        title={`Stok DealPOS Siap Jual (Marketplace / Gudang Utama): ${group.commercialDp} pcs`}
                      >
                        {group.commercialDp.toLocaleString('id-ID')}
                      </td>
                    )}

                    {/* Fisik Cell */}
                    <td className="py-2 px-3 align-middle text-center">
                      <QtyCell v={row.qty} isBold />
                    </td>

                    {/* Lokasi Rak Cell */}
                    <td className="py-2 px-3 align-middle">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {row.locations.length === 0 ? (
                          <span className="text-[11px] italic text-slate-300 dark:text-slate-600">-</span>
                        ) : (
                          row.locations.map((loc) => (
                            <button
                              key={loc.lokasi}
                              type="button"
                              onClick={() => onLoc(loc.lokasi)}
                              title={`Cetak / Ekspor Rak ${loc.lokasi} (${loc.qty} pcs)`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/60 text-slate-800 hover:text-amber-800 dark:text-slate-200 dark:hover:text-amber-300 border border-slate-200 hover:border-amber-400 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
                            >
                              <span>{loc.lokasi}</span>
                              <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                                ({loc.qty})
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {/* 2. PERBAIKAN ROWS (QC, Cuci, Permak, Defect) */}
                {group.perbaikanAreas.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 dark:border-slate-800/40 bg-rose-50/25 dark:bg-rose-950/15"
                  >
                    {/* Bila tidak ada commercial rows sama sekali, span Product/Variant/Code di baris perbaikan pertama */}
                    {group.commercialAreas.length === 0 && idx === 0 && (
                      <>
                        <td
                          rowSpan={group.perbaikanAreas.length}
                          className="py-2.5 px-3 align-top border-r border-slate-100 dark:border-slate-800/40"
                        >
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug">
                            {group.produk}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tight mt-0.5">
                            {group.kategori}
                          </div>
                        </td>

                        <td
                          rowSpan={group.perbaikanAreas.length}
                          className="py-2.5 px-2 align-top text-center border-r border-slate-100 dark:border-slate-800/40"
                        >
                          <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {group.size}
                          </span>
                        </td>

                        <td
                          rowSpan={group.perbaikanAreas.length}
                          className="py-2.5 px-3 align-top border-r border-slate-100 dark:border-slate-800/40"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                              {group.sku}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpen(group.sku)}
                              title="Audit kartu SKU"
                              className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors cursor-pointer shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}

                    {/* Area Badge */}
                    <td className="py-2 px-2.5 align-middle">
                      <AreaBadge area={row.area} />
                    </td>

                    {/* DealPOS Perbaikan Cell (MERGED SPAN across perbaikan rows) */}
                    {idx === 0 && (
                      <td
                        rowSpan={group.perbaikanAreas.length}
                        className="py-2 px-3 align-middle text-center font-mono text-sm font-black text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 border-x border-slate-200/80 dark:border-slate-800/80"
                        title={`Stok DealPOS QC / Permak / Defect: ${group.perbaikanDp} pcs`}
                      >
                        {group.perbaikanDp.toLocaleString('id-ID')}
                      </td>
                    )}

                    {/* Fisik Cell */}
                    <td className="py-2 px-3 align-middle text-center">
                      <QtyCell v={row.qty} isBold />
                    </td>

                    {/* Lokasi Rak Cell */}
                    <td className="py-2 px-3 align-middle">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {row.locations.length === 0 ? (
                          <span className="text-[11px] italic text-slate-300 dark:text-slate-600">-</span>
                        ) : (
                          row.locations.map((loc) => (
                            <button
                              key={loc.lokasi}
                              type="button"
                              onClick={() => onLoc(loc.lokasi)}
                              title={`Cetak / Ekspor Rak ${loc.lokasi} (${loc.qty} pcs)`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-rose-800 hover:text-rose-900 dark:text-rose-200 dark:hover:text-rose-300 border border-rose-200 hover:border-rose-400 dark:border-rose-800 transition-colors shadow-2xs cursor-pointer"
                            >
                              <span>{loc.lokasi}</span>
                              <span className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
                                ({loc.qty})
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* ========================================================
          2. MOBILE VIEW: KARTU INVENTORI HP (TOUCH-OPTIMIZED)
          Setiap SKU menjadi 1 kartu dengan blok perbandingan:
          - Blok Siap Jual (Marketplace)
          - Blok Area Perbaikan (QC, Cuci, Permak, Defect)
          ======================================================== */}
      <div className="block md:hidden p-2.5 space-y-3">
        {displayedGroups.map((group) => {
          return (
            <div
              key={group.sku}
              className="bg-white dark:bg-[#131b2a] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-2.5"
            >
              {/* Header Kartu: Nama Produk, Variant, SKU */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-tight">
                    {group.produk}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      {group.kategori}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="font-mono text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      {group.sku}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {group.size}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(group.sku)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-amber-500 transition-colors cursor-pointer"
                    title="Buka Kartu SKU"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Blok 1: Stok Siap Jual (Marketplace / Gudang Utama) */}
              <div className="rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-2.5 space-y-2">
                {/* Header Blok Siap Jual */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-800 dark:text-blue-300">
                    <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>SIAP JUAL (MARKETPLACE)</span>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100/80 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200 text-[11px] font-black font-mono">
                    <span className="text-[9px] font-bold opacity-75">DP:</span>
                    <span>{group.commercialDp.toLocaleString('id-ID')} pcs</span>
                  </div>
                </div>

                {/* Rincian Area Fisik Siap Jual */}
                <div className="space-y-1.5 pt-1">
                  {group.commercialAreas.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-1.5 bg-white/80 dark:bg-[#0E1420]/80 rounded-lg border border-blue-100 dark:border-blue-950/60"
                    >
                      <div className="flex items-center justify-between sm:justify-start gap-2">
                        <AreaBadge area={row.area} />
                        <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-100">
                          {row.qty.toLocaleString('id-ID')} pcs
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {row.locations.length === 0 ? (
                          <span className="text-[10px] italic text-slate-400">Tidak ada rak tercatat</span>
                        ) : (
                          row.locations.map((loc) => (
                            <button
                              key={loc.lokasi}
                              type="button"
                              onClick={() => onLoc(loc.lokasi)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                            >
                              <span>{loc.lokasi}</span>
                              <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                                ({loc.qty})
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blok 2: Area Perbaikan (Hanya tampil jika ada DP Perbaikan atau ada Fisik Perbaikan) */}
              {(group.perbaikanDp > 0 || group.perbaikanFisikTotal > 0 || group.perbaikanAreas.length > 0) && (
                <div className="rounded-xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 p-2.5 space-y-2">
                  {/* Header Blok Perbaikan */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-800 dark:text-rose-300">
                      <Wrench className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>AREA PERBAIKAN</span>
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100/80 dark:bg-rose-900/50 text-rose-900 dark:text-rose-200 text-[11px] font-black font-mono">
                      <span className="text-[9px] font-bold opacity-75">DP:</span>
                      <span>{group.perbaikanDp.toLocaleString('id-ID')} pcs</span>
                    </div>
                  </div>

                  {/* Rincian Area Fisik Perbaikan */}
                  <div className="space-y-1.5 pt-1">
                    {group.perbaikanAreas.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-1.5 bg-white/80 dark:bg-[#0E1420]/80 rounded-lg border border-rose-100 dark:border-rose-950/60"
                      >
                        <div className="flex items-center justify-between sm:justify-start gap-2">
                          <AreaBadge area={row.area} />
                          <span className="font-mono text-xs font-black text-rose-700 dark:text-rose-300">
                            {row.qty.toLocaleString('id-ID')} pcs
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {row.locations.length === 0 ? (
                            <span className="text-[10px] italic text-slate-400">Tidak ada rak tercatat</span>
                          ) : (
                            row.locations.map((loc) => (
                              <button
                                key={loc.lokasi}
                                type="button"
                                onClick={() => onLoc(loc.lokasi)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white hover:bg-rose-100 dark:bg-slate-800 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
                              >
                                <span>{loc.lokasi}</span>
                                <span className="text-rose-600 dark:text-rose-400 font-extrabold">
                                  ({loc.qty})
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER PAGINATION / SCROLL INDICATOR */}
      {displayedGroups.length < skuGroups.length && (
        <div className="p-3 text-center border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => Math.min(prev + CHUNK_SIZE * 2, skuGroups.length))}
            className="px-4 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl hover:bg-amber-100 transition-all cursor-pointer"
          >
            Muat Lebih Banyak ({displayedGroups.length} dari {skuGroups.length} SKU ditampilkan)
          </button>
        </div>
      )}
    </div>
  );
};

export default InventoryList;
