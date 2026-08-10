import React from 'react';
import { QrCode, Utensils, Smartphone, Wifi } from 'lucide-react';

export default function CustomerPublicLanding() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between font-sans selection:bg-amber-500 selection:text-slate-950 overflow-hidden relative">
      
      {/* Ambient Background Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto px-6 py-12 text-center space-y-8 relative z-10">

        {/* Top Icon */}
        <div className="space-y-4">
          <div className="mx-auto h-24 w-24 rounded-[2rem] bg-gradient-to-br from-amber-500/20 to-emerald-500/10 border border-amber-500/30 flex items-center justify-center shadow-2xl shadow-amber-500/10">
            <Utensils className="w-12 h-12 text-amber-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Restoran Rasa Selera
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              Sistem Pesanan Digital Berasaskan QR Code
            </p>
          </div>
        </div>

        {/* QR Scan Instruction Card */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-7 space-y-5 shadow-2xl backdrop-blur-sm">

          {/* QR Icon with Pulse */}
          <div className="mx-auto w-20 h-20 relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/10 animate-ping opacity-40" />
            <div className="relative h-20 w-20 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <QrCode className="w-10 h-10 text-amber-400" />
            </div>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Imbas QR Code di Meja Anda
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Sila gunakan kamera telefon pintar anda untuk mengimbas kod QR yang tertera pada slip meja bagi memilih menu dan membuat pesanan.
            </p>
          </div>

          {/* Step Hints */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { icon: '📸', label: 'Imbas QR' },
              { icon: '🍽️', label: 'Pilih Menu' },
              { icon: '✅', label: 'Hantar Pesanan' },
            ].map((step, idx) => (
              <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex flex-col items-center gap-1.5">
                <span className="text-xl">{step.icon}</span>
                <span className="text-[10px] font-bold text-slate-400 text-center leading-tight">{step.label}</span>
              </div>
            ))}
          </div>

        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs text-emerald-400 font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <Wifi className="w-3.5 h-3.5" />
          <span>Sistem Pesanan Digital Aktif</span>
        </div>

        {/* Helper for staff access */}
        <p className="text-[11px] text-slate-600 font-mono">
          Staf Restoran: Akses melalui URL terminal yang diberikan oleh pengurus.
        </p>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/60 py-5 text-center text-[11px] text-slate-600 relative z-10">
        <div className="flex items-center justify-center gap-2">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Restoran Rasa Selera • Sistem Pesanan Digital</span>
        </div>
      </footer>

    </div>
  );
}
