import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  FileSpreadsheet,
  PackageCheck,
  Clock,
  Tag,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  OnlineImportPreview,
  PreviewOrderDiffItem,
  COURIER_GROUP_LABELS,
} from '../../../services/onlineFulfilmentService';

interface OnlineImportPreviewModalProps {
  preview: OnlineImportPreview;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

type PreviewCategoryKey =
  | 'holdFromCancel'
  | 'flaggedCheck'
  | 'newOrders'
  | 'preorderOrders'
  | 'resiUpdated'
  | 'statusProgressed'
  | 'cancelledDirect';

export const OnlineImportPreviewModal: React.FC<OnlineImportPreviewModalProps> = ({
  preview,
  saving,
  onClose,
  onConfirm,
}) => {
  const { summary } = preview;
  const defaultTab: PreviewCategoryKey =
    summary.holdFromCancel > 0
      ? 'holdFromCancel'
      : summary.flaggedCheck > 0
        ? 'flaggedCheck'
        : summary.newOrders > 0
          ? 'newOrders'
          : summary.resiUpdated > 0
            ? 'resiUpdated'
            : summary.preorderOrders > 0
              ? 'preorderOrders'
              : 'statusProgressed';

  const [activeCat, setActiveCat] = useState<PreviewCategoryKey>(defaultTab);

  const categories: Array<{
    key: PreviewCategoryKey;
    label: string;
    count: number;
    tone: string;
    items: PreviewOrderDiffItem[];
  }> = [
    {
      key: 'holdFromCancel',
      label: 'TAHAN (Batal)',
      count: summary.holdFromCancel,
      tone: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
      items: preview.holdFromCancel,
    },
    {
      key: 'flaggedCheck',
      label: 'Perlu Dicek',
      count: summary.flaggedCheck,
      tone: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      items: preview.flaggedCheck,
    },
    {
      key: 'newOrders',
      label: 'Pesanan Baru',
      count: summary.newOrders,
      tone: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
      items: preview.newOrders,
    },
    {
      key: 'preorderOrders',
      label: 'Pre-order',
      count: summary.preorderOrders,
      tone: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
      items: preview.preorderOrders,
    },
    {
      key: 'resiUpdated',
      label: 'Resi Dilengkapi',
      count: summary.resiUpdated,
      tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      items: preview.resiUpdated,
    },
    {
      key: 'statusProgressed',
      label: 'Update Kirim',
      count: summary.statusProgressed,
      tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
      items: preview.statusProgressed,
    },
    {
      key: 'cancelledDirect',
      label: 'Batal Sebelum Proses',
      count: summary.cancelledDirect,
      tone: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      items: preview.cancelledDirect,
    },
  ];

  const activeCategoryObj = categories.find((c) => c.key === activeCat) || categories[0];
  const hasChanges = preview.ordersToUpsert.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Drag handle mobile */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Hasil Baca File Shopee
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border ${
                  preview.detectedMode === 'semua_audit'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                }`}
              >
                {preview.detectedMode === 'semua_audit'
                  ? 'Mode Audit & Cek Batal (Tab Semua)'
                  : 'Mode Cepat (Tab Perlu Dikirim)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate" title={preview.fileName}>
              {preview.fileName} · {preview.totalOrdersInFile.toLocaleString('id-ID')} pesanan di file ({preview.totalRows.toLocaleString('id-ID')} baris)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Alert khusus */}
          {summary.holdFromCancel > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800/80 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div>
                <div className="font-bold">
                  {summary.holdFromCancel} pesanan yang sudah diproses dibatalkan pembeli
                </div>
                <div className="text-[11px] opacity-90 mt-0.5">
                  Status otomatis diubah menjadi <b>TAHAN</b> agar tidak terkirim ke kurir.
                </div>
              </div>
            </div>
          )}

          {summary.urgentResiCount > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="font-bold">
                  {summary.urgentResiCount} pesanan Instan / Same Day baru sudah memiliki No. Resi
                </div>
                <div className="text-[11px] opacity-90 mt-0.5">
                  Ditandai mendesak karena pickup mungkin sudah diminta di Seller Center.
                </div>
              </div>
            </div>
          )}

          {summary.unmappedSkuCount > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs">
              <Tag className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <div className="font-bold">
                  {summary.unmappedSkuCount} SKU belum terdaftar di Master Produk
                </div>
                <div className="text-[11px] opacity-90 mt-0.5">
                  Pesanan tetap masuk ke WMS dan bisa dipetakan belakangan:{' '}
                  <span className="font-mono">
                    {Array.from(new Set(preview.unmappedSkus.map((u) => u.sku)))
                      .slice(0, 6)
                      .join(', ')}
                    {preview.unmappedSkus.length > 6 ? '...' : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Ringkasan Angka (klik untuk lihat daftar) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {categories.map((cat) => {
              const isSelected = activeCat === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCat(cat.key)}
                  className={`text-left p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-800'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {cat.label}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {cat.count}
                    </span>
                    {cat.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${cat.tone}`}>
                        Lihat
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Dilewati / Riwayat Lama
              </div>
              <div className="mt-1 text-lg font-extrabold text-slate-600 dark:text-slate-300 tabular-nums">
                {(summary.skipped + summary.ignoredNonActive).toLocaleString('id-ID')}
              </div>
            </div>
          </div>

          {/* Daftar Rincian Kategori Terpilih */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Rincian: {activeCategoryObj.label} ({activeCategoryObj.count})
              </span>
              {preview.detectedMode === 'perlu_dikirim' && summary.flaggedCheck > 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">
                  Tip: Tarik Tab Semua untuk memastikan pesanan hilang
                </span>
              )}
            </div>

            {activeCategoryObj.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada pesanan pada kategori ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {activeCategoryObj.items.slice(0, 100).map((item) => (
                  <div
                    key={item.order_no}
                    className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs bg-white dark:bg-slate-900"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {item.order_no}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                          {COURIER_GROUP_LABELS[item.courier_group]} · {item.courier_name}
                        </span>
                        {item.urgent && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            Mendesak
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {[item.recipient_name, item.tracking_no ? `Resi: ${item.tracking_no}` : 'Belum ada resi']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 sm:text-right shrink-0">
                      {item.detail}
                    </div>
                  </div>
                ))}
                {activeCategoryObj.items.length > 100 && (
                  <div className="px-3.5 py-2 text-[11px] text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
                    Menampilkan 100 dari {activeCategoryObj.items.length} pesanan.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {hasChanges ? (
              <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {preview.ordersToUpsert.length} pesanan akan diperbarui
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                Semua data di file sudah sama dengan WMS
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="py-2 px-3.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="py-2 px-4 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  {hasChanges ? 'Simpan ke WMS' : 'Catat Riwayat Impor'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
