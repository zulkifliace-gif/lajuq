import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, ShieldCheck, Zap, X, ExternalLink, RefreshCw, Sparkles, LogIn, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getBackendBaseUrl } from '../utils/apiConfig';
import AuthModal from './AuthModal';

export default function SubscriptionModal({ isOpen, onClose, currentTenantId = 'demo-restaurant', subscriptionStatus = 'trialing', planType = 'starter' }) {
  const { user, tenant } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [subscriptionMonths, setSubscriptionMonths] = useState(4);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);

  // 1. Lock background scroll when modal is open
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

  // 3. Automatically trigger Stripe checkout after successful login if a plan was selected
  useEffect(() => {
    if (user && tenant && pendingPlan) {
      const planToProcess = pendingPlan;
      setPendingPlan(null);
      executeStripeCheckout(planToProcess.plan, planToProcess.months, tenant.id);
    }
  }, [user, tenant, pendingPlan]);

  if (!isOpen) return null;

  const activeTenantId = tenant?.id || currentTenantId;
  const activeStatus = tenant?.subscription_status || subscriptionStatus || 'trialing';
  const activePlan = tenant?.plan_type || planType || 'starter';

  const API_BASE_URL = getBackendBaseUrl();

  const executeStripeCheckout = async (selectedPlan, months, tenantId) => {
    setLoadingPlan(selectedPlan);
    setErrorMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId || activeTenantId,
          customer_email: user?.email || '',
          plan_type: selectedPlan,
          months: months || 4,
          success_url: window.location.href + '?subscription=success',
          cancel_url: window.location.href + '?subscription=cancelled'
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMessage(data.error || 'Gagal menjana pautan bayaran Stripe.');
      }
    } catch (err) {
      console.error('Error starting checkout:', err);
      setErrorMessage('Terjadi ralat rangkaian semasa membuat pautan pembayaran.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleSubscribe = async (selectedPlan) => {
    // 3. If user is NOT logged in, require login first
    if (!user || !tenant) {
      setPendingPlan({ plan: selectedPlan, months: subscriptionMonths });
      setIsAuthModalOpen(true);
      return;
    }

    // If user IS logged in, go straight to Stripe!
    await executeStripeCheckout(selectedPlan, subscriptionMonths, tenant.id);
  };

  const handleManageSubscription = async () => {
    setLoadingPlan('portal');
    setErrorMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/stripe/create-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: activeTenantId,
          return_url: window.location.href
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMessage(data.error || 'Gagal membuka portal pelanggan Stripe.');
      }
    } catch (err) {
      setErrorMessage('Terjadi ralat membuka portal pelanggan.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-white max-h-[90vh] overflow-y-auto scrollbar-thin">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#F04D23]/20 border border-[#F04D23]/30 rounded-2xl text-[#F04D23]">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Pelan Sewaan SaaS & Lesen Restoran</h2>
                <p className="text-xs text-slate-400">Pilih pelan langganan restoran anda untuk akses penuh cloud hosting & ciri alatan sistem.</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Status Badge (Only when active or past_due) */}
          {(activeStatus === 'active' || activeStatus === 'past_due') && (
            <div className={`mb-6 p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              tenant?.subscription_past_due 
                ? 'bg-rose-500/10 border-rose-500/50' 
                : 'bg-slate-800/60 border-slate-700/60'
            }`}>
              <div className="flex items-center gap-3">
                {tenant?.subscription_past_due ? (
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                )}
                <div>
                  <div className={`text-sm font-semibold ${tenant?.subscription_past_due ? 'text-rose-500' : 'text-emerald-400'}`}>
                    {tenant?.subscription_past_due ? 'Aktif (Bayaran Tertunggak)' : 'Aktif (Berbayar)'}
                  </div>
                  {tenant?.subscription_end_date && (
                    <div className="text-xs text-slate-400 mt-1">
                      Kitaran bil seterusnya: {new Date(tenant.subscription_end_date).toLocaleDateString('ms-MY')}
                    </div>
                  )}
                  {tenant?.subscription_past_due && (
                    <div className="text-xs text-rose-400 mt-1 font-bold">
                      Amaran: Bayaran kad anda gagal, sila kemaskini kad dengan segera.
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={loadingPlan === 'portal'}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold transition text-white whitespace-nowrap"
              >
                {loadingPlan === 'portal' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Urus Langganan & Kad
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* 2 Pricing Cards Grid (Pelan Percuma vs Pelan Langganan) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-stretch">
            
            {/* CARD 1: Pelan Percuma */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6 flex flex-col justify-between space-y-6 relative hover:border-slate-600 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black text-white">Pelan Percuma</h3>
                  <span className="text-[10px] px-2.5 py-1 bg-slate-700 text-slate-300 rounded-full font-bold uppercase">
                    Percubaan
                  </span>
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

                <div className="border-t border-slate-700/60 pt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-300">Akses Penuh Semua Alat & Ciri:</p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Akses 100% Semua Fungsi & Tool</strong></span>
                    </li>
                    <li className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Had 100 Pesanan untuk 4 bulan</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Action Button for Free Plan */}
              {(activeStatus === 'active' || activeStatus === 'past_due') ? (
                <button
                  onClick={handleManageSubscription}
                  disabled={loadingPlan !== null}
                  className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  {loadingPlan === 'portal' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Urus Langganan di Portal
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe('free')}
                  disabled={loadingPlan !== null}
                  className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  {loadingPlan === 'free' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                  {user ? 'Pilih Pelan Percuma' : 'Log Masuk & Mula Pelan Percuma'}
                </button>
              )}
            </div>

            {/* CARD 2: Pelan Langganan (4 / 8 / 12 Bulan) */}
            <div className="bg-gradient-to-b from-[#F04D23]/20 via-slate-800/80 to-slate-900 border-2 border-[#F04D23] rounded-3xl p-6 flex flex-col justify-between space-y-6 shadow-xl relative">
              
              {/* Badge Top */}
              <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-lg">
                Paling Popular (Berpakej)
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-[#F04D23]">Pelan Langganan</h3>
                  <p className="text-xs text-slate-300">Pilih tempoh sewaan yang paling menjimatkan:</p>
                </div>

                {/* Month Selector Tabs (4 / 8 / 12 Bulan) */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800">
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
                <div className="space-y-1 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  {subscriptionMonths === 4 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white">RM 496</span>
                      <span className="text-xs text-slate-400 font-semibold">/ 4 bulan</span>
                    </div>
                  )}

                  {subscriptionMonths === 8 && (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-[#FFCA3A]">RM 930</span>
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
                        <span className="text-3xl font-black text-[#FFCA3A]">RM 1,390</span>
                        <span className="text-xs line-through text-slate-500 font-bold">RM 1,488</span>
                        <span className="text-xs text-slate-400 font-semibold">/ 12 bulan</span>
                      </div>
                      <div className="inline-block px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-full font-mono mt-1">
                        Server VPS Khas Percuma + Diskaun Penjimatan!
                      </div>
                    </>
                  )}
                </div>

                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Akses 100% Semua Fungsi & Tool</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Pesanan Tanpa Had (Unlimited Orders)</strong></span>
                  </li>
                </ul>
              </div>

              {/* Action Button for Paid Plan */}
              {(activeStatus === 'active' || activeStatus === 'past_due') ? (
                <button
                  onClick={handleManageSubscription}
                  disabled={loadingPlan !== null}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-slate-700 to-slate-600 hover:brightness-110 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg"
                >
                  {loadingPlan === 'portal' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  <span>Urus Langganan & Tukar Pelan di Portal</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(subscriptionMonths === 12 ? 'vps' : subscriptionMonths === 8 ? 'pro' : 'starter')}
                  disabled={loadingPlan !== null}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg shadow-[#F04D23]/30"
                >
                  {loadingPlan !== null ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{user ? `Langgan Pelan ${subscriptionMonths} Bulan` : `Log Masuk & Langgan Pelan ${subscriptionMonths} Bulan`}</span>
                </button>
              )}
            </div>

          </div>

          <div className="text-center text-[11px] text-slate-500 border-t border-slate-800/80 pt-4">
            🔒 Pembayaran selamat diproses secara terus oleh Stripe. Boleh batalkan sewaan pada bila-bila masa.
          </div>

        </div>
      </div>

      {/* Auth Modal for Login Prompt before Subscription */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
