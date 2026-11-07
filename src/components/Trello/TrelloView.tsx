import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  RefreshCw,
  Printer,
  FileSpreadsheet,
  Search,
  Layers,
  Calendar,
  Grid,
  List,
  Kanban,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Download,
  Info,
  Boxes,
  ArrowRight,
  Eye,
  X,
  Loader2,
  Filter,
} from 'lucide-react';
import { TrelloUpItem, UserSession, ProductItem } from '../../types';
import {
  getLocalCachedTrelloItems,
  setLocalCachedTrelloItems,
  fetchTrelloUpFromSupabase,
  syncTrelloUpCatalog,
  DEFAULT_TRELLO_BOARD_ID,
} from '../../services/trelloSyncService';
import { TrelloPrintA4Modal } from './TrelloPrintA4Modal';
import { TrelloMultiSelectDropdown, UpListOption } from './TrelloMultiSelectDropdown';
import { TrelloImage } from './TrelloImage';

interface TrelloViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const TrelloView: React.FC<TrelloViewProps> = ({
  session,
  productCatalog = [],
  onNotify,
}) => {
  const [items, setItems] = useState<TrelloUpItem[]>(() => {
    const cached = getLocalCachedTrelloItems();
    return cached.items;
  });
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    const cached = getLocalCachedTrelloItems();
    return cached.lastSynced;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedListNames, setSelectedListNames] = useState<string[]>([]);
  const [hasInitializedDefaultUp, setHasInitializedDefaultUp] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [viewMode, setViewMode] = useState<'kanban' | 'card' | 'table'>('kanban');
  const [kanbanDensity, setKanbanDensity] = useState<'compact' | 'normal' | 'large'>('compact');
  const [sortMode, setSortMode] = useState<'trello' | 'newest'>('trello');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [activePhotoModal, setActivePhotoModal] = useState<TrelloUpItem | null>(null);

  // Ambil data dari Supabase / Trello
  const loadData = async (forceSync = false) => {
    setIsLoading(true);
    try {
      if (!forceSync) {
        // 1. Prioritaskan load dari Supabase
        const sbItems = await fetchTrelloUpFromSupabase();
        if (sbItems && sbItems.length > 0) {
          setItems(sbItems);
          setLocalCachedTrelloItems(sbItems);
          const syncTime = sbItems[0]?.last_synced_at || new Date().toISOString();
          setLastSynced(syncTime);
          setIsLoading(false);
          return;
        }
      }

      // 2. Jika Supabase masih kosong atau tombol Sync ditekan eksplisit
      const result = await syncTrelloUpCatalog();
      if (result.success) {
        if (result.items && result.items.length > 0) {
          setItems(result.items);
        } else {
          const reloaded = await fetchTrelloUpFromSupabase();
          setItems(reloaded);
        }
        setLastSynced(new Date().toISOString());
        if (forceSync) {
          onNotify?.(
            `Berhasil sinkronisasi ${result.totalItems} artikel dari Trello!${
              result.supabaseSaved ? ' (Tersimpan ke Supabase)' : ''
            }`,
            'success'
          );
        }
      } else if (forceSync) {
        onNotify?.(result.error || 'Gagal sinkronisasi dari Trello', 'error');
      }
    } catch (err: any) {
      console.error('Error load Trello data:', err);
      if (forceSync) {
        onNotify?.(err.message || 'Terjadi kesalahan saat memuat data', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Muat data saat halaman dibuka
  useEffect(() => {
    loadData(false);
  }, []);

  // Ambil daftar unik UP / List
  const upLists: UpListOption[] = useMemo(() => {
    const map = new Map<string, { listName: string; upCode: string; count: number; listPos?: number; listIndex?: number }>();
    items.forEach((item) => {
      const key = item.list_name || item.up_code;
      if (!map.has(key)) {
        const itemPos = item.list_pos ?? item.raw_json?.list_pos;
        const itemIdx = item.list_index ?? item.raw_json?.list_index;
        map.set(key, { listName: item.list_name, upCode: item.up_code, count: 0, listPos: itemPos, listIndex: itemIdx });
      }
      map.get(key)!.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (sortMode === 'trello') {
        // Mode 'trello': Prioritaskan persis posisi board Trello asli (Kiri ke Kanan)
        if (a.listPos !== undefined && b.listPos !== undefined && a.listPos !== b.listPos) {
          return a.listPos - b.listPos;
        }
        if (a.listIndex !== undefined && b.listIndex !== undefined && a.listIndex !== b.listIndex) {
          return a.listIndex - b.listIndex;
        }
        // Fallback kronologis alami (UP 279, UP 280, ... UP 343)
        const numA = parseInt(a.upCode.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.upCode.replace(/\D/g, '') || '0', 10);
        if (numA && numB && numA !== numB) return numA - numB;
        return a.listName.localeCompare(b.listName);
      } else {
        // Mode 'newest': UP nomor terbesar ditaruh paling depan
        const numA = parseInt(a.upCode.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.upCode.replace(/\D/g, '') || '0', 10);
        if (numA && numB && numA !== numB) return numB - numA;
        return a.listName.localeCompare(b.listName);
      }
    });
  }, [items, sortMode]);

  // Jumlah foto yang sudah tersimpan di Google Drive
  const gdriveSyncedCount = useMemo(() => {
    return items.filter((i) => !!i.gdrive_image_url).length;
  }, [items]);

  // Set default selectedListNames ke UP pertama yang aktif jika belum pernah diatur
  useEffect(() => {
    if (!hasInitializedDefaultUp && upLists.length > 0) {
      setSelectedListNames([upLists[0].listName]);
      setHasInitializedDefaultUp(true);
    }
  }, [upLists, hasInitializedDefaultUp]);

  // Filter items sesuai UP & pencarian
  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedListNames.length > 0 && !selectedListNames.includes('__NONE__')) {
      const set = new Set(selectedListNames);
      list = list.filter((i) => set.has(i.list_name) || set.has(i.up_code));
    } else if (selectedListNames.includes('__NONE__')) {
      return [];
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.item_code.toLowerCase().includes(q) ||
          i.item_name.toLowerCase().includes(q) ||
          i.card_name.toLowerCase().includes(q) ||
          i.up_code.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => a.sequence_order - b.sequence_order);
  }, [items, selectedListNames, deferredSearch]);

  // Kelompokkan items untuk Papan Kanban
  const kanbanColumns = useMemo(() => {
    const map = new Map<string, TrelloUpItem[]>();
    filteredItems.forEach((item) => {
      const key = item.list_name || item.up_code;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    return upLists
      .filter((up) => map.has(up.listName))
      .map((up) => {
        const listItems = map.get(up.listName) || [];
        return {
          listName: up.listName,
          upCode: up.upCode,
          items: listItems.sort((a, b) => a.sequence_order - b.sequence_order),
          publishDate: listItems[0]?.publish_date_raw || '',
        };
      });
  }, [filteredItems, upLists]);

  // Ekspor CSV
  const handleExportCsv = () => {
    if (filteredItems.length === 0) {
      onNotify?.('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'Urutan',
      'Koleksi UP',
      'Jadwal Publish',
      'Kode Barang',
      'Nama Barang',
      'Note/Qty',
      'URL Foto',
    ];
    const rows = filteredItems.map((item) => [
      item.sequence_order,
      item.up_code,
      item.publish_date_raw || '',
      item.item_code,
      `"${item.item_name.replace(/"/g, '""')}"`,
      item.qty_note || '',
      item.gdrive_image_url || item.trello_image_url || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const exportName =
      selectedListNames.length === 0
        ? 'Semua_UP'
        : selectedListNames.length === 1
        ? selectedListNames[0].replace(/[^a-zA-Z0-9_-]/g, '_')
        : `${selectedListNames.length}_Koleksi_UP`;
    link.setAttribute(
      'download',
      `Susunan_${exportName}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify?.('Data berhasil diekspor ke CSV!', 'success');
  };

  return (
    <div className="w-full max-w-full space-y-4 pb-20 animate-in fade-in duration-150">
      {/* 1. Header & Actions Toolbar */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  Koleksi Upload (Trello UP)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                  Live Database
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Susunan baju upload mingguan, integrasi foto Google Drive & cetak format A4
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Secondary Ghost: Cetak A4 */}
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer disabled:opacity-50"
              title="Cetak Susunan A4 Lengkap dengan Foto"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak A4</span>
            </button>

            {/* Secondary Ghost: Ekspor CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer disabled:opacity-50"
              title="Ekspor Data ke File CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>

            {/* Primary Solid: Sinkronkan Trello */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Tarik Perubahan Terbaru dari Trello"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Menyinkronkan...' : 'Sinkronkan Trello'}</span>
            </button>
          </div>
        </div>

        {/* Info Strip */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Total Koleksi: <b>{upLists.length} UP</b> • Total Artikel: <b>{items.length} Pcs</b>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <span>Foto Google Drive:</span>
              <span className="font-mono font-black">{gdriveSyncedCount} Pcs</span>
            </span>
            {lastSynced && (
              <span className="text-slate-400">
                (Update: {new Date(lastSynced).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
              </span>
            )}
          </div>
          <a
            href={`https://trello.com/b/${DEFAULT_TRELLO_BOARD_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
          >
            <span>Buka Board Trello Asli</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 2. UP Multi-Choice Dropsearch & Quick Shortcut Bar */}
      {isFilterOpen && upLists.length > 0 && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-3">
          {/* Main Dropsearch Multi-Select Dropdown */}
          <TrelloMultiSelectDropdown
            options={upLists}
            selectedListNames={selectedListNames}
            onChange={(selected) => setSelectedListNames(selected)}
            totalAllItemsCount={items.length}
          />

          {/* Quick 1-Click Shortcut Chips for Latest UPs */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1">
              Shortcut Cepat:
            </span>
            <button
              type="button"
              onClick={() => setSelectedListNames([])}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
                selectedListNames.length === 0
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>Semua UP</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {items.length}
              </span>
            </button>

            {upLists.slice(0, 8).map((up) => {
              const isOnlyThisSelected =
                selectedListNames.length === 1 && selectedListNames[0] === up.listName;
              return (
                <button
                  key={up.listName}
                  type="button"
                  onClick={() => setSelectedListNames([up.listName])}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
                    isOnlyThisSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{up.listName}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isOnlyThisSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    {up.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Search & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Bar & Filter Toggle */}
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode barang (25289) atau nama artikel..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Toggle Button */}
          {upLists.length > 0 && (
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border shrink-0 ${
                isFilterOpen
                  ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 font-black'
              }`}
              title={isFilterOpen ? 'Sembunyikan panel filter UP di atas' : 'Buka panel filter UP'}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isFilterOpen ? 'Sembunyikan Filter' : 'Filter UP'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
          {/* Density Switcher (Khusus Mode Kanban) */}
          {viewMode === 'kanban' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 pl-1.5 pr-0.5 hidden md:inline">
                Ukuran:
              </span>
              <button
                type="button"
                onClick={() => setKanbanDensity('compact')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  kanbanDensity === 'compact'
                    ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilkan 3 baris gambar utuh tanpa kepotong"
              >
                <span>3 Baris</span>
              </button>
              <button
                type="button"
                onClick={() => setKanbanDensity('normal')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  kanbanDensity === 'normal'
                    ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilkan ukuran sedang (~2 baris)"
              >
                <span>Sedang</span>
              </button>
              <button
                type="button"
                onClick={() => setKanbanDensity('large')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  kanbanDensity === 'large'
                    ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilkan foto kotak besar"
              >
                <span>Besar</span>
              </button>
            </div>
          )}

          {/* Urutan Kolom Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-slate-400 pl-1.5 pr-0.5 hidden lg:inline">
              Urutan:
            </span>
            <button
              type="button"
              onClick={() => setSortMode('trello')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                sortMode === 'trello'
                  ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Urutan sesuai posisi board Trello asli (Kiri ke Kanan)"
            >
              <span>Trello Asli</span>
            </button>
            <button
              type="button"
              onClick={() => setSortMode('newest')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                sortMode === 'newest'
                  ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Urutan dari nomor UP terbesar ke terkecil"
            >
              <span>UP Terbaru</span>
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Tampilan Papan Kanban (Mirip Trello Asli)"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Tampilan Grid Kartu Visual"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kartu</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Tampilan Tabel Rapi"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabel</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main Content Area */}
      {isLoading && items.length === 0 ? (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-white text-sm">
            Memuat Koleksi UP dari Database...
          </h3>
          <p className="text-xs text-slate-500">
            Sedang mengambil susunan artikel dan foto terbaru.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">
            Tidak ada data artikel yang cocok
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `Tidak ditemukan artikel dengan kata kunci "${searchQuery}". Coba kata kunci lain.`
              : 'Belum ada data untuk koleksi ini. Silakan klik "Sinkronkan Trello" di atas.'}
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Versi Papan Kanban (Mirip Trello Asli) */
        <div className="w-full overflow-x-auto pb-6 pt-1 no-scrollbar">
          <div className="flex items-start gap-3 sm:gap-3.5 min-w-max pb-2">
            {kanbanColumns.map((col) => (
              <div
                key={col.listName}
                className={`${
                  kanbanDensity === 'compact'
                    ? 'w-[200px] sm:w-[225px]'
                    : kanbanDensity === 'normal'
                    ? 'w-[250px] sm:w-[280px]'
                    : 'w-[290px] sm:w-[330px]'
                } shrink-0 bg-slate-100/90 dark:bg-[#0f172a] border border-slate-200/90 dark:border-slate-800 rounded-2xl flex flex-col h-[calc(100vh-210px)] min-h-[440px] max-h-[820px] shadow-xs transition-all`}
              >
                {/* Column Lane Header */}
                <div className="p-2 sm:p-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 rounded-t-2xl flex items-center justify-between gap-1.5 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3
                        className="font-black text-xs text-slate-900 dark:text-white truncate"
                        title={col.listName}
                      >
                        {col.listName}
                      </h3>
                      <span className="px-1.5 py-0.2 rounded-full font-mono font-black text-[9px] bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 shrink-0">
                        {col.items.length}
                      </span>
                    </div>
                    {col.publishDate && (
                      <div className="flex items-center gap-1 text-[9px] text-slate-500 font-semibold mt-0.5">
                        <Calendar className="w-2.5 h-2.5 text-slate-400" />
                        <span>Publish: {col.publishDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Column Action: Quick Print */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListNames([col.listName]);
                      setIsPrintModalOpen(true);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                    title={`Cetak Susunan A4 ${col.listName}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column Scrollable Cards Stack */}
                <div
                  className={`flex-1 overflow-y-auto ${
                    kanbanDensity === 'compact'
                      ? 'p-1.5 space-y-1'
                      : kanbanDensity === 'normal'
                      ? 'p-2 space-y-1.5'
                      : 'p-2.5 space-y-2'
                  } no-scrollbar`}
                >
                  {col.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setActivePhotoModal(item)}
                      className={`group bg-white dark:bg-[#151f33] border border-slate-200/90 dark:border-slate-750 rounded-xl ${
                        kanbanDensity === 'compact'
                          ? 'p-1.5'
                          : kanbanDensity === 'normal'
                          ? 'p-2'
                          : 'p-2.5'
                      } shadow-2xs hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500/60 transition-all cursor-pointer relative`}
                    >
                      {/* Card Cover Image */}
                      <div
                        className={`${
                          kanbanDensity === 'compact'
                            ? 'h-[74px] sm:h-[80px] mb-1'
                            : kanbanDensity === 'normal'
                            ? 'h-[130px] sm:h-[145px] mb-1.5'
                            : 'aspect-square mb-2'
                        } w-full rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 overflow-hidden relative shrink-0`}
                      >
                        <TrelloImage
                          src={item.gdrive_image_url || item.trello_image_url}
                          alt={item.card_name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          fallbackText="No Photo"
                        />
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white pointer-events-none">
                          <Eye className="w-3.5 h-3.5 drop-shadow-md" />
                        </div>
                      </div>

                      {/* Header Badge: Sequence & Code */}
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={`${
                              kanbanDensity === 'compact'
                                ? 'w-3.5 h-3.5 text-[8.5px]'
                                : 'w-4 h-4 text-[9px]'
                            } rounded bg-indigo-600 text-white font-mono font-black flex items-center justify-center shrink-0`}
                          >
                            #{item.sequence_order}
                          </span>
                          <span
                            className={`font-mono font-black ${
                              kanbanDensity === 'compact' ? 'text-[10.5px]' : 'text-xs'
                            } text-slate-900 dark:text-white truncate`}
                          >
                            {item.item_code}
                          </span>
                        </div>

                        {item.qty_note && (
                          <span className="px-1 py-0.2 rounded font-mono font-bold text-[8px] bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/40 dark:border-indigo-800/40 shrink-0">
                            {item.qty_note}
                          </span>
                        )}
                      </div>

                      {/* Item Name */}
                      <p
                        className={`${
                          kanbanDensity === 'compact'
                            ? 'text-[10px] truncate'
                            : 'text-xs line-clamp-2'
                        } font-semibold text-slate-700 dark:text-slate-200 leading-tight`}
                        title={item.item_name}
                      >
                        {item.item_name}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Column Lane Footer */}
                <div className="py-1 px-2 border-t border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 rounded-b-2xl text-[9px] font-bold text-slate-400 text-center shrink-0">
                  {col.items.length} Artikel
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : viewMode === 'card' ? (
        /* Versi Kartu Grid Visual */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all relative overflow-hidden"
            >
              {/* Top Badge: Sequence Order & UP Code */}
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-xs shrink-0">
                  #{item.sequence_order}
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                  {item.up_code}
                </span>
              </div>

              {/* Photo Area */}
              <div
                onClick={() => setActivePhotoModal(item)}
                className="aspect-square w-full rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 overflow-hidden relative cursor-pointer group-hover:opacity-95 transition"
              >
                <TrelloImage
                  src={item.gdrive_image_url || item.trello_image_url}
                  alt={item.card_name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  fallbackText="No Photo"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white pointer-events-none">
                  <Eye className="w-5 h-5 drop-shadow-md" />
                </div>
              </div>

              {/* Card Meta: Code, Name & Qty */}
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                    {item.item_code}
                  </span>
                  {item.qty_note && (
                    <span className="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40 shrink-0">
                      {item.qty_note}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate"
                  title={item.item_name}
                >
                  {item.item_name}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Versi Tabel Rapi */
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-black">
                <tr>
                  <th className="py-3 px-3 w-16 text-center">Urutan</th>
                  <th className="py-3 px-3 w-16 text-center">Foto</th>
                  <th className="py-3 px-4 w-32">Koleksi UP</th>
                  <th className="py-3 px-4 w-32">Kode Barang</th>
                  <th className="py-3 px-4">Nama Artikel</th>
                  <th className="py-3 px-3 w-20 text-center">Note/Qty</th>
                  <th className="py-3 px-3 w-24 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-center">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono font-black text-xs inline-flex items-center justify-center">
                        {item.sequence_order}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div
                        onClick={() => setActivePhotoModal(item)}
                        className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden mx-auto cursor-pointer"
                      >
                        <TrelloImage
                          src={item.gdrive_image_url || item.trello_image_url}
                          alt={item.card_name}
                          className="w-full h-full object-cover"
                          fallbackText="-"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                      {item.up_code}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-black text-slate-900 dark:text-white">
                      {item.item_code}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                      {item.item_name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                      {item.qty_note || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.trello_image_url && (
                        <a
                          href={item.trello_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg inline-flex"
                          title="Buka Foto Asli"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Modal Lightbox Foto Detail */}
      {activePhotoModal && (
        <div
          onClick={() => setActivePhotoModal(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
          >
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="min-w-0">
                <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                  #{activePhotoModal.sequence_order} • {activePhotoModal.item_code}
                </span>
                <p className="text-xs text-slate-500 truncate">{activePhotoModal.item_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
              <TrelloImage
                src={activePhotoModal.gdrive_image_url || activePhotoModal.trello_image_url}
                alt={activePhotoModal.card_name}
                className="w-full h-full object-contain"
                fallbackText="Foto tidak tersedia"
              />
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-semibold">{activePhotoModal.list_name}</span>
              {activePhotoModal.trello_image_url && (
                <a
                  href={activePhotoModal.trello_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <span>Buka Foto Asli</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Cetak Format A4 */}
      <TrelloPrintA4Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        selectedUp={
          selectedListNames.length === 0
            ? 'SEMUA KOLEKSI UP'
            : selectedListNames.length === 1
            ? selectedListNames[0]
            : `${selectedListNames.length} KOLEKSI TERPILIH`
        }
        items={filteredItems}
      />
    </div>
  );
};
