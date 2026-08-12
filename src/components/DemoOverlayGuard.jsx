import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useOrder } from '../context/OrderContext';

export default function DemoOverlayGuard({ children }) {
  const { isDemoMode } = useOrder();
  const [showWarning, setShowWarning] = useState(false);

  if (!isDemoMode) {
    return <>{children}</>;
  }

  const handleIntercept = (e) => {
    // Check if the click target or any of its parents has the 'demo-bypass' class
    if (e.target && e.target.closest('.demo-bypass')) {
      return; // Allow the click to pass through
    }

    e.preventDefault();
    e.stopPropagation();
    setShowWarning(true);
    
    // Auto hide after 3 seconds
    setTimeout(() => {
      setShowWarning(false);
    }, 3000);
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col flex-1"
      onClickCapture={handleIntercept}
      onMouseDownCapture={handleIntercept}
      onTouchStartCapture={handleIntercept}
    >
      {children}

      {/* Warning Toast */}
      {showWarning && (
        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[100] animate-fade-in-up">
          <div className="bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-rose-400">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
            <div>
              <p className="font-extrabold text-sm sm:text-base">Akaun Demo: Paparan Sahaja</p>
              <p className="text-xs sm:text-sm text-rose-100 mt-1">Fungsi butang disekat. Sila langgan sistem untuk penggunaan penuh.</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowWarning(false); }} 
              className="ml-2 p-1 hover:bg-rose-500 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
