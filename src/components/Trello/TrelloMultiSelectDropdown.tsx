import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Filter, Layers, CheckSquare, Square } from 'lucide-react';

export interface UpListOption {
  listName: string;
  upCode: string;
  count: number;
}

interface TrelloMultiSelectDropdownProps {
  options: UpListOption[];
  selectedListNames: string[];
  onChange: (selected: string[]) => void;
  totalAllItemsCount: number;
}

export const TrelloMultiSelectDropdown: React.FC<TrelloMultiSelectDropdownProps> = ({
  options,
  selectedListNames,
  onChange,
  totalAllItemsCount,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.listName.toLowerCase().includes(q) ||
        opt.upCode.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  // Total items in selected lists
  const selectedItemsCount = useMemo(() => {
    if (selectedListNames.length === 0) return totalAllItemsCount;
    const selectedSet = new Set(selectedListNames);
    return options
      .filter((opt) => selectedSet.has(opt.listName))
      .reduce((sum, opt) => sum + opt.count, 0);
  }, [options, selectedListNames, totalAllItemsCount]);

  const isAllSelected = selectedListNames.length === 0 || selectedListNames.length === options.length;

  const handleToggle = (listName: string) => {
    if (selectedListNames.includes(listName)) {
      onChange(selectedListNames.filter((name) => name !== listName));
    } else {
      onChange([...selectedListNames, listName]);
    }
  };

  const handleSelectAll = () => {
    onChange([]); // Empty array represents "All UPs"
  };

  const handleClearAll = () => {
    // If they want to start fresh or uncheck all, select none
    onChange(['__NONE__']);
  };

  const handleRemovePill = (listName: string) => {
    onChange(selectedListNames.filter((name) => name !== listName));
  };

  return (
    <div className="relative w-full space-y-2" ref={dropdownRef}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Main Dropdown Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full sm:w-auto min-w-[260px] sm:max-w-md px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 border cursor-pointer select-none shadow-2xs ${
            isOpen
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131d31] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="truncate text-left">
              {isAllSelected ? (
                <span>Semua Koleksi UP</span>
              ) : selectedListNames.includes('__NONE__') ? (
                <span className="text-slate-400">Pilih Koleksi UP...</span>
              ) : (
                <span>
                  {selectedListNames.length} Koleksi Terpilih{' '}
                  <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                    ({selectedItemsCount} Artikel)
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isAllSelected && !selectedListNames.includes('__NONE__') && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-indigo-600 text-white">
                {selectedListNames.length}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Quick Summary Counter */}
        <div className="text-[11px] text-slate-500 flex items-center gap-2 self-start sm:self-center">
          <span>
            Menampilkan: <b>{selectedItemsCount}</b> dari <b>{totalAllItemsCount}</b> artikel
          </span>
          {!isAllSelected && !selectedListNames.includes('__NONE__') && (
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
            >
              Reset ke Semua
            </button>
          )}
        </div>
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-40 w-full sm:w-[380px] bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Koleksi UP (misal: 279, 280, Sept)..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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

            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between text-[11px] font-bold px-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Pilih Semua UP ({options.length})
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer"
              >
                Kosongkan Pilihan
              </button>
            </div>
          </div>

          {/* Scrollable List of UPs */}
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Tidak ada koleksi UP yang cocok dengan "{searchQuery}"
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked =
                  isAllSelected || selectedListNames.includes(opt.listName);

                return (
                  <div
                    key={opt.listName}
                    onClick={() => {
                      if (isAllSelected) {
                        // When transitioning from "All" to specific, select only this one or invert
                        onChange([opt.listName]);
                      } else if (selectedListNames.includes('__NONE__')) {
                        onChange([opt.listName]);
                      } else {
                        handleToggle(opt.listName);
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition select-none ${
                      isChecked && !isAllSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-extrabold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                          isChecked
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs truncate">{opt.listName}</span>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        isChecked && !isAllSelected
                          ? 'bg-indigo-200/80 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-200'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {opt.count} Pcs
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Confirmation Footer */}
          <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {isAllSelected
                ? 'Semua UP aktif'
                : `${selectedListNames.filter((n) => n !== '__NONE__').length} UP aktif`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
            >
              Terapkan
            </button>
          </div>
        </div>
      )}

      {/* Selected Pills Bar */}
      {!isAllSelected && !selectedListNames.includes('__NONE__') && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] font-bold text-slate-500 shrink-0">Filter Aktif:</span>
          {selectedListNames.map((name) => {
            const opt = options.find((o) => o.listName === name);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
              >
                <span>{name}</span>
                {opt && (
                  <span className="text-[10px] font-mono px-1 rounded bg-indigo-200/60 dark:bg-indigo-900/60">
                    {opt.count}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemovePill(name)}
                  className="p-0.5 rounded-full hover:bg-indigo-200/60 dark:hover:bg-indigo-800 cursor-pointer"
                  title="Hapus filter ini"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline ml-1 cursor-pointer"
          >
            Hapus Semua Filter
          </button>
        </div>
      )}
    </div>
  );
};

