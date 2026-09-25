import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Plus, CheckSquare, Square } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  secondaryLabel?: string;
  badge?: string | number;
  badgeColor?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: (SelectOption | string)[];
  value?: string | string[];
  onChange: (value: any) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  customPromptText?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  showSelectAll?: boolean;
  clearable?: boolean;
  maxTagsDisplay?: number;
  emptyText?: string;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options: rawOptions,
  value,
  onChange,
  multiple = false,
  placeholder = 'Pilih opsi...',
  searchPlaceholder = 'Ketik untuk mencari...',
  allowCustom = true,
  customPromptText = '+ Gunakan',
  disabled = false,
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  size = 'md',
  icon,
  showSelectAll = true,
  clearable = true,
  maxTagsDisplay = 2,
  emptyText = 'Tidak ada hasil yang cocok',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Normalize options to SelectOption objects
  const normalizedOptions: SelectOption[] = useMemo(() => {
    return rawOptions.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [rawOptions]);

  // Current selected array of values
  const selectedValues: string[] = useMemo(() => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }, [value]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedOptions;

    return normalizedOptions.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchVal = opt.value.toLowerCase().includes(q);
      const matchSec = opt.secondaryLabel ? opt.secondaryLabel.toLowerCase().includes(q) : false;
      return matchLabel || matchVal || matchSec;
    });
  }, [normalizedOptions, searchQuery]);

  // Check if search query is a custom new option not in the list
  const isCustomOptionAvailable = useMemo(() => {
    if (!allowCustom) return false;
    const q = searchQuery.trim();
    if (!q) return false;
    return !normalizedOptions.some(
      (opt) => opt.label.toLowerCase() === q.toLowerCase() || opt.value.toLowerCase() === q.toLowerCase()
    );
  }, [allowCustom, searchQuery, normalizedOptions]);

  // Auto focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setHighlightedIndex(0);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle item selection
  const handleSelectOption = (optValue: string) => {
    if (multiple) {
      const exists = selectedValues.includes(optValue);
      let nextValues: string[];
      if (exists) {
        nextValues = selectedValues.filter((v) => v !== optValue);
      } else {
        nextValues = [...selectedValues, optValue];
      }
      onChange(nextValues);
    } else {
      onChange(optValue);
      setIsOpen(false);
    }
  };

  const handleSelectAll = () => {
    if (!multiple) return;
    const allFilteredVals = filteredOptions.map((o) => o.value);
    const allSelected = allFilteredVals.every((v) => selectedValues.includes(v));

    if (allSelected) {
      // Unselect filtered
      const nextValues = selectedValues.filter((v) => !allFilteredVals.includes(v));
      onChange(nextValues);
    } else {
      // Select all filtered
      const nextValues = Array.from(new Set([...selectedValues, ...allFilteredVals]));
      onChange(nextValues);
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  const handleAddCustom = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    if (multiple) {
      if (!selectedValues.includes(trimmed)) {
        onChange([...selectedValues, trimmed]);
      }
      setSearchQuery('');
    } else {
      onChange(trimmed);
      setIsOpen(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalItems = filteredOptions.length + (isCustomOptionAvailable ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isCustomOptionAvailable && highlightedIndex === filteredOptions.length) {
        handleAddCustom();
      } else if (filteredOptions[highlightedIndex]) {
        handleSelectOption(filteredOptions[highlightedIndex].value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Badge color classes
  const getBadgeClass = (color?: string) => {
    switch (color) {
      case 'indigo':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      case 'emerald':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'amber':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'rose':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'blue':
      default:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
  };

  const sizeClasses = {
    sm: 'py-1.5 px-2.5 text-xs rounded-lg min-h-[34px]',
    md: 'py-2 px-3 text-xs sm:text-sm rounded-xl min-h-[40px]',
    lg: 'py-2.5 px-3.5 text-sm sm:text-base rounded-xl min-h-[46px]',
  }[size];

  // Selected labels representation
  const selectedOptionsList = normalizedOptions.filter((o) => selectedValues.includes(o.value));
  // Include custom values that might not be in normalizedOptions
  const customSelectedValues = selectedValues.filter(
    (val) => !normalizedOptions.some((o) => o.value === val)
  );

  return (
    <div ref={containerRef} className={`relative w-full text-left ${className}`} id={id}>
      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs transition-all cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''
        } ${isOpen ? 'ring-2 ring-blue-500/30 border-blue-500' : ''} ${sizeClasses} ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden flex-wrap">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}

          {/* Single Select Display */}
          {!multiple && (
            <div className="flex-1 min-w-0 truncate">
              {selectedValues.length > 0 ? (
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                  {normalizedOptions.find((o) => o.value === selectedValues[0])?.label || selectedValues[0]}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
              )}
            </div>
          )}

          {/* Multi Select Display (Badges) */}
          {multiple && (
            <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
              {selectedValues.length === 0 ? (
                <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
              ) : (
                <>
                  {selectedValues.slice(0, maxTagsDisplay).map((val) => {
                    const opt = normalizedOptions.find((o) => o.value === val);
                    const label = opt?.label || val;
                    return (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 max-w-[140px] truncate"
                      >
                        <span className="truncate">{label}</span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOption(val);
                          }}
                          className="hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-0.5 rounded"
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      </span>
                    );
                  })}

                  {selectedValues.length > maxTagsDisplay && (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      +{selectedValues.length - maxTagsDisplay} lainnya
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Action icons (Clear + Chevron) */}
        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {clearable && selectedValues.length > 0 && !disabled && (
            <span
              role="button"
              onClick={handleClearAll}
              className="p-1 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              title="Bersihkan Pilihan"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown Popup */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-100 ${dropdownClassName}`}
        >
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Multi-select toolbar */}
            {multiple && showSelectAll && (
              <div className="flex items-center justify-between pt-1.5 px-1 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {filteredOptions.length > 0 &&
                  filteredOptions.every((o) => selectedValues.includes(o.value)) ? (
                    <>
                      <Square className="w-3 h-3" />
                      <span>Batal Pilih Semua</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3 h-3" />
                      <span>Pilih Semua ({filteredOptions.length})</span>
                    </>
                  )}
                </button>

                <span className="text-slate-400 font-medium">
                  {selectedValues.length} terpilih
                </span>
              </div>
            )}
          </div>

          {/* Options List */}
          <div ref={optionsListRef} className="overflow-y-auto p-1.5 space-y-0.5 flex-1 text-xs">
            {/* Custom new option button if user typed non-existent item */}
            {isCustomOptionAvailable && (
              <button
                type="button"
                onClick={handleAddCustom}
                className={`w-full text-left p-2 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 flex items-center gap-2 hover:bg-blue-100 transition-colors font-bold cursor-pointer ${
                  highlightedIndex === filteredOptions.length ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                <span className="truncate">
                  {customPromptText} <strong>&ldquo;{searchQuery.trim()}&rdquo;</strong>
                </span>
              </button>
            )}

            {filteredOptions.length === 0 && !isCustomOptionAvailable ? (
              <div className="p-4 text-center text-slate-400 text-xs italic">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = selectedValues.includes(opt.value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => !opt.disabled && handleSelectOption(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer select-none ${
                      opt.disabled ? 'opacity-40 cursor-not-allowed' : ''
                    } ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-bold'
                        : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {multiple ? (
                        <div className="shrink-0 text-blue-600">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 fill-blue-600 text-white" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      ) : (
                        isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      )}

                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{opt.label}</div>
                        {opt.secondaryLabel && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {opt.secondaryLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {opt.badge !== undefined && (
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black border shrink-0 ${getBadgeClass(
                          opt.badgeColor
                        )}`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
