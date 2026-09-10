import React, { useState } from 'react';
import {
  ClipboardCheck,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ShieldCheck, Info,
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
    <div className="space-y-3 pb-12">
      {/* 1. Header Quality Control & Tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-white dark:bg-[#09090b] p-3 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Quality Control
              </h1>
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                WMS Mutu
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              alert('Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan & Defect');
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Tabs */}
        <div className="flex bg-slate-100/50 dark:bg-[#09090b] p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => {
              setActiveTab('laporan_qc');
              setTargetSearchTicket(undefined);
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 ${
              activeTab === 'laporan_qc'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="font-bold text-[11px] sm:text-sm">QC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('perbaikan_defect')}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 ${
              activeTab === 'perbaikan_defect'
                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/50'
                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span className="font-bold text-[11px] sm:text-sm">Perbaikan</span>
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
