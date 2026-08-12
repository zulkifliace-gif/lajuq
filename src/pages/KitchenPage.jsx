import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOrder } from '../context/OrderContext';
import { isDrinkItem } from '../utils/bluetoothPrinter';
import KDSSettingsModal from '../components/KDSSettingsModal';
import KDSStockModal from '../components/KDSStockModal';
import SystemHealthModal from '../components/SystemHealthModal';
import { Volume2, VolumeX, Printer, CheckCircle2, ChevronRight, Menu, X, ExternalLink, Activity, ArrowLeft, Utensils, Zap, PackageCheck, Settings, Bluetooth, AlertTriangle, RefreshCw, Layers, Check, Bell, Loader2, Lock, Flame, Coffee, CheckCircle, Clock, CheckSquare, ShieldCheck, XCircle, ArrowRight } from 'lucide-react';
import DemoOverlayGuard from '../components/DemoOverlayGuard';
import { Link } from 'react-router-dom';

// Calculate elapsed minutes from original created_at timestamp
function getElapsedMinutes(timestamp) {
  if (!timestamp) return 0;
  let ts = timestamp;
  if (typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+')) {
    ts = ts.replace(' ', 'T') + 'Z';
  }
  const start = new Date(ts).getTime();
  if (isNaN(start)) return 0;
  const elapsed = Date.now() - start;
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / 60000);
}

// Safe helper to parse items array
function getSafeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch(e) { return []; }
  }
  return [];
}

export default function KitchenPage() {
  const { 
    orders, menuItems, updateKitchenStatus, cancelOrderFromKitchen, cancelOrderItemsFromKitchen, isAudioEnabled, enableAudio, 
    btDevice, kitchenBtDevice, kitchenBtConnecting, 
    connectKitchenBluetooth, disconnectKitchenBluetooth, receiptSettings, updateReceiptSettings,
    failedPrintOrderIds = {}, manualPrintOrder, markStationCooking, markStationItemsDone,
    playBeepSound, isKdsAuthFailed, resetKdsAuthStatus
  } = useOrder();

  // Track previous order count / new order IDs to play sound ONLY in Kitchen Display System (KDS)
  const prevOrderIdsRef = useRef(new Set());
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (!orders || orders.length === 0) return;

    // PAYMENT_PENDING orders are excluded — only PENDING or COOKING trigger KDS chime
    const currentPendingOrders = orders.filter(o =>
      o.kitchen_status === 'PENDING' || o.kitchen_status === 'COOKING'
    );
    const currentOrderIds = new Set(currentPendingOrders.map(o => o.order_id));

    if (isInitialMountRef.current) {
      prevOrderIdsRef.current = currentOrderIds;
      isInitialMountRef.current = false;
      return;
    }

    let hasNewOrder = false;
    currentOrderIds.forEach(id => {
      if (!prevOrderIdsRef.current.has(id)) {
        hasNewOrder = true;
      }
    });

    prevOrderIdsRef.current = currentOrderIds;

    if (hasNewOrder) {
      playBeepSound();
    }
  }, [orders, playBeepSound]);

  const [activeTab, setActiveTab] = useState('ACTIVE'); // ACTIVE (Wave 1) | QUEUE (Wave 2) | COMPLETED
  const [audioBannerDismissed, setAudioBannerDismissed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  // Station Filter State: ALL (Semua) | FOOD (Dapur Utama) | BAR (Stesen Bar / Air)
  const [stationFilter, setStationFilter] = useState(() => {
    return localStorage.getItem('fb_kds_station_filter') || 'ALL';
  });

  const handleStationFilterChange = (filter) => {
    setStationFilter(filter);
    localStorage.setItem('fb_kds_station_filter', filter);
  };

  // Per-Order Card Mute State (Mute/Unmute 16+ Min Idle Alert Sounds)
  const [mutedOrderIds, setMutedOrderIds] = useState(() => new Set());

  const toggleMuteOrder = (orderId) => {
    setMutedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Synchronize Wave Settings with persistent SQLite Receipt Settings
  const waveCapacity = receiptSettings?.waveCapacity !== undefined ? Number(receiptSettings.waveCapacity) : 10;
  const waveMode = receiptSettings?.waveMode !== false;

  const handleSetWaveCapacity = (cap) => {
    if (cap === 0) {
      updateReceiptSettings({ waveMode: false, waveCapacity: 0 });
    } else {
      updateReceiptSettings({ waveMode: true, waveCapacity: cap });
    }
  };

  // Live timer tick for 40-second cooking delay countdown & 16-minute alert checks
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 16-MINUTE IDLE ORDER RECURRING ALERT SOUND SYSTEM (EVERY 2 MINUTES)
  // SOUND FILE: "R Alert Sounds.mp3"
  // STESEN SEMUA SAHAJA (stationFilter === 'ALL') — Muted on FOOD (Dapur) & BAR (Bar / Air)!
  const lastAlertMinuteRef = useRef({});

  useEffect(() => {
    if (!orders || orders.length === 0) {
      lastAlertMinuteRef.current = {};
      return;
    }

    // Clean up completed/removed order IDs from memory
    const activeOrderIds = new Set(orders.map(o => o.order_id));
    Object.keys(lastAlertMinuteRef.current).forEach(id => {
      if (!activeOrderIds.has(id)) {
        delete lastAlertMinuteRef.current[id];
      }
    });

    // Restricted STRICTLY to 'ALL' (🌐 Semua Stesen) view!
    if (stationFilter !== 'ALL') return;

    const unfulfilledOrders = orders.filter(o => o.kitchen_status === 'PENDING' || o.kitchen_status === 'COOKING');
    if (unfulfilledOrders.length === 0) return;

    let shouldSoundAlert = false;

    unfulfilledOrders.forEach(ord => {
      // Muted individually if staff clicked Mute icon on this order card
      if (mutedOrderIds.has(ord.order_id)) return;

      const elapsedMin = getElapsedMinutes(ord.created_at || ord.timestamp);
      // Triggers at min 16, and repeats every 2 minutes (16, 18, 20, 22...)
      if (elapsedMin >= 16) {
        const currentBucket = Math.floor(elapsedMin);
        if (currentBucket % 2 === 0) {
          if (!lastAlertMinuteRef.current) lastAlertMinuteRef.current = {};
          const prevFired = lastAlertMinuteRef.current[ord.order_id];
          if (prevFired !== currentBucket) {
            lastAlertMinuteRef.current[ord.order_id] = currentBucket;
            shouldSoundAlert = true;
          }
        }
      }
    });

    if (shouldSoundAlert) {
      try {
        const alertAudio = new Audio('/sound/R%20Alert%20Sounds.mp3');
        alertAudio.play().catch(e => console.warn('KDS 16-min R Alert Sound play error:', e));
      } catch (e) {
        console.warn('KDS audio exception:', e);
      }
    }
  }, [now, orders, stationFilter, mutedOrderIds]);



  // Item & Order Cancellation Modal State (Store Order ID for safe re-renders)
  const [cancellationOrderId, setCancellationOrderId] = useState(null);
  const [selectedCancelIndices, setSelectedCancelIndices] = useState([]); // Array of index numbers
  const [cancellationReason, setCancellationReason] = useState('Bahan mentah / stok hidangan ini telah habis');

  const cancellationOrder = useMemo(() => {
    if (!cancellationOrderId) return null;
    return orders.find(o => o.order_id === cancellationOrderId) || null;
  }, [cancellationOrderId, orders]);

  const cancelModalItems = useMemo(() => {
    return cancellationOrder ? getSafeItems(cancellationOrder.items) : [];
  }, [cancellationOrder]);

  const handleOpenCancelModal = (ord) => {
    if (!ord) return;
    setCancellationOrderId(ord.order_id);
    setSelectedCancelIndices([]);
    setCancellationReason('Bahan mentah / stok hidangan ini telah habis');
  };

  const toggleCancelIndex = (idx) => {
    setSelectedCancelIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  // Mobile & Tablet Hamburger Menu Drawer State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lock background body scroll when mobile menu drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
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
  }, [isMobileMenuOpen]);

  // Manual Printing Loading & Success Track State
  const [printingOrderId, setPrintingOrderId] = useState(null);
  const [printErrorMsg, setPrintErrorMsg] = useState('');
  const [printedOrderIds, setPrintedOrderIds] = useState(() => new Set());

  const isPrinterConnected = Boolean(kitchenBtDevice || btDevice);

  const handleManualPrint = async (ord) => {
    // 1. Check & block if printer is not connected
    if (!isPrinterConnected) {
      setPrintErrorMsg('Sila sambungkan Bluetooth / Printer terlebih dahulu.');
      setTimeout(() => setPrintErrorMsg(''), 4000);
      return;
    }

    try {
      setPrintingOrderId(ord.order_id);
      // 2. Send print command to Bluetooth printer
      const success = await manualPrintOrder(ord, stationFilter);

      // 3. ONLY ON SUCCESSFUL PRINT: Record order in printedOrderIds to change printer icon color!
      if (success !== false) {
        setPrintedOrderIds(prev => new Set(prev).add(ord.order_id));
      }
      setPrintingOrderId(null);
    } catch (err) {
      setPrintingOrderId(null);
      setPrintErrorMsg(err.message || 'Sila sambungkan Bluetooth / Printer terlebih dahulu.');
      setTimeout(() => setPrintErrorMsg(''), 4000);
    }
  };

  // ---------------------------------------------------------------
  // STATION COMPLETION HELPERS
  // ---------------------------------------------------------------

  // Check if all food items in an order are marked done (excluding cancelled items)
  const isFoodDone = (items = []) => {
    const foodItems = getSafeItems(items).filter(i => !i.cancelled && !isDrinkItem(i, menuItems));
    return foodItems.length === 0 || foodItems.every(i => i.food_done);
  };

  // Check if all drink items in an order are marked done (excluding cancelled items)
  const isDrinkDone = (items = []) => {
    const drinkItems = getSafeItems(items).filter(i => !i.cancelled && isDrinkItem(i, menuItems));
    return drinkItems.length === 0 || drinkItems.every(i => i.bar_done);
  };

  // Order can only be Served when ALL items (food + drink) are marked done
  const canServeOrder = (items = []) => isFoodDone(items) && isDrinkDone(items);

  // Per-item status label for display in card body
  const getItemLabel = (item) => {
    const isDrink = isDrinkItem(item, menuItems);
    if (isDrink) {
      if (item.bar_done) return { label: 'Siap Bancuh' };
      if (item.bar_cooking) return { label: 'Sedang Bancuh' };
      return { label: 'Menunggu Bancuh' };
    } else {
      if (item.food_done) return { label: 'Siap Masak' };
      if (item.food_cooking) return { label: 'Sedang Masak' };
      return { label: 'Menunggu Masak' };
    }
  };

  // Helper to filter items per station (Item-Level Card Filtering)
  const getDisplayItems = (items) => {
    const safeItems = getSafeItems(items);
    if (stationFilter === 'FOOD') return safeItems.filter(i => !isDrinkItem(i, menuItems));
    if (stationFilter === 'BAR') return safeItems.filter(i => isDrinkItem(i, menuItems));
    return safeItems;
  };



  // Filter active orders (PENDING, COOKING, READY) — EXCLUDE CANCELLED & PAYMENT_PENDING
  // PAYMENT_PENDING = Pre-Pay mode orders waiting for cashier payment confirmation.
  // They must NOT appear on KDS until payment is confirmed and status transitions to PENDING.
  const activeOrders = orders.filter(o =>
    o.kitchen_status === 'PENDING' ||
    o.kitchen_status === 'COOKING' ||
    o.kitchen_status === 'READY'
  );

  const completedOrders = orders.filter(o =>
    o.kitchen_status === 'SERVED' ||
    o.kitchen_status === 'CANCELLED'
  );

  // FIFO Sort by timestamp (oldest orders first)
  const sortedActiveOrders = [...activeOrders].sort((a, b) => {
    const tA = new Date(a.created_at || a.timestamp).getTime();
    const tB = new Date(b.created_at || b.timestamp).getTime();
    return tA - tB;
  });

  // WAVE QUEUE SYSTEM PARTITIONING
  const wave1Orders = [];
  const wave2Orders = [];

  if (waveMode && waveCapacity > 0) {
    sortedActiveOrders.forEach((ord) => {
      if (ord.wave_number === 2) {
        wave2Orders.push(ord);
      } else if (ord.wave_number === 1) {
        wave1Orders.push(ord);
      } else {
        if (wave1Orders.length < waveCapacity || ord.kitchen_status === 'READY') {
          wave1Orders.push({ ...ord, wave_number: 1 });
        } else {
          wave2Orders.push({ ...ord, wave_number: 2 });
        }
      }
    });

    wave2Orders.sort((a, b) => {
      if (a.queue_position && b.queue_position) return a.queue_position - b.queue_position;
      return new Date(a.created_at || a.timestamp).getTime() - new Date(b.created_at || b.timestamp).getTime();
    });
  } else {
    sortedActiveOrders.forEach((ord) => {
      wave1Orders.push({ ...ord, wave_number: 1 });
    });
  }

  // Calculate total active Weight in Wave 1
  const currentWave1Weight = wave1Orders.reduce((sum, o) => sum + (Number(o.item_weight) || 1), 0);

  // Counts for Stats Bar
  const pendingCount = activeOrders.filter(o => o.kitchen_status === 'PENDING').length;
  const cookingCount = activeOrders.filter(o => o.kitchen_status === 'COOKING').length;
  const readyCount = activeOrders.filter(o => o.kitchen_status === 'READY').length;

  return (
    <DemoOverlayGuard>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* Audio Autoplay Permission Overlay Banner */}
      {!isAudioEnabled && !audioBannerDismissed && (
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 text-slate-950 px-4 sm:px-6 py-2.5 sm:py-3 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-amber-400 z-50">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse shrink-0 fill-slate-950" />
            <div className="text-xs sm:text-sm font-extrabold">
              <span>Browser Audio Polisi: Sila aktifkan bunyi notifikasi dapur supaya bunyi BEEP berfungsi apabila pesanan baharu tiba!</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                enableAudio();
                setAudioBannerDismissed(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 border border-slate-800 transition transform active:scale-95 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>AKTIFKAN AUDIO DAPUR 🔊</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Error Toast for Manual Print */}
      {printErrorMsg && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 bg-rose-600 text-white font-extrabold px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl border border-rose-400 flex items-center gap-3 text-xs animate-bounce max-w-xs sm:max-w-md">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{printErrorMsg}</span>
        </div>
      )}

      {/* FULL-SCREEN OVERLAY: KDS AUTH REJECTION / EXPIRED TOKEN WARNING */}
      {isKdsAuthFailed && (
        <div className="fixed inset-0 z-50 bg-rose-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center text-white animate-fadeIn">
          <div className="bg-rose-900/90 border-2 border-rose-500 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 animate-pulse">
            <div className="h-20 w-20 bg-rose-500/30 border border-rose-400 text-rose-300 rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-xl">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase">
                🚨 Sambungan Dapur Terputus!
              </h2>
              <p className="text-sm text-rose-200 leading-relaxed font-medium">
                Token pengesahan Staf pada peranti KDS ini telah luput atau sambungan Socket telah ditolak selepas 3 percubaan automatik.
              </p>
            </div>
            <div className="bg-rose-950/80 border border-rose-700/60 p-4 rounded-2xl text-xs text-rose-300 text-left space-y-1 font-mono">
              <p>• Status: <strong>SOCKET_AUTH_REJECTED (401)</strong></p>
              <p>• Tindakan: Sila tekan butang di bawah untuk menyegarkan sesi secara manual.</p>
            </div>
            <button
              onClick={async () => {
                if (resetKdsAuthStatus) await resetKdsAuthStatus();
                window.location.reload();
              }}
              className="w-full py-4 px-6 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-rose-900/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>🔄 Segarkan Sesi & Sambung Semula KDS</span>
            </button>
          </div>
        </div>
      )}

      {/* KDS Header Bar - Responsive Mobile & Tablet Layout */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <Link to="/staff" className="demo-bypass p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition" title="Kembali ke Portal Staf">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg sm:text-xl shadow-lg shadow-amber-500/20 shrink-0">
              <Utensils className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-1.5">
                Kitchen Display (KDS)
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[9px] sm:text-[10px] font-mono border border-amber-500/30">KDS</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">Paparan Skrin Dapur & Bar Real-Time</p>
            </div>
          </div>
        </div>

        {/* DESKTOP NAVBAR ACTIONS (Visible on lg screens) */}
        <div className="hidden lg:flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none justify-end">
          
          {/* STATION FILTER TOGGLE BUTTONS */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
            <button
              onClick={() => handleStationFilterChange('ALL')}
              className={`demo-bypass px-2.5 py-1.5 rounded-lg font-extrabold transition flex items-center gap-1 whitespace-nowrap ${
                stationFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Memaparkan semua hidangan (Makanan & Minuman)"
            >
              <Layers className="w-4 h-4" />
              <span>Semua</span>
            </button>
            <button
              onClick={() => handleStationFilterChange('FOOD')}
              className={`demo-bypass px-2.5 py-1.5 rounded-lg font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                stationFilter === 'FOOD'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Hanya memaparkan item Dapur Utama (Makanan)"
            >
              <Flame className="w-4 h-4" />
              <span>Dapur</span>
            </button>
            <button
              onClick={() => handleStationFilterChange('BAR')}
              className={`demo-bypass px-2.5 py-1.5 rounded-lg font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                stationFilter === 'BAR'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Hanya memaparkan item Stesen Bar (Minuman/Air)"
            >
              <Coffee className="w-4 h-4" />
              <span>Bar / Air</span>
            </button>
          </div>

          {/* PRINTER CONNECTION STATUS BADGE & CONNECT BUTTON */}
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold font-mono whitespace-nowrap shrink-0 ${
            isPrinterConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            <span className={`h-2 w-2 rounded-full ${isPrinterConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500 animate-ping'}`}></span>
            <span>{isPrinterConnected ? '🟢 Printer OK' : '🔴 Terputus'}</span>
          </div>

          {kitchenBtDevice ? (
            <button
              onClick={disconnectKitchenBluetooth}
              className="text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 px-2.5 py-1.5 rounded-xl border border-rose-500/30 font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              title="Putuskan sambungan printer dapur"
            >
              Putuskan
            </button>
          ) : (
            <button
              onClick={connectKitchenBluetooth}
              disabled={kitchenBtConnecting}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs flex items-center gap-1 border border-amber-500/30 shadow-lg transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="Pusat Sambungan Thermal Printer Bluetooth Dapur"
            >
              {kitchenBtConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Mencari...</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                  <span>Sambung</span>
                </>
              )}
            </button>
          )}

          {/* Audio Toggle Badge Button */}
          <button
            onClick={() => enableAudio()}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition whitespace-nowrap shrink-0 ${
              isAudioEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
            }`}
          >
            {isAudioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{isAudioEnabled ? 'Audio' : 'Muted'}</span>
          </button>

          {/* Health Check Monitor Button */}
          <button
            onClick={() => setIsHealthModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 font-extrabold rounded-xl text-xs flex items-center gap-1.5 border border-emerald-500/40 transition cursor-pointer whitespace-nowrap shrink-0 shadow-md shadow-emerald-600/20"
            title="Diagnostik Real-time KDS, Token, & Latensi Pipeline"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Health Check</span>
          </button>

          {/* Stock Update Modal Button */}
          <button
            onClick={() => setIsStockModalOpen(true)}
            className="px-3 py-1.5 bg-[#163F35] hover:bg-[#12332B] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 border border-[#163F35]/40 shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
            title="Buka Modal Pengurusan Stok Menu KDS"
          >
            <PackageCheck className="w-3.5 h-3.5 text-amber-300" />
            <span>Update Stok</span>
          </button>

          {/* KDS Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-xl text-xs flex items-center gap-1 border border-amber-500/30 transition cursor-pointer whitespace-nowrap shrink-0"
            title="Buka Tetapan KDS (Wave, Saiz Resit & Bunyi)"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span>Tetapan KDS</span>
          </button>

          {/* Lock Terminal Button */}
          <button
            onClick={() => {
              sessionStorage.removeItem('is_staff_authenticated');
              sessionStorage.removeItem('fb_staff_auth');
              window.location.reload();
            }}
            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl text-xs flex items-center gap-1 border border-rose-500/30 transition cursor-pointer whitespace-nowrap shrink-0"
            title="Kunci Terminal & Keluar Sesi Staf"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Kunci</span>
          </button>
        </div>

        {/* MOBILE & TABLET HAMBURGER BUTTON (Visible on < lg screens) */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="demo-bypass px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 font-bold text-xs shadow-md"
            aria-label="Buka Menu Navigasi"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span>Menu Navigasi</span>
          </button>
        </div>
      </header>

      {/* MOBILE & TABLET SLIDE-OUT NAV DRAWER */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-xs flex justify-end lg:hidden animate-fadeIn font-sans"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'pan-y' }}
            className="w-full max-w-xs sm:max-w-sm bg-slate-900 border-l border-slate-800 h-full p-5 flex flex-col space-y-5 overflow-y-auto shadow-2xl overscroll-contain"
          >
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
                  <Utensils className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-sm text-white">Navigasi KDS Dapur</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECTION 1: STATION FILTER TOGGLE */}
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold font-mono text-slate-400 uppercase tracking-wider block">
                STESEN DIPAPARKAN:
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => { handleStationFilterChange('ALL'); setIsMobileMenuOpen(false); }}
                  className={`demo-bypass w-full p-3 rounded-2xl font-black text-xs flex items-center justify-between border transition cursor-pointer ${
                    stationFilter === 'ALL' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> Semua Stesen</span>
                  {stationFilter === 'ALL' && <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { handleStationFilterChange('FOOD'); setIsMobileMenuOpen(false); }}
                  className={`demo-bypass w-full p-3 rounded-2xl font-black text-xs flex items-center justify-between border transition cursor-pointer ${
                    stationFilter === 'FOOD' ? 'bg-emerald-600 text-white border-emerald-400 shadow-md' : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2"><Flame className="w-4 h-4" /> Dapur Utama (Makanan)</span>
                  {stationFilter === 'FOOD' && <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { handleStationFilterChange('BAR'); setIsMobileMenuOpen(false); }}
                  className={`demo-bypass w-full p-3 rounded-2xl font-black text-xs flex items-center justify-between border transition cursor-pointer ${
                    stationFilter === 'BAR' ? 'bg-indigo-600 text-white border-indigo-400 shadow-md' : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2"><Coffee className="w-4 h-4" /> Stesen Bar (Minuman/Air)</span>
                  {stationFilter === 'BAR' && <Check className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* SECTION 2: ACTIONS */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-extrabold font-mono text-slate-400 uppercase tracking-wider block">
                TINDAKAN & PENGURUSAN:
              </label>
              
              <button
                onClick={() => { setIsStockModalOpen(true); setIsMobileMenuOpen(false); }}
                className="w-full p-3.5 bg-[#163F35] hover:bg-[#12332B] text-white font-bold rounded-2xl text-xs flex items-center justify-between border border-[#163F35]/40 shadow-sm transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-amber-300" />
                  <span>Update Stok Menu & Add-on</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
                className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 text-amber-300 font-bold rounded-2xl text-xs flex items-center justify-between border border-amber-500/30 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span>Tetapan KDS (Wave & Bunyi)</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { enableAudio(); setIsMobileMenuOpen(false); }}
                className={`w-full p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between border transition cursor-pointer ${
                  isAudioEnabled ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>Audio Notifikasi Chime</span>
                </span>
                <span className="font-mono text-[11px] font-extrabold">{isAudioEnabled ? 'AKTIF' : 'MUTED'}</span>
              </button>

              {kitchenBtDevice ? (
                <button
                  onClick={() => { disconnectKitchenBluetooth(); setIsMobileMenuOpen(false); }}
                  className="w-full p-3.5 bg-rose-500/20 text-rose-300 font-bold rounded-2xl text-xs flex items-center justify-between border border-rose-500/30 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    <span>Putuskan Printer Dapur</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">🟢 Sambung</span>
                </button>
              ) : (
                <button
                  onClick={() => { connectKitchenBluetooth(); setIsMobileMenuOpen(false); }}
                  className="w-full p-3.5 bg-slate-950 text-amber-400 font-bold rounded-2xl text-xs flex items-center justify-between border border-amber-500/30 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Bluetooth className="w-4 h-4 text-blue-400" />
                    <span>Sambung Printer Bluetooth Dapur</span>
                  </span>
                  <span className="text-[10px] font-mono text-rose-400">🔴 Terputus</span>
                </button>
              )}
            </div>

            {/* LOCK FOOTER */}
            <div className="pt-4 border-t border-slate-800 mt-auto">
              <button
                onClick={() => {
                  sessionStorage.removeItem('is_staff_authenticated');
                  sessionStorage.removeItem('fb_staff_auth');
                  window.location.reload();
                }}
                className="w-full p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 border border-rose-500/30 transition cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Kunci Terminal & Keluar Sesi</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Main KDS Stream Area - Responsive Mobile & Tablet Layout */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
        
        {/* KDS Counter Stats & Weight Capacity Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none w-full lg:w-auto">
            <div className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
              <span className="text-[11px] sm:text-xs text-slate-400">Menunggu: <strong className="text-white text-xs sm:text-sm">{pendingCount}</strong></span>
            </div>
            <div className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="text-[11px] sm:text-xs text-slate-400">Dimasak: <strong className="text-amber-400 text-xs sm:text-sm">{cookingCount}</strong></span>
            </div>
            <div className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-[11px] sm:text-xs text-slate-400">Siap: <strong className="text-emerald-400 text-xs sm:text-sm">{readyCount}</strong></span>
            </div>

            {/* WEIGHT CAPACITY INDICATOR */}
            {waveMode && (
              <div className="bg-slate-950 px-3 py-2 rounded-xl border border-amber-500/30 flex items-center gap-1.5 font-mono shrink-0">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] sm:text-xs text-slate-400">
                  Beban: <strong className={`text-xs sm:text-sm ${currentWave1Weight > waveCapacity ? 'text-rose-400' : 'text-amber-400'}`}>{currentWave1Weight} / {waveCapacity}</strong>
                </span>
              </div>
            )}
          </div>

          {/* View Tab Selector with Wave System Badges */}
          <div className="flex items-center bg-slate-950 p-1 sm:p-1.5 rounded-2xl border border-slate-800 w-full lg:w-auto overflow-x-auto scrollbar-none justify-between sm:justify-start gap-1">
            <button
              onClick={() => setActiveTab('ACTIVE')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'ACTIVE'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🌊 Wave 1 ({wave1Orders.length})</span>
            </button>

            {waveMode && (
              <button
                onClick={() => setActiveTab('QUEUE')}
                className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'QUEUE'
                    ? 'bg-amber-600 text-white shadow-md'
                    : wave2Orders.length > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⏳ Wave 2 Queue ({wave2Orders.length})</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('COMPLETED')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                activeTab === 'COMPLETED'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Selesai ({completedOrders.length})
            </button>
          </div>

        </div>

        {/* ACTIVE STATION FILTER BANNER */}
        {stationFilter !== 'ALL' && (
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-indigo-300 flex items-center gap-2">
              <span>📌 Stesen Aktif:</span>
              <strong className="text-white bg-indigo-600/30 border border-indigo-500/40 px-2.5 py-0.5 rounded-lg">
                {stationFilter === 'FOOD' ? '🍳 Dapur Utama (Makanan)' : '🧋 Stesen Bar / Air (Minuman)'}
              </strong>
            </span>
            <span className="text-slate-400 text-[11px]">
              Kad disaring secara automatik. Pesanan tanpa item {stationFilter === 'FOOD' ? 'makanan' : 'minuman'} disembunyikan.
            </span>
          </div>
        )}

        {/* HIGH-DEMAND WAVE QUEUE BANNER ALERT */}
        {waveMode && wave2Orders.length > 0 && activeTab === 'ACTIVE' && (
          <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xl animate-pulse">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 bg-amber-500/20 text-amber-400 rounded-xl font-black text-xs sm:text-sm shrink-0 border border-amber-500/40">
                ⏳ WAVE 2 QUEUE
              </div>
              <div>
                <p className="font-extrabold text-amber-300 text-xs sm:text-sm">
                  Terdapat {wave2Orders.length} pesanan baharu menanti dalam Wave 2 Queue!
                </p>
                <p className="text-slate-400 text-[10px] sm:text-[11px] mt-0.5">
                  Dapur terkawal (Maksimum {waveCapacity} slot beban). Pesanan beratur secara Strict FIFO tanpa potong giliran.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('QUEUE')}
              className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shrink-0 transition flex items-center justify-center gap-1 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <span>Lihat Wave 2 Queue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 1: WAVE 1 (ACTIVE KITCHEN CARDS - MAX CAPACITY) */}
        {/* ===================================================================== */}
        {activeTab === 'ACTIVE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {wave1Orders.length === 0 ? (
              <div className="col-span-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 sm:p-12 text-center space-y-4">
                <div className="h-14 w-14 sm:h-16 sm:w-16 bg-slate-800 text-slate-500 rounded-3xl flex items-center justify-center mx-auto text-2xl">
                  👨‍🍳
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-300">Tiada Pesanan Dapur Aktif</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Semua pesanan telah siap disaji. Hantar pesanan baharu dari web pelanggan atau kaunter untuk menguji skrin dapur ini.
                </p>
              </div>
            ) : (
              wave1Orders.slice(0, 30).map((ord) => {
                const displayItems = getDisplayItems(ord.items);
                // ITEM-LEVEL CARD FILTERING: Hide card completely if no items match active station filter!
                if (displayItems.length === 0) return null;

                const elapsedMin = getElapsedMinutes(ord.created_at || ord.timestamp);
                const isPending = ord.kitchen_status === 'PENDING';
                const isCooking = ord.kitchen_status === 'COOKING';
                const isReady = ord.kitchen_status === 'READY';
                const isOverdue = elapsedMin >= 15 && !isReady;

                const headerBg = isReady ? 'bg-emerald-600 text-white' :
                                 isOverdue ? 'bg-rose-600 text-white animate-pulse' :
                                 isCooking ? 'bg-amber-500 text-slate-950' :
                                 'bg-slate-800 text-slate-200';

                const isTakeaway = ord.order_type === 'TAKEAWAY';
                const cardBorder = isReady ? 'border-emerald-500/50 shadow-emerald-500/10' :
                                   isOverdue ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-rose-500/30' :
                                   isCooking ? 'border-amber-500/50 shadow-amber-500/10' :
                                   isTakeaway ? 'border-amber-400 ring-2 ring-amber-400/30 shadow-amber-500/20' :
                                   'border-slate-800 shadow-slate-950';

                const weight = Number(ord.item_weight) || 1;
                const isPrintFailed = Boolean(failedPrintOrderIds?.[ord.order_id]);

                const cardBgClass = isTakeaway ? 'bg-[#FFF3E0]' : 'bg-[#FAF7EF]';
                const headerBgClass = isTakeaway ? 'bg-[#FFE0B2]' : 'bg-[#EDE7D8]';
                const footerBgClass = isTakeaway ? 'bg-[#FFE0B2]' : 'bg-[#EDE7D8]';
                const borderClass = isOverdue ? 'border-rose-600 ring-2 ring-rose-500/40 shadow-rose-500/20' :
                                    isReady ? 'border-[#163F35]' :
                                    isCooking ? (isTakeaway ? 'border-[#E67E22]' : 'border-[#1F5B4A]') :
                                    isTakeaway ? 'border-[#F97316]' :
                                    'border-black/15';

                return (
                  <div
                    key={ord.order_id}
                    className={`${cardBgClass} rounded-2xl border-2 ${borderClass} shadow-md flex flex-col justify-between overflow-hidden transition-all text-[#1F2937] animate-fadeIn`}
                  >
                    {/* Docket Header */}
                    <div className={`${headerBgClass} px-4 py-3 border-b border-black/10 flex items-center justify-between font-sans`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-lg sm:text-xl font-black text-[#1F2937] tracking-tight">MEJA {ord.table_number}</span>
                          <span className="font-mono text-xs text-[#4B5563] font-bold">#{ord.order_id}</span>
                          {isTakeaway && (
                            <span className="bg-[#C2410C] text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase shadow-xs">
                              🛍️ BUNGKUS
                            </span>
                          )}
                          <span className="bg-black/10 text-[#1F2937] text-[10px] font-bold font-mono px-1.5 py-0.5 rounded">
                            W1 {Number(ord.item_weight) > 1 && `(${Number(ord.item_weight)}S)`}
                          </span>
                        </div>
                        {ord.customer_name && (
                          <span className="text-xs text-[#4B5563] font-bold truncate max-w-[150px]">
                            Pelanggan: {ord.customer_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* PRINT FAILED BADGE */}
                        {isPrintFailed && (
                          <button
                            onClick={() => handleManualPrint(ord)}
                            className="px-2 py-1 bg-rose-600 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 animate-pulse border border-rose-500 cursor-pointer"
                            title="Auto-print gagal. Klik untuk cetak semula!"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Gagal</span>
                          </button>
                        )}

                        {/* RIGHT ACTION COLUMN: MUTE BUTTON DIRECTLY ABOVE TIMER BADGE */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {/* CARD MUTE/UNMUTE TOGGLE BUTTON (ICON ONLY, NO TEXT/EMOJI) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMuteOrder(ord.order_id);
                            }}
                            className={`p-1.5 rounded-lg transition cursor-pointer border flex items-center justify-center ${
                              mutedOrderIds.has(ord.order_id)
                                ? 'bg-rose-500/20 text-rose-700 border-rose-400/60 shadow-xs'
                                : 'bg-black/10 hover:bg-black/20 text-emerald-800 border-black/20'
                            }`}
                            title={mutedOrderIds.has(ord.order_id) ? 'Bunyi di-MUTE. Klik untuk Unmute' : 'Bunyi UNMUTED. Klik untuk Mute'}
                          >
                            {mutedOrderIds.has(ord.order_id) ? (
                              <VolumeX className="w-4 h-4 text-rose-600" />
                            ) : (
                              <Volume2 className="w-4 h-4 text-emerald-700" />
                            )}
                          </button>

                          {/* TIMER BADGE */}
                          <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 shrink-0 ${
                            isOverdue ? 'bg-rose-600 text-white animate-pulse' :
                            isCooking ? 'bg-[#F59E0B] text-slate-950 font-black' :
                            'bg-black/10 text-[#1F2937]'
                          }`}>
                            <Clock className="w-3 h-3" />
                            <span>{elapsedMin} mnt</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dashed Tear Divider Line */}
                    <div className="border-b-2 border-dashed border-black/15" />

                    {/* Takeaway Highlight Banner */}
                    {isTakeaway && (
                      <div className="bg-[#EA580C] text-white px-4 py-1.5 flex items-center justify-between font-black text-[11px] uppercase tracking-wider border-b border-black/20">
                        <span>🛍️ PESANAN BUNGKUS</span>
                        <span className="text-[10px] font-mono text-amber-200">BEKAS BUNGKUS</span>
                      </div>
                    )}

                    {/* Overall Order Special Notes Highlight */}
                    {ord.special_notes && (
                      <div className="bg-[#F0D8D3] border-b border-[#A23B2E]/30 px-4 py-2 text-[#A23B2E] font-bold text-xs break-words whitespace-pre-wrap leading-snug">
                        Nota Meja: {ord.special_notes}
                      </div>
                    )}

                    {/* Card Body: Items List */}
                    <div className={`p-4 space-y-3 flex-1 ${cardBgClass}`}>
                      {(stationFilter === 'ALL' ? ord.items : displayItems).map((item, idx) => {
                        const label = getItemLabel(item);
                        const shouldShow = stationFilter === 'ALL' || displayItems.includes(item);
                        if (!shouldShow) return null;
                        const isItemCancelled = item.cancelled === true;

                        return (
                          <div key={idx} className={`pb-2.5 border-b border-black/10 last:border-none last:pb-0 ${isItemCancelled ? 'opacity-50' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-base font-extrabold leading-snug break-words flex-1 ${isItemCancelled ? 'line-through text-[#6B6F66]' : 'text-[#1F2937]'}`}>
                                <span className={`${isTakeaway ? 'text-[#C2410C]' : 'text-[#163F35]'} font-black mr-1.5`}>
                                  {item.quantity}x
                                </span>
                                {item.name}
                              </span>

                              {/* Per-item station completion label */}
                              {isItemCancelled ? (
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F0D8D3] text-[#A23B2E] border border-[#A23B2E]/30">
                                  Dibatalkan ❌
                                </span>
                              ) : (
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  label.label.includes('Siap') ? 'bg-[#D9E5DF] text-[#163F35] border-[#163F35]/30' :
                                  label.label.includes('Sedang') ? 'bg-[#F3E3C0] text-[#7C5A14] border-[#D9A441]/40' :
                                  'bg-black/5 text-[#4B5563] border-black/15'
                                }`}>
                                  {label.label}
                                </span>
                              )}
                            </div>

                            {/* Options / Modifiers */}
                            {item.options && (
                              <p className={`text-xs text-[#4B5563] italic mt-0.5 break-words whitespace-pre-wrap leading-relaxed ${isItemCancelled ? 'line-through' : ''}`}>
                                ↳ {item.options}
                              </p>
                            )}

                            {/* Item Special Note */}
                            {item.special_note && (
                              <p className="text-xs text-[#A23B2E] italic font-medium mt-0.5 break-words whitespace-pre-wrap leading-relaxed">
                                Nota: {item.special_note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Bar */}
                    <div className={`p-3 ${footerBgClass} border-t border-black/10 space-y-2`}>
                      {/* ======= BAR STATION ACTIONS ======= */}
                      {stationFilter === 'BAR' && (() => {
                        const drinkItems = (ord.items || []).filter(i => !i.cancelled && isDrinkItem(i, menuItems));
                        const allBarCooking = drinkItems.length > 0 && drinkItems.some(i => i.bar_cooking || i.bar_done);
                        const allBarDone = drinkItems.length === 0 || drinkItems.every(i => i.bar_done);
                        const isPrinted = printedOrderIds.has(ord.order_id);

                        const renderPrinterBtn = () => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualPrint(ord);
                            }}
                            disabled={printingOrderId === ord.order_id}
                            className={`w-[12%] sm:w-[10%] min-w-[38px] py-3 font-bold rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 border ${
                              isPrinted
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 shadow-md shadow-amber-500/30'
                                : 'bg-white hover:bg-slate-100 text-[#1F2937] border-black/20 shadow-xs'
                            }`}
                            title={isPrinted ? 'Resit Fizikal Telah Dicetak (Cetak Semula)' : 'Cetak Slip Dapur'}
                          >
                            {printingOrderId === ord.order_id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Printer className="w-4 h-4" />
                            )}
                          </button>
                        );

                        if (allBarDone) {
                          return (
                            <div className="flex items-stretch gap-2 w-full">
                              <div className="w-[88%] sm:w-[90%] py-2.5 bg-[#D9E5DF] text-[#163F35] font-bold rounded-xl flex items-center justify-center text-xs border border-[#163F35]/20">
                                <span>Semua Minuman Siap Dibancuh ✅</span>
                              </div>
                              {renderPrinterBtn()}
                            </div>
                          );
                        }

                        if (!allBarCooking) {
                          return (
                            <div className="flex items-stretch gap-2 w-full">
                              <button
                                onClick={() => markStationCooking(ord.order_id, 'BAR')}
                                className="w-[88%] sm:w-[90%] py-3 bg-[#1F5B4A] hover:bg-[#163F35] text-white font-bold rounded-xl shadow transition text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center"
                              >
                                Mula Bancuh
                              </button>
                              {renderPrinterBtn()}
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-stretch gap-2 w-full">
                            <button
                              onClick={() => markStationItemsDone(ord.order_id, 'BAR')}
                              className="w-[88%] sm:w-[90%] py-3 bg-[#163F35] hover:bg-[#0E2A23] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition text-xs uppercase tracking-wider shadow cursor-pointer"
                            >
                              <span>Siap Bancuh ✅</span>
                            </button>
                            {renderPrinterBtn()}
                          </div>
                        );
                      })()}

                      {/* ======= FOOD STATION ACTIONS ======= */}
                      {stationFilter === 'FOOD' && (() => {
                        const foodItems = (ord.items || []).filter(i => !i.cancelled && !isDrinkItem(i, menuItems));
                        const allFoodCooking = foodItems.length > 0 && foodItems.some(i => i.food_cooking || i.food_done);
                        const allFoodDone = foodItems.length === 0 || foodItems.every(i => i.food_done);
                        const isPrinted = printedOrderIds.has(ord.order_id);

                        const renderPrinterBtn = () => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualPrint(ord);
                            }}
                            disabled={printingOrderId === ord.order_id}
                            className={`w-[12%] sm:w-[10%] min-w-[38px] py-3 font-bold rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 border ${
                              isPrinted
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 shadow-md shadow-amber-500/30'
                                : 'bg-white hover:bg-slate-100 text-[#1F2937] border-black/20 shadow-xs'
                            }`}
                            title={isPrinted ? 'Resit Fizikal Telah Dicetak (Cetak Semula)' : 'Cetak Slip Dapur'}
                          >
                            {printingOrderId === ord.order_id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Printer className="w-4 h-4" />
                            )}
                          </button>
                        );

                        if (allFoodDone) {
                          return (
                            <div className="flex items-stretch gap-2 w-full">
                              <div className="w-[88%] sm:w-[90%] py-2.5 bg-[#D9E5DF] text-[#163F35] font-bold rounded-xl flex items-center justify-center text-xs border border-[#163F35]/20">
                                <span>Semua Makanan Siap Dimasak ✅</span>
                              </div>
                              {renderPrinterBtn()}
                            </div>
                          );
                        }

                        if (!allFoodCooking) {
                          return (
                            <div className="flex items-stretch gap-2 w-full">
                              <button
                                onClick={() => markStationCooking(ord.order_id, 'FOOD')}
                                className="w-[74%] sm:w-[78%] py-3 bg-[#1F5B4A] hover:bg-[#163F35] text-white font-bold rounded-xl shadow transition text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center"
                              >
                                Mula Masak
                              </button>
                              <button
                                onClick={() => handleOpenCancelModal(ord)}
                                className="w-[14%] sm:w-[12%] py-3 bg-[#F0D8D3] hover:bg-[#E8C4BC] text-[#A23B2E] font-bold rounded-xl border border-[#A23B2E]/30 transition text-xs shrink-0 cursor-pointer flex items-center justify-center"
                                title="Batal Item / Stok Habis"
                              >
                                Batal
                              </button>
                              {renderPrinterBtn()}
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-stretch gap-2 w-full">
                            <button
                              onClick={() => markStationItemsDone(ord.order_id, 'FOOD')}
                              className="w-[88%] sm:w-[90%] py-3 bg-[#163F35] hover:bg-[#0E2A23] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition text-xs uppercase tracking-wider shadow cursor-pointer"
                            >
                              <span>Siap Masak ✅</span>
                            </button>
                            {renderPrinterBtn()}
                          </div>
                        );
                      })()}

                      {/* ======= ALL STATION VIEW — GLOBAL ACTIONS ======= */}
                      {stationFilter === 'ALL' && (() => {
                        const canServe = canServeOrder(ord.items);
                        const allFoodDone = isFoodDone(ord.items);
                        const allDrinkDone = isDrinkDone(ord.items);
                        const isPrinted = printedOrderIds.has(ord.order_id);

                        return (
                          <>
                            {!allFoodDone && (() => {
                              const foodItems = (ord.items || []).filter(i => !i.cancelled && !isDrinkItem(i, menuItems));
                              const foodCooking = foodItems.some(i => i.food_cooking && !i.food_done);
                              if (foodItems.length === 0) return null;
                              return foodCooking ? (
                                <button
                                  onClick={() => markStationItemsDone(ord.order_id, 'FOOD')}
                                  className="w-full py-2.5 bg-[#D9E5DF] hover:bg-[#C8DAD2] text-[#163F35] border border-[#163F35]/30 font-bold rounded-xl transition text-xs cursor-pointer"
                                >
                                  Siap Masak (Makanan) ✅
                                </button>
                              ) : (
                                <button
                                  onClick={() => markStationCooking(ord.order_id, 'FOOD')}
                                  className="w-full py-2.5 bg-[#1F5B4A] hover:bg-[#163F35] text-white font-bold rounded-xl transition text-xs cursor-pointer"
                                >
                                  Mula Masak (Makanan)
                                </button>
                              );
                            })()}

                            {!allDrinkDone && (() => {
                              const drinkItems = (ord.items || []).filter(i => !i.cancelled && isDrinkItem(i, menuItems));
                              const drinkCooking = drinkItems.some(i => i.bar_cooking && !i.bar_done);
                              if (drinkItems.length === 0) return null;
                              return drinkCooking ? (
                                <button
                                  onClick={() => markStationItemsDone(ord.order_id, 'BAR')}
                                  className="w-full py-2.5 bg-[#D9E5DF] hover:bg-[#C8DAD2] text-[#163F35] border border-[#163F35]/30 font-bold rounded-xl transition text-xs cursor-pointer"
                                >
                                  Siap Bancuh (Minuman) ✅
                                </button>
                              ) : (
                                <button
                                  onClick={() => markStationCooking(ord.order_id, 'BAR')}
                                  className="w-full py-2.5 bg-[#1F5B4A] hover:bg-[#163F35] text-white font-bold rounded-xl transition text-xs cursor-pointer"
                                >
                                  Mula Bancuh (Minuman)
                                </button>
                              );
                            })()}

                            {!canServe && isPending && (
                              <button
                                onClick={() => handleOpenCancelModal(ord)}
                                className="w-full py-2.5 bg-[#F0D8D3] hover:bg-[#E8C4BC] text-[#A23B2E] font-bold rounded-xl border border-[#A23B2E]/30 transition text-xs cursor-pointer"
                              >
                                Batal Item / Pesanan
                              </button>
                            )}

                            {/* 1-ROW ACTION: CLEAR / SERVE (90%) + PRINTER ICON-ONLY (10%) */}
                            <div className="flex items-stretch gap-2 w-full mt-1">
                              <button
                                onClick={() => canServe ? updateKitchenStatus(ord.order_id, 'SERVED') : null}
                                disabled={!canServe}
                                className={`w-[88%] sm:w-[90%] py-3 font-bold rounded-xl border transition text-xs uppercase tracking-wider flex items-center justify-center ${
                                  canServe
                                    ? 'bg-[#22262B] hover:bg-black text-[#EDE7D8] border-black cursor-pointer shadow-md'
                                    : 'bg-black/10 text-black/40 border-black/10 cursor-not-allowed'
                                }`}
                              >
                                {canServe ? 'Clear / Serve ✅' : `Clear / Serve (${[!isFoodDone(ord.items) && 'Masak', !isDrinkDone(ord.items) && 'Bancuh'].filter(Boolean).join(', ')} belum siap)`}
                              </button>

                              {/* ICON-ONLY PRINTER BUTTON (10% LEBAR) DYNAMIC COLOR INDICATOR */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleManualPrint(ord);
                                }}
                                disabled={printingOrderId === ord.order_id}
                                className={`w-[12%] sm:w-[10%] min-w-[38px] py-3 font-bold rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 border ${
                                  isPrinted
                                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 shadow-md shadow-amber-500/30'
                                    : 'bg-white hover:bg-slate-100 text-[#1F2937] border-black/20 shadow-xs'
                                }`}
                                title={isPrinted ? 'Resit Fizikal Telah Dicetak (Cetak Semula)' : 'Cetak Slip Dapur'}
                              >
                                {printingOrderId === ord.order_id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Printer className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                  </div>
                );
              })
            )}

          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: WAVE 2 QUEUE (HOLDING WAITING AREA FOR OVERFLOW ORDERS) */}
        {/* ===================================================================== */}
        {activeTab === 'QUEUE' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-2">
              <h3 className="text-sm sm:text-base font-extrabold text-amber-300 flex items-center gap-2">
                <span>⏳ Wave 2 Queue (Senarai Menunggu Dapur — Strict FIFO)</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pesanan dalam Wave 2 ditahan seketika bagi mengelakkan tukang masak panik. Pesanan beratur secara Strict FIFO. Ia akan dimasukkan ke skrin utama Wave 1 secara automatik apabila baki slot mencukupi.
              </p>
            </div>

            {wave2Orders.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 sm:p-12 text-center space-y-3">
                <div className="text-3xl">✨</div>
                <h4 className="text-base font-bold text-slate-300">Tiada Pesanan Dalam Wave 2 Queue</h4>
                <p className="text-xs text-slate-500">Semua pesanan berada dalam skrin utama Wave 1.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {wave2Orders.map((ord, idx) => {
                  const displayItems = getDisplayItems(ord.items);
                  if (displayItems.length === 0) return null;

                  const elapsedMin = getElapsedMinutes(ord.created_at || ord.timestamp);
                  const isOverdue = elapsedMin >= 15;
                  const queuePos = idx + 1;
                  const weight = Number(ord.item_weight) || 1;
                  const isTakeaway = ord.order_type === 'TAKEAWAY';
                  const cardBgClass = isTakeaway ? 'bg-[#FFF3E0]' : 'bg-[#FAF7EF]';
                  const headerBgClass = isTakeaway ? 'bg-[#FFE0B2]' : 'bg-[#EDE7D8]';
                  const footerBgClass = isTakeaway ? 'bg-[#FFE0B2]' : 'bg-[#EDE7D8]';

                  return (
                    <div
                      key={ord.order_id}
                      className={`${cardBgClass} rounded-2xl border-2 ${
                        isOverdue ? 'border-rose-600 ring-2 ring-rose-500/40 shadow-rose-500/20' : isTakeaway ? 'border-[#F97316]' : 'border-black/15'
                      } shadow-md flex flex-col justify-between overflow-hidden transition text-[#1F2937]`}
                    >
                      <div className={`${headerBgClass} px-4 py-3 border-b border-black/10 flex items-center justify-between font-sans`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-[#1F2937]">MEJA {ord.table_number}</span>
                          <span className="bg-[#F3E3C0] text-[#7C5A14] border border-[#D9A441]/40 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                            QUEUE #{queuePos}
                          </span>
                        </div>
                        {/* RIGHT ACTION COLUMN: MUTE BUTTON DIRECTLY ABOVE TIMER BADGE */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {/* CARD MUTE/UNMUTE TOGGLE BUTTON (ICON ONLY, NO TEXT/EMOJI) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMuteOrder(ord.order_id);
                            }}
                            className={`p-1.5 rounded-lg transition cursor-pointer border flex items-center justify-center ${
                              mutedOrderIds.has(ord.order_id)
                                ? 'bg-rose-500/20 text-rose-700 border-rose-400/60 shadow-xs'
                                : 'bg-black/10 hover:bg-black/20 text-emerald-800 border-black/20'
                            }`}
                            title={mutedOrderIds.has(ord.order_id) ? 'Bunyi di-MUTE. Klik untuk Unmute' : 'Bunyi UNMUTED. Klik untuk Mute'}
                          >
                            {mutedOrderIds.has(ord.order_id) ? (
                              <VolumeX className="w-4 h-4 text-rose-600" />
                            ) : (
                              <Volume2 className="w-4 h-4 text-emerald-700" />
                            )}
                          </button>
                          <span className="font-mono text-xs text-[#4B5563] font-bold">{elapsedMin} mnt</span>
                        </div>
                      </div>

                      {/* Dashed Tear Divider Line */}
                      <div className="border-b-2 border-dashed border-black/15" />

                      {/* TIMER STARVATION OVERDUE WARNING BADGE */}
                      {isOverdue && (
                        <div className="bg-rose-600 text-white font-bold text-[11px] px-4 py-1.5 flex items-center gap-1.5 uppercase tracking-wider animate-pulse">
                          <AlertTriangle className="w-4 h-4" />
                          <span>TERPERANGKAP DI QUEUE ({elapsedMin} MNT LALU)</span>
                        </div>
                      )}

                      {isTakeaway && (
                        <div className="bg-[#EA580C] text-white text-xs px-4 py-1.5 font-black border-b border-black/20">
                          🛍️ PESANAN BUNGKUS / TAKEAWAY
                        </div>
                      )}

                      <div className={`p-4 space-y-2 flex-1 ${cardBgClass}`}>
                        <div className="text-[11px] font-mono text-[#4B5563] mb-2 font-bold">
                          Beban: {weight} Slot
                        </div>

                        {displayItems.map((item, itemIdx) => (
                          <div key={itemIdx} className="text-xs font-bold text-[#1F2937]">
                            <span className={`${isTakeaway ? 'text-[#C2410C]' : 'text-[#163F35]'} font-black mr-1.5`}>{item.quantity}x</span>
                            {item.name}
                            {item.options && <span className="text-[11px] text-[#4B5563] font-normal italic block ml-5">↳ {item.options}</span>}
                          </div>
                        ))}
                      </div>

                      <div className={`p-3 ${footerBgClass} border-t border-black/10 text-center`}>
                        <span className="text-[11px] text-[#7C5A14] font-mono font-bold">
                          Strict FIFO: Menunggu {weight} slot kosong di Wave 1
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: COMPLETED ORDERS HISTORY */}
        {/* ===================================================================== */}
        {activeTab === 'COMPLETED' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
            <h3 className="text-xs sm:text-sm font-bold text-slate-300">Rekod Pesanan Yang Telah Disaji</h3>

            {completedOrders.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs italic">
                Belum ada pesanan yang diselesai disaji.
              </div>
            ) : (
              <div className="space-y-3">
                {completedOrders.map(ord => {
                  const displayItems = getDisplayItems(ord.items);
                  if (displayItems.length === 0) return null;
                  const isTakeaway = ord.order_type === 'TAKEAWAY';
                  const cardBgClass = isTakeaway ? 'bg-[#FFF3E0]' : 'bg-[#FAF7EF]';

                  return (
                    <div key={ord.order_id} className={`${cardBgClass} p-3.5 sm:p-4 rounded-2xl border ${isTakeaway ? 'border-[#F97316]/40' : 'border-black/15'} flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#1F2937]`}>
                      <div className="space-y-1">
                        <div className="font-bold">
                          <span className="font-extrabold text-[#163F35] font-mono">MEJA {ord.table_number}</span> • #{ord.order_id}
                          {isTakeaway && <span className="ml-1.5 bg-[#C2410C] text-white text-[9px] font-bold px-1.5 py-0.2 rounded font-mono">BUNGKUS</span>}
                          {ord.customer_name && <span className="text-[#4B5563] ml-2 font-semibold">({ord.customer_name})</span>}
                        </div>
                        <div className="text-[#4B5563]">
                          {displayItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </div>
                      </div>
                      <span className={`self-start sm:self-auto px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        ord.kitchen_status === 'CANCELLED'
                          ? 'bg-[#F0D8D3] text-[#A23B2E] border border-[#A23B2E]/30'
                          : 'bg-[#D9E5DF] text-[#163F35] border border-[#163F35]/30'
                      }`}>
                        {ord.kitchen_status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ITEM & ORDER CANCELLATION MODAL */}
      {cancellationOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Batal Item / Pesanan — MEJA {cancellationOrder.table_number}</span>
              </h3>
              <button 
                onClick={() => setCancellationOrderId(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Order ID: <strong className="text-white font-mono">{cancellationOrder.order_id}</strong></span>
                {cancellationOrder.customer_name && (
                  <span className="text-amber-300 font-bold">👤 {cancellationOrder.customer_name}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Pilih item mana yang hendak dibatalkan, atau pilih &quot;Batal Semua&quot; untuk membatalkan pesanan ini secara keseluruhan.
              </p>
            </div>

            {/* Item Selection List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Senarai Item Dalam Pesanan:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCancelIndices(cancelModalItems.map((_, i) => i));
                    }}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition underline cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCancelIndices([])}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-300 transition underline cursor-pointer"
                  >
                    Nyahpilih
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {cancelModalItems.map((item, idx) => {
                  const isChecked = selectedCancelIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleCancelIndex(idx)}
                      className={`p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-md'
                          : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition ${
                          isChecked ? 'bg-rose-500 border-rose-400 text-white shadow' : 'border-slate-700 bg-slate-900'
                        }`}>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <p className="font-extrabold text-white text-sm">
                            <span className="text-rose-400 mr-1.5">{item.quantity}x</span>
                            {item.name}
                          </p>
                          {item.options && (
                            <p className="text-[10px] text-amber-300 font-normal">⚡ {item.options}</p>
                          )}
                        </div>
                      </div>

                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
                        isChecked
                          ? 'bg-rose-600 text-white border-rose-400'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}>
                        {isChecked ? '🚨 Batalkan' : 'Kekal'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Reason Presets */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Sebab Pembatalan Pantas:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  'Bahan mentah / stok hidangan ini telah habis',
                  'Pelanggan minta batal item ini',
                  'Menu ini tidak lagi tersedia hari ini',
                  'Salah tekan pesanan oleh pelanggan'
                ].map((presetText) => (
                  <button
                    key={presetText}
                    type="button"
                    onClick={() => setCancellationReason(presetText)}
                    className={`text-left p-2.5 rounded-xl border text-[11px] font-semibold transition ${
                      cancellationReason === presetText
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {presetText}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Reason Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Nota Tambahan / Custom Reason:</label>
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl p-2.5 text-xs text-white outline-none"
                placeholder="Taip sebab stok habis / batal..."
                required
              />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  cancelOrderFromKitchen(cancellationOrder.order_id, cancellationReason);
                  setCancellationOrderId(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-400 font-bold rounded-xl text-xs transition cursor-pointer"
                title="Batal keseluruhan pesanan ini terus"
              >
                🚫 Batal Semua Pesanan
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setCancellationOrderId(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCancelIndices.length === 0) {
                      alert('Sila pilih sekurang-kurangnya 1 item untuk dibatalkan, atau tekan "Batal Semua Pesanan".');
                      return;
                    }
                    cancelOrderItemsFromKitchen(
                      cancellationOrder.order_id,
                      selectedCancelIndices,
                      cancellationReason
                    );
                    setCancellationOrderId(null);
                  }}
                  disabled={selectedCancelIndices.length === 0}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-extrabold rounded-xl shadow-lg shadow-rose-600/30 text-xs transition transform active:scale-95 cursor-pointer"
                >
                  Sahkan Batal Item Terpilih ({selectedCancelIndices.length})
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* KDS SETTINGS MODAL */}
      <KDSSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* KDS STOCK MANAGEMENT MODAL */}
      <KDSStockModal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
      />

      {/* SYSTEM HEALTH DIAGNOSTICS MODAL */}
      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />

    </div>
    </DemoOverlayGuard>
  );
}
