import React, { useState, useEffect } from 'react';
import { 
  Truck, ClipboardCheck, ArrowRight, Package, Box, RefreshCw, 
  Scissors, CheckCircle2, AlertTriangle, Users, Clock, ShieldCheck, 
  Search, FileText, FileSpreadsheet, ScanLine, Database, Info, MessageSquare, Save, X
} from 'lucide-react';
import { getSystemDocs, saveSystemDoc } from '../services/supabase';
import { SystemDoc } from '../types';

const Arrow = () => (
  <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 relative min-w-[20px] shrink-0 z-0 hidden lg:block">
    <ArrowRight className="absolute -right-2 -top-2 w-4 h-4 text-slate-300 dark:text-slate-600" />
  </div>
);

const DownArrow = () => (
  <div className="h-6 w-0.5 bg-slate-200 dark:bg-slate-700 relative my-1 z-0 lg:hidden block">
    <ArrowRight className="absolute -bottom-2 -left-2 w-4 h-4 text-slate-300 dark:text-slate-600 rotate-90" />
  </div>
);

const WorkflowStep = ({ icon: Icon, title, desc, dbInfo, color }: { icon: any, title: string, desc: string, dbInfo?: string[], color: string }) => (
  <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 shadow-sm relative z-10 w-48 shrink-0 group hover:shadow-md transition-shadow">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1 leading-tight">{title}</h4>
    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mb-2">{desc}</p>
    
    {dbInfo && dbInfo.length > 0 && (
      <div className="w-full mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-md p-1.5 border border-slate-100 dark:border-slate-700/50 flex flex-col gap-1">
          {dbInfo.map((info, idx) => (
            <div key={idx} className="flex items-start gap-1">
              <Database className="w-2.5 h-2.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400 text-left leading-tight break-words whitespace-pre-wrap">{info}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default function SystemWorkflow({ session, onShowToast }: any) {
  const [docs, setDocs] = useState<Record<string, SystemDoc>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    const data = await getSystemDocs();
    const map: Record<string, SystemDoc> = {};
    data.forEach(d => { map[d.section_id] = d; });
    setDocs(map);
  };

  const handleEdit = (sectionId: string) => {
    setEditingId(sectionId);
    setEditContent(docs[sectionId]?.content || '');
  };

  const handleSave = async (sectionId: string) => {
    setSaving(true);
    try {
      await saveSystemDoc({
        section_id: sectionId,
        content: editContent,
        updated_by: session?.name || session?.username || 'Unknown'
      });
      onShowToast('Dokumentasi berhasil disimpan', 'success');
      setEditingId(null);
      fetchDocs();
    } catch (err) {
      onShowToast('Gagal menyimpan dokumen', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderCommentSection = (sectionId: string, title: string) => {
    const isEditing = editingId === sectionId;
    const doc = docs[sectionId];
    
    return (
      <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary-500" />
            Catatan Developer & AI ({title})
          </h4>
          {!isEditing && (
            <button 
              onClick={() => handleEdit(sectionId)}
              className="text-[10px] font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 rounded-md hover:bg-primary-100 transition-colors"
            >
              {doc?.content ? 'Edit Catatan' : '+ Tambah Catatan'}
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="w-full bg-white dark:bg-[#0a0f1c] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 min-h-[100px] outline-none focus:border-primary-500"
              placeholder="Tuliskan catatan teknis tentang alur data, logic frontend/backend, atau instruksi untuk AI di masa depan..."
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setEditingId(null)}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={() => handleSave(sectionId)}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Simpan
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-xl p-4 border border-slate-100 dark:border-slate-800">
            {doc?.content ? (
              <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                {doc.content}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic text-center py-2">
                Belum ada catatan teknis untuk alur ini. Tambahkan catatan agar Anda dan tim (atau AI) mengerti logic di baliknya.
              </div>
            )}
            {doc?.updated_by && (
              <div className="mt-3 text-[9px] text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Terakhir diperbarui oleh: <span className="font-bold">{doc.updated_by}</span> pada {new Date(doc.updated_at || '').toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit'})}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-50 dark:bg-[#0a0f1c] h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-8 pb-10">
        
        {/* WORKFLOW 1: INBOUND & QC */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">1. Inbound & Quality Control</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Alur penerimaan barang produksi hingga inspeksi mutu.</p>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
            <WorkflowStep 
              icon={Truck} 
              title="Penerimaan Produksi" 
              desc="Kedatangan barang Lokal CMT atau Kargo." 
              dbInfo={["INSERT: penerimaan_produksi", "SELECT: master_produk"]}
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ClipboardCheck} 
              title="Inspeksi QC" 
              desc="Hitung jumlah OKE dan REJECT." 
              dbInfo={["GET: penerimaan_produksi", "INSERT: qc_reports"]}
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <div className="flex flex-col gap-3 w-48 shrink-0">
               <WorkflowStep 
                icon={CheckCircle2} 
                title="Barang OKE" 
                desc="Masuk stok fisik reguler." 
                dbInfo={["INSERT: log_produk (IN)"]}
                color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
              />
              <WorkflowStep 
                icon={AlertTriangle} 
                title="Barang REJECT" 
                desc="Generate Tiket Perbaikan otomatis." 
                dbInfo={["INSERT: perbaikan_tickets"]}
                color="bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" 
              />
            </div>
          </div>
          {renderCommentSection('inbound_qc', 'Inbound & Quality Control')}
        </div>

        {/* WORKFLOW 2: PERBAIKAN */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">2. Modul Perbaikan (Repair)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Penanganan barang reject (kotor, robek, cacat).</p>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
            <WorkflowStep 
              icon={AlertTriangle} 
              title="Tiket REJECT" 
              desc="Barang menunggu disortir oleh kepala tim QC." 
              dbInfo={["SELECT: perbaikan_tickets (Tahap REJECT)"]}
              color="bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={RefreshCw} 
              title="Proses Perbaikan" 
              desc="Masuk tahap CUCI (noda) atau PERMAK (jahit)." 
              dbInfo={["UPDATE: perbaikan_tickets (tahap, status)"]}
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <div className="flex flex-col gap-3 w-48 shrink-0">
               <WorkflowStep 
                icon={CheckCircle2} 
                title="Grade A / Selesai" 
                desc="Kembali ke stok reguler atau di-obral." 
                dbInfo={["UPDATE: perbaikan_tickets", "INSERT: log_produk (IN)"]}
                color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
              />
            </div>
          </div>
          {renderCommentSection('perbaikan', 'Modul Perbaikan')}
        </div>

        {/* WORKFLOW 3: TARIKAN MD */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">3. Pengecekan Surat Jalan (Tarikan MD)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Komparasi dokumen SJ vs stok fisik saat kedatangan.</p>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
            <WorkflowStep 
              icon={FileText} 
              title="Upload CSV" 
              desc="Parse file Tarikan Surat Jalan dari MD." 
              dbInfo={["Client-Side Parsing (Papaparse)"]}
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ScanLine} 
              title="Scan Fisik" 
              desc="Scan barcode barang aktual yang datang." 
              dbInfo={["SELECT: master_produk", "State: React Local"]}
              color="bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ClipboardCheck} 
              title="Komparasi & Simpan" 
              desc="Menghasilkan status COCOK atau SELISIH." 
              dbInfo={["INSERT: pengecekan_sj_record", "SYNC (Opsional) ke Google Apps Script"]}
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
          {renderCommentSection('tarikan_md', 'Tarikan Surat Jalan')}
        </div>

        {/* WORKFLOW 4: PICKING & OUTBOUND */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">4. Picking & Outbound</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pengambilan barang dari rak hingga dikirim.</p>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
            <WorkflowStep 
              icon={FileText} 
              title="Request Picking" 
              desc="Generate daftar ambil barang via scanner atau App Script." 
              dbInfo={["INSERT: picking_list"]}
              color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={Box} 
              title="Checker Ambil" 
              desc="Gudang scan untuk ambil barang." 
              dbInfo={["UPDATE: picking_list (qty_picked, status)"]}
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ScanLine} 
              title="Packing" 
              desc="Scan ulang validasi (resi) saat bungkus." 
              dbInfo={["UPDATE: picking_list (status: SELESAI)", "INSERT: log_produk (OUT)"]}
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
          {renderCommentSection('picking_outbound', 'Picking & Outbound')}
        </div>

        {/* WORKFLOW 5: HR */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">5. HR & Kepegawaian</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Siklus presensi, shift, lembur, dan approval HR.</p>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
            <WorkflowStep 
              icon={Clock} 
              title="Shift & Presensi" 
              desc="Jadwal roster tim dan absen masuk/pulang harian." 
              dbInfo={["SELECT: roster_shift", "INSERT/UPDATE: presensi"]}
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={FileText} 
              title="Lembur & Cuti" 
              desc="Karyawan form pengajuan." 
              dbInfo={["INSERT: lembur", "INSERT: perijinan_cuti"]}
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ShieldCheck} 
              title="Approval & Rekap" 
              desc="HR/SPV menyetujui, tolak, dan rekap." 
              dbInfo={["UPDATE: lembur / perijinan_cuti (status_approval)"]}
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
          {renderCommentSection('hr_staffing', 'HR & Kepegawaian')}
        </div>

      </div>
    </div>
  );
}
