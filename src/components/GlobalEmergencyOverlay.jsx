import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { AlertOctagon } from 'lucide-react';

export default function GlobalEmergencyOverlay() {
  const { receiptSettings } = useOrder();
  const location = useLocation();

  const isEmergencyActive = Boolean(receiptSettings?.emergencyMode?.enabled);
  const emergencyMessage = receiptSettings?.emergencyMode?.message || 'Sistem mengalami gangguan secara tiba-tiba, sila buat pesanan secara manual dengan waiter.';

  // Check if current page is a staff route (Staff routes should NOT be locked so staff can turn off emergency mode)
  const isStaffRoute = ['/staff', '/counter', '/kitchen', '/menu-editor'].some(path => 
    location.pathname.startsWith(path)
  );

  // Should lock screen for customers
  const shouldLockCustomer = isEmergencyActive && !isStaffRoute;

  // Lock body scroll dynamically on customer devices
  useEffect(() => {
    if (shouldLockCustomer) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'unset';
    };
  }, [shouldLockCustomer]);

  if (!shouldLockCustomer) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-md text-white flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none pointer-events-auto font-sans">
      <div className="max-w-md w-full my-auto bg-slate-900 border-2 border-rose-500/60 rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5 sm:space-y-6 flex flex-col items-center justify-center text-center animate-fadeIn">
        
        {/* ALERT ICON */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-rose-500/20 border-2 border-rose-500/70 text-rose-500 flex items-center justify-center shadow-xl shadow-rose-500/30 shrink-0">
          <AlertOctagon className="w-10 h-10 sm:w-12 sm:h-12 animate-pulse" />
        </div>

        {/* RESPONSIVE AUTO-HEIGHT HEADER CARD (REPLACES RIGID PILL) */}
        <div className="w-full bg-rose-500/15 border border-rose-500/40 rounded-2xl p-4 text-center space-y-1 shadow-sm">
          <span className="text-rose-400 font-mono font-extrabold text-xs sm:text-sm uppercase tracking-wider block whitespace-normal break-words leading-snug">
            🚨 NOTIS KECEMASAN / SELENGGARAAN
          </span>
          <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight whitespace-normal break-words leading-tight">
            Sistem Dibataskan Sementara
          </h2>
        </div>

        {/* CUSTOM MESSAGE BOX (MULTI-LINE WRAPPING, NO CUTTING) */}
        <div className="w-full bg-slate-950/90 p-4 sm:p-5 rounded-2xl border border-slate-800 text-slate-200 text-sm sm:text-base font-medium leading-relaxed shadow-inner text-center whitespace-normal break-words">
          {emergencyMessage}
        </div>

        {/* FOOTER NOTICE */}
        <div className="w-full pt-3 text-xs text-slate-400 font-mono flex items-center justify-center gap-2 border-t border-slate-800/80 whitespace-normal break-words">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span>Sila berhubung terus dengan kakitangan restoran.</span>
        </div>
      </div>
    </div>
  );
}
