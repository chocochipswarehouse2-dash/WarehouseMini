import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
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
              {this.state.error?.message || 'Data tidak dapat ditampilkan dengan benar.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2.5 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md inline-flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Pulihkan / Muat Ulang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
