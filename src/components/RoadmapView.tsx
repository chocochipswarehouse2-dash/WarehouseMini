import React, { useState, useEffect, useMemo } from 'react';
import { 
  Map, Plus, Edit3, Trash2, Check, X, MoveRight, MoveLeft, 
  RefreshCw, Download, Info, Zap, AlertTriangle, Bug, Wrench, CheckCircle2
} from 'lucide-react';
import { RoadmapItem, RoadmapStatus, RoadmapPriority, RoadmapType } from '../types';
import { getRoadmaps, saveRoadmap, deleteRoadmap } from '../services/supabase';
import SystemWorkflow from './SystemWorkflow';

const STATUSES: { id: RoadmapStatus; label: string; bg: string; text: string; border: string }[] = [
  { id: 'ideation', label: 'Ide / Request', bg: 'bg-slate-100 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' },
  { id: 'planned', label: 'Direncanakan', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  { id: 'in_progress', label: 'Sedang Dikerjakan', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  { id: 'completed', label: 'Selesai', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' }
];

const PRIORITIES: Record<RoadmapPriority, { label: string; icon: any; color: string }> = {
  low: { label: 'Low', icon: Info, color: 'text-slate-500' },
  medium: { label: 'Medium', icon: Zap, color: 'text-blue-500' },
  high: { label: 'High', icon: AlertTriangle, color: 'text-amber-500' },
  urgent: { label: 'Urgent', icon: AlertTriangle, color: 'text-rose-500' }
};

const TYPES: Record<RoadmapType, { label: string; icon: any; color: string }> = {
  feature: { label: 'Fitur Baru', icon: Zap, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400' },
  bug: { label: 'Bug / Error', icon: Bug, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400' },
  enhancement: { label: 'Peningkatan', icon: Wrench, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' },
  maintenance: { label: 'Maintenance', icon: Info, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' }
};

export default function RoadmapView({ session, onShowToast }: { session: any; onShowToast: (msg: string, type: any) => void }) {
  const [activeTab, setActiveTab] = useState<'roadmap' | 'workflow'>('roadmap');
  
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<RoadmapItem> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const data = await getRoadmaps();
    setItems(data);
    setLoading(false);
  };

  const handleOpenAdd = () => {
    setEditingItem({
      title: '',
      description: '',
      status: 'ideation',
      priority: 'medium',
      type: 'feature',
      created_by: session?.name || session?.username || 'Unknown'
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item: RoadmapItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.title) {
      onShowToast('Judul fitur/request wajib diisi', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveRoadmap(editingItem as Partial<RoadmapItem>);
      onShowToast(editingItem.id ? 'Roadmap diperbarui' : 'Request berhasil ditambahkan', 'success');
      setShowModal(false);
      fetchData();
    } catch (err) {
      onShowToast('Gagal menyimpan data', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus item ini?')) return;
    setSaving(true);
    try {
      await deleteRoadmap(id);
      onShowToast('Item berhasil dihapus', 'success');
      fetchData();
    } catch (err) {
      onShowToast('Gagal menghapus item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (item: RoadmapItem, direction: 'next' | 'prev') => {
    const currentIndex = STATUSES.findIndex(s => s.id === item.status);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= STATUSES.length) return;
    
    const newStatus = STATUSES[newIndex].id;
    
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: newStatus } : it));
    
    try {
      await saveRoadmap({ id: item.id, status: newStatus });
    } catch (err) {
      onShowToast('Gagal mengubah status', 'error');
      fetchData(); // revert on fail
    }
  };

  const generateMarkdown = () => {
    let md = `# WMS App Roadmap & Feature Requests\n\n`;
    md += `Generated at: ${new Date().toLocaleString()}\n\n`;
    
    STATUSES.forEach(status => {
      const colItems = items.filter(it => it.status === status.id);
      if (colItems.length > 0) {
        md += `## ${status.label}\n\n`;
        colItems.forEach(it => {
          md += `### [${it.type.toUpperCase()}] ${it.title} (Priority: ${it.priority.toUpperCase()})\n`;
          md += `- **Requested by**: ${it.created_by || 'Unknown'}\n`;
          if (it.description) md += `- **Description**: ${it.description}\n`;
          md += `\n`;
        });
      }
    });
    
    return md;
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'WMS_ROADMAP.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('File ROADMAP.md berhasil didownload', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Map className="w-5 h-5 text-primary-500" />
              Roadmap & Workflow
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
              Request fitur baru, laporkan bug, atau pantau alur sistem. Ekspor roadmap ke <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">.md</span> agar dapat dipahami oleh AI Assistant saat maintenance.
            </p>
          </div>
          {activeTab === 'roadmap' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleExportMarkdown}
                className="px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export AI (.md)</span>
              </button>
              <button
                onClick={handleOpenAdd}
                className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-primary-500/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Request
              </button>
            </div>
          )}
        </div>
        
        {/* TABS */}
        <div className="flex items-center gap-6 px-4 sm:px-6 mt-2">
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'roadmap'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Papan Kanban (Roadmap)
          </button>
          <button
            onClick={() => setActiveTab('workflow')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'workflow'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Visualisasi Workflow
          </button>
        </div>
      </div>

      {activeTab === 'workflow' ? (
        <SystemWorkflow session={session} onShowToast={onShowToast} />
      ) : (
        <>
          {/* BOARD VIEW */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        <div className="flex gap-4 sm:gap-6 h-full min-w-max pb-2">
          {STATUSES.map(status => {
            const colItems = items.filter(it => it.status === status.id);
            return (
              <div key={status.id} className={`w-72 sm:w-80 flex flex-col h-full rounded-2xl border ${status.border} bg-white/50 dark:bg-[#131d31]/50 backdrop-blur-sm overflow-hidden`}>
                <div className={`p-3 sm:p-4 border-b ${status.border} ${status.bg} flex items-center justify-between shrink-0`}>
                  <h2 className={`font-black text-sm uppercase tracking-wide ${status.text}`}>
                    {status.label}
                  </h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-950 shadow-sm ${status.text}`}>
                    {colItems.length}
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {colItems.length === 0 && (
                    <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400 font-medium">
                      Kosong
                    </div>
                  )}
                  {colItems.map(item => {
                    const TypeInfo = TYPES[item.type];
                    const PriorityInfo = PRIORITIES[item.priority];
                    
                    return (
                      <div key={item.id} className="bg-white dark:bg-[#1a233a] p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group relative">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide ${TypeInfo.color}`}>
                            <TypeInfo.icon className="w-2.5 h-2.5" />
                            {TypeInfo.label}
                          </span>
                          
                          {/* Admin Actions */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden shrink-0">
                            <button onClick={() => handleOpenEdit(item)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer">
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDelete(item.id!)} className="p-1 hover:bg-rose-200 dark:hover:bg-rose-900/50 text-rose-500 cursor-pointer">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug mb-1.5">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed mb-3">
                            {item.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[9px] font-black text-slate-600 dark:text-slate-300 shrink-0" title={item.created_by}>
                              {item.created_by ? item.created_by.charAt(0).toUpperCase() : '?'}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Priority</span>
                              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${PriorityInfo.color}`}>
                                <PriorityInfo.icon className="w-2.5 h-2.5" />
                                {PriorityInfo.label}
                              </span>
                            </div>
                          </div>
                          
                          {/* Move Status Controls */}
                          <div className="flex items-center gap-1">
                            {status.id !== 'ideation' && (
                              <button 
                                onClick={() => handleChangeStatus(item, 'prev')}
                                className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 cursor-pointer"
                                title="Geser ke Kiri"
                              >
                                <MoveLeft className="w-3 h-3" />
                              </button>
                            )}
                            {status.id !== 'completed' && (
                              <button 
                                onClick={() => handleChangeStatus(item, 'next')}
                                className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
                                title="Geser ke Kanan"
                              >
                                <MoveRight className="w-3 h-3" />
                              </button>
                            )}
                            {status.id === 'completed' && (
                              <div className="w-6 h-6 flex items-center justify-center text-emerald-500">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                            )}
                          </div>
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

      {/* FORM MODAL */}
      {showModal && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a0f1c]">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">
                {editingItem.id ? 'Edit Request / Fitur' : 'Request Fitur Baru'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 sm:p-5 overflow-y-auto">
              <form id="roadmapForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Judul Request
                  </label>
                  <input
                    type="text"
                    value={editingItem.title}
                    onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    placeholder="Contoh: Tambah filter tanggal di halaman Laporan"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Detail & Deskripsi
                  </label>
                  <textarea
                    value={editingItem.description}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-primary-500 min-h-[100px]"
                    placeholder="Jelaskan kebutuhan Anda secara detail agar tim atau AI paham..."
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                      Jenis
                    </label>
                    <select
                      value={editingItem.type}
                      onChange={e => setEditingItem({ ...editingItem, type: e.target.value as RoadmapType })}
                      className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500"
                    >
                      <option value="feature">Fitur Baru</option>
                      <option value="bug">Bug / Error</option>
                      <option value="enhancement">Peningkatan (Enhancement)</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                      Prioritas
                    </label>
                    <select
                      value={editingItem.priority}
                      onChange={e => setEditingItem({ ...editingItem, priority: e.target.value as RoadmapPriority })}
                      className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500"
                    >
                      <option value="low">Rendah (Low)</option>
                      <option value="medium">Sedang (Medium)</option>
                      <option value="high">Tinggi (High)</option>
                      <option value="urgent">Mendesak (Urgent!)</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a0f1c] flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                form="roadmapForm"
                disabled={saving}
                className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-primary-500/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
