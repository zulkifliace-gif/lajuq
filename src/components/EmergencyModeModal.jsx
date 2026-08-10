import React, { useState, useEffect } from 'react';
import { X, AlertOctagon, Power, Save, RotateCcw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useOrder } from '../context/OrderContext';

export default function EmergencyModeModal({ isOpen, onClose }) {
  const { receiptSettings, updateReceiptSettings } = useOrder();

  const defaultMsg = 'Sistem mengalami gangguan secara tiba-tiba, sila buat pesanan secara manual dengan waiter.';

  const [isEnabled, setIsEnabled] = useState(false);
  const [message, setMessage] = useState(defaultMsg);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Sync state when modal opens or receiptSettings changes
  useEffect(() => {
    if (receiptSettings?.emergencyMode) {
      setIsEnabled(Boolean(receiptSettings.emergencyMode.enabled));
      setMessage(receiptSettings.emergencyMode.message || defaultMsg);
    }
  }, [receiptSettings, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (forceEnabled = null) => {
    setIsSaving(true);
    setSaveSuccessMsg('');
    const targetEnabled = forceEnabled !== null ? forceEnabled : isEnabled;
    const finalMsg = message.trim() || defaultMsg;

    const newEmergencySettings = {
      emergencyMode: {
        enabled: targetEnabled,
        message: finalMsg
      }
    };

    try {
      if (updateReceiptSettings) {
        await updateReceiptSettings(newEmergencySettings);
      }
      setIsEnabled(targetEnabled);
      setSaveSuccessMsg(targetEnabled ? '🚨 Mod Kecemasan AKTIF & Paparan Pelanggan Di-Freeze!' : '🟢 Mod Kecemasan Dinyahaktifkan — Pelanggan Kembali Normal.');
      setTimeout(() => {
        setSaveSuccessMsg('');
      }, 3000);
    } catch (err) {
      console.error('Error saving emergency mode:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col font-sans text-slate-100">
        
        {/* HEADER */}
        <div className="bg-rose-950/80 border-b border-rose-500/30 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                Mod Kecemasan (System Lock)
              </h2>
              <p className="text-xs text-rose-300/80 font-medium">
                Kunci skrin pelanggan & sekat pesanan masa-nyata
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto">
          
          {/* STATUS TOGGLE CARD */}
          <div className={`p-4 rounded-2xl border-2 transition ${
            isEnabled 
              ? 'bg-rose-950/50 border-rose-500 shadow-lg shadow-rose-500/20' 
              : 'bg-emerald-950/40 border-emerald-500/40'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider block text-slate-400">
                  STATUS MOD KECEMASAN
                </span>
                <p className={`font-black text-lg sm:text-xl flex items-center gap-2 ${isEnabled ? 'text-rose-400' : 'text-emerald-400'}`}>
                  <span>{isEnabled ? '🔴 SEDANG AKTIF (LOCKED)' : '🟢 NYAHAKTIF (NORMAL)'}</span>
                </p>
              </div>

              {/* QUICK TOGGLE BUTTON */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !isEnabled;
                  setIsEnabled(nextState);
                  handleSave(nextState);
                }}
                disabled={isSaving}
                className={`px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition shadow-md active:scale-95 cursor-pointer disabled:opacity-50 ${
                  isEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                }`}
              >
                <Power className="w-4 h-4" />
                <span>{isEnabled ? 'Matikan Mod Kecemasan' : 'Hidupkan Mod Kecemasan'}</span>
              </button>
            </div>
          </div>

          {/* EMERGENCY MESSAGE TEXTAREA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-200 flex items-center gap-1.5">
                <span>Mesej Notis Pelanggan (Real-Time):</span>
              </label>
              <button
                type="button"
                onClick={() => setMessage(defaultMsg)}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Mesej Default</span>
              </button>
            </div>

            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Masukkan pesanan notis khas untuk pelanggan..."
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-semibold text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 leading-relaxed shadow-inner"
            />
          </div>

          {/* WARNING INFO BOX */}
          <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-300">Kesan Pelaksanaan Mod Kecemasan:</p>
              <p className="leading-relaxed">
                Bila diaktifkan, skrin peranti pelanggan akan <strong className="text-rose-400">AUTO-POPUP NOTIS & AUTO-LOCK (FREEZE)</strong> secara real-time. Pelanggan tidak boleh membuat pesanan, scroll, atau tekan sebarang butang sehingga mod ini dinyahaktifkan semula.
              </p>
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          {saveSuccessMsg ? (
            <div className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 animate-fadeIn w-full justify-center">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveSuccessMsg}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : '💾 Simpan & Terapkan'}</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
