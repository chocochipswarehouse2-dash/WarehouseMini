import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Briefcase, Plus, X, UploadCloud, FileText, Image as ImageIcon, 
  CheckCircle2, ChevronLeft, ChevronRight, Clock, MapPin, User, Tag, 
  Trash2, Edit3, Search, Filter, Sun, Check, Sparkles, RefreshCw, 
  AlertTriangle, ArrowRight, Layers, Eye, CheckSquare, Square, MoreHorizontal,
  FolderPlus, CalendarDays, ListFilter
} from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';
import { 
  getAgendaEvents, saveAgendaEvent, deleteAgendaEvent, 
  getProjects, saveProject, deleteProject 
} from '../services/supabase';
import { fetchWmsSettings, saveWmsSettings } from '../services/settings';
import { AgendaCategoryModal } from './AgendaCategoryModal';
import { 
  AgendaEvent, ProjectItem, AgendaCategory, ProjectStatus, 
  ProjectPriority, AgendaAttachment, ProjectTask 
} from '../types';

interface AgendaViewProps {
  session?: any;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
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

export const AgendaView: React.FC<AgendaViewProps> = ({ session, onShowToast }) => {
  // Main Tab
  const [activeTab, setActiveTab] = useState<'calendar' | 'project'>('calendar');

  // Calendar View Mode: week (default desktop), month, day, agenda (default mobile)
  const [calendarView, setCalendarView] = useState<'week' | 'month' | 'day' | 'agenda'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Data state
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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
    fetchWmsSettings().then(settings => {
      if (settings?.agenda_categories) {
        setCategoryConfig(settings.agenda_categories);
        
        // Update selected categories based on loaded config
        const initialSelected: Record<string, boolean> = {};
        Object.keys(settings.agenda_categories).forEach(k => {
          initialSelected[k] = true;
        });
        setSelectedCategories(initialSelected);
      }
    });
    
    const handleSettingsChange = (e: any) => {
      if (e.detail?.agenda_categories) {
        setCategoryConfig(e.detail.agenda_categories);
      }
    };
    window.addEventListener('wms_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('wms_settings_changed', handleSettingsChange);
  }, []);

  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('all');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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

  // Fetch initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [agendaData, projectData] = await Promise.all([
        getAgendaEvents(),
        getProjects()
      ]);
      setEvents(agendaData);
      setProjects(projectData);
    } catch (err) {
      console.error('Error loading agenda/projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to real-time events
    const handleAgendaUpdate = () => loadData();
    const handleProjectUpdate = () => loadData();

    window.addEventListener('wms_agenda_updated', handleAgendaUpdate);
    window.addEventListener('wms_projects_updated', handleProjectUpdate);

    return () => {
      window.removeEventListener('wms_agenda_updated', handleAgendaUpdate);
      window.removeEventListener('wms_projects_updated', handleProjectUpdate);
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

  // Get start of the week (Monday or Sunday - let's do Sunday as index 0)
  const weekDates = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay(); // 0 is Sun
    const diff = curr.getDate() - day; // day of the month for Sunday
    const startOfWeek = new Date(curr.setDate(diff));

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Mini calendar month matrix
  const miniCalendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: { date: Date; currentMonth: boolean }[] = [];

    // Preceding month trailing days
    const prevTotalDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevTotalDays - i),
        currentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        currentMonth: true
      });
    }

    // Trailing days to fill 35 or 42 slots
    const remaining = 35 - days.length > 0 ? 35 - days.length : (42 - days.length > 0 ? 42 - days.length : 0);
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        currentMonth: false
      });
    }

    return days;
  }, [currentDate]);

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
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Category filter
      if (!selectedCategories[e.category]) return false;
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

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (projectStatusFilter !== 'all' && p.status !== projectStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchPic = p.pic?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchPic) return false;
      }
      return true;
    });
  }, [projects, projectStatusFilter, searchQuery]);

  // Event occurrences mapped by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach(e => {
      const key = e.start_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [filteredEvents]);

  // Header Title Range
  const headerTitle = useMemo(() => {
    if (activeTab === 'project') return 'Manajemen Project & Inisiatif';
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

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus agenda ini?')) return;
    try {
      await deleteAgendaEvent(id);
      onShowToast?.('Agenda berhasil dihapus', 'info');
      setDetailEvent(null);
      loadData();
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

    setIsSyncing(true);
    try {
      await saveAgendaEvent(editingEvent);
      onShowToast?.('Agenda berhasil disimpan!', 'success');
      setAgendaModalOpen(false);
      setEditingEvent(null);
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menyimpan agenda', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Add Project Modal
  const handleOpenAddProject = (existing?: ProjectItem) => {
    if (existing) {
      setEditingProject({ ...existing });
    } else {
      setEditingProject({
        title: '',
        description: '',
        status: 'in_progress',
        priority: 'medium',
        category: 'Infrastruktur',
        pic: session?.name || session?.username || '',
        start_date: formatIsoDate(new Date()),
        deadline: formatIsoDate(new Date(Date.now() + 14 * 86400000)),
        progress: 0,
        tasks: [],
        attachments: []
      });
    }
    setProjectModalOpen(true);
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
  const toggleCategory = (cat: AgendaCategory) => {
    setSelectedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-28 text-slate-900 dark:text-slate-100">
      
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-primary-500/25">
            {activeTab === 'calendar' ? <Calendar className="w-6 h-6" /> : <Briefcase className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              Agenda & Project
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Cloud Sync
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jadwal operasional gudang, meeting, dan inisiatif milestone proyek.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto border border-slate-200/60 dark:border-slate-700/60">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'calendar'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Kalender Kerja</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full font-bold">
              {filteredEvents.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('project')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'project'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Project & Task</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full font-bold">
              {filteredProjects.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left Sidebar Panel (Desktop: permanent 3 cols; Mobile: expandable drawer or toggle) */}
          <div className={`lg:col-span-3 space-y-4 ${mobileFilterOpen ? 'block' : 'hidden lg:block'}`}>
            
            {/* Primary Add Button (Desktop) */}
            <button
              onClick={() => handleOpenAddEvent()}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 transition-all transform active:scale-95"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              Tambah Agenda Baru
            </button>

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
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Days Header */}
              <div className="grid grid-cols-7 text-center mb-1">
                {DAYS_NAME.map(day => (
                  <span key={day} className="text-[10px] font-bold text-slate-400 py-1">
                    {day[0]}
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
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300'
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
            </div>

            {/* Category Filter Checkboxes */}
            <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Filter Kategori
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  <button 
                    onClick={() => setSelectedCategories(Object.keys(categoryConfig).reduce((acc, k) => ({...acc, [k]: true}), {}))}
                    className="text-[10px] text-primary-500 font-bold hover:underline"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {(Object.keys(categoryConfig) as AgendaCategory[]).map(catKey => {
                  const cfg = categoryConfig[catKey];
                  const isChecked = selectedCategories[catKey];
                  const count = events.filter(e => e.category === catKey).length;

                  return (
                    <label
                      key={catKey}
                      onClick={() => toggleCategory(catKey)}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                          isChecked 
                            ? 'bg-primary-500 border-primary-500 text-white' 
                            : 'border-slate-300 dark:border-slate-600'
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
                    </label>
                  );
                })}
              </div>
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
          <div className="lg:col-span-9 space-y-4">
            
            {/* Calendar Controls Toolbar (Like Reference Image) */}
            <div className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-row flex-wrap justify-between items-center gap-3">
              
              {/* Left Navigation: Today, < >, and Title */}
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3">
                <button
                  onClick={handleToday}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
                >
                  Hari Ini
                </button>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    onClick={handlePrev}
                    aria-label="Previous"
                    className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNext}
                    aria-label="Next"
                    className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <h2 className="text-sm sm:text-base font-black truncate text-slate-900 dark:text-white">
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
                    placeholder="Cari agenda..."
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

                {/* Mobile Filter Drawer Button */}
                <button
                  onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                  className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"
                >
                  <ListFilter className="w-4 h-4" />
                  <span>Filter</span>
                </button>

                {/* View Switcher: Minggu, Bulan, Hari, Jadwal */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    onClick={() => setCalendarView('week')}
                    className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      calendarView === 'week'
                        ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Minggu
                  </button>
                  <button
                    onClick={() => setCalendarView('month')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      calendarView === 'month'
                        ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Bulan
                  </button>
                  <button
                    onClick={() => setCalendarView('day')}
                    className={`hidden md:inline-flex px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      calendarView === 'day'
                        ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Hari
                  </button>
                  <button
                    onClick={() => setCalendarView('agenda')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      calendarView === 'agenda'
                        ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Jadwal List
                  </button>
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
                          const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                          return (
                            <div
                              key={evt.id}
                              onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                              className={`text-[10px] p-1.5 rounded-lg font-bold truncate border shadow-xs transition-transform hover:scale-[1.02] cursor-pointer ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}
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
                              const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                              return (
                                <div
                                  key={evt.id}
                                  onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                  className={`p-2 rounded-xl border mb-1 font-sans shadow-xs transition-all hover:shadow-md cursor-pointer ${cfg.cardBg} ${cfg.border} border-l-4`}
                                >
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {evt.start_time} - {evt.end_time || ''}
                                    </span>
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
            )}

            {/* 2. MONTH VIEW */}
            {calendarView === 'month' && (
              <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-center text-xs font-black text-slate-500 py-3">
                  {DAYS_NAME.map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 auto-rows-[90px] sm:auto-rows-[120px] divide-x divide-y divide-slate-100 dark:divide-slate-800/60">
                  {miniCalendarDays.map((item, i) => {
                    const dStr = formatIsoDate(item.date);
                    const dayEvents = eventsByDate.get(dStr) || [];
                    const isTod = isToday(item.date);
                    const isSel = isSameDay(item.date, selectedDate);

                    return (
                      <div
                        key={i}
                        onClick={() => {
                          setSelectedDate(item.date);
                          handleOpenAddEvent(dStr);
                        }}
                        className={`p-1.5 sm:p-2 relative flex flex-col justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors ${
                          !item.currentMonth ? 'opacity-40 bg-slate-50/50 dark:bg-slate-900/20' : ''
                        } ${isSel ? 'ring-2 ring-primary-500 ring-inset' : ''}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${
                            isTod ? 'bg-primary-500 text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}>
                            {item.date.getDate()}
                          </span>
                          {dayEvents.length > 0 && (
                            <span className="text-[10px] font-bold text-slate-400">
                              {dayEvents.length} acara
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 mt-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map(evt => {
                            const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                            return (
                              <div
                                key={evt.id}
                                onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                className={`text-[10px] font-bold p-1 rounded-md truncate border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}
                              >
                                {evt.is_all_day ? '☀️ ' : `${evt.start_time || ''} `}{evt.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 2 && (
                            <div className="text-[9px] font-bold text-slate-400 text-right">
                              +{dayEvents.length - 2} lagi
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                  {/* All day section in day view */}
                  {((eventsByDate.get(formatIsoDate(currentDate)) || []).filter(e => e.is_all_day)).map(evt => {
                    const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                    return (
                      <div 
                        key={evt.id} 
                        onClick={() => setDetailEvent(evt)}
                        className={`p-4 ${cfg.cardBg} border-l-4 ${cfg.border} cursor-pointer hover:opacity-95`}
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
                            const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                            return (
                              <div
                                key={evt.id}
                                onClick={(e) => { e.stopPropagation(); setDetailEvent(evt); }}
                                className={`p-3 rounded-xl border ${cfg.cardBg} ${cfg.border} border-l-4 shadow-sm`}
                              >
                                <div className="flex justify-between items-start">
                                  <h4 className="text-sm font-black text-slate-900 dark:text-white">{evt.title}</h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
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
              <div className="space-y-4">
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
                      className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm"
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
                              const cfg = categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' };
                              return (
                                <div
                                  key={evt.id}
                                  onClick={() => setDetailEvent(evt)}
                                  className={`p-4 sm:p-5 rounded-2xl border ${cfg.cardBg} ${cfg.border} border-l-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3`}
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
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                                          {cfg.label}
                                        </span>
                                      </div>

                                      {/* Quick action buttons */}
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                                          className="p-1.5 text-slate-500 hover:text-primary-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
                                          title="Edit Agenda"
                                        >
                                          <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteEvent(evt.id); }}
                                          className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
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
      ) : (
        /* PROJECT & INITIATIVE TAB */
        <div className="space-y-5">
          
          {/* Controls Bar for Projects */}
          <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            
            {/* Status Filter Chips (Scrollable on mobile) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {[
                { id: 'all', label: 'Semua Project' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'planned', label: 'Direncanakan' },
                { id: 'review', label: 'Review' },
                { id: 'completed', label: 'Selesai' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => setProjectStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    projectStatusFilter === st.id
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Actions: Search & Add */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari project / PIC..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={() => handleOpenAddProject()}
                className="bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-primary-500/20 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Project</span>
              </button>
            </div>
          </div>

          {/* Project Cards Grid (Responsive 1-col on mobile, 2-col tablet, 3-col desktop) */}
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
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md tracking-wider ${stCfg.badge}`}>
                          {stCfg.label}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${priCfg.color}`}>
                          {priCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenAddProject(proj)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProject(proj.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Desc */}
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-1.5">
                      {proj.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {proj.description || 'Tidak ada deskripsi rinci.'}
                    </p>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 mb-4 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Progres Pelaksanaan</span>
                        <span className="text-primary-600 dark:text-primary-400">{proj.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${proj.progress}%` }}
                        ></div>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {completedTasks} dari {totalTasks} checklist tugas selesai
                      </div>
                    </div>

                    {/* Interactive Task Checklist (Quick tap) */}
                    {proj.tasks.length > 0 && (
                      <div className="space-y-1.5 mb-4">
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
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      <span className="font-bold">{proj.pic || 'Tim Gudang'}</span>
                    </div>
                    {proj.deadline && (
                      <span className="text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md text-[11px]">
                        Tenggat: {proj.deadline}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) for Mobile Quick Add */}
      <div className="fixed bottom-6 right-6 z-40 sm:hidden">
        <button
          onClick={() => {
            if (activeTab === 'calendar') handleOpenAddEvent();
            else handleOpenAddProject();
          }}
          aria-label="Tambah Baru"
          className="w-14 h-14 rounded-full bg-gradient-to-r from-primary-500 to-amber-500 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      </div>

      {/* ===================================================================== */}
      {/* MODAL TAMBAH / EDIT AGENDA (DENGAN TOGGLE SEPANJANG HARI) */}
      {/* ===================================================================== */}
      {isAgendaModalOpen && editingEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50">
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

            {/* Modal Form Content */}
            <form onSubmit={handleSaveAgenda} className="p-5 sm:p-6 overflow-y-auto space-y-4">
              
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
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
                      onChange={e => setEditingEvent({ ...editingEvent, start_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Tanggal Selesai
                    </label>
                    <input
                      type="date"
                      value={editingEvent.end_date || editingEvent.start_date || ''}
                      onChange={e => setEditingEvent({ ...editingEvent, end_date: e.target.value })}
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

              {/* Modal Footer Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                {editingEvent.id ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEvent.id!)}
                    className="px-4 py-2.5 rounded-xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40"
                  >
                    Hapus
                  </button>
                ) : <div></div>}
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAgendaModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 transition-all flex items-center gap-2"
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
      {isProjectModalOpen && editingProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
            
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50">
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

            <form onSubmit={handleSaveProject} className="p-5 sm:p-6 overflow-y-auto space-y-4">
              
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500"
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

              {/* Deadline & Progres manual */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tenggat Waktu</label>
                  <input
                    type="date"
                    value={editingProject.deadline || ''}
                    onChange={e => setEditingProject({ ...editingProject, deadline: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
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

              {/* Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20"
                >
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
      {detailEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${(categoryConfig[detailEvent.category] || Object.values(categoryConfig)[0] || { label: detailEvent.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700' }).badgeBg} ${(categoryConfig[detailEvent.category] || Object.values(categoryConfig)[0] || { label: detailEvent.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700' }).badgeText}`}>
                {(categoryConfig[detailEvent.category] || Object.values(categoryConfig)[0] || { label: detailEvent.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700' }).label}
              </span>
              <button 
                onClick={() => setDetailEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {detailEvent.title}
              </h2>
              <div className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                {detailEvent.is_all_day ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md">
                    <Sun className="w-3.5 h-3.5" /> Sepanjang Hari ({detailEvent.start_date})
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary-500" />
                    {detailEvent.start_date} • {detailEvent.start_time} - {detailEvent.end_time}
                  </span>
                )}
              </div>
            </div>

            {detailEvent.description && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {detailEvent.description}
              </p>
            )}

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
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

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => handleDeleteEvent(detailEvent.id)}
                className="text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-3 py-2 rounded-xl flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </button>
              <button
                onClick={() => handleEditEvent(detailEvent)}
                className="text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Agenda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AgendaView;
