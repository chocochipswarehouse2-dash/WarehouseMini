import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Briefcase, Plus, X, UploadCloud, FileText, Image as ImageIcon, 
  CheckCircle2, ChevronLeft, ChevronRight, Clock, MapPin, User, Tag, 
  Trash2, Edit3, Search, Filter, Sun, Check, Sparkles, RefreshCw, 
  AlertTriangle, ArrowRight, Layers, Eye, CheckSquare, Square, MoreHorizontal, StickyNote,
  FolderPlus, CalendarDays, ListFilter, RotateCcw, ChevronDown, ChevronUp, Palette,
  PanelLeft, PanelLeftClose, LayoutGrid, Columns, CalendarRange, GripVertical
} from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';
import { 
  getAgendaEvents, saveAgendaEvent, deleteAgendaEvent, 
  getProjects, saveProject, deleteProject, getNotes, saveNote, deleteNote, reorderNotes,
  getSupabaseClient } from '../services/supabase';
import { fetchWmsSettings, saveWmsSettings } from '../services/settings';
import { AgendaCategoryModal } from './AgendaCategoryModal';
import { 
  syncEventToGoogleCalendar, 
  reconcileGoogleCalendarTwoWay, 
  LAST_GCAL_SYNC_KEY 
} from '../services/googleCalendarService';
import { 
  AgendaEvent, ProjectItem, AgendaCategory, ProjectStatus, 
  ProjectPriority, AgendaAttachment, ProjectTask, NoteItem, NoteColor, NoteChecklistItem } from '../types';

interface AgendaViewProps {
  session?: any;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  initialTab?: 'calendar' | 'project' | 'notes';
}

export const DEFAULT_CATEGORY_CONFIG: Record<string, { 
  id?: string;
  label: string; 
  badgeBg: string; 
  badgeText: string; 
  border: string; 
  cardBg: string; 
  dot: string;
  gradient: string;
}> = {
  meeting: {
    label: 'Meeting & Diskusi',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-950/50',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-300 dark:border-indigo-800',
    cardBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',
    dot: 'bg-indigo-500',
    gradient: 'from-indigo-500 to-purple-600'
  },
  operasional: {
    label: 'Operasional Gudang',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/50',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-500 to-teal-600'
  },
  project: {
    label: 'Project Milestone',
    badgeBg: 'bg-sky-100 dark:bg-sky-950/50',
    badgeText: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-800',
    cardBg: 'bg-sky-50/70 dark:bg-sky-950/30',
    dot: 'bg-sky-500',
    gradient: 'from-sky-500 to-blue-600'
  },
  supplier: {
    label: 'Supplier & Ekspedisi',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/50',
    badgeText: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
    cardBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    dot: 'bg-amber-500',
    gradient: 'from-amber-500 to-orange-600'
  },
  urgent: {
    label: 'Urgent & K3',
    badgeBg: 'bg-rose-100 dark:bg-rose-950/50',
    badgeText: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-300 dark:border-rose-800',
    cardBg: 'bg-rose-50/70 dark:bg-rose-950/30',
    dot: 'bg-rose-500',
    gradient: 'from-rose-500 to-pink-600'
  },
  umum: {
    label: 'Umum & Lainnya',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700',
    cardBg: 'bg-slate-50 dark:bg-slate-800/40',
    dot: 'bg-slate-500',
    gradient: 'from-slate-500 to-slate-700'
  }
};

const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; badge: string }> = {
  planned: { label: 'Direncanakan', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  review: { label: 'Review / Evaluasi', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  completed: { label: 'Selesai', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  on_hold: { label: 'Ditunda', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300' }
};

interface ProjectStatusTab {
  id: string;
  label: string;
  subLabel?: string;
  dot: string;
  activeText: string;
}

const PROJECT_STATUS_TABS: readonly ProjectStatusTab[] = [
  { id: 'all', label: 'Semua Status', dot: 'bg-primary-500', activeText: 'text-primary-600 dark:text-primary-400' },
  { id: 'planned', label: 'Mulai', subLabel: 'Planned', dot: 'bg-slate-400', activeText: 'text-slate-700 dark:text-slate-200' },
  { id: 'in_progress', label: 'Berjalan', subLabel: 'In Progress', dot: 'bg-blue-500', activeText: 'text-blue-600 dark:text-blue-400' },
  { id: 'review', label: 'Evaluasi', subLabel: 'Review', dot: 'bg-amber-500', activeText: 'text-amber-600 dark:text-amber-400' },
  { id: 'completed', label: 'Selesai', subLabel: 'Completed', dot: 'bg-emerald-500', activeText: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'on_hold', label: 'Ditunda', subLabel: 'On Hold', dot: 'bg-purple-500', activeText: 'text-purple-600 dark:text-purple-400' },
];

const PROJECT_PRIORITY_CONFIG: Record<ProjectPriority, { label: string; color: string }> = {
  low: { label: 'Rendah', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  medium: { label: 'Sedang', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
  high: { label: 'Tinggi', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
  urgent: { label: 'Urgent', color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' }
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00
const DAYS_NAME = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_FULL_NAME = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const GOOGLE_CALENDAR_COLORS: Record<string, {
  barBg: string;
  dot: string;
  text: string;
  hex: string;
  label: string;
}> = {
  meeting: {
    barBg: 'bg-[#8430ce] hover:bg-[#7226b5] text-white',
    dot: 'bg-[#8430ce]',
    text: 'text-[#8430ce]',
    hex: '#8430ce',
    label: 'Meeting & Diskusi'
  },
  operasional: {
    barBg: 'bg-[#0b8043] hover:bg-[#096e39] text-white',
    dot: 'bg-[#0b8043]',
    text: 'text-[#0b8043]',
    hex: '#0b8043',
    label: 'Operasional Gudang'
  },
  project: {
    barBg: 'bg-[#039be5] hover:bg-[#0288d1] text-white',
    dot: 'bg-[#039be5]',
    text: 'text-[#039be5]',
    hex: '#039be5',
    label: 'Project Milestone'
  },
  supplier: {
    barBg: 'bg-[#f4511e] hover:bg-[#e04716] text-white',
    dot: 'bg-[#f4511e]',
    text: 'text-[#f4511e]',
    hex: '#f4511e',
    label: 'Supplier & Ekspedisi'
  },
  urgent: {
    barBg: 'bg-[#d50000] hover:bg-[#b70000] text-white',
    dot: 'bg-[#d50000]',
    text: 'text-[#d50000]',
    hex: '#d50000',
    label: 'Urgent & K3'
  },
  umum: {
    barBg: 'bg-[#3f51b5] hover:bg-[#303f9f] text-white',
    dot: 'bg-[#3f51b5]',
    text: 'text-[#3f51b5]',
    hex: '#3f51b5',
    label: 'Umum & Lainnya'
  }
};

export const DAYS_HEADER_MONDAY_START = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'];
export const DAYS_INITIALS_MONDAY_START = ['S', 'S', 'R', 'K', 'J', 'S', 'M'];

export interface WeekEventSegment {
  event: AgendaEvent;
  startCol: number; // 1..7 (1-based for CSS Grid)
  endCol: number; // 1..7
  span: number;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
  isAllDayOrMultiDay: boolean;
  slot: number; // 0, 1, 2...
}

export const computeWeekEventSegments = (
  allEvents: AgendaEvent[],
  weekDays: { date: Date; currentMonth: boolean; dateStr: string }[],
  weekStartStr: string,
  weekEndStr: string
): {
  segments: WeekEventSegment[];
  maxSlot: number;
  overflowByDay: number[];
} => {
  // 1. Filter events intersecting this week with normalized start & end
  const intersectingEvents = allEvents.filter(evt => {
    const rawStart = evt.start_date;
    const rawEnd = evt.end_date || evt.start_date;
    const start = rawStart <= rawEnd ? rawStart : rawEnd;
    const end = rawStart <= rawEnd ? rawEnd : rawStart;
    return start <= weekEndStr && end >= weekStartStr;
  });

  // 2. Map each event to a preliminary segment
  const rawSegments = intersectingEvents.map(evt => {
    const rawStart = evt.start_date;
    const rawEnd = evt.end_date || evt.start_date;
    const effectiveStart = rawStart <= rawEnd ? rawStart : rawEnd;
    const effectiveEnd = rawStart <= rawEnd ? rawEnd : rawStart;

    let startCol = 1;
    let continuesFromPrev = false;
    if (effectiveStart < weekStartStr) {
      startCol = 1;
      continuesFromPrev = true;
    } else {
      const idx = weekDays.findIndex(d => d.dateStr === effectiveStart);
      startCol = idx !== -1 ? idx + 1 : 1;
      continuesFromPrev = false;
    }

    let endCol = 7;
    let continuesToNext = false;
    if (effectiveEnd > weekEndStr) {
      endCol = 7;
      continuesToNext = true;
    } else {
      const idx = weekDays.findIndex(d => d.dateStr === effectiveEnd);
      endCol = idx !== -1 ? idx + 1 : 7;
      continuesToNext = false;
    }

    if (startCol > endCol) startCol = endCol;
    const span = Math.max(1, endCol - startCol + 1);
    const isAllDayOrMultiDay = evt.is_all_day || Boolean(evt.end_date && evt.end_date !== evt.start_date);

    return {
      event: evt,
      startCol,
      endCol,
      span,
      continuesFromPrev,
      continuesToNext,
      isAllDayOrMultiDay,
      slot: 0
    };
  });

  // 3. Sort segments:
  // - Multi-day / all-day events first
  // - Longer span first
  // - Earlier startCol first
  // - Alphabetical fallback
  rawSegments.sort((a, b) => {
    if (a.isAllDayOrMultiDay !== b.isAllDayOrMultiDay) {
      return a.isAllDayOrMultiDay ? -1 : 1;
    }
    if (b.span !== a.span) {
      return b.span - a.span;
    }
    if (a.startCol !== b.startCol) {
      return a.startCol - b.startCol;
    }
    return (a.event.title || '').localeCompare(b.event.title || '');
  });

  // 4. Assign non-overlapping slots
  const slotOccupied: boolean[][] = [];
  const segments: WeekEventSegment[] = [];
  let maxSlot = 0;

  for (const seg of rawSegments) {
    let slot = 0;
    while (true) {
      if (!slotOccupied[slot]) {
        slotOccupied[slot] = [false, false, false, false, false, false, false];
      }
      let collision = false;
      for (let c = seg.startCol - 1; c <= seg.endCol - 1; c++) {
        if (slotOccupied[slot][c]) {
          collision = true;
          break;
        }
      }
      if (!collision) break;
      slot++;
    }

    for (let c = seg.startCol - 1; c <= seg.endCol - 1; c++) {
      slotOccupied[slot][c] = true;
    }

    if (slot > maxSlot) maxSlot = slot;
    segments.push({ ...seg, slot });
  }

  // 5. Overflow count per day for slots >= 3
  const MAX_VISIBLE_SLOTS = 3;
  const overflowByDay: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (let c = 0; c < 7; c++) {
    const hiddenCount = segments.filter(
      s => s.slot >= MAX_VISIBLE_SLOTS && s.startCol <= c + 1 && s.endCol >= c + 1
    ).length;
    overflowByDay[c] = hiddenCount;
  }

  return { segments, maxSlot, overflowByDay };
};

export interface AgendaColorOption {
  id: string;
  label: string;
  hex: string;
  barBg: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  cardBg: string;
}

export const AGENDA_COLOR_OPTIONS: AgendaColorOption[] = [
  { id: 'blue', label: 'Biru Google', hex: '#1a73e8', barBg: 'bg-[#1a73e8] hover:bg-[#1557b0] text-white', dot: 'bg-[#1a73e8]', badgeBg: 'bg-blue-100 dark:bg-blue-950/60', badgeText: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400 dark:border-blue-700', cardBg: 'bg-blue-50/70 dark:bg-blue-950/30' },
  { id: 'indigo', label: 'Ungu Indigo', hex: '#8430ce', barBg: 'bg-[#8430ce] hover:bg-[#7226b5] text-white', dot: 'bg-[#8430ce]', badgeBg: 'bg-indigo-100 dark:bg-indigo-950/60', badgeText: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-400 dark:border-indigo-700', cardBg: 'bg-indigo-50/70 dark:bg-indigo-950/30' },
  { id: 'emerald', label: 'Hijau Emerald', hex: '#0b8043', barBg: 'bg-[#0b8043] hover:bg-[#096e39] text-white', dot: 'bg-[#0b8043]', badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60', badgeText: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-400 dark:border-emerald-700', cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30' },
  { id: 'sky', label: 'Biru Langit', hex: '#039be5', barBg: 'bg-[#039be5] hover:bg-[#0288d1] text-white', dot: 'bg-[#039be5]', badgeBg: 'bg-sky-100 dark:bg-sky-950/60', badgeText: 'text-sky-700 dark:text-sky-300', border: 'border-sky-400 dark:border-sky-700', cardBg: 'bg-sky-50/70 dark:bg-sky-950/30' },
  { id: 'amber', label: 'Kuning Amber', hex: '#f59e0b', barBg: 'bg-[#f59e0b] hover:bg-[#d97706] text-white', dot: 'bg-[#f59e0b]', badgeBg: 'bg-amber-100 dark:bg-amber-950/60', badgeText: 'text-amber-800 dark:text-amber-300', border: 'border-amber-400 dark:border-amber-700', cardBg: 'bg-amber-50/70 dark:bg-amber-950/30' },
  { id: 'orange', label: 'Oranye Sunset', hex: '#f4511e', barBg: 'bg-[#f4511e] hover:bg-[#e04716] text-white', dot: 'bg-[#f4511e]', badgeBg: 'bg-orange-100 dark:bg-orange-950/60', badgeText: 'text-orange-700 dark:text-orange-300', border: 'border-orange-400 dark:border-orange-700', cardBg: 'bg-orange-50/70 dark:bg-orange-950/30' },
  { id: 'rose', label: 'Merah Crimson', hex: '#d50000', barBg: 'bg-[#d50000] hover:bg-[#b70000] text-white', dot: 'bg-[#d50000]', badgeBg: 'bg-rose-100 dark:bg-rose-950/60', badgeText: 'text-rose-700 dark:text-rose-300', border: 'border-rose-400 dark:border-rose-700', cardBg: 'bg-rose-50/70 dark:bg-rose-950/30' },
  { id: 'teal', label: 'Hijau Tosca', hex: '#00897b', barBg: 'bg-[#00897b] hover:bg-[#00796b] text-white', dot: 'bg-[#00897b]', badgeBg: 'bg-teal-100 dark:bg-teal-950/60', badgeText: 'text-teal-700 dark:text-teal-300', border: 'border-teal-400 dark:border-teal-700', cardBg: 'bg-teal-50/70 dark:bg-teal-950/30' },
  { id: 'purple', label: 'Ungu Magenta', hex: '#7c3aed', barBg: 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white', dot: 'bg-[#7c3aed]', badgeBg: 'bg-purple-100 dark:bg-purple-950/60', badgeText: 'text-purple-700 dark:text-purple-300', border: 'border-purple-400 dark:border-purple-700', cardBg: 'bg-purple-50/70 dark:bg-purple-950/30' },
  { id: 'pink', label: 'Merah Muda', hex: '#d81b60', barBg: 'bg-[#d81b60] hover:bg-[#c2185b] text-white', dot: 'bg-[#d81b60]', badgeBg: 'bg-pink-100 dark:bg-pink-950/60', badgeText: 'text-pink-700 dark:text-pink-300', border: 'border-pink-400 dark:border-pink-700', cardBg: 'bg-pink-50/70 dark:bg-pink-950/30' },
  { id: 'slate', label: 'Abu-abu Netral', hex: '#546e7a', barBg: 'bg-[#546e7a] hover:bg-[#455a64] text-white', dot: 'bg-[#546e7a]', badgeBg: 'bg-slate-200 dark:bg-slate-800', badgeText: 'text-slate-800 dark:text-slate-200', border: 'border-slate-400 dark:border-slate-700', cardBg: 'bg-slate-50 dark:bg-slate-800/40' },
];

export const getCategoryBarColor = (category: string, config?: Record<string, any>): string => {
  const cfg = config?.[category];
  if (cfg) {
    if (cfg.barBg) return cfg.barBg;
    if (cfg.dot) {
      if (cfg.dot.includes('indigo') || cfg.dot.includes('purple')) return 'bg-[#8430ce] hover:bg-[#7226b5] text-white';
      if (cfg.dot.includes('emerald') || cfg.dot.includes('teal')) return 'bg-[#0b8043] hover:bg-[#096e39] text-white';
      if (cfg.dot.includes('sky') || cfg.dot.includes('blue')) return 'bg-[#039be5] hover:bg-[#0288d1] text-white';
      if (cfg.dot.includes('amber') || cfg.dot.includes('orange')) return 'bg-[#f59e0b] hover:bg-[#d97706] text-white';
      if (cfg.dot.includes('rose') || cfg.dot.includes('red')) return 'bg-[#d50000] hover:bg-[#b70000] text-white';
      if (cfg.dot.includes('slate')) return 'bg-[#546e7a] hover:bg-[#455a64] text-white';
    }
    if (cfg.gradient) {
      if (cfg.gradient.includes('purple') || cfg.gradient.includes('indigo')) return 'bg-[#8430ce] hover:bg-[#7226b5] text-white';
      if (cfg.gradient.includes('emerald') || cfg.gradient.includes('teal')) return 'bg-[#0b8043] hover:bg-[#096e39] text-white';
      if (cfg.gradient.includes('sky') || cfg.gradient.includes('blue')) return 'bg-[#039be5] hover:bg-[#0288d1] text-white';
      if (cfg.gradient.includes('amber') || cfg.gradient.includes('orange')) return 'bg-[#f4511e] hover:bg-[#e04716] text-white';
      if (cfg.gradient.includes('rose') || cfg.gradient.includes('pink') || cfg.gradient.includes('red')) return 'bg-[#d50000] hover:bg-[#b70000] text-white';
    }
  }
  if (GOOGLE_CALENDAR_COLORS[category]) {
    return GOOGLE_CALENDAR_COLORS[category].barBg;
  }
  return 'bg-[#039be5] hover:bg-[#0288d1] text-white';
};

export const getCategoryDotColor = (category: string, config?: Record<string, any>): string => {
  if (config?.[category]?.dot) {
    return config[category].dot;
  }
  if (GOOGLE_CALENDAR_COLORS[category]) {
    return GOOGLE_CALENDAR_COLORS[category].dot;
  }
  return 'bg-[#039be5]';
};

export const resolveEventColorStyle = (
  event: Partial<AgendaEvent>,
  categoryConfig?: Record<string, any>
): {
  barBgClass: string;
  barBgStyle?: React.CSSProperties;
  badgeBg: string;
  badgeText: string;
  border: string;
  cardBg: string;
  dot: string;
  hex: string;
  label: string;
} => {
  // 1. Cek warna spesifik agenda (event.color)
  if (event.color) {
    const preset = AGENDA_COLOR_OPTIONS.find(c => c.id === event.color);
    if (preset) {
      return {
        barBgClass: preset.barBg,
        badgeBg: preset.badgeBg,
        badgeText: preset.badgeText,
        border: preset.border,
        cardBg: preset.cardBg,
        dot: preset.dot,
        hex: preset.hex,
        label: preset.label
      };
    }
    // Jika format hex custom (misal #10b981)
    if (event.color.startsWith('#') || event.color.startsWith('rgb')) {
      return {
        barBgClass: 'text-white hover:brightness-110 shadow-xs',
        barBgStyle: { backgroundColor: event.color },
        badgeBg: 'bg-slate-100 dark:bg-slate-800',
        badgeText: 'text-slate-800 dark:text-slate-100',
        border: 'border-slate-300 dark:border-slate-700',
        cardBg: 'bg-white dark:bg-[#1a2332]',
        dot: 'bg-primary-500',
        hex: event.color,
        label: 'Warna Khusus'
      };
    }
  }

  // 2. Cek kategori dari config kustom pengguna
  const catKey = event.category || 'umum';
  const cfg = categoryConfig?.[catKey];
  if (cfg) {
    const barBg = getCategoryBarColor(catKey, categoryConfig);
    return {
      barBgClass: barBg,
      badgeBg: cfg.badgeBg || 'bg-slate-100 dark:bg-slate-800',
      badgeText: cfg.badgeText || 'text-slate-700 dark:text-slate-300',
      border: cfg.border || 'border-slate-300 dark:border-slate-700',
      cardBg: cfg.cardBg || 'bg-white dark:bg-[#1a2332]',
      dot: cfg.dot || 'bg-slate-500',
      hex: cfg.hex || '#039be5',
      label: cfg.label || catKey
    };
  }

  // 3. Fallback ke Google Calendar default colors
  if (GOOGLE_CALENDAR_COLORS[catKey]) {
    const gc = GOOGLE_CALENDAR_COLORS[catKey];
    return {
      barBgClass: gc.barBg,
      badgeBg: 'bg-slate-100 dark:bg-slate-800',
      badgeText: gc.text,
      border: 'border-slate-300 dark:border-slate-700',
      cardBg: 'bg-white dark:bg-[#1a2332]',
      dot: gc.dot,
      hex: gc.hex,
      label: gc.label
    };
  }

  // 4. Default fallback
  return {
    barBgClass: 'bg-[#039be5] hover:bg-[#0288d1] text-white',
    badgeBg: 'bg-sky-100 dark:bg-sky-950/60',
    badgeText: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-800',
    cardBg: 'bg-sky-50/70 dark:bg-sky-950/30',
    dot: 'bg-[#039be5]',
    hex: '#039be5',
    label: catKey
  };
};


export const AgendaView: React.FC<AgendaViewProps> = ({ session, onShowToast, initialTab }) => {
  // Main Tab
  const [activeTab, setActiveTab] = useState<'calendar' | 'project' | 'notes'>(initialTab || 'calendar');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Calendar View Mode: week (default desktop), month, day, agenda (default mobile)
  const [calendarView, setCalendarView] = useState<'week' | 'month' | 'day' | 'agenda'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Data state
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGcalSyncing, setIsGcalSyncing] = useState(false);
  const [lastGcalSync, setLastGcalSync] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(LAST_GCAL_SYNC_KEY);
      if (!raw) return null;
      const d = new Date(raw);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  });

  // Filters & Search
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({
    meeting: true,
    operasional: true,
    project: true,
    supplier: true,
    urgent: true,
    umum: true
  });
    const [searchQuery, setSearchQuery] = useState('');
  
  const [categoryConfig, setCategoryConfig] = useState<Record<string, any>>(DEFAULT_CATEGORY_CONFIG);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    const applyLoadedCategories = (rawCats: any) => {
      if (
        rawCats &&
        typeof rawCats === 'object' &&
        !Array.isArray(rawCats) &&
        Object.keys(rawCats).length > 0
      ) {
        const mergedConfig = {
          ...DEFAULT_CATEGORY_CONFIG,
          ...rawCats,
        };
        setCategoryConfig(mergedConfig);

        setSelectedCategories(prev => {
          const nextSelected: Record<string, boolean> = { ...prev };
          Object.keys(mergedConfig).forEach(k => {
            if (nextSelected[k] === undefined) {
              nextSelected[k] = true;
            }
          });
          return nextSelected;
        });
      }
    };

    fetchWmsSettings().then(settings => {
      if (settings?.agenda_categories) {
        applyLoadedCategories(settings.agenda_categories);
      }
    });
    
    const handleSettingsChange = (e: any) => {
      if (e.detail?.agenda_categories) {
        applyLoadedCategories(e.detail.agenda_categories);
      }
    };
    window.addEventListener('wms_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('wms_settings_changed', handleSettingsChange);
  }, []);

  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('all');
  const [projectPriorityFilter, setProjectPriorityFilter] = useState<string>('all');
  const [creatorFilter, setCreatorFilter] = useState<string>('all');
  const [projectViewMode, setProjectViewMode] = useState<'grid' | 'kanban' | 'gantt'>(() => {
    try {
      const saved = localStorage.getItem('wms_project_view_mode');
      if (saved === 'grid' || saved === 'kanban' || saved === 'gantt') return saved;
    } catch {}
    return 'grid';
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProjectStatus | null>(null);
  const [ganttScale, setGanttScale] = useState<'day' | 'week' | 'month'>('day');
  const [ganttOffsetDays, setGanttOffsetDays] = useState<number>(0);
  const [expandedGanttProjects, setExpandedGanttProjects] = useState<Record<string, boolean>>({});

  const handleChangeProjectViewMode = (mode: 'grid' | 'kanban' | 'gantt') => {
    setProjectViewMode(mode);
    try {
      localStorage.setItem('wms_project_view_mode', mode);
    } catch {}
  };

  const [isNoteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Partial<NoteItem> | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showCalendarSidebar, setShowCalendarSidebar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('wms_calendar_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isMiniCalendarCollapsed, setIsMiniCalendarCollapsed] = useState(false);
  const [isCategoryFilterCollapsed, setIsCategoryFilterCollapsed] = useState(false);

  const toggleCalendarSidebar = () => {
    setShowCalendarSidebar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wms_calendar_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false);
      }
      if (createDropdownRef.current && !createDropdownRef.current.contains(e.target as Node)) {
        setCreateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  // Modals
  const [isAgendaModalOpen, setAgendaModalOpen] = useState(false);
  const [isProjectModalOpen, setProjectModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<AgendaEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<AgendaEvent> | null>(null);
  const [editingProject, setEditingProject] = useState<Partial<ProjectItem> | null>(null);

  // Attachment upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Detect mobile screen for optimal initial view
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setCalendarView('agenda');
    }
  }, []);

  // Auto-sync Google Calendar di background: sinkronisasi berkala (tiap 45s saat tab aktif) & saat tab kembali difokuskan
  useEffect(() => {
    let isMounted = true;

    const runAutoSync = (force: boolean = false) => {
      try {
        const raw = localStorage.getItem(LAST_GCAL_SYNC_KEY);
        const now = Date.now();
        // Sync jika belum pernah, atau > 45 detik (polling normal), atau jika forced > 15 detik
        const minGap = force ? 15 * 1000 : 45 * 1000;
        if (!raw || now - new Date(raw).getTime() > minGap) {
          reconcileGoogleCalendarTwoWay().then((res) => {
            if (!isMounted) return;
            setLastGcalSync(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
            if (res.added > 0 || res.updated > 0 || res.deleted > 0) {
              loadData();
            }
          }).catch(() => {});
        }
      } catch {}
    };

    // Jalankan segera saat masuk halaman
    runAutoSync(true);

    // Polling periodik tiap 45 detik selama tab aktif
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        runAutoSync(false);
      }
    }, 45000);

    // Deteksi saat pengguna kembali membuka tab browser (misal sehabis edit di Google Calendar)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoSync(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  const handleSyncGoogleCalendar = async () => {
    if (isGcalSyncing) return;
    setIsGcalSyncing(true);
    try {
      const res = await reconcileGoogleCalendarTwoWay();
      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setLastGcalSync(timeStr);
      const changesText = [];
      if (res.added > 0) changesText.push(`${res.added} baru`);
      if (res.updated > 0) changesText.push(`${res.updated} diselaraskan`);
      if (res.deleted > 0) changesText.push(`${res.deleted} dihapus`);
      const summary = changesText.length > 0 ? ` (${changesText.join(', ')})` : ' (Data sudah mutakhir)';
      onShowToast?.(`Google Calendar tersinkronisasi!${summary}`, 'success');
      await loadData();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      onShowToast?.(`Gagal sync Google Calendar: ${errMsg}`, 'error');
    } finally {
      setIsGcalSyncing(false);
    }
  };

  // Fetch initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [agendaData, projectData, noteData] = await Promise.all([
        getAgendaEvents(),
        getProjects(),
        getNotes()
      ]);
      setEvents(agendaData);
      setProjects(projectData);
      setNotes(noteData);
    } catch (err) {
      console.error('Error loading agenda/projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to local window events
    const handleAgendaUpdate = () => loadData();
    const handleProjectUpdate = () => loadData();
    const handleNoteUpdate = () => loadData();

    window.addEventListener('wms_agenda_updated', handleAgendaUpdate);
    window.addEventListener('wms_projects_updated', handleProjectUpdate);
    window.addEventListener('wms_notes_updated', handleNoteUpdate);

    // Supabase Realtime multi-user subscription
    let channel: any = null;
    try {
      const client = getSupabaseClient();
      channel = client
        .channel('wms-agenda-projects-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wms_agenda' }, () => {
          loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wms_projects' }, () => {
          loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wms_notes' }, () => {
          loadData();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription not available:', e);
    }

    return () => {
      window.removeEventListener('wms_agenda_updated', handleAgendaUpdate);
      window.removeEventListener('wms_projects_updated', handleProjectUpdate);
      window.removeEventListener('wms_notes_updated', handleNoteUpdate);
      if (channel) {
        try {
          const client = getSupabaseClient();
          client.removeChannel(channel);
        } catch {}
      }
    };
  }, []);

  // Helper date formats
  const formatIsoDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isToday = (d: Date): boolean => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const isSameDay = (d1: Date, d2: Date): boolean => {
    return d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();
  };

  // Get start of the week (Monday as index 0, Sunday as index 6)
  const weekDates = useMemo(() => {
    const curr = new Date(currentDate);
    const dayCol = (curr.getDay() + 6) % 7; // 0 for Mon, ..., 6 for Sun
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayCol);
    startOfWeek.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Mini calendar month matrix (Monday-start)
  const miniCalendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDayCol = (firstDay.getDay() + 6) % 7; // 0 = Mon, ..., 6 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: { date: Date; currentMonth: boolean; dateStr: string }[] = [];

    // Preceding month trailing days
    const prevTotalDays = new Date(year, month, 0).getDate();
    for (let i = firstDayCol - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevTotalDays - i);
      days.push({
        date: d,
        currentMonth: false,
        dateStr: formatIsoDate(d)
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        currentMonth: true,
        dateStr: formatIsoDate(d)
      });
    }

    // Trailing days to fill 35 or 42 slots
    const targetSlots = days.length <= 35 ? 35 : 42;
    const remaining = targetSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        currentMonth: false,
        dateStr: formatIsoDate(d)
      });
    }

    return days;
  }, [currentDate]);

  // Group into 7-day week rows for Google Calendar layout
  const monthWeeks = useMemo(() => {
    const weeks: { date: Date; currentMonth: boolean; dateStr: string }[][] = [];
    for (let i = 0; i < miniCalendarDays.length; i += 7) {
      weeks.push(miniCalendarDays.slice(i, i + 7));
    }
    return weeks;
  }, [miniCalendarDays]);

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (calendarView === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else if (calendarView === 'week') {
      next.setDate(next.getDate() - 7);
    } else if (calendarView === 'day') {
      next.setDate(next.getDate() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
    setSelectedDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (calendarView === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else if (calendarView === 'week') {
      next.setDate(next.getDate() + 7);
    } else if (calendarView === 'day') {
      next.setDate(next.getDate() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
    setSelectedDate(next);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Category filter: only exclude if explicitly unchecked (false)
      const catKey = e.category || 'umum';
      if (selectedCategories[catKey] === false) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchLoc = e.location?.toLowerCase().includes(q);
        const matchPic = e.pic?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchLoc && !matchPic) return false;
      }
      return true;
    });
  }, [events, selectedCategories, searchQuery]);


  // Status counts for Project & Task 6-Tab Navigation
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: projects.length,
      planned: 0,
      in_progress: 0,
      review: 0,
      completed: 0,
      on_hold: 0
    };
    projects.forEach(p => {
      if (counts[p.status] !== undefined) {
        counts[p.status]++;
      }
    });
    return counts;
  }, [projects]);

  // Base Filtered Projects (without status filter, used for Kanban columns & status counts)
  const baseFilteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (projectPriorityFilter !== 'all' && p.priority !== projectPriorityFilter) return false;
      if (creatorFilter !== 'all' && p.created_by !== creatorFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchPic = p.pic?.toLowerCase().includes(q);
        const matchCat = p.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchPic && !matchCat) return false;
      }
      return true;
    });
  }, [projects, projectPriorityFilter, creatorFilter, searchQuery]);

  // Filtered Projects (including status tab filter)
  const filteredProjects = useMemo(() => {
    return baseFilteredProjects.filter(p => {
      if (projectStatusFilter !== 'all' && p.status !== projectStatusFilter) return false;
      return true;
    });
  }, [baseFilteredProjects, projectStatusFilter]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (creatorFilter !== 'all' && n.created_by !== creatorFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (n.title || '').toLowerCase().includes(q);
        const matchContent = (n.content || '').toLowerCase().includes(q);
        const matchChecklist = (n.checklist || []).some(item => (item.text || '').toLowerCase().includes(q));
        if (!matchTitle && !matchContent && !matchChecklist) return false;
      }
      return true;
    });
  }, [notes, creatorFilter, searchQuery]);

  // Event occurrences mapped by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach(e => {
      const rawStart = e.start_date;
      const rawEnd = e.end_date || e.start_date;
      const start = rawStart <= rawEnd ? rawStart : rawEnd;
      const end = rawStart <= rawEnd ? rawEnd : rawStart;

      if (start === end) {
        if (!map.has(start)) map.set(start, []);
        map.get(start)!.push(e);
      } else {
        try {
          const [sy, sm, sd] = start.split('-').map(Number);
          const [ey, em, ed] = end.split('-').map(Number);
          const curr = new Date(sy, sm - 1, sd);
          const last = new Date(ey, em - 1, ed);
          let count = 0;
          while (curr <= last && count < 366) {
            const dStr = formatIsoDate(curr);
            if (!map.has(dStr)) map.set(dStr, []);
            map.get(dStr)!.push(e);
            curr.setDate(curr.getDate() + 1);
            count++;
          }
        } catch {
          if (!map.has(start)) map.set(start, []);
          map.get(start)!.push(e);
        }
      }
    });
    return map;
  }, [filteredEvents]);

  // Header Title Range
  const headerTitle = useMemo(() => {
    if (activeTab === 'project') return 'Manajemen Project & Inisiatif';
    if (activeTab === 'notes') return 'Catatan & Sticky Notes';
    if (calendarView === 'month') {
      return `${MONTHS_ID[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (calendarView === 'week') {
      const start = weekDates[0];
      const end = weekDates[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} ${MONTHS_ID[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${start.getDate()} ${MONTHS_ID[start.getMonth()]} - ${end.getDate()} ${MONTHS_ID[end.getMonth()]} ${end.getFullYear()}`;
    }
    if (calendarView === 'day') {
      return `${DAYS_FULL_NAME[currentDate.getDay()]}, ${currentDate.getDate()} ${MONTHS_ID[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    return `Agenda ${MONTHS_ID[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [activeTab, calendarView, currentDate, weekDates]);

  // Open Add Event Modal
  const handleOpenAddEvent = (presetDate?: string, presetHour?: number) => {
    const dStr = presetDate || formatIsoDate(selectedDate);
    let sTime = '09:00';
    let eTime = '10:00';
    if (presetHour !== undefined) {
      sTime = `${String(presetHour).padStart(2, '0')}:00`;
      eTime = `${String(presetHour + 1).padStart(2, '0')}:00`;
    }

    setEditingEvent({
      title: '',
      description: '',
      start_date: dStr,
      end_date: dStr,
      is_all_day: false,
      start_time: sTime,
      end_time: eTime,
      category: 'operasional',
      color: undefined,
      location: '',
      pic: session?.name || session?.username || '',
      attachments: []
    });
    setAgendaModalOpen(true);
  };

  const handleEditEvent = (evt: AgendaEvent) => {
    setEditingEvent({ ...evt });
    setDetailEvent(null);
    setAgendaModalOpen(true);
  };

  const handleQuickChangeColor = async (colorId: string) => {
    if (!detailEvent) return;
    const updated: AgendaEvent = { ...detailEvent, color: colorId || undefined };
    setDetailEvent(updated);
    // Optimistic UI update
    setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
    setIsSyncing(true);
    try {
      await saveAgendaEvent(updated);
      onShowToast?.('Warna agenda berhasil diperbarui!', 'success');
      loadData();
    } catch {
      onShowToast?.('Gagal memperbarui warna agenda', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus agenda ini?')) return;
    try {
      const targetToDelete = events.find(e => e.id === id);
      // Optimistic delete
      setEvents(prev => prev.filter(e => e.id !== id));
      await deleteAgendaEvent(id);
      onShowToast?.('Agenda berhasil dihapus', 'info');
      setDetailEvent(null);
      loadData();

      if (targetToDelete?.google_event_id) {
        syncEventToGoogleCalendar(targetToDelete, true).then((gRes) => {
          if (gRes.success) {
            onShowToast?.('🗑️ Event juga dihapus dari Google Calendar.', 'info');
          }
        }).catch(console.warn);
      }
    } catch (err) {
      onShowToast?.('Gagal menghapus agenda', 'error');
    }
  };

  const handleSaveAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent?.title?.trim()) {
      onShowToast?.('Judul agenda wajib diisi', 'error');
      return;
    }
    if (!editingEvent?.start_date) {
      onShowToast?.('Tanggal agenda wajib diisi', 'error');
      return;
    }

    // Normalisasi cerdas jika user memilih rentang lintas tahun (misal: mulai Nov 2026, selesai Feb 2026 -> diset ke Feb 2027)
    let sDate = editingEvent.start_date;
    let eDate = editingEvent.end_date || sDate;
    if (sDate && eDate && sDate > eDate) {
      const [sy, sm] = sDate.split('-').map(Number);
      const [ey, em] = eDate.split('-').map(Number);
      if (sy === ey && em < sm) {
        eDate = `${sy + 1}-${String(em).padStart(2, '0')}-${eDate.slice(8)}`;
      } else {
        const tmp = sDate;
        sDate = eDate;
        eDate = tmp;
      }
    }

    const eventToSave: Partial<AgendaEvent> = {
      ...editingEvent,
      start_date: sDate,
      end_date: eDate
    };

    setIsSyncing(true);
    try {
      const saved = await saveAgendaEvent(eventToSave);

      // Pastikan kategori agenda baru aktif di filter & kalender fokus pada tanggal agenda tersebut
      if (saved.category) {
        setSelectedCategories(prev => ({ ...prev, [saved.category]: true }));
      }
      if (saved.start_date) {
        const [sy, sm, sd] = saved.start_date.split('-').map(Number);
        if (sy && sm && sd) {
          const targetDate = new Date(sy, sm - 1, sd);
          setCurrentDate(targetDate);
          setSelectedDate(targetDate);
        }
      }
      
      // OPTIMISTIC UPDATE: Langsung update state kalender di layar tanpa menunggu query asinkron
      setEvents(prev => {
        const oldId = editingEvent.id;
        const exists = prev.some(ev => ev.id === saved.id || (oldId && ev.id === oldId));
        if (exists) {
          return prev.map(ev => (ev.id === saved.id || (oldId && ev.id === oldId)) ? saved : ev);
        }
        return [...prev, saved];
      });

      onShowToast?.(`Agenda "${saved.title}" (${saved.start_date}) berhasil disimpan!`, 'success');
      setAgendaModalOpen(false);
      setEditingEvent(null);
      await loadData();

      // Background 2-way sync ke Google Calendar dengan konfirmasi visual
      syncEventToGoogleCalendar(saved, false).then(async (gRes) => {
        if (gRes.success) {
          if (gRes.google_event_id && gRes.google_event_id !== saved.google_event_id) {
            saved.google_event_id = gRes.google_event_id;
            await saveAgendaEvent(saved);
            loadData();
          }
          setLastGcalSync(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
          onShowToast?.('📅 Event berhasil disinkronkan ke Google Calendar!', 'info');
        } else {
          onShowToast?.(`⚠️ Event tersimpan di WMS, namun gagal sync ke Google Calendar: ${gRes.error || 'Timeout'}`, 'warning');
        }
      }).catch((err) => {
        console.warn('GCal sync error:', err);
      });

    } catch (err) {
      onShowToast?.('Gagal menyimpan agenda', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Add/Edit Note Modal
  const handleOpenAddNote = (existing?: NoteItem, startWithChecklist = false) => {
    if (existing) {
      setEditingNote({
        ...existing,
        checklist: Array.isArray(existing.checklist) ? existing.checklist.map(c => ({ ...c })) : []
      });
    } else {
      setEditingNote({
        title: '',
        content: '',
        color: 'yellow',
        checklist: startWithChecklist
          ? [{ id: `chk-${Date.now()}`, text: '', is_completed: false }]
          : [],
        created_by: session?.name || session?.username || 'Warehouse'
      });
    }
    setNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanChecklist = (editingNote?.checklist || []).filter(item => item.text.trim().length > 0);
    const hasContent = Boolean(editingNote?.content?.trim());
    const hasTitle = Boolean(editingNote?.title?.trim());
    if (!hasContent && cleanChecklist.length === 0 && !hasTitle) {
      onShowToast?.('Isi catatan atau minimal 1 item checklist wajib diisi', 'error');
      return;
    }
    setIsSyncing(true);
    try {
      await saveNote({
        ...editingNote,
        checklist: cleanChecklist
      });
      onShowToast?.('Catatan berhasil disimpan!', 'success');
      setNoteModalOpen(false);
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menyimpan catatan', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle checkbox langsung dari kartu Sticky Note
  const handleToggleNoteChecklistItem = async (note: NoteItem, itemId: string) => {
    const updatedChecklist = (note.checklist || []).map(item =>
      item.id === itemId ? { ...item, is_completed: !item.is_completed } : item
    );
    const updatedNote: NoteItem = {
      ...note,
      checklist: updatedChecklist,
    };
    setNotes(prev => prev.map(n => n.id === note.id ? updatedNote : n));
    try {
      await saveNote(updatedNote, true);
    } catch (err) {
      console.error('Gagal update checklist catatan:', err);
    }
  };

  // Drag & Drop atau Geser Urutan Catatan
  const handleMoveNoteOrder = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const oldIndex = notes.findIndex(n => n.id === sourceId);
    const newIndex = notes.findIndex(n => n.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...notes];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    const withSortOrder = reordered.map((n, idx) => ({ ...n, sort_order: idx }));

    setNotes(withSortOrder);
    try {
      await reorderNotes(withSortOrder);
    } catch (err) {
      console.error('Gagal mengurutkan catatan:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus catatan ini?')) return;
    try {
      await deleteNote(id);
      onShowToast?.('Catatan berhasil dihapus', 'info');
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menghapus catatan', 'error');
    }
  };

  const handleOpenAddProject = (existing?: ProjectItem, initialStatus?: ProjectStatus) => {
    if (existing) {
      setEditingProject({
        ...existing,
        start_date: existing.start_date || (existing.created_at ? existing.created_at.slice(0, 10) : formatIsoDate(new Date())),
      });
    } else {
      setEditingProject({
        title: '',
        description: '',
        status: initialStatus || (projectStatusFilter !== 'all' ? (projectStatusFilter as ProjectStatus) : 'in_progress'),
        priority: 'medium',
        category: 'Infrastruktur',
        pic: session?.name || session?.username || '',
        start_date: formatIsoDate(new Date()),
        deadline: formatIsoDate(new Date(Date.now() + 14 * 86400000)),
        progress: initialStatus === 'completed' ? 100 : 0,
        tasks: [],
        attachments: []
      });
    }
    setProjectModalOpen(true);
  };

  const handleQuickStatusChange = async (proj: ProjectItem, newStatus: ProjectStatus) => {
    if (proj.status === newStatus) return;
    const updatedProgress = newStatus === 'completed'
      ? 100
      : (proj.status === 'completed' && proj.progress === 100 && proj.tasks.length === 0 ? 50 : proj.progress);
    const updatedProj: ProjectItem = {
      ...proj,
      status: newStatus,
      progress: updatedProgress
    };
    setProjects(prev => prev.map(p => p.id === proj.id ? updatedProj : p));
    try {
      await saveProject(updatedProj);
      const label = PROJECT_STATUS_CONFIG[newStatus]?.label || newStatus;
      onShowToast?.(`Status "${proj.title}" dipindahkan ke ${label}`, 'success');
      loadData();
    } catch (err) {
      console.error(err);
      onShowToast?.('Gagal memperbarui status project', 'error');
      loadData();
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject?.title?.trim()) {
      onShowToast?.('Nama project wajib diisi', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      await saveProject(editingProject);
      onShowToast?.('Project berhasil disimpan!', 'success');
      setProjectModalOpen(false);
      setEditingProject(null);
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menyimpan project', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus project ini beserta seluruh tugasnya?')) return;
    try {
      await deleteProject(id);
      onShowToast?.('Project berhasil dihapus', 'info');
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menghapus project', 'error');
    }
  };

  // Toggle Project Task Checkbox Directly
  const handleToggleTask = async (project: ProjectItem, taskId: string) => {
    const updatedTasks = project.tasks.map(t => 
      t.id === taskId ? { ...t, is_completed: !t.is_completed } : t
    );
    const completedCount = updatedTasks.filter(t => t.is_completed).length;
    const newProgress = updatedTasks.length > 0 
      ? Math.round((completedCount / updatedTasks.length) * 100)
      : project.progress;

    const updated = {
      ...project,
      tasks: updatedTasks,
      progress: newProgress,
      status: newProgress === 100 ? ('completed' as ProjectStatus) : project.status
    };

    // Optimistic UI update
    setProjects(prev => prev.map(p => p.id === project.id ? updated : p));

    try {
      await saveProject(updated);
      if (newProgress === 100 && project.progress !== 100) {
        onShowToast?.(`Selamat! Semua tugas di "${project.title}" telah selesai! 🎉`, 'success');
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Attachment upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: AgendaAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          const res = await compressImage(file, 1024, 0.7);
          newAttachments.push({
            id: 'att-' + Date.now() + '-' + i,
            name: file.name,
            size: res.compressedSize,
            type: 'image',
            url: res.dataUrl
          });
        } catch (err) {
          console.warn('Compress failed, using original', err);
        }
      } else {
        newAttachments.push({
          id: 'att-' + Date.now() + '-' + i,
          name: file.name,
          size: file.size,
          type: 'document'
        });
      }
    }

    if (isAgendaModalOpen && editingEvent) {
      setEditingEvent({
        ...editingEvent,
        attachments: [...(editingEvent.attachments || []), ...newAttachments]
      });
    } else if (isProjectModalOpen && editingProject) {
      setEditingProject({
        ...editingProject,
        attachments: [...(editingProject.attachments || []), ...newAttachments]
      });
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string, isProj = false) => {
    if (isProj && editingProject) {
      setEditingProject({
        ...editingProject,
        attachments: (editingProject.attachments || []).filter(a => a.id !== id)
      });
    } else if (editingEvent) {
      setEditingEvent({
        ...editingEvent,
        attachments: (editingEvent.attachments || []).filter(a => a.id !== id)
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  // Quick category toggle
  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isAllCategoriesSelected = useMemo(() => {
    const keys = Object.keys(categoryConfig);
    return keys.length > 0 && keys.every(k => Boolean(selectedCategories[k]));
  }, [categoryConfig, selectedCategories]);

  const handleResetCategories = () => {
    const keys = Object.keys(categoryConfig);
    if (isAllCategoriesSelected) {
      // Jika semua sedang aktif, nonaktifkan semua (memudahkan jika user ingin memilih 1 kategori saja)
      const noneSelected = keys.reduce((acc, k) => ({ ...acc, [k]: false }), {} as Record<string, boolean>);
      setSelectedCategories(noneSelected);
      onShowToast?.('Semua filter kategori dinonaktifkan', 'info');
    } else {
      // Jika sebagian atau kosong, aktifkan semua kategori
      const allSelected = keys.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<string, boolean>);
      setSelectedCategories(allSelected);
      onShowToast?.('Filter kategori di-reset (semua aktif)', 'success');
    }
  };

  return (
    <div className="w-full max-w-full space-y-3 pb-16 text-slate-900 dark:text-slate-100">
      
      {/* Top Header & Tab Navigation */}
      <div className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {/* Row 1: Brand & Action Button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-primary-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-primary-500/20 shrink-0">
              {activeTab === 'calendar' ? <Calendar className="w-5 h-5 sm:w-6 sm:h-6" /> : activeTab === 'project' ? <Briefcase className="w-5 h-5 sm:w-6 sm:h-6" /> : <StickyNote className="w-5 h-5 sm:w-6 sm:h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Agenda & Project
                </h1>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Cloud Sync
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Jadwal operasional gudang, meeting, dan inisiatif milestone proyek.
              </p>
            </div>
          </div>

          {/* Primary Action Button (Cleanly positioned on right side / full-width on mobile) */}
          <button
            onClick={() => {
              if (activeTab === 'calendar') handleOpenAddEvent();
              else if (activeTab === 'notes') handleOpenAddNote();
              else handleOpenAddProject();
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-primary-500 via-rose-500 to-amber-500 hover:opacity-95 text-white rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-primary-500/20 active:scale-98 transition-all shrink-0 cursor-pointer"
            title={activeTab === 'calendar' ? 'Tambah Agenda Baru' : activeTab === 'notes' ? 'Tambah Catatan Baru' : 'Tambah Project Baru'}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>
              {activeTab === 'calendar' ? 'Tambah Agenda' : activeTab === 'notes' ? 'Tambah Catatan' : 'Tambah Project'}
            </span>
          </button>
        </div>

        {/* Row 2: Segmented Tabs (Evenly distributed, zero overlap) */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 gap-1">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'calendar'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Kalender Kerja</span>
              <span className="sm:hidden">Kalender</span>
            </span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full font-bold shrink-0">
              {filteredEvents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('project')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'project'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Project & Task</span>
              <span className="sm:hidden">Project</span>
            </span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full font-bold shrink-0">
              {filteredProjects.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'notes'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Catatan</span>
              <span className="sm:hidden">Catatan</span>
            </span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full font-bold shrink-0">
              {filteredNotes.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-24 sm:pb-8">
          
          {/* Left Sidebar Panel (Desktop: permanent 3 cols; Mobile: expandable drawer or toggle) */}
          <div className={`${showCalendarSidebar ? 'lg:col-span-3 lg:block' : 'lg:hidden'} space-y-2 ${mobileFilterOpen ? 'block' : 'hidden'}`}>
            
            {/* Google Calendar Style Create FAB Button + Hide Sidebar Toggle */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="relative" ref={createDropdownRef}>
              <button
                type="button"
                onClick={() => setCreateDropdownOpen(!createDropdownOpen)}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-full px-5 py-3 font-semibold text-sm flex items-center gap-3 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 36 36">
                  <path fill="#4285F4" d="M16 16v14h4V20z" />
                  <path fill="#34A853" d="M30 16H20l-4 4h14z" />
                  <path fill="#FBBC05" d="M6 16h10l4-4H6z" />
                  <path fill="#EA4335" d="M20 16V6h-4v14z" />
                  <path fill="none" d="M0 0h36v36H0z" />
                </svg>
                <span className="font-semibold text-slate-800 dark:text-slate-100">Buat</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {createDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-52 bg-white dark:bg-[#1a2332] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      handleOpenAddEvent();
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-primary-500 shrink-0" />
                    <span>Acara / Agenda Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      setActiveTab('project');
                      setEditingProject({
                        title: '',
                        description: '',
                        status: 'planned',
                        priority: 'medium',
                        progress: 0,
                        start_date: formatIsoDate(new Date()),
                        deadline: formatIsoDate(new Date(Date.now() + 7 * 86400000)),
                        tasks: [],
                        pic: session?.name || session?.username || ''
                      });
                      setProjectModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Briefcase className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Project & Task Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      setActiveTab('notes');
                      setEditingNote({
                        title: '',
                        content: '',
                        color: 'yellow'
                      });
                      setNoteModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <StickyNote className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Catatan Sticky Baru</span>
                  </button>
                </div>
              )}
            </div>

              {/* Close/Hide Sidebar Button */}
              <button
                type="button"
                onClick={toggleCalendarSidebar}
                className="hidden lg:flex p-2.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2332] shadow-2xs items-center gap-1.5 text-xs font-bold"
                title="Sembunyikan panel samping kalender"
              >
                <PanelLeftClose className="w-4 h-4 text-slate-500" />
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Sembunyikan</span>
              </button>
            </div>


            {/* Mini Interactive Month Calendar (Desktop & Tablet) */}
            <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {MONTHS_ID[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      const d = new Date(currentDate);
                      d.setMonth(d.getMonth() - 1);
                      setCurrentDate(d);
                      setSelectedDate(d);
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => {
                      const d = new Date(currentDate);
                      d.setMonth(d.getMonth() + 1);
                      setCurrentDate(d);
                      setSelectedDate(d);
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMiniCalendarCollapsed(!isMiniCalendarCollapsed)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-0.5 cursor-pointer"
                    title={isMiniCalendarCollapsed ? "Buka mini kalender" : "Sembunyikan mini kalender"}
                  >
                    {isMiniCalendarCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {!isMiniCalendarCollapsed && (
                <>
                  {/* Days Header */}
              <div className="grid grid-cols-7 text-center mb-1">
                {DAYS_INITIALS_MONDAY_START.map((init, i) => (
                  <span key={i} className="text-[10px] font-bold text-slate-400 py-1">
                    {init}
                  </span>
                ))}
              </div>

              {/* Day Cells */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {miniCalendarDays.map((item, idx) => {
                  const dStr = formatIsoDate(item.date);
                  const isSel = isSameDay(item.date, selectedDate);
                  const isTod = isToday(item.date);
                  const hasEvents = eventsByDate.has(dStr);

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(item.date);
                        setCurrentDate(item.date);
                        if (calendarView === 'agenda' || calendarView === 'day') {
                          // keep focused
                        }
                      }}
                      className={`h-7 w-7 mx-auto rounded-full flex flex-col items-center justify-center text-[11px] font-bold transition-colors relative ${
                        isSel
                          ? 'bg-primary-500 text-white shadow-sm'
                          : isTod
                          ? 'bg-[#1a73e8] text-white shadow-xs'
                          : item.currentMonth
                          ? 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    >
                      <span>{item.date.getDate()}</span>
                      {hasEvents && !isSel && (
                        <span className="w-1 h-1 rounded-full bg-primary-500 absolute bottom-0.5"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

            {/* Category Filter Checkboxes */}
            <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Filter Kategori
                </span>
                <div className="flex items-center gap-1.5">
                  <button 
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-bold flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Buka panel kelola & edit kategori agenda"
                  >
                    <Edit3 className="w-3 h-3 text-slate-500" />
                    <span>Edit</span>
                  </button>
                  <button 
                    type="button"
                    onClick={handleResetCategories}
                    className="text-[11px] text-primary-600 dark:text-primary-400 hover:text-primary-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5 px-1 py-0.5"
                    title={isAllCategoriesSelected ? 'Batal pilih semua kategori' : 'Pilih semua kategori (reset)'}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>{isAllCategoriesSelected ? 'Batal' : 'Reset'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCategoryFilterCollapsed(!isCategoryFilterCollapsed)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-0.5 cursor-pointer"
                    title={isCategoryFilterCollapsed ? "Buka filter kategori" : "Sembunyikan filter kategori"}
                  >
                    {isCategoryFilterCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {!isCategoryFilterCollapsed && (
                <div className="space-y-1.5">
                {Object.keys(categoryConfig).map(catKey => {
                  const cfg = categoryConfig[catKey] || { label: catKey, dot: 'bg-slate-500' };
                  const isChecked = Boolean(selectedCategories[catKey]);
                  const count = events.filter(e => e.category === catKey).length;

                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => toggleCategory(catKey)}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                          isChecked 
                            ? `${getCategoryDotColor(catKey, categoryConfig)} border-transparent text-white` 
                            : 'border-slate-400 dark:border-slate-500 bg-transparent'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`}></span>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

            {/* Quick Summary Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-500/10 via-amber-500/5 to-transparent border border-primary-200/50 dark:border-primary-900/30">
              <h4 className="text-xs font-black text-primary-700 dark:text-primary-400 flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Tips Kalender & Agenda
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Agenda "Sepanjang Hari" ditampilkan di baris atas kalender. Pada tampilan ponsel, gunakan mode <strong>Jadwal (Agenda)</strong> untuk membaca rincian dengan lega.
              </p>
            </div>
          </div>

          {/* Right Main Calendar Area (9 cols on Desktop) */}
          <div className={`${showCalendarSidebar ? 'lg:col-span-9' : 'lg:col-span-12'} space-y-2 transition-all duration-200`}>
            
            {/* Calendar Controls Toolbar (Google Calendar Layout) */}
            <div className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-row flex-wrap justify-between items-center gap-3">
              
              {/* Left Navigation: Logo, Today, < >, and Title */}
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3">
                {/* Toggle Sidebar Button (Google Calendar Style) */}
                <button
                  type="button"
                  onClick={toggleCalendarSidebar}
                  className={`p-2 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                    showCalendarSidebar
                      ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                      : 'bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 border-primary-300 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/60'
                  }`}
                  title={showCalendarSidebar ? "Sembunyikan panel samping kalender" : "Buka panel samping (Mini Kalender & Kategori)"}
                >
                  {showCalendarSidebar ? (
                    <PanelLeftClose className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  ) : (
                    <PanelLeft className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  )}
                </button>

                {/* Google Calendar Logo / Date Badge */}
                <div className="flex items-center gap-2 mr-1">
                  <div className="w-9 h-9 rounded-xl bg-[#1a73e8] text-white flex flex-col items-center justify-center font-bold shadow-xs select-none">
                    <span className="text-[8px] font-black uppercase tracking-tighter opacity-90 leading-none">
                      {new Date().toLocaleString('id-ID', { month: 'short' })}
                    </span>
                    <span className="text-sm font-black leading-none mt-0.5">
                      {new Date().getDate()}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100 hidden md:inline">
                    Kalender
                  </span>
                </div>

                <button
                  onClick={handleToday}
                  className="px-4 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-full transition-colors cursor-pointer"
                >
                  Hari ini
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrev}
                    aria-label="Previous"
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNext}
                    aria-label="Next"
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <h2 className="text-base sm:text-xl font-medium truncate text-slate-900 dark:text-white">
                  {headerTitle}
                </h2>
              </div>

              {/* Right View Switchers & Search */}
              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
                
                {/* Search input */}
                <div className="relative hidden sm:block w-44 md:w-52">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Telusuri agenda..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Mobile Quick Add Button */}
                <button
                  onClick={() => handleOpenAddEvent()}
                  className="sm:hidden px-2.5 py-1.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                  title="Tambah Agenda"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>+ Agenda</span>
                </button>

                {/* Mobile Filter Drawer Button */}
                <button
                  onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                  className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"
                >
                  <ListFilter className="w-4 h-4" />
                  <span>Filter</span>
                </button>

                {/* Tombol Sinkron Google Calendar */}
                <button
                  onClick={handleSyncGoogleCalendar}
                  disabled={isGcalSyncing}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    isGcalSyncing
                      ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 border-primary-200 dark:border-primary-800 animate-pulse'
                      : 'bg-white dark:bg-[#1a2332] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-primary-400 dark:hover:border-primary-500 shadow-2xs'
                  }`}
                  title="Sinkronisasi 2-arah dengan Google Calendar Akun Utama"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGcalSyncing ? 'animate-spin text-primary-500' : 'text-primary-600 dark:text-primary-400'}`} />
                  <span className="hidden sm:inline">{isGcalSyncing ? 'Menyinkronkan...' : 'Sync G-Calendar'}</span>
                  <span className="sm:hidden">{isGcalSyncing ? 'Sync...' : 'G-Cal'}</span>
                  {lastGcalSync && !isGcalSyncing && (
                    <span className="hidden xl:inline text-[10px] text-slate-400 font-normal">
                      ({lastGcalSync})
                    </span>
                  )}
                </button>

                {/* Google Calendar View Dropdown */}
                <div className="relative" ref={viewDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                  >
                    <span>
                      {calendarView === 'month' && 'Bulan'}
                      {calendarView === 'week' && 'Minggu'}
                      {calendarView === 'day' && 'Hari'}
                      {calendarView === 'agenda' && 'Jadwal'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {viewDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-36 bg-white dark:bg-[#1a2332] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        onClick={() => { setCalendarView('day'); setViewDropdownOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          calendarView === 'day' ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>Hari</span>
                        <span className="text-[10px] text-slate-400 font-mono">D</span>
                      </button>
                      <button
                        onClick={() => { setCalendarView('week'); setViewDropdownOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          calendarView === 'week' ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>Minggu</span>
                        <span className="text-[10px] text-slate-400 font-mono">W</span>
                      </button>
                      <button
                        onClick={() => { setCalendarView('month'); setViewDropdownOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          calendarView === 'month' ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>Bulan</span>
                        <span className="text-[10px] text-slate-400 font-mono">M</span>
                      </button>
                      <button
                        onClick={() => { setCalendarView('agenda'); setViewDropdownOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          calendarView === 'agenda' ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>Jadwal</span>
                        <span className="text-[10px] text-slate-400 font-mono">A</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Horizontal Day Picker Strip (Essential for mobile quick navigation) */}
            <div className="block lg:hidden bg-white dark:bg-[#1a2332] p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max pb-1">
                {weekDates.map((date, idx) => {
                  const dStr = formatIsoDate(date);
                  const isSel = isSameDay(date, selectedDate);
                  const isTod = isToday(date);
                  const dayEvents = eventsByDate.get(dStr) || [];
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(date);
                        setCurrentDate(date);
                      }}
                      className={`flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all ${
                        isSel
                          ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                          : isTod
                          ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800'
                          : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase">{DAYS_NAME[date.getDay()]}</span>
                      <span className="text-sm font-black mt-0.5">{date.getDate()}</span>
                      <div className="flex gap-0.5 mt-1">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSel ? 'bg-white' : 'bg-primary-500'
                            }`}
                          ></span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1. WEEK VIEW (Time Slot Grid - Exactly Like Reference Screenshot) */}
            {calendarView === 'week' && (
              <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto scrollbar-thin">
                  <div className="min-w-[850px]">
                    {/* Day Header Row */}
                    <div className="grid grid-cols-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30">
                      <div className="p-3 text-center text-[11px] font-bold text-slate-400 border-r border-slate-200 dark:border-slate-800">
                        WIB (+7)
                      </div>
                      {weekDates.map((date, idx) => {
                        const isTod = isToday(date);
                        return (
                          <div
                            key={idx}
                            className={`p-3 text-center border-r border-slate-200 dark:border-slate-800 last:border-0 ${
                              isTod ? 'bg-primary-50/60 dark:bg-primary-950/20' : ''
                            }`}
                          >
                            <div className="text-[11px] font-bold text-slate-400 uppercase">
                              {DAYS_NAME[date.getDay()]}
                            </div>
                            <div className={`text-base font-black mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full ${
                              isTod ? 'bg-primary-500 text-white' : 'text-slate-800 dark:text-slate-100'
                            }`}>
                              {date.getDate()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Sepanjang Hari (All Day) Banner Row */}
                    <div className="grid grid-cols-8 border-b border-slate-200 dark:border-slate-800 bg-amber-50/30 dark:bg-amber-950/10 min-h-[44px]">
                      <div className="p-2 flex items-center justify-center text-[10px] font-black text-amber-700 dark:text-amber-400 border-r border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                        <Sun className="w-3 h-3 mr-1 inline text-amber-500" />
                        All Day
                      </div>
                      {weekDates.map((date, idx) => {
                        const dStr = formatIsoDate(date);
                        const dayEvents = (eventsByDate.get(dStr) || []).filter(e => e.is_all_day);

                        return (
                          <div
                            key={idx}
                            onClick={() => handleOpenAddEvent(dStr)}
                            className="p-1 border-r border-slate-200 dark:border-slate-800 last:border-0 space-y-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 cursor-pointer"
                          >
                            {dayEvents.map(evt => {
                              const colorStyle = resolveEventColorStyle(evt, categoryConfig);
                              return (
                                <div
                                  key={evt.id}
                                  onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                                  style={colorStyle.barBgStyle}
                                  className={`text-[10px] p-1.5 rounded-lg font-bold truncate border shadow-xs transition-transform hover:scale-[1.02] cursor-pointer ${colorStyle.badgeBg} ${colorStyle.badgeText} ${colorStyle.border}`}
                                  title={`${evt.title} (Klik untuk rincian, klik 2x untuk edit)`}
                                >
                                  ☀️ {evt.title}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* Hourly Time Slot Grid */}
                    <div className="overflow-y-auto max-h-[640px] divide-y divide-slate-100 dark:divide-slate-800/50">
                      {HOURS.map(hour => (
                        <div key={hour} className="grid grid-cols-8 min-h-[56px] relative group">
                          
                          {/* Time Column */}
                          <div className="p-2 text-right pr-3 text-[11px] font-bold text-slate-400 border-r border-slate-200 dark:border-slate-800 select-none">
                            {String(hour).padStart(2, '0')}:00
                          </div>

                          {/* 7 Days Columns */}
                          {weekDates.map((date, idx) => {
                            const dStr = formatIsoDate(date);
                            const dayTimedEvents = (eventsByDate.get(dStr) || []).filter(e => {
                              if (e.is_all_day) return false;
                              if (!e.start_time) return false;
                              const evtHour = parseInt(e.start_time.split(':')[0], 10);
                              return evtHour === hour;
                            });

                            return (
                              <div
                                key={idx}
                                onClick={() => handleOpenAddEvent(dStr, hour)}
                                className="p-1 border-r border-slate-100 dark:border-slate-800/40 last:border-0 relative hover:bg-slate-50/70 dark:hover:bg-slate-800/20 cursor-pointer transition-colors"
                              >
                                {dayTimedEvents.map(evt => {
                                  const colorStyle = resolveEventColorStyle(evt, categoryConfig);
                                  return (
                                    <div
                                      key={evt.id}
                                      onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                      onDoubleClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                                      className={`p-2 rounded-xl border mb-1 font-sans shadow-xs transition-all hover:shadow-md cursor-pointer ${colorStyle.cardBg} ${colorStyle.border} border-l-4`}
                                      title={`${evt.title} (Klik untuk rincian, klik 2x untuk edit)`}
                                    >
                                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-2.5 h-2.5" />
                                          {evt.start_time} - {evt.end_time || ''}
                                        </span>
                                        {evt.google_event_id && (
                                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400" title="Tersinkron Google Calendar">
                                            <Calendar className="w-2.5 h-2.5" /> G-Cal
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs font-black text-slate-800 dark:text-slate-100 leading-tight line-clamp-2">
                                        {evt.title}
                                      </p>
                                      {evt.location && (
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
                                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                                          {evt.location}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. MONTH VIEW (Google Calendar Continuous Spanning Multi-Day Layout) */}
            {calendarView === 'month' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto scrollbar-thin">
                  <div className="min-w-[700px] sm:min-w-full">
                    {/* Header Columns: SEN, SEL, RAB, KAM, JUM, SAB, MIN */}
                    <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 py-2.5 select-none tracking-wider">
                      {DAYS_HEADER_MONDAY_START.map(d => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>

                    {/* Week Rows */}
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {monthWeeks.map((weekDays, weekIdx) => {
                        const weekStartStr = weekDays[0].dateStr;
                        const weekEndStr = weekDays[6].dateStr;
                        const { segments } = computeWeekEventSegments(
                          filteredEvents,
                          weekDays,
                          weekStartStr,
                          weekEndStr
                        );

                        return (
                          <div
                            key={weekIdx}
                            className="relative min-h-[115px] h-auto flex flex-col justify-start select-none"
                          >
                            {/* Layer 1: Background Day Cells (Grid 7 Cols with Borders) */}
                            <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800/60 absolute inset-0">
                              {weekDays.map((item, dIdx) => {
                                const isTod = isToday(item.date);
                                const isSel = isSameDay(item.date, selectedDate);
                                return (
                                  <div
                                    key={dIdx}
                                    onClick={() => {
                                      setSelectedDate(item.date);
                                      setCurrentDate(item.date);
                                    }}
                                    onDoubleClick={() => handleOpenAddEvent(item.dateStr)}
                                    className={`h-full transition-colors cursor-pointer group/cell relative ${
                                      !item.currentMonth 
                                        ? 'bg-slate-50/50 dark:bg-slate-900/30' 
                                        : isTod 
                                        ? 'bg-blue-50/20 dark:bg-blue-950/10' 
                                        : 'bg-white dark:bg-[#1a2332]'
                                    } ${isSel ? 'bg-primary-50/25 dark:bg-primary-950/20 ring-1 ring-primary-500/30 ring-inset' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'}`}
                                    title={`Klik untuk pilih ${item.dateStr}, klik 2x untuk buat agenda`}
                                  />
                                );
                              })}
                            </div>

                            {/* Layer 2: Clickable Day Headers with Add Button */}
                            <div className="grid grid-cols-7 relative z-10 pt-1.5 pb-1 px-1">
                              {weekDays.map((item, dIdx) => {
                                const isTod = isToday(item.date);
                                const isSel = isSameDay(item.date, selectedDate);
                                const isFirstOfMonth = item.date.getDate() === 1;

                                const displayLabel = isFirstOfMonth
                                  ? `1 ${MONTHS_ID[item.date.getMonth()].slice(0, 3)}`
                                  : `${item.date.getDate()}`;

                                return (
                                  <div
                                    key={dIdx}
                                    onClick={() => {
                                      setSelectedDate(item.date);
                                      setCurrentDate(item.date);
                                    }}
                                    onDoubleClick={() => handleOpenAddEvent(item.dateStr)}
                                    className="flex items-center justify-between px-1 cursor-pointer group"
                                    title={`Klik untuk pilih tanggal, klik dua kali untuk buat agenda pada ${item.dateStr}`}
                                  >
                                    <span
                                      className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${
                                        isTod
                                          ? 'bg-[#1a73e8] text-white font-bold w-6 h-6 shadow-xs'
                                          : isSel
                                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                                          : !item.currentMonth
                                          ? 'text-slate-400 dark:text-slate-500'
                                          : isFirstOfMonth
                                          ? 'text-slate-800 dark:text-slate-100 font-bold'
                                          : 'text-slate-700 dark:text-slate-200'
                                      }`}
                                    >
                                      {displayLabel}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(item.date);
                                        setCurrentDate(item.date);
                                        handleOpenAddEvent(item.dateStr);
                                      }}
                                      className={`${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} w-5 h-5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center justify-center transition-all cursor-pointer`}
                                      title={`+ Tambah agenda pada ${item.dateStr}`}
                                    >
                                      <Plus className="w-3 h-3 stroke-[2.5]" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Layer 3: Continuous Event Bars (Flexible Full Height - pointer-events-none agar klik pada sel tanggal tetap berfungsi) */}
                            <div
                              className="grid grid-cols-7 gap-y-1 relative z-10 px-0.5 pb-2.5 flex-1 pointer-events-none"
                              style={{
                                gridAutoRows: '24px',
                                alignContent: 'start'
                              }}
                            >
                              {segments.map((seg, sIdx) => {
                                const colorStyle = resolveEventColorStyle(seg.event, categoryConfig);
                                
                                const borderRounding = 
                                  seg.continuesFromPrev && seg.continuesToNext
                                    ? 'rounded-none mx-0'
                                    : seg.continuesFromPrev
                                    ? 'rounded-r-md rounded-l-none ml-0 mr-1'
                                    : seg.continuesToNext
                                    ? 'rounded-l-md rounded-r-none mr-0 ml-1'
                                    : 'rounded-md mx-1';

                                return (
                                  <div
                                    key={`${seg.event.id}-${weekIdx}-${sIdx}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDetailEvent(seg.event);
                                    }}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      handleEditEvent(seg.event);
                                    }}
                                    style={{
                                      gridColumnStart: seg.startCol,
                                      gridColumnEnd: seg.endCol + 1,
                                      gridRowStart: seg.slot + 1,
                                      ...(colorStyle.barBgStyle || {})
                                    }}
                                    className={`pointer-events-auto h-6 text-[11px] font-bold text-white flex items-center px-2 shadow-2xs cursor-pointer truncate transition-all hover:brightness-110 active:scale-[0.99] select-none ${colorStyle.barBgClass} ${borderRounding}`}
                                    title={`${seg.event.title} (${seg.event.start_date}${seg.event.end_date ? ' s/d ' + seg.event.end_date : ''}) - Klik untuk lihat, klik 2x untuk edit`}
                                  >
                                    {seg.continuesFromPrev && (
                                      <span className="text-[9px] mr-1 opacity-85 shrink-0 font-mono">◀</span>
                                    )}

                                    {!seg.isAllDayOrMultiDay && seg.event.start_time && (
                                      <span className="font-mono text-[10px] mr-1 font-semibold opacity-95 shrink-0">
                                        {seg.event.start_time}
                                      </span>
                                    )}

                                    <span className="truncate">
                                      {seg.event.title}
                                    </span>

                                    {seg.event.google_event_id && (
                                      <span className="ml-1 shrink-0 text-[10px] opacity-80" title="Tersinkron Google Calendar">📅</span>
                                    )}

                                    {seg.continuesToNext && (
                                      <span className="text-[9px] ml-auto pl-1 opacity-85 shrink-0 font-mono">▶</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Panel Rincian Agenda Hari Terpilih di Layar Mobile */}
                <div className="block lg:hidden bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary-500"></div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                        {DAYS_FULL_NAME[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTHS_ID[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                      </h4>
                    </div>
                    <button
                      onClick={() => handleOpenAddEvent(formatIsoDate(selectedDate))}
                      className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  </div>
                  
                  {(() => {
                    const selDateStr = formatIsoDate(selectedDate);
                    const selEvents = eventsByDate.get(selDateStr) || [];
                    if (selEvents.length === 0) {
                      return (
                        <p className="text-xs text-slate-400 italic text-center py-2">
                          Tidak ada agenda dijadwalkan pada hari ini
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {selEvents.map(evt => {
                          const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white' };
                          return (
                            <div
                              key={evt.id}
                              onClick={() => setDetailEvent(evt)}
                              className={`p-3 rounded-xl border ${cfg.cardBg} ${cfg.border} border-l-4 cursor-pointer hover:shadow-xs transition-all`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">{evt.title}</h5>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} shrink-0`}>
                                  {cfg.label}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {evt.is_all_day ? (
                                  <span className="text-amber-600 font-bold">☀️ Sepanjang Hari</span>
                                ) : (
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {evt.start_time} - {evt.end_time || ''}</span>
                                )}
                                {evt.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {evt.location}</span>}
                                {evt.pic && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {evt.pic}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 3. DAY VIEW */}
            {calendarView === 'day' && (
              <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                    Jadwal {headerTitle}
                  </h3>
                  <button
                    onClick={() => handleOpenAddEvent(formatIsoDate(currentDate))}
                    className="bg-primary-500 hover:bg-primary-600 text-white text-xs px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Agenda
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {/* All day section in day view */}
                  {((eventsByDate.get(formatIsoDate(currentDate)) || []).filter(e => e.is_all_day)).map(evt => {
                    const colorStyle = resolveEventColorStyle(evt, categoryConfig);
                    return (
                      <div 
                        key={evt.id} 
                        onClick={() => setDetailEvent(evt)}
                        onDoubleClick={() => handleEditEvent(evt)}
                        className={`p-4 ${colorStyle.cardBg} border-l-4 ${colorStyle.border} cursor-pointer hover:opacity-95 transition-all`}
                        title={`${evt.title} (Klik untuk rincian, klik 2x untuk edit)`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">
                          ☀️ Acara Sepanjang Hari
                        </span>
                        <h4 className="text-base font-black text-slate-900 dark:text-white mt-1">{evt.title}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{evt.description}</p>
                      </div>
                    );
                  })}

                  {/* Hourly slots */}
                  {HOURS.map(hour => {
                    const dStr = formatIsoDate(currentDate);
                    const slotEvents = (eventsByDate.get(dStr) || []).filter(e => {
                      if (e.is_all_day || !e.start_time) return false;
                      return parseInt(e.start_time.split(':')[0], 10) === hour;
                    });

                    return (
                      <div key={hour} className="flex min-h-[60px] hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="w-20 p-3 text-right text-xs font-bold text-slate-400 border-r border-slate-200 dark:border-slate-800 shrink-0">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                        <div 
                          onClick={() => handleOpenAddEvent(dStr, hour)}
                          className="flex-1 p-2 space-y-2 cursor-pointer"
                        >
                          {slotEvents.map(evt => {
                            const colorStyle = resolveEventColorStyle(evt, categoryConfig);
                            return (
                              <div
                                key={evt.id}
                                onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                onDoubleClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                                className={`p-3 rounded-xl border ${colorStyle.cardBg} ${colorStyle.border} border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-all`}
                                title={`${evt.title} (Klik untuk rincian, klik 2x untuk edit)`}
                              >
                                <div className="flex justify-between items-start">
                                  <h4 className="text-sm font-black text-slate-900 dark:text-white">{evt.title}</h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorStyle.badgeBg} ${colorStyle.badgeText} flex items-center gap-1`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${colorStyle.dot}`}></span>
                                    {colorStyle.label}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {evt.start_time} - {evt.end_time}</span>
                                  {evt.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {evt.location}</span>}
                                  {evt.pic && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {evt.pic}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. AGENDA / SCHEDULE LIST VIEW (Optimized for Mobile Readability) */}
            {calendarView === 'agenda' && (
              <div className="space-y-2">
                {filteredEvents.length === 0 ? (
                  <div className="bg-white dark:bg-[#1a2332] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      <CalendarDays className="w-7 h-7" />
                    </div>
                    <h3 className="font-black text-slate-800 dark:text-slate-200">Tidak ada agenda ditemukan</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Belum ada jadwal yang cocok dengan filter atau pencarian Anda.
                    </p>
                    <button
                      onClick={() => handleOpenAddEvent()}
                      className="bg-primary-500 hover:bg-primary-600 text-white px-2 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Agenda Sekarang
                    </button>
                  </div>
                ) : (
                  Array.from(eventsByDate.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([dateKey, dayEvts]) => {
                      const dateObj = new Date(dateKey + 'T00:00:00');
                      const isTod = isToday(dateObj);

                      return (
                        <div key={dateKey} className="space-y-2">
                          
                          {/* Date Header Pill */}
                          <div className="flex items-center gap-2 sticky top-2 z-10 bg-slate-50/95 dark:bg-[#0f172a]/95 backdrop-blur-sm py-1.5 px-2 rounded-xl">
                            <span className={`text-xs font-black px-3 py-1 rounded-lg ${
                              isTod
                                ? 'bg-primary-500 text-white shadow-sm'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                            }`}>
                              {DAYS_FULL_NAME[dateObj.getDay()]}, {dateObj.getDate()} {MONTHS_ID[dateObj.getMonth()]} {dateObj.getFullYear()}
                            </span>
                            {isTod && (
                              <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                • Hari Ini
                              </span>
                            )}
                            <div className="flex-1 h-px bg-slate-200 dark:border-slate-800"></div>
                            <span className="text-[10px] font-bold text-slate-400">
                              {dayEvts.length} Agenda
                            </span>
                          </div>

                          {/* Event Cards for this Day */}
                          <div className="space-y-3">
                            {dayEvts.map(evt => {
                              const colorStyle = resolveEventColorStyle(evt, categoryConfig);
                              return (
                                <div
                                  key={evt.id}
                                  onClick={() => setDetailEvent(evt)}
                                  onDoubleClick={() => handleEditEvent(evt)}
                                  className={`p-2 sm:p-3 rounded-2xl border ${colorStyle.cardBg} ${colorStyle.border} border-l-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3`}
                                  title={`${evt.title} (Klik untuk rincian, klik 2x untuk edit)`}
                                >
                                  <div>
                                    {/* Top badges */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-2">
                                        {evt.is_all_day ? (
                                          <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-300 dark:border-amber-800">
                                            <Sun className="w-3 h-3 text-amber-500" /> Sepanjang Hari
                                          </span>
                                        ) : (
                                          <span className="bg-white/80 dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-slate-200 dark:border-slate-700">
                                            <Clock className="w-3 h-3 text-primary-500" /> {evt.start_time} - {evt.end_time || 'Selesai'}
                                          </span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorStyle.badgeBg} ${colorStyle.badgeText} flex items-center gap-1`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${colorStyle.dot}`}></span>
                                          {colorStyle.label}
                                        </span>
                                      </div>

                                      {/* Quick action buttons */}
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                                          className="p-1.5 text-slate-500 hover:text-primary-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                          title="Edit Agenda"
                                        >
                                          <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteEvent(evt.id); }}
                                          className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                          title="Hapus Agenda"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Title & Description */}
                                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mb-1">
                                      {evt.title}
                                    </h3>
                                    {evt.description && (
                                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                        {evt.description}
                                      </p>
                                    )}
                                  </div>

                                  {/* Meta footer */}
                                  <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    <div className="flex flex-wrap items-center gap-3">
                                      {evt.location && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3.5 h-3.5 text-primary-500" />
                                          {evt.location}
                                        </span>
                                      )}
                                      {evt.pic && (
                                        <span className="flex items-center gap-1">
                                          <User className="w-3.5 h-3.5 text-slate-400" />
                                          PIC: <strong>{evt.pic}</strong>
                                        </span>
                                      )}
                                    </div>

                                    {evt.attachments && evt.attachments.length > 0 && (
                                      <span className="text-[11px] font-bold text-primary-600 dark:text-primary-400 flex items-center gap-1 bg-white/70 dark:bg-slate-900/50 px-2 py-0.5 rounded-md">
                                        <FileText className="w-3.5 h-3.5" />
                                        {evt.attachments.length} Lampiran
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* PROJECT & INITIATIVE TAB */}
      {activeTab === 'project' && (
        <div className="space-y-4">
          
          {/* 6 Tabs Sub-Navigation for Project Statuses */}
          <div className="bg-white dark:bg-[#1a2332] p-1.5 sm:p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
              {PROJECT_STATUS_TABS.map(tab => {
                const isActive = projectStatusFilter === tab.id;
                const count = statusCounts[tab.id] || 0;
                
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProjectStatusFilter(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 select-none ${
                      isActive
                        ? `bg-slate-100 dark:bg-slate-800 ${tab.activeText} shadow-xs ring-1 ring-slate-200 dark:ring-slate-700`
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${tab.dot} shrink-0`}></span>
                    <span>{tab.label}</span>
                    {tab.subLabel && (
                      <span className="hidden md:inline text-[10px] opacity-60 font-normal">
                        ({tab.subLabel})
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                      isActive
                        ? 'bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controls Bar for Projects (View Switcher, Secondary Filters & Actions) */}
          <div className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
            {/* Left: View Switcher (Grid | Kanban | Gantt Chart) + Secondary Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented View Mode Switcher */}
              <div className="inline-flex items-center bg-slate-100 dark:bg-[#0f172a] p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0">
                <button
                  type="button"
                  onClick={() => handleChangeProjectViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectViewMode === 'grid'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Kartu (Grid)"
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span>Kartu</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeProjectViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectViewMode === 'kanban'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Papan Kanban (Drag & Drop Status)"
                >
                  <Columns className="w-3.5 h-3.5 shrink-0" />
                  <span>Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeProjectViewMode('gantt')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectViewMode === 'gantt'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Timeline Gantt Chart"
                >
                  <CalendarRange className="w-3.5 h-3.5 shrink-0" />
                  <span>Gantt Chart</span>
                </button>
              </div>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block mx-0.5" />

              <select
                value={projectPriorityFilter}
                onChange={(e) => setProjectPriorityFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 outline-none bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-w-[130px]"
              >
                <option value="all">Semua Urgensi</option>
                <option value="low">Rendah (Low)</option>
                <option value="medium">Sedang (Medium)</option>
                <option value="high">Tinggi (High)</option>
                <option value="urgent">Mendesak (Urgent)</option>
              </select>
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 outline-none bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-w-[130px]"
              >
                <option value="all">Semua Pembuat</option>
                {[...new Set(projects.map(p => p.created_by).filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            {/* Right Actions: Search & Add */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari project / PIC / kategori..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddProject()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Project</span>
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* VIEW 1: GRID / CARD VIEW */}
          {/* ================================================================= */}
          {projectViewMode === 'grid' && (
            filteredProjects.length === 0 ? (
              <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Tidak ada project pada status ini
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {searchQuery
                    ? `Tidak ada project yang cocok dengan pencarian "${searchQuery}"`
                    : 'Belum ada project yang terdaftar dalam status ini.'}
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAddProject()}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  + Buat Project Baru
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProjects.map(proj => {
                  const stCfg = PROJECT_STATUS_CONFIG[proj.status] || PROJECT_STATUS_CONFIG.in_progress;
                  const priCfg = PROJECT_PRIORITY_CONFIG[proj.priority] || PROJECT_PRIORITY_CONFIG.medium;
                  const totalTasks = proj.tasks.length;
                  const completedTasks = proj.tasks.filter(t => t.is_completed).length;

                  return (
                    <div
                      key={proj.id}
                      className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Header: Status, Priority & Actions */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select
                              value={proj.status}
                              onChange={(e) => handleQuickStatusChange(proj, e.target.value as ProjectStatus)}
                              className={`text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-wider cursor-pointer border-none outline-none appearance-none ${stCfg.badge}`}
                            >
                              <option value="planned">MULAI (PLANNED)</option>
                              <option value="in_progress">BERJALAN (IN PROGRESS)</option>
                              <option value="review">EVALUASI (REVIEW)</option>
                              <option value="completed">SELESAI (COMPLETED)</option>
                              <option value="on_hold">DITUNDA (ON HOLD)</option>
                            </select>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${priCfg.color}`}>
                              {priCfg.label}
                            </span>
                            {proj.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
                                {proj.category}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenAddProject(proj)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                              title="Edit Project"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(proj.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                              title="Hapus Project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Desc */}
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-1.5">
                          {proj.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                          {proj.description || 'Tidak ada deskripsi rinci.'}
                        </p>

                        {/* Progress Bar */}
                        <div className="space-y-1.5 mb-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-slate-500">Progres Pelaksanaan</span>
                            <span className="text-primary-600 dark:text-primary-400 font-mono tabular-nums">{proj.progress}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary-500 to-amber-500 rounded-full transition-all duration-500"
                              style={{ width: `${proj.progress}%` }}
                            ></div>
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium font-mono tabular-nums">
                            {completedTasks} dari {totalTasks} checklist tugas selesai
                          </div>
                        </div>

                        {/* Interactive Task Checklist (Quick tap) */}
                        {proj.tasks.length > 0 && (
                          <div className="space-y-1.5 mb-2">
                            <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                              Checklist Tugas:
                            </span>
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {proj.tasks.map(task => (
                                <div
                                  key={task.id}
                                  onClick={() => handleToggleTask(proj, task.id)}
                                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs transition-colors"
                                >
                                  {task.is_completed ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                  )}
                                  <span className={`truncate ${task.is_completed ? 'line-through text-slate-400' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                                    {task.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Project Footer Meta */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <User className="w-3.5 h-3.5" />
                          <span className="font-bold">{proj.pic || 'Tim Gudang'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono tabular-nums text-[11px]">
                          {proj.start_date && (
                            <span className="text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              {proj.start_date}
                            </span>
                          )}
                          {proj.deadline && (
                            <span className="text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md">
                              Tenggat: {proj.deadline}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ================================================================= */}
          {/* VIEW 2: KANBAN BOARD VIEW */}
          {/* ================================================================= */}
          {projectViewMode === 'kanban' && (() => {
            const kanbanColumns: {
              id: ProjectStatus;
              label: string;
              subLabel: string;
              dot: string;
              headerBorder: string;
              headerBg: string;
              countBadge: string;
            }[] = [
              {
                id: 'planned',
                label: 'Mulai',
                subLabel: 'Planned',
                dot: 'bg-slate-400',
                headerBorder: 'border-t-4 border-t-slate-400',
                headerBg: 'bg-slate-50/80 dark:bg-slate-800/50',
                countBadge: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              },
              {
                id: 'in_progress',
                label: 'Berjalan',
                subLabel: 'In Progress',
                dot: 'bg-blue-500',
                headerBorder: 'border-t-4 border-t-blue-500',
                headerBg: 'bg-blue-50/50 dark:bg-blue-950/20',
                countBadge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              },
              {
                id: 'review',
                label: 'Evaluasi',
                subLabel: 'Review',
                dot: 'bg-amber-500',
                headerBorder: 'border-t-4 border-t-amber-500',
                headerBg: 'bg-amber-50/50 dark:bg-amber-950/20',
                countBadge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
              },
              {
                id: 'completed',
                label: 'Selesai',
                subLabel: 'Completed',
                dot: 'bg-emerald-500',
                headerBorder: 'border-t-4 border-t-emerald-500',
                headerBg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
                countBadge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
              },
              {
                id: 'on_hold',
                label: 'Ditunda',
                subLabel: 'On Hold',
                dot: 'bg-purple-500',
                headerBorder: 'border-t-4 border-t-purple-500',
                headerBg: 'bg-purple-50/50 dark:bg-purple-950/20',
                countBadge: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
              }
            ];

            const statusOrder: ProjectStatus[] = ['planned', 'in_progress', 'review', 'completed', 'on_hold'];

            return (
              <div className="space-y-3">
                {/* Info helper bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Tarik & lepas (<strong>Drag & Drop</strong>) kartu antar kolom atau klik panah status untuk memindahkan tahap project.
                    </span>
                  </div>
                  {projectStatusFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setProjectStatusFilter('all')}
                      className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Tampilkan Semua Kolom Penuh ({ baseFilteredProjects.length })</span>
                    </button>
                  )}
                </div>

                {/* Responsive 5-Column Kanban Board */}
                <div className="flex xl:grid xl:grid-cols-5 gap-3.5 overflow-x-auto pb-4 snap-x snap-mandatory">
                  {kanbanColumns.map((col) => {
                    const colProjects = baseFilteredProjects.filter(p => p.status === col.id);
                    const isFilteredOut = projectStatusFilter !== 'all' && projectStatusFilter !== col.id;
                    const isDragTarget = dragOverColumn === col.id;
                    const avgProgress = colProjects.length > 0
                      ? Math.round(colProjects.reduce((acc, p) => acc + (p.progress || 0), 0) / colProjects.length)
                      : 0;

                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverColumn !== col.id) setDragOverColumn(col.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverColumn === col.id) setDragOverColumn(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverColumn(null);
                          const droppedId = e.dataTransfer.getData('text/plain') || draggedProjectId;
                          setDraggedProjectId(null);
                          if (!droppedId) return;
                          const targetProj = projects.find(p => p.id === droppedId);
                          if (targetProj && targetProj.status !== col.id) {
                            handleQuickStatusChange(targetProj, col.id);
                          }
                        }}
                        className={`min-w-[285px] sm:min-w-[300px] xl:min-w-0 flex-1 snap-start rounded-2xl border bg-slate-50/70 dark:bg-[#131c2b] flex flex-col transition-all ${col.headerBorder} ${
                          isDragTarget
                            ? 'ring-2 ring-indigo-500 border-indigo-400 dark:border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20'
                            : 'border-slate-200 dark:border-slate-800'
                        } ${isFilteredOut ? 'opacity-45 hover:opacity-95' : ''}`}
                      >
                        {/* Column Header */}
                        <div className={`p-3 rounded-t-xl border-b border-slate-200/80 dark:border-slate-800 ${col.headerBg}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${col.dot} shrink-0`} />
                              <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                                {col.label}
                              </h4>
                              <span className="text-[10px] text-slate-400 font-medium truncate">
                                ({col.subLabel})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-mono tabular-nums font-black px-2 py-0.5 rounded-full ${col.countBadge}`}>
                                {colProjects.length}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenAddProject(undefined, col.id)}
                                className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 transition-colors cursor-pointer"
                                title={`Tambah Project di kolom ${col.label}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Column mini progress bar */}
                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>Rata-rata Progres</span>
                            <span className="font-bold">{avgProgress}%</span>
                          </div>
                          <div className="w-full h-1 bg-slate-200/80 dark:bg-slate-700/70 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${col.dot} transition-all duration-300`}
                              style={{ width: `${avgProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Column Cards List */}
                        <div className="p-2.5 space-y-2.5 flex-1 min-h-[260px] max-h-[70vh] overflow-y-auto">
                          {colProjects.length === 0 ? (
                            <div className="h-44 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-4 text-center text-slate-400">
                              <p className="text-[11px] font-semibold">Belum ada project</p>
                              <p className="text-[10px] mt-0.5">Tarik kartu ke sini atau</p>
                              <button
                                type="button"
                                onClick={() => handleOpenAddProject(undefined, col.id)}
                                className="mt-2 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer"
                              >
                                + Buat di {col.label}
                              </button>
                            </div>
                          ) : (
                            colProjects.map((proj) => {
                              const priCfg = PROJECT_PRIORITY_CONFIG[proj.priority] || PROJECT_PRIORITY_CONFIG.medium;
                              const totalTasks = proj.tasks.length;
                              const completedTasks = proj.tasks.filter(t => t.is_completed).length;
                              const currentIdx = statusOrder.indexOf(proj.status);
                              const prevStatus = currentIdx > 0 ? statusOrder[currentIdx - 1] : null;
                              const nextStatus = currentIdx < statusOrder.length - 1 ? statusOrder[currentIdx + 1] : null;
                              const isOverdue = proj.deadline && proj.status !== 'completed' && proj.deadline < formatIsoDate(new Date());

                              return (
                                <div
                                  key={proj.id}
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggedProjectId(proj.id);
                                    e.dataTransfer.setData('text/plain', proj.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onDragEnd={() => {
                                    setDraggedProjectId(null);
                                    setDragOverColumn(null);
                                  }}
                                  className={`bg-white dark:bg-[#1a2332] rounded-xl border p-3.5 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing flex flex-col justify-between gap-2.5 ${
                                    draggedProjectId === proj.id
                                      ? 'opacity-50 ring-2 ring-indigo-500 border-indigo-400'
                                      : 'border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <div>
                                    {/* Top Row: Priority, Category & Actions */}
                                    <div className="flex items-center justify-between gap-1.5 mb-2">
                                      <div className="flex flex-wrap items-center gap-1 min-w-0">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${priCfg.color}`}>
                                          {priCfg.label}
                                        </span>
                                        {proj.category && (
                                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[110px]">
                                            {proj.category}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        {prevStatus && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleQuickStatusChange(proj, prevStatus);
                                            }}
                                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                            title={`Pindah ke ${PROJECT_STATUS_CONFIG[prevStatus].label}`}
                                          >
                                            <ChevronLeft className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {nextStatus && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleQuickStatusChange(proj, nextStatus);
                                            }}
                                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                            title={`Maju ke ${PROJECT_STATUS_CONFIG[nextStatus].label}`}
                                          >
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenAddProject(proj);
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                          title="Edit Project"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteProject(proj.id);
                                          }}
                                          className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md cursor-pointer"
                                          title="Hapus Project"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Title & Description */}
                                    <h5
                                      onClick={() => handleOpenAddProject(proj)}
                                      className="text-xs sm:text-sm font-black text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer leading-snug mb-1"
                                    >
                                      {proj.title}
                                    </h5>
                                    {proj.description && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                                        {proj.description}
                                      </p>
                                    )}

                                    {/* Compact Progress Bar */}
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                                      <div className="flex items-center justify-between text-[10px] font-bold">
                                        <span className="text-slate-500 dark:text-slate-400">
                                          {totalTasks > 0 ? `${completedTasks}/${totalTasks} Tugas` : 'Progres'}
                                        </span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
                                          {proj.progress}%
                                        </span>
                                      </div>
                                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            proj.progress === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                                          }`}
                                          style={{ width: `${proj.progress}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Mini Task Checklist */}
                                    {proj.tasks.length > 0 && (
                                      <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-0.5">
                                        {proj.tasks.map((task) => (
                                          <div
                                            key={task.id}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleTask(proj, task.id);
                                            }}
                                            className="flex items-center gap-1.5 p-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer text-[11px] transition-colors"
                                          >
                                            {task.is_completed ? (
                                              <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            ) : (
                                              <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            )}
                                            <span className={`truncate ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200 font-medium'}`}>
                                              {task.title}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Card Footer */}
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate">
                                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="font-bold truncate">{proj.pic || 'Tim Gudang'}</span>
                                    </div>
                                    {proj.deadline && (
                                      <span className={`font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                        isOverdue
                                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                      }`}>
                                        {proj.deadline.slice(5)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ================================================================= */}
          {/* VIEW 3: GANTT CHART TIMELINE VIEW */}
          {/* ================================================================= */}
          {projectViewMode === 'gantt' && (() => {
            const dayWidth = ganttScale === 'day' ? 40 : ganttScale === 'week' ? 24 : 14;
            const totalDaysBefore = ganttScale === 'day' ? 7 : ganttScale === 'week' ? 14 : 30;
            const totalWindowDays = ganttScale === 'day' ? 35 : ganttScale === 'week' ? 60 : 120;

            const todayObj = new Date();
            todayObj.setHours(0, 0, 0, 0);
            const todayStr = formatIsoDate(todayObj);

            // Compute timeline start date based on today + offset (or earliest project start_date)
            const windowStart = new Date(todayObj);
            windowStart.setDate(todayObj.getDate() - totalDaysBefore + ganttOffsetDays);
            windowStart.setHours(0, 0, 0, 0);

            const timelineDays: {
              date: Date;
              dateStr: string;
              dayNum: number;
              dayName: string;
              monthLabel: string;
              isWeekend: boolean;
              isToday: boolean;
            }[] = [];

            for (let i = 0; i < totalWindowDays; i++) {
              const d = new Date(windowStart);
              d.setDate(windowStart.getDate() + i);
              const dStr = formatIsoDate(d);
              const dow = d.getDay();
              timelineDays.push({
                date: d,
                dateStr: dStr,
                dayNum: d.getDate(),
                dayName: DAYS_NAME[dow],
                monthLabel: `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`,
                isWeekend: dow === 0 || dow === 6,
                isToday: dStr === todayStr
              });
            }

            // Group consecutive days by Month Label for the top header row
            const monthGroups: { label: string; count: number }[] = [];
            timelineDays.forEach((td) => {
              const last = monthGroups[monthGroups.length - 1];
              if (last && last.label === td.monthLabel) {
                last.count++;
              } else {
                monthGroups.push({ label: td.monthLabel, count: 1 });
              }
            });

            const parseDateSafe = (str?: string, fallback?: Date): Date => {
              if (str && /^\d{4}-\d{2}-\d{2}/.test(str)) {
                const [y, m, d] = str.slice(0, 10).split('-').map(Number);
                const parsed = new Date(y, m - 1, d);
                if (!isNaN(parsed.getTime())) {
                  parsed.setHours(0, 0, 0, 0);
                  return parsed;
                }
              }
              return fallback ? new Date(fallback) : new Date(todayObj);
            };

            const diffDaysBetween = (start: Date, end: Date): number => {
              return Math.round((end.getTime() - start.getTime()) / 86400000);
            };

            const todayColIdx = timelineDays.findIndex(d => d.isToday);

            const statusBarStyles: Record<ProjectStatus, { track: string; fill: string; border: string; text: string }> = {
              planned: {
                track: 'bg-slate-200 dark:bg-slate-700/80',
                fill: 'bg-slate-500 dark:bg-slate-400',
                border: 'border-slate-300 dark:border-slate-600',
                text: 'text-slate-800 dark:text-slate-100'
              },
              in_progress: {
                track: 'bg-indigo-100 dark:bg-indigo-950/80',
                fill: 'bg-indigo-600 dark:bg-indigo-500',
                border: 'border-indigo-300 dark:border-indigo-700',
                text: 'text-indigo-950 dark:text-indigo-100'
              },
              review: {
                track: 'bg-amber-100 dark:bg-amber-950/80',
                fill: 'bg-amber-500 dark:bg-amber-500',
                border: 'border-amber-300 dark:border-amber-700',
                text: 'text-amber-950 dark:text-amber-100'
              },
              completed: {
                track: 'bg-emerald-100 dark:bg-emerald-950/80',
                fill: 'bg-emerald-600 dark:bg-emerald-500',
                border: 'border-emerald-300 dark:border-emerald-700',
                text: 'text-emerald-950 dark:text-emerald-100'
              },
              on_hold: {
                track: 'bg-purple-100 dark:bg-purple-950/80',
                fill: 'bg-purple-600 dark:bg-purple-500',
                border: 'border-purple-300 dark:border-purple-700',
                text: 'text-purple-950 dark:text-purple-100'
              }
            };

            return (
              <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Gantt Top Toolbar */}
                <div className="p-3 sm:px-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Timeline Gantt Chart</span>
                    </span>
                    {/* Scale Switcher */}
                    <div className="inline-flex items-center bg-white dark:bg-[#0f172a] p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      {([
                        { id: 'day', label: 'Harian' },
                        { id: 'week', label: 'Mingguan' },
                        { id: 'month', label: 'Bulanan' }
                      ] as const).map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => setGanttScale(sc.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                            ganttScale === sc.id
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>

                    {/* Date Range Navigation */}
                    <div className="inline-flex items-center gap-1 bg-white dark:bg-[#0f172a] p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setGanttOffsetDays(prev => prev - (ganttScale === 'day' ? 7 : ganttScale === 'week' ? 14 : 30))}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Geser Mundur"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGanttOffsetDays(0)}
                        className="px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                      >
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => setGanttOffsetDays(prev => prev + (ganttScale === 'day' ? 7 : ganttScale === 'week' ? 14 : 30))}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Geser Maju"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Status Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400" /> Mulai
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-600" /> Berjalan
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Evaluasi
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Selesai
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> Ditunda
                    </span>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="p-12 text-center">
                    <CalendarRange className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Tidak ada project untuk ditampilkan di Gantt Chart
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Tambahkan project baru atau ubah filter pencarian di atas.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row w-full overflow-hidden">
                    {/* Left Fixed Column: Project & Sub-task List */}
                    <div className="w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2332] z-10">
                      {/* Left Column Header (matches height of 2-tier right header: 60px) */}
                      <div className="h-[60px] px-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131c2b] flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span>Daftar Project ({filteredProjects.length})</span>
                        <span>Progres</span>
                      </div>

                      {/* Left Column Rows */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {filteredProjects.map((proj) => {
                          const isExpanded = !!expandedGanttProjects[proj.id];
                          const hasTasks = proj.tasks && proj.tasks.length > 0;
                          const stDot = PROJECT_STATUS_TABS.find(t => t.id === proj.status)?.dot || 'bg-indigo-500';

                          return (
                            <React.Fragment key={proj.id}>
                              <div className="h-[52px] px-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  {hasTasks ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedGanttProjects(prev => ({ ...prev, [proj.id]: !prev[proj.id] }))}
                                      className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                                      title={isExpanded ? 'Sembunyikan checklist tugas' : `Tampilkan ${proj.tasks.length} checklist tugas`}
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <span className="w-5 shrink-0" />
                                  )}
                                  <span className={`w-2 h-2 rounded-full ${stDot} shrink-0`} />
                                  <div
                                    onClick={() => handleOpenAddProject(proj)}
                                    className="min-w-0 flex-1 cursor-pointer group"
                                  >
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                      {proj.title}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate">
                                      <span>{proj.pic || 'Tim Gudang'}</span>
                                      {hasTasks && (
                                        <span className="font-mono tabular-nums text-slate-400">
                                          • {proj.tasks.filter(t => t.is_completed).length}/{proj.tasks.length} task
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-xs font-mono tabular-nums font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                                  {proj.progress}%
                                </span>
                              </div>

                              {/* Sub-task rows on Left */}
                              {isExpanded && proj.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  onClick={() => handleToggleTask(proj, task.id)}
                                  className="h-[36px] pl-9 pr-3 bg-slate-50/70 dark:bg-[#131c2b]/70 flex items-center justify-between gap-2 text-[11px] hover:bg-slate-100/80 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {task.is_completed ? (
                                      <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    )}
                                    <span className={`truncate ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300 font-medium'}`}>
                                      {task.title}
                                    </span>
                                  </div>
                                  <span className={`text-[10px] font-mono tabular-nums shrink-0 ${task.is_completed ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                                    {task.is_completed ? 'Selesai' : 'Pending'}
                                  </span>
                                </div>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Scrollable Timeline Area */}
                    <div className="flex-1 overflow-x-auto relative">
                      <div
                        className="relative"
                        style={{ width: `${timelineDays.length * dayWidth}px`, minWidth: '100%' }}
                      >
                        {/* Timeline 2-Tier Header (60px total height) */}
                        <div className="h-[60px] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131c2b] select-none">
                          {/* Tier 1: Month & Year */}
                          <div className="flex h-[28px] border-b border-slate-200/70 dark:border-slate-800">
                            {monthGroups.map((mg, idx) => (
                              <div
                                key={idx}
                                style={{ width: `${mg.count * dayWidth}px` }}
                                className="px-2 flex items-center text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200/70 dark:border-slate-800 truncate"
                              >
                                {mg.label}
                              </div>
                            ))}
                          </div>
                          {/* Tier 2: Day cells */}
                          <div className="flex h-[32px]">
                            {timelineDays.map((td) => (
                              <div
                                key={td.dateStr}
                                style={{ width: `${dayWidth}px` }}
                                className={`shrink-0 border-r border-slate-200/50 dark:border-slate-800/70 flex flex-col items-center justify-center font-mono tabular-nums ${
                                  td.isToday
                                    ? 'bg-indigo-600 text-white font-black'
                                    : td.isWeekend
                                    ? 'bg-slate-100/80 dark:bg-slate-900/50 text-slate-400'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                                title={`${td.dayName}, ${td.dateStr}`}
                              >
                                <span className="text-[10px] leading-none font-bold">{td.dayNum}</span>
                                {ganttScale === 'day' && (
                                  <span className={`text-[8px] leading-none mt-0.5 ${td.isToday ? 'text-indigo-100' : 'opacity-70'}`}>
                                    {td.dayName.slice(0, 2)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Vertical Today Marker Line */}
                        {todayColIdx >= 0 && (
                          <div
                            style={{ left: `${todayColIdx * dayWidth + dayWidth / 2}px` }}
                            className="absolute top-[60px] bottom-0 w-0.5 bg-rose-500/80 z-20 pointer-events-none"
                          >
                            <div className="w-2 h-2 rounded-full bg-rose-500 -ml-[3px] -mt-1" />
                          </div>
                        )}

                        {/* Timeline Body Rows */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 relative">
                          {filteredProjects.map((proj) => {
                            const rawStart = proj.start_date || (proj.created_at ? proj.created_at.slice(0, 10) : todayStr);
                            const startDateObj = parseDateSafe(rawStart, todayObj);
                            const defaultEnd = new Date(startDateObj);
                            defaultEnd.setDate(startDateObj.getDate() + 7);
                            const endDateObj = proj.deadline ? parseDateSafe(proj.deadline, defaultEnd) : defaultEnd;

                            const actualStart = startDateObj <= endDateObj ? startDateObj : endDateObj;
                            const actualEnd = startDateObj <= endDateObj ? endDateObj : startDateObj;

                            const startOffsetDays = diffDaysBetween(windowStart, actualStart);
                            const durationDays = Math.max(1, diffDaysBetween(actualStart, actualEnd) + 1);

                            const barLeft = startOffsetDays * dayWidth;
                            const barWidth = Math.max(dayWidth, durationDays * dayWidth);
                            const barStyle = statusBarStyles[proj.status] || statusBarStyles.in_progress;
                            const isExpanded = !!expandedGanttProjects[proj.id];

                            return (
                              <React.Fragment key={proj.id}>
                                {/* Main Project Timeline Row (52px height) */}
                                <div className="h-[52px] relative flex items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                                  {/* Background Grid Columns */}
                                  <div className="absolute inset-0 flex pointer-events-none">
                                    {timelineDays.map((td) => (
                                      <div
                                        key={td.dateStr}
                                        style={{ width: `${dayWidth}px` }}
                                        className={`shrink-0 border-r border-slate-100 dark:border-slate-800/50 h-full ${
                                          td.isWeekend ? 'bg-slate-50/60 dark:bg-slate-900/25' : ''
                                        }`}
                                      />
                                    ))}
                                  </div>

                                  {/* Gantt Bar */}
                                  <div
                                    onClick={() => handleOpenAddProject(proj)}
                                    style={{
                                      left: `${barLeft + 2}px`,
                                      width: `${Math.max(24, barWidth - 4)}px`
                                    }}
                                    className={`absolute h-[30px] rounded-lg border ${barStyle.track} ${barStyle.border} shadow-2xs hover:shadow-md transition-all cursor-pointer overflow-hidden flex items-center z-10 group`}
                                    title={`${proj.title} (${ formatIsoDate(actualStart) } s/d ${ formatIsoDate(actualEnd) } • ${durationDays} hari • Progres ${proj.progress}%)`}
                                  >
                                    {/* Inner Progress Fill */}
                                    <div
                                      style={{ width: `${Math.min(100, Math.max(0, proj.progress))}%` }}
                                      className={`absolute inset-y-0 left-0 ${barStyle.fill} opacity-30 dark:opacity-45 transition-all duration-300`}
                                    />
                                    {/* Left Accent Strip */}
                                    <div className={`w-1.5 h-full ${barStyle.fill} shrink-0`} />
                                    {/* Bar Label */}
                                    <div className={`px-2 flex items-center justify-between gap-2 w-full text-[11px] font-bold ${barStyle.text} relative z-10 truncate`}>
                                      <span className="truncate">{proj.title}</span>
                                      <span className="font-mono tabular-nums text-[10px] font-black shrink-0">
                                        {proj.progress}% ({durationDays}h)
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Sub-task Milestone Rows (36px height each) */}
                                {isExpanded && proj.tasks.map((task, tIdx) => {
                                  const taskCount = Math.max(1, proj.tasks.length);
                                  const sliceDays = Math.max(1, Math.floor(durationDays / taskCount));
                                  const tStartOffset = startOffsetDays + Math.min(durationDays - 1, tIdx * sliceDays);
                                  const tDuration = tIdx === taskCount - 1
                                    ? Math.max(1, durationDays - tIdx * sliceDays)
                                    : sliceDays;

                                  return (
                                    <div
                                      key={task.id}
                                      onClick={() => handleToggleTask(proj, task.id)}
                                      className="h-[36px] relative flex items-center bg-slate-50/40 dark:bg-[#131c2b]/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 cursor-pointer"
                                    >
                                      <div className="absolute inset-0 flex pointer-events-none">
                                        {timelineDays.map((td) => (
                                          <div
                                            key={td.dateStr}
                                            style={{ width: `${dayWidth}px` }}
                                            className="shrink-0 border-r border-slate-100/80 dark:border-slate-800/40 h-full"
                                          />
                                        ))}
                                      </div>

                                      <div
                                        style={{
                                          left: `${tStartOffset * dayWidth + 4}px`,
                                          width: `${Math.max(20, tDuration * dayWidth - 8)}px`
                                        }}
                                        className={`absolute h-[20px] rounded-md px-2 flex items-center gap-1.5 text-[10px] font-semibold z-10 truncate border ${
                                          task.is_completed
                                            ? 'bg-emerald-100/90 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                        }`}
                                        title={`Sub-task: ${task.title} (${task.is_completed ? 'Selesai' : 'Belum selesai'})`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.is_completed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        <span className="truncate">{task.title}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-amber-500" />
                <span>Kumpulan Catatan &amp; Checklist</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                <span>Tarik &amp; geser kartu (<strong>Drag &amp; Drop</strong>) untuk mengatur posisi catatan, atau klik kotak centang untuk menandai selesai.</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenAddNote(undefined, true)}
                className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              >
                <CheckSquare className="w-4 h-4 text-emerald-500" />
                <span>+ Buat Checklist</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAddNote(undefined, false)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Buat Catatan Baru</span>
              </button>
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500/50 outline-none min-w-[140px] bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 font-bold"
              >
                <option value="all">Semua Pembuat</option>
                {[...new Set(notes.map(n => n.created_by).filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Note Input Bar (Google Keep Style) */}
          <div className="max-w-xl mx-auto w-full px-2">
            <div 
              onClick={() => handleOpenAddNote(undefined, false)}
              className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 transition-all group"
            >
              <div className="flex items-center gap-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                <StickyNote className="w-5 h-5 text-amber-500 shrink-0" />
                <span className="text-xs sm:text-sm font-medium">Tulis catatan atau daftar checklist cepat...</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAddNote(undefined, true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  title="Buat catatan dengan daftar kotak centang (Checklist)"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Checklist</span>
                </button>
                <span className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:text-amber-600 font-bold text-xs flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Catat</span>
                </span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-6">
            {filteredNotes.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white dark:bg-[#1a2332] rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <StickyNote className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-bold text-lg mb-1">Belum ada catatan.</p>
                <p className="text-sm">Klik tombol + Buat Catatan Baru atau + Buat Checklist di atas.</p>
              </div>
            ) : (
              filteredNotes.map((note, noteIdx) => {
                const checklist = note.checklist || [];
                const completedCount = checklist.filter(c => c.is_completed).length;
                const isDragging = draggedNoteId === note.id;
                const isDragOver = dragOverNoteId === note.id && draggedNoteId !== note.id;
                const prevNote = noteIdx > 0 ? filteredNotes[noteIdx - 1] : null;
                const nextNote = noteIdx < filteredNotes.length - 1 ? filteredNotes[noteIdx + 1] : null;

                return (
                  <div 
                    key={note.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedNoteId(note.id);
                      e.dataTransfer.setData('text/plain', note.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverNoteId !== note.id) setDragOverNoteId(note.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverNoteId === note.id) setDragOverNoteId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourceId = e.dataTransfer.getData('text/plain') || draggedNoteId;
                      setDraggedNoteId(null);
                      setDragOverNoteId(null);
                      if (sourceId && sourceId !== note.id) {
                        handleMoveNoteOrder(sourceId, note.id);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedNoteId(null);
                      setDragOverNoteId(null);
                    }}
                    onClick={() => handleOpenAddNote(note)}
                    className={`relative p-5 rounded-2xl shadow-sm border-2 group hover:-translate-y-0.5 hover:shadow-xl transition-all cursor-grab active:cursor-grabbing flex flex-col min-h-[210px] ${
                      note.color === 'yellow' ? 'bg-[#fef9c3] border-[#fef08a] text-[#854d0e]' :
                      note.color === 'blue' ? 'bg-[#e0f2fe] border-[#bae6fd] text-[#075985]' :
                      note.color === 'green' ? 'bg-[#dcfce7] border-[#bbf7d0] text-[#166534]' :
                      note.color === 'pink' ? 'bg-[#fce7f3] border-[#fbcfe8] text-[#9d174d]' :
                      note.color === 'purple' ? 'bg-[#f3e8ff] border-[#e9d5ff] text-[#6b21a8]' :
                      'bg-[#ffedd5] border-[#fed7aa] text-[#9a3412]'
                    } ${isDragging ? 'opacity-40 scale-95 ring-2 ring-indigo-500' : ''} ${
                      isDragOver ? 'ring-4 ring-indigo-500 scale-[1.02]' : ''
                    }`}
                  >
                    {/* Pin/Clip Graphic */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-3 rounded-full bg-black/10 shadow-inner border border-black/5" />
                    
                    <div className="flex justify-between items-start mb-2.5 gap-2">
                      <div className="flex items-start gap-1.5 min-w-0 flex-1" title="Tarik untuk menggeser posisi catatan">
                        <GripVertical
                          className="w-4 h-4 mt-1 shrink-0 opacity-35 group-hover:opacity-80 cursor-grab"
                        />
                        <h3 className="font-black text-base sm:text-lg line-clamp-2 leading-tight">
                          {note.title || 'Tanpa Judul'}
                        </h3>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {prevNote && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveNoteOrder(note.id, prevNote.id);
                            }}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/10 text-black/50 hover:text-black transition-all cursor-pointer"
                            title="Geser maju / ke kiri"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {nextNote && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveNoteOrder(note.id, nextNote.id);
                            }}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/10 text-black/50 hover:text-black transition-all cursor-pointer"
                            title="Geser mundur / ke kanan"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/10 text-black/40 hover:text-red-600 transition-all cursor-pointer"
                          title="Hapus Catatan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Text Body */}
                    {note.content && (
                      <div className="text-xs sm:text-sm whitespace-pre-wrap mb-3 opacity-90 font-medium leading-relaxed">
                        {note.content}
                      </div>
                    )}

                    {/* Interactive Checklist Items on Sticky Note */}
                    {checklist.length > 0 && (
                      <div className="space-y-1.5 mb-4 flex-1">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider opacity-75 mb-1">
                          <span>Checklist</span>
                          <span className="font-mono tabular-nums">{completedCount}/{checklist.length} selesai</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-current opacity-60 transition-all duration-300"
                            style={{ width: `${Math.round((completedCount / checklist.length) * 100)}%` }}
                          />
                        </div>
                        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                          {checklist.map((item) => (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleNoteChecklistItem(note, item.id);
                              }}
                              className="flex items-start gap-2 p-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors cursor-pointer text-xs"
                            >
                              {item.is_completed ? (
                                <CheckSquare className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                              ) : (
                                <Square className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
                              )}
                              <span className={`leading-snug break-words ${item.is_completed ? 'line-through opacity-55' : 'font-semibold'}`}>
                                {item.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-auto pt-3 border-t border-black/10 flex justify-between items-center text-xs font-bold opacity-70">
                      <span className="flex items-center gap-1.5 bg-black/5 px-2 py-1 rounded-md">
                        <User className="w-3.5 h-3.5" /> {note.created_by}
                      </span>
                      <span className="font-mono tabular-nums">
                        {note.created_at ? new Date(note.created_at).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}) : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}


      {/* ===================================================================== */}
      {/* MODAL TAMBAH / EDIT AGENDA (DENGAN TOGGLE SEPANJANG HARI) */}
      {/* ===================================================================== */}
      {isAgendaModalOpen && editingEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
            
            {/* Modal Header */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary-500" />
                <h2 className="text-base sm:text-lg font-black dark:text-white">
                  {editingEvent.id ? 'Edit Agenda' : 'Tambah Agenda Baru'}
                </h2>
              </div>
              <button 
                onClick={() => setAgendaModalOpen(false)} 
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAgenda} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              
              {/* Judul Agenda */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Judul Agenda <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Meeting evaluasi stock opname atau serah terima kontainer"
                  value={editingEvent.title || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  className="w-full px-2 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              {/* Kategori Agenda Pills */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Kategori Agenda
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(categoryConfig) as AgendaCategory[]).map(catKey => {
                    const cfg = categoryConfig[catKey];
                    const isSelected = editingEvent.category === catKey;

                    return (
                      <button
                        type="button"
                        key={catKey}
                        onClick={() => setEditingEvent({ ...editingEvent, category: catKey })}
                        className={`p-2 rounded-xl text-xs font-bold border text-left flex items-center gap-2 transition-all ${
                          isSelected
                            ? `${cfg.badgeBg} ${cfg.badgeText} ${cfg.border} ring-2 ring-primary-500/50`
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                        <span className="truncate">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PILIH WARNA AGENDA */}
              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-primary-500" />
                    <span>Warna Agenda</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingEvent({ ...editingEvent, color: undefined })}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                      !editingEvent.color 
                        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-black' 
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    Ikuti Kategori
                  </button>
                </div>

                {/* Swatches */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {AGENDA_COLOR_OPTIONS.map(opt => {
                    const isSelected = editingEvent.color === opt.id || editingEvent.color === opt.hex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, color: opt.id })}
                        className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900 border-transparent shadow-xs scale-105 bg-white dark:bg-slate-800'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a2332]'
                        }`}
                        title={opt.label}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${opt.dot} shrink-0 flex items-center justify-center text-white`}>
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </span>
                        <span className={`text-[11px] ${isSelected ? 'text-slate-900 dark:text-white font-black' : 'text-slate-600 dark:text-slate-400'}`}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}

                  {/* Custom Hex Color Picker */}
                  <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 dark:border-slate-700">
                    <input
                      type="color"
                      value={editingEvent.color && editingEvent.color.startsWith('#') ? editingEvent.color : '#1a73e8'}
                      onChange={e => setEditingEvent({ ...editingEvent, color: e.target.value })}
                      className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      title="Pilih warna bebas / kustom"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">Custom</span>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Tampilan Bar Agenda:</span>
                  <div 
                    style={editingEvent.color && editingEvent.color.startsWith('#') ? { backgroundColor: editingEvent.color } : undefined}
                    className={`px-3 py-1 rounded-md text-white font-bold text-xs truncate max-w-[220px] shadow-xs ${
                      editingEvent.color && !editingEvent.color.startsWith('#')
                        ? (AGENDA_COLOR_OPTIONS.find(c => c.id === editingEvent.color)?.barBg || 'bg-primary-500 text-white')
                        : !editingEvent.color
                        ? getCategoryBarColor(editingEvent.category || 'umum', categoryConfig)
                        : ''
                    }`}
                  >
                    {editingEvent.title || 'Judul Agenda'}
                  </div>
                </div>
              </div>

              {/* TOGGLE: SEPANJANG HARI (ALL DAY) */}
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900 dark:text-amber-300">
                      Acara Sepanjang Hari (All Day)
                    </h4>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                      Acara berlangsung 24 jam penuh tanpa jam spesifik.
                    </p>
                  </div>
                </div>
                
                {/* Switch Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEvent.is_all_day || false}
                    onChange={e => setEditingEvent({ ...editingEvent, is_all_day: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Tanggal & Waktu Inputs */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Tanggal Mulai
                    </label>
                    <input
                      type="date"
                      required
                      value={editingEvent.start_date || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setEditingEvent(prev => {
                          if (!prev) return prev;
                          // Jika tanggal selesai belum ada atau sama dengan mulai lama, ikutkan
                          const keepSync = !prev.end_date || prev.end_date === prev.start_date;
                          return {
                            ...prev,
                            start_date: val,
                            end_date: keepSync ? val : prev.end_date
                          };
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Tanggal Selesai</span>
                      {editingEvent.start_date && editingEvent.end_date && editingEvent.end_date < editingEvent.start_date && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                          Lintas tahun / disesuaikan
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={editingEvent.end_date || editingEvent.start_date || ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (!val) {
                          setEditingEvent(prev => prev ? { ...prev, end_date: val } : prev);
                          return;
                        }
                        const sDate = editingEvent.start_date;
                        if (sDate && val < sDate) {
                          const [sy, sm] = sDate.split('-').map(Number);
                          const [ey, em] = val.split('-').map(Number);
                          // Jika user memilih bulan yang lebih awal di tahun yang sama (misal mulai Nov 2026, selesai Feb 2026),
                          // otomatis sesuaikan ke tahun berikutnya (2027) karena Februari terjadi setelah November!
                          if (sy === ey && em < sm) {
                            const adjusted = `${sy + 1}-${String(em).padStart(2, '0')}-${val.slice(8)}`;
                            setEditingEvent(prev => prev ? { ...prev, end_date: adjusted } : prev);
                            return;
                          }
                        }
                        setEditingEvent(prev => prev ? { ...prev, end_date: val } : prev);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>

                {/* Jam Mulai & Jam Selesai (Hanya jika bukan sepanjang hari) */}
                {!editingEvent.is_all_day && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Jam Mulai
                      </label>
                      <input
                        type="time"
                        value={editingEvent.start_time || '09:00'}
                        onChange={e => setEditingEvent({ ...editingEvent, start_time: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Jam Selesai
                      </label>
                      <input
                        type="time"
                        value={editingEvent.end_time || '10:00'}
                        onChange={e => setEditingEvent({ ...editingEvent, end_time: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lokasi & PIC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Lokasi / Ruangan
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Gudang Area B, Ruang Meeting A"
                    value={editingEvent.location || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> PIC / Penanggung Jawab
                  </label>
                  <input
                    type="text"
                    placeholder="Nama PIC"
                    value={editingEvent.pic || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, pic: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Hubungkan ke Proyek (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" /> Terkait dengan Proyek (Opsional)
                </label>
                <select
                  value={editingEvent.project_id || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, project_id: e.target.value || undefined })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Tidak Terkait Proyek Tertentu --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                  ))}
                </select>
              </div>

              {/* Deskripsi */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Deskripsi & Catatan
                </label>
                <textarea
                  rows={3}
                  placeholder="Tambahkan catatan khusus, rincian agenda, peserta, atau arahan kerja..."
                  value={editingEvent.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                ></textarea>
              </div>

              {/* Lampiran Uploader */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Lampiran (Foto / Dokumen)
                </label>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                />
                
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <UploadCloud className="w-7 h-7 text-primary-500 mb-1.5" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {isUploading ? 'Sedang memproses & kompresi file...' : 'Klik untuk unggah lampiran'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Foto otomatis dikompres hemat penyimpanan & dokumen PDF/Office
                  </p>
                </div>

                {/* List of Attachments */}
                {editingEvent.attachments && editingEvent.attachments.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {editingEvent.attachments.map(att => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {att.type === 'image' && att.url ? (
                            <img src={att.url} alt={att.name} className="w-8 h-8 rounded-lg object-cover border" />
                          ) : (
                            <FileText className="w-5 h-5 text-slate-400" />
                          )}
                          <div className="truncate">
                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-400">{formatFileSize(att.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </div>

              {/* Modal Footer Buttons (Docked / Sticky) */}
              <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between gap-3">
                {editingEvent.id ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEvent.id!)}
                    className="px-3 py-2 rounded-xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 transition-colors"
                  >
                    Hapus
                  </button>
                ) : <div></div>}
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAgendaModalOpen(false)}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 transition-all flex items-center gap-2"
                  >
                    {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Simpan Agenda
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL TAMBAH / EDIT PROJECT */}
      {/* ===================================================================== */}
      
      {/* Note Modal */}
      {isNoteModalOpen && editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-2xl lg:max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <StickyNote className="w-5 h-5 text-primary-500" />
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {editingNote.id ? 'Edit Catatan' : 'Buat Catatan Baru'}
                </h2>
              </div>
              <button 
                onClick={() => setNoteModalOpen(false)} 
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveNote} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Judul Catatan (Opsional)</label>
                  <input
                    type="text"
                    value={editingNote.title || ''}
                    onChange={e => setEditingNote({...editingNote, title: e.target.value})}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
                    placeholder="Judul catatan..."
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Isi Catatan / Memo Teks
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Bisa ditarik sudut kanan bawah untuk memperbesar
                    </span>
                  </div>
                  <textarea
                    rows={Math.max(6, Math.min(16, (editingNote.content || '').split('\n').length + 2))}
                    value={editingNote.content || ''}
                    onChange={e => setEditingNote({...editingNote, content: e.target.value})}
                    className="w-full min-h-[150px] sm:min-h-[180px] px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white resize-y"
                    placeholder="Tulis catatan atau memo lengkap di sini (opsional jika menggunakan checklist di bawah)..."
                  />
                </div>

                {/* Checklist / Checkboxes Section */}
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-emerald-500" />
                      <span>Daftar Kotak Centang (Checklist)</span>
                      {editingNote.checklist && editingNote.checklist.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                          {editingNote.checklist.filter(c => c.is_completed).length}/{editingNote.checklist.length}
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const newItem: NoteChecklistItem = {
                          id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          text: '',
                          is_completed: false,
                        };
                        setEditingNote({
                          ...editingNote,
                          checklist: [...(editingNote.checklist || []), newItem],
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Checkbox</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(editingNote.checklist || []).map((item, idx) => (
                      <div key={item.id || idx} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingNote.checklist || []).map((c, i) =>
                              i === idx ? { ...c, is_completed: !c.is_completed } : c
                            );
                            setEditingNote({ ...editingNote, checklist: updated });
                          }}
                          className="text-slate-400 hover:text-emerald-500 cursor-pointer shrink-0 p-0.5"
                        >
                          {item.is_completed ? (
                            <CheckSquare className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={item.text}
                          placeholder={`Item checklist #${idx + 1}... (Tekan Enter untuk baris baru)`}
                          onChange={(e) => {
                            const updated = (editingNote.checklist || []).map((c, i) =>
                              i === idx ? { ...c, text: e.target.value } : c
                            );
                            setEditingNote({ ...editingNote, checklist: updated });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const newItem: NoteChecklistItem = {
                                id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                text: '',
                                is_completed: false,
                              };
                              const currentList = [...(editingNote.checklist || [])];
                              currentList.splice(idx + 1, 0, newItem);
                              setEditingNote({ ...editingNote, checklist: currentList });
                            }
                          }}
                          className={`flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary-500 ${
                            item.is_completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingNote.checklist || []).filter((_, i) => i !== idx);
                            setEditingNote({ ...editingNote, checklist: updated });
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {(!editingNote.checklist || editingNote.checklist.length === 0) && (
                      <p className="text-xs text-slate-400 italic py-1.5">
                        Belum ada kotak centang. Klik &quot;+ Tambah Checkbox&quot; untuk membuat daftar tugas di catatan ini.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Warna Sticky Note</label>
                  <div className="flex gap-3">
                    {(['yellow', 'blue', 'green', 'pink', 'purple', 'orange'] as const).map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingNote({...editingNote, color})}
                        className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                          editingNote.color === color ? 'scale-110 border-primary-500 ring-2 ring-primary-500/30' : 'border-transparent hover:scale-105'
                        } ${
                          color === 'yellow' ? 'bg-yellow-200' :
                          color === 'blue' ? 'bg-blue-200' :
                          color === 'green' ? 'bg-green-200' :
                          color === 'pink' ? 'bg-pink-200' :
                          color === 'purple' ? 'bg-purple-200' :
                          'bg-orange-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-xl flex items-center gap-1.5 shadow-md shadow-primary-500/20 transition-all cursor-pointer"
                >
                  {isSyncing ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProjectModalOpen && editingProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
            
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary-500" />
                <h2 className="text-base sm:text-lg font-black dark:text-white">
                  {editingProject.id ? 'Edit Project WMS' : 'Buat Project Baru'}
                </h2>
              </div>
              <button 
                onClick={() => setProjectModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProject} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              
              {/* Nama Project */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nama Project <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Relokasi Rak Gudang B atau Upgrade Scanner"
                  value={editingProject.title || ''}
                  onChange={e => setEditingProject({ ...editingProject, title: e.target.value })}
                  className="w-full px-2 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Status & Prioritas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    value={editingProject.status || 'in_progress'}
                    onChange={e => setEditingProject({ ...editingProject, status: e.target.value as ProjectStatus })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  >
                    <option value="planned">Direncanakan</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review / Evaluasi</option>
                    <option value="completed">Selesai</option>
                    <option value="on_hold">Ditunda</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Prioritas</label>
                  <select
                    value={editingProject.priority || 'medium'}
                    onChange={e => setEditingProject({ ...editingProject, priority: e.target.value as ProjectPriority })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  >
                    <option value="low">Rendah</option>
                    <option value="medium">Sedang</option>
                    <option value="high">Tinggi</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Kategori & PIC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Kategori</label>
                  <input
                    type="text"
                    placeholder="Infrastruktur, IT, Audit..."
                    value={editingProject.category || ''}
                    onChange={e => setEditingProject({ ...editingProject, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">PIC / Leader</label>
                  <input
                    type="text"
                    placeholder="Nama penanggung jawab"
                    value={editingProject.pic || ''}
                    onChange={e => setEditingProject({ ...editingProject, pic: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Tanggal Mulai, Tenggat Waktu & Progres manual */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={editingProject.start_date || ''}
                    onChange={e => setEditingProject({ ...editingProject, start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tenggat Waktu</label>
                  <input
                    type="date"
                    value={editingProject.deadline || ''}
                    onChange={e => setEditingProject({ ...editingProject, deadline: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Progres (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingProject.progress ?? 0}
                    onChange={e => setEditingProject({ ...editingProject, progress: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              {/* Checklist Tugas Proyek */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Checklist Tugas / Milestone
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newTask: ProjectTask = {
                        id: 'task-' + Date.now(),
                        title: '',
                        is_completed: false
                      };
                      setEditingProject({
                        ...editingProject,
                        tasks: [...(editingProject.tasks || []), newTask]
                      });
                    }}
                    className="text-xs text-primary-500 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris Tugas
                  </button>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {(editingProject.tasks || []).map((t, idx) => (
                    <div key={t.id || idx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (editingProject.tasks || []).map((item, i) => 
                            i === idx ? { ...item, is_completed: !item.is_completed } : item
                          );
                          setEditingProject({ ...editingProject, tasks: updated });
                        }}
                        className="text-slate-400 hover:text-emerald-500"
                      >
                        {t.is_completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="text"
                        placeholder="Uraian tugas..."
                        value={t.title}
                        onChange={e => {
                          const updated = (editingProject.tasks || []).map((item, i) => 
                            i === idx ? { ...item, title: e.target.value } : item
                          );
                          setEditingProject({ ...editingProject, tasks: updated });
                        }}
                        className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (editingProject.tasks || []).filter((_, i) => i !== idx);
                          setEditingProject({ ...editingProject, tasks: updated });
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!editingProject.tasks || editingProject.tasks.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Belum ada tugas dibuat. Klik "Tambah Baris Tugas".</p>
                  )}
                </div>
              </div>

              {/* Deskripsi */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Deskripsi & Target Output</label>
                <textarea
                  rows={3}
                  placeholder="Target pencapaian proyek..."
                  value={editingProject.description || ''}
                  onChange={e => setEditingProject({ ...editingProject, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                ></textarea>
              </div>

              </div>

              {/* Footer (Docked / Sticky) */}
              <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 transition-all flex items-center gap-1.5"
                >
                  {isSyncing ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Simpan Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL QUICK DETAIL AGENDA */}
      {/* ===================================================================== */}
      {detailEvent && (() => {
        const detailColorStyle = resolveEventColorStyle(detailEvent, categoryConfig);

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${detailColorStyle.badgeBg} ${detailColorStyle.badgeText}`}>
                    <span className={`w-2 h-2 rounded-full ${detailColorStyle.dot}`}></span>
                    {detailColorStyle.label}
                  </span>
                  {detailEvent.color && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Warna Kustom
                    </span>
                  )}
                  {detailEvent.google_event_id && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      <Calendar className="w-3 h-3" />
                      Google Calendar
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setDetailEvent(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                  {detailEvent.title}
                </h2>
                <div className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {detailEvent.is_all_day ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-lg">
                      <Sun className="w-3.5 h-3.5" /> Sepanjang Hari ({detailEvent.start_date})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-primary-500" />
                      {detailEvent.start_date} • {detailEvent.start_time} - {detailEvent.end_time || 'Selesai'}
                    </span>
                  )}
                </div>
              </div>

              {detailEvent.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">
                  {detailEvent.description}
                </p>
              )}

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {detailEvent.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary-500 shrink-0" />
                    <span>Lokasi: <strong>{detailEvent.location}</strong></span>
                  </div>
                )}
                {detailEvent.pic && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>PIC: <strong>{detailEvent.pic}</strong></span>
                  </div>
                )}
              </div>

              {/* Attachments preview */}
              {detailEvent.attachments && detailEvent.attachments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    Lampiran ({detailEvent.attachments.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {detailEvent.attachments.map(att => (
                      <div key={att.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-2">
                        {att.type === 'image' && att.url ? (
                          <img src={att.url} alt={att.name} className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <FileText className="w-5 h-5 text-slate-400" />
                        )}
                        <span className="truncate font-bold">{att.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Color Switcher (1-Click) */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-primary-500" />
                    <span>Ganti Warna Cepat (1-Klik):</span>
                  </span>
                  {detailEvent.color && (
                    <button
                      type="button"
                      onClick={() => handleQuickChangeColor('')}
                      className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                    >
                      Reset Kategori
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {AGENDA_COLOR_OPTIONS.map(opt => {
                    const isSelected = detailEvent.color === opt.id || detailEvent.color === opt.hex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleQuickChangeColor(opt.id)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${opt.dot} ${
                          isSelected ? 'ring-2 ring-primary-500 ring-offset-2 scale-110 shadow-sm' : 'hover:scale-110 opacity-80 hover:opacity-100'
                        }`}
                        title={`Ubah ke ${opt.label}`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(detailEvent.id)}
                  className="text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </button>
                <button
                  type="button"
                  onClick={() => handleEditEvent(detailEvent)}
                  className="text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-primary-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Agenda Lengkap
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================================================================== */}
      {/* MODAL KELOLA KATEGORI AGENDA */}
      {/* ===================================================================== */}
      <AgendaCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        currentConfig={categoryConfig}
        onNotify={onShowToast}
        onSaveSuccess={(newConfig) => {
          setCategoryConfig(newConfig);
          // Pastikan kategori baru langsung aktif di selectedCategories
          setSelectedCategories(prev => {
            const next = { ...prev };
            Object.keys(newConfig).forEach(k => {
              if (next[k] === undefined) {
                next[k] = true;
              }
            });
            return next;
          });
        }}
      />
    </div>
  );
};
export default AgendaView;
