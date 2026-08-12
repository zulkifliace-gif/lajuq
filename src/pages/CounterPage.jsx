import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import QRModal from '../components/QRModal';
import ReceiptModal from '../components/ReceiptModal';
import ReceiptSettingsModal from '../components/ReceiptSettingsModal';
import EmergencyModeModal from '../components/EmergencyModeModal';
import TechnicalSupportModal from '../components/TechnicalSupportModal';
import SystemHealthModal from '../components/SystemHealthModal';
import { calculateReceiptTotals } from '../utils/receiptCalculator';
import { Monitor, QrCode, CreditCard, RefreshCw, Filter, Utensils, CheckCircle2, AlertCircle, ArrowLeft, ExternalLink, Bluetooth, Printer, Loader2, XCircle, Settings, Lock, Search, AlertOctagon, Menu, X, ChevronRight, Headphones, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

// Safe helper to parse items array
function getSafeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch(e) { return []; }
  }
  return [];
}

export default function CounterPage() {
  const { 
    tables, sessions, orders, createSession, completePayment, cancelSession, clearSingleTable, resetDemoData, receiptSettings,
    btDevice, btConnecting, btStatusMsg, connectCentralizedBluetooth, disconnectCentralizedBluetooth 
  } = useOrder();

  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTableQuery, setSearchTableQuery] = useState('');
  const [selectedTableForQR, setSelectedTableForQR] = useState(null); // Table object
  const [generatedSessionId, setGeneratedSessionId] = useState(null);

  const [selectedTableForBilling, setSelectedTableForBilling] = useState(null); // Table object
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Double-submit guard: prevent cashier from pressing 'Sahkan Bayaran' twice
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

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

  // Handle click on empty table to generate new QR session
  const handleEmptyTableClick = async (table) => {
    if (table.current_session_id && sessions[table.current_session_id]?.status === 'ACTIVE') {
      setSelectedTableForQR(table);
      setGeneratedSessionId(table.current_session_id);
    } else {
      const result = await createSession(table.table_number);
      if (result === null) {
        throw new Error("Sesi gagal dicipta (Mungkin isu payload atau server).");
      }
      if (typeof result === 'object' && result !== null && result.success === false) {
        if (result.error === 'FREE_PLAN_LIMIT_REACHED') {
          alert('Had 100 Pesanan (Plan Percuma) telah dicapai! Sila naik taraf langganan untuk terus menerima pesanan.');
        }
        return;
      }
      setSelectedTableForQR(table);
      setGeneratedSessionId(result); // result is the string ID
    }
  };

  // Handle click on active table (ADA_PELANGGAN or SEDANG_MAKAN)
  const handleActiveTableClick = (table) => {
    // --- LAYER 1: Direct lookup from table's current_session_id ---
    let currentSess = table.current_session_id ? sessions[table.current_session_id] : null;

    // --- LAYER 2: Search sessions by table_number (catches sync lag where
    //     sessions state has the session but table.current_session_id not yet updated) ---
    if (!currentSess || currentSess.status === 'CLOSED') {
      const sessFromTable = Object.values(sessions).find(
        s => Number(s.table_number) === Number(table.table_number) && s.status === 'ACTIVE'
      );
      if (sessFromTable) currentSess = sessFromTable;
    }

    // --- LAYER 3: Reconstruct session from active orders on this table ---
    if (!currentSess || currentSess.status === 'CLOSED') {
      const matchingOrder = orders.find(
        o => Number(o.table_number) === Number(table.table_number) && o.kitchen_status !== 'CANCELLED'
      );
      if (matchingOrder?.session_id) {
        currentSess = sessions[matchingOrder.session_id] || {
          session_id: matchingOrder.session_id,
          table_number: table.table_number,
          created_at: matchingOrder.created_at || new Date().toISOString(),
          status: 'ACTIVE'
        };
      }
    }

    // --- LAYER 4: Table status itself is proof — if ADA_PELANGGAN or SEDANG_MAKAN
    //     and no session found yet, generate a synthetic session ID from table data
    //     to allow billing panel to open (edge case: local state not yet synced) ---
    if (!currentSess || currentSess.status === 'CLOSED') {
      const isTrulyActive = table.status === 'ADA_PELANGGAN' || table.status === 'SEDANG_MAKAN';
      const activeId = table.current_session_id || `SES-${table.table_number}${Math.floor(1000 + Math.random() * 9000)}`;
      if (isTrulyActive) {
        const fallback = Object.values(sessions).find(
          s => Number(s.table_number) === Number(table.table_number) && s.status !== 'CLOSED'
        );
        currentSess = fallback || {
          session_id: activeId,
          table_number: table.table_number,
          created_at: new Date().toISOString(),
          status: 'ACTIVE'
        };
      }
    }

    if (!currentSess || currentSess.status === 'CLOSED') {
      return;
    }

    setSelectedTableForBilling({ ...table, current_session_id: currentSess.session_id });
  };

  // Handle Confirm Payment — with double-submit guard
  const handleConfirmPayment = async (sessionId, tableNumber) => {
    if (isConfirmingPayment) return; // Prevent double-submit
    setIsConfirmingPayment(true);
    try {
      await completePayment(sessionId, tableNumber);
      setSelectedTableForBilling(null);
    } catch (err) {
      alert(`Ralat pembayaran: ${err.message}`);
    } finally {
      // Release guard after short delay to allow state to settle
      setTimeout(() => setIsConfirmingPayment(false), 2000);
    }
  };

  // Filtered tables by status & search query
  // PREPAY_PENDING filter = tables with at least 1 order in PAYMENT_PENDING status
  const prepayPendingTableNums = new Set(
    orders
      .filter(o => {
        if (o.kitchen_status !== 'PAYMENT_PENDING') return false;
        // Verify this order belongs to an ACTIVE session currently sitting at the table
        const table = tables.find(t => t.table_number === o.table_number);
        return table && table.current_session_id === o.session_id && table.status !== 'KOSONG';
      })
      .map(o => o.table_number)
  );
  const countPrepayPending = prepayPendingTableNums.size;

  const filteredTables = tables.filter(t => {
    const matchStatus =
      filterStatus === 'KOSONG' ? t.status === 'KOSONG' :
      filterStatus === 'ADA_PELANGGAN' ? t.status === 'ADA_PELANGGAN' :
      filterStatus === 'SEDANG_MAKAN' ? t.status === 'SEDANG_MAKAN' :
      filterStatus === 'PREPAY_PENDING' ? prepayPendingTableNums.has(t.table_number) : true;

    const matchSearch = searchTableQuery.trim() === '' ||
      t.table_number.toString().includes(searchTableQuery.trim());

    return matchStatus && matchSearch;
  });

  // Calculate table statistics
  const countKosong = tables.filter(t => t.status === 'KOSONG').length;
  const countAdaPelanggan = tables.filter(t => t.status === 'ADA_PELANGGAN').length;
  const countSedangMakan = tables.filter(t => t.status === 'SEDANG_MAKAN').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      
      {/* POS Top Bar - Responsive Mobile & Tablet Layout */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <Link to="/staff" className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition" title="Kembali ke Portal Staf">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg sm:text-xl shadow-lg shadow-blue-600/20 shrink-0">
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-1.5">
                Kaunter & POS Panel
                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[9px] sm:text-[10px] font-mono border border-blue-500/30">POS</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">Pengurusan Meja & Bayaran Kaunter</p>
            </div>
          </div>
        </div>

        {/* DESKTOP ACTION CONTROLS (Visible on md screens) */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none justify-end">
          
          {/* Centralized Bluetooth Printer Button */}
          {!btDevice ? (
            <button
              onClick={connectCentralizedBluetooth}
              disabled={btConnecting}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/30 border border-blue-400 transition transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              {btConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
              <span>Sambung Printer</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1.5 rounded-xl text-xs whitespace-nowrap shrink-0">
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <Printer className="w-3.5 h-3.5 animate-pulse" />
                <span>{btDevice.name}</span>
              </div>
              <button
                onClick={disconnectCentralizedBluetooth}
                className="ml-1 p-0.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition cursor-pointer"
                title="Putuskan Sambungan Bluetooth"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          )}



          {/* Emergency Mode Toggle Button */}
          <button
            onClick={() => setIsEmergencyModalOpen(true)}
            className={`px-3 py-2 font-extrabold rounded-xl text-xs flex items-center gap-1.5 border transition cursor-pointer whitespace-nowrap shrink-0 ${
              receiptSettings?.emergencyMode?.enabled
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-600/40'
                : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border-rose-500/40'
            }`}
            title="Tetapan Mod Kecemasan / System Maintenance Lock"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>{receiptSettings?.emergencyMode?.enabled ? 'Mod Kecemasan: Aktif' : 'Mod Kecemasan'}</span>
          </button>

          {/* Health Check Monitor Button */}
          <button
            onClick={() => setIsHealthModalOpen(true)}
            className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 font-extrabold rounded-xl text-xs flex items-center gap-1.5 border border-emerald-500/40 transition cursor-pointer whitespace-nowrap shrink-0 shadow-md shadow-emerald-600/20"
            title="Diagnostik Real-time KDS, Token, & Latensi Pipeline"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Health Check</span>
          </button>

          {/* Technical Support Headset Button */}
          <button
            onClick={() => setIsSupportModalOpen(true)}
            className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-extrabold rounded-xl text-xs flex items-center gap-1.5 border border-indigo-500/40 transition cursor-pointer whitespace-nowrap shrink-0 shadow-md shadow-indigo-600/20"
            title="Sokongan Bantuan Teknikal (Telegram Bot)"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Bantuan Teknikal</span>
          </button>

          {/* Receipt Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1 border border-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            <span>Tetapan</span>
          </button>

          {/* Lock Terminal Button */}
          <button
            onClick={() => {
              sessionStorage.removeItem('is_staff_authenticated');
              sessionStorage.removeItem('fb_staff_auth');
              window.location.reload();
            }}
            className="px-2.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl text-xs flex items-center gap-1 border border-rose-500/30 transition cursor-pointer whitespace-nowrap shrink-0"
            title="Kunci Terminal & Keluar Sesi Staf"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Kunci</span>
          </button>

          <Link
            to="/kitchen"
            target="_blank"
            className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold rounded-xl text-xs flex items-center gap-1 transition whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>KDS Dapur</span>
          </Link>
        </div>

        {/* MOBILE & TABLET HAMBURGER BUTTON (Visible on < md screens) */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 font-bold text-xs shadow-md"
            aria-label="Buka Menu Navigasi POS"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span>Menu POS</span>
          </button>
        </div>
      </header>

      {/* MOBILE & TABLET SLIDE-OUT NAV DRAWER FOR POS */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-xs flex justify-end md:hidden animate-fadeIn font-sans"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'pan-y' }}
            className="w-full max-w-xs sm:max-w-sm bg-slate-900 border-l border-slate-800 h-full p-5 flex flex-col space-y-5 overflow-y-auto shadow-2xl overscroll-contain"
          >
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
                  <Monitor className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-sm text-white">Navigasi POS Kaunter</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* POS ACTIONS LIST */}
            <div className="space-y-2.5">
              <label className="text-[10px] font-extrabold font-mono text-slate-400 uppercase tracking-wider block">
                TINDAKAN & PENGURUSAN POS:
              </label>

              {/* EMERGENCY MODE */}
              <button
                onClick={() => { setIsEmergencyModalOpen(true); setIsMobileMenuOpen(false); }}
                className={`w-full p-3.5 rounded-2xl text-xs font-black flex items-center justify-between border transition cursor-pointer ${
                  receiptSettings?.emergencyMode?.enabled
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-md animate-pulse'
                    : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border-rose-500/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4" />
                  <span>{receiptSettings?.emergencyMode?.enabled ? 'Mod Kecemasan: Aktif' : 'Mod Kecemasan'}</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* PRINTER CONNECTION */}
              {!btDevice ? (
                <button
                  onClick={() => { connectCentralizedBluetooth(); setIsMobileMenuOpen(false); }}
                  disabled={btConnecting}
                  className="w-full p-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold rounded-2xl text-xs flex items-center justify-between border border-blue-400 shadow-md transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {btConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                    <span>Sambung Printer Bluetooth</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-80">Terputus</span>
                </button>
              ) : (
                <div className="w-full p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-xs flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-emerald-400">
                    <Printer className="w-4 h-4 animate-pulse" />
                    <span>{btDevice.name}</span>
                  </span>
                  <button
                    onClick={() => { disconnectCentralizedBluetooth(); setIsMobileMenuOpen(false); }}
                    className="px-2 py-1 bg-rose-500/20 text-rose-400 rounded-lg font-bold text-[11px] hover:bg-rose-500/30 transition cursor-pointer"
                  >
                    Putuskan
                  </button>
                </div>
              )}

              {/* TECHNICAL SUPPORT */}
              <button
                onClick={() => { setIsSupportModalOpen(true); setIsMobileMenuOpen(false); }}
                className="w-full p-3.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 font-extrabold rounded-2xl text-xs flex items-center justify-between border border-indigo-500/40 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-indigo-400" />
                  <span>Bantuan Teknikal</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* RECEIPT SETTINGS */}
              <button
                onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
                className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 text-slate-200 font-bold rounded-2xl text-xs flex items-center justify-between border border-slate-800 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-400" />
                  <span>Tetapan Resit & SST</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {/* OPEN KDS */}
              <Link
                to="/kitchen"
                target="_blank"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full p-3.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold rounded-2xl text-xs flex items-center justify-between border border-amber-500/30 transition"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  <span>Buka KDS Dapur</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </Link>

              {/* RESET SYSTEM DATA */}
              <button
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  if (window.confirm('ADAKAH ANDA PASTI UNTUK RESET SEMUA DATA SISTEM?\n\nSemua rekod pesanan, sesi meja, dan pangkalan data akan dikosongkan semula ke keadaan asal.')) {
                    await resetDemoData();
                    window.location.reload();
                  }
                }}
                className="w-full p-3.5 bg-slate-950 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 font-bold rounded-2xl text-xs flex items-center justify-between border border-slate-800 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-rose-400" />
                  <span>Reset Semula Data Sistem</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

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

      {/* EMERGENCY MODE ACTIVE WARNING BANNER ON POS HEADER */}
      {receiptSettings?.emergencyMode?.enabled && (
        <div className="bg-rose-600 text-white font-extrabold text-xs px-4 py-2.5 flex items-center justify-between gap-2 shadow-lg animate-pulse z-20">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>🚨 MOD KECEMASAN SEDANG AKTIF! Skrin Web Pelanggan DIBEKUKAN & DIKUNCI secara Real-Time.</span>
          </div>
          <button
            onClick={() => setIsEmergencyModalOpen(true)}
            className="underline hover:text-rose-100 text-[11px] font-bold cursor-pointer whitespace-nowrap"
          >
            Urus Mod Kecemasan →
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 space-y-5 sm:space-y-8">
        
        {/* Status Filter & Summary Bar - Responsive Mobile & Tablet Layout */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col lg:flex-row items-center justify-between gap-4">
          

          {/* Table Search Input Bar */}
          <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2.5 rounded-2xl border border-slate-800 w-full lg:w-72 shadow-inner">
            <Search className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              type="text"
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              placeholder="Cari No. Meja (cth: 5, 25)..."
              className="w-full bg-transparent text-white text-xs outline-none placeholder-slate-500 font-mono font-bold"
            />
            {searchTableQuery && (
              <button
                onClick={() => setSearchTableQuery('')}
                className="text-slate-500 hover:text-slate-300 text-xs font-bold px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center bg-slate-950 p-1 sm:p-1.5 rounded-2xl border border-slate-800 w-full lg:w-auto overflow-x-auto scrollbar-none justify-between sm:justify-start gap-1">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${filterStatus === 'ALL' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Semua ({tables.length})
            </button>
            <button
              onClick={() => setFilterStatus('KOSONG')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${filterStatus === 'KOSONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Kosong
            </button>
            <button
              onClick={() => setFilterStatus('ADA_PELANGGAN')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${filterStatus === 'ADA_PELANGGAN' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Ada Pelanggan
            </button>
            <button
              onClick={() => setFilterStatus('SEDANG_MAKAN')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${filterStatus === 'SEDANG_MAKAN' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Sedang Makan
            </button>
            {/* Pre-Pay tab — only shown when there are orders awaiting payment */}
            <button
              onClick={() => setFilterStatus('PREPAY_PENDING')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${filterStatus === 'PREPAY_PENDING' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50' : 'text-rose-400 hover:text-rose-200'}`}
            >
              💳 Menunggu Bayaran
              {countPrepayPending > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce leading-none">
                  {countPrepayPending}
                </span>
              )}
            </button>
          </div>

        </div>

        {/* Table Grid View - Responsive Mobile & Tablet Layout */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-rose-500" />
              <span>Grid Meja Restoran (1 - {tables.length})</span>
            </h2>
            <span className="text-[11px] sm:text-xs text-slate-400">Klik Meja Kosong (Jana QR) • Klik Meja Aktif (Bayaran)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filteredTables.map((table) => {
              const activeSession = table.current_session_id ? sessions[table.current_session_id] : null;
              const tableOrders = orders.filter(o => o.session_id === table.current_session_id);
              const validTableOrders = tableOrders.filter(o => o.kitchen_status !== 'CANCELLED');
              const hasPrepayPending = validTableOrders.some(o => o.kitchen_status === 'PAYMENT_PENDING');
              
              const totalSpent = validTableOrders.reduce((ordSum, o) => {
                const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
              }, 0);

              const isKosong = table.status === 'KOSONG';
              const isAdaPelanggan = table.status === 'ADA_PELANGGAN';
              const isSedangMakan = table.status === 'SEDANG_MAKAN';

              return (
                <div
                  key={table.table_number}
                  className={`relative rounded-2xl sm:rounded-3xl border p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl cursor-pointer ${
                    hasPrepayPending ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-950/50 animate-pulse' :
                    isKosong ? 'bg-slate-900/60 border-emerald-500/30 hover:border-emerald-400 hover:bg-slate-900' :
                    isAdaPelanggan ? 'bg-amber-950/30 border-amber-500/50 hover:border-amber-400 hover:bg-amber-950/50' :
                    'bg-blue-950/30 border-blue-500/50 hover:border-blue-400 hover:bg-blue-950/50'
                  }`}
                  onClick={async () => {
                    try {
                      if (isKosong) {
                        await handleEmptyTableClick(table);
                      } else {
                        handleActiveTableClick(table);
                      }
                    } catch (err) {
                      console.error('Failed to handle table click:', err);
                      alert('Gagal membuka meja. Sila cuba semula.');
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider ${
                      hasPrepayPending ? 'bg-rose-500 text-white font-black animate-bounce' :
                      isKosong ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      isAdaPelanggan ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {hasPrepayPending ? '💳 PRE-PAY BAYARAN' : isKosong ? 'KOSONG' : isAdaPelanggan ? 'ADA PELANGGAN' : 'SEDANG MAKAN'}
                    </span>

                    {activeSession && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTableForQR(table);
                          setGeneratedSessionId(table.current_session_id);
                        }}
                        className="p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                        title="Lihat Slip QR Sesi Ini"
                      >
                        <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}
                  </div>

                  <div className="my-4 sm:my-6 text-center space-y-0.5 sm:space-y-1">
                    <div className="text-[10px] sm:text-xs text-slate-400 font-mono">NOMBOR MEJA</div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      MEJA {table.table_number}
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-2.5 sm:pt-3 flex items-center justify-between text-xs">
                    {isKosong ? (
                      <div className="w-full text-center py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl transition flex items-center justify-center gap-1">
                        <QrCode className="w-3.5 h-3.5" />
                        <span className="text-[11px] sm:text-xs">Jana QR Sesi</span>
                      </div>
                    ) : (
                      <>
                        <div className="font-mono text-slate-400 text-[10px] sm:text-xs">
                          {validTableOrders.length} Pesanan {tableOrders.length > validTableOrders.length && <span className="text-rose-400 text-[9px] block sm:inline">({tableOrders.length - validTableOrders.length} Batal)</span>}
                        </div>
                        <div className="text-right">
                          {(() => {
                            const takeawayOrders = validTableOrders.filter(o => o.order_type === 'TAKEAWAY');
                            const hasTakeaway = takeawayOrders.length > 0;
                            const takeawaySubtotal = takeawayOrders.reduce((ordSum, o) => {
                              const uncancelledItems = getSafeItems(o.items).filter(i => !i.cancelled);
                              return ordSum + uncancelledItems.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
                            }, 0);
                            const takeawayItemCount = takeawayOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
                            const totalTableItems = validTableOrders.flatMap(o => getSafeItems(o.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                            const tableTotals = calculateReceiptTotals(totalSpent, receiptSettings, { 
                              isTakeaway: hasTakeaway, 
                              itemCount: totalTableItems,
                              takeawayItemCount,
                              takeawaySubtotal
                            });
                            return (
                              <>
                                <div className="font-mono font-bold text-emerald-400 text-xs sm:text-sm">
                                  RM {tableTotals.grandTotal.toFixed(2)}
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono hidden sm:block">{tableTotals.labelText}</div>
                              </>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* QR MODAL GENERATOR */}
      {selectedTableForQR && generatedSessionId && (
        <QRModal
          isOpen={Boolean(selectedTableForQR)}
          tableNumber={selectedTableForQR.table_number}
          sessionId={generatedSessionId}
          onClose={() => {
            setSelectedTableForQR(null);
            setGeneratedSessionId(null);
          }}
        />
      )}

      {/* RECEIPT & BILLING PAYMENT MODAL */}
      {selectedTableForBilling && (
        <ReceiptModal
          table={selectedTableForBilling}
          session={sessions[selectedTableForBilling.current_session_id] || { 
            session_id: selectedTableForBilling.current_session_id, 
            table_number: selectedTableForBilling.table_number, 
            status: 'ACTIVE' 
          }}
          sessionOrders={orders.filter(o => o.session_id === selectedTableForBilling.current_session_id)}
          isOpen={Boolean(selectedTableForBilling)}
          onClose={() => setSelectedTableForBilling(null)}
          onConfirmPayment={handleConfirmPayment}
          isConfirmingPayment={isConfirmingPayment}
          onCancelSession={(reason) => {
            cancelSession(selectedTableForBilling.current_session_id, selectedTableForBilling.table_number, reason);
            setSelectedTableForBilling(null);
          }}
        />
      )}

      {/* RECEIPT SETTINGS MODAL */}
      <ReceiptSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* EMERGENCY MAINTENANCE MODE CONTROL MODAL */}
      <EmergencyModeModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
      />

      {/* TECHNICAL SUPPORT TICKET MODAL */}
      <TechnicalSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
      />

      {/* SYSTEM HEALTH DIAGNOSTICS MODAL */}
      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />

    </div>
  );
}
