import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Users,
  Plus,
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Scissors,
  Camera,
  Upload,
  Trash2,
  Save,
  Send,
  Printer,
  Share2,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Layers,
  ZoomIn,
  MessageSquare,
  FileCheck2,
  Maximize2,
  ShieldCheck,
} from 'lucide-react';
import {
  QcPengerjaanJob,
  QcSizeTally,
  QcPhotoEvidence,
  UserSession,
} from '../../types';
import {
  calculateJobTotals,
  saveSingleQcJob,
  finalizeAndSubmitQcJob,
} from '../../services/qcPengerjaanService';
import { QcBeritaAcaraModal } from './QcBeritaAcaraModal';
import { compressImage } from '../../utils/imageCompressor';

interface QcPengerjaanWorkspaceProps {
  job: QcPengerjaanJob;
  session: UserSession | null;
  onBack: () => void;
  onSaveJob: (updatedJob: QcPengerjaanJob) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const COMMON_DEFECT_LABELS = [
  'Noda Minyak / Kotor',
  'Jahitan Lepas / Bolong',
  'Kain Cacat / Salur',
  'Kancing / Resleting Rusak',
  'Obras Tidak Rapi',
  'Ukuran Tidak Sesuai',
  'Aksesoris Kurang',
  'Defect Lainnya',
];

export const QcPengerjaanWorkspace: React.FC<QcPengerjaanWorkspaceProps> = ({
  job: initialJob,
  session,
  onBack,
  onSaveJob,
  onShowToast,
}) => {
  const [job, setJob] = useState<QcPengerjaanJob>(initialJob);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState<number>(0);
  const [newPicName, setNewPicName] = useState<string>('');
  const [isAddingPic, setIsAddingPic] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isBeritaAcaraOpen, setIsBeritaAcaraOpen] = useState<boolean>(false);
  const [activePhotoLabel, setActivePhotoLabel] = useState<string>('Noda Minyak / Kotor');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Sync state if initialJob changes
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  // Kalkulasi realtime
  const totals = calculateJobTotals(job.sizes);
  const activeSize = job.sizes[selectedSizeIndex] || job.sizes[0];

  // Helper update size tally
  const updateActiveSizeTally = (updates: Partial<QcSizeTally>) => {
    if (!activeSize) return;
    const newSizes = [...job.sizes];
    const current = newSizes[selectedSizeIndex];
    newSizes[selectedSizeIndex] = {
      ...current,
      ...updates,
    };
    const newTotals = calculateJobTotals(newSizes);
    const updatedJob: QcPengerjaanJob = {
      ...job,
      sizes: newSizes,
      ...newTotals,
      status: job.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
  };

  // Quick Counter Adder
  const handleAddCount = (
    field: 'qty_oke' | 'qty_noda' | 'qty_permak' | 'qty_defect',
    amount: number
  ) => {
    if (!activeSize) return;
    const currentVal = Number(activeSize[field]) || 0;
    const newVal = Math.max(0, currentVal + amount);
    updateActiveSizeTally({ [field]: newVal });
  };

  // Set Semua Sisa Jadi OKE
  const handleSetRemainingToOke = () => {
    if (!activeSize) return;
    const currentReject =
      (activeSize.qty_noda || 0) +
      (activeSize.qty_permak || 0) +
      (activeSize.qty_defect || 0);
    const remaining = Math.max(0, activeSize.qty_awal - currentReject);
    updateActiveSizeTally({ qty_oke: remaining });
    onShowToast(`Size ${activeSize.size}: Qty OKE diset ke ${remaining} pcs`, 'info');
  };

  // Add PIC
  const handleAddPic = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPicName.trim();
    if (!clean) return;
    if (job.pic_list.some((p) => p.toLowerCase() === clean.toLowerCase())) {
      onShowToast('PIC ini sudah ada dalam daftar tim!', 'warning');
      return;
    }
    const updatedPics = [...job.pic_list, clean];
    const updatedJob: QcPengerjaanJob = {
      ...job,
      pic_list: updatedPics,
      status: job.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
    setNewPicName('');
    setIsAddingPic(false);
    onShowToast(`PIC ${clean} ditambahkan ke tim pengerjaan`, 'success');
  };

  // Remove PIC
  const handleRemovePic = (picToRemove: string) => {
    const updatedPics = job.pic_list.filter((p) => p !== picToRemove);
    const updatedJob: QcPengerjaanJob = {
      ...job,
      pic_list: updatedPics,
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
  };

  // Upload Foto Evidence
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      const newEvidences: QcPhotoEvidence[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file, 1000, 0.75);
        newEvidences.push({
          id: `PHOTO-${Date.now()}-${i}`,
          url: compressed.dataUrl,
          label: activePhotoLabel,
          size: activeSize?.size,
          tipe: activePhotoLabel.includes('Noda')
            ? 'NODA'
            : activePhotoLabel.includes('Jahit') || activePhotoLabel.includes('Permak')
            ? 'PERMAK'
            : activePhotoLabel.includes('Cacat') || activePhotoLabel.includes('Defect')
            ? 'DEFECT'
            : 'LAINNYA',
          timestamp: new Date().toISOString(),
        });
      }

      const updatedEvidence = [...(job.foto_evidence || []), ...newEvidences];
      const updatedJob: QcPengerjaanJob = {
        ...job,
        foto_evidence: updatedEvidence,
      };
      setJob(updatedJob);
      saveSingleQcJob(updatedJob);
      onShowToast(`Berhasil menambahkan ${newEvidences.length} foto bukti temuan`, 'success');
    } catch (err: any) {
      onShowToast('Gagal memproses foto: ' + err.message, 'error');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // Delete Foto Evidence
  const handleDeletePhoto = (photoId: string) => {
    const updated = (job.foto_evidence || []).filter((p) => p.id !== photoId);
    const updatedJob: QcPengerjaanJob = {
      ...job,
      foto_evidence: updated,
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
    onShowToast('Foto bukti dihapus', 'info');
  };

  // Selesaikan QC & Sinkronkan
  const handleFinalize = async () => {
    if (totals.total_diperiksa === 0) {
      onShowToast('Belum ada item yang diperiksa!', 'warning');
      return;
    }

    if (job.pic_list.length === 0) {
      onShowToast('Harap tambahkan minimal 1 nama PIC pemeriksa!', 'warning');
      return;
    }

    const confirmMsg = `Konfirmasi penyelesaian QC untuk Kode ${job.kode_produksi}?\n\n• Qty Awal: ${totals.total_qty_awal} pcs\n• Diperiksa: ${totals.total_diperiksa} pcs\n• Lolos (OKE): ${totals.total_qty_oke} pcs\n• Reject: ${totals.total_qty_noda + totals.total_qty_permak + totals.total_qty_defect} pcs\n• Tim PIC: ${job.pic_list.join(', ')}\n\nLaporan QC resmi dan tiket perbaikan akan otomatis dibuat dan disinkronkan ke Supabase.`;

    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      const result = await finalizeAndSubmitQcJob(job, session);
      if (result.success) {
        onShowToast(result.message, 'success');
        const updatedJob: QcPengerjaanJob = {
          ...job,
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
        };
        setJob(updatedJob);
        onSaveJob(updatedJob);
        setIsBeritaAcaraOpen(true);
      } else {
        onShowToast(result.message, 'error');
      }
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 animate-fadeIn">
      {/* 1. Header Toolbar Master Job Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Kembali ke Daftar Antrean"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider ${
                job.source_type === 'MUTASI' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
              } shadow-2xs`}>
                {job.source_type === 'MUTASI' ? 'QC Mutasi Surat Jalan' : 'Master QC Job Card'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider ${
                  job.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : job.status === 'IN_PROGRESS'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {job.status === 'COMPLETED'
                  ? '🟢 Selesai QC'
                  : job.status === 'IN_PROGRESS'
                  ? '🔵 Sedang Dikerjakan'
                  : '🟡 Draft / Menunggu'}
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {job.source_type === 'MUTASI' ? `Surat Jalan: ${job.no_surat_jalan}` : `#${job.kode_produksi}`}{' '}
              {job.warna && job.warna !== '-' && (
                <span className="text-base font-sans font-bold text-slate-600 dark:text-slate-400">
                  ({job.warna})
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {job.source_type === 'MUTASI' ? (
                <>🏪 Asal Store: <span className="font-bold text-slate-700 dark:text-slate-300">{job.store_asal || 'Store'}</span> • Total: <span className="font-bold">{job.sizes.length} SKU/Item</span></>
              ) : (
                <>Surat Jalan: <span className="font-bold text-slate-700 dark:text-slate-300">{job.no_surat_jalan}</span> • Kategori: <span className="font-bold">{job.kategori || 'Lokal CMT'}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons Top */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setIsBeritaAcaraOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Berita Acara</span>
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-black transition-all shadow-md shadow-emerald-600/25 cursor-pointer"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            <span>Selesaikan QC</span>
          </button>
        </div>
      </div>

      {/* 2. Team PIC Kolaborasi Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Tim PIC Pemeriksa QC ({job.pic_list.length} Orang):
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {job.pic_list.map((pic) => (
              <span
                key={pic}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 rounded-lg text-xs font-bold shadow-2xs"
              >
                <span>{pic}</span>
                <button
                  type="button"
                  onClick={() => handleRemovePic(pic)}
                  className="p-0.5 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                  title={`Hapus ${pic}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {isAddingPic ? (
              <form onSubmit={handleAddPic} className="inline-flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Nama PIC..."
                  value={newPicName}
                  onChange={(e) => setNewPicName(e.target.value)}
                  autoFocus
                  className="px-2.5 py-1 text-xs border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  Tambah
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingPic(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingPic(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-dashed border-slate-300 dark:border-slate-700"
              >
                <Plus className="w-3 h-3" />
                <span>Tambah PIC</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Live Progress Meter & Realtime Agregat KPI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Progress Pemeriksaan
            </span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {totals.total_diperiksa} / {totals.total_qty_awal} Pcs
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Pass Rate:{' '}
              <strong className="text-blue-600 dark:text-blue-400 text-sm">{totals.pass_rate}%</strong>
            </span>
            <span className="text-slate-500">
              Selisih:{' '}
              <strong
                className={`text-sm ${
                  totals.total_selisih === 0
                    ? 'text-slate-600 dark:text-slate-400'
                    : totals.total_selisih > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {totals.total_selisih > 0 ? `+${totals.total_selisih}` : totals.total_selisih} pcs
              </strong>
            </span>
          </div>
        </div>

        {/* Multi-color Progress Bar */}
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          {totals.total_qty_awal > 0 && (
            <>
              <div
                style={{ width: `${(totals.total_qty_oke / totals.total_qty_awal) * 100}%` }}
                className="bg-emerald-500 h-full transition-all duration-300"
                title={`Lolos OKE: ${totals.total_qty_oke} pcs`}
              />
              <div
                style={{ width: `${(totals.total_qty_noda / totals.total_qty_awal) * 100}%` }}
                className="bg-amber-500 h-full transition-all duration-300"
                title={`Noda: ${totals.total_qty_noda} pcs`}
              />
              <div
                style={{ width: `${(totals.total_qty_permak / totals.total_qty_awal) * 100}%` }}
                className="bg-orange-500 h-full transition-all duration-300"
                title={`Permak: ${totals.total_qty_permak} pcs`}
              />
              <div
                style={{ width: `${(totals.total_qty_defect / totals.total_qty_awal) * 100}%` }}
                className="bg-rose-500 h-full transition-all duration-300"
                title={`Defect: ${totals.total_qty_defect} pcs`}
              />
            </>
          )}
        </div>

        {/* 4 Cards Ringkasan */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Lolos OKE */}
          <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-emerald-800 dark:text-emerald-300">
                ✅ Lolos (Grade A)
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              {totals.total_qty_oke}{' '}
              <span className="text-xs font-normal text-emerald-600/70">pcs</span>
            </p>
          </div>

          {/* Noda Cuci */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-amber-800 dark:text-amber-300">
                🧼 Noda (Cuci)
              </span>
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
              {totals.total_qty_noda}{' '}
              <span className="text-xs font-normal text-amber-600/70">pcs</span>
            </p>
          </div>

          {/* Permak Jahit */}
          <div className="p-3 bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/80 dark:border-orange-900 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-orange-800 dark:text-orange-300">
                🪡 Permak (Jahit)
              </span>
              <Scissors className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">
              {totals.total_qty_permak}{' '}
              <span className="text-xs font-normal text-orange-600/70">pcs</span>
            </p>
          </div>

          {/* Defect BS */}
          <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-rose-800 dark:text-rose-300">
                ❌ Defect (BS)
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">
              {totals.total_qty_defect}{' '}
              <span className="text-xs font-normal text-rose-600/70">pcs</span>
            </p>
          </div>
        </div>
      </div>

      {/* 4. WORKSPACE WORKBENCH: Tally Counter Cepat per Varian */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        {/* Size / Variant Tab Switcher */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Pilih Varian / SKU untuk Tally:
            </span>
            {activeSize && (
              <span className="text-xs text-slate-500 font-medium">
                {job.source_type === 'MUTASI' ? 'Fisik SJ:' : 'Setoran Awal:'}{' '}
                <strong className="text-slate-800 dark:text-slate-200">{activeSize.qty_awal} pcs</strong> | Diperiksa:{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {activeSize.qty_oke + activeSize.qty_noda + activeSize.qty_permak + activeSize.qty_defect} pcs
                </strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {job.sizes.map((s, idx) => {
              const totalPeriksa = s.qty_oke + s.qty_noda + s.qty_permak + s.qty_defect;
              const isMatch = totalPeriksa === s.qty_awal;
              const isSelected = selectedSizeIndex === idx;

              return (
                <button
                  key={s.sku ? `${s.sku}_${s.size}_${idx}` : `${s.size}_${idx}`}
                  type="button"
                  onClick={() => setSelectedSizeIndex(idx)}
                  className={`flex flex-col items-start px-3 py-2 rounded-xl font-bold transition-all shrink-0 cursor-pointer min-w-[110px] text-left border ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-500/40'
                      : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1.5">
                    <span className="text-xs font-black font-mono leading-tight truncate max-w-[130px]">
                      {s.warna && s.warna !== '-' ? `${s.warna} • ` : ''}{s.size}
                    </span>
                    {isMatch && totalPeriksa > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </div>
                  <span className={`text-[10px] mt-0.5 truncate max-w-[130px] ${isSelected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {s.sku ? s.sku : `Size ${s.size}`}
                  </span>
                  <span className={`text-[10px] font-extrabold mt-0.5 ${isSelected ? 'text-white' : totalPeriksa > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                    {totalPeriksa} / {s.qty_awal} pcs
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Item Banner */}
          {activeSize && (
            <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between flex-wrap gap-2.5 text-xs">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-mono font-black text-indigo-950 dark:text-indigo-200 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {activeSize.sku || `${job.kode_produksi}-${activeSize.size}`}
                </span>
                {activeSize.nama_produk && (
                  <span className="text-slate-800 dark:text-slate-200 font-bold truncate">
                    {activeSize.nama_produk}
                  </span>
                )}
                {activeSize.warna && activeSize.warna !== '-' && (
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 rounded-md font-bold text-[11px] border border-amber-200 dark:border-amber-900">
                    Warna: {activeSize.warna}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 rounded-md font-black text-[11px] border border-indigo-200 dark:border-indigo-900">
                  Size: {activeSize.size}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Fisik Awal: <strong className="text-slate-900 dark:text-white font-extrabold">{activeSize.qty_awal} pcs</strong>
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                  Selesai: {activeSize.qty_oke + activeSize.qty_noda + activeSize.qty_permak + activeSize.qty_defect} pcs
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Tally Controls Pad (Tampilan Tombol Sentuh Besar untuk Operasional Lapangan Cepat) */}
        {activeSize && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {/* 1. Lolos / OKE (Grade A) */}
            <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                  Lolos (Grade A)
                </span>
                <button
                  type="button"
                  onClick={handleSetRemainingToOke}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                  title="Otomatis isi sisa kuota size ini menjadi OKE"
                >
                  Sisa Semua OKE
                </button>
              </div>

              {/* Counter Display & Direct Numeric Input */}
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', -1)}
                  className="w-10 h-10 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl font-black text-lg hover:bg-emerald-100 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={activeSize.qty_oke || 0}
                  onChange={(e) => updateActiveSizeTally({ qty_oke: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 text-center text-xl font-black font-mono bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl py-1.5 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', 1)}
                  className="w-10 h-10 bg-emerald-600 text-white rounded-xl font-black text-lg hover:bg-emerald-700 flex items-center justify-center cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  +
                </button>
              </div>

              {/* Quick Multi-Add Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', 1)}
                  className="py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', 5)}
                  className="py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +5
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', 10)}
                  className="py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +10
                </button>
              </div>
            </div>

            {/* 2. Noda (Cuci) */}
            <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2.5">
              <span className="text-xs font-black text-amber-800 dark:text-amber-300">
                Noda (Cuci)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', -1)}
                  className="w-10 h-10 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-xl font-black text-lg hover:bg-amber-100 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={activeSize.qty_noda || 0}
                  onChange={(e) => updateActiveSizeTally({ qty_noda: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 text-center text-xl font-black font-mono bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl py-1.5 text-amber-700 dark:text-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', 1)}
                  className="w-10 h-10 bg-amber-600 text-white rounded-xl font-black text-lg hover:bg-amber-700 flex items-center justify-center cursor-pointer shadow-md shadow-amber-600/20 active:scale-95"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', 1)}
                  className="py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', 3)}
                  className="py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +3
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', 5)}
                  className="py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +5
                </button>
              </div>
            </div>

            {/* 3. Permak (Jahit) */}
            <div className="p-3.5 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/60 rounded-xl space-y-2.5">
              <span className="text-xs font-black text-orange-800 dark:text-orange-300">
                Permak (Jahit)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', -1)}
                  className="w-10 h-10 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 rounded-xl font-black text-lg hover:bg-orange-100 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={activeSize.qty_permak || 0}
                  onChange={(e) => updateActiveSizeTally({ qty_permak: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 text-center text-xl font-black font-mono bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-700 rounded-xl py-1.5 text-orange-700 dark:text-orange-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', 1)}
                  className="w-10 h-10 bg-orange-600 text-white rounded-xl font-black text-lg hover:bg-orange-700 flex items-center justify-center cursor-pointer shadow-md shadow-orange-600/20 active:scale-95"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', 1)}
                  className="py-1.5 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/60 dark:hover:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', 3)}
                  className="py-1.5 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/60 dark:hover:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +3
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', 5)}
                  className="py-1.5 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/60 dark:hover:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +5
                </button>
              </div>
            </div>

            {/* 4. Defect (BS) */}
            <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-2.5">
              <span className="text-xs font-black text-rose-800 dark:text-rose-300">
                Defect (BS Permanen)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', -1)}
                  className="w-10 h-10 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl font-black text-lg hover:bg-rose-100 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={activeSize.qty_defect || 0}
                  onChange={(e) => updateActiveSizeTally({ qty_defect: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 text-center text-xl font-black font-mono bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-xl py-1.5 text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', 1)}
                  className="w-10 h-10 bg-rose-600 text-white rounded-xl font-black text-lg hover:bg-rose-700 flex items-center justify-center cursor-pointer shadow-md shadow-rose-600/20 active:scale-95"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', 1)}
                  className="py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +1 Defect
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', 3)}
                  className="py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95"
                >
                  +3 Defect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. TABEL REKAPITULASI MATRIKS PER VARIAN & SKU */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Tabel Rangkuman Hasil Pemeriksaan per Varian & SKU
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">
            Total {job.sizes.length} Varian
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">SKU / Item</th>
                {job.source_type === 'MUTASI' && (
                  <th className="px-3 py-2.5">Nama Produk</th>
                )}
                <th className="px-3 py-2.5">Warna</th>
                <th className="px-3 py-2.5 text-center">Size</th>
                <th className="px-3 py-2.5 text-right">Qty Awal</th>
                <th className="px-3 py-2.5 text-right text-emerald-700 dark:text-emerald-400">Lolos (OKE)</th>
                <th className="px-3 py-2.5 text-right text-amber-700 dark:text-amber-400">Noda</th>
                <th className="px-3 py-2.5 text-right text-orange-700 dark:text-orange-400">Permak</th>
                <th className="px-3 py-2.5 text-right text-rose-700 dark:text-rose-400">Defect</th>
                <th className="px-3 py-2.5 text-right">Diperiksa</th>
                <th className="px-3 py-2.5 text-right">Selisih</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {job.sizes.map((s, idx) => {
                const totalPeriksa = s.qty_oke + s.qty_noda + s.qty_permak + s.qty_defect;
                const selisih = totalPeriksa - s.qty_awal;
                const isSelected = selectedSizeIndex === idx;

                return (
                  <tr
                    key={s.sku ? `${s.sku}_${s.size}_${idx}` : `${s.size}_${idx}`}
                    onClick={() => setSelectedSizeIndex(idx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-black font-mono text-slate-900 dark:text-white">
                      {s.sku || `${job.kode_produksi}-${s.size}`}
                    </td>
                    {job.source_type === 'MUTASI' && (
                      <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate">
                        {s.nama_produk || '-'}
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                      {s.warna && s.warna !== '-' ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-bold">
                          {s.warna}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black font-mono text-indigo-700 dark:text-indigo-300">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
                        {s.size}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                      {s.qty_awal}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {s.qty_oke}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                      {s.qty_noda}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-orange-600 dark:text-orange-400">
                      {s.qty_permak}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400">
                      {s.qty_defect}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-white">
                      {totalPeriksa}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold">
                      {selisih === 0 ? (
                        <span className="text-slate-400">0</span>
                      ) : selisih > 0 ? (
                        <span className="text-emerald-600">+{selisih}</span>
                      ) : (
                        <span className="text-rose-600">{selisih}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {totalPeriksa === 0 ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                          Belum
                        </span>
                      ) : totalPeriksa === s.qty_awal ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          Pas ({s.qty_awal})
                        </span>
                      ) : totalPeriksa < s.qty_awal ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          Kurang {s.qty_awal - totalPeriksa}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                          Lebih +{totalPeriksa - s.qty_awal}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100/80 dark:bg-slate-800/90 font-black border-t-2 border-slate-300 dark:border-slate-700">
              <tr>
                <td
                  colSpan={job.source_type === 'MUTASI' ? 4 : 3}
                  className="px-3 py-2.5 text-slate-900 dark:text-white uppercase tracking-wider font-black"
                >
                  TOTAL ({job.sizes.length} Varian)
                </td>
                <td className="px-3 py-2.5 text-right">{totals.total_qty_awal}</td>
                <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{totals.total_qty_oke}</td>
                <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">{totals.total_qty_noda}</td>
                <td className="px-3 py-2.5 text-right text-orange-600 dark:text-orange-400">{totals.total_qty_permak}</td>
                <td className="px-3 py-2.5 text-right text-rose-600 dark:text-rose-400">{totals.total_qty_defect}</td>
                <td className="px-3 py-2.5 text-right text-slate-900 dark:text-white">{totals.total_diperiksa}</td>
                <td className="px-3 py-2.5 text-right">
                  {totals.total_selisih === 0 ? (
                    <span className="text-slate-400">0</span>
                  ) : totals.total_selisih > 0 ? (
                    <span className="text-emerald-600">+{totals.total_selisih}</span>
                  ) : (
                    <span className="text-rose-600">{totals.total_selisih}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center text-blue-600 dark:text-blue-400 font-bold">
                  {totals.pass_rate}% Lolos
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 6. DOKUMENTASI FOTO TEMUAN & CATATAN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upload Foto Bukti */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Dokumentasi Foto Temuan ({job.foto_evidence?.length || 0})
              </h3>
            </div>

            {/* Label Selector */}
            <select
              value={activePhotoLabel}
              onChange={(e) => setActivePhotoLabel(e.target.value)}
              className="text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg font-medium"
            >
              {COMMON_DEFECT_LABELS.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>

          {/* Upload Button */}
          <div>
            <label
              className={`flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                isUploadingPhoto ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>{isUploadingPhoto ? 'Mengompres foto...' : 'Jepret Kamera / Upload Foto Temuan'}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Label: {activePhotoLabel}</p>
            </label>
          </div>

          {/* Grid Foto Evidence */}
          {job.foto_evidence && job.foto_evidence.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
              {job.foto_evidence.map((photo) => (
                <div
                  key={photo.id}
                  className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 aspect-square"
                >
                  <img
                    src={photo.url}
                    alt={photo.label}
                    onClick={() => setLightboxUrl(photo.url)}
                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                    <p className="text-[9px] font-bold text-white truncate">{photo.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                    title="Hapus foto ini"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">Belum ada foto temuan yang dilampirkan.</p>
          )}
        </div>

        {/* Catatan Khusus QC */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Catatan & Masukan untuk CMT / Konveksi
            </h3>
          </div>

          <textarea
            rows={5}
            placeholder="Tuliskan catatan khusus untuk penjahit / supplier, misal: kerapian jahitan obras, kancing cadangan, noda minyak kain, instruksi perbaikan..."
            value={job.catatan_umum || ''}
            onChange={(e) => {
              const val = e.target.value;
              const updatedJob = { ...job, catatan_umum: val };
              setJob(updatedJob);
              saveSingleQcJob(updatedJob);
            }}
            className="w-full text-xs p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Otomatis tersimpan & tersinkronisasi ke Berita Acara</span>
            <button
              type="button"
              onClick={() => {
                saveSingleQcJob(job);
                onShowToast('Draft berhasil disimpan!', 'success');
              }}
              className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Draft</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={lightboxUrl} alt="Preview Bukti QC" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Berita Acara Modal */}
      <QcBeritaAcaraModal
        isOpen={isBeritaAcaraOpen}
        onClose={() => setIsBeritaAcaraOpen(false)}
        job={job}
        onShowToast={onShowToast}
      />
    </div>
  );
};
