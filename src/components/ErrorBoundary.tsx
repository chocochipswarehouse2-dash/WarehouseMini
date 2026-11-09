import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { clearHeavyCaches, isQuotaExceededError } from '../utils/safeStorage';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      // Clear huge caches to prevent recurring QuotaExceeded errors immediately upon reload
      clearHeavyCaches();
      const keysToClear = [
        'wms_product_cache',
        'wms_picking_cache',
        'wms_raw_picking_list_cache',
        'wms_active_picking_session',
        'wms_trello_up_catalog_cache',
        'wms_cached_pengecekan_sj_records',
        'wms_cached_tarikan_md',
        'wms_cached_pengecekan_sj_drafts',
        'wms_offline_queue_pengecekan_sj',
        'gas_delta_sync_Stok Real',
        'gas_delta_sync_Mutasi Log',
      ];
      keysToClear.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
    } catch {}

    this.setState({ hasError: false, error: null });
    
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      // If no custom reset handler is provided, force a page reload to recover state cleanly
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isQuota = isQuotaExceededError(this.state.error);

      return (
        <div className="p-6 max-w-lg mx-auto my-8 bg-white dark:bg-[#131d31] rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-xl text-center space-y-4 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">
              {this.props.fallbackTitle || 'Terjadi Kendala Tampilan'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isQuota
                ? 'Kapasitas penyimpanan lokal peramban (localStorage) penuh. Silakan klik tombol di bawah untuk membersihkan cache offline dan memulihkan tampilan secara instan.'
                : (this.state.error?.message || 'Data tidak dapat ditampilkan dengan benar.')}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md inline-flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {isQuota ? <Trash2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
              {isQuota ? 'Bersihkan Penyimpanan & Pulihkan' : 'Pulihkan / Muat Ulang'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
