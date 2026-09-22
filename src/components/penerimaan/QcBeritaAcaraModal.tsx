import React, { useRef } from 'react';
import {
  Printer,
  X,
  Share2,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Scissors,
  Sparkles,
  Layers,
} from 'lucide-react';
import { QcPengerjaanJob } from '../../types';
import { calculateJobTotals, generateQcWhatsAppSummary } from '../../services/qcPengerjaanService';

interface QcBeritaAcaraModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: QcPengerjaanJob;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const QcBeritaAcaraModal: React.FC<QcBeritaAcaraModalProps> = ({
  isOpen,
  onClose,
  job,
  onShowToast,
}) => {
  const [copied, setCopied] = React.useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const totals = calculateJobTotals(job.sizes);
  const printDate = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleCopyWa = () => {
    const text = generateQcWhatsAppSummary(job);
    navigator.clipboard.writeText(text);
    setCopied(true);
    onShowToast('Teks ringkasan berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWa = () => {
    const text = generateQcWhatsAppSummary(job);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                Berita Acara & Rekap Hasil QC
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kode: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{job.kode_produksi}</span> | Surat Jalan: <span className="font-bold">{job.no_surat_jalan}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleCopyWa}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin Teks WA'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenWa}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Kirim ke WhatsApp</span>
          </button>
        </div>

        {/* Printable Document Body */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-6" ref={printRef}>
          {/* Header Dokumen Berita Acara */}
          <div className="border-b-2 border-slate-900 dark:border-slate-200 pb-4 text-center space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-wider">
              BERITA ACARA HASIL QUALITY CONTROL PRODUKSI
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              WMS Inventory & Quality Management System • Tanggal Cetak: {printDate}
            </p>
          </div>

          {/* Grid Informasi Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Kode Produksi
              </p>
              <p className="font-mono font-black text-sm text-slate-900 dark:text-white mt-0.5">
                {job.kode_produksi}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Warna / Model
              </p>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {job.warna || '-'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                No. Surat Jalan
              </p>
              <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {job.no_surat_jalan}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Kategori Setoran
              </p>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {job.kategori || 'Lokal CMT'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Tim PIC QC (Pemeriksa)
              </p>
              <p className="font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                {job.pic_list.join(', ') || '-'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Waktu Pelaksanaan
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                {job.completed_at ? new Date(job.completed_at).toLocaleString('id-ID') : 'Sedang Berlangsung'}
              </p>
            </div>
          </div>

          {/* Rangkuman KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <p className="text-[10px] uppercase font-bold text-slate-500">Qty Awal</p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{totals.total_qty_awal}</p>
              <p className="text-[9px] text-slate-400">Pcs</p>
            </div>
            <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
              <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">Lolos (OKE)</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{totals.total_qty_oke}</p>
              <p className="text-[9px] text-emerald-600/70">Grade A</p>
            </div>
            <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
              <p className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300">Noda (Cuci)</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">{totals.total_qty_noda}</p>
              <p className="text-[9px] text-amber-600/70">Pcs</p>
            </div>
            <div className="p-2.5 rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30">
              <p className="text-[10px] uppercase font-bold text-orange-700 dark:text-orange-300">Permak</p>
              <p className="text-lg font-black text-orange-600 dark:text-orange-400 mt-0.5">{totals.total_qty_permak}</p>
              <p className="text-[9px] text-orange-600/70">Jahit Ulang</p>
            </div>
            <div className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30">
              <p className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300">Defect (BS)</p>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">{totals.total_qty_defect}</p>
              <p className="text-[9px] text-rose-600/70">Afkir/Cacat</p>
            </div>
            <div className="p-2.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
              <p className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Pass Rate</p>
              <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">{totals.pass_rate}%</p>
              <p className="text-[9px] text-blue-600/70">Tingkat Lolos</p>
            </div>
          </div>

          {/* Tabel Rekapitulasi per Size */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Tabel Rekapitulasi Rincian per Size
            </h3>
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-center w-12">No</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2 text-right">Qty Awal</th>
                    <th className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">OKE (Grade A)</th>
                    <th className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">Noda</th>
                    <th className="px-3 py-2 text-right text-orange-700 dark:text-orange-400">Permak</th>
                    <th className="px-3 py-2 text-right text-rose-700 dark:text-rose-400">Defect</th>
                    <th className="px-3 py-2 text-right">Total Periksa</th>
                    <th className="px-3 py-2 text-right">Selisih</th>
                    <th className="px-3 py-2 text-center">Pass Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {job.sizes.map((s, idx) => {
                    const totalPeriksa = s.qty_oke + s.qty_noda + s.qty_permak + s.qty_defect;
                    const selisih = totalPeriksa - s.qty_awal;
                    const sizeRate = totalPeriksa > 0 ? Math.round((s.qty_oke / totalPeriksa) * 1000) / 10 : 0;
                    return (
                      <tr key={s.size} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold font-mono text-slate-800 dark:text-slate-200">{s.size}</td>
                        <td className="px-3 py-2 text-right font-medium">{s.qty_awal}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{s.qty_oke}</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600 dark:text-amber-400">{s.qty_noda}</td>
                        <td className="px-3 py-2 text-right font-bold text-orange-600 dark:text-orange-400">{s.qty_permak}</td>
                        <td className="px-3 py-2 text-right font-bold text-rose-600 dark:text-rose-400">{s.qty_defect}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{totalPeriksa}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {selisih === 0 ? (
                            <span className="text-slate-400">0</span>
                          ) : selisih > 0 ? (
                            <span className="text-emerald-600">+{selisih}</span>
                          ) : (
                            <span className="text-rose-600">{selisih}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">{sizeRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 font-black border-t-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <td colSpan={2} className="px-3 py-2.5 text-slate-900 dark:text-white uppercase tracking-wider">
                      TOTAL REKAP
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
                    <td className="px-3 py-2.5 text-center text-blue-600 dark:text-blue-400">{totals.pass_rate}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Catatan / Temuan Khusus */}
          {job.catatan_umum && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
              <p className="font-bold text-slate-700 dark:text-slate-300">Catatan & Temuan QC:</p>
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{job.catatan_umum}</p>
            </div>
          )}

          {/* Dokumentasi Bukti Foto Thumbnail */}
          {job.foto_evidence && job.foto_evidence.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Lampiran Foto Temuan ({job.foto_evidence.length} Foto)
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {job.foto_evidence.map((f, i) => (
                  <div key={f.id || i} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                    <img src={f.url} alt={f.label || `Foto ${i + 1}`} className="w-full h-20 object-cover" />
                    {f.label && <p className="p-1 text-[9px] font-bold truncate text-slate-700 dark:text-slate-300">{f.label}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tanda Tangan Section */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs">
            <div className="space-y-12">
              <p className="text-slate-500 font-semibold">Petugas QC Pemeriksa</p>
              <div className="border-b border-slate-300 dark:border-slate-700 w-3/4 mx-auto" />
              <p className="font-bold text-slate-800 dark:text-slate-200">
                ( {job.pic_list[0] || '.........................'} )
              </p>
            </div>
            <div className="space-y-12">
              <p className="text-slate-500 font-semibold">Kepala Gudang / SPV</p>
              <div className="border-b border-slate-300 dark:border-slate-700 w-3/4 mx-auto" />
              <p className="font-bold text-slate-800 dark:text-slate-200">( ......................... )</p>
            </div>
            <div className="space-y-12 col-span-2 sm:col-span-1">
              <p className="text-slate-500 font-semibold">Pihak CMT / Konveksi</p>
              <div className="border-b border-slate-300 dark:border-slate-700 w-3/4 mx-auto" />
              <p className="font-bold text-slate-800 dark:text-slate-200">( ......................... )</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
