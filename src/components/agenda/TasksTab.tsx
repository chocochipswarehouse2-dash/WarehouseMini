import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  Play,
  UserCheck,
  Calendar,
  AlertTriangle,
  Edit3,
  Trash2,
  X,
  FileText,
  UploadCloud,
  Briefcase,
  User,
  Send,
} from 'lucide-react';
import {
  DelegatedTask,
  DelegatedTaskStatus,
  ProjectItem,
  ProjectPriority,
  AgendaAttachment,
  UserSession,
} from '../../types';
import {
  saveDelegatedTask,
  deleteDelegatedTask,
  fetchWmsUsersFromSupabase,
  fetchKaryawanDirectory,
} from '../../services/supabase';
import { isSuperadmin } from '../../services/permissions';
import { compressImage } from '../../utils/imageCompressor';
import { uploadImageToGdrive } from '../../services/gdriveUpload';

interface AssigneeOption {
  id: string;
  name: string;
  role: string;
  source: 'user' | 'karyawan';
}

interface TasksTabProps {
  session?: UserSession | null;
  tasks: DelegatedTask[];
  projects: ProjectItem[];
  onTasksChange: (nextTasks: DelegatedTask[]) => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  externalCreateTrigger?: number;
  externalDraft?: Partial<DelegatedTask> | null;
  onConsumeExternalDraft?: () => void;
}

const TASK_STATUS_META: Record<
  DelegatedTaskStatus,
  { label: string; badge: string; dot: string }
> = {
  pending: {
    label: 'Menunggu',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
  in_progress: {
    label: 'Sedang Dikerjakan',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Selesai',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
};

const PRIORITY_META: Record<ProjectPriority, { label: string; badge: string }> = {
  low: { label: 'Rendah', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  medium: { label: 'Normal', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  high: { label: 'Tinggi', badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  urgent: { label: 'Urgent', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
};

export const TasksTab: React.FC<TasksTabProps> = ({
  session,
  tasks,
  projects,
  onTasksChange,
  onShowToast,
  externalCreateTrigger = 0,
  externalDraft,
  onConsumeExternalDraft,
}) => {
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DelegatedTaskStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  // Create / Edit Modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<DelegatedTask> | null>(null);
  const [isSavingTask, setIsSavingTask] = useState(false);

  // Work Report Modal (Selesaikan & Lapor)
  const [reportModalTask, setReportModalTask] = useState<DelegatedTask | null>(null);
  const [workReportText, setWorkReportText] = useState('');
  const [reportAttachments, setReportAttachments] = useState<AgendaAttachment[]>([]);
  const [isUploadingReportFile, setIsUploadingReportFile] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const actorName = session?.name || session?.username || 'User';
  const actorIdentifiers = useMemo(() => {
    const ids = new Set<string>();
    if (session?.username) ids.add(session.username.trim().toLowerCase());
    if (session?.nik) ids.add(session.nik.trim().toLowerCase());
    if (session?.name) ids.add(session.name.trim().toLowerCase());
    return ids;
  }, [session]);

  const userIsAdminOrManager = useMemo(() => {
    if (!session) return false;
    if (isSuperadmin(session)) return true;
    const role = String(session.role || '').trim().toLowerCase();
    return ['admin', 'superadmin', 'manager', 'hr', 'hr & admin'].includes(role);
  }, [session]);

  const isMyTask = (task: DelegatedTask) => {
    const targetId = String(task.assigned_to_id || '').trim().toLowerCase();
    const targetName = String(task.assigned_to_name || '').trim().toLowerCase();
    return actorIdentifiers.has(targetId) || actorIdentifiers.has(targetName);
  };

  // Load directory of WMS Users (Admin, CS, etc.) + Karyawan (NIK)
  useEffect(() => {
    let active = true;
    const loadAssignees = async () => {
      const [users, employees] = await Promise.all([
        fetchWmsUsersFromSupabase().catch(() => []),
        fetchKaryawanDirectory().catch(() => []),
      ]);
      if (!active) return;

      const map = new Map<string, AssigneeOption>();

      users.forEach((u: any) => {
        const id = String(u.nik || u.username || '').trim();
        if (!id) return;
        const role = String(u.role || 'User').trim();
        if (role.toLowerCase() === 'store') return; // Fokus ke Admin, CS, dan Karyawan internal
        const key = id.toLowerCase();
        map.set(key, {
          id,
          name: String(u.name || u.username || id).trim(),
          role,
          source: 'user',
        });
      });

      employees.forEach((emp: any) => {
        if (emp.status && String(emp.status).toLowerCase() === 'nonaktif') return;
        const nik = String(emp.nik || '').trim();
        if (!nik) return;
        const key = nik.toLowerCase();
        const existing = map.get(key);
        map.set(key, {
          id: nik,
          name: String(emp.nama || existing?.name || nik).trim(),
          role: existing?.role || emp.jabatan || emp.divisi || 'Karyawan',
          source: 'karyawan',
        });
      });

      const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setAssigneeOptions(list);
    };
    loadAssignees();
    return () => {
      active = false;
    };
  }, []);

  // Default to "mine" for non-admin employee/CS if they have tasks assigned
  useEffect(() => {
    if (!userIsAdminOrManager && tasks.some(isMyTask)) {
      setScopeFilter('mine');
    }
  }, [userIsAdminOrManager, tasks.length]);

  useEffect(() => {
    if (externalCreateTrigger > 0) {
      handleOpenAddTask();
    }
  }, [externalCreateTrigger]);

  useEffect(() => {
    if (externalDraft) {
      setEditingTask({
        title: externalDraft.title || '',
        description: externalDraft.description || '',
        status: 'pending',
        priority: externalDraft.priority || 'medium',
        due_date: externalDraft.due_date || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        assigned_to_id: externalDraft.assigned_to_id || '',
        assigned_to_name: externalDraft.assigned_to_name || '',
        assigned_to_role: externalDraft.assigned_to_role || '',
        assigned_by: actorName,
        project_id: externalDraft.project_id || undefined,
      });
      setAssigneeSearch('');
      setTaskModalOpen(true);
      onConsumeExternalDraft?.();
    }
  }, [externalDraft]);

  const handleOpenAddTask = () => {
    setEditingTask({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      assigned_to_id: '',
      assigned_to_name: '',
      assigned_to_role: '',
      assigned_by: actorName,
    });
    setAssigneeSearch('');
    setTaskModalOpen(true);
  };

  const handleOpenEditTask = (task: DelegatedTask) => {
    setEditingTask({ ...task });
    setAssigneeSearch('');
    setTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask?.title?.trim()) {
      onShowToast?.('Judul tugas wajib diisi', 'warning');
      return;
    }
    if (!editingTask?.assigned_to_id?.trim()) {
      onShowToast?.('Pilih penerima tugas (Admin / CS / ID Karyawan)', 'warning');
      return;
    }
    setIsSavingTask(true);
    try {
      const saved = await saveDelegatedTask({
        ...editingTask,
        assigned_by: editingTask.assigned_by || actorName,
      });
      const exists = tasks.some((t) => t.id === saved.id);
      const next = exists
        ? tasks.map((t) => (t.id === saved.id ? saved : t))
        : [saved, ...tasks];
      onTasksChange(next);
      setTaskModalOpen(false);
      setEditingTask(null);
      onShowToast?.('Tugas berhasil disimpan & didelegasikan', 'success');
    } catch (err: any) {
      onShowToast?.(err?.message || 'Gagal menyimpan tugas', 'error');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleStartTask = async (task: DelegatedTask) => {
    try {
      const updated = await saveDelegatedTask({
        ...task,
        status: 'in_progress',
        started_at: task.started_at || new Date().toISOString(),
      });
      onTasksChange(tasks.map((t) => (t.id === updated.id ? updated : t)));
      onShowToast?.(`Tugas "${task.title}" ditandai Sedang Dikerjakan`, 'success');
    } catch {
      onShowToast?.('Gagal memperbarui status tugas', 'error');
    }
  };

  const handleOpenReportModal = (task: DelegatedTask) => {
    setReportModalTask(task);
    setWorkReportText(task.work_report || '');
    setReportAttachments(task.report_attachments || []);
  };

  const handleUploadReportAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingReportFile(true);
    try {
      let url = '';
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file, 1024, 0.75);
        const res = await uploadImageToGdrive(compressed.dataUrl, `task_report_${Date.now()}_${file.name}`);
        url = res?.url || compressed.dataUrl;
      } else {
        url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(file);
        });
      }
      if (url) {
        setReportAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type.startsWith('image/') ? 'image' : 'document',
            url,
          },
        ]);
      }
    } catch {
      onShowToast?.('Gagal mengunggah lampiran laporan', 'error');
    } finally {
      setIsUploadingReportFile(false);
      e.target.value = '';
    }
  };

  const handleSubmitWorkReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportModalTask) return;
    if (!workReportText.trim()) {
      onShowToast?.('Isi laporan hasil kerja terlebih dahulu sebelum menandai selesai', 'warning');
      return;
    }
    setIsSubmittingReport(true);
    try {
      const updated = await saveDelegatedTask({
        ...reportModalTask,
        status: 'completed',
        work_report: workReportText.trim(),
        report_attachments: reportAttachments,
        started_at: reportModalTask.started_at || new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      onTasksChange(tasks.map((t) => (t.id === updated.id ? updated : t)));
      setReportModalTask(null);
      onShowToast?.('Tugas selesai & laporan hasil kerja tersimpan!', 'success');
    } catch {
      onShowToast?.('Gagal menyimpan laporan hasil kerja', 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleDeleteTask = async (task: DelegatedTask) => {
    if (!window.confirm(`Hapus tugas "${task.title}"?`)) return;
    try {
      await deleteDelegatedTask(task.id);
      onTasksChange(tasks.filter((t) => t.id !== task.id));
      onShowToast?.('Tugas berhasil dihapus', 'info');
    } catch {
      onShowToast?.('Gagal menghapus tugas', 'error');
    }
  };

  const projectTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.title));
    return map;
  }, [projects]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scopeFilter === 'mine' && !isMyTask(t)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.description || ''} ${t.assigned_to_name} ${t.assigned_to_id} ${t.assigned_by} ${t.work_report || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, scopeFilter, statusFilter, searchQuery, actorIdentifiers]);

  const counts = useMemo(() => {
    const base = scopeFilter === 'mine' ? tasks.filter(isMyTask) : tasks;
    return {
      all: base.length,
      pending: base.filter((t) => t.status === 'pending').length,
      in_progress: base.filter((t) => t.status === 'in_progress').length,
      completed: base.filter((t) => t.status === 'completed').length,
      mine: tasks.filter(isMyTask).length,
    };
  }, [tasks, scopeFilter, actorIdentifiers]);

  const filteredAssignees = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return assigneeOptions;
    return assigneeOptions.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
    );
  }, [assigneeOptions, assigneeSearch]);

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* Summary & Controls Card */}
      <div className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Scope Toggle (Tugas Saya vs Semua Tugas) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => setScopeFilter('mine')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  scopeFilter === 'mine'
                    ? 'bg-white dark:bg-[#101726] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Tugas Saya</span>
                <span className="text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.2 rounded-full">
                  {counts.mine}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  scopeFilter === 'all'
                    ? 'bg-white dark:bg-[#101726] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Semua Tugas</span>
                <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full">
                  {tasks.length}
                </span>
              </button>
            </div>

            {/* Status Filter Pills (Horizontal Swipe on Mobile) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {(
                [
                  { id: 'all', label: 'Semua', count: counts.all },
                  { id: 'pending', label: 'Menunggu', count: counts.pending },
                  { id: 'in_progress', label: 'Sedang Dikerjakan', count: counts.in_progress },
                  { id: 'completed', label: 'Selesai', count: counts.completed },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === st.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{st.label}</span>
                  <span className="font-mono text-[10px] opacity-80">{st.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search & New Task */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari tugas, nama, atau ID karyawan..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenAddTask}
              className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delegasi Tugas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Task Cards Grid */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <CheckSquare className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Belum ada tugas {scopeFilter === 'mine' ? 'yang didelegasikan ke Anda' : 'pada filter ini'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Buat dan delegasikan tugas ke Admin, Customer Service, atau Karyawan (berdasarkan ID Karyawan / NIK) agar dapat dikerjakan dan dilaporkan hasilnya.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredTasks.map((task) => {
            const st = TASK_STATUS_META[task.status];
            const prio = PRIORITY_META[task.priority || 'medium'];
            const mine = isMyTask(task);
            const canManage = userIsAdminOrManager || task.assigned_by === actorName;
            const isOverdue =
              task.status !== 'completed' &&
              task.due_date &&
              task.due_date < new Date().toISOString().slice(0, 10);
            const linkedProjectTitle = task.project_id ? projectTitleMap.get(task.project_id) : undefined;

            return (
              <div
                key={task.id}
                className={`bg-white dark:bg-[#1a2332] rounded-2xl border p-4 shadow-2xs flex flex-col justify-between gap-3 transition-all ${
                  mine && task.status !== 'completed'
                    ? 'border-indigo-300 dark:border-indigo-800 ring-1 ring-indigo-500/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prio.badge}`}>
                        {prio.label}
                      </span>
                      {mine && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                          Tugas Anda
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditTask(task)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Edit Tugas"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Hapus Tugas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Title & Desc */}
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line line-clamp-3">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-1.5 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {task.assigned_to_name || task.assigned_to_id}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {task.assigned_to_id}
                      </span>
                      {task.assigned_to_role && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          ({task.assigned_to_role})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                      {task.due_date && (
                        <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                          {isOverdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                          <span className="font-mono">{task.due_date}</span>
                        </span>
                      )}
                      <span>Dari: <strong className="text-slate-700 dark:text-slate-200">{task.assigned_by}</strong></span>
                    </div>

                    {linkedProjectTitle && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                        <Briefcase className="w-3 h-3" />
                        <span className="truncate max-w-[220px]">{linkedProjectTitle}</span>
                      </div>
                    )}
                  </div>

                  {/* Work Report Preview */}
                  {task.work_report && (
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Laporan Hasil Kerja
                        </span>
                        {task.completed_at && (
                          <span className="font-mono opacity-80">
                            {new Date(task.completed_at).toLocaleDateString('id-ID')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line">
                        {task.work_report}
                      </p>
                      {Array.isArray(task.report_attachments) && task.report_attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {task.report_attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 underline truncate max-w-[180px]"
                            >
                              {att.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Footer for Assignee / Authorized */}
                {(mine || userIsAdminOrManager) && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {task.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleStartTask(task)}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Sedang Dikerjakan</span>
                      </button>
                    )}

                    {task.status !== 'completed' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(task)}
                        className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Selesai &amp; Lapor</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(task)}
                        className="w-full py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Perbarui Laporan Kerja</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tambah / Edit Tugas Delegasi */}
      {taskModalOpen && editingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1a2332] w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {editingTask.id ? 'Edit Tugas Delegasi' : 'Buat & Delegasikan Tugas'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="p-4 overflow-y-auto space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Judul Tugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingTask.title || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  placeholder="Contoh: Cek stok rak A012 & rapikan barcode"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Instruksi / Detail Tugas
                </label>
                <textarea
                  rows={3}
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  placeholder="Jelaskan detail pekerjaan yang harus dilakukan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Assignee Picker */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 dark:text-slate-200">
                  Delegasikan Kepada (Admin / CS / ID Karyawan) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Cari nama, role, atau ID karyawan (misal: WH0004, chococs1)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {editingTask.assigned_to_id && (
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
                    <span className="font-bold">
                      Terpilih: {editingTask.assigned_to_name} (<span className="font-mono">{editingTask.assigned_to_id}</span>)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingTask({
                          ...editingTask,
                          assigned_to_id: '',
                          assigned_to_name: '',
                          assigned_to_role: '',
                        })
                      }
                      className="text-[10px] underline cursor-pointer"
                    >
                      Ganti
                    </button>
                  </div>
                )}
                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAssignees.slice(0, 30).map((opt) => {
                    const selected =
                      editingTask.assigned_to_id?.toLowerCase() === opt.id.toLowerCase();
                    return (
                      <button
                        key={`${opt.source}-${opt.id}`}
                        type="button"
                        onClick={() =>
                          setEditingTask({
                            ...editingTask,
                            assigned_to_id: opt.id,
                            assigned_to_name: opt.name,
                            assigned_to_role: opt.role,
                          })
                        }
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${
                          selected ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100">{opt.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{opt.role}</div>
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {opt.id}
                        </span>
                      </button>
                    );
                  })}
                  {filteredAssignees.length === 0 && (
                    <div className="p-3 text-center text-slate-400">Tidak ditemukan</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Prioritas
                  </label>
                  <select
                    value={editingTask.priority || 'medium'}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, priority: e.target.value as ProjectPriority })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="low">Rendah</option>
                    <option value="medium">Normal</option>
                    <option value="high">Tinggi</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Tenggat Waktu
                  </label>
                  <input
                    type="date"
                    value={editingTask.due_date || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {projects.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Tautkan ke Project (Opsional)
                  </label>
                  <select
                    value={editingTask.project_id || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, project_id: e.target.value || undefined })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Tidak ditautkan ke project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingTask}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSavingTask ? 'Menyimpan...' : 'Simpan & Delegasikan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Laporan Hasil Kerja (Selesai) */}
      {reportModalTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1a2332] w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  Laporan Hasil Kerja
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReportModalTask(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitWorkReport} className="p-4 space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-800 dark:text-slate-100">{reportModalTask.title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Penerima: {reportModalTask.assigned_to_name} ({reportModalTask.assigned_to_id})
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Catatan / Laporan Hasil Kerja <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={workReportText}
                  onChange={(e) => setWorkReportText(e.target.value)}
                  placeholder="Tuliskan hasil pekerjaan yang sudah diselesaikan, kendala (jika ada), atau detail pengecekan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Lampiran Bukti Kerja (Opsional)
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold cursor-pointer">
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{isUploadingReportFile ? 'Mengunggah...' : 'Unggah Foto / File'}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleUploadReportAttachment}
                    disabled={isUploadingReportFile}
                  />
                </label>
                {reportAttachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {reportAttachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                        <span className="truncate">{att.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setReportAttachments((prev) => prev.filter((x) => x.id !== att.id))
                          }
                          className="text-rose-500 font-bold ml-2 cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalTask(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport || isUploadingReportFile}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSubmittingReport ? 'Menyimpan...' : 'Tandai Selesai & Simpan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

