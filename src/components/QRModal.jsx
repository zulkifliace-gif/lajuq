import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, CheckCircle, Copy, Bluetooth, Loader2 } from 'lucide-react';
import { printQRSlipBluetooth } from '../utils/bluetoothPrinter';

export default function QRModal({ isOpen, onClose, tableNumber, sessionId }) {
  const { btDevice, sessions } = useOrder();
  const [resolvedToken, setResolvedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [btPrinting, setBtPrinting] = useState(false);
  const [btMsg, setBtMsg] = useState('');

  // Lock scroll when open
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

  // Reset token setiap kali sessionId berubah
  useEffect(() => {
    setResolvedToken('');
  }, [sessionId]);

  // Cari access_token dari state atau Supabase terus
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    const cleanId = String(sessionId || '');
    const normalizedId = cleanId.startsWith('SES-') ? cleanId : `SES-${cleanId}`;
    const unPrefixedId = cleanId.replace(/^SES-/, '');

    // Cuba cari dalam React state dahulu (pelbagai format kunci)
    const fromState = sessions?.[normalizedId]?.access_token
      || sessions?.[unPrefixedId]?.access_token
      || sessions?.[cleanId]?.access_token
      || Object.values(sessions || {}).find(s =>
          String(s.session_id) === normalizedId || Number(s.table_number) === Number(tableNumber)
        )?.access_token
      || '';

    if (fromState) {
      setResolvedToken(fromState);
      return;
    }

    // Kalau token tiada dalam state, fetch terus dari Supabase REST API
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    fetch(`${supabaseUrl}/rest/v1/sessions?session_id=eq.${encodeURIComponent(normalizedId)}&select=access_token&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })
      .then(r => r.json())
      .then(data => {
        const token = data?.[0]?.access_token || '';
        if (token) setResolvedToken(token);
      })
      .catch(() => {});
  }, [isOpen, sessionId, sessions, tableNumber]);

  if (!isOpen || !sessionId) return null;

  const cleanId = String(sessionId || '');
  const unPrefixedId = cleanId.replace(/^SES-/, '');
  const accessToken = resolvedToken;

  // Ultra-Short URL format for GOOJPRT 58mm printer compatibility (/o?t=X&s=YZ)
  const shortSessionId = unPrefixedId;
  const tid = localStorage.getItem('fb_tenant_id') || '';
  const orderUrl = `${window.location.origin}/o?t=${tableNumber}&s=${shortSessionId}${tid ? '&tid=' + tid : ''}${accessToken ? '&token=' + accessToken : ''}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(orderUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Bluetooth Print Action
  const handlePrintQRCodeBT = async () => {
    if (!btDevice) return;

    setBtPrinting(true);
    setBtMsg('Mencetak QR Code ke Bluetooth Printer...');
    try {
      await printQRSlipBluetooth(btDevice, {
        tableNumber,
        sessionId,
        orderUrl,     // sudah mengandungi &token= jika accessToken ada
        accessToken   // hantar juga accessToken sebagai failsafe
      });
      setBtMsg('QR Code Slip berjaya dicetak! 🖨️');
    } catch (err) {
      console.error(err);
      setBtMsg('Ralat semasa mencetak ke Bluetooth printer.');
    } finally {
      setBtPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 relative transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>
            <h3 className="font-bold text-lg text-slate-100">Dynamic Session QR Code</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 text-center space-y-4" id="printable-qr-slip">
          
          {/* REQUIREMENT 2: BUTANG CETAK QR CODE DI BAHAGIAN ATAS */}
          <div className="space-y-2">
            <button
              onClick={handlePrintQRCodeBT}
              disabled={!btDevice || btPrinting}
              className={`w-full py-3.5 px-5 font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2.5 transition transform ${
                btDevice 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
              title={!btDevice ? 'Sila sambung Bluetooth di Header Kaunter terlebih dahulu' : 'Cetak QR Code ke Bluetooth Printer'}
            >
              {btPrinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
              <span>{btDevice ? 'Cetak QR Code 🖨️' : 'Cetak BT QR (Kelabu - Sambung di Header)'}</span>
            </button>

            {/* Bluetooth Status Indicator Bar */}
            <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Bluetooth className={`w-4 h-4 ${btDevice ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`} />
                <span className={`font-semibold ${btDevice ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {btDevice ? `BT: Disambung (${btDevice.name})` : 'BT: Belum Disambung'}
                </span>
              </div>
              {!btDevice && (
                <span className="text-[10px] text-amber-400 font-mono">Sambung di Header Kaunter</span>
              )}
            </div>
          </div>

          {btMsg && (
            <div className="text-[11px] text-blue-400 font-mono text-center bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
              {btMsg}
            </div>
          )}

          <div className="inline-block bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold px-4 py-1.5 rounded-full text-xs tracking-wide">
            MEJA {tableNumber} • RESTORAN RASA SELERA
          </div>

          {/* QR Card Box - Level L Error Correction */}
          <div className="bg-white p-6 rounded-2xl shadow-inner border border-slate-200 inline-block mx-auto relative group">
            <QRCodeSVG 
              value={orderUrl}
              size={200}
              level="L"
              includeMargin={true}
              imageSettings={{
                src: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍽️</text></svg>",
                x: undefined,
                y: undefined,
                height: 38,
                width: 38,
                excavate: true,
              }}
            />
            <div className="mt-2 text-xs font-mono font-bold text-slate-800 tracking-wider">
              {sessionId}
            </div>
          </div>

          {/* Token status indicator */}
          <div className={`text-[10px] font-mono px-2 py-1 rounded-lg inline-block ${accessToken ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
            {accessToken ? `✅ Token: ${accessToken.slice(0,8)}...` : '⏳ Memuatkan token...'}
          </div>

          {/* Instructions */}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">
              Imbas QR untuk Mula Pesanan
            </p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Simpan QR Slip ini untuk membuat bayaran di kaunter setelah selesai makan.
            </p>
          </div>

          {/* Direct URL Display & Copy */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300">
            <span className="truncate max-w-[240px] text-slate-400">{orderUrl}</span>
            <button 
              onClick={handleCopyLink}
              className="ml-2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition flex items-center gap-1 shrink-0"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Disalin!' : 'Salin'}</span>
            </button>
          </div>

          {/* STAFF DIRECT ORDER / WALK-IN BUTTON */}
          <button
            onClick={() => {
              const url = `/order?table=${tableNumber}&session=${sessionId}&name=STAFFORDER${tid ? '&tid=' + tid : ''}${accessToken ? '&token=' + accessToken : ''}`;
              window.open(url, '_blank');
            }}
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer mt-2"
          >
            <span>[ + Pesanan Staf / Walk-in ]</span>
          </button>

        </div>

      </div>
    </div>
  );
}
