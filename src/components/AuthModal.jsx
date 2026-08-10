import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Store, Mail, Lock, X, RefreshCw, CheckCircle } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const { login, signup, loginWithGoogle } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setErrorMessage('');
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google Auth Error:', err);
      setErrorMessage(err.message || 'Gagal log masuk dengan Google.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isLoginMode) {
        await login(email, password);
        setSuccessMessage('Log masuk berjaya!');
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        if (!restaurantName.trim()) {
          setErrorMessage('Sila masukkan Nama Restoran anda.');
          setLoading(false);
          return;
        }
        await signup(email, password, restaurantName);
        setSuccessMessage('Pendaftaran restoran berjaya! 📧 Sila semak peti masuk emel anda & tekan pautan pengesahan (Confirm Email Address) sebelum mencerakin log masuk.');
        setTimeout(() => {
          setIsLoginMode(true);
        }, 5000);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setErrorMessage(err.message || 'Gagal memproses permohonan. Sila semak emel & kata laluan anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      
      {/* Outer Gradient Border Frame (rounded-[28px]) */}
      <div className="relative w-full max-w-md bg-gradient-to-tr from-[#F04D23] via-[#FF7F27] to-[#FFCA3A] p-[5px] rounded-[28px] shadow-2xl transform transition-all">
        
        {/* Inner Clean White Card */}
        <div className="relative w-full bg-white rounded-[23px] overflow-hidden p-6 sm:p-8 text-slate-900">
          
          {/* Speed Lines / Jalur Laju Decorative Graphic (Top Left) */}
          <div className="absolute top-2.5 left-3 pointer-events-none opacity-85">
            <svg width="170" height="38" viewBox="0 0 170 38" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 4H110C113.314 4 116 6.68629 116 10C116 13.3137 113.314 16 110 16H0V4Z" fill="url(#speed1)"/>
              <path d="M0 20H80C83.3137 20 86 22.6863 86 26C86 29.3137 83.3137 32 80 32H0V20Z" fill="url(#speed2)"/>
              <path d="M92 22H130C132.209 22 134 23.7909 134 26C134 28.2091 132.209 30 130 30H92V22Z" fill="url(#speed3)"/>
              <path d="M122 6H152C153.657 6 155 7.34315 155 9C155 10.6569 153.657 12 152 12H122V6Z" fill="url(#speed4)"/>
              <defs>
                <linearGradient id="speed1" x1="0" y1="10" x2="116" y2="10" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F04D23"/>
                  <stop offset="1" stopColor="#FF7F27"/>
                </linearGradient>
                <linearGradient id="speed2" x1="0" y1="26" x2="86" y2="26" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FF7F27"/>
                  <stop offset="1" stopColor="#FFCA3A"/>
                </linearGradient>
                <linearGradient id="speed3" x1="92" y1="26" x2="134" y2="26" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F04D23"/>
                  <stop offset="1" stopColor="#FF7F27"/>
                </linearGradient>
                <linearGradient id="speed4" x1="122" y1="9" x2="155" y2="9" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FF7F27"/>
                  <stop offset="1" stopColor="#FFCA3A"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-5 pt-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] rounded-2xl text-white font-black shadow-md shadow-[#F04D23]/25 shrink-0">
                {isLoginMode ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900">
                  {isLoginMode ? 'Log Masuk Pemilik Restoran' : 'Daftar Restoran Baharu'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {isLoginMode ? 'Akses portal pengurusan pesanan & kaunter anda.' : 'Daftar Restoran anda & nikmati tempoh Percubaan.'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-5 border border-slate-200 text-xs font-bold relative z-10">
            <button
              type="button"
              onClick={() => { setIsLoginMode(true); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl transition ${isLoginMode ? 'bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white shadow-sm font-extrabold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Log Masuk
            </button>
            <button
              type="button"
              onClick={() => { setIsLoginMode(false); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl transition ${!isLoginMode ? 'bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white shadow-sm font-extrabold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Daftar Restoran Baru
            </button>
          </div>

          {/* Google OAuth Login Button */}
          <div className="mb-5 relative z-10">
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={googleLoading}
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 transition flex items-center justify-center gap-3 shadow-xs active:scale-95"
            >
              {googleLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Terus dengan Google</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center mb-5 z-10">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
              ATAU GUNA EMEL
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            
            {!isLoginMode && (
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Nama Restoran / Cafe</label>
                <div className="relative">
                  <Store className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Contoh: Restoran Nasi Kandar Aman"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:border-[#F04D23] focus:bg-white transition shadow-2xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">Emel Pemilik</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@restoran.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:border-[#F04D23] focus:bg-white transition shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">Kata Laluan</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:border-[#F04D23] focus:bg-white transition shadow-2xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#F04D23] via-[#FF7F27] to-[#FFCA3A] hover:brightness-105 text-white font-black rounded-xl text-xs transition shadow-lg shadow-[#F04D23]/30 flex items-center justify-center gap-2 mt-6 active:scale-95"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : isLoginMode ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>{isLoginMode ? 'Log Masuk Restoran' : 'Daftar Restoran Sekarang'}</span>
            </button>
          </form>

          {/* Terms of Service Disclaimer */}
          <div className="mt-4 text-center">
            <p className="text-[11px] text-slate-500 font-medium">
              Dengan mendaftar atau log masuk, anda bersetuju dengan{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F04D23] font-bold hover:underline transition"
              >
                Terms of Service
              </a>
              {' '}kami.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
