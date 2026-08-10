import React from 'react';
import { AlertOctagon, RefreshCw, ArrowLeft } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL UNCAUGHT COMPONENT ERROR:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-rose-500 selection:text-white">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center animate-fadeIn">
            <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
              <AlertOctagon className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-widest">Ralat Sistem / System Exception</span>
              <h2 className="text-xl font-extrabold text-white">Ralat Komponen Dikesan</h2>
              <p className="text-xs text-slate-400">Aplikasi mendapati terdapat ralat semasa memaparkan halaman ini.</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left font-mono text-xs overflow-auto max-h-48 text-rose-300 space-y-2">
              <p className="font-bold text-rose-400">Ralat: {this.state.error?.toString()}</p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Muat Semula Halaman</span>
              </button>
              
              <a
                href="/staff"
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Dashboard</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
