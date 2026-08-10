import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { Headphones, X, Send, Loader2, CheckCircle2, AlertCircle, Phone, FileText, Image, Tag, Building2 } from 'lucide-react';
import { getBackendBaseUrl } from '../utils/apiConfig';

const TELEGRAM_BOT_TOKEN = '8676460374:AAG08d_gieND5UfawUVIylwY7MaEoNMGdCA';
const TELEGRAM_CHANNEL_ID = '-1004438116944';

// Helper: Escape HTML entities to prevent Telegram API 400 Bad Request
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function TechnicalSupportModal({ isOpen, onClose }) {
  const { receiptSettings } = useOrder();

  const [issueType, setIssueType] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setSubmitSuccess(false);
      setErrorMessage('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Strict Validation: ALL 4 fields MUST be non-empty and valid
  const isIssueTypeValid = Boolean(issueType && issueType.trim().length > 0);
  const isPhoneValid = Boolean(phoneNumber && phoneNumber.trim().length >= 8);
  const isDescriptionValid = Boolean(description && description.trim().length >= 5);
  const isImageUrlValid = Boolean(imageUrl && imageUrl.trim().length >= 5);

  const isValid = isIssueTypeValid && isPhoneValid && isDescriptionValid && isImageUrlValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const formattedTime = new Date().toLocaleString('ms-MY', { 
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const restaurantName = receiptSettings?.headerTitle || 'Restoran Rasa Selera';

    // HTML Formatted & Escaped Message for Telegram Bot
    const telegramMessage = `
<b>🚨 TIKET BANTUAN TEKNIKAL BAHARU 🚨</b>

<b>🏪 Restoran:</b> ${escapeHtml(restaurantName)}
<b>📌 Jenis Masalah:</b> ${escapeHtml(issueType)}
<b>📞 No. Telefon:</b> ${escapeHtml(phoneNumber)}
<b>⏰ Masa Dihantar:</b> ${escapeHtml(formattedTime)}

<b>📝 Penerangan Masalah:</b>
${escapeHtml(description)}

<b>🖼️ Bukti Gambar:</b>
<a href="${escapeHtml(imageUrl)}">${escapeHtml(imageUrl)}</a>
`.trim();

    try {
      const BASE = getBackendBaseUrl();
      let sentSuccess = false;

      // 1. Try Backend Proxy Route with 8s timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const backendRes = await fetch(`${BASE}/api/support-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueType,
            phoneNumber,
            description,
            imageUrl,
            messageHtml: telegramMessage
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (backendRes.ok) {
          sentSuccess = true;
        }
      } catch (proxyErr) {
        console.warn('Backend proxy endpoint failed or timed out, attempting direct Telegram API fetch...', proxyErr);
      }

      // 2. Fallback: Direct Telegram API HTTP POST with 8s timeout
      if (!sentSuccess) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHANNEL_ID,
            text: telegramMessage,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const tgData = await tgRes.json();
        if (tgData.ok) {
          sentSuccess = true;
        } else {
          throw new Error(tgData.description || 'Gagal menghantar mesej ke Telegram API.');
        }
      }

      if (sentSuccess) {
        setSubmitSuccess(true);
        // Reset form fields
        setIssueType('');
        setPhoneNumber('');
        setDescription('');
        setImageUrl('');
      } else {
        throw new Error('Gagal menghantar tiket bantuan teknikal.');
      }
    } catch (err) {
      console.error('Telegram Ticket Submission Error:', err);
      if (err.name === 'AbortError') {
        setErrorMessage('Masa tamat (Timeout). Rangkaian internet terganggu. Sila cuba lagi.');
      } else {
        setErrorMessage(err.message || 'Ralat sambungan. Sila semak semula sambungan internet anda.');
      }
    } fontinally: {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 relative">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900/60 via-slate-800 to-indigo-900/60 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl shadow-lg shadow-blue-500/20">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white tracking-tight flex items-center gap-2">
                Tiket Bantuan Teknikal
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-mono border border-blue-500/30">TELEGRAM BOT</span>
              </h3>
              <p className="text-xs text-slate-400">Hantar aduan sistem terus ke Channel Telegram Support</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {submitSuccess ? (
            <div className="text-center py-8 space-y-4 animate-fadeIn">
              <div className="h-16 w-16 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20 animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-extrabold text-white">Laporan Berjaya Dihantar! 🎉</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Pasukan sokongan teknikal kami telah menerima tiket anda di Telegram Channel dan akan menghubungi anda secepat mungkin.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/30 transition cursor-pointer"
              >
                Tutup Borang
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {errorMessage && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl flex items-center gap-2 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. JENIS MASALAH (DROPDOWN) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-400" />
                  <span>1. Jenis Masalah</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-200 outline-none focus:border-blue-500 transition font-semibold"
                  required
                >
                  <option value="">-- Pilih Jenis Masalah --</option>
                  <option value="🖨️ Masalah Resit / Bluetooth Printer">🖨️ Masalah Resit / Bluetooth Printer</option>
                  <option value="👨‍🍳 Masalah Skrin Dapur (KDS)">👨‍🍳 Masalah Skrin Dapur (KDS)</option>
                  <option value="📱 Masalah Web Menu Pelanggan / QR Code">📱 Masalah Web Menu Pelanggan / QR Code</option>
                  <option value="💳 Masalah Bayaran / Cukai SST / Cas Bungkus">💳 Masalah Bayaran / Cukai SST / Cas Bungkus</option>
                  <option value="🚨 Masalah Server / Sambungan Socket.io">🚨 Masalah Server / Sambungan Socket.io</option>
                  <option value="🛠️ Lain-lain Masalah Teknikal">🛠️ Lain-lain Masalah Teknikal</option>
                </select>
              </div>

              {/* 2. NO TELEFON (INPUT TEXT) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. No. Telefon Untuk Dihubungi</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Contoh: 0123456789 / 0198765432"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-200 outline-none focus:border-emerald-500 transition font-mono"
                  required
                />
              </div>

              {/* 3. PENERANGAN MASALAH (TEXTAREA) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>3. Penerangan Terperinci Masalah</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan ralat atau situasi yang berlaku secara terperinci..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 outline-none focus:border-amber-500 transition leading-relaxed resize-none"
                  required
                />
              </div>

              {/* 4. URL GAMBAR (INPUT URL) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-purple-400" />
                  <span>4. URL Gambar Bukti Ralat</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Contoh: https://img.postimg.cc/abc1234.jpg"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-200 outline-none focus:border-purple-500 transition font-mono"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  *Muat naik gambar ralat ke PostImage / ImgBB dan tampal URL di sini.
                </p>
              </div>

              {/* Validation Warning Notice if incomplete */}
              {!isValid && (
                <div className="text-[11px] text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 font-mono text-center">
                  ⚠️ Sila lengkapkan SEMUA 4 maklumat di atas untuk mengaktifkan butang hantar.
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className={`w-full py-4 px-5 font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition shadow-xl ${
                  isValid && !isSubmitting
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30 cursor-pointer active:scale-95'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sedang Menghantar ke Telegram...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Hantar Laporan Tiket Ke Telegram 🚀</span>
                  </>
                )}
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
}
