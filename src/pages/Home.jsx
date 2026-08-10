import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Menu, X, ChevronRight, Monitor, Smartphone, UtensilsCrossed, PlayCircle, RefreshCw, Zap, ShieldCheck, CheckCircle2, Settings, CreditCard, LogIn, LogOut, User, Sparkles } from 'lucide-react';
import FinancialPerformanceModule from '../components/FinancialPerformanceModule';
import SubscriptionModal from '../components/SubscriptionModal';
import AuthModal from '../components/AuthModal';
import FreePlanBadge from '../components/FreePlanBadge';

export default function Home() {
  const { seedSampleDemo, resetDemoData, tables, orders } = useOrder();
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.search.includes('demo=true')) {
      seedSampleDemo();
      navigate('/staff', { replace: true });
    }
  }, [location, seedSampleDemo, navigate]);

  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Background Scroll Lock when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const activeTablesCount = tables.filter(t => t.status !== 'KOSONG').length;
  const pendingOrdersCount = orders.filter(o => o.kitchen_status !== 'SERVED').length;

  const handleQuickDemo = () => {
    seedSampleDemo();
    // Navigate directly to counter or open customer page sample
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-[#F04D23] selection:text-white">
      
      {/* Top Header Navbar (LajuQ White Theme) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 py-3.5 flex items-center justify-between text-slate-900 shadow-sm">
        
        {/* Brand & Logo (Clickable -> Landing Page /) */}
        <Link
          to="/"
          className="flex items-center gap-3 group transition transform active:scale-95"
          title="Kembali ke Laman Utama LajuQ"
        >
          <div className="h-9 w-9 rounded-xl bg-[#F04D23] group-hover:bg-[#d93f17] flex items-center justify-center font-black shadow-md shadow-[#F04D23]/20 shrink-0 transition">
            <img src="/lajuq-favicon.svg" alt="LajuQ Logo" className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold tracking-tight text-xl text-slate-900 group-hover:text-[#F04D23] transition">
                Laju<span className="text-[#F04D23]">Q</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                Portal Staf
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium hidden sm:block">
              Sistem Pengurusan & Pesanan Restoran Digital
            </p>
          </div>
        </Link>

        {/* Desktop Actions, Profile & SaaS Status (Visible on lg screens) */}
        <div className="hidden lg:flex items-center gap-3">
          
          {/* Auth Status / Restaurant Profile */}
          {!user ? (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-extrabold text-xs rounded-full shadow-xs transition flex items-center gap-1.5 active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5 text-[#F04D23]" />
              <span>Log Masuk</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/90 rounded-full text-xs font-extrabold text-slate-800 transition shadow-sm active:scale-95"
                title="Tukar / Urus Akaun Restoran"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span>{tenant?.name || 'Restoran Nasi Kandar Aman'}</span>
              </button>

              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-[#F04D23] hover:bg-slate-100 rounded-full transition"
                title="Log Keluar Akaun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* SaaS Subscription Status Badge & Upgrade Button */}
          {(() => {
            const status = tenant?.subscription_status;
            const plan = (tenant?.plan_type || '').toLowerCase();

            // Active Subscriptions
            if (status === 'active' || status === 'past_due') {
              if (plan === 'free' || plan === 'percuma') {
                return (
                  <FreePlanBadge 
                    tenant={tenant} 
                    orders={orders} 
                    onUpgradeClick={() => setIsSubModalOpen(true)} 
                    isMobile={false} 
                  />
                );
              }

              let planText = 'plan 4bulan';
              if (plan.includes('8') || plan === 'pro' || plan === '8months') {
                planText = 'plan 8bulan';
              } else if (plan.includes('12') || plan === 'vps' || plan === '12months') {
                planText = 'plan 12bulan';
              } else if (plan.includes('4') || plan === 'starter' || plan === '4months') {
                planText = 'plan 4bulan';
              } else {
                planText = `plan ${plan}`;
              }

              return (
                <div className="flex items-center gap-2">
                  <div className={`px-3.5 py-1.5 border rounded-full text-xs font-extrabold flex items-center gap-1.5 ${status === 'past_due' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${status === 'past_due' ? 'text-rose-600' : 'text-emerald-600'}`} />
                    <span>status : {status === 'past_due' ? 'Tertunggak' : planText}</span>
                  </div>
                  <button
                    onClick={() => setIsSubModalOpen(true)}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-extrabold text-xs rounded-full shadow-xs transition active:scale-95 flex items-center gap-1.5"
                  >
                    Urus Langganan
                  </button>
                </div>
              );
            }

            // Default fallback for Trialing / Demo / Non-Subscribed accounts
            return (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-full text-[11px] font-bold text-slate-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Demo</span>
                </div>
                <button
                  onClick={() => setIsSubModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold text-xs rounded-full shadow-md shadow-[#F04D23]/25 flex items-center gap-1.5 transition transform hover:-translate-y-0.5 active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upgrade Langganan</span>
                </button>
              </div>
            );
          })()}

        </div>

        {/* Mobile & Tablet Hamburger Button */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition shadow-xs active:scale-95"
            aria-label="Buka Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

      </header>

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 transition-opacity duration-300 animate-fadeIn lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer Panel (Slide-In from Right) */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-[310px] max-w-[85vw] bg-white text-slate-900 z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out transform ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        } lg:hidden`}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <Link
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2.5 group transition active:scale-95"
            title="Kembali ke Laman Utama LajuQ"
          >
            <div className="h-8 w-8 rounded-lg bg-[#F04D23] group-hover:bg-[#d93f17] flex items-center justify-center font-black shadow-sm shrink-0 transition">
              <img src="/lajuq-favicon.svg" alt="LajuQ" className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-lg group-hover:text-[#F04D23] transition">
                Laju<span className="text-[#F04D23]">Q</span>
              </span>
              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">
                Menu
              </span>
            </div>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
          
          {/* Section 1: Auth / Profile Restoran */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Profil Restoran
            </div>
            {!user ? (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsAuthModalOpen(true);
                }}
                className="w-full py-2.5 px-4 bg-[#F04D23] hover:bg-[#d93f17] text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                <span>Log Masuk Restoran</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-xl">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    {tenant?.name || 'Restoran Nasi Kandar Aman'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Keluar Akaun</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Status Langganan SaaS */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Status Langganan SaaS
            </div>
            {(() => {
              const status = tenant?.subscription_status;
              const plan = (tenant?.plan_type || '').toLowerCase();

              // Active Subscriptions
              if (status === 'active' || status === 'past_due') {
                if (plan === 'free' || plan === 'percuma') {
                  return (
                    <FreePlanBadge 
                      tenant={tenant} 
                      orders={orders} 
                      onUpgradeClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsSubModalOpen(true);
                      }} 
                      isMobile={true} 
                    />
                  );
                }

                let planText = 'plan 4bulan';
                if (plan.includes('8') || plan === 'pro' || plan === '8months') {
                  planText = 'plan 8bulan';
                } else if (plan.includes('12') || plan === 'vps' || plan === '12months') {
                  planText = 'plan 12bulan';
                } else if (plan.includes('4') || plan === 'starter' || plan === '4months') {
                  planText = 'plan 4bulan';
                } else {
                  planText = `plan ${plan}`;
                }

                return (
                  <div className="space-y-2.5">
                    <div className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${status === 'past_due' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 ${status === 'past_due' ? 'text-rose-600' : 'text-emerald-600'}`} />
                      <span>status : {status === 'past_due' ? 'Tertunggak' : planText}</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsSubModalOpen(true);
                      }}
                      className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-extrabold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      Urus Langganan
                    </button>
                  </div>
                );
              }

              // Default fallback for Trialing / Demo / Non-Subscribed accounts
              return (
                <div className="space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-200 text-slate-700 rounded-full text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Demo</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsSubModalOpen(true);
                    }}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F04D23]/20 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Upgrade Langganan</span>
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Section 3: Pautan Navigasi Modul */}
          <div className="space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
              Pautan Sistem
            </div>
            
            <Link
              to="/counter"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl font-bold text-xs text-slate-800 transition"
            >
              <div className="flex items-center gap-2.5">
                <Monitor className="w-4 h-4 text-emerald-600" />
                <span>POS & Kaunter Pembayaran</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>

            <Link
              to="/kitchen"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl font-bold text-xs text-slate-800 transition"
            >
              <div className="flex items-center gap-2.5">
                <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                <span>KDS Skrin Dapur</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>

            <Link
              to="/menu-editor"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl font-bold text-xs text-slate-800 transition"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-indigo-600" />
                <span>Pengurusan Menu Restoran</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>

        </div>
      </div>

      {/* Auth Modal Component */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Subscription Modal Component */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        currentTenantId={tenant?.id || 'restoran-nasi-kandar-aman'}
        subscriptionStatus={tenant?.subscription_status || 'trialing'}
        planType={tenant?.plan_type || 'starter'}
      />


      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10 space-y-12">
        
        {/* 3 Main Interfaces Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Kaunter POS */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition hover:shadow-xl hover:shadow-rose-950/20 group">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition">
                <Monitor className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Interface 1</span>
                <h3 className="text-xl font-bold text-slate-100">Kaunter / POS Panel</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Urus 20 meja, jana Dynamic QR Session Slip untuk pelanggan baharu, dan proses bayaran (Confirm Payment & Close Session).
              </p>
              <ul className="text-xs space-y-1.5 text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Grid Status Meja Kosong/Aktif
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Dynamic QR Code Generator
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Semak Item & Confirm Payment
                </li>
              </ul>
            </div>

            <Link
              to="/counter"
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20 text-sm"
            >
              <span>Buka POS Kaunter</span>
              <span>→</span>
            </Link>
          </div>

          {/* Card 2: Web Menu Pelanggan */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition hover:shadow-xl hover:shadow-rose-950/20 group">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-widest">Interface 2</span>
                <h3 className="text-xl font-bold text-slate-100">Web Menu Pelanggan</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Urus senarai menu restoran, muat naik gambar hidangan, edit harga & pilihan, kemudian uji menu sebagai pelanggan.
              </p>
              <ul className="text-xs space-y-1.5 text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Edit Menu & Upload Gambar Hidangan
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Modal Modifiers & Sticky Cart
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Live Kitchen Status & Sesi Tamat Screen
                </li>
              </ul>
            </div>

            <Link
              to="/menu-editor"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-rose-600/20 text-sm"
            >
              <Settings className="w-4 h-4" />
              <span>Edit Menu Restoran</span>
              <span>→</span>
            </Link>
          </div>

          {/* Card 3: Kitchen Display System (KDS) */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition hover:shadow-xl hover:shadow-rose-950/20 group">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Interface 3</span>
                <h3 className="text-xl font-bold text-slate-100">Kitchen Display (KDS)</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Skrin dapur mod gelap (High Contrast Dark Mode) dengan notifikasi bunyi audio beep untuk tukang masak menukar status masakan.
              </p>
              <ul className="text-xs space-y-1.5 text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Audio Autoplay Activation Overlay
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Highlights Special Notes & Modifiers
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Action Buttons: Mula Masak / Ready / Clear
                </li>
              </ul>
            </div>

            <Link
              to="/kitchen"
              className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20 text-sm"
            >
              <span>Buka Skrin Dapur (KDS)</span>
              <span>→</span>
            </Link>
          </div>

        </div>

        {/* Real-Time Workflow Testing Guide */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h3 className="text-lg font-bold text-slate-100">Panduan Ujian Aliran Pesanan Real-Time (Step-by-Step)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="font-extrabold text-blue-400 text-sm">Langkah 1</div>
              <div className="font-bold text-slate-200">Kaunter Jana QR</div>
              <p className="text-slate-400">Buka <strong>/counter</strong>, klik Meja Kosong (cth: Meja 1) & tekan "Jana Session QR".</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="font-extrabold text-rose-400 text-sm">Langkah 2</div>
              <div className="font-bold text-slate-200">Pelanggan Pesan</div>
              <p className="text-slate-400">Tekan "Simulasikan Buka Web Pelanggan". Pilih menu, customize options & tekan <strong>"HANTAR PESANAN"</strong>.</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="font-extrabold text-amber-400 text-sm">Langkah 3</div>
              <div className="font-bold text-slate-200">Dapur Terima & Masak</div>
              <p className="text-slate-400">Buka <strong>/kitchen</strong> (aktifkan bunyi audio). Skrin berbunyi Beep 🔔. Tukang masak tekan "Mula Masak" & "Siap".</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="font-extrabold text-emerald-400 text-sm">Langkah 4</div>
              <div className="font-bold text-slate-200">Bayaran & Sesi Tamat</div>
              <p className="text-slate-400">Di Kaunter, klik Meja 1 & tekan "Confirm Payment & Close Session". Skrin pelanggan bertukar ke <strong>Sesi Tamat</strong>.</p>
            </div>
          </div>
        </div>

        {/* MODUL PRESTASI & LAPORAN KEWANGAN LHDN */}
        <FinancialPerformanceModule />

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Restoran Rasa Selera F&B Order System • Portal Staf (<strong className="text-slate-400">URL: /staff</strong>) • Powered by React & Vite
      </footer>

    </div>
  );
}
