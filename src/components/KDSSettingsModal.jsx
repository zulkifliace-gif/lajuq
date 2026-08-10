import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { Settings, X, Volume2, Printer, Layers, Play, Check } from 'lucide-react';

export const SOUND_OPTIONS = [
  { id: 'DEFAULT', name: '🔔 Bunyi BEEP Asal (Default)' },
  { id: 'new order.mp3', name: '🛍️ New Order (Disyorkan)' },
  { id: 'notification alert.mp3', name: '📢 Notification Alert' },
  { id: 'new notification.mp3', name: '🔔 New Notification' },
  { id: 'message notification alert.mp3', name: '💬 Message Notification' },
  { id: 'alarm alert.mp3', name: '🚨 Alarm Alert' },
  { id: 'pop.mp3', name: '🎈 Pop Sound' },
  { id: 'horn sound.mp3', name: '📯 Horn Sound' },
  { id: 'anime shine sound.mp3', name: '✨ Anime Shine' },
  { id: 'i got this.mp3', name: '💼 I Got This' },
  { id: 'suara tegas.mp3', name: '🗣️ Suara Tegas (Staf)' },
  { id: 'suara marah.mp3', name: '😡 Suara Marah (Kelakar)' },
  { id: 'sus.mp3', name: '🕵️ Among Us Sus' },
  { id: 'tedbear.mp3', name: '🧸 Tedbear Sound' },
  { id: 'thud sound.mp3', name: '💥 Thud Sound' },
  { id: 'what.mp3', name: '❓ What Sound' },
  { id: 'ghost sound.mp3', name: '👻 Ghost Sound' },
  { id: 'fah.mp3', name: '📢 Fah Sound' }
];

export default function KDSSettingsModal({ isOpen, onClose }) {
  const { receiptSettings, updateReceiptSettings, playBeepSound } = useOrder();

  const [waveCapacity, setWaveCapacity] = useState(10);
  const [waveMode, setWaveMode] = useState(true);
  const [paperWidth, setPaperWidth] = useState('58mm');
  const [kdsSound, setKdsSound] = useState('DEFAULT');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  useEffect(() => {
    if (receiptSettings) {
      setWaveCapacity(receiptSettings.waveCapacity !== undefined ? Number(receiptSettings.waveCapacity) : 10);
      setWaveMode(receiptSettings.waveMode !== false);
      setPaperWidth(receiptSettings.paperWidth || '58mm');
      setKdsSound(receiptSettings.kdsSound || 'DEFAULT');
    }
  }, [receiptSettings, isOpen]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestSound = (soundId) => {
    setIsPlayingPreview(true);
    if (soundId === 'DEFAULT') {
      playBeepSound();
      setTimeout(() => setIsPlayingPreview(false), 800);
    } else {
      try {
        const audio = new Audio(`/sound/${soundId}`);
        audio.play().then(() => {
          setTimeout(() => setIsPlayingPreview(false), 1500);
        }).catch(err => {
          console.warn('Preview play error:', err);
          setIsPlayingPreview(false);
        });
      } catch (e) {
        setIsPlayingPreview(false);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await updateReceiptSettings({
        waveCapacity: Number(waveCapacity),
        waveMode: Number(waveCapacity) > 0,
        paperWidth,
        kdsSound
      });
    } catch (err) {
      console.error('KDS Settings Save Error:', err);
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full text-slate-100 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xl shadow-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">Tetapan KDS Dapur</h2>
              <p className="text-xs text-slate-400">Pengurusan Wave, Saiz Resit & Bunyi Pesanan</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* 1. WAVE SYSTEM SETTING */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
              <Layers className="w-4 h-4" />
              <span>🌊 Mod Wave Dapur (Throttling System)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mengehadkan bilangan pesanan aktif dalam Wave 1 pada skrin untuk mengelakkan tukang masak panik waktu puncak.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
              {[
                { label: '5 Slot', cap: 5 },
                { label: '10 Slot', cap: 10 },
                { label: '15 Slot', cap: 15 },
                { label: '20 Slot', cap: 20 },
                { label: 'Matikan', cap: 0 }
              ].map((opt) => (
                <button
                  key={opt.cap}
                  type="button"
                  onClick={() => {
                    setWaveCapacity(opt.cap);
                    setWaveMode(opt.cap > 0);
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1 ${
                    (opt.cap === 0 && !waveMode) || (waveMode && waveCapacity === opt.cap)
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. PRINTER PAPER WIDTH SETTING */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-400 font-extrabold text-sm">
              <Printer className="w-4 h-4" />
              <span>🖨️ Saiz Kertas Printer Dapur</span>
            </div>
            <p className="text-xs text-slate-400">
              Tetapkan lebar cetakan kertas resit thermal yang disambung ke peranti KDS.
            </p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: '58mm', name: '58mm (Kecil / Default)' },
                { id: '72mm', name: '72mm (Sederhana)' },
                { id: '80mm', name: '80mm (Besar POS)' }
              ].map((pw) => (
                <button
                  key={pw.id}
                  type="button"
                  onClick={() => setPaperWidth(pw.id)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center ${
                    paperWidth === pw.id
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md font-black'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {pw.name}
                </button>
              ))}
            </div>
          </div>

          {/* 3. ORDER NOTIFICATION SOUND SELECTOR */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
                <Volume2 className="w-4 h-4" />
                <span>🔔 Notis Order Masuk (Bunyi Audio)</span>
              </div>

              <button
                type="button"
                onClick={() => handleTestSound(kdsSound)}
                className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Play className={`w-3.5 h-3.5 ${isPlayingPreview ? 'animate-spin' : ''}`} />
                <span>Uji Bunyi 🔊</span>
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Pilih bunyi audio notifikasi yang dibunyikan automatik di dapur apabila pelanggan hantar pesanan baharu.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {SOUND_OPTIONS.map((snd) => {
                const isSelected = kdsSound === snd.id;
                return (
                  <div
                    key={snd.id}
                    onClick={() => {
                      setKdsSound(snd.id);
                      handleTestSound(snd.id);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      <span>{snd.name}</span>
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setKdsSound(snd.id);
                        handleTestSound(snd.id);
                      }}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-300 transition"
                      title="Mainkan Ujian Bunyi"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
            >
              Simpan Tetapan KDS
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
