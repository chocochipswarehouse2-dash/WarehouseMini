import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Layers,
  Scissors,
  Tag,
} from 'lucide-react';
import { UserSession, ProductItem, PerbaikanTicket } from '../types';
import { LaporanQcView } from './LaporanQcView';
import { PerbaikanView } from './PerbaikanView';
import {
  fetchQcReportsFromSupabase,
  fetchPerbaikanTicketsFromSupabase,
} from '../services/supabase';

interface QualityControlViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export type QcMainTab = 'form_laporan' | 'riwayat_laporan' | 'perbaikan' | 'acc_defect';

export const QualityControlView: React.FC<QualityControlViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<QcMainTab>('form_laporan');
  const [targetSearchTicket, setTargetSearchTicket] = useState<string | undefined>(undefined);

  // Real-time badge stats for Riwayat Laporan, Perbaikan (Cuci + Permak), & Defect
  const [stats, setStats] = useState({
    riwayatTotal: 0,
    riwayatReject: 0,
    perbaikan: 0,
    defect: 0,
  });

  const recalculateStats = (qcList?: any[], ticketList?: any[]) => {
    let reports = qcList;
    if (!reports) {
      try {
        const cached = localStorage.getItem('wms_local_qc_reports');
        if (cached) reports = JSON.parse(cached);
      } catch {}
    }
    let tickets = ticketList;
    if (!tickets) {
      try {
        const cached = localStorage.getItem('wms_local_perbaikan_tickets');
        if (cached) tickets = JSON.parse(cached);
      } catch {}
    }

    let totalRep = 0;
    let rejectRep = 0;
    if (Array.isArray(reports)) {
      totalRep = reports.length;
      rejectRep = reports.filter((r: any) => r.status === 'REJECT' || (Number(r.qty_reject) > 0)).length;
    }

    let cuci = 0;
    let permak = 0;
    let defect = 0;
    if (Array.isArray(tickets)) {
      cuci = tickets.filter((t: any) => t.tahap === 'CUCI').length;
      permak = tickets.filter((t: any) => t.tahap === 'PERMAK').length;
      defect = tickets.filter((t: any) => t.tahap === 'DEFECT').length;
    }

    setStats({
      riwayatTotal: totalRep,
      riwayatReject: rejectRep,
      perbaikan: cuci + permak,
      defect,
    });
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Instant calculation from localStorage cache
    recalculateStats();

    // 2. Fast background sync from Supabase
    Promise.all([
      fetchQcReportsFromSupabase().catch(() => null),
      fetchPerbaikanTicketsFromSupabase().catch(() => null),
    ]).then(([freshReports, freshTickets]) => {
      if (isMounted) {
        recalculateStats(freshReports || undefined, freshTickets || undefined);
      }
    });

    // 3. Event listeners for real-time reactivity
    const handleQcUpdate = (e: any) => {
      const reports = e?.detail?.reports;
      recalculateStats(reports, undefined);
    };

    const handleTicketUpdate = (e: any) => {
      const tickets = e?.detail?.tickets;
      recalculateStats(undefined, tickets);
    };

    window.addEventListener('wms_perbaikan_tickets_updated', handleTicketUpdate);
    window.addEventListener('wms_qc_reports_updated', handleQcUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('wms_perbaikan_tickets_updated', handleTicketUpdate);
      window.removeEventListener('wms_qc_reports_updated', handleQcUpdate);
    };
  }, []);

  const handleNavigateToPerbaikan = (ticketNo?: string) => {
    setTargetSearchTicket(ticketNo);
    let targetSection: QcMainTab = 'riwayat_laporan';
    try {
      const cached = localStorage.getItem('wms_local_perbaikan_tickets');
      if (cached && ticketNo) {
        const list = JSON.parse(cached);
        const found = list.find((t: any) => t.ticket_no === ticketNo);
        if (found) {
          if (found.tahap === 'CUCI' || found.tahap === 'PERMAK') {
            targetSection = 'perbaikan';
          } else if (found.tahap === 'DEFECT' || found.tahap?.startsWith('SELESAI')) {
            targetSection = 'acc_defect';
          }
        }
      }
    } catch {}
    setActiveTab(targetSection);
  };

  const handleRejectCreated = (newTicket: PerbaikanTicket) => {
    setTargetSearchTicket(newTicket.ticket_no);
    if (newTicket.tahap === 'CUCI' || newTicket.tahap === 'PERMAK') {
      setActiveTab('perbaikan');
    } else if (newTicket.tahap === 'DEFECT') {
      setActiveTab('acc_defect');
    } else {
      setActiveTab('riwayat_laporan');
    }
  };

  return (
    <div className="space-y-3 pb-12">
      {/* 4 Tabs Quality Control - Kesamping (Horizontal) Menghemat Area Kerja */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5">
          {/* Tab 1: Form Laporan (Input QC Bersih Tanpa Tabel Riwayat) */}
          <button
            type="button"
            id="tab-qc-form-laporan"
            onClick={() => {
              setActiveTab('form_laporan');
              setTargetSearchTicket(undefined);
            }}
            className={`flex-1 min-w-[125px] sm:min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
              activeTab === 'form_laporan'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Form Laporan</span>
          </button>

          {/* Tab 2: Riwayat Laporan (Audit Lengkap Seluruh Laporan & Sortir Reject) */}
          <button
            type="button"
            id="tab-qc-riwayat-laporan"
            onClick={() => {
              setActiveTab('riwayat_laporan');
              setTargetSearchTicket(undefined);
            }}
            className={`flex-1 min-w-[140px] sm:min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
              activeTab === 'riwayat_laporan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Riwayat Laporan</span>
            {stats.riwayatTotal > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full font-bold transition-colors ${
                  activeTab === 'riwayat_laporan'
                    ? 'bg-white/25 text-white'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
                }`}
                title={`${stats.riwayatTotal} total laporan inspeksi (${stats.riwayatReject} reject)`}
              >
                {stats.riwayatTotal}
              </span>
            )}
          </button>

          {/* Tab 3: Perbaikan (Cuci & Permak - Berbasis Data Lokasi Fisik Tanpa Tiket) */}
          <button
            type="button"
            id="tab-qc-perbaikan"
            onClick={() => {
              setActiveTab('perbaikan');
              setTargetSearchTicket(undefined);
            }}
            className={`flex-1 min-w-[115px] sm:min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
              activeTab === 'perbaikan'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25 ring-1 ring-amber-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Perbaikan</span>
            {stats.perbaikan > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full font-bold transition-colors ${
                  activeTab === 'perbaikan'
                    ? 'bg-white/25 text-white'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                }`}
                title={`${stats.perbaikan} pcs dalam antrean perbaikan cuci & permak`}
              >
                {stats.perbaikan}
              </span>
            )}
          </button>

          {/* Tab 4: ACC Defect (Otorisasi Bertiket Manajemen & Cetak Stiker 50x20mm) */}
          <button
            type="button"
            id="tab-qc-defect"
            onClick={() => {
              setActiveTab('acc_defect');
              setTargetSearchTicket(undefined);
            }}
            className={`flex-1 min-w-[125px] sm:min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
              activeTab === 'acc_defect'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25 ring-1 ring-purple-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>ACC Defect</span>
            {stats.defect > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full font-bold transition-colors ${
                  activeTab === 'acc_defect'
                    ? 'bg-white/25 text-white'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300'
                }`}
                title={`${stats.defect} tiket defect menunggu ACC`}
              >
                {stats.defect}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Render Active Submodule */}
      {activeTab === 'form_laporan' && (
        <LaporanQcView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          viewMode="form_only"
          onNavigateToRiwayat={() => setActiveTab('riwayat_laporan')}
          onNavigateToPerbaikan={handleNavigateToPerbaikan}
          onRejectCreated={handleRejectCreated}
        />
      )}

      {activeTab === 'riwayat_laporan' && (
        <LaporanQcView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          viewMode="riwayat_only"
          onNavigateToPerbaikan={handleNavigateToPerbaikan}
          onRejectCreated={handleRejectCreated}
        />
      )}

      {(activeTab === 'perbaikan' || activeTab === 'acc_defect') && (
        <PerbaikanView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          initialSearchQuery={targetSearchTicket}
          activeSection={activeTab === 'perbaikan' ? 'perbaikan' : 'defect'}
          onNavigateSection={(sec) => {
            if (sec === 'defect') setActiveTab('acc_defect');
            else if (sec === 'perbaikan') setActiveTab('perbaikan');
            else setActiveTab('riwayat_laporan');
            setTargetSearchTicket(undefined);
          }}
          onRejectCreated={handleRejectCreated}
        />
      )}
    </div>
  );
};
