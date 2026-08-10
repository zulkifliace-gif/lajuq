import React from 'react';
import { ShieldAlert, RefreshCw, ArrowLeft, Terminal } from 'lucide-react';

export default class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`❌ [ModuleErrorBoundary - ${this.props.moduleName || 'Modul'}] Unhandled Exception:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { moduleName = 'Modul Sistem', children } = this.props;

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-rose-500 selection:text-white">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center animate-fadeIn">
            
            {/* Shield Header */}
            <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-bold rounded-full inline-block">
                Ralat Modul: {moduleName}
              </span>
              <h2 className="text-xl font-extrabold text-white">Gangguan Dikesan pada {moduleName}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sistem telah menyekat kerosakan skrin (*white screen*) secara automatik. Anda boleh cuba muat semula modul ini tanpa menjejaskan data sesi.
              </p>
            </div>

            {/* Error Diagnostics Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left font-mono text-xs overflow-auto max-h-48 text-rose-300 space-y-2">
              <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800 pb-2">
                <Terminal className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-300">Maklumat Ralat (Console Output):</span>
              </div>
              <p className="font-bold text-rose-400 break-words">
                {this.state.error?.toString() || 'Ralat tidak diketahui'}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap leading-tight">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black text-xs rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Muat Semula Modul</span>
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5"
              >
                <span>Refresh Halaman</span>
              </button>

              <a
                href="/staff"
                className="py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Dashboard</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
