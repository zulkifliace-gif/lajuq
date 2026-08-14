import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowRight, CheckCircle2, ChevronDown, ChevronUp, LogIn, Store, 
  Menu, X, Zap, ShieldCheck, Play, Sparkles, Utensils, QrCode, Monitor, RefreshCw, Eye
} from 'lucide-react';

import AuthModal from '../components/AuthModal';
import SubscriptionModal from '../components/SubscriptionModal';
import ChangelogModal from '../components/ChangelogModal';

const rotatingWords = ["Restoran", "Kafe", "Kiosk", "Kedai Makan"];

// Ultra-performant GPU-accelerated Smooth Scroll Reveal Component (once: true, will-change, 0.6s)
const ScrollReveal = ({ children, className = "", delay = 0 }) => {
  const ref = React.useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    observer.observe(node);
    return () => {
      if (node) observer.unobserve(node);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        willChange: 'opacity, transform',
      }}
      className={`transition-all duration-700 ease-out transform ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-[30px]'
      } ${className}`}
    >
      {children}
    </div>
  );
};

export default function SaaSLandingPage() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();

  const handleDemoClick = (e) => {
    e.preventDefault();
    sessionStorage.setItem('is_staff_authenticated', 'true');
    navigate('/staff?demo=true');
  };

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSubOpen, setIsSubOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  const [openFaq, setOpenFaq] = useState(null);

  const [fadeState, setFadeState] = useState('in');

  const [subscriptionMonths, setSubscriptionMonths] = useState(4);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % rotatingWords.length);
        setFadeState('in');
      }, 150);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      q: "Adakah pelanggan saya perlu muat turun sebarang aplikasi?",
      a: "TIDAK PERLU sama sekali! Pelanggan hanya perlu imbas Kod QR yang diberi oleh waiter dan menggunakan kamera telefon pintar mereka. Menu digital akan dibuka terus dalam pelayar web tanpa sebarang muat turun atau pendaftaran."
    },
    {
      q: "Adakah saya dikenakan sebarang komisen untuk setiap pesanan?",
      a: "0% KOMISEN! Kami tidak mengambil sebarang potong untung daripada jualan makanan anda. Anda boleh memilih Pelan Percuma (100 pesanan/4 bulan), Pelan Langganan (serendah RM496/4 bulan, RM930/8 bulan, RM1,364/12 bulan), atau Pelan Jualan Putus Private VPS tanpa yuran sewaan bulanan."
    },
    {
      q: "Adakah sistem ini boleh menampung restoran yang sangat ramai pelanggan?",
      a: "YA! Sistem kami dibina berasaskan infrastruktur awan tinggi yang boleh menangani puluhan ribu pesanan serentak secara automatik tanpa sebarang masalah server crash."
    },
    {
      q: "Adakah saya memerlukan perkakasan (hardware) khas yang mahal?",
      a: "Tidak perlu perkakasan khas. Anda boleh menggunakan sebarang Laptop, Tablet, PC, atau iPad sedia ada di restoran anda untuk paparan dapur dan kaunter. Untuk kelancaran operasi, 2 thermal printer Bluetooth & 2 skrin (tablet/iPad) diperlukan. Bagi restoran yang aktif, disyorkan menggunakan perkakasan yang lasak."
    },
    {
      q: "Kedai saya biasa tak guna gambar setiap makanan pada menu, adakah wajib letak kalau nak kelihatan premium?",
      a: "Tidak perlu sama sekali! Sistem kami mempunyai templat cantik khas untuk menu tanpa gambar, yang tetap kelihatan premium dan moden."
    },
    {
      q: "Kalau saya nak refund langganan, boleh?",
      a: "Tidak boleh, wang tidak akan dikembalikan (non-refundable) selepas pembayaran berjaya dibuat."
    },
    {
      q: "Bolehkah saya membatalkan langganan sewa pada bila-bila masa?",
      a: "Boleh! Tiada sebarang kontrak terikat sewaan. Anda boleh menaik taraf, menurunkan pelan, atau membatalkan langganan mengikut keperluan perniagaan anda."
    }
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#F04D23] selection:text-white overflow-x-hidden relative">
      
      {/* Floating Navbar (Optimus Layout) */}
      <header
        className={`fixed z-50 transition-all duration-500 ${
          isScrolled ? "top-4 left-4 right-4" : "top-0 left-0 right-0"
        }`}
      >
        <nav
          className={`mx-auto transition-all duration-500 ${
            isScrolled || isMobileMenuOpen
              ? "bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-xl max-w-[1200px]"
              : "bg-white/90 backdrop-blur-md border-b border-slate-100 max-w-[1400px]"
          }`}
        >
          <div
            className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${
              isScrolled ? "h-14" : "h-20"
            }`}
          >
            {/* Brand Logo */}
            <a href="#" className="flex items-center gap-3 group">
              <div className="h-9 w-9 rounded-xl bg-[#F04D23] flex items-center justify-center font-black shadow-md shadow-[#F04D23]/20 group-hover:scale-105 transition">
                <img src="/lajuq-favicon.svg" alt="LajuQ Logo" className="w-6 h-6" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold tracking-tight text-xl text-slate-900">
                  Laju<span className="text-[#F04D23]">Q</span>
                </span>
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-7 lg:gap-9 text-xs font-bold text-slate-700">
              <a href="#how-it-works" className="hover:text-[#F04D23] transition-colors">Cara Berfungsi</a>
              <a href="#features" className="hover:text-[#F04D23] transition-colors">Ciri-Ciri Utama</a>
              <a href="#telegram-feedback" className="hover:text-[#F04D23] transition-colors">Feedback Pelanggan</a>
              <a href="#pricing" className="hover:text-[#F04D23] transition-colors">Pelan Sewa</a>
              <a href="#faq" className="hover:text-[#F04D23] transition-colors">FAQ</a>
            </div>

            {/* Desktop Action Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/staff"
                    className="px-4 py-2 bg-[#F04D23] hover:bg-[#EA580C] text-white font-bold text-xs rounded-full shadow-md shadow-[#F04D23]/20 transition flex items-center gap-1.5"
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Portal ({tenant?.name || 'Dashboard'})</span>
                  </Link>
                  <button
                    onClick={logout}
                    className="p-2 text-slate-500 hover:text-[#F04D23] transition"
                    title="Log Keluar"
                  >
                    <LogIn className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold text-xs rounded-full shadow-lg shadow-[#F04D23]/20 transition flex items-center gap-1.5 transform hover:-translate-y-0.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log Masuk</span>
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-slate-900"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>

        {/* Mobile Full Screen White Clean Drawer Overlay with Smooth Animation */}
        <div 
          className={`md:hidden fixed inset-0 z-50 bg-white flex flex-col justify-between p-6 sm:p-8 transition-all duration-300 ease-out transform ${
            isMobileMenuOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none"
          }`}
        >
          
          {/* Header Area with PC-Identical Brand Logo & Prominent Close 'X' Button */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#F04D23] flex items-center justify-center font-black shadow-md shadow-[#F04D23]/20">
                <img src="/lajuq-favicon.svg" alt="LajuQ Logo" className="w-6 h-6" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold tracking-tight text-xl text-slate-900">
                  Laju<span className="text-[#F04D23]">Q</span>
                </span>
              </div>
            </div>

            {/* Explicit Close 'X' Button */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-full border border-slate-200 transition shadow-sm flex items-center justify-center"
              aria-label="Tutup Menu"
            >
              <X className="w-6 h-6 text-slate-700" />
            </button>
          </div>

          {/* Navigation Links List */}
          <div className="flex flex-col gap-3 my-auto py-6">
            {[
              { href: "#how-it-works", label: "Cara Berfungsi", desc: "2 Mod Operasi Restoran" },
              { href: "#features", label: "Ciri-Ciri Utama", desc: "Sistem QR, KDS & POS" },
              { href: "#telegram-feedback", label: "Feedback Pelanggan", desc: "Aduan Real-Time ke Staf" },
              { href: "#pricing", label: "Pelan Sewaan & Lesen", desc: "Percuma, Sewaan & VPS" },
              { href: "#faq", label: "Soalan Lazim (FAQ)", desc: "Jawapan Lengkap Restoran" }
            ].map((link, idx) => (
              <a
                key={idx}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between group transition active:scale-[0.98]"
              >
                <div className="space-y-0.5">
                  <span className="text-base font-extrabold text-slate-900 group-hover:text-[#F04D23] transition">{link.label}</span>
                  <p className="text-xs text-slate-500 font-medium">{link.desc}</p>
                </div>
                <span className="text-slate-400 group-hover:text-[#F04D23] font-mono font-bold text-lg transition">➔</span>
              </a>
            ))}
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => { setIsMobileMenuOpen(false); setIsAuthOpen(true); }}
              className="w-full py-4 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 active:scale-[0.98] text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-[#F04D23]/25 transition text-center flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Daftar Restoran Sekarang</span>
            </button>
            
            <button
              onClick={() => { setIsMobileMenuOpen(false); setIsAuthOpen(true); }}
              className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 font-extrabold text-xs rounded-2xl border border-slate-200 transition text-center flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4 text-[#F04D23]" />
              <span>Log Masuk Restoran</span>
            </button>
          </div>

        </div>

      </header>

      {/* Hero Section (100% Pure White #FFFFFF Background & 2-Column Text-Left Video-Right) */}
      <section className="relative min-h-screen bg-white text-slate-900 flex items-center pt-28 pb-16 lg:pt-36 lg:pb-24 px-6 lg:px-12 border-b border-slate-100 overflow-hidden z-10">
        
        <div className="w-full max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
          
          {/* LEFT COLUMN: Text & CTAs */}
          <ScrollReveal delay={100} className="lg:col-span-6 space-y-6 text-left">
            
            {/* Eyebrow Line (Gradient matching 'Daftar Restoran Sekarang' button) */}
            <div className="flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
              <span className="w-16 sm:w-24 h-[2px] bg-gradient-to-r from-[#F04D23] to-[#FF7F27] inline-block" />
              <span className="bg-gradient-to-r from-[#F04D23] to-[#FF7F27] bg-clip-text text-transparent">
                SISTEM PESANAN DIGITAL RESTORAN MODEN
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-slate-900">
              Platform Pesanan QR & KDS untuk{" "}
              <span className="inline-block text-[#F04D23] min-w-[170px] sm:min-w-[270px] align-baseline">
                <span
                  className={`inline-block transition-all duration-300 ease-out transform ${
                    fadeState === 'in'
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-2'
                  }`}
                  style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                >
                  {rotatingWords[wordIndex]}
                </span>
              </span>
            </h1>


            {/* Description */}
            <p className="text-base md:text-lg text-slate-600 leading-relaxed font-normal">
              Digitalisasikan restoran anda dalam 5 minit. Penyelesaian lengkap Pesanan QR Code Pelanggan, Paparan Dapur (KDS), dan Kaunter POS.
              <strong className="text-slate-900 font-bold"> 0% komisen jualan, tanpa sewaan pelayan VPS!</strong>
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button
                onClick={() => setIsAuthOpen(true)}
                className="px-8 h-14 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold text-sm rounded-full shadow-lg shadow-[#F04D23]/25 flex items-center justify-center gap-2 group transition transform hover:-translate-y-0.5"
              >
                <span>Daftar Restoran Sekarang</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={handleDemoClick}
                className="px-7 h-14 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-sm rounded-full flex items-center justify-center gap-2 transition"
              >
                <Play className="w-4 h-4 fill-[#F04D23] text-[#F04D23]" />
                <span>Lihat Sistem</span>
              </button>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-2 gap-3 pt-4 text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F04D23]" />
                <span>Pelanggan Tanpa Login</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F04D23]" />
                <span>0% Komisen Jualan</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F04D23]" />
                <span>KDS Skrin Dapur Audio</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F04D23]" />
                <span>Auto-scaling Cloud</span>
              </div>
            </div>

          </ScrollReveal>

          {/* RIGHT COLUMN: Video Player with Offset & 100% Pure White (#FFFFFF) Seamless Masking */}
          <ScrollReveal delay={250} className="lg:col-span-6 relative flex items-center justify-end overflow-visible">
            
            <div className="relative w-full max-w-2xl transform lg:translate-x-12 translate-y-2 bg-white">
              
              {/* 100% Pure White Masking Fades around video edges */}
              <div className="absolute top-0 bottom-0 left-0 w-36 bg-gradient-to-r from-white via-white/90 to-transparent z-20 pointer-events-none" />
              <div className="absolute top-0 bottom-0 right-0 w-32 bg-gradient-to-l from-white via-white/90 to-transparent z-20 pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white via-white/80 to-transparent z-20 pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white/80 to-transparent z-20 pointer-events-none" />

              {/* Video Element */}
              <div className="relative rounded-3xl overflow-hidden bg-white">
                <video
                  src="/LajuQ animasi.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto max-h-[520px] object-cover object-right transform scale-105"
                />
              </div>

            </div>

          </ScrollReveal>

        </div>

      </section>


      {/* Metrics & Performance Section */}
      <section className="py-12 bg-slate-900 border-y border-slate-800 overflow-hidden">
        <ScrollReveal delay={100} className="max-w-[1400px] mx-auto px-6 grid grid-cols-2 lg:grid-cols-5 gap-8 text-center">
          <div className="space-y-1">
            <div className="text-3xl lg:text-5xl font-black text-[#F04D23]">98%</div>
            <div className="text-xs text-slate-300 font-semibold">Pengurangan Ralat Pesanan</div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl lg:text-5xl font-black text-[#FF7F27]">3x</div>
            <div className="text-xs text-slate-300 font-semibold">Kelajuan Servis Dapur</div>
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <div className="text-3xl lg:text-5xl font-black text-[#34D399]">-99%</div>
            <div className="text-xs text-slate-300 font-semibold">Peluang Pelanggan Terbiar <span className="block text-[10px] text-emerald-400 font-mono">(Semasa Peak Hour)</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl lg:text-5xl font-black text-[#FFCA3A]">RM0</div>
            <div className="text-xs text-slate-300 font-semibold">Komisen Per-pesanan</div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl lg:text-5xl font-black text-white">5 Minit</div>
            <div className="text-xs text-slate-300 font-semibold">Masa Pemasangan Kedai</div>
          </div>
        </ScrollReveal>
      </section>


      {/* How It Works Section (2 Operating Options Layout) */}
      <section id="how-it-works" className="w-full py-24 px-6 relative overflow-hidden">
        
        {/* Background Decorative Image: QR Code Graphic (Far Left Bottom Underlay) */}
        <div className="absolute bottom-0 left-0 z-0 pointer-events-none w-44 sm:w-72 md:w-96 h-auto opacity-20 sm:opacity-25 rounded-r-3xl overflow-hidden">
          <img 
            src="/QR_code_graphic.jpeg" 
            alt="QR Code Graphic Background" 
            className="w-full h-full object-contain pointer-events-none" 
          />
        </div>

        <div className="max-w-[1400px] mx-auto relative z-10 space-y-16">
          {/* Header */}
          <ScrollReveal delay={100} className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#F04D23] to-[#FF7F27] inline-block" />
              <span className="bg-gradient-to-r from-[#F04D23] to-[#FF7F27] bg-clip-text text-transparent">
                CARA BERFUNGSI
              </span>
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#FF7F27] to-[#F04D23] inline-block" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
              2 Pilihan Mod Operasi Mengikut Kesesuaian Restoran Anda
            </h2>
            <p className="text-sm md:text-base text-slate-700 leading-relaxed font-medium">
              LajuQ direka khas untuk menyokong 2 aliran kerja berbeza. Sedia mengikut gaya operasi perniagaan anda tanpa perlu mengubah tabiat pelanggan.
            </p>
          </ScrollReveal>

          {/* 2 Operating Options Grid (Forced 2 columns in 1 row even on mobile) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-8">
            
            {/* OPTION 1: Pay First at Counter */}
            <ScrollReveal delay={150} className="h-full">
              <div className="h-full bg-[#1E252D] border border-emerald-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-8 relative overflow-hidden group hover:border-emerald-500 transition shadow-2xl">
                <div className="space-y-1.5 sm:space-y-2">
                  <span className="text-[9px] sm:text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider block">MOD 1 — BAYARAN KAUNTER DAHULU</span>
                  <h3 className="text-sm sm:text-2xl font-black text-white leading-tight">Dynamic QR ➔ Bayar ➔ Masak</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 leading-normal">
                    Pelanggan buat pilihan menu dari meja, bayar di kaunter dahulu, baru dapur mula memasak.
                  </p>
                </div>

                <div className="space-y-2.5 sm:space-y-4 pt-1 sm:pt-2">
                  {[
                    { num: "01", title: "Waiter Beri Dynamic QR", text: "Pelayan/Waiter berikan Kod QR Sesi Dinamik baharu untuk pelanggan meja (Bukan QR statik)." },
                    { num: "02", title: "Imbas & Pilih Menu", text: "Pelanggan imbas QR sesi dari telefon (Tanpa Login) & pilih senarai makanan idaman." },
                    { num: "03", title: "Bayar Kaunter & Masak", text: "Pelanggan bayar di Kaunter POS ➔ Dapur (KDS) terus mula memasak dengan notifikasi BEEP." },
                    { num: "04", title: "Hidang Ke Meja", text: "Staf menghantar makanan siap terus ke meja. Sesi QR ditutup secara selamat." }
                  ].map((step, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 items-start bg-slate-900/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800">
                      <span className="text-xs sm:text-lg font-black text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl">{step.num}</span>
                      <div className="space-y-0.5">
                        <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">{step.title}</h4>
                        <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            {/* OPTION 2: Pay Later at Counter */}
            <ScrollReveal delay={250} className="h-full">
              <div className="h-full bg-[#1E252D] border border-[#F04D23]/30 rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-8 relative overflow-hidden group hover:border-[#F04D23] transition shadow-2xl">
                <div className="space-y-1.5 sm:space-y-2">
                  <span className="text-[9px] sm:text-xs font-mono text-[#FF7F27] font-bold uppercase tracking-wider block">MOD 2 — BAYAR SELEPAS MAKAN</span>
                  <h3 className="text-sm sm:text-2xl font-black text-white leading-tight">Dynamic QR ➔ Masak ➔ Bayar</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 leading-normal">
                    Pelanggan terus pesan ke dapur, bebas tambah pesanan (Add-on), & bayar di kaunter selesai makan.
                  </p>
                </div>

                <div className="space-y-2.5 sm:space-y-4 pt-1 sm:pt-2">
                  {[
                    { num: "01", title: "Waiter Beri Dynamic QR", text: "Pelayan/Waiter jana Kod QR Sesi Dinamik khas untuk meja tersebut." },
                    { num: "02", title: "Imbas & Hantar Pesanan", text: "Pelanggan imbas QR sesi & tekan 'Hantar Ke Dapur' tanpa perlu bayar dahulu." },
                    { num: "03", title: "Dapur Masak & Add-on", text: "Dapur (KDS) terus memasak. Pelanggan bebas menambah makanan/minuman dari meja." },
                    { num: "04", title: "Bayar Kaunter Selesai", text: "Kasier kaunter POS menerima bayaran (Tunai / QR Pay) apabila pelanggan selesai makan." }
                  ].map((step, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 items-start bg-slate-900/60 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800">
                      <span className="text-xs sm:text-lg font-black text-[#F04D23] font-mono bg-[#F04D23]/10 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl">{step.num}</span>
                      <div className="space-y-0.5">
                        <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">{step.title}</h4>
                        <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

          </div>
        </div>

      </section>

      {/* Features Section (Optimus Style Grid) */}
      <section id="features" className="py-24 px-6 bg-[#161C22] border-y border-[#FFFFFF]/10 relative overflow-hidden">


        <div className="max-w-[1400px] mx-auto space-y-16 relative z-10">
          <ScrollReveal delay={100} className="text-center space-y-4 max-w-2xl mx-auto">
            <span className="text-xs font-mono font-bold text-[#F04D23] uppercase tracking-widest">— CIRI-CIRI UTAMA</span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-[#FFFFFF]">Segala Perkara Yang Diperlukan Restoran Moden</h2>
          </ScrollReveal>

          <ScrollReveal delay={150} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-[#1E252D] border border-[#FFFFFF]/10 rounded-3xl p-6 space-y-4 hover:border-[#F04D23] transition">
              <div className="p-3 bg-[#F04D23]/20 border border-[#F04D23]/30 rounded-2xl text-[#F04D23] w-fit">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#FFFFFF]">1. Pesanan QR Code Pelanggan</h3>
              <p className="text-xs text-[#FFFFFF]/70 leading-relaxed">
                Pelanggan imbas Kod QR meja, lihat menu bergambar yang menarik, pilih spesifikasi makanan, dan hantar pesanan secara terus dari telefon mereka (Tanpa Login).
              </p>
            </div>

            {/* Feature 2: Menu Digital Mesra Pelanggan */}
            <div className="bg-[#1E252D] border border-[#FFFFFF]/10 rounded-3xl p-6 space-y-4 hover:border-[#34D399] transition">
              <div className="p-3 bg-[#34D399]/20 border border-[#34D399]/30 rounded-2xl text-[#34D399] w-fit">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#FFFFFF]">2. Menu Digital Mesra Pelanggan</h3>
              <p className="text-xs text-[#FFFFFF]/70 leading-relaxed">
                Antaramuka menu digital yang sangat mesra pengguna, pantas, & bergambar tinggi. Pelanggan mudah memilih makanan & variasi pilihan tanpa kekeliruan.
              </p>
            </div>

            {/* Feature 3: Kitchen Display System (KDS) */}
            <div className="bg-[#1E252D] border border-[#FFFFFF]/10 rounded-3xl p-6 space-y-4 hover:border-[#FF7F27] transition">
              <div className="p-3 bg-[#FF7F27]/20 border border-[#FF7F27]/30 rounded-2xl text-[#FF7F27] w-fit">
                <Utensils className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#FFFFFF]">3. Kitchen Display System (KDS)</h3>
              <p className="text-xs text-[#FFFFFF]/70 leading-relaxed">
                Skrin dapur berbunyi Notifikasi Audio BEEP secara automatik sebaik pesanan masuk. Tukang masak boleh menukar status masakan secara live.
              </p>
            </div>

            {/* Feature 4: Kaunter POS & Pengurusan Meja */}
            <div className="bg-[#1E252D] border border-[#FFFFFF]/10 rounded-3xl p-6 space-y-4 hover:border-[#FFCA3A] transition">
              <div className="p-3 bg-[#FFCA3A]/20 border border-[#FFCA3A]/30 rounded-2xl text-[#FFCA3A] w-fit">
                <Monitor className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#FFFFFF]">4. Kaunter POS & Pengurusan Meja</h3>
              <p className="text-xs text-[#FFFFFF]/70 leading-relaxed">
                Pantau status 20+ meja (Kosong vs Aktif), jana slip sesi QR baharu, sahkan bayaran tunai/QR Pay, dan tutup sesi meja secara pantas.
              </p>
            </div>
          </ScrollReveal>

          {/* Hardware Requirements Note Card (Glassmorphism Single Color Design) */}
          <ScrollReveal delay={200} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            
            <div className="flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#FFCA3A]">
              <span className="p-2 bg-white/10 rounded-xl text-[#FFCA3A]">📌</span>
              <span>NOTA PERKAKASAN MINIMUM (PENGGUNAAN KELANCARAN 100%)</span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Untuk memastikan sistem LajuQ berjalan dengan paling pantas dan lancar di restoran anda, persediaan minimum perkakasan berikut disyorkan:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Requirement 1: 2 Tablets */}
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 text-[#FFCA3A] font-black rounded-xl text-sm font-mono">01</div>
                  <h4 className="text-sm sm:text-base font-bold text-white">2x Tablet / iPad (Fungsi Bluetooth)</h4>
                </div>
                <ul className="text-xs text-slate-300 space-y-2 pl-2">
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFCA3A] font-bold">•</span>
                    <span><strong className="text-white">Tablet Kaunter (POS):</strong> Untuk semak, monitor pesanan aktif, & luluskan bayaran.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFCA3A] font-bold">•</span>
                    <span><strong className="text-white">Tablet Dapur (KDS):</strong> Untuk notifikasi audio BEEP alert pesanan masuk & tukar status masakan.</span>
                  </li>
                </ul>
              </div>

              {/* Requirement 2: 2 Bluetooth Printers */}
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 text-[#FFCA3A] font-black rounded-xl text-sm font-mono">02</div>
                  <h4 className="text-sm sm:text-base font-bold text-white">2x Thermal Printer Bluetooth</h4>
                </div>
                <ul className="text-xs text-slate-300 space-y-2 pl-2">
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFCA3A] font-bold">•</span>
                    <span><strong className="text-white">Printer Kaunter:</strong> Untuk cetak slip Kod QR Sesi Dinamik & resit rasmi pelanggan.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFCA3A] font-bold">•</span>
                    <span><strong className="text-white">Printer Dapur:</strong> Untuk cetak tiket pesanan masakan terus bagi rujukan waiter & dapur.</span>
                  </li>
                </ul>
              </div>

            </div>
          </ScrollReveal>

        </div>
      </section>

      <section id="telegram-feedback" className="w-full py-24 px-6 bg-[#161C22] border-b border-[#FFFFFF]/10 relative overflow-hidden">


        {/* Glow Accent (LajuQ Brand Orange-Amber Glow) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-[#F04D23]/15 via-[#FF7F27]/15 to-[#FFCA3A]/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          
          {/* Left Column: Copy & Value Proposition */}
          <ScrollReveal delay={100} className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#F04D23] to-[#FF7F27] inline-block" />
              <span className="bg-gradient-to-r from-[#F04D23] to-[#FF7F27] bg-clip-text text-transparent">
                MAKLUM BALAS TELEGRAM REAL-TIME
              </span>
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#FF7F27] to-[#F04D23] inline-block" />
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              Kesan Kesilapan Dapur & Servis <span className="bg-gradient-to-r from-[#F04D23] via-[#FF7F27] to-[#FFCA3A] bg-clip-text text-transparent">Serta-Merta Terus Ke Telegram</span>
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-medium">
              Jangan biarkan aduan makanan berbau, terlampau masin, atau salah pesanan tular di media sosial! Dengan integrasi Telegram Bot LajuQ, setiap maklum balas pelanggan dari meja akan dihantar <strong className="text-white font-bold">REAL-TIME secara automatik</strong> ke Telegram peribadi pengurus atau Group Staf Restoran.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="bg-[#1E252D] border border-slate-800 p-5 rounded-2xl space-y-2 hover:border-[#F04D23] transition shadow-lg">
                <div className="text-[#F04D23] font-black text-sm flex items-center gap-2">
                  <span className="p-1.5 bg-[#F04D23]/20 rounded-xl">🚀</span>
                  <span>Tindakan Pantas Kilat</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Selesaikan masalah makanan/servis dalam masa beberapa minit sahaja sebelum pelanggan seterusnya terkena nasib yang sama.
                </p>
              </div>

              <div className="bg-[#1E252D] border border-slate-800 p-5 rounded-2xl space-y-2 hover:border-[#FF7F27] transition shadow-lg">
                <div className="text-[#FF7F27] font-black text-sm flex items-center gap-2">
                  <span className="p-1.5 bg-[#FF7F27]/20 rounded-xl">📈</span>
                  <span>Tingkatkan Retensi Pelanggan</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pelanggan menghargai keprihatinan anda. Kadar kunjungan semula pelanggan akan melonjak kerana kualiti sentiasa dipelihara.
                </p>
              </div>

              <div className="bg-[#1E252D] border border-slate-800 p-5 rounded-2xl space-y-2 hover:border-[#FFCA3A] transition shadow-lg">
                <div className="text-[#FFCA3A] font-black text-sm flex items-center gap-2">
                  <span className="p-1.5 bg-[#FFCA3A]/20 rounded-xl">🎯</span>
                  <span>Kualiti Berdasarkan Data Sebenar</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tingkatkan mutu resipi & hidangan berpandukan maklum balas tulen pelanggan di lapangan — bukan sekadar syok sendiri.
                </p>
              </div>

              <div className="bg-[#1E252D] border border-slate-800 p-5 rounded-2xl space-y-2 hover:border-[#F04D23] transition shadow-lg">
                <div className="text-[#F04D23] font-black text-sm flex items-center gap-2">
                  <span className="p-1.5 bg-[#F04D23]/20 rounded-xl">👥</span>
                  <span>Individu Atau Group Telegram</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hantar maklum balas terus ke akaun peribadi pemilik restoran atau masuk ke Group Telegram rasmi barisan dapur & waiter.
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* Right Column: Telegram Group Screenshot */}
          <ScrollReveal delay={200} className="lg:col-span-5">
            <div className="rounded-3xl overflow-hidden shadow-2xl relative">
              <img
                src="/Tomyam family-Photoroom.png"
                alt="Tomyam family Telegram Group - LajuQ Customer Feedback"
                className="w-full h-auto object-contain"
              />
            </div>
          </ScrollReveal>


        </div>
      </section>


      {/* Pricing Section (3 Plan Cards) */}
      <section id="pricing" className="w-full py-24 px-6 relative overflow-hidden">
        
        {/* Background Decorative Image: Cartoon Kitchen (Top Left Underlay) */}
        <div className="absolute top-0 left-0 z-0 pointer-events-none w-48 sm:w-80 md:w-96 h-auto opacity-20 sm:opacity-25 rounded-r-3xl overflow-hidden">
          <img 
            src="/Cartoon_kitchen.jpeg" 
            alt="Cartoon Kitchen Background" 
            className="w-full h-full object-contain pointer-events-none" 
          />
        </div>
        
        <div className="max-w-[1400px] mx-auto relative z-10 space-y-16">
          {/* Header */}
          <ScrollReveal delay={100} className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#F04D23] to-[#FF7F27] inline-block" />
              <span className="bg-gradient-to-r from-[#F04D23] to-[#FF7F27] bg-clip-text text-transparent">
                PELAN SEWAAN SAAS & LESEN
              </span>
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#FF7F27] to-[#F04D23] inline-block" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
              Pilih Pelan Yang Sesuai Untuk Restoran Anda
            </h2>
            <p className="text-sm md:text-base text-slate-700 leading-relaxed font-medium">
              Semua pelan mendapat <strong className="text-slate-950 font-bold">akses 100% penuh ke SEMUA fungsi & alatan sistem</strong> tanpa sebarang sekatan feature.
            </p>
          </ScrollReveal>

          {/* 3 Pricing Cards Grid */}
          <ScrollReveal delay={150} className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            
            {/* CARD 1: Pelan Percuma Seumur Hidup */}
            <div className="bg-[#1E252D] border border-slate-700 rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl relative">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-white">Pelan Percuma</h3>
                </div>
                
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">RM 0</span>
                    <span className="text-xs text-slate-400 font-semibold">/ selamanya</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 font-mono font-bold mt-1">
                    • Renew setiap 4 bulan
                  </p>
                </div>

                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-300">Akses Penuh Semua Alat & Ciri:</p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Akses 100% Semua Fungsi & Tool</strong></span>
                    </li>
                    <li className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Had 100 Pesanan untuk 4 bulan</span>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition shadow-lg"
              >
                Mula Percubaan Percuma
              </button>
            </div>

            {/* CARD 2: Pelan Langganan (4 / 8 / 12 Bulan dalam 1 Kotak) */}
            <div className="bg-gradient-to-b from-[#F04D23]/15 via-[#1E252D] to-[#1E252D] border-2 border-[#F04D23] rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl relative transform hover:-translate-y-1 transition">
              
              {/* Top Badge */}
              <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-lg">
                Paling Popular (Berpakej)
              </div>

              <div className="space-y-5">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black text-[#F04D23]">Pelan Langganan</h3>
                  </div>
                  <p className="text-xs text-slate-300">Pilih tempoh sewaan yang paling menjimatkan:</p>
                </div>

                {/* Month Selector Tabs (4 / 8 / 12 Bulan) */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
                  {[
                    { m: 4, label: "4 Bulan" },
                    { m: 8, label: "8 Bulan" },
                    { m: 12, label: "12 Bulan" }
                  ].map((item) => (
                    <button
                      key={item.m}
                      onClick={() => setSubscriptionMonths(item.m)}
                      className={`py-2 text-xs font-black rounded-xl transition ${
                        subscriptionMonths === item.m
                          ? "bg-[#F04D23] text-white shadow-md"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Dynamic Price Display */}
                <div className="space-y-1 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                  {subscriptionMonths === 4 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-black text-white">RM 496</span>
                      <span className="text-xs text-slate-400 font-semibold">/ 4 bulan</span>
                    </div>
                  )}

                  {subscriptionMonths === 8 && (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-[#FFCA3A]">RM 930</span>
                        <span className="text-xs line-through text-slate-500 font-bold">RM 992</span>
                        <span className="text-xs text-slate-400 font-semibold">/ 8 bulan</span>
                      </div>
                      <div className="inline-block px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-full font-mono mt-1">
                        Diskaun Penjimatan RM62!
                      </div>
                    </>
                  )}

                  {subscriptionMonths === 12 && (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-[#FFCA3A]">RM 1,364</span>
                        <span className="text-xs line-through text-slate-500 font-bold">RM 1,488</span>
                        <span className="text-xs text-slate-400 font-semibold">/ 12 bulan</span>
                      </div>
                      <div className="inline-block px-2.5 py-0.5 bg-[#FFCA3A]/20 text-[#FFCA3A] text-[10px] font-black rounded-full font-mono mt-1">
                        Diskaun RM124
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2.5">
                  <p className="text-xs font-bold text-slate-300">Akses Penuh Semua Alat & Ciri:</p>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#FFCA3A] flex-shrink-0" />
                      <span><strong>Akses 100% Semua Fungsi & Tool</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#FFCA3A] flex-shrink-0" />
                      <span><strong className="text-white">Pesanan TANPA HAD (Unlimited Orders)</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#FFCA3A] flex-shrink-0" />
                      <span>Sokongan Bantuan Keutamaan 24/7</span>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full py-3.5 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold rounded-2xl text-xs shadow-xl shadow-[#F04D23]/30 transition"
              >
                Langgan Pelan {subscriptionMonths} Bulan
              </button>
            </div>

            {/* CARD 3: Pelan Jualan Putus (Private VPS & Domain Sendiri) */}
            <div className="bg-[#1E252D] border border-slate-700 rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl relative">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-white">Jualan Putus</h3>
                  <span className="text-[10px] font-mono px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full font-bold uppercase">
                    Self-Hosted / Private VPS
                  </span>
                </div>
                
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-white">Lesen Putus</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Pemilikan Sistem & Pemasangan Penuh
                  </p>
                </div>

                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-300">Persediaan Khas Untuk Anda:</p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span><strong>Akses 100% Semua Alat & Fungsi</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Pasang Pada <strong>Private VPS Milik Sendiri</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Guna <strong>Domain Sendiri</strong> (order.restoran.com)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Pemasangan & Setup Dipandu Penuh</span>
                    </li>
                    <li className="flex items-center gap-2 text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-purple-400/60 flex-shrink-0" />
                      <span>Tiada Yuran Sewaan Bulanan</span>
                    </li>
                  </ul>

                  <div className="pt-2 border-t border-slate-800/80">
                    <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/70 p-2.5 rounded-xl border border-slate-800">
                      📌 <span className="font-semibold text-slate-300">Nota:</span> Pakej merangkumi Lesen Penggunaan Perisian Self-Hosted (Docker Container Deployment). Tidak merangkumi penyerahan fail kod sumber asal (Uncompiled Source Code).
                    </p>
                  </div>
                </div>
              </div>


              <a
                href="https://wa.me/60123456789?text=Hai%20LajuQ,%20saya%20berminat%20dengan%20Pelan%20Jualan%20Putus%20Private%20VPS"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition shadow-lg text-center flex items-center justify-center"
              >
                <span>Hubungi Kami</span>
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full py-24 px-6 relative overflow-hidden">
        
        {/* Background Decorative Image: Cartoon Waiter (Far Right Bottom Underlay) */}
        <div className="absolute bottom-0 right-0 z-0 pointer-events-none w-48 sm:w-80 md:w-96 h-auto opacity-20 sm:opacity-25 rounded-l-3xl overflow-hidden">
          <img 
            src="/Cartoon_waiter.jpeg" 
            alt="Cartoon Waiter Background" 
            className="w-full h-full object-contain pointer-events-none" 
          />
        </div>

        <div className="max-w-4xl mx-auto relative z-10 space-y-8">
          <ScrollReveal delay={100} className="text-center space-y-4">
            <div className="inline-flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#F04D23] to-[#FF7F27] inline-block" />
              <span className="bg-gradient-to-r from-[#F04D23] to-[#FF7F27] bg-clip-text text-transparent">
                SOALAN LAZIM
              </span>
              <span className="w-12 h-[2px] bg-gradient-to-r from-[#FF7F27] to-[#F04D23] inline-block" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900">Soalan Yang Sering Ditanya (FAQ)</h2>
          </ScrollReveal>

          <ScrollReveal delay={150} className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-[#1E252D] border border-[#FFFFFF]/10 rounded-2xl overflow-hidden transition">
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-[#FFFFFF] hover:text-[#FF7F27] transition"
                >
                  <span>{faq.q}</span>
                  {openFaq === idx ? <ChevronUp className="w-5 h-5 text-[#F04D23] flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-[#FFFFFF]/40 flex-shrink-0" />}
                </button>

                {openFaq === idx && (
                  <div className="px-5 pb-5 text-xs text-[#FFFFFF]/70 leading-relaxed border-t border-[#FFFFFF]/10 pt-3 animate-in fade-in duration-150">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0D1117] border-t border-[#FFFFFF]/10 py-12 px-6 text-xs text-[#FFFFFF]/60">
        <ScrollReveal delay={100} className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Col 1 & 2: Brand & Company Info */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1.5 rounded-xl shadow-md inline-flex items-center justify-center w-fit">
                <img src="/botz-logo.svg" alt="BOTZ Logo" className="w-7 h-7 object-contain" />
              </div>
            </div>
            
            <div className="space-y-1 text-slate-400 text-xs">
              <p className="font-bold text-white">BOTZ GLOBAL SOLUTIONS</p>
              <p className="font-mono text-[11px] text-slate-300">No. SSM: 202603077221 (TR0339427-P)</p>
              <p className="pt-1 flex items-center gap-2 text-slate-300">
                <span>📧 E-mel:</span>
                <a href="mailto:akubotaman@gmail.com" className="hover:text-[#F04D23] transition underline font-mono text-white">
                  akubotaman@gmail.com
                </a>
              </p>
            </div>
          </div>

          {/* Col 3: Quick Navigation */}
          <div className="space-y-2">
            <p className="font-bold text-white text-xs uppercase tracking-wider text-[#FFCA3A]">Pautan Pantas</p>
            <ul className="space-y-1.5 text-xs">
              <li><a href="#how-it-works" className="hover:text-[#F04D23] transition">Cara Berfungsi</a></li>
              <li><a href="#features" className="hover:text-[#F04D23] transition">Ciri-Ciri Utama</a></li>
              <li><a href="#telegram-feedback" className="hover:text-[#F04D23] transition">Feedback Pelanggan</a></li>
              <li><a href="#pricing" className="hover:text-[#F04D23] transition">Pelan Sewaan SaaS</a></li>
              <li><a href="#faq" className="hover:text-[#F04D23] transition">Soalan Lazim (FAQ)</a></li>
              <li>
                <button 
                  onClick={() => setIsChangelogOpen(true)}
                  className="hover:text-[#F04D23] transition text-left cursor-pointer"
                >
                  Log Kemas Kini
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Platform Rights */}
          <div className="space-y-2">
            <p className="font-bold text-white text-xs uppercase tracking-wider text-[#F04D23]">Hak Cipta</p>
            <p className="leading-relaxed text-[#FFFFFF]/70">
              © {new Date().getFullYear()} LajuQ SaaS System. Hak cipta terpelihara. Dicetuskan & dibangunkan oleh <strong className="text-white">BOTZ GLOBAL SOLUTIONS</strong>.
            </p>
          </div>

        </ScrollReveal>
      </footer>

      {/* Auth, Subscription & Changelog Modals */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <SubscriptionModal isOpen={isSubOpen} onClose={() => setIsSubOpen(false)} />
      <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />

    </div>
  );
}
