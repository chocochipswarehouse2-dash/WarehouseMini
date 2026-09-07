import React, { useState } from 'react';
import {
  ClipboardCheck,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ShieldCheck,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import { UserSession, ProductItem, PerbaikanTicket } from '../types';
import { LaporanQcView } from './LaporanQcView';
import { PerbaikanView } from './PerbaikanView';

interface QualityControlViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export type QcMainTab = 'laporan_qc' | 'perbaikan_defect';

export const QualityControlView: React.FC<QualityControlViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<QcMainTab>('laporan_qc');
  const [targetSearchTicket, setTargetSearchTicket] = useState<string | undefined>(undefined);

  const handleNavigateToPerbaikan = (ticketNo?: string) => {
    setTargetSearchTicket(ticketNo);
    setActiveTab('perbaikan_defect');
  };

  const handleRejectCreated = (newTicket: PerbaikanTicket) => {
    // If user creates a reject in QC report, we can inform or keep search target ready
    setTargetSearchTicket(newTicket.ticket_no);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Quality Control */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Quality Control (QC)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  WMS Mutu
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan &amp; Defect
              </p>
            </div>
          </div>
        </div>

        {/* 2. Top-Level Tab Switcher */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('laporan_qc');
              setTargetSearchTicket(undefined);
            }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
              activeTab === 'laporan_qc'
                ? 'bg-blue-600 text-white shadow-blue-600/25 ring-2 ring-blue-600/30'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Laporan QC</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                activeTab === 'laporan_qc'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              Inspeksi &amp; Foto
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('perbaikan_defect')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
              activeTab === 'perbaikan_defect'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>Perbaikan dan Defect</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                activeTab === 'perbaikan_defect'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              Cuci &bull; Permak &bull; Defect
            </span>
          </button>
        </div>
      </div>

      {/* 3. Render Active Submodule */}
      {activeTab === 'laporan_qc' && (
        <LaporanQcView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          onNavigateToPerbaikan={handleNavigateToPerbaikan}
          onRejectCreated={handleRejectCreated}
        />
      )}

      {activeTab === 'perbaikan_defect' && (
        <PerbaikanView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          initialSearchQuery={targetSearchTicket}
        />
      )}
    </div>
  );
};
