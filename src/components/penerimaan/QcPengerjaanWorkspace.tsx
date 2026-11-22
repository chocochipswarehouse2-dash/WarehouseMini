import React, { useState, useEffect } from 'react';
import { NumberInput } from '../common/NumberInput';
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
  const totalRejectCount = totals.total_qty_noda + totals.total_qty_permak + totals.total_qty_defect;

  // Helper update size tally by index (Direct Table Editing)
  const updateSizeTallyByIndex = (index: number, updates: Partial<QcSizeTally>) => {
    if (index < 0 || index >= job.sizes.length) return;
    const newSizes = [...job.sizes];
    newSizes[index] = {
      ...newSizes[index],
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

  // Helper update size tally for active size tab
  const updateActiveSizeTally = (updates: Partial<QcSizeTally>) => {
    updateSizeTallyByIndex(selectedSizeIndex, updates);
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

  // Set Semua Sisa Jadi OKE (Active Row)
  const handleSetRemainingToOke = () => {
    handleSetRowRemainingToOke(selectedSizeIndex);
  };

  // Set Row Sisa Jadi OKE
  const handleSetRowRemainingToOke = (index: number) => {
    const s = job.sizes[index];
    if (!s) return;
    const currentReject =
      (s.qty_noda || 0) +
      (s.qty_permak || 0) +
      (s.qty_defect || 0);
    const remaining = Math.max(0, s.qty_awal - currentReject);
    updateSizeTallyByIndex(index, { qty_oke: remaining });
    onShowToast(`${s.size}: Qty OKE diset ke ${remaining} pcs`, 'info');
  };

  // Set SEMUA Varian Jadi Lolos (Grade A 100%)
  const handleSetAllToOke = () => {
    const newSizes = job.sizes.map((s) => ({
      ...s,
      qty_oke: s.qty_awal,
      qty_noda: 0,
      qty_permak: 0,
      qty_defect: 0,
    }));
    const newTotals = calculateJobTotals(newSizes);
    const updatedJob: QcPengerjaanJob = {
      ...job,
      sizes: newSizes,
      ...newTotals,
      status: job.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
    onShowToast(`Seluruh ${job.sizes.length} varian diset Lolos (Grade A) 100%`, 'success');
  };

  // Reset SEMUA input ke 0
  const handleResetAllToZero = () => {
    const newSizes = job.sizes.map((s) => ({
      ...s,
      qty_oke: 0,
      qty_noda: 0,
      qty_permak: 0,
      qty_defect: 0,
    }));
    const newTotals = calculateJobTotals(newSizes);
    const updatedJob: QcPengerjaanJob = {
      ...job,
      sizes: newSizes,
      ...newTotals,
      status: job.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
    };
    setJob(updatedJob);
    saveSingleQcJob(updatedJob);
    onShowToast('Semua input pemeriksaan telah di-reset ke 0', 'info');
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

  // Upload Foto Evidence with specific reject category
  const handleCategorizedPhotoUpload = async (
    files: FileList | null,
    categoryType: 'NODA' | 'PERMAK' | 'DEFECT' | 'LAINNYA',
    customLabel?: string
  ) => {
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      const defaultLabel =
        categoryType === 'NODA'
          ? 'Noda Minyak / Kotor'
          : categoryType === 'PERMAK'
          ? 'Jahitan / Permak'
          : categoryType === 'DEFECT'
          ? 'Defect / BS Bahan'
          : 'Foto Tambahan';

      const newEvidences: QcPhotoEvidence[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file, 1000, 0.75);
        newEvidences.push({
          id: `PHOTO-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          url: compressed.dataUrl,
          label: customLabel || defaultLabel,
          tipe: categoryType,
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
      onShowToast(`Berhasil menambahkan ${newEvidences.length} foto (${customLabel || defaultLabel})`, 'success');
    } catch (err: any) {
      onShowToast('Gagal memproses foto: ' + err.message, 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Upload Foto Evidence (General)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const categoryType: 'NODA' | 'PERMAK' | 'DEFECT' | 'LAINNYA' = activePhotoLabel.includes('Noda')
      ? 'NODA'
      : activePhotoLabel.includes('Jahit') || activePhotoLabel.includes('Permak') || activePhotoLabel.includes('Obras')
      ? 'PERMAK'
      : activePhotoLabel.includes('Cacat') || activePhotoLabel.includes('Defect') || activePhotoLabel.includes('Kain')
      ? 'DEFECT'
      : 'LAINNYA';

    await handleCategorizedPhotoUpload(files, categoryType, activePhotoLabel);
    e.target.value = '';
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
    <div className="space-y-3 pb-28 sm:pb-20 animate-fadeIn">
      {/* 1. Header Toolbar Master Job Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 shrink-0 inline-flex items-center justify-center bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Kembali ke Daftar Antrean"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {job.source_type === 'MUTASI' ? 'QC Mutasi SJ' : 'QC Produksi'}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  job.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : job.status === 'IN_PROGRESS'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    job.status === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : job.status === 'IN_PROGRESS'
                      ? 'bg-indigo-500'
                      : 'bg-amber-500'
                  }`}
                />
                {job.status === 'COMPLETED'
                  ? 'Selesai QC'
                  : job.status === 'IN_PROGRESS'
                  ? 'Pengerjaan'
                  : 'Menunggu'}
              </span>
            </div>
            <h1 className="text-base sm:text-xl font-black font-mono text-slate-900 dark:text-white mt-0.5 truncate">
              {job.source_type === 'MUTASI' ? `SJ ${job.no_surat_jalan}` : `#${job.kode_produksi}`}
              {job.warna && job.warna !== '-' && (
                <span className="text-xs sm:text-sm font-sans font-semibold text-slate-500 dark:text-slate-400 ml-1.5">
                  ({job.warna})
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {job.source_type === 'MUTASI' ? (
                <>
                  Asal: <strong className="text-slate-700 dark:text-slate-300">{job.store_asal || 'Store'}</strong>
                  {' · '}
                  {job.sizes.length} SKU/Item
                </>
              ) : (
                <>
                  SJ <strong className="font-mono text-slate-700 dark:text-slate-300">{job.no_surat_jalan}</strong>
                  {' · '}
                  {job.kategori || 'Lokal CMT'}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Desktop Action Buttons */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsBeritaAcaraOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Berita Acara</span>
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 min-h-[40px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            <span>Selesaikan QC</span>
          </button>
        </div>
      </div>

      {/* 2. Team PIC Kolaborasi Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Tim PIC Pemeriksa ({job.pic_list.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {job.pic_list.map((pic) => (
              <span
                key={pic}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 rounded-lg text-xs font-semibold"
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
                  className="px-2.5 min-h-[34px] text-xs border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium w-32 sm:w-40"
                />
                <button
                  type="submit"
                  className="px-2.5 min-h-[34px] bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  Tambah
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingPic(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingPic(true)}
                className="inline-flex items-center gap-1 px-2.5 min-h-[32px] bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-dashed border-slate-300 dark:border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah PIC</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Live Progress Meter & Realtime Agregat KPI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Progress
            </span>
            <span className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {totals.total_diperiksa} / {totals.total_qty_awal} pcs
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs tabular-nums">
            <span className="text-slate-500">
              Pass Rate:{' '}
              <strong className="font-mono text-indigo-600 dark:text-indigo-400">{totals.pass_rate}%</strong>
            </span>
            <span className="text-slate-500">
              Selisih:{' '}
              <strong
                className={`font-mono ${
                  totals.total_selisih === 0
                    ? 'text-slate-600 dark:text-slate-400'
                    : totals.total_selisih > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {totals.total_selisih > 0 ? `+${totals.total_selisih}` : totals.total_selisih}
              </strong>
            </span>
          </div>
        </div>

        {/* Multi-color Progress Bar */}
        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
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

        {/* 4 Compact Summary Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-900/70 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                Lolos Grade A
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
              {totals.total_qty_oke} <span className="text-[10px] font-sans font-normal text-emerald-600/70">pcs</span>
            </p>
          </div>

          <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/70 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                Noda (Cuci)
              </span>
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-0.5">
              {totals.total_qty_noda} <span className="text-[10px] font-sans font-normal text-amber-600/70">pcs</span>
            </p>
          </div>

          <div className="p-2.5 bg-orange-50/60 dark:bg-orange-950/25 border border-orange-200/80 dark:border-orange-900/70 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-orange-800 dark:text-orange-300">
                Permak (Jahit)
              </span>
              <Scissors className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-orange-700 dark:text-orange-300 mt-0.5">
              {totals.total_qty_permak} <span className="text-[10px] font-sans font-normal text-orange-600/70">pcs</span>
            </p>
          </div>

          <div className="p-2.5 bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200/80 dark:border-rose-900/70 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-rose-800 dark:text-rose-300">
                Defect (BS)
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-rose-700 dark:text-rose-300 mt-0.5">
              {totals.total_qty_defect} <span className="text-[10px] font-sans font-normal text-rose-600/70">pcs</span>
            </p>
          </div>
        </div>
      </div>

      {/* 4. WORKSPACE WORKBENCH: Tally Counter Cepat per Varian */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        {/* Size / Variant Tab Switcher */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Tally Cepat per Varian
            </span>
            {activeSize && (
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Awal: <strong className="text-slate-800 dark:text-slate-200">{activeSize.qty_awal}</strong>
                {' · '}
                Dicek:{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {activeSize.qty_oke + activeSize.qty_noda + activeSize.qty_permak + activeSize.qty_defect}
                </strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {job.sizes.map((s, idx) => {
              const totalPeriksa = s.qty_oke + s.qty_noda + s.qty_permak + s.qty_defect;
              const isMatch = totalPeriksa === s.qty_awal;
              const isSelected = selectedSizeIndex === idx;

              return (
                <button
                  key={s.sku ? `${s.sku}_${s.size}_${idx}` : `${s.size}_${idx}`}
                  type="button"
                  onClick={() => setSelectedSizeIndex(idx)}
                  className={`flex flex-col items-start px-3 py-2 rounded-xl font-bold transition-all shrink-0 cursor-pointer min-w-[104px] text-left border ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1.5">
                    <span className="text-xs font-black font-mono leading-tight truncate max-w-[120px]">
                      {s.warna && s.warna !== '-' ? `${s.warna} · ` : ''}
                      {s.size}
                    </span>
                    {isMatch && totalPeriksa > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                      isSelected
                        ? 'text-indigo-100'
                        : totalPeriksa > 0
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {totalPeriksa}/{s.qty_awal} pcs
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Item Banner */}
          {activeSize && (
            <div className="mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="font-mono font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]">
                  {activeSize.sku || `${job.kode_produksi}-${activeSize.size}`}
                </span>
                {activeSize.nama_produk && (
                  <span className="text-slate-700 dark:text-slate-200 font-semibold truncate text-[11px]">
                    {activeSize.nama_produk}
                  </span>
                )}
                {activeSize.warna && activeSize.warna !== '-' && (
                  <span className="px-1.5 py-0.5 bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-[10px] font-semibold">
                    {activeSize.warna}
                  </span>
                )}
                <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-mono font-bold text-[10px]">
                  Size {activeSize.size}
                </span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                Target <strong className="text-slate-900 dark:text-white">{activeSize.qty_awal}</strong> · Dicek{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {activeSize.qty_oke + activeSize.qty_noda + activeSize.qty_permak + activeSize.qty_defect}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Tally Controls Pad (Native 44px Touch Targets) */}
        {activeSize && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. Lolos / OKE (Grade A) */}
            <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Lolos (Grade A)
                </span>
                <button
                  type="button"
                  onClick={handleSetRemainingToOke}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                  title="Otomatis isi sisa kuota size ini menjadi OKE"
                >
                  Sisa OKE
                </button>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', -1)}
                  className="w-11 h-11 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl font-black text-lg hover:bg-emerald-50 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  -
                </button>
                <NumberInput
                  min={0}
                  value={activeSize.qty_oke || 0}
                  selectOnFocus
                  onValueChange={(val) => updateActiveSizeTally({ qty_oke: Math.max(0, val) })}
                  className="flex-1 min-w-0 max-w-[110px] h-11 text-center text-lg font-black font-mono tabular-nums bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_oke', 1)}
                  className="w-11 h-11 bg-emerald-600 text-white rounded-xl font-black text-lg hover:bg-emerald-700 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[1, 5, 10].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => handleAddCount('qty_oke', inc)}
                    className="min-h-[36px] bg-emerald-100/80 hover:bg-emerald-200/80 dark:bg-emerald-900/50 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs font-mono font-bold cursor-pointer active:scale-95"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Noda (Cuci) */}
            <div className="p-3 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 rounded-xl space-y-2.5">
              <span className="block text-xs font-bold text-amber-800 dark:text-amber-300">
                Noda (Cuci)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', -1)}
                  className="w-11 h-11 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-xl font-black text-lg hover:bg-amber-50 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  -
                </button>
                <NumberInput
                  min={0}
                  value={activeSize.qty_noda || 0}
                  selectOnFocus
                  onValueChange={(val) => updateActiveSizeTally({ qty_noda: Math.max(0, val) })}
                  className="flex-1 min-w-0 max-w-[110px] h-11 text-center text-lg font-black font-mono tabular-nums bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-amber-700 dark:text-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_noda', 1)}
                  className="w-11 h-11 bg-amber-600 text-white rounded-xl font-black text-lg hover:bg-amber-700 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[1, 3, 5].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => handleAddCount('qty_noda', inc)}
                    className="min-h-[36px] bg-amber-100/80 hover:bg-amber-200/80 dark:bg-amber-900/50 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-mono font-bold cursor-pointer active:scale-95"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Permak (Jahit) */}
            <div className="p-3 bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/60 rounded-xl space-y-2.5">
              <span className="block text-xs font-bold text-orange-800 dark:text-orange-300">
                Permak (Jahit)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', -1)}
                  className="w-11 h-11 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 rounded-xl font-black text-lg hover:bg-orange-50 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  -
                </button>
                <NumberInput
                  min={0}
                  value={activeSize.qty_permak || 0}
                  selectOnFocus
                  onValueChange={(val) => updateActiveSizeTally({ qty_permak: Math.max(0, val) })}
                  className="flex-1 min-w-0 max-w-[110px] h-11 text-center text-lg font-black font-mono tabular-nums bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-700 rounded-xl text-orange-700 dark:text-orange-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_permak', 1)}
                  className="w-11 h-11 bg-orange-600 text-white rounded-xl font-black text-lg hover:bg-orange-700 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[1, 3, 5].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => handleAddCount('qty_permak', inc)}
                    className="min-h-[36px] bg-orange-100/80 hover:bg-orange-200/80 dark:bg-orange-900/50 dark:hover:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-lg text-xs font-mono font-bold cursor-pointer active:scale-95"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Defect (BS) */}
            <div className="p-3 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/60 rounded-xl space-y-2.5">
              <span className="block text-xs font-bold text-rose-800 dark:text-rose-300">
                Defect (BS Permanen)
              </span>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', -1)}
                  className="w-11 h-11 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl font-black text-lg hover:bg-rose-50 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  -
                </button>
                <NumberInput
                  min={0}
                  value={activeSize.qty_defect || 0}
                  selectOnFocus
                  onValueChange={(val) => updateActiveSizeTally({ qty_defect: Math.max(0, val) })}
                  className="flex-1 min-w-0 max-w-[110px] h-11 text-center text-lg font-black font-mono tabular-nums bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleAddCount('qty_defect', 1)}
                  className="w-11 h-11 bg-rose-600 text-white rounded-xl font-black text-lg hover:bg-rose-700 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[1, 3].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => handleAddCount('qty_defect', inc)}
                    className="min-h-[36px] bg-rose-100/80 hover:bg-rose-200/80 dark:bg-rose-900/50 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 rounded-lg text-xs font-mono font-bold cursor-pointer active:scale-95"
                  >
                    +{inc} Defect
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. REKAPITULASI & INPUT LANGSUNG PER VARIAN & SKU */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Input Hasil Pemeriksaan per Varian ({job.sizes.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Ketik langsung jumlah fisik hasil QC pada masing-masing varian
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSetAllToOke}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Set semua varian menjadi 100% Lolos (Grade A)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Set Semua Lolos</span>
            </button>
            <button
              type="button"
              onClick={handleResetAllToZero}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Kosongkan seluruh input"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* MOBILE VIEW: Native Zero-Scroll Variant QC Input Cards */}
        <div className="md:hidden space-y-2.5">
          {job.sizes.map((s, idx) => {
            const totalPeriksa = s.qty_oke + s.qty_noda + s.qty_permak + s.qty_defect;
            const selisih = totalPeriksa - s.qty_awal;
            const isSelected = selectedSizeIndex === idx;

            return (
              <div
                key={s.sku ? `m_${s.sku}_${s.size}_${idx}` : `m_${s.size}_${idx}`}
                onClick={() => setSelectedSizeIndex(idx)}
                className={`rounded-2xl border p-3 space-y-2.5 transition-colors ${
                  isSelected
                    ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/25 dark:bg-indigo-950/15'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                {/* Variant Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                        {s.sku || `${job.kode_produksi}-${s.size}`}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[10px]">
                        {s.size}
                      </span>
                      {s.warna && s.warna !== '-' && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium">
                          {s.warna}
                        </span>
                      )}
                    </div>
                    {job.source_type === 'MUTASI' && s.nama_produk && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {s.nama_produk}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetRowRemainingToOke(idx);
                    }}
                    className="px-2.5 min-h-[30px] text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer shrink-0"
                  >
                    Sisa OKE
                  </button>
                </div>

                {/* 2x2 Direct Numeric Inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-1">
                      Lolos (OKE)
                    </label>
                    <NumberInput
                      min={0}
                      allowEmpty
                      value={s.qty_oke === 0 ? '' : s.qty_oke}
                      placeholder="0"
                      onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_oke: Math.max(0, val) })}
                      className="w-full min-h-[40px] text-center font-mono font-black text-sm tabular-nums rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 mb-1">
                      Noda (Cuci)
                    </label>
                    <NumberInput
                      min={0}
                      allowEmpty
                      value={s.qty_noda === 0 ? '' : s.qty_noda}
                      placeholder="0"
                      onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_noda: Math.max(0, val) })}
                      className="w-full min-h-[40px] text-center font-mono font-bold text-sm tabular-nums rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-orange-700 dark:text-orange-400 mb-1">
                      Permak
                    </label>
                    <NumberInput
                      min={0}
                      allowEmpty
                      value={s.qty_permak === 0 ? '' : s.qty_permak}
                      placeholder="0"
                      onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_permak: Math.max(0, val) })}
                      className="w-full min-h-[40px] text-center font-mono font-bold text-sm tabular-nums rounded-xl border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400 mb-1">
                      Defect (BS)
                    </label>
                    <NumberInput
                      min={0}
                      allowEmpty
                      value={s.qty_defect === 0 ? '' : s.qty_defect}
                      placeholder="0"
                      onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_defect: Math.max(0, val) })}
                      className="w-full min-h-[40px] text-center font-mono font-bold text-sm tabular-nums rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Variant Footer Status */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono tabular-nums">
                  <span className="text-slate-500">
                    Awal <strong className="text-slate-800 dark:text-slate-200">{s.qty_awal}</strong> · Cek{' '}
                    <strong className="text-slate-900 dark:text-white">{totalPeriksa}</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        selisih === 0
                          ? 'text-slate-400'
                          : selisih > 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {selisih > 0 ? `+${selisih}` : selisih}
                    </span>
                    {totalPeriksa === 0 ? (
                      <span className="px-1.5 py-0.5 rounded font-sans text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Belum
                      </span>
                    ) : totalPeriksa === s.qty_awal ? (
                      <span className="px-1.5 py-0.5 rounded font-sans text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        Pas
                      </span>
                    ) : totalPeriksa < s.qty_awal ? (
                      <span className="px-1.5 py-0.5 rounded font-sans text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                        Kurang {s.qty_awal - totalPeriksa}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded font-sans text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                        Lebih +{totalPeriksa - s.qty_awal}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Mobile Total Strip */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="font-sans font-bold text-slate-700 dark:text-slate-200">
              Total ({job.sizes.length} Varian)
            </span>
            <span className="font-black text-slate-900 dark:text-white">
              {totals.total_diperiksa} / {totals.total_qty_awal} pcs ({totals.pass_rate}%)
            </span>
          </div>
        </div>

        {/* DESKTOP VIEW: Structured Matrix Input Table */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">SKU / Item</th>
                {job.source_type === 'MUTASI' && <th className="px-3 py-2.5">Nama Produk</th>}
                <th className="px-3 py-2.5">Warna</th>
                <th className="px-3 py-2.5 text-center">Size</th>
                <th className="px-3 py-2.5 text-right">Qty Awal</th>
                <th className="px-3 py-2.5 text-center text-emerald-700 dark:text-emerald-400 min-w-[130px]">
                  Lolos (OKE)
                </th>
                <th className="px-3 py-2.5 text-center text-amber-700 dark:text-amber-400 min-w-[76px]">
                  Noda
                </th>
                <th className="px-3 py-2.5 text-center text-orange-700 dark:text-orange-400 min-w-[76px]">
                  Permak
                </th>
                <th className="px-3 py-2.5 text-center text-rose-700 dark:text-rose-400 min-w-[76px]">
                  Defect
                </th>
                <th className="px-3 py-2.5 text-right">Dicek</th>
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
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 dark:text-white">
                      {s.sku || `${job.kode_produksi}-${s.size}`}
                    </td>
                    {job.source_type === 'MUTASI' && (
                      <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate">
                        {s.nama_produk || '-'}
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                      {s.warna && s.warna !== '-' ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold">
                          {s.warna}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                        {s.size}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                      {s.qty_awal}
                    </td>

                    <td className="px-2 py-1.5 text-center bg-emerald-50/25 dark:bg-emerald-950/10">
                      <div className="flex items-center justify-center gap-1">
                        <NumberInput
                          min={0}
                          allowEmpty
                          value={s.qty_oke === 0 ? '' : s.qty_oke}
                          placeholder="0"
                          onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_oke: Math.max(0, val) })}
                          className="w-16 text-center font-mono font-black tabular-nums text-xs py-1.5 px-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetRowRemainingToOke(idx);
                          }}
                          className="px-1.5 py-1 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-md cursor-pointer transition-colors"
                          title="Isi sisa kuota size ini menjadi OKE"
                        >
                          OKE
                        </button>
                      </div>
                    </td>

                    <td className="px-2 py-1.5 text-center bg-amber-50/25 dark:bg-amber-950/10">
                      <NumberInput
                        min={0}
                        allowEmpty
                        value={s.qty_noda === 0 ? '' : s.qty_noda}
                        placeholder="0"
                        onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_noda: Math.max(0, val) })}
                        className="w-14 text-center font-mono font-bold tabular-nums text-xs py-1.5 px-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center bg-orange-50/25 dark:bg-orange-950/10">
                      <NumberInput
                        min={0}
                        allowEmpty
                        value={s.qty_permak === 0 ? '' : s.qty_permak}
                        placeholder="0"
                        onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_permak: Math.max(0, val) })}
                        className="w-14 text-center font-mono font-bold tabular-nums text-xs py-1.5 px-1 rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center bg-rose-50/25 dark:bg-rose-950/10">
                      <NumberInput
                        min={0}
                        allowEmpty
                        value={s.qty_defect === 0 ? '' : s.qty_defect}
                        placeholder="0"
                        onValueChange={(val) => updateSizeTallyByIndex(idx, { qty_defect: Math.max(0, val) })}
                        className="w-14 text-center font-mono font-bold tabular-nums text-xs py-1.5 px-1 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                      />
                    </td>

                    <td className="px-3 py-2.5 text-right font-mono font-black tabular-nums text-slate-900 dark:text-white">
                      {totalPeriksa}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
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
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          Pas ({s.qty_awal})
                        </span>
                      ) : totalPeriksa < s.qty_awal ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          Kurang {s.qty_awal - totalPeriksa}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                          Lebih +{totalPeriksa - s.qty_awal}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-800/90 font-black border-t border-slate-200 dark:border-slate-700 font-mono tabular-nums">
              <tr>
                <td
                  colSpan={job.source_type === 'MUTASI' ? 4 : 3}
                  className="px-3 py-2.5 font-sans text-slate-900 dark:text-white uppercase tracking-wider font-bold"
                >
                  Total ({job.sizes.length} Varian)
                </td>
                <td className="px-3 py-2.5 text-right">{totals.total_qty_awal}</td>
                <td className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400">
                  {totals.total_qty_oke}
                </td>
                <td className="px-3 py-2.5 text-center text-amber-600 dark:text-amber-400">
                  {totals.total_qty_noda}
                </td>
                <td className="px-3 py-2.5 text-center text-orange-600 dark:text-orange-400">
                  {totals.total_qty_permak}
                </td>
                <td className="px-3 py-2.5 text-center text-rose-600 dark:text-rose-400">
                  {totals.total_qty_defect}
                </td>
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
                <td className="px-3 py-2.5 text-center text-indigo-600 dark:text-indigo-400">
                  {totals.pass_rate}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 6. DOKUMENTASI FOTO TEMUAN BERDASARKAN KATEGORI REJECT */}
      <div className="space-y-3">
        {totalRejectCount === 0 ? (
          <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/70 flex items-center justify-center text-emerald-600 dark:text-emerald-300 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Semua Lolos (Grade A) — Tanpa Temuan Reject
                </h4>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Lampiran foto bukti reject tidak diperlukan pada batch ini.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] bg-white hover:bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0">
              <Camera className="w-3.5 h-3.5" />
              <span>Foto Packing (Opsional)</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handleCategorizedPhotoUpload(e.target.files, 'LAINNYA', 'Foto Umum / Packing');
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/70 flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                Ditemukan {totalRejectCount} pcs Reject pada Batch Ini
              </h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Rincian: <strong>{totals.total_qty_noda} Noda</strong>, <strong>{totals.total_qty_permak} Permak</strong>, <strong>{totals.total_qty_defect} Defect</strong>. Lampirkan foto bukti pada kategori di bawah.
              </p>
            </div>
          </div>
        )}

        {/* 3 Opsi Reject Photo Upload Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Foto Kategori NODA */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              totals.total_qty_noda > 0
                ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Foto Noda (Cuci)</h4>
                  <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-semibold">
                    {totals.total_qty_noda} pcs
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                {(job.foto_evidence || []).filter((p) => p.tipe === 'NODA').length} foto
              </span>
            </div>

            <label className="mt-1 flex items-center justify-center gap-2 min-h-[44px] px-3 border border-dashed border-amber-300 dark:border-amber-700 hover:bg-amber-100/40 dark:hover:bg-amber-950/40 rounded-xl transition-colors cursor-pointer text-xs font-semibold text-amber-800 dark:text-amber-200">
              <Camera className="w-4 h-4" />
              <span>Jepret / Upload Foto Noda</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handleCategorizedPhotoUpload(e.target.files, 'NODA', 'Noda Minyak / Kotor');
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>

          {/* 2. Foto Kategori JAHITAN / PERMAK */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              totals.total_qty_permak > 0
                ? 'bg-orange-50/40 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Foto Jahitan (Permak)</h4>
                  <span className="text-[10px] font-mono text-orange-700 dark:text-orange-400 font-semibold">
                    {totals.total_qty_permak} pcs
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200">
                {(job.foto_evidence || []).filter((p) => p.tipe === 'PERMAK').length} foto
              </span>
            </div>

            <label className="mt-1 flex items-center justify-center gap-2 min-h-[44px] px-3 border border-dashed border-orange-300 dark:border-orange-700 hover:bg-orange-100/40 dark:hover:bg-orange-950/40 rounded-xl transition-colors cursor-pointer text-xs font-semibold text-orange-800 dark:text-orange-200">
              <Camera className="w-4 h-4" />
              <span>Jepret / Upload Foto Jahitan</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handleCategorizedPhotoUpload(e.target.files, 'PERMAK', 'Jahitan / Permak');
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>

          {/* 3. Foto Kategori DEFECT / BS BAHAN */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              totals.total_qty_defect > 0
                ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Foto Defect / BS</h4>
                  <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 font-semibold">
                    {totals.total_qty_defect} pcs
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                {(job.foto_evidence || []).filter((p) => p.tipe === 'DEFECT').length} foto
              </span>
            </div>

            <label className="mt-1 flex items-center justify-center gap-2 min-h-[44px] px-3 border border-dashed border-rose-300 dark:border-rose-700 hover:bg-rose-100/40 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer text-xs font-semibold text-rose-800 dark:text-rose-200">
              <Camera className="w-4 h-4" />
              <span>Jepret / Upload Foto Defect</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handleCategorizedPhotoUpload(e.target.files, 'DEFECT', 'Defect / BS Bahan');
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Galeri Koleksi Foto Evidence Terlampir */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Galeri Bukti Temuan ({job.foto_evidence?.length || 0})
              </h3>
            </div>
            {isUploadingPhoto && (
              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                Mengompres foto...
              </span>
            )}
          </div>

          {job.foto_evidence && job.foto_evidence.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {job.foto_evidence.map((photo) => {
                const badgeColor =
                  photo.tipe === 'NODA'
                    ? 'bg-amber-600'
                    : photo.tipe === 'PERMAK'
                    ? 'bg-orange-600'
                    : photo.tipe === 'DEFECT'
                    ? 'bg-rose-600'
                    : 'bg-slate-700';

                return (
                  <div
                    key={photo.id}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 aspect-square"
                  >
                    <img
                      src={photo.url}
                      alt={photo.label}
                      onClick={() => setLightboxUrl(photo.url)}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5">
                      <span
                        className={`inline-block text-[8px] font-bold text-white px-1.5 py-0.5 rounded ${badgeColor} truncate max-w-full`}
                      >
                        {photo.tipe || 'FOTO'}
                      </span>
                      <p className="text-[9px] font-medium text-white truncate mt-0.5">{photo.label}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute top-1.5 right-1.5 p-1.5 bg-rose-600/90 text-white rounded-lg opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs hover:bg-rose-700"
                      title="Hapus foto ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-xs text-slate-400">
                {totalRejectCount === 0
                  ? 'Tidak ada temuan reject. Lampiran foto tidak diperlukan.'
                  : 'Belum ada foto temuan. Gunakan tombol upload di atas untuk melampirkan.'}
              </p>
            </div>
          )}
        </div>

        {/* Catatan Khusus QC */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              Catatan untuk CMT / Konveksi
            </h3>
          </div>

          <textarea
            rows={3}
            placeholder="Tuliskan catatan khusus untuk penjahit / supplier, misal: kerapian jahitan obras, kancing cadangan, noda minyak kain..."
            value={job.catatan_umum || ''}
            onChange={(e) => {
              const val = e.target.value;
              const updatedJob = { ...job, catatan_umum: val };
              setJob(updatedJob);
              saveSingleQcJob(updatedJob);
            }}
            className="w-full text-xs p-3 border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Tersimpan otomatis ke Berita Acara</span>
            <button
              type="button"
              onClick={() => {
                saveSingleQcJob(job);
                onShowToast('Draft berhasil disimpan!', 'success');
              }}
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Draft</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Action Bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBeritaAcaraOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>Berita Acara</span>
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isSubmitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer active:scale-[0.98]"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            <span>
              Selesaikan QC ({totals.total_diperiksa}/{totals.total_qty_awal})
            </span>
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={lightboxUrl}
              alt="Preview Bukti QC"
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            />
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
