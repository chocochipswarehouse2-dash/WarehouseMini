import React from 'react';
import { X, History, FileSpreadsheet } from 'lucide-react';
import { OnlineImportJob } from '../../../services/onlineFulfilmentService';

interface OnlineImportHistoryModalProps {
  jobs: OnlineImportJob[];
  onClose: () => void;
}

export const OnlineImportHistoryModal: React.FC<OnlineImportHistoryModalProps> = ({
  jobs,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[88vh]">
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Riwayat Impor Shopee
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Catatan waktu impor terakhir untuk memantau keterlambatan deteksi pembatalan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {jobs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Belum ada riwayat impor Shopee.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {jobs.map((job) => (
                <div key={job.id} className="p-3 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {job.file_name || 'File Shopee'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${
                          job.import_mode === 'semua_audit'
                            ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                        }`}
                      >
                        {job.import_mode === 'semua_audit' ? 'Tab Semua (Audit)' : 'Tab Perlu Dikirim'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {new Date(job.created_at).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <span>Oleh: <b>{job.imported_by || 'Admin'}</b></span>
                    <span>· {job.total_orders} pesanan</span>
                    <span>· Baru: <b>{job.summary?.newOrders || 0}</b></span>
                    {(job.summary?.preorderOrders || 0) > 0 && (
                      <span>· Pre-order: <b>{job.summary.preorderOrders}</b></span>
                    )}
                    {(job.summary?.resiUpdated || 0) > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        · Resi dilengkapi: <b>{job.summary.resiUpdated}</b>
                      </span>
                    )}
                    {(job.summary?.holdFromCancel || 0) > 0 && (
                      <span className="text-rose-700 dark:text-rose-400">
                        · TAHAN: <b>{job.summary.holdFromCancel}</b>
                      </span>
                    )}
                    {(job.summary?.flaggedCheck || 0) > 0 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        · Perlu Dicek: <b>{job.summary.flaggedCheck}</b>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
