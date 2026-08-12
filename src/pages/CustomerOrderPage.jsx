import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';

import { getSubscriptionCycleInfo, getCycleOrdersCount, formatCountdown, FREE_PLAN_LIMIT, isFreePlan } from '../utils/subscriptionQuota';
import { playCancellationAlertSound, unlockAudioContext } from '../utils/alertSound';
import { requestNotificationPermission, sendCancellationNotification } from '../utils/notificationHelper';
import { 
  ShoppingBag, Search, Plus, Minus, X, Check, Utensils, Trash2,
  Clock, CheckCircle, AlertCircle, ChevronRight, MessageSquare, 
  Sparkles, ShieldAlert, User, ArrowRight, Flame, Heart, Info,
  Sun, Moon, ChevronDown, Bell, AlertOctagon, Send, ThumbsUp, ThumbsDown
} from 'lucide-react';

import { calculateReceiptTotals } from '../utils/receiptCalculator';
import ModuleErrorBoundary from '../components/ModuleErrorBoundary';
import { resolveImageUrl } from '../utils/apiConfig';

// Safe helper to parse items array
function getSafeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch(e) { return []; }
  }
  return [];
}

// resolveImageUrl di-import dari '../utils/apiConfig'

// Helper to strictly validate if a menu image URL is valid and non-empty
function hasValidImage(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 3) return false;
  if (trimmed === 'undefined' || trimmed === 'null' || trimmed === 'none' || trimmed === 'false') return false;
  return (
    trimmed.includes('http://') ||
    trimmed.includes('https://') ||
    trimmed.includes('data:image') ||
    trimmed.includes('blob:') ||
    trimmed.includes('/uploads/') ||
    trimmed.includes('uploads/')
  );
}

// Safe helper to format order timestamp/created_at across all browsers (Safari/Mobile safe)
function formatSafeOrderTime(ord) {
  if (!ord) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // 1. Try retrieving timestamp from all potential properties
  const rawTs = ord.created_at || ord.createdAt || ord.timestamp || ord.date || ord.time;

  if (!rawTs) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  try {
    let d;
    if (rawTs instanceof Date) {
      d = rawTs;
    } else if (typeof rawTs === 'number') {
      d = new Date(rawTs);
    } else if (typeof rawTs === 'string') {
      let cleaned = rawTs.trim();
      if (cleaned.includes(' ') && !cleaned.includes('T')) {
        cleaned = cleaned.replace(' ', 'T');
      }
      // If string lacks timezone offset, append Z so JavaScript parses as UTC and converts to local Malaysia time (GMT+8)
      if (!cleaned.endsWith('Z') && !cleaned.includes('+') && !cleaned.match(/[+-]\d{2}:?\d{2}$/)) {
        cleaned = cleaned + 'Z';
      }
      d = new Date(cleaned);
    } else {
      d = new Date(rawTs);
    }

    // Verify valid Date object
    if (d && !isNaN(d.getTime())) {
      const formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (formattedTime && formattedTime !== 'Invalid Date' && !formattedTime.includes('Invalid')) {
        return formattedTime;
      }
    }
  } catch (e) {
    // Fallback on error
  }

  // Absolute fallback: Return current time, NEVER "Invalid Date"
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ===================================================================== */
/* GELUNG MAKLUM BALAS PELANGGAN 👍/👎 (END-TO-END FEEDBACK WIDGET) */
/* ===================================================================== */
function CustomerFeedbackWidget({ sessionOrders = [], tableParam, customerName, submitCustomerFeedback }) {
  const [rating, setRating] = useState(null); // 'GOOD' | 'BAD' | null
  const [selectedItems, setSelectedItems] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);

  // React Ref for smooth auto-scrolling to dropdown form
  const feedbackSectionRef = useRef(null);

  const handleRatingSelect = (selectedRating) => {
    setRating(selectedRating);
    // Delay ~100ms to allow React to render the dropdown form before smooth scrolling
    setTimeout(() => {
      feedbackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const lastOrderId = (Array.isArray(sessionOrders) && sessionOrders.length > 0)
    ? sessionOrders[sessionOrders.length - 1]?.order_id
    : 'N/A';

  // Check localStorage on mount to lock form if already submitted for this order
  useEffect(() => {
    if (lastOrderId && lastOrderId !== 'N/A') {
      try {
        const submittedMap = JSON.parse(localStorage.getItem('fb_submitted_feedback_orders') || '{}');
        if (submittedMap[lastOrderId]) {
          setIsSubmitted(true);
        }
      } catch (e) {}
    }
  }, [lastOrderId]);

  // Extract all uncancelled items from session orders safely
  const allSessionItems = (Array.isArray(sessionOrders) ? sessionOrders : [])
    .filter(o => o?.kitchen_status !== 'CANCELLED')
    .flatMap(o => getSafeItems(o?.items))
    .filter(i => i && !i.cancelled);

  // Unique item names for checklist
  const uniqueItemNames = Array.from(new Set(allSessionItems.map(i => i?.name).filter(Boolean)));

  // 2 MANDATORY CONDITIONS FOR SUBMISSION:
  // Condition 1: Must tick at least 1 item (if items exist in session)
  const hasSelectedItems = uniqueItemNames.length === 0 || selectedItems.length > 0;
  // Condition 2: Must write a comment or select a preset comment
  const hasComment = commentText.trim().length > 0;
  // Both conditions must be met to activate the Send button
  const isFormValid = hasSelectedItems && hasComment;

  const toggleItemSelection = (itemName) => {
    setSelectedItems(prev =>
      prev.includes(itemName) ? prev.filter(n => n !== itemName) : [...prev, itemName]
    );
  };

  const handlePresetComment = (preset) => {
    if (commentText.includes(preset)) return;
    const newText = commentText ? `${commentText} ${preset}` : preset;
    setCommentText(newText.slice(0, 300));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating || !isFormValid || isSubmitting || isSubmitted) return;

    // LOCK IMMEDIATELY ON CLICK & CLEAR PREVIOUS ERRORS
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const cleanComment = (commentText || '').trim().slice(0, 300);
      await submitCustomerFeedback?.({
        order_id: lastOrderId,
        table_number: tableParam ? Number(tableParam) : null,
        customer_name: customerName || 'Pelanggan',
        rating,
        commented_items: selectedItems || [],
        comment: cleanComment
      });

      if (lastOrderId && lastOrderId !== 'N/A') {
        try {
          const submittedMap = JSON.parse(localStorage.getItem('fb_submitted_feedback_orders') || '{}');
          submittedMap[lastOrderId] = true;
          localStorage.setItem('fb_submitted_feedback_orders', JSON.stringify(submittedMap));
        } catch (e) {}
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
    } catch (err) {
      setIsSubmitting(false);
      const fullErrorMsg = err?.message || String(err);
      setSubmissionError(fullErrorMsg);
      // DISPLAY DETAILED ALERT DIRECTLY ON MOBILE PHONE SCREEN
      alert(fullErrorMsg);
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-500/30 rounded-2xl p-5 text-center space-y-2 animate-fadeIn mt-4">
        <div className="text-3xl">❤️</div>
        <h4 className="font-bold text-sm text-emerald-950">Terima Kasih Atas Maklum Balas Anda!</h4>
        <p className="text-xs text-emerald-800 leading-relaxed font-medium">
          Pandangan anda amat berharga buat kami untuk meningkatkan mutu sajian dan perkhidmatan.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF7EF] dark:bg-slate-900 border-2 border-black/10 dark:border-slate-800 rounded-2xl p-4 sm:p-5 text-left space-y-4 shadow-sm mt-4">
      <div className="text-center space-y-1">
        <h4 className="font-zilla font-bold text-base text-[#22262B] dark:text-white">
          Bagaimana Pengalaman Sajian Anda Hari Ini?
        </h4>
        <p className="text-xs text-[#6B6F66] dark:text-slate-400">Tekan Good 👍 atau Bad 👎 untuk beri penilaian.</p>
      </div>

      {/* BIG GOOD 👍 AND BAD 👎 BUTTONS */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => handleRatingSelect('GOOD')}
          className={`py-3.5 px-3 rounded-2xl border-2 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${
            rating === 'GOOD'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500/40'
              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
          }`}
        >
          <span className="text-2xl">👍</span>
          <span>Good / Puas Hati</span>
        </button>

        <button
          type="button"
          onClick={() => handleRatingSelect('BAD')}
          className={`py-3.5 px-3 rounded-2xl border-2 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${
            rating === 'BAD'
              ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/30 ring-2 ring-rose-500/40'
              : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <span className="text-2xl">👎</span>
          <span>Bad / Kurang Puas</span>
        </button>
      </div>

      {/* DROPDOWN FORM CARD (APPEARS WHEN RATING IS SELECTED WITH AUTO-SCROLL REF) */}
      {rating && (
        <form
          ref={feedbackSectionRef}
          onSubmit={handleSubmit}
          className="space-y-4 pt-3 border-t border-black/10 dark:border-slate-800 animate-fadeIn scroll-mt-6"
        >
          
          {/* Item Checklist (Tick > 1) */}
          {uniqueItemNames.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#22262B] dark:text-slate-200 block">
                Tanda Hidangan Yang Berkaitan (Boleh pilih &gt;1):
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {uniqueItemNames.map(name => {
                  const isChecked = selectedItems.includes(name);
                  return (
                    <label
                      key={name}
                      onClick={() => toggleItemSelection(name)}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-[#163F35] text-white border-[#163F35] font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-[#22262B] dark:text-slate-200 border-black/15 dark:border-slate-800 hover:bg-black/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 accent-[#163F35] rounded cursor-pointer"
                      />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Comment Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#6B6F66] dark:text-slate-400 block">
              Pilihan Pintas Komen:
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(rating === 'GOOD' ? [
                'Makanan Sedap! 😋',
                'Servis Laju ⚡',
                'Portion Padu 🍲',
                'Suasana Selesa 🌿',
                'Kuah Cukup Mantap 🔥'
              ] : [
                'Makanan Sejuk ❄️',
                'Servis Lambat ⏳',
                'Porsi Kurang 🍽️',
                'Rasanya Tawar 🧂',
                'Salah Order ⚠️'
              ]).map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetComment(preset)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-950 hover:bg-black/5 text-[#22262B] dark:text-slate-300 border border-black/15 dark:border-slate-800 rounded-full text-[11px] font-medium transition cursor-pointer"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Comment Textarea with 300 char counter */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-[#22262B] dark:text-slate-200">Komen / Maklum Balas Tambahan:</label>
              <span className={`font-mono text-[11px] ${commentText.length >= 300 ? 'text-rose-600 font-bold' : 'text-[#6B6F66] dark:text-slate-400'}`}>
                {commentText.length} / 300
              </span>
            </div>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, 300))}
              placeholder="Tulis ulasan anda di sini..."
              rows={3}
              maxLength={300}
              className="w-full p-3 bg-white dark:bg-slate-950 border-2 border-black/15 dark:border-slate-800 rounded-xl text-xs outline-none focus:border-[#163F35] transition font-sans text-[#22262B] dark:text-white placeholder-[#9B9D8F]"
            />
          </div>

          {/* GUIDANCE NOTE IF MANDATORY CONDITIONS NOT MET */}
          {!isFormValid && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium text-center bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 animate-fadeIn">
              {!hasSelectedItems && !hasComment
                ? '⚠️ Sila tanda sekurang-kurangnya 1 hidangan DAN isi ruang komen untuk mengaktifkan butang.'
                : !hasSelectedItems
                ? '⚠️ Sila tanda sekurang-kurangnya 1 hidangan yang berkaitan.'
                : '⚠️ Sila tulis ulasan atau pilih pilihan pintas komen.'}
            </p>
          )}

          {/* SUBMIT BUTTON (DISABLED / GRAY UNTIL 2 CONDITIONS MET) */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className={`w-full py-3.5 font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 ${
              isFormValid && !isSubmitting
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-md active:scale-95'
                : 'bg-gray-400 opacity-60 cursor-not-allowed text-gray-200 shadow-none'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Menghantar...' : 'Hantar Maklum Balas'}</span>
          </button>

          {/* RED DEBUG DIAGNOSTIC ERROR CARD ON MOBILE PHONE */}
          {submissionError && (
            <div className="p-4 bg-rose-950/90 border-2 border-rose-500 rounded-2xl text-rose-200 text-xs font-mono space-y-2 animate-fadeIn whitespace-pre-wrap select-all">
              <div className="flex items-center gap-2 text-rose-400 font-bold font-sans text-sm">
                <span>🚨 DIAGNOSTIK RALAT TELEFON</span>
              </div>
              <p className="text-[11px] leading-relaxed">{submissionError}</p>
              <div className="pt-2 border-t border-rose-800/80 text-[10px] text-rose-300 font-sans">
                💡 Sila rujuk maklumat ralat di atas untuk mengesan punca sebenar!
              </div>
            </div>
          )}

        </form>
      )}
    </div>
  );
}

export default function CustomerOrderPage() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table') || searchParams.get('t');
  const rawSession = searchParams.get('session') || searchParams.get('s');
  const nameParam = searchParams.get('name') || searchParams.get('customer');
  // Always normalize sessionParam to include 'SES-' prefix if missing
  const sessionParam = rawSession ? (rawSession.startsWith('SES-') ? rawSession : `SES-${rawSession}`) : null;

  const { menuItems, menuStock, tables, sessions, orders, submitOrder, receiptSettings, submitCustomerFeedback } = useOrder();

  const isItemOutOfStock = (item) => {
    if (!item) return false;
    const stockMap = menuStock || receiptSettings?.menuStock || {};
    const key = item.id || item.name;
    const stockData = stockMap[key] || stockMap[item.name] || {};
    return stockData.status === 'OUT_OF_STOCK' || (stockData.stock_qty !== undefined && stockData.stock_qty !== null && Number(stockData.stock_qty) <= 0);
  };

  const isOptionOutOfStock = (item, optName) => {
    if (!item || !optName) return false;
    const stockMap = menuStock || receiptSettings?.menuStock || {};
    const itemKey = item.id || item.name;
    const key1 = `opt::${itemKey}::${optName}`;
    const key2 = `opt::${item.name}::${optName}`;
    const key3 = `opt::${optName}`;
    const stockData = stockMap[key1] || stockMap[key2] || stockMap[key3] || {};
    return stockData.status === 'OUT_OF_STOCK' || (stockData.stock_qty !== undefined && stockData.stock_qty !== null && Number(stockData.stock_qty) <= 0);
  };

  const getAvailableStockQty = (item) => {
    if (!item) return null;
    const stockMap = menuStock || receiptSettings?.menuStock || {};
    const key = item.id || item.name;
    const stockData = stockMap[key] || stockMap[item.name] || {};
    if (stockData.status === 'OUT_OF_STOCK') return 0;
    if (stockData.stock_qty !== undefined && stockData.stock_qty !== null) {
      return Math.max(0, Number(stockData.stock_qty));
    }
    return null;
  };

  // Lock body scroll when Emergency Maintenance Mode is active
  useEffect(() => {
    if (receiptSettings?.emergencyMode?.enabled) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [receiptSettings?.emergencyMode?.enabled]);

  // Theme Mode State ('dark' | 'light')
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('fb_theme_mode') || 'dark';
  });

  // Customer Menu Template State ('modern' | 'kopitiam')
  const [customerTemplate, setCustomerTemplate] = useState(() => {
    return receiptSettings?.customerMenuTemplate || 'modern';
  });

  useEffect(() => {
    if (receiptSettings?.customerMenuTemplate) {
      setCustomerTemplate(receiptSettings.customerMenuTemplate);
      
    }
  }, [receiptSettings?.customerMenuTemplate]);

  // Customer Menu View Mode State ('grid' | 'book')
  const [customerMenuViewMode, setCustomerMenuViewMode] = useState(() => {
    return receiptSettings?.customerMenuViewMode || localStorage.getItem('fb_customer_menu_view_mode') || 'grid';
  });

  useEffect(() => {
    if (receiptSettings?.customerMenuViewMode) {
      setCustomerMenuViewMode(receiptSettings.customerMenuViewMode);
      localStorage.setItem('fb_customer_menu_view_mode', receiptSettings.customerMenuViewMode);
    }
  }, [receiptSettings?.customerMenuViewMode]);

  const [currentBookPage, setCurrentBookPage] = useState(0);
  const [paperFlipAnimClass, setPaperFlipAnimClass] = useState('');
  const bookSliderRef = useRef(null);

  // Web Audio API Procedural Paper Flip Sound Effect
  const playPaperFlipSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // 1. Noise Generator for paper friction
      const bufferSize = ctx.sampleRate * 0.16; // 160ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // 2. Bandpass Filter for paper sweep (3200Hz down to 700Hz)
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.14);
      filter.Q.value = 2.0;

      // 3. Gain Envelope (Fade in and out)
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + 0.16);
    } catch (e) {
      // AudioContext blocked or unsupported
    }
  };

  const handleBookPageChange = (targetIdx) => {
    if (targetIdx < 0 || targetIdx >= categoryConfig.length) return;
    const direction = targetIdx >= currentBookPage ? 'anim-flip-next' : 'anim-flip-prev';

    playPaperFlipSound();

    setPaperFlipAnimClass('');
    setTimeout(() => {
      setPaperFlipAnimClass(direction);
      setCurrentBookPage(targetIdx);
      if (categoryConfig[targetIdx]) {
        setActiveCategory(categoryConfig[targetIdx].name);
      }
      if (bookSliderRef.current) {
        const pageWidth = bookSliderRef.current.clientWidth || 300;
        bookSliderRef.current.scrollTo({ left: targetIdx * pageWidth, behavior: 'smooth' });
      }
    }, 10);
  };

  const toggleTemplate = () => {
    const nextTpl = customerTemplate === 'kopitiam' ? 'modern' : 'kopitiam';
    setCustomerTemplate(nextTpl);
    
  };

  const toggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('fb_theme_mode', nextTheme);
  };

  const isLight = themeMode === 'light';

  // Active Category State
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart State
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [overallNote, setOverallNote] = useState('');
  const [orderType, setOrderType] = useState(null); // null (unselected) | DINE_IN | TAKEAWAY
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected Item for Modifier Modal
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [modalOptions, setModalOptions] = useState({});
  const [modalItemNote, setModalItemNote] = useState('');
  const [modalQty, setModalQty] = useState(1);
  const [modalScrolledToBottom, setModalScrolledToBottom] = useState(true);
  const modalScrollRef = useRef(null);

  // Broken Image Tracking State
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  // modalImageLoaded: starts false (hidden), set true ONLY when image successfully loads
  // This prevents any flash/snap-closed by never showing banner until image is confirmed ready
  const [modalImageLoaded, setModalImageLoaded] = useState(false);

  // Customer Name State
  const [customerName, setCustomerName] = useState('');
  const [nameInputValue, setNameInputValue] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);

  // Order Submission View State (null = menu view, 'SUBMITTED' = status tracking view)
  const [viewState, setViewState] = useState(null);

  const { tenant } = useAuth();
  const [isQuotaExceededModalOpen, setIsQuotaExceededModalOpen] = useState(false);
  const [quotaCountdown, setQuotaCountdown] = useState('');

  // Live Countdown interval for Quota Exceeded Modal
  useEffect(() => {
    if (!isQuotaExceededModalOpen) return;
    const { cycleEnd } = getSubscriptionCycleInfo(tenant?.created_at);
    setQuotaCountdown(formatCountdown(cycleEnd));

    const interval = setInterval(() => {
      setQuotaCountdown(formatCountdown(cycleEnd));
    }, 1000);

    return () => clearInterval(interval);
  }, [isQuotaExceededModalOpen, tenant?.created_at]);

  // Prevent Background Scrolling when any popup/modal/drawer is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(selectedItemForModal || isCartOpen || !nameSubmitted || isSubmitting);
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [selectedItemForModal, isCartOpen, nameSubmitted, isSubmitting]);

  // On mount: check URL nameParam (e.g. STAFFORDER), then check localStorage & sessionStorage for saved name
  useEffect(() => {
    if (nameParam) {
      setCustomerName(nameParam);
      setNameInputValue(nameParam);
      setNameSubmitted(true);
      if (sessionParam) {
        localStorage.setItem(`fb_customer_name_${sessionParam}`, nameParam);
        sessionStorage.setItem(`fb_customer_name_${sessionParam}`, nameParam);
      }
      return;
    }

    if (!sessionParam) return;
    const storedName = localStorage.getItem(`fb_customer_name_${sessionParam}`) || 
                       sessionStorage.getItem(`fb_customer_name_${sessionParam}`);
    if (storedName) {
      setCustomerName(storedName);
      setNameInputValue(storedName);
      setNameSubmitted(true);
    }
  }, [sessionParam, nameParam]);

  // Normalize Session ID (handles s=79795 and s=SES-79795 gracefully)
  const cleanSessionParam = useMemo(() => {
    if (!sessionParam) return '';
    const s = String(sessionParam).trim();
    return s.startsWith('SES-') ? s : `SES-${s}`;
  }, [sessionParam]);

  // Validate session existence & status with robust fallback lookup
  const currentSession = useMemo(() => {
    if (!sessionParam) return null;
    if (sessions[cleanSessionParam]) return sessions[cleanSessionParam];
    if (sessions[sessionParam]) return sessions[sessionParam];
    if (tableParam) {
      return Object.values(sessions).find(s => Number(s.table_number) === Number(tableParam) && s.status !== 'CLOSED') || null;
    }
    return null;
  }, [sessions, cleanSessionParam, sessionParam, tableParam]);

  const currentTable = useMemo(() => {
    if (!tableParam || !tables) return null;
    return tables.find(t => t.table_number === Number(tableParam));
  }, [tables, tableParam]);

  // Get orders submitted specifically under this session_id
  const sessionOrders = useMemo(() => {
    if (!sessionParam) return [];
    const cleanParam = String(sessionParam).trim();
    return (orders || []).filter(o => {
      if (!o || !o.session_id) return false;
      const sid = String(o.session_id).trim();
      return sid === cleanParam || sid === cleanSessionParam;
    });
  }, [orders, cleanSessionParam, sessionParam]);

  // Track seen cancelled order IDs to avoid duplicate sound alerts
  const seenCancelledOrdersRef = useRef(new Set());

  // Dual-Layer Cancellation Alert Effect (In-App Audio Chime + OS Push Notification)
  useEffect(() => {
    if (!sessionOrders || sessionOrders.length === 0) return;

    sessionOrders.forEach(ord => {
      if (ord.kitchen_status === 'CANCELLED') {
        if (!seenCancelledOrdersRef.current.has(ord.order_id)) {
          seenCancelledOrdersRef.current.add(ord.order_id);

          // Lapisan 1: Play urgent audio alert chime
          playCancellationAlertSound();

          // Lapisan 2: Send OS Lockscreen Push Notification & Vibration
          sendCancellationNotification(tableParam, ord.order_id, ord.kitchen_cancel_reason);

          // Switch view to status tracker so customer immediately sees red alert card
          setViewState('SUBMITTED');
        }
      }
    });
  }, [sessionOrders, tableParam]);

  // Unlock AudioContext on first user interaction
  useEffect(() => {
    const handleUserGesture = () => unlockAudioContext();
    window.addEventListener('click', handleUserGesture, { once: true });
    window.addEventListener('touchstart', handleUserGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
    };
  }, []);

  // Are all orders submitted under this session marked as PAID?
  const areAllOrdersPaid = sessionOrders.length > 0 && sessionOrders.every(o => o.payment_status === 'PAID');

  // Explicit cancellation flag
  const isCancelled = Boolean(currentSession?.is_cancelled);

  // Session is closed if:
  // 1) currentSession status is CLOSED
  // 2) all session orders are PAID
  // 3) session was cancelled
  // 4) table is no longer attached to this sessionParam
  // Session is closed ONLY if currentSession is explicitly CLOSED, cancelled, or all orders are paid
  const isSessionClosed = 
    Boolean(currentSession?.status === 'CLOSED') || 
    Boolean(currentSession?.is_cancelled) ||
    areAllOrdersPaid;

  const overlayBg = isLight ? 'bg-amber-50' : 'bg-[#121417]';
  const overlayTitle = isLight ? 'text-amber-950' : 'text-amber-50';
  const overlaySubtle = isLight ? 'text-amber-800/70' : 'text-amber-500/70';


  // Categories dynamically derived from menuItems so custom categories created in Admin automatically appear
  const categoryConfig = useMemo(() => {
    const knownIcons = {
      'Semua': '✨', 'Ayam': '🍗', 'Nasi': '🍚', 'Western': '🥩',
      'Sampingan': '🍟', 'Minuman': '🥤', 'Pencuci Mulut': '🍨'
    };
    const menuCategories = Array.isArray(menuItems) ? Array.from(new Set(menuItems.map(i => i?.category).filter(Boolean))) : [];

    return [
      { name: 'Semua', icon: '✨' },
      ...(menuCategories || []).map(cat => ({
        name: cat,
        icon: knownIcons[cat] || '🍽️'
      }))
    ];
  }, [menuItems]);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
    return safeMenuItems.filter(item => {
      if (!item) return false;
      const matchCat = activeCategory === 'Semua' || item.category === activeCategory;
      const q = (searchQuery || '').toLowerCase();
      const matchSearch = (item.name || '').toLowerCase().includes(q) ||
                          (item.description || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [menuItems, activeCategory, searchQuery]);

  // Open item option modal
  const handleOpenItemModal = (item) => {
    setSelectedItemForModal(item);
    setModalQty(1);
    setModalItemNote('');
    setModalScrolledToBottom(true);
    // Reset image loaded state — start hidden, show ONLY when image confirms loaded
    setModalImageLoaded(false);

    const groups = getItemOptionGroups(item);
    const initialOpts = {};
    if (groups && groups.length > 0) {
      groups.forEach(grp => {
        if (grp.required && grp.options && grp.options.length > 0) {
          const firstAvail = grp.options.find(opt => !isOptionOutOfStock(item, opt)) || grp.options[0];
          initialOpts[grp.name] = firstAvail; // Select first AVAILABLE option by default ONLY if WAJIB
        } else if (!grp.required) {
          initialOpts[grp.name] = []; // Multi-select array for non-wajib options
        }
      });
    }
    setModalOptions(initialOpts);
  };

  const handleCloseModal = () => {
    setSelectedItemForModal(null);
    setModalQty(1);
  };

  // Scroll handler for modal
  const handleModalScroll = (e) => {
    const target = e.target;
    if (!target) return;
    const isAtBottom = Math.ceil(target.scrollTop + target.clientHeight) >= target.scrollHeight - 25;
    if (isAtBottom) {
      setModalScrolledToBottom(true);
    }
  };

  // Add item from modal to cart (with stock limit check)
  const handleAddToCartFromModal = () => {
    if (!selectedItemForModal) return;

    const availStock = getAvailableStockQty(selectedItemForModal);
    const currentInCart = cart
      .filter(c => (c.id && c.id === selectedItemForModal.id) || c.name === selectedItemForModal.name)
      .reduce((sum, c) => sum + c.quantity, 0);

    const qtyToAdd = modalQty && Number(modalQty) > 0 ? Number(modalQty) : 1;

    if (availStock !== null) {
      if (availStock === 0) {
        alert(`⚠️ Maaf, "${selectedItemForModal.name}" telah HABIS STOK.`);
        return;
      }
      if (currentInCart + qtyToAdd > availStock) {
        alert(`⚠️ Stok "${selectedItemForModal.name}" hanya tinggal ${availStock} unit sahaja. (Sudah ada ${currentInCart} unit dalam troli).`);
        return;
      }
    }

    // Filter out empty or unselected options
    const cleanOptions = {};
    if (modalOptions) {
      Object.entries(modalOptions).forEach(([grpName, optVal]) => {
        if (Array.isArray(optVal)) {
          const filtered = optVal.filter(v => v && String(v).trim());
          if (filtered.length > 0) {
            cleanOptions[grpName] = filtered;
          }
        } else if (optVal && String(optVal).trim()) {
          cleanOptions[grpName] = optVal;
        }
      });
    }

    const unitPrice = getItemUnitPrice(selectedItemForModal, cleanOptions);
    const cartItemId = `${selectedItemForModal.id}-${JSON.stringify(cleanOptions)}-${modalItemNote}`;
    
    const existingIndex = cart.findIndex(c => c.cartItemId === cartItemId);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += qtyToAdd;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          ...selectedItemForModal,
          price: unitPrice,
          cartItemId,
          quantity: qtyToAdd,
          selectedOptions: cleanOptions,
          itemNote: modalItemNote
        }
      ]);
    }

    setSelectedItemForModal(null);
    setModalQty(1);
  };

  // Cart quantity controls (with stock quantity limit validation)
  const handleUpdateCartQty = (cartItemId, delta) => {
    if (delta > 0) {
      const targetItem = cart.find(c => c.cartItemId === cartItemId);
      if (targetItem) {
        const availStock = getAvailableStockQty(targetItem);
        const currentTotalInCart = cart
          .filter(c => (c.id && c.id === targetItem.id) || c.name === targetItem.name)
          .reduce((sum, c) => sum + c.quantity, 0);

        if (availStock !== null) {
          if (availStock === 0) {
            alert(`⚠️ Maaf, "${targetItem.name}" telah HABIS STOK.`);
            return;
          }
          if (currentTotalInCart + delta > availStock) {
            alert(`⚠️ Baki stok "${targetItem.name}" hanya tinggal ${availStock} unit sahaja.`);
            return;
          }
        }
      }
    }

    setCart(cart.map(item => {
      if (item.cartItemId === cartItemId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const handleRemoveCartItem = (cartItemId) => {
    setCart(cart.filter(item => item.cartItemId !== cartItemId));
  };

  const formatSelectedOptions = (opts) => {
    if (!opts) return '';
    if (typeof opts === 'string') return opts;
    if (Array.isArray(opts)) return opts.join(', ');
    if (typeof opts === 'object') return Object.values(opts).filter(Boolean).join(', ');
    return String(opts);
  };

  const getItemOptionGroups = (item) => {
    if (!item || !item.optionGroups) return [];
    if (Array.isArray(item.optionGroups)) return item.optionGroups;
    if (typeof item.optionGroups === 'string') {
      try {
        const parsed = JSON.parse(item.optionGroups);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const getItemUnitPrice = (item, selectedOptions) => {
    if (!item) return 0;
    let total = Number(item.price) || 0;
    if (selectedOptions && typeof selectedOptions === 'object') {
      Object.values(selectedOptions).forEach(optVal => {
        if (Array.isArray(optVal)) {
          optVal.forEach(val => {
            if (typeof val === 'string') {
              const match = val.match(/\(\+RM\s*([\d.]+)\)/i);
              if (match) {
                total += parseFloat(match[1]) || 0;
              }
            }
          });
        } else if (typeof optVal === 'string') {
          const match = optVal.match(/\(\+RM\s*([\d.]+)\)/i);
          if (match) {
            total += parseFloat(match[1]) || 0;
          }
        }
      });
    }
    return total;
  };

  const hasItemOptionGroups = (item) => {
    const groups = getItemOptionGroups(item);
    return groups.length > 0 && groups.some(g => g.options && g.options.length > 0);
  };

  // Compute Top 3 Food & Top 3 Drink Items dynamically based on order sales frequency
  const recommendedItemIds = useMemo(() => {
    const foodCounts = {};
    const drinkCounts = {};

    if (Array.isArray(orders) && orders.length > 0) {
      orders.forEach(ord => {
        if (ord.kitchen_status === 'CANCELLED') return;
        const rawItems = ord.items;
        let itemsList = [];
        if (Array.isArray(rawItems)) {
          itemsList = rawItems;
        } else if (typeof rawItems === 'string') {
          try { itemsList = JSON.parse(rawItems); } catch (e) { itemsList = []; }
        }
        if (!Array.isArray(itemsList)) return;
        
        itemsList.forEach(it => {
          const id = it.id || it.itemId || it.name;
          const qty = Number(it.quantity) || 1;
          const cat = (it.category || '').toLowerCase();
          const name = (it.name || '').toLowerCase();

          const isDrink = cat.includes('minum') || cat.includes('air') || cat.includes('kopi') || cat.includes('teh') ||
                          name.includes('teh') || name.includes('kopi') || name.includes('milo') || name.includes('jus') ||
                          name.includes('air') || name.includes('sirap') || name.includes('barli');

          if (isDrink) {
            drinkCounts[id] = (drinkCounts[id] || 0) + qty;
          } else {
            foodCounts[id] = (foodCounts[id] || 0) + qty;
          }
        });
      }	);
    }

    const topFood = Object.entries(foodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);

    const topDrink = Object.entries(drinkCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);

    // Fallback if no order history exists yet: pick top 3 items from food & drink menu categories
    let finalFood = topFood;
    let finalDrink = topDrink;

    if (finalFood.length === 0 && Array.isArray(menuItems)) {
      const foodMenu = menuItems.filter(i => {
        const cat = (i.category || '').toLowerCase();
        return !cat.includes('minum') && !cat.includes('air') && !cat.includes('kopi') && !cat.includes('teh');
      });
      finalFood = foodMenu.slice(0, 3).map(i => i.id || i.name);
    }

    if (finalDrink.length === 0 && Array.isArray(menuItems)) {
      const drinkMenu = menuItems.filter(i => {
        const cat = (i.category || '').toLowerCase();
        return cat.includes('minum') || cat.includes('air') || cat.includes('kopi') || cat.includes('teh');
      });
      finalDrink = drinkMenu.slice(0, 3).map(i => i.id || i.name);
    }

    return new Set([...finalFood, ...finalDrink]);
  }, [orders, menuItems]);

  // Cart totals
  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Submit Name Handler
  const handleNameSubmit = (e) => {
    e.preventDefault();
    const trimmed = nameInputValue.trim();
    if (trimmed.length < 2) return;
    const formatted = trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
    setCustomerName(formatted);
    setNameSubmitted(true);
    if (sessionParam) {
      localStorage.setItem(`fb_customer_name_${sessionParam}`, formatted);
      sessionStorage.setItem(`fb_customer_name_${sessionParam}`, formatted);
    }
    // Gently request notification permission for system alert notifications
    requestNotificationPermission();
  };

  // Submit Order Handler (With Strict Pre-Submit Stock Validation & Confetti)
  const handleSendOrderToKitchen = async () => {
    if (cart.length === 0 || !tableParam || !sessionParam) return;
    if (isSessionClosed) {
      alert('Sesi pesanan untuk meja ini telah dibatalkan atau ditutup oleh kaunter.');
      return;
    }
    if (!orderType) {
      alert('⚠️ Sila pilih Jenis Pesanan (Makan Di Sini atau Bungkus) terlebih dahulu.');
      return;
    }

    // CHECK FREE PLAN ORDER LIMIT (100 orders per 4-month cycle)
    if (isFreePlan(tenant)) {
      const { cycleStart, cycleEnd } = getSubscriptionCycleInfo(tenant?.created_at);
      const usedOrders = getCycleOrdersCount(orders, tenant?.id, cycleStart);

      if (usedOrders >= FREE_PLAN_LIMIT) {
        setQuotaCountdown(formatCountdown(cycleEnd));
        setIsQuotaExceededModalOpen(true);
        return;
      }
    }

    // STRICT PRE-SUBMIT STOCK VALIDATION CHECK
    const stockErrors = [];
    cart.forEach(cartItem => {
      const availStock = getAvailableStockQty(cartItem);
      if (availStock !== null) {
        if (availStock === 0) {
          stockErrors.push(`"${cartItem.name}" telah HABIS STOK.`);
        } else {
          const totalOrdered = cart
            .filter(c => (c.id && c.id === cartItem.id) || c.name === cartItem.name)
            .reduce((sum, c) => sum + c.quantity, 0);
          if (totalOrdered > availStock) {
            stockErrors.push(`"${cartItem.name}" (Kuantiti dipesan: ${totalOrdered}, Baki stok: ${availStock}).`);
          }
        }
      }
    });

    if (stockErrors.length > 0) {
      alert(`⚠️ PESANAN DITOLAK KERANA MASALAH STOK!\n\n${stockErrors.join('\n')}\n\nSila keluarkan atau kurangkan kuantiti item berkenaan dari troli.`);
      return;
    }

    setIsSubmitting(true);
    const result = await submitOrder(sessionParam, tableParam, cart, overallNote, orderType, customerName);
    setIsSubmitting(false);

    if (!result || result.success === false) {
      if (result && result.error === 'FREE_PLAN_LIMIT_REACHED') {
        alert('MAAF! Restoran ini telah mencapai had maksimum pesanan percuma. Sila hubungi pelayan/kaunter untuk membuat pesanan secara manual.');
      } else {
        alert(`Pesanan Gagal: ${result?.error || result?.message || 'Sila semak sambungan internet anda.'}`);
      }
      // ORDER BLOCKED DUE TO STOCK ISSUE OR CLOSED SESSION OR QUOTA!
      // Keep customer in Cart Drawer / Checkout Page so they can edit cart!
      // Do NOT clear cart, do NOT setViewState('SUBMITTED')!
      return;
    }

    // Ensure notification permission is requested
    requestNotificationPermission();

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.log('Confetti triggered');
    }

    setCart([]);
    setOverallNote('');
    setOrderType(null);
    setIsCartOpen(false);
    setViewState('SUBMITTED');
  };

  // Theme-aware Dynamic Classes
  const bgPage = isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100';
  const bgCard = isLight ? 'bg-white border-slate-200 shadow-md' : 'bg-slate-900 border-slate-800/80 shadow-xl';
  const bgHeader = isLight ? 'bg-white/90 border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-900/90 border-slate-800/80 text-white shadow-xl';
  const bgInput = isLight ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-rose-500 shadow-sm' : 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-rose-500';
  const textTitle = isLight ? 'text-slate-900' : 'text-white';
  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const textSubtle = isLight ? 'text-slate-700' : 'text-slate-300';
  const bgSubCard = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/60';
  const bgModal = isLight ? 'bg-white border-slate-200 text-slate-900 shadow-2xl' : 'bg-slate-900 border-slate-800 text-slate-100 shadow-2xl';
  const bgDrawerHeader = isLight ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-800/80 border-slate-700/60 text-white';
  const bgDrawerFooter = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800';

  // Invalid or Missing Session URL Guard
  if (!tableParam || !sessionParam) {
    return (
      <div className={`min-h-screen ${bgPage} flex items-center justify-center p-6 font-sans transition-colors duration-300`}>
        <div className={`${bgCard} rounded-3xl p-8 max-w-md w-full text-center space-y-6`}>
          <div className="h-16 w-16 bg-rose-500/20 border border-rose-500/30 text-rose-500 rounded-3xl flex items-center justify-center mx-auto text-2xl">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className={`text-xl font-bold ${textTitle}`}>Sesi Pesanan Tidak Sah</h2>
            <p className={`text-sm ${textMuted}`}>
              Parameter meja atau Session ID tidak dijumpai dalam URL.
            </p>
          </div>
          <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-xs text-rose-600 dark:text-rose-300 font-medium">
            Sila minta imbasan QR Code baharu daripada juruwang di kaunter untuk memulakan pesanan anda.
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REQUIREMENT 2: SESI TAMAT / DIBATALKAN SCREEN (BAYARAN SELESAI)
  // -------------------------------------------------------------
  if (isSubmitting) {
    return (
      <div className={`min-h-screen ${overlayBg} flex flex-col items-center justify-center p-6 text-center z-50 fixed inset-0 font-sans`}>
        <div className="w-24 h-24 mb-6 relative">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700"></div>
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
        </div>
        <h2 className={`text-2xl font-extrabold ${overlayTitle} mb-2 animate-pulse`}>Memproses Pesanan...</h2>
        <p className={overlaySubtle}>Sila tunggu sebentar sementara pesanan anda disahkan.</p>
      </div>
    );
  }

  if (isSessionClosed) {
    const validSessionOrders = sessionOrders.filter(o => o.kitchen_status !== 'CANCELLED');
    const totalPaid = validSessionOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const isVoid = isCancelled || (sessionOrders.length === 0 && currentSession?.status === 'CLOSED');

    return (
      <div className={`min-h-screen ${bgPage} flex items-center justify-center p-6 font-sans transition-colors duration-300`}>
        <div className={`${bgCard} rounded-3xl p-8 max-w-md w-full text-center space-y-6 animate-fadeIn`}>
          
          <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg ${
            isVoid 
              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-500 shadow-rose-500/20' 
              : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 shadow-emerald-500/20 animate-bounce'
          }`}>
            {isVoid ? <ShieldAlert className="w-10 h-10" /> : <CheckCircle className="w-10 h-10" />}
          </div>

          <div className="space-y-2">
            <span className={`px-3 py-1 font-mono text-xs font-bold rounded-full border inline-block ${
              isVoid 
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
            }`}>
              {isVoid ? 'SESI DIBATALKAN / TIDAK AKTIF' : 'BAYARAN SELESAI'}
            </span>
            <h2 className={`text-2xl font-extrabold ${textTitle}`}>
              {isVoid ? 'Sesi Telah Ditutup' : 'Terima Kasih!'}
            </h2>
            <p className={`text-sm ${textSubtle} font-medium`}>
              Sesi untuk <strong className={isVoid ? 'text-rose-500' : 'text-emerald-500'}>MEJA {tableParam}</strong> telah {isVoid ? 'dibatalkan oleh kaunter' : 'selesai'}.
            </p>
          </div>

          <div className={`${bgSubCard} p-4 rounded-2xl space-y-3 text-left font-mono text-xs ${textSubtle}`}>
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className={textMuted}>Session ID:</span>
              <span className={`font-bold ${textTitle}`}>{sessionParam}</span>
            </div>
            {!isVoid && (
              <div className="flex justify-between items-center pt-1 text-sm">
                <span className={`font-sans font-bold ${textTitle}`}>Jumlah Dibayar:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-base font-mono">RM {totalPaid.toFixed(2)}</span>
              </div>
            )}
          </div>

          <p className={`text-xs ${textMuted}`}>
            {isVoid 
              ? 'Sila minta imbasan QR Code baharu daripada juruwang di kaunter untuk memulakan pesanan.' 
              : 'Terima kasih atas kunjungan anda! Jumpa lagi di masa akan datang.'}
          </p>

          {/* GELUNG MAKLUM BALAS PELANGGAN 👍/👎 */}
          {!isVoid && (
            <ModuleErrorBoundary moduleName="Gelung Maklum Balas Pelanggan">
              <CustomerFeedbackWidget
                sessionOrders={validSessionOrders}
                tableParam={tableParam}
                customerName={customerName}
                submitCustomerFeedback={submitCustomerFeedback}
              />
            </ModuleErrorBoundary>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // SKRIN INPUT NAMA PELANGGAN (Sebelum Akses Menu)
  // ----------------------------------------------------------------
  if (!nameSubmitted) {
    const customBanner = receiptSettings?.welcomeBannerUrl;

    if (customerTemplate === 'kopitiam') {
      return (
        <div className="min-h-screen bg-terrazzo flex flex-col items-center justify-center p-4 sm:p-6 font-worksans relative text-[#22262B]">
          {/* Top Meta Chip */}
          <div className="absolute top-4 right-4 z-20">
            <span className="font-spacemono text-[11px] font-bold tracking-wide bg-[#22262B] text-[#EDE7D8] px-3 py-1 rounded-full shadow-md">
              MEJA {tableParam}
            </span>
          </div>

          {/* Card Frame: Split into TOP (Gambar) & BOTTOM (Selamat Datang + Input) */}
          <div className="w-full max-w-sm bg-[#FAF7EF] rounded-3xl overflow-hidden shadow-2xl border border-black/10 flex flex-col animate-fadeIn relative z-10">
            {/* BAHAGIAN ATAS: Gambar Banner (Custom Upload / Fallback) */}
            <div className="w-full h-48 sm:h-52 bg-[#E3DBC7] relative overflow-hidden flex items-center justify-center border-b border-black/10">
              {customBanner ? (
                <img
                  src={resolveImageUrl(customBanner)}
                  alt="Selamat Datang Banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1F5B4A] to-[#163F35] flex flex-col items-center justify-center p-6 text-center text-[#EDE7D8] relative">
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                  <span className="text-4xl mb-1">🍵</span>
                  <span className="font-zilla font-bold text-xl tracking-wide">MEJA KOPITIAM</span>
                  <span className="font-spacemono text-[10px] text-[#D9A441] mt-1 tracking-widest uppercase">Pesanan Dapur Tradisi</span>
                </div>
              )}
            </div>

            {/* BAHAGIAN BAWAH: Selamat Datang + Input Nama */}
            <div className="p-6 sm:p-7 text-center space-y-5">
              <div>
                <h1 className="font-zilla text-3xl font-bold text-[#22262B] leading-tight">Selamat Datang</h1>
                <p className="text-xs text-[#6B6F66] mt-1.5 leading-relaxed max-w-[260px] mx-auto">
                  Sila masukkan nama anda untuk mula lihat menu &amp; membuat pesanan.
                </p>
              </div>

              <form onSubmit={handleNameSubmit} className="space-y-4 text-left">
                <div>
                  <label htmlFor="nameInputKopitiam" className="font-spacemono text-[10.5px] font-bold text-[#6B6F66] uppercase tracking-wider block mb-2">
                    NAMA ANDA
                  </label>
                  <input
                    id="nameInputKopitiam"
                    type="text"
                    value={nameInputValue}
                    onChange={(e) => setNameInputValue(e.target.value)}
                    placeholder="cth: Haziq"
                    maxLength={40}
                    autoFocus
                    className="w-full px-4 py-3.5 text-lg font-zilla font-semibold border-2 border-black/15 rounded-2xl bg-[#FAF7EF] text-[#22262B] outline-none focus:border-[#1F5B4A] transition"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={nameInputValue.trim().length < 2}
                  className="w-full py-4 border-none rounded-2xl bg-[#22262B] text-[#EDE7D8] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition transform active:scale-95"
                >
                  <span>Teruskan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={`min-h-screen ${bgPage} flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden transition-colors duration-300`}>
        
        {/* Theme Mode Toggle Button on Top Right */}
        <button
          onClick={toggleTheme}
          className={`absolute top-4 right-4 z-20 p-2.5 rounded-2xl border transition shadow-md flex items-center gap-2 text-xs font-bold ${
            isLight ? 'bg-white/90 backdrop-blur-md border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-slate-900/90 backdrop-blur-md border-slate-800 text-amber-400 hover:bg-slate-800'
          }`}
          title="Tukar Tema (Light/Dark)"
        >
          {isLight ? <Moon className="w-4 h-4 text-indigo-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
          <span>{isLight ? 'Dark' : 'Light'}</span>
        </button>

        {/* Background Ambient Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
        </div>

        {/* Card Frame: Split into TOP (Gambar) & BOTTOM (Selamat Datang + Input) */}
        <div className={`${bgCard} backdrop-blur-xl rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col animate-fadeIn relative z-10`}>
          
          {/* BAHAGIAN ATAS: Gambar Banner (Custom Upload / Fallback) */}
          <div className="w-full h-48 sm:h-52 bg-slate-900 relative overflow-hidden flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
            {customBanner ? (
              <img
                src={resolveImageUrl(customBanner)}
                alt="Selamat Datang Banner"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-rose-600 via-amber-600 to-amber-500 flex flex-col items-center justify-center p-6 text-center text-slate-950 relative">
                <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                <span className="text-4xl mb-1">🍽️</span>
                <span className="font-black text-xl tracking-tight text-white drop-shadow">RESTORAN RASA SELERA</span>
                <span className="font-mono text-[10px] text-amber-200 font-bold uppercase tracking-widest mt-1">Sistem Pesanan Pintar</span>
              </div>
            )}
          </div>

          {/* BAHAGIAN BAWAH: Selamat Datang + Input Nama */}
          <div className="p-6 sm:p-7 text-center space-y-5">
            <div>
              <h2 className={`text-2xl sm:text-3xl font-black ${textTitle} tracking-tight`}>Selamat Datang!</h2>
              <p className={`text-xs ${textMuted} mt-1.5 leading-relaxed`}>
                Sila masukkan nama anda untuk memulakan pesanan.
              </p>
              <div className={`inline-flex items-center gap-2 px-3 py-1 ${bgSubCard} rounded-full text-xs font-mono mt-3`}>
                <span className="text-rose-600 dark:text-rose-400 font-extrabold">MEJA {tableParam}</span>
                <span className={textMuted}>•</span>
                <span className={textSubtle}>{sessionParam}</span>
              </div>
            </div>

            {/* Name Input Form */}
            <form onSubmit={handleNameSubmit} className="space-y-4 text-left">
              <div className="space-y-2">
                <label htmlFor="nameInputModern" className={`text-xs font-bold ${textSubtle} flex items-center gap-1.5`}>
                  <User className="w-4 h-4 text-rose-500" />
                  Nama / Panggilan Anda
                </label>
                <input
                  id="nameInputModern"
                  type="text"
                  value={nameInputValue}
                  onChange={(e) => setNameInputValue(e.target.value)}
                  placeholder="Contoh: Haziq, Nur Alia, Johan..."
                  maxLength={40}
                  autoFocus
                  className={`w-full ${bgInput} border-2 border-transparent focus:border-rose-500 rounded-2xl px-4 py-3.5 text-sm font-semibold ${textTitle} outline-none transition placeholder-slate-500`}
                  required
                />
                {nameInputValue.trim().length > 0 && nameInputValue.trim().length < 2 && (
                  <p className="text-[11px] text-amber-500 font-mono">Nama sekurang-kurangnya 2 aksara.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={nameInputValue.trim().length < 2}
                className="w-full py-4 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-rose-600/25 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Teruskan ke Menu</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // REKA BENTUK TEMPLATE: MEJA KOPITIAM DOCKET (TERRAZZO KLASIK)
  // ----------------------------------------------------------------
  if (customerTemplate === 'kopitiam') {
    const categoriesList = (categoryConfig || []).map(c => c?.name).filter(Boolean);
    const filteredKopitiamItems = filteredMenuItems || [];

    const getKopitiamCategoryBg = (catName = '') => {
      const c = catName.toLowerCase();
      if (c.includes('minum') || c.includes('air') || c.includes('kopi') || c.includes('teh')) return '#163F35';
      if (c.includes('snek') || c.includes('sampingan') || c.includes('goreng') || c.includes('western')) return '#B37F2B';
      if (c.includes('pencuci') || c.includes('dessert') || c.includes('ais')) return '#A23B2E';
      return '#1F5B4A';
    };

    const getCategoryEmoji = (item) => {
      if (!item) return '🍽️';
      const cat = (item.category || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      if (name.includes('nasi lemak') || name.includes('rendang')) return '🍛';
      if (name.includes('ayam')) return '🍗';
      if (name.includes('mee') || name.includes('kuey') || name.includes('bihun')) return '🍜';
      if (name.includes('nasi')) return '🍚';
      if (name.includes('keropok') || name.includes('cucur')) return '🥟';
      if (name.includes('pisang') || name.includes('goreng')) return '🍌';
      if (name.includes('teh')) return '🥤';
      if (name.includes('kopi')) return '☕';
      if (name.includes('milo')) return '🧋';
      if (name.includes('bandung') || name.includes('jus')) return '🍹';
      if (name.includes('limau')) return '🍋';
      if (name.includes('cendol') || name.includes('ais')) return '🍧';
      if (cat.includes('minum')) return '🥤';
      if (cat.includes('pencuci')) return '🍨';
      return '🍽️';
    };

    return (
      <div className="min-h-screen bg-terrazzo flex flex-col font-worksans text-[#22262B] relative pb-24 selection:bg-[#1F5B4A] selection:text-white">
        
        {/* TOP META HEADER */}
        <header className="bg-[#EDE7D8]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5 border-b border-black/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-spacemono text-[11px] font-bold tracking-wide bg-[#22262B] text-[#EDE7D8] px-2.5 py-1 rounded-full">
              MEJA {tableParam}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {sessionOrders.length > 0 && (
              <button
                onClick={() => setViewState(viewState === 'SUBMITTED' ? null : 'SUBMITTED')}
                className={`px-3 py-1.5 rounded-full text-xs font-spacemono font-bold flex items-center gap-1.5 border transition shadow cursor-pointer ${
                  viewState === 'SUBMITTED' 
                    ? 'bg-[#A23B2E] text-white border-[#7C2C22]' 
                    : 'bg-[#FAF7EF] text-[#22262B] border-black/15 hover:bg-[#E3DBC7]'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-[#D9A441] animate-pulse" />
                <span>Status ({sessionOrders.length})</span>
              </button>
            )}
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-5 space-y-4">

          {/* ===================================================================== */}
          {/* TRACKING VIEW: DOCKET TICKET CARDS */}
          {/* ===================================================================== */}
          {viewState === 'SUBMITTED' ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="pt-2 pb-1">
                <h2 className="font-zilla text-2xl font-bold text-[#22262B]">Status Pesanan Anda</h2>
                <p className="text-xs text-[#6B6F66] mt-0.5">Kami akan kemaskini secara langsung di sini.</p>
              </div>

              {/* Pre-Pay Payment Notice Banner */}
              {sessionOrders.some(o => o.kitchen_status === 'PAYMENT_PENDING') && (
                <div className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 sm:p-5 text-[#22262B] space-y-3 shadow-md animate-fadeIn">
                  <div className="flex items-center gap-2 text-rose-600 font-extrabold text-sm border-b border-rose-200 pb-2">
                    <span className="text-lg">💳</span>
                    <span>SILA BUAT BAYARAN DI KAUNTER</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    Pesanan anda telah diterima dan sedang <strong>menunggu bayaran</strong> di kaunter. Sila sebut <strong>MEJA {tableParam}</strong> atau tunjukkan skrin ini kepada juruwang untuk mula masak di dapur.
                  </p>

                  {(() => {
                    const pendingOrders = sessionOrders.filter(o => o.kitchen_status === 'PAYMENT_PENDING');
                    const pendingSubtotal = pendingOrders.reduce((ordSum, o) => {
                      const uncancelled = getSafeItems(o.items).filter(i => !i.cancelled);
                      return ordSum + uncancelled.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                    }, 0);

                    const pendingItemCount = pendingOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                    const pendingTotals = calculateReceiptTotals(pendingSubtotal, receiptSettings, {
                      isTakeaway: pendingOrders.some(o => o.order_type === 'TAKEAWAY'),
                      itemCount: pendingItemCount
                    });

                    return (
                      <div className="bg-[#FAF7EF] border border-rose-300 rounded-xl p-3 space-y-1.5 font-spacemono text-xs">
                        <div className="flex justify-between items-center text-slate-600 text-[11px]">
                          <span>Pesanan Belum Dibayar ({pendingOrders.length} Draf):</span>
                          <span className="text-rose-600 font-bold">{pendingItemCount} item</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-rose-200 text-xs font-bold text-[#22262B]">
                          <span>JUMLAH DIPERLUKAN DI KAUNTER:</span>
                          <span className="text-rose-600 font-black text-base">RM {pendingTotals.grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* OVERALL PAYMENT SUMMARY CARD (100% MATCHING STRUCTURE FROM MODERN DYNAMIC) */}
              {sessionOrders.length > 0 && (() => {
                const validOrders = sessionOrders.filter(o => o.kitchen_status !== 'CANCELLED');
                
                const activeSubtotal = validOrders.reduce((ordSum, o) => {
                  const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                  return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                }, 0);

                const takeawayOrders = validOrders.filter(o => o.order_type === 'TAKEAWAY');
                const hasTakeaway = takeawayOrders.length > 0;
                
                const takeawaySubtotal = takeawayOrders.reduce((ordSum, o) => {
                  const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                  return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                }, 0);

                const takeawayItemCount = takeawayOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
                const totalItemsCount = validOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                const activeTotals = calculateReceiptTotals(activeSubtotal, receiptSettings, {
                  isTakeaway: hasTakeaway,
                  itemCount: totalItemsCount,
                  takeawayItemCount,
                  takeawaySubtotal
                });

                return (
                  <div className="bg-[#FAF7EF] rounded-2xl p-4 sm:p-5 border-2 border-[#163F35]/30 space-y-2.5 font-spacemono text-xs text-[#22262B] shadow-md">
                    <div className="font-zilla font-bold text-sm text-[#163F35] border-b border-black/10 pb-2 flex items-center justify-between">
                      <span>RINGKASAN BAYARAN</span>
                      <span className="text-xs font-spacemono text-[#6B6F66]">{validOrders.length} Pesanan</span>
                    </div>

                    <div className="flex justify-between items-center text-[#6B6F66]">
                      <span>Subtotal ({validOrders.length} Pesanan):</span>
                      <span className="font-bold text-[#22262B]">RM {activeSubtotal.toFixed(2)}</span>
                    </div>

                    {activeTotals.enableSst && (
                      <div className="flex justify-between items-center text-[#6B6F66]">
                        <span>SST ({activeTotals.sstRate}%):</span>
                        <span className="font-bold text-[#22262B]">RM {activeTotals.sstAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {activeTotals.enableServiceCharge && (
                      <div className="flex justify-between items-center text-[#6B6F66]">
                        <span>Cas Servis ({activeTotals.serviceChargeRate}%):</span>
                        <span className="font-bold text-[#22262B]">RM {activeTotals.serviceChargeAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {activeTotals.enableCustomCharge && (
                      <div className="flex justify-between items-center text-[#6B6F66]">
                        <span>{activeTotals.customChargeName}:</span>
                        <span className="font-bold text-[#22262B]">RM {activeTotals.customChargeFinal.toFixed(2)}</span>
                      </div>
                    )}

                    {activeTotals.enableTakeawayCharge && activeTotals.isTakeaway && activeTotals.takeawayChargeFinal > 0 && (
                      <div className="flex justify-between items-center text-[#B37F2B] font-bold bg-[#F3E3C0]/60 p-2 rounded-xl border border-[#B37F2B]/30">
                        <span>🛍️ Cas Bungkus ({activeTotals.takeawayChargeType === 'RM' ? `RM ${activeTotals.takeawayChargeAmountVal.toFixed(2)}${activeTotals.takeawayItemCount > 1 ? ` x ${activeTotals.takeawayItemCount}` : ''}` : `${activeTotals.takeawayChargeAmountVal}%`}):</span>
                        <span>+ RM {activeTotals.takeawayChargeFinal.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-black/10 font-zilla font-bold text-sm sm:text-base text-[#163F35]">
                      <span>JUMLAH KESELURUHAN:</span>
                      <span className="font-spacemono text-base sm:text-lg font-black text-[#163F35]">RM {activeTotals.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {sessionOrders.length === 0 ? (
                <div className="text-center text-[#9B9D8F] text-xs py-10 bg-[#FAF7EF] rounded-2xl border border-black/10">
                  Belum ada pesanan lagi.
                </div>
              ) : (
                <div className="space-y-4">
                  {sessionOrders.map((ord, idx) => {
                    const isCancelled = ord.kitchen_status === 'CANCELLED';
                    const isPaymentPending = ord.kitchen_status === 'PAYMENT_PENDING';
                    const isCooking = ord.kitchen_status === 'COOKING';
                    const isServed = ord.kitchen_status === 'SERVED';
                    const isReady = ord.kitchen_status === 'READY' || isServed;

                    const borderLeftColor = isCancelled ? 'border-l-[#A23B2E] bg-[#F0D8D3]/50' :
                                            isPaymentPending ? 'border-l-rose-500 bg-rose-50/60' :
                                            isReady ? 'border-l-[#163F35]' :
                                            isCooking ? 'border-l-[#1F5B4A]' :
                                            'border-l-[#D9A441]';

                    const statusDotColor = isCancelled ? 'bg-[#A23B2E]' :
                                           isPaymentPending ? 'bg-rose-500 animate-pulse' :
                                           isReady ? 'bg-[#163F35]' :
                                           isCooking ? 'bg-[#1F5B4A]' :
                                           'bg-[#D9A441]';

                    const statusLabel = isCancelled ? 'Dibatalkan' :
                                        isPaymentPending ? 'Menunggu Bayaran Kaunter 💳' :
                                        isServed ? 'Siap & Dihidangkan ✅' :
                                        isReady ? 'Siap!' :
                                        isCooking ? 'Sedang Dimasak' :
                                        'Menunggu';

                    const statusMsg = isCancelled ? (ord.kitchen_cancel_reason ? `Sebab: ${ord.kitchen_cancel_reason}` : 'Pesanan dibatalkan oleh dapur.') :
                                      isPaymentPending ? 'Sila ke kaunter untuk membuat bayaran. Sila sebut No. Meja anda atau tunjukkan skrin ini.' :
                                      isServed ? 'Makanan siap & telah dihidangkan ke meja anda.' :
                                      isReady ? 'Makanan siap! Dalam perjalanan ke meja anda.' :
                                      isCooking ? 'Dapur sedang menyiapkan makanan anda.' :
                                      'Pesanan telah diterima oleh dapur.';

                    const stepRank = isReady ? 2 : isCooking ? 1 : 0;
                    const timeStr = formatSafeOrderTime(ord);

                    return (
                      <div
                        key={ord.order_id}
                        className={`bg-[#FAF7EF] rounded-2xl p-4 sm:p-5 shadow-sm border-l-4 ${borderLeftColor} relative border-t border-r border-b border-black/10 animate-fadeIn`}
                      >
                        {/* Docket Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-spacemono font-bold text-xs text-[#22262B] tracking-wide">
                            PESANAN #{sessionOrders.length - idx} ({ord.order_id})
                          </span>
                          <span className="font-spacemono text-[11px] text-[#6B6F66] bg-[#E3DBC7] px-2 py-0.5 rounded">
                            {timeStr}
                          </span>
                        </div>

                        {/* Dashed Docket Divider with Punch-hole Circular Cutouts */}
                        <div className="kopitiam-docket-divider" />

                        {/* Status Label & Indicator */}
                        <div className="flex items-start gap-2.5 my-1">
                          <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${statusDotColor}`} />
                          <div>
                            <div className="font-zilla font-bold text-base text-[#22262B]">{statusLabel}</div>
                            <div className="text-xs text-[#6B6F66] mt-0.5">{statusMsg}</div>
                          </div>
                        </div>

                        {/* Progress Stepper Bar (if active) */}
                        {!isCancelled && (
                          <div className="my-3 space-y-1">
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full shrink-0 ${stepRank >= 0 ? 'bg-[#1F5B4A]' : 'bg-black/15'}`} />
                              <div className={`flex-1 h-1 ${stepRank >= 1 ? 'bg-[#1F5B4A]' : 'bg-black/15'}`} />
                              <div className={`w-3 h-3 rounded-full shrink-0 ${stepRank >= 1 ? 'bg-[#1F5B4A]' : 'bg-black/15'}`} />
                              <div className={`flex-1 h-1 ${stepRank >= 2 ? 'bg-[#1F5B4A]' : 'bg-black/15'}`} />
                              <div className={`w-3 h-3 rounded-full shrink-0 ${stepRank >= 2 ? 'bg-[#163F35]' : 'bg-black/15'}`} />
                            </div>
                            <div className="flex justify-between font-spacemono text-[9.5px] text-[#9B9D8F] uppercase tracking-wider">
                              <span>Menunggu</span>
                              <span>Memasak</span>
                              <span>Siap</span>
                            </div>
                          </div>
                        )}

                        {/* Order Line Items Summary */}
                        <div className="mt-3 space-y-1 text-xs text-[#22262B] pt-2 border-t border-black/10">
                          {getSafeItems(ord.items).map((it, i) => {
                            const isItemCancelled = it.cancelled === true;
                            return (
                              <div key={i} className={`flex justify-between items-start text-xs p-1.5 rounded-lg transition ${isItemCancelled ? 'opacity-70 bg-[#F0D8D3]/40 border border-[#A23B2E]/30' : ''}`}>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`font-bold ${isItemCancelled ? 'line-through text-[#6B6F66]' : 'text-[#22262B]'}`}>
                                      {it.quantity}x {it.name}
                                    </span>
                                    {isItemCancelled && (
                                      <span className="bg-[#A23B2E] text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                                        Dibatalkan ❌
                                      </span>
                                    )}
                                  </div>
                                  {it.options && (
                                    <p className={`text-[11px] text-[#6B6F66] italic ${isItemCancelled ? 'line-through' : ''}`}>
                                      ↳ {it.options}
                                    </p>
                                  )}
                                  {isItemCancelled && it.cancel_reason && (
                                    <p className="text-[10px] text-[#A23B2E] italic font-medium">
                                      Sebab: {it.cancel_reason}
                                    </p>
                                  )}
                                </div>
                                <span className={`font-spacemono font-bold ${isItemCancelled ? 'line-through text-[#A23B2E] opacity-80' : 'text-[#163F35]'}`}>
                                  RM {((Number(it.price) || 0) * (Number(it.quantity) || 1)).toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                          {ord.special_notes && (
                            <div className="text-[11px] text-[#A23B2E] italic pt-1">
                              Nota: {ord.special_notes}
                            </div>
                          )}
                        </div>

                        {/* Round Total for this order */}
                        {(() => {
                          const orderUncancelledSum = getSafeItems(ord.items)
                            .filter(it => !it.cancelled)
                            .reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
                          return (
                            <div className="font-spacemono font-bold text-xs text-[#163F35] mt-3 pt-2 border-t border-black/10 flex justify-between items-center">
                              <span>Jumlah Pesanan Ini:</span>
                              <span className="text-sm font-black">RM {orderUncancelledSum.toFixed(2)}</span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add More Items Button */}
              <button
                onClick={() => setViewState(null)}
                className="w-full py-4 border-none rounded-2xl bg-[#22262B] text-[#EDE7D8] font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg hover:bg-black transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Pesanan Baharu</span>
              </button>
            </div>
          ) : (

            /* ===================================================================== */
            /* CATALOG VIEW: MENU SEARCH, TABS & DISH CARDS */
            /* ===================================================================== */
            <div className="space-y-4">
              
              {/* Header Greeting */}
              <div className="pt-2">
                <h2 className="font-zilla text-2xl font-bold text-[#22262B]">
                  Hai, {customerName ? customerName.split(' ')[0] : 'Kawan'} 👋
                </h2>
                <p className="text-xs text-[#6B6F66] mt-0.5">Apa yang anda ingin nikmati hari ini?</p>
              </div>

              {/* Sticky Search & Category Tabs */}
              <div className="space-y-3 sticky top-14 z-20 bg-[#EDE7D8]/95 backdrop-blur-md pt-2 pb-2">
                {/* Search Box */}
                <div className="flex items-center gap-2 bg-[#FAF7EF] border-2 border-black/15 rounded-2xl px-3.5 py-2.5 shadow-sm">
                  <Search className="w-4 h-4 text-[#9B9D8F] shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari hidangan..."
                    className="w-full bg-transparent border-none outline-none text-xs font-worksans text-[#22262B] placeholder-[#9B9D8F]"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="p-1 text-[#9B9D8F] hover:text-[#22262B]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Pills Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {categoriesList.map(cat => (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveCategory(cat);
                        if (customerMenuViewMode === 'book') {
                          const targetIdx = categoryConfig.findIndex(c => c.name === cat);
                          if (targetIdx !== -1) {
                            handleBookPageChange(targetIdx);
                          }
                        }
                      }}
                      className={`px-3.5 py-2 rounded-full font-spacemono text-[11.5px] font-bold shrink-0 transition border-2 cursor-pointer ${
                        activeCategory === cat
                          ? 'bg-[#22262B] text-[#EDE7D8] border-[#22262B] shadow'
                          : 'bg-[#FAF7EF] text-[#6B6F66] border-black/15 hover:border-black/30'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional Render: Mode Buku Menu vs Mode Kad / Grid */}
              {customerMenuViewMode === 'book' ? (
                /* MODE BUKU MENU (SLIDE & ANIMASI SELAK KERTAS 3D) */
                <div className="menu-book-view my-2">
                  <div ref={bookSliderRef} className="book-slider-container">
                    {categoryConfig.map((catObj, idx) => {
                      const catItems = catObj.name === 'Semua' ? filteredMenuItems : filteredMenuItems.filter(item => item.category === catObj.name);

                      return (
                        <div key={catObj.name} className="book-page">
                          <div className={`book-page-inner ${currentBookPage === idx ? paperFlipAnimClass : ''}`}>
                            <div className="book-page-header">
                              <div className="book-page-title">{catObj.icon} {catObj.name === 'Semua' ? 'SEMUA MENU' : catObj.name}</div>
                              <div className="book-page-sub">Halaman Menu {idx + 1} dari {categoryConfig.length}</div>
                            </div>

                            <div className="book-menu-list">
                              {catItems.length === 0 ? (
                                <div className="text-center text-[#9B9D8F] text-xs py-10">Tiada hidangan dalam kategori ini</div>
                              ) : (
                                catItems.map(dish => {
                                  const isOut = isItemOutOfStock(dish);
                                  return (
                                    <div
                                      key={dish.id}
                                      onClick={() => !isOut && handleOpenItemModal(dish)}
                                      className={`book-item-row ${isOut ? 'opacity-50 grayscale filter cursor-not-allowed pointer-events-none' : ''}`}
                                    >
                                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        {isOut ? (
                                          <span className="font-spacemono text-[9px] font-bold text-white bg-rose-600 px-2 py-0.5 rounded-full shadow-xs">
                                            Stock Habis 🔴
                                          </span>
                                        ) : (recommendedItemIds.has(dish.id) || recommendedItemIds.has(dish.name)) && (
                                          <span className="inline-flex items-center gap-1 font-spacemono text-[9px] font-bold text-[#163F35] bg-[#F3E3C0] px-2 py-0.5 rounded-full border border-[#163F35]/30 shadow-xs animate-pulse">
                                            ⭐ Recommended
                                          </span>
                                        )}
                                      </div>
                                      <div className="book-item-head">
                                        <span className={`book-item-title ${isOut ? 'line-through text-[#6B6F66]' : ''}`}>
                                          {dish.name}
                                        </span>
                                        <span className="book-dots-leader" />
                                        <span className="book-item-price">RM {Number(dish.price).toFixed(2)}</span>
                                      </div>
                                      <div className="book-item-body">
                                        <span className="book-item-desc">{dish.description || 'Hidangan segar disediakan segar dari dapur kami.'}</span>
                                        <button
                                          type="button"
                                          disabled={isOut}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isOut) handleOpenItemModal(dish);
                                          }}
                                          className={`book-item-add-btn ${isOut ? 'bg-gray-400 text-white cursor-not-allowed opacity-60' : ''}`}
                                        >
                                          {isOut ? 'Habis' : '+ Tambah'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* MODE KAD / GRID VIEW */
                filteredKopitiamItems.length === 0 ? (
                  <div className="text-center text-[#9B9D8F] text-xs py-12 bg-[#FAF7EF] rounded-3xl border border-black/10">
                    Tiada hidangan dijumpai untuk &ldquo;{searchQuery || activeCategory}&rdquo;
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredKopitiamItems.map(dish => {
                      const bgBadge = getKopitiamCategoryBg(dish.category);
                      const emoji = getCategoryEmoji(dish);
                      const isOut = isItemOutOfStock(dish);

                      return (
                        <div
                          key={dish.id}
                          onClick={() => !isOut && handleOpenItemModal(dish)}
                          className={`bg-[#FAF7EF] rounded-2xl p-3 sm:p-3.5 shadow-sm border border-black/10 flex items-center gap-3 transition transform ${
                            isOut ? 'opacity-50 grayscale filter cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
                          }`}
                        >
                          <div
                            className="w-15 h-15 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden relative"
                            style={{ backgroundColor: bgBadge, width: '60px', height: '60px' }}
                          >
                            {hasValidImage(dish.image) && !brokenImageIds.has(dish.id || dish.name) ? (
                              <img
                                src={resolveImageUrl(dish.image)}
                                alt={dish.name}
                                onError={() => handleImageError(dish.id || dish.name)}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-2xl">{emoji}</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className={`font-zilla font-bold text-base text-[#22262B] leading-tight truncate ${isOut ? 'line-through text-[#6B6F66]' : ''}`}>
                                {dish.name}
                              </h3>
                              {isOut && (
                                <span className="font-spacemono text-[9px] font-bold text-white bg-rose-600 px-1.5 py-0.2 rounded shadow-xs">
                                  Stock Habis 🔴
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#6B6F66] mt-0.5 line-clamp-2 leading-snug">
                              {dish.description || 'Hidangan segar disediakan segar dari dapur kami.'}
                            </p>

                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="font-spacemono font-bold text-xs text-[#163F35]">
                                RM {Number(dish.price).toFixed(2)}
                              </span>
                              {!isOut && (recommendedItemIds.has(dish.id) || recommendedItemIds.has(dish.name)) && (
                                <span className="font-spacemono text-[9.5px] font-bold bg-[#F3E3C0] text-[#163F35] px-2 py-0.5 rounded-full border border-[#163F35]/30 flex items-center gap-1 shadow-xs animate-pulse">
                                  ⭐ Recommended
                                </span>
                              )}
                            </div>
                          </div>

                          <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center shrink-0 shadow-sm font-bold ${
                            isOut ? 'bg-gray-300 text-gray-500' : 'bg-[#D9E5DF] text-[#1F5B4A]'
                          }`}>
                            <Plus className="w-4 h-4" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

            </div>
          )}

        </main>

        {/* FLOATING CART BAR (KATALOG) */}
        {viewState !== 'SUBMITTED' && cart.length > 0 && (
          <div
            onClick={() => setIsCartOpen(true)}
            className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-30 bg-[#22262B] text-[#EDE7D8] rounded-2xl p-3.5 shadow-2xl flex items-center justify-between cursor-pointer transition transform active:scale-95 border border-black/20"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#D9A441] text-[#22262B] font-spacemono font-bold text-xs flex items-center justify-center">
                {totalCartCount}
              </span>
              <span className="text-xs font-semibold">
                item · <span className="font-spacemono font-bold">RM {totalCartPrice.toFixed(2)}</span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-[#D9A441]">
              <span>Lihat Troli</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODIFIER SHEET MODAL (KOPITIAM SHEET) */}
        {/* ===================================================================== */}
        {selectedItemForModal && (
          <>
            <div onClick={handleCloseModal} className="fixed inset-0 bg-black/50 z-40 animate-fadeIn" />
            <div className="fixed left-0 right-0 bottom-0 max-w-xl mx-auto z-50 bg-[#EDE7D8] rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden border-t border-black/20 animate-slideUpLight">
              
              {/* Top Banner Image: hidden image preloads silently; banner shows only after onLoad confirms success */}
              {hasValidImage(selectedItemForModal?.image) && (
                <img
                  key={selectedItemForModal.image}
                  src={resolveImageUrl(selectedItemForModal.image)}
                  alt=""
                  style={{ display: 'none' }}
                  onLoad={() => setModalImageLoaded(true)}
                  onError={() => setModalImageLoaded(false)}
                />
              )}
              {hasValidImage(selectedItemForModal?.image) && modalImageLoaded ? (
                <div className="w-full h-44 sm:h-52 relative overflow-hidden bg-[#E3DBC7] shrink-0">
                  <img src={resolveImageUrl(selectedItemForModal.image)} alt={selectedItemForModal.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#EDE7D8] via-transparent to-transparent" />
                  <button onClick={handleCloseModal} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center border-none cursor-pointer backdrop-blur-xs transition">
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center px-5 pt-4 pb-1 shrink-0">
                  <div className="w-10 h-1 bg-black/15 rounded-full" />
                  <button onClick={handleCloseModal} className="w-7 h-7 rounded-full bg-[#E3DBC7] text-[#6B6F66] flex items-center justify-center border-none cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Item Info: Name, Description, Price (No icon above name!) */}
                <div className="space-y-1">
                  <h2 className="font-zilla font-bold text-2xl text-[#22262B] leading-tight">{selectedItemForModal.name}</h2>
                  {selectedItemForModal.description && (
                    <p className="text-xs text-[#6B6F66] leading-relaxed">{selectedItemForModal.description}</p>
                  )}
                  <div className="font-spacemono font-bold text-base text-[#163F35] pt-1">RM {Number(selectedItemForModal.price).toFixed(2)}</div>
                </div>

                {/* Option Groups */}
                {getItemOptionGroups(selectedItemForModal).map((grp, gIdx) => (
                  <div key={gIdx} className="space-y-2">
                    <div className="font-spacemono text-[11px] font-bold text-[#22262B] uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span>{grp.name}</span>
                        {grp.required && (
                          <span className="bg-[#F0D8D3] text-[#A23B2E] text-[9px] px-1.5 py-0.5 rounded font-bold">WAJIB</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(grp.options || []).map((opt, oIdx) => {
                        const currentVal = modalOptions[grp.name];
                        const isOptOut = isOptionOutOfStock(selectedItemForModal, opt);
                        const isSelected = grp.required
                          ? currentVal === opt
                          : Array.isArray(currentVal) && currentVal.includes(opt);

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={isOptOut}
                            onClick={() => {
                              if (isOptOut) return;
                              if (grp.required) {
                                setModalOptions(prev => ({ ...prev, [grp.name]: opt }));
                              } else {
                                setModalOptions(prev => {
                                  const list = Array.isArray(prev[grp.name]) ? prev[grp.name] : [];
                                  const exists = list.includes(opt);
                                  const updated = exists ? list.filter(item => item !== opt) : [...list, opt];
                                  return { ...prev, [grp.name]: updated };
                                });
                              }
                            }}
                            className={`px-3.5 py-2 rounded-full text-xs font-semibold transition border-2 ${
                              isOptOut
                                ? 'opacity-50 line-through bg-[#F0D8D3] border-[#A23B2E]/30 text-[#A23B2E] cursor-not-allowed'
                                : isSelected
                                ? 'bg-[#1F5B4A] border-[#1F5B4A] text-white shadow cursor-pointer'
                                : 'bg-[#FAF7EF] border-black/15 text-[#6B6F66] hover:border-black/30 cursor-pointer'
                            }`}
                          >
                            <span>{opt}</span>
                            {isOptOut && <span className="ml-1.5 font-bold text-[10px] text-rose-700">(Stock Habis 🔴)</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Special Note input */}
                <div className="space-y-1.5 pt-2">
                  <label className="font-spacemono text-[11px] font-bold text-[#22262B] uppercase tracking-wider block">Nota Khas</label>
                  <textarea
                    value={modalItemNote}
                    onChange={(e) => setModalItemNote(e.target.value)}
                    placeholder="cth: Kurang ais, tanpa gula, sos asing..."
                    rows={2}
                    className="w-full bg-[#FAF7EF] border-2 border-black/15 rounded-xl p-3 text-xs text-[#22262B] outline-none focus:border-[#1F5B4A] transition resize-none"
                  />
                </div>
              </div>

              {/* Footer Modal */}
              <div className="p-4 border-t border-black/10 bg-[#EDE7D8] flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2 bg-[#FAF7EF] border-2 border-black/15 rounded-2xl p-1.5 shrink-0">
                  <button onClick={() => modalQty > 1 && setModalQty(modalQty - 1)} className="w-7 h-7 rounded-full bg-[#E3DBC7] text-[#22262B] flex items-center justify-center font-bold border-none cursor-pointer">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-spacemono font-bold text-xs w-5 text-center">{modalQty}</span>
                  <button onClick={() => setModalQty(modalQty + 1)} className="w-7 h-7 rounded-full bg-[#E3DBC7] text-[#22262B] flex items-center justify-center font-bold border-none cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={handleAddToCartFromModal}
                  className="flex-1 py-3.5 border-none rounded-2xl bg-[#22262B] text-[#EDE7D8] font-bold text-xs cursor-pointer shadow-lg hover:bg-black transition active:scale-95"
                >
                  Tambah ke Troli — RM {(getItemUnitPrice(selectedItemForModal, modalOptions) * modalQty).toFixed(2)}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ===================================================================== */}
        {/* CART DRAWER (KOPITIAM CART) */}
        {/* ===================================================================== */}
        {isCartOpen && (
          <>
            <div onClick={() => setIsCartOpen(false)} className="fixed inset-0 bg-black/50 z-40 animate-fadeIn" />
            <div className="fixed inset-y-0 right-0 max-w-md w-full z-50 bg-[#EDE7D8] shadow-2xl flex flex-col overflow-hidden border-l border-black/20 animate-slideUpLight text-[#22262B]">
              <div className="p-5 border-b border-black/10 flex items-center justify-between shrink-0">
                <h2 className="font-zilla font-bold text-xl text-[#22262B]">Troli Pesanan</h2>
                <button onClick={() => setIsCartOpen(false)} className="w-8 h-8 rounded-full bg-[#FAF7EF] text-[#6B6F66] flex items-center justify-center border-none cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Order Type Toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOrderType('DINE_IN')}
                    className={`py-3 px-2 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      orderType === 'DINE_IN'
                        ? 'bg-[#1F5B4A] border-[#1F5B4A] text-white shadow'
                        : 'bg-[#FAF7EF] border-black/15 text-[#6B6F66]'
                    }`}
                  >
                    <span>🍽️ Makan Di Sini</span>
                  </button>
                  <button
                    onClick={() => setOrderType('TAKEAWAY')}
                    className={`py-3 px-2 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      orderType === 'TAKEAWAY'
                        ? 'bg-[#1F5B4A] border-[#1F5B4A] text-white shadow'
                        : 'bg-[#FAF7EF] border-black/15 text-[#6B6F66]'
                    }`}
                  >
                    <span>🛍️ Bungkus</span>
                  </button>
                </div>

                {/* Cart Lines */}
                {cart.length === 0 ? (
                  <div className="text-center text-[#9B9D8F] text-xs py-10">Troli masih kosong</div>
                ) : (
                  <div className="space-y-3 divide-y divide-black/10">
                    {cart.map(item => (
                      <div key={item.cartItemId} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-bold text-xs text-[#22262B]">
                            {item.quantity}x {item.name}
                          </div>
                          {item.selectedOptions && (
                            <div className="text-[11px] text-[#6B6F66] italic">
                              {formatSelectedOptions(item.selectedOptions)}
                            </div>
                          )}
                          {item.itemNote && (
                            <div className="text-[10.5px] text-[#A23B2E] italic">📝 {item.itemNote}</div>
                          )}
                          <div className="font-spacemono font-bold text-xs text-[#163F35] mt-1">
                            RM {(item.price * item.quantity).toFixed(2)}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleUpdateCartQty(item.cartItemId, -1)} className="w-6 h-6 rounded-full bg-[#FAF7EF] text-[#22262B] flex items-center justify-center border-none cursor-pointer">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-spacemono font-bold text-xs px-1">{item.quantity}</span>
                          <button onClick={() => handleUpdateCartQty(item.cartItemId, 1)} className="w-6 h-6 rounded-full bg-[#FAF7EF] text-[#22262B] flex items-center justify-center border-none cursor-pointer">
                            <Plus className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleRemoveCartItem(item.cartItemId)} className="w-6 h-6 rounded-full bg-[#F0D8D3] text-[#A23B2E] flex items-center justify-center border-none cursor-pointer ml-1">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Table Notes */}
                <div className="space-y-1.5 pt-3">
                  <label className="font-spacemono text-[10.5px] font-bold text-[#6B6F66] uppercase tracking-wider block">
                    Nota Keseluruhan Meja
                  </label>
                  <textarea
                    value={overallNote}
                    onChange={(e) => setOverallNote(e.target.value)}
                    placeholder="cth: Sila bungkus berasingan, tanpa straw..."
                    rows={2}
                    className="w-full bg-[#FAF7EF] border-2 border-black/15 rounded-xl p-3 text-xs text-[#22262B] outline-none focus:border-[#1F5B4A] transition resize-none"
                  />
                </div>
              </div>

              {/* Footer Checkout */}
              {(() => {
                const checkoutTotals = calculateReceiptTotals(totalCartPrice, receiptSettings, {
                  isTakeaway: orderType === 'TAKEAWAY',
                  itemCount: totalCartCount,
                  takeawayItemCount: orderType === 'TAKEAWAY' ? totalCartCount : 0,
                  takeawaySubtotal: orderType === 'TAKEAWAY' ? totalCartPrice : 0
                });

                return (
                  <div className="p-4 border-t border-black/10 bg-[#EDE7D8] space-y-3 shrink-0 font-spacemono text-xs">
                    <div className="space-y-1.5 text-[#6B6F66]">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="font-bold text-[#22262B]">RM {totalCartPrice.toFixed(2)}</span>
                      </div>
                      {checkoutTotals.enableSst && (
                        <div className="flex justify-between">
                          <span>SST ({checkoutTotals.sstRate}%)</span>
                          <span className="font-bold text-[#22262B]">RM {checkoutTotals.sstAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {checkoutTotals.enableTakeawayCharge && checkoutTotals.isTakeaway && checkoutTotals.takeawayChargeFinal > 0 && (
                        <div className="flex justify-between text-[#B37F2B]">
                          <span>Cas Bungkus</span>
                          <span className="font-bold">RM {checkoutTotals.takeawayChargeFinal.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-[#163F35] pt-2 border-t border-dashed border-black/15 font-zilla">
                        <span>Jumlah</span>
                        <span className="font-spacemono text-base">RM {checkoutTotals.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleSendOrderToKitchen}
                      disabled={!orderType || cart.length === 0}
                      className="w-full py-4 border-none rounded-2xl bg-[#1F5B4A] hover:bg-[#163F35] text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition transform active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Utensils className="w-4 h-4" />
                      <span>Hantar Pesanan ke Dapur</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          </>
        )}

      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgPage} flex flex-col font-sans pb-24 selection:bg-rose-500 selection:text-white transition-colors duration-300`}>
      
      {/* MODERN GLASSMORPHISM HEADER */}
      <header className={`${bgHeader} backdrop-blur-xl sticky top-0 z-30 px-4 sm:px-6 py-3.5 flex items-center justify-between transition-colors duration-300`}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className={`font-black text-sm sm:text-base ${textTitle} tracking-tight`}>
              {customerName ? `Hi, ${customerName}! 👋` : 'Restoran Rasa Selera'}
            </h1>
            <div className={`flex items-center gap-2 text-[11px] font-mono ${textMuted}`}>
              <span className="text-rose-600 dark:text-rose-400 font-extrabold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">MEJA {tableParam}</span>
              <span>•</span>
              <span className="text-[10px]">{sessionParam}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-2xl border transition ${
              isLight ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
            }`}
            title="Tukar Mode Terang / Gelap"
          >
            {isLight ? <Moon className="w-4 h-4 text-indigo-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* View Switcher Button (Status Live Tracker) */}
          {sessionOrders.length > 0 && (
            <button
              onClick={() => setViewState(viewState === 'SUBMITTED' ? null : 'SUBMITTED')}
              className={`px-3 py-2 rounded-2xl text-xs font-black flex items-center gap-1.5 border transition shadow-md ${
                viewState === 'SUBMITTED' 
                  ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/30' 
                  : isLight ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200' : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="hidden sm:inline">Status</span>
              <span>({sessionOrders.length})</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-6">
        
        {/* =================================================================== */}
        {/* VIEW 1: LIVE ORDER STATUS TRACKER */}
        {/* =================================================================== */}
        {viewState === 'SUBMITTED' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Status Header Banner */}
            {(() => {
              const hasPendingPayment = sessionOrders.some(o => o.kitchen_status === 'PAYMENT_PENDING');
              const bannerTitle = hasPendingPayment ? 'Sila Buat Pembayaran di Kaunter 💳' : 'Pesanan Berjaya Dihantar!';
              const bannerSubtitle = hasPendingPayment 
                ? `Pesanan anda telah diterima dan sedang menunggu bayaran. Sila sebut MEJA ${tableParam} di kaunter untuk mula masak di dapur.`
                : 'Pesanan anda kini dipaparkan secara real-time di skrin dapur. Tukang masak sedang menyediakannya.';
              const bannerGradient = hasPendingPayment
                ? (isLight ? 'from-rose-100 via-white to-rose-50 border-rose-300' : 'from-rose-950 via-slate-900 to-slate-900 border-rose-500/40')
                : (isLight ? 'from-emerald-100 via-white to-emerald-50 border-emerald-300' : 'from-emerald-950 via-slate-900 to-slate-900 border-emerald-500/30');

              return (
                <div className={`bg-gradient-to-br ${bannerGradient} border rounded-3xl p-6 text-center space-y-3 relative overflow-hidden shadow-2xl`}>
                  <div className={`h-12 w-12 ${hasPendingPayment ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'} border rounded-2xl flex items-center justify-center mx-auto shadow-lg`}>
                    {hasPendingPayment ? <span className="text-xl">💳</span> : <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />}
                  </div>
                  <h2 className={`text-xl font-black ${textTitle} tracking-tight`}>{bannerTitle}</h2>
                  <p className={`text-xs ${textSubtle} max-w-sm mx-auto leading-relaxed`}>
                    {bannerSubtitle}
                  </p>
                  
                  <button
                    onClick={() => setViewState(null)}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600/10 border border-rose-500/30 hover:bg-rose-600/20 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-300 transition"
                  >
                    <span>+ Tambah Pesanan Lain</span>
                  </button>

                  {/* Non-Clickable Overall Active Total Summary Card */}
                  {sessionOrders.length > 0 && (() => {
                    const validOrders = sessionOrders.filter(o => o.kitchen_status !== 'CANCELLED');
                    
                    const activeSubtotal = validOrders.reduce((ordSum, o) => {
                      const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                      return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                    }, 0);

                    const takeawayOrders = validOrders.filter(o => o.order_type === 'TAKEAWAY');
                    const hasTakeaway = takeawayOrders.length > 0;
                    
                    const takeawaySubtotal = takeawayOrders.reduce((ordSum, o) => {
                      const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                      return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                    }, 0);

                    const takeawayItemCount = takeawayOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
                    const totalItemsCount = validOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                    const activeTotals = calculateReceiptTotals(activeSubtotal, receiptSettings, {
                      isTakeaway: hasTakeaway,
                      itemCount: totalItemsCount,
                      takeawayItemCount,
                      takeawaySubtotal
                    });

                    return (
                      <div className={`mt-3 pt-3 border-t ${isLight ? 'border-emerald-200 bg-emerald-50/80' : 'border-emerald-500/20 bg-slate-950/80'} rounded-2xl p-4 max-w-sm mx-auto text-left space-y-2 font-mono text-xs border border-emerald-500/30 shadow-lg`}>
                        <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                          <span>Subtotal ({validOrders.length} Pesanan):</span>
                          <span className={`font-bold ${textTitle}`}>RM {activeSubtotal.toFixed(2)}</span>
                        </div>

                        {activeTotals.enableSst && (
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                            <span>SST ({activeTotals.sstRate}%):</span>
                            <span className={`font-bold ${textTitle}`}>RM {activeTotals.sstAmount.toFixed(2)}</span>
                          </div>
                        )}

                        {activeTotals.enableServiceCharge && (
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                            <span>Cas Servis ({activeTotals.serviceChargeRate}%):</span>
                            <span className={`font-bold ${textTitle}`}>RM {activeTotals.serviceChargeAmount.toFixed(2)}</span>
                          </div>
                        )}

                        {activeTotals.enableCustomCharge && (
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                            <span>{activeTotals.customChargeName}:</span>
                            <span className={`font-bold ${textTitle}`}>RM {activeTotals.customChargeFinal.toFixed(2)}</span>
                          </div>
                        )}

                        {activeTotals.enableTakeawayCharge && activeTotals.isTakeaway && activeTotals.takeawayChargeFinal > 0 && (
                          <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
                            <span>🛍️ Cas Bungkus ({activeTotals.takeawayChargeType === 'RM' ? `RM ${activeTotals.takeawayChargeAmountVal.toFixed(2)}${activeTotals.takeawayItemCount > 1 ? ` x ${activeTotals.takeawayItemCount}` : ''}` : `${activeTotals.takeawayChargeAmountVal}%`}):</span>
                            <span>+ RM {activeTotals.takeawayChargeFinal.toFixed(2)}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-sans font-black">
                          <span className={textTitle}>JUMLAH KESELURUHAN:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-base sm:text-lg">RM {activeTotals.grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* PRE-PAYMENT NOTIS CARD (MODERN TEMPLATE) */}
            {sessionOrders.some(o => o.kitchen_status === 'PAYMENT_PENDING') && (
              <div className="bg-gradient-to-br from-rose-950/90 via-slate-900 to-slate-900 border-2 border-rose-500/60 rounded-3xl p-5 text-slate-100 space-y-3.5 shadow-2xl animate-pulse shadow-rose-500/20">
                <div className="flex items-center gap-3 border-b border-rose-500/30 pb-3">
                  <div className="h-10 w-10 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-center text-xl shrink-0">
                    💳
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-widest">Tindakan Diperlukan</span>
                    <h3 className="text-base font-extrabold text-white leading-tight">Sila Buat Pembayaran di Kaunter</h3>
                  </div>
                </div>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  Pesanan anda telah diterima & terikat pada <strong className="text-white bg-rose-500/30 px-2 py-0.5 rounded font-mono">MEJA {tableParam}</strong>. Sila sebut No. Meja anda atau tunjukkan skrin ini kepada juruwang untuk memulakan masak di dapur.
                </p>

                {(() => {
                  const pendingOrders = sessionOrders.filter(o => o.kitchen_status === 'PAYMENT_PENDING');
                  const pendingSubtotal = pendingOrders.reduce((ordSum, o) => {
                    const uncancelled = getSafeItems(o.items).filter(i => !i.cancelled);
                    return ordSum + uncancelled.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                  }, 0);

                  const pendingItemCount = pendingOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                  const pendingTotals = calculateReceiptTotals(pendingSubtotal, receiptSettings, {
                    isTakeaway: pendingOrders.some(o => o.order_type === 'TAKEAWAY'),
                    itemCount: pendingItemCount
                  });

                  return (
                    <div className="bg-slate-950/80 border border-rose-500/40 rounded-2xl p-3.5 space-y-2 font-mono text-xs">
                      <div className="flex justify-between items-center text-slate-400 text-[11px]">
                        <span>Pesanan Belum Dibayar ({pendingOrders.length} Draf):</span>
                        <span className="text-rose-300 font-bold">{pendingItemCount} item</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-rose-500/20 text-xs font-bold text-white">
                        <span>JUMLAH DIPERLUKAN DI KAUNTER:</span>
                        <span className="text-rose-400 font-black text-base">RM {pendingTotals.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* List of Active Submitted Orders */}
            <div className="space-y-4">
              <h3 className={`text-xs font-black ${textMuted} uppercase tracking-widest px-1`}>Status Pesanan Aktif Anda</h3>

              {sessionOrders.map(ord => {
                const isCancelledByKitchen = ord.kitchen_status === 'CANCELLED';
                const isPaymentPending = ord.kitchen_status === 'PAYMENT_PENDING';
                const isPending = ord.kitchen_status === 'PENDING';
                const isCooking = ord.kitchen_status === 'COOKING';
                const isReady = ord.kitchen_status === 'READY';
                const isServed = ord.kitchen_status === 'SERVED';

                if (isCancelledByKitchen) {
                  return (
                    <div key={ord.order_id} className={`bg-rose-500/10 border border-rose-500/40 rounded-3xl p-5 space-y-4 shadow-xl`}>
                      <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
                        <div>
                          <span className="font-mono text-xs font-bold text-rose-500">{ord.order_id}</span>
                          <p className={`text-[11px] ${textMuted}`}>{formatSafeOrderTime(ord)}</p>
                        </div>
                        
                        <span className="px-3 py-1 bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/40 rounded-full text-[11px] font-black">
                          ❌ DIBATALKAN (STOK HABIS)
                        </span>
                      </div>

                      {/* Kitchen Cancel Note */}
                      <div className={`${bgSubCard} p-3.5 rounded-2xl border border-rose-500/30 space-y-1 text-xs text-rose-600 dark:text-rose-200`}>
                        <p className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                          ⚠️ Makluman Daripada Dapur:
                        </p>
                        <p className="italic">"{ord.kitchen_cancel_reason || 'Bahan mentah / stok hidangan ini telah habis'}"</p>
                      </div>

                      {/* Cancelled Items List */}
                      <div className="space-y-1.5 pt-1 opacity-70">
                        {getSafeItems(ord.items).map((item, idx) => (
                          <div key={idx} className={`flex justify-between items-start text-xs ${textSubtle}`}>
                            <div>
                              <span className="font-bold line-through">{item.quantity}x {item.name}</span>
                              {item.options && <span className={`text-[11px] ${textMuted} block font-mono`}> &gt; {item.options}</span>}
                            </div>
                            <span className="font-mono line-through">RM {(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={ord.order_id} className={`${bgCard} rounded-3xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-rose-500">{ord.order_id}</span>
                          {ord.order_type === 'TAKEAWAY' && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded-md text-[10px] font-extrabold">
                              🛍️ BUNGKUS
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] ${textMuted} mt-0.5`}>{formatSafeOrderTime(ord)}</p>
                      </div>
                      
                      {/* Kitchen Status Badge */}
                      <span className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                        isPaymentPending ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/40 animate-pulse' :
                        isServed ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40' :
                        isReady ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 animate-pulse' :
                        isCooking ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 animate-pulse' :
                        isLight ? 'bg-slate-200 text-slate-700 border border-slate-300' : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${isPaymentPending ? 'bg-rose-500 animate-ping' : isServed || isReady ? 'bg-emerald-500' : isCooking ? 'bg-amber-500 animate-ping' : 'bg-slate-400'}`}></span>
                        {isPaymentPending ? 'MENUNGGU BAYARAN KAUNTER 💳' : isServed ? 'TELAH DISAJI ✅' : isReady ? 'SIAP DISAJI 🍽️' : isCooking ? 'SEDANG DIMASAK 🔥' : 'MENUNGGU DAPUR ⏳'}
                      </span>
                    </div>

                    {/* Timeline Progress Bar */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-extrabold">
                      <div className={`p-2 rounded-xl border transition ${isPaymentPending ? 'bg-rose-500/20 border-rose-500/40 text-rose-600 dark:text-rose-300 font-black' : isPending || isCooking || isReady || isServed ? (isLight ? 'bg-slate-200 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white') : bgSubCard}`}>
                        1. {isPaymentPending ? 'Bayar Kaunter 💳' : 'Diterima'}
                      </div>
                      <div className={`p-2 rounded-xl border transition ${isCooking || isReady || isServed ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-300' : bgSubCard}`}>
                        2. Dimasak
                      </div>
                      <div className={`p-2 rounded-xl border transition ${isServed ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : isReady ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300' : bgSubCard}`}>
                        3. {isServed ? 'Disaji ✅' : 'Siap!'}
                      </div>
                    </div>

                    {/* Ordered Items */}
                    <div className="space-y-2 pt-1">
                      {getSafeItems(ord.items).map((item, idx) => {
                        const isItemCancelled = item.cancelled === true;
                        return (
                          <div key={idx} className={`flex justify-between items-start text-xs ${bgSubCard} p-2.5 rounded-xl transition ${isItemCancelled ? 'opacity-70 bg-rose-500/10 border border-rose-500/30' : ''}`}>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold ${isItemCancelled ? 'line-through text-slate-400' : textTitle}`}>
                                  {item.quantity}x {item.name}
                                </span>
                                {isItemCancelled && (
                                  <span className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                                    Dibatalkan ❌
                                  </span>
                                )}
                              </div>
                              {item.options && (
                                <p className={`text-[11px] ${textMuted} italic ${isItemCancelled ? 'line-through' : ''}`}>
                                  ↳ {item.options}
                                </p>
                              )}
                              {isItemCancelled && item.cancel_reason && (
                                <p className="text-[10px] text-rose-500 italic font-medium">
                                  Sebab: {item.cancel_reason}
                                </p>
                              )}
                            </div>
                            <span className={`font-mono font-bold ${isItemCancelled ? 'line-through text-rose-500 opacity-80' : textTitle}`}>
                              RM {(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 2: REGULAR MENU CATALOG & CATEGORIES */}
        {/* =================================================================== */}
        {viewState !== 'SUBMITTED' && (
          <div className="space-y-5">
            
            {/* Search Bar */}
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-4 top-3.5 ${textMuted}`} />
              <input
                type="text"
                placeholder="Cari menu kegemaran anda..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${bgInput} rounded-2xl pl-11 pr-4 py-3 text-xs outline-none transition`}
              />
            </div>

            {/* Category Pills Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categoryConfig.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => {
                    setActiveCategory(cat.name);
                    if (customerMenuViewMode === 'book') {
                      const targetIdx = categoryConfig.findIndex(c => c.name === cat.name);
                      if (targetIdx !== -1) {
                        handleBookPageChange(targetIdx);
                      }
                    }
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap flex items-center gap-1.5 transition ${
                    activeCategory === cat.name
                      ? 'bg-gradient-to-r from-rose-600 to-amber-500 text-slate-950 shadow-lg shadow-rose-600/20'
                      : isLight 
                        ? 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200' 
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>

            {/* Conditional Render: Mode Buku Menu vs Mode Kad / Grid */}
            {customerMenuViewMode === 'book' ? (
              /* MODE BUKU MENU (MODERN DYNAMIC SLEEK DESIGN) */
              <div className="menu-book-view my-2">
                <div ref={bookSliderRef} className="book-slider-container">
                  {categoryConfig.map((catObj, idx) => {
                    const catItems = catObj.name === 'Semua' ? filteredMenuItems : filteredMenuItems.filter(item => item.category === catObj.name);

                    return (
                      <div key={catObj.name} className="book-page">
                        <div className={`modern-book-page-inner ${isLight ? 'bg-white/95 text-slate-900 border border-slate-200 shadow-xl' : 'bg-slate-900/95 text-slate-100 border border-slate-800 shadow-2xl'} ${currentBookPage === idx ? paperFlipAnimClass : ''}`}>
                          <div className="text-center pt-2 pb-3 border-b border-dashed border-rose-500/30 mb-4">
                            <div className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent uppercase flex items-center justify-center gap-2">
                              <span>{catObj.icon}</span>
                              <span>{catObj.name === 'Semua' ? 'SEMUA MENU' : catObj.name}</span>
                            </div>
                            <div className="font-mono text-[10px] text-rose-500 dark:text-rose-400 font-bold uppercase tracking-wider mt-1">
                              Halaman Menu {idx + 1} dari {categoryConfig.length}
                            </div>
                          </div>

                          <div className="space-y-3 flex-1">
                            {catItems.length === 0 ? (
                              <div className={`text-center text-xs py-10 ${textMuted}`}>Tiada hidangan dalam kategori ini</div>
                            ) : (
                              catItems.map(dish => {
                                const isOut = isItemOutOfStock(dish);
                                return (
                                  <div
                                    key={dish.id}
                                    onClick={() => !isOut && handleOpenItemModal(dish)}
                                    className={`p-3 rounded-2xl transition border ${
                                      isOut
                                        ? 'opacity-50 grayscale filter cursor-not-allowed border-rose-500/20 bg-rose-500/5'
                                        : isLight ? 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 cursor-pointer' : 'bg-slate-950/60 hover:bg-slate-950 border-slate-800/80 cursor-pointer'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                      {isOut ? (
                                        <span className="text-[10px] font-extrabold bg-rose-600 text-white px-2.5 py-0.5 rounded-full font-mono inline-flex items-center shadow-xs">
                                          Stock Habis 🔴
                                        </span>
                                      ) : (recommendedItemIds.has(dish.id) || recommendedItemIds.has(dish.name)) && (
                                        <span className="text-[10px] font-extrabold bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-mono inline-flex items-center gap-1 shadow-xs animate-pulse">
                                          ⭐ Recommended
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className={`font-extrabold text-sm sm:text-base ${isOut ? 'line-through text-slate-400' : textTitle}`}>
                                        {dish.name}
                                      </span>
                                      <span className="flex-1 border-b-2 border-dashed border-slate-300 dark:border-slate-800 mx-2 opacity-50" />
                                      <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm sm:text-base shrink-0">
                                        RM {Number(dish.price).toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-1.5">
                                      <span className={`text-[11px] ${textMuted} line-clamp-2 leading-relaxed flex-1`}>
                                        {dish.description || 'Hidangan segar disediakan segar dari dapur kami.'}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isOut}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isOut) handleOpenItemModal(dish);
                                        }}
                                        className={`px-3 py-1.5 font-black text-[11px] rounded-xl shadow-md shrink-0 flex items-center gap-1 transition ${
                                          isOut
                                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                                            : 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 active:scale-95'
                                        }`}
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>{isOut ? 'Habis' : 'Tambah'}</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* MODE KAD / GRID VIEW — Premium 2-Column Card Grid */
              <div className="grid grid-cols-2 gap-3">
                {filteredMenuItems.map((item) => {
                  const isOut = isItemOutOfStock(item);
                  const isRec = !isOut && (recommendedItemIds.has(item.id) || recommendedItemIds.has(item.name));
                  return (
                    <div
                      key={item.id}
                      onClick={() => !isOut && handleOpenItemModal(item)}
                      className={`relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ${
                        isOut
                          ? 'opacity-50 grayscale cursor-not-allowed'
                          : 'cursor-pointer active:scale-95'
                      } ${isLight ? 'bg-white shadow-md hover:shadow-xl border border-slate-100' : 'bg-slate-800/80 shadow-lg hover:shadow-rose-500/10 border border-slate-700/60'}`}
                      style={{ boxShadow: !isOut && !isLight ? '0 4px 24px 0 rgba(225,29,72,0.08)' : undefined }}
                    >
                      {/* Image Zone */}
                      <div className="relative w-full aspect-square overflow-hidden bg-slate-900/30">
                        {hasValidImage(item.image) && !brokenImageIds.has(item.id || item.name) ? (
                          <img
                            src={resolveImageUrl(item.image)}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={() => setBrokenImageIds(prev => new Set([...prev, item.id || item.name]))}
                          />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${isLight ? 'bg-slate-100' : 'bg-slate-700/60'}`}>
                            <span className="text-3xl opacity-40">🍽️</span>
                          </div>
                        )}

                        {/* Stock Habis Overlay */}
                        {isOut && (
                          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                            <span className="text-[10px] font-black text-white bg-rose-600 px-2.5 py-1 rounded-full uppercase tracking-wide shadow">
                              Stock Habis
                            </span>
                          </div>
                        )}

                        {/* Recommended Badge */}
                        {isRec && (
                          <div className="absolute top-1.5 left-1.5">
                            <span className="text-[9px] font-black text-amber-900 bg-gradient-to-r from-amber-400 to-yellow-300 px-2 py-0.5 rounded-full shadow flex items-center gap-0.5">
                              ⭐ Pilihan
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info Zone */}
                      <div className="flex flex-col flex-1 p-2.5 gap-1.5">
                        <h3 className={`font-bold text-[12px] leading-tight line-clamp-2 ${isOut ? 'line-through text-slate-400' : textTitle}`}>
                          {item.name}
                        </h3>

                        {item.description && (
                          <p className={`text-[10px] leading-snug line-clamp-2 ${textMuted}`}>
                            {item.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-1">
                          <span className="font-black font-mono text-[13px] text-rose-500 dark:text-rose-400">
                            RM {item.price.toFixed(2)}
                          </span>

                          <button
                            disabled={isOut}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isOut) handleOpenItemModal(item);
                            }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center shadow transition active:scale-90 ${
                              isOut
                                ? 'bg-slate-600 text-slate-400 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-br from-rose-600 to-amber-500 text-white shadow-rose-500/30 hover:shadow-rose-500/50'
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </main>

      {/* =================================================================== */}
      {/* STICKY BOTTOM FLOATING CART SUMMARY BAR (FIXED NEAT MOBILE LAYOUT) */}
      {/* =================================================================== */}
      {cart.length > 0 && (
        <div className={`fixed bottom-0 left-0 right-0 z-40 ${isLight ? 'bg-white/95 border-slate-200 shadow-2xl' : 'bg-slate-900/95 border-slate-800'} border-t backdrop-blur-xl px-4 py-3 sm:py-4 animate-slideUpLight`}>
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2.5">
            
            {/* Left: Cart Icon & Total Summary */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative bg-gradient-to-tr from-rose-600 to-amber-500 text-slate-950 p-2.5 sm:p-3 rounded-2xl shadow-lg shadow-rose-600/30 shrink-0">
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 font-black" />
                <span className="absolute -top-1 -right-1 bg-slate-950 text-white font-black text-[10px] h-4 w-4 sm:h-5 sm:w-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {totalCartCount}
                </span>
              </div>

              <div className="min-w-0">
                <span className={`text-[10px] ${textMuted} font-extrabold uppercase tracking-wider block truncate`}>JUMLAH PESANAN</span>
                <p className={`font-mono font-black text-base sm:text-lg ${textTitle} truncate`}>RM {totalCartPrice.toFixed(2)}</p>
              </div>
            </div>

            {/* Right: Semak Pesanan Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="px-4 sm:px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black rounded-2xl shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition transform active:scale-95 text-xs tracking-wide uppercase shrink-0 whitespace-nowrap"
            >
              <span>Semak Pesanan</span>
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: ITEM OPTIONS / MODIFIERS SHEET (WITH SCROLL LOCK FIX) */}
      {/* =================================================================== */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
          <div className={`${bgModal} rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-slideUpLight`}>
            
            {/* Top Banner Image: hidden image preloads silently; banner shows only after onLoad confirms success */}
            {hasValidImage(selectedItemForModal?.image) && (
              <img
                key={selectedItemForModal.image}
                src={resolveImageUrl(selectedItemForModal.image)}
                alt=""
                style={{ display: 'none' }}
                onLoad={() => setModalImageLoaded(true)}
                onError={() => setModalImageLoaded(false)}
              />
            )}
            {hasValidImage(selectedItemForModal?.image) && modalImageLoaded ? (
              <div className="relative h-44 sm:h-48 shrink-0">
                <img src={resolveImageUrl(selectedItemForModal.image)} alt={selectedItemForModal.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent"></div>
                <button
                  onClick={() => setSelectedItemForModal(null)}
                  className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition cursor-pointer z-10"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            ) : (
              <div className="flex justify-end p-4 pb-0 shrink-0">
                <button
                  onClick={() => setSelectedItemForModal(null)}
                  className={`p-2 rounded-full transition cursor-pointer ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            )}

            {/* Options Body (With Scroll Event Listener) */}
            <div 
              ref={modalScrollRef}
              onScroll={handleModalScroll}
              className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1"
            >
              <div>
                <h3 className={`font-extrabold text-xl ${textTitle}`}>{selectedItemForModal.name}</h3>
                {selectedItemForModal.description && (
                  <p className={`text-xs ${textMuted} mt-1 leading-relaxed`}>{selectedItemForModal.description}</p>
                )}
                <p className="text-rose-600 dark:text-rose-400 font-mono font-black text-base mt-2">RM {Number(selectedItemForModal.price).toFixed(2)}</p>
              </div>

              {/* Dynamic Option Groups */}
              {getItemOptionGroups(selectedItemForModal).map((group) => {
                const currentVal = modalOptions[group.name];
                const hasSelectedOptional = !group.required && Array.isArray(currentVal) && currentVal.length > 0;

                return (
                  <div key={group.name} className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs ${textTitle}`}>{group.name}</span>
                        {group.required && (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md font-mono font-bold">Wajib</span>
                        )}
                      </div>

                      {/* Clear / Reset Button for Optional Groups */}
                      {hasSelectedOptional && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalOptions(prev => ({ ...prev, [group.name]: [] }));
                          }}
                          className="text-[10px] text-rose-500 hover:text-rose-600 font-bold underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Batal Semua Pilihan</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {group.options.map((opt) => {
                        const currentVal = modalOptions[group.name];
                        const isOptOut = isOptionOutOfStock(selectedItemForModal, opt);
                        const active = group.required
                          ? currentVal === opt
                          : Array.isArray(currentVal) && currentVal.includes(opt);

                        return (
                          <div
                            key={opt}
                            onClick={() => {
                              if (isOptOut) return;
                              if (group.required) {
                                setModalOptions(prev => ({ ...prev, [group.name]: opt }));
                              } else {
                                setModalOptions(prev => {
                                  const list = Array.isArray(prev[group.name]) ? prev[group.name] : [];
                                  const exists = list.includes(opt);
                                  const updated = exists ? list.filter(item => item !== opt) : [...list, opt];
                                  return { ...prev, [group.name]: updated };
                                });
                              }
                            }}
                            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between transition ${
                              isOptOut
                                ? 'opacity-50 line-through bg-rose-500/10 border-rose-500/30 text-rose-500 cursor-not-allowed'
                                : active
                                ? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 shadow-sm cursor-pointer'
                                : `${bgSubCard} ${textSubtle} hover:border-slate-400 dark:hover:border-slate-700 cursor-pointer`
                            }`}
                          >
                            <span className={isOptOut ? 'line-through' : ''}>{opt}</span>
                            <div className="flex items-center gap-2">
                              {isOptOut ? (
                                <span className="text-[10px] font-black text-rose-500 bg-rose-500/20 px-2 py-0.5 rounded font-mono">Stock Habis 🔴</span>
                              ) : (
                                <>
                                  {active && !group.required && (
                                    <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-mono font-bold">Dipilih</span>
                                  )}
                                  {active ? (
                                    <Check className="w-4 h-4 text-rose-500 shrink-0" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Item Note Input */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
                <label className={`font-bold text-xs ${textTitle} flex items-center gap-1.5`}>
                  <MessageSquare className="w-4 h-4 text-rose-500" />
                  <span>Nota Khas Item (Nota Pilihan)</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kurang ais, pedas lebih, kuah asing..."
                  value={modalItemNote}
                  onChange={(e) => setModalItemNote(e.target.value)}
                  className={`w-full ${bgInput} rounded-2xl px-4 py-3 text-xs outline-none transition`}
                />
              </div>

            </div>

            {/* Modal Action CTA (Dimmed Until Scrolled To Bottom) */}
            <div className={`p-4 ${bgDrawerFooter} border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-2`}>
              {!modalScrolledToBottom && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-500 animate-pulse">
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Sila skrol ke bawah untuk lengkapkan pilihan</span>
                </div>
              )}

              <button
                onClick={handleAddToCartFromModal}
                disabled={!modalScrolledToBottom}
                className={`w-full py-4 font-black rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all duration-300 text-xs uppercase tracking-wider ${
                  modalScrolledToBottom
                    ? 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 shadow-rose-600/30 active:scale-95 cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-500 opacity-60 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                }`}
              >
                <span>Tambah ke Pesanan</span>
                <span>•</span>
                <span>RM {(getItemUnitPrice(selectedItemForModal, modalOptions) * modalQty).toFixed(2)}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CHECKOUT CART DRAWER (WITH LIGHTWEIGHT SLIDE-UP ANIMATION) */}
      {/* =================================================================== */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-md animate-fadeIn">
          <div className={`${bgModal} rounded-t-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-slideUpLight`}>
            
            {/* Drawer Header */}
            <div className={`${bgDrawerHeader} px-5 sm:px-6 py-4 flex items-center justify-between shrink-0`}>
              <div>
                <h3 className="font-extrabold text-lg">Semakan Pesanan</h3>
                <span className="text-xs text-rose-500 font-mono font-bold">MEJA {tableParam}</span>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {cart.map((item) => (
                <div key={item.cartItemId} className={`${bgSubCard} rounded-2xl p-4 flex items-center justify-between gap-3 sm:gap-4`}>
                  <div className="space-y-1 flex-1 min-w-0">
                    <h4 className={`font-bold text-xs sm:text-sm ${textTitle} truncate`}>{item.name}</h4>
                    {item.selectedOptions && (
                      <p className={`text-[11px] ${textMuted} italic truncate`}>
                        {formatSelectedOptions(item.selectedOptions)}
                      </p>
                    )}
                    {item.itemNote && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">Nota: {item.itemNote}</p>
                    )}
                    <p className="font-mono text-xs font-black text-rose-500">RM {(item.price * item.quantity).toFixed(2)}</p>
                  </div>

                  {/* Quantity controls */}
                  <div className={`flex items-center gap-1.5 ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-900 border-slate-800'} border rounded-xl p-1 shrink-0`}>
                    <button
                      onClick={() => handleUpdateCartQty(item.cartItemId, -1)}
                      className={`p-1 ${textMuted} hover:text-slate-900 dark:hover:text-white transition`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className={`font-mono font-bold text-xs px-1.5 ${textTitle}`}>{item.quantity}</span>
                    <button
                      onClick={() => handleUpdateCartQty(item.cartItemId, 1)}
                      className={`p-1 ${textMuted} hover:text-slate-900 dark:hover:text-white transition`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Order Type Selection: Dine-In vs Takeaway (Pulsing glowing border line when unselected) */}
              <div className={`space-y-2.5 pt-2 rounded-2xl p-3 transition-all duration-300 ${
                orderType === null
                  ? 'bg-amber-500/10 border-2 border-amber-500/80 animate-pulse shadow-lg shadow-amber-500/20'
                  : 'bg-transparent border border-transparent'
              }`}>
                <label className={`font-black text-xs block ${orderType === null ? 'text-amber-500' : textTitle}`}>
                  Pilihan Jenis Pesanan
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOrderType('DINE_IN')}
                    className={`py-3.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all duration-200 transform active:scale-95 ${
                      orderType === 'DINE_IN'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/40 ring-2 ring-rose-500/50'
                        : orderType === null
                          ? `${bgSubCard} text-slate-800 dark:text-slate-200 border-amber-500/60 hover:border-amber-400`
                          : `${bgSubCard} ${textMuted} hover:border-slate-400`
                    }`}
                  >
                    <span>🍽️ Makan Di Sini</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderType('TAKEAWAY')}
                    className={`py-3.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 transform active:scale-95 ${
                      orderType === 'TAKEAWAY'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/40 ring-2 ring-amber-400/50'
                        : orderType === null
                          ? `${bgSubCard} text-slate-800 dark:text-slate-200 border-amber-500/60 hover:border-amber-400`
                          : `${bgSubCard} ${textMuted} hover:border-slate-400`
                    }`}
                  >
                    <span>🛍️ Bungkus (Takeaway)</span>
                  </button>
                </div>
              </div>

              {/* Overall Table Note */}
              <div className="space-y-2 pt-2">
                <label className={`font-bold text-xs ${textTitle}`}>Nota Khas Pesanan Meja Ini</label>
                <input
                  type="text"
                  placeholder="Contoh: Sila bungkuskan air, minta sudu lebih..."
                  value={overallNote}
                  onChange={(e) => setOverallNote(e.target.value)}
                  className={`w-full ${bgInput} rounded-2xl px-4 py-3 text-xs outline-none transition`}
                />
              </div>
            </div>

            {/* Checkout Action Footer (NEAT MOBILE ORDER SUMMARY FIX) */}
            <div className={`p-4 sm:p-5 ${bgDrawerFooter} border-t border-slate-200 dark:border-slate-800 space-y-3 shrink-0`}>
              
              {/* Organized Receipt Breakdown */}
              {(() => {
                const checkoutTotals = calculateReceiptTotals(totalCartPrice, receiptSettings, {
                  isTakeaway: orderType === 'TAKEAWAY',
                  itemCount: totalCartCount,
                  takeawayItemCount: orderType === 'TAKEAWAY' ? totalCartCount : 0,
                  takeawaySubtotal: orderType === 'TAKEAWAY' ? totalCartPrice : 0
                });
                return (
                  <div className={`${bgSubCard} p-3.5 rounded-2xl space-y-2 text-xs font-mono border border-slate-200 dark:border-slate-800`}>
                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                      <span>Subtotal ({totalCartCount} item):</span>
                      <span className={`font-bold ${textTitle}`}>RM {totalCartPrice.toFixed(2)}</span>
                    </div>

                    {/* SST (if enabled) */}
                    {checkoutTotals.enableSst && (
                      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                        <span>SST ({checkoutTotals.sstRate}%):</span>
                        <span className={`font-bold ${textTitle}`}>RM {checkoutTotals.sstAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Service Charge (if enabled) */}
                    {checkoutTotals.enableServiceCharge && (
                      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                        <span>Cas Servis ({checkoutTotals.serviceChargeRate}%):</span>
                        <span className={`font-bold ${textTitle}`}>RM {checkoutTotals.serviceChargeAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Custom Charge (if enabled) */}
                    {checkoutTotals.enableCustomCharge && (
                      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                        <span>{checkoutTotals.customChargeName}:</span>
                        <span className={`font-bold ${textTitle}`}>RM {checkoutTotals.customChargeFinal.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Takeaway Charge (Cas Bungkus - Auto dikenakan bila pilih Bungkus, Auto tolak bila Dine-In!) */}
                    {checkoutTotals.enableTakeawayCharge && checkoutTotals.isTakeaway && checkoutTotals.takeawayChargeFinal > 0 && (
                      <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
                        <span>🛍️ Cas Bungkus ({checkoutTotals.takeawayChargeType === 'RM' ? `RM ${checkoutTotals.takeawayChargeAmountVal.toFixed(2)}${checkoutTotals.takeawayItemCount > 1 ? ` x ${checkoutTotals.takeawayItemCount}` : ''}` : `${checkoutTotals.takeawayChargeAmountVal}%`}):</span>
                        <span>+ RM {checkoutTotals.takeawayChargeFinal.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-sans font-black">
                      <span className={textTitle}>JUMLAH KESELURUHAN:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-base sm:text-lg">RM {checkoutTotals.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={handleSendOrderToKitchen}
                disabled={!orderType}
                className={`w-full py-4 font-black rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all duration-300 text-xs uppercase tracking-wider ${
                  orderType !== null
                    ? 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 shadow-rose-600/30 active:scale-95 cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-500 opacity-60 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                }`}
              >
                <Utensils className="w-5 h-5" />
                <span>HANTAR PESANAN KE DAPUR</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FREE PLAN QUOTA EXCEEDED MODAL (100/100 ORDERS LIMIT REACHED) */}
      {isQuotaExceededModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 shadow-2xl animate-scaleUp">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/80 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-md animate-bounce">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 text-xs font-black rounded-full border border-rose-300 dark:border-rose-800">
                HAD PELAN PERCUMA TERCAPAI (100/100 PESANAN)
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Kuota 100 Pesanan Pelan Percuma Habis
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Restoran ini sedang menggunakan Pelan Percuma dan telah mencapai had maksimum <strong>100 pesanan per 4 bulan</strong>.
              </p>
            </div>

            {/* Countdown Timer Card */}
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 p-4 rounded-2xl space-y-1.5 text-left">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Auto Renew Kuota Baharu Dalam:</span>
              </div>
              <div className="text-sm font-black font-mono text-rose-900 dark:text-rose-200">
                {quotaCountdown}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              Sila minta pemilik restoran menaik taraf ke Pelan Langganan untuk pesanan tanpa had!
            </p>

            <button
              onClick={() => setIsQuotaExceededModalOpen(false)}
              className="w-full py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs rounded-2xl shadow-lg hover:brightness-110 active:scale-95 transition"
            >
              Faham & Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
