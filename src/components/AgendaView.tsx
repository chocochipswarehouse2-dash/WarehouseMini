import React, { useState, useRef } from 'react';
import { Calendar, LayoutList, Plus, X, UploadCloud, FileText, Image as ImageIcon, CheckCircle2, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import { ConstructionBanner } from './ConstructionBanner';
import { compressImage } from '../utils/imageCompressor';

interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

export const AgendaView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'project'>('calendar');
  const [isAgendaModalOpen, setAgendaModalOpen] = useState(false);
  const [isProjectModalOpen, setProjectModalOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        // Lakukan kompresi untuk gambar
        try {
          const result = await compressImage(file, 1024, 0.7);
          newAttachments.push({
            id: Date.now().toString() + i,
            name: file.name,
            size: result.compressedSize,
            type: 'image',
            url: result.dataUrl
          });
        } catch (error) {
          console.error("Gagal kompresi", error);
        }
      } else {
        // File biasa (PDF, docx, dll)
        newAttachments.push({
          id: Date.now().toString() + i,
          name: file.name,
          size: file.size,
          type: 'document'
        });
      }
    }

    setAttachments([...attachments, ...newAttachments]);
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto pb-24">
      <ConstructionBanner />
      
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary-500" />
            Agenda & Project
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola jadwal harian dan inisiatif project dalam satu tempat.
          </p>
        </div>

        <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl w-full sm:w-fit">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'calendar' ? 'bg-white dark:bg-[#1a2332] text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Calendar className="w-4 h-4" />
            Kalender Kerja
          </button>
          <button 
            onClick={() => setActiveTab('project')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'project' ? 'bg-white dark:bg-[#1a2332] text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Briefcase className="w-4 h-4" />
            Project
          </button>
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'calendar' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">September 2026</h2>
              <div className="flex gap-1">
                <button className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button 
              onClick={() => setAgendaModalOpen(true)}
              className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md shadow-primary-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Tambah Agenda</span>
            </button>
          </div>

          {/* Dummy Calendar Grid */}
          <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
              {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => (
                <div key={day} className="p-3 text-center text-xs font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 last:border-0">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-[100px] sm:auto-rows-[140px]">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className={`p-2 border-r border-b border-slate-100 dark:border-slate-800/50 relative hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${i === 11 ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}>
                  <span className={`text-xs font-bold ${i === 11 ? 'bg-primary-500 text-white w-6 h-6 flex items-center justify-center rounded-full' : 'text-slate-400 dark:text-slate-500'}`}>
                    {(i % 30) + 1}
                  </span>
                  {i === 11 && (
                    <div className="mt-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] p-1.5 rounded-md font-bold truncate border border-emerald-200 dark:border-emerald-800/50">
                      10:00 - Meeting Supplier
                    </div>
                  )}
                  {i === 14 && (
                    <div className="mt-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] p-1.5 rounded-md font-bold truncate border border-blue-200 dark:border-blue-800/50">
                      14:00 - Audit Gudang
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">Daftar Project</h2>
            <button 
              onClick={() => setProjectModalOpen(true)}
              className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md shadow-primary-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Buat Project</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Dummy Project Card */}
            <div className="bg-white dark:bg-[#1a2332] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] px-2 py-1 rounded-md font-black uppercase tracking-wider">
                    In Progress
                  </span>
                  <button className="text-slate-400 hover:text-slate-600">...</button>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Relokasi Rak Gudang B</h3>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  Pemindahan rak penyimpanan area B untuk optimalisasi jalur forklift dan perluasan area loading dock.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> 3 Lampiran
                </span>
                <span className="text-rose-500 font-bold">Tenggat: 15 Sep 2026</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Agenda */}
      {isAgendaModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="text-lg font-black dark:text-white">Tambah Agenda Baru</h2>
              <button onClick={() => setAgendaModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Judul Agenda</label>
                <input type="text" placeholder="Contoh: Meeting dengan supplier kardus" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tanggal</label>
                  <input type="date" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Waktu</label>
                  <input type="time" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:text-slate-200" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Deskripsi / Catatan</label>
                <textarea rows={3} placeholder="Tambahkan catatan khusus..." className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"></textarea>
              </div>

              {/* Upload Section */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Lampiran (Foto / Dokumen)</label>
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
                  className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group"
                >
                  <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 text-primary-500 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Klik untuk upload file</p>
                  <p className="text-xs text-slate-500 mt-1">Mendukung Foto (otomatis dikompres) & Dokumen PDF/Word</p>
                </div>

                {/* List Attachments */}
                {attachments.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <div className="flex items-center gap-3 overflow-hidden">
                          {att.type === 'image' ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                              <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                              <FileText className="w-5 h-5" />
                            </div>
                          )}
                          <div className="truncate">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-500">{formatSize(att.size)} • Tersimpan</p>
                          </div>
                        </div>
                        <button onClick={() => removeAttachment(att.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex gap-3">
              <button onClick={() => setAgendaModalOpen(false)} className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Batal
              </button>
              <button onClick={() => { setAgendaModalOpen(false); setAttachments([]); }} className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 transition-all">
                Simpan Agenda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Project - Mirip dengan Agenda untuk konsistensi UI Dummy */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="text-lg font-black dark:text-white">Buat Project Baru</h2>
              <button onClick={() => setProjectModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nama Project</label>
                <input type="text" placeholder="Contoh: Implementasi Software WMS" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tenggat Waktu (Deadline)</label>
                <input type="date" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:text-slate-200" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tujuan & Detail Project</label>
                <textarea rows={4} placeholder="Deskripsikan output yang diharapkan..." className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"></textarea>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-3 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800/50">
                Fitur unggah dokumen project dapat menggunakan mekanisme yang sama dengan form Agenda.
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex gap-3">
              <button onClick={() => setProjectModalOpen(false)} className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Batal
              </button>
              <button onClick={() => setProjectModalOpen(false)} className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 transition-all">
                Simpan Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
