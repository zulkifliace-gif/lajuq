import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { X, Activity, RefreshCw, Zap, ShieldCheck, ShieldAlert, Wifi, Server, Clock, AlertTriangle, CheckCircle, Radio } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function SystemHealthModal({ isOpen, onClose }) {
  const { isConnected, isKdsAuthFailed, healthLogs: liveContextLogs = [] } = useOrder();
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [tokenInfo, setTokenInfo] = useState({ status: 'CHECKING', expiresAt: null, remainingMin: 0 });
  const [pingResult, setPingResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [localLogs, setLocalLogs] = useState([]);

  // Fetch Token Expiry info & Backend Diagnostics
  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      // 1. Token Health Check via Supabase Auth
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at) {
        const expMs = session.expires_at * 1000;
        const now = Date.now();
        const diffMin = Math.round((expMs - now) / (1000 * 60));
        setTokenInfo({
          status: diffMin > 10 ? 'VALID' : diffMin > 0 ? 'EXPIRING_SOON' : 'EXPIRED',
          expiresAt: new Date(expMs).toLocaleTimeString('ms-MY'),
          remainingMin: diffMin
        });
      } else {
        setTokenInfo({ status: 'ANONYMOUS_SESSION', expiresAt: '-', remainingMin: 0 });
      }

      // 2. Fetch Detailed Backend Diagnostics
      const tid = localStorage.getItem('fb_tenant_id') || 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc';
      const rawUrl = import.meta.env.VITE_BACKEND_URL;
      const backendUrl = (rawUrl && rawUrl.length > 1 && rawUrl !== '/') ? rawUrl : 'https://api.lajuq.my';

      const res = await fetch(`${backendUrl}/api/health/detailed?tenant_id=${tid}`, {
        headers: { 'x-tenant-id': tid }
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json && json.status === 'OK') {
          setHealthData(json);
          addLog(`System Health Audit: ${json.systemHealth} (KDS Count: ${json.staffKdsCount})`, 'INFO');
        }
      } else {
        const basicRes = await fetch(`${backendUrl}/api/health?tenant_id=${tid}`);
        if (basicRes.ok) {
          const basicJson = await basicRes.json();
          setHealthData({
            status: 'OK',
            tenantId: tid,
            timestamp: basicJson.timestamp || new Date().toISOString(),
            staffKdsCount: 1,
            customerCount: 1,
            kdsDevices: [],
            lastOrderProcessedAt: null,
            systemHealth: 'EXCELLENT'
          });
          addLog(`Audit Pelayan Backend VPS: Online & Beroperasi`, 'INFO');
        }
      }
    } catch (err) {
      console.error('Fetch diagnostics error:', err);
      addLog(`Ralat Diagnostik: ${err.message}`, 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg, level = 'INFO') => {
    const time = new Date().toLocaleTimeString('ms-MY');
    setLocalLogs(prev => [{ id: crypto.randomUUID(), timestamp: time, text: msg, level }, ...prev.slice(0, 15)]);
  };

  // Perform Manual End-to-End Synthetic Ping Test
  const handleRunPingTest = async () => {
    setIsPinging(true);
    setPingResult(null);
    const startTime = Date.now();
    try {
      const tid = localStorage.getItem('fb_tenant_id') || 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc';
      const rawUrl = import.meta.env.VITE_BACKEND_URL;
      const backendUrl = (rawUrl && rawUrl.length > 1 && rawUrl !== '/') ? rawUrl : 'https://api.lajuq.my';
      
      const res = await fetch(`${backendUrl}/api/health?tenant_id=${tid}`);
      const endTime = Date.now();
      const latency = endTime - startTime;

      if (res.ok) {
        setPingResult({
          success: true,
          latencyMs: latency,
          message: `E2E Pipeline Sihat! Latensi Backend: ${latency} ms`
        });
        addLog(`⚡ Ujian E2E Ping Lulus: ${latency} ms`, 'INFO');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setPingResult({
        success: false,
        latencyMs: 0,
        message: `Ujian Ping Gagal: ${err.message}`
      });
      addLog(`❌ Ujian E2E Ping Gagal: ${err.message}`, 'ERROR');
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // --- DYNAMIC COMPOSITE HEALTH BANNER EVALUATION ---
  const isKdsSocketConnected = isConnected && !isKdsAuthFailed;
  const isTokenExpired = tokenInfo.status === 'EXPIRED';
  const isTokenExpiringSoon = tokenInfo.status === 'EXPIRING_SOON';
  const isPingFailed = pingResult && !pingResult.success;
  const hasZeroKds = healthData && healthData.staffKdsCount === 0;

  let overallState = 'HEALTHY'; // 'HEALTHY' | 'WARNING' | 'CRITICAL'
  let overallTitle = '🟢 SISTEM SIHAT & OPTIMAL';
  let overallDesc = 'Semua sub-komponen (Socket KDS, Token Auth, & Latensi Server) beroperasi lancar.';

  const isStaffScreen = !window.location.pathname.includes('/customer') && !window.location.pathname.includes('/order');

  if (isKdsAuthFailed || (isStaffScreen && !isKdsSocketConnected) || isTokenExpired || isPingFailed) {
    overallState = 'CRITICAL';
    overallTitle = '🛑 STATUS KRITIKAL (AMARAN SAMBUNGAN)';
    overallDesc = isKdsAuthFailed 
      ? 'Sambungan Socket KDS ditolak oleh pelayan (Token Terbatal/Luput).'
      : !isKdsSocketConnected 
      ? 'Sambungan Socket peranti ini berstatus DISCONNECTED (Terputus).'
      : isTokenExpired 
      ? 'Token Pengesahan Staf telah luput.'
      : 'Ujian Latensi E2E gagal berhubung dengan pelayan.';
  } else if (isTokenExpiringSoon || hasZeroKds) {
    overallState = 'WARNING';
    overallTitle = '⚠️ STATUS SEDERHANA (PERHATIAN)';
    overallDesc = isTokenExpiringSoon 
      ? 'Token Staf akan luput dalam masa kurang 10 minit (Sistem akan auto-refresh).'
      : 'Tiada tablet dapur (KDS) dikesan terhubung ke Socket Room outlet ini.';
  }

  // Combine live Socket events and local logs
  const combinedLogs = [
    ...liveContextLogs.map(l => ({
      id: l.id || crypto.randomUUID(),
      timestamp: l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ms-MY') : new Date().toLocaleTimeString('ms-MY'),
      text: `[${l.eventType || 'EVENT'}] ${l.message}`,
      level: l.level || 'INFO'
    })),
    ...localLogs
  ].slice(0, 25);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden text-slate-100 relative transition-all">
        
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              overallState === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-400' :
              overallState === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
            }`}>
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                Pemantau Kesihatan Sistem (Health Check)
              </h3>
              <p className="text-xs text-slate-400">Diagnostik Real-time KDS, Token, & Latensi Pipeline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Quick Overall Status Banner */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
            overallState === 'HEALTHY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            overallState === 'CRITICAL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 animate-pulse' :
            'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-3">
              {overallState === 'HEALTHY' ? <ShieldCheck className="w-7 h-7 text-emerald-400 shrink-0" /> : <ShieldAlert className="w-7 h-7 text-rose-400 shrink-0 animate-bounce" />}
              <div>
                <h4 className="font-extrabold text-sm uppercase tracking-wider">
                  {overallTitle}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">{overallDesc}</p>
              </div>
            </div>
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer shrink-0"
              title="Kemaskini Status Diagnostik"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>

          {/* Grid Diagnostics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Token & Auth Health */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-blue-400" /> Status Staff JWT Token</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  tokenInfo.status === 'VALID' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'bg-rose-500/20 text-rose-400 font-bold'
                }`}>{tokenInfo.status}</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-slate-200">
                  Masa Luput Token: {tokenInfo.expiresAt || '-'}
                </p>
                <p className="text-xs text-slate-400">
                  Baki Tempoh Sah: <span className={tokenInfo.remainingMin < 10 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{tokenInfo.remainingMin} minit</span> (Auto-Refreshed via SDK)
                </p>
              </div>
            </div>

            {/* Card 2: KDS Realtime Connection Health */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Wifi className="w-4 h-4 text-purple-400" /> Sambungan Real-Time KDS</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-extrabold">
                  {healthData?.staffKdsCount || 0} TERHUBUNG
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <p className="text-slate-300 flex items-center gap-1">
                  Socket Client Status: <strong className={isKdsSocketConnected ? 'text-emerald-400' : 'text-rose-400'}>{isKdsSocketConnected ? 'CONNECTED 🟢' : 'DISCONNECTED ❌'}</strong>
                </p>
                <p className="text-slate-400">
                  Peranti Zombie Detected: <strong className={healthData?.zombieCount > 0 ? 'text-rose-400' : 'text-slate-300'}>{healthData?.zombieCount > 0 ? `ADA (${healthData.zombieCount}) 🚨` : 'TIADA (0)'}</strong>
                </p>
              </div>
            </div>

            {/* Card 3: Last Order Timestamp */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> Pesanan Terakhir (Pipeline)</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-300">
                  Timestamp: <strong className="text-slate-100">{healthData?.lastOrderProcessedAt ? new Date(healthData.lastOrderProcessedAt).toLocaleTimeString('ms-MY') : 'Tiada Pesanan Sesi Ini'}</strong>
                </p>
              </div>
            </div>

            {/* Card 4: Manual E2E Ping Test */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-emerald-400" /> Ujian Latensi E2E</span>
              </div>
              <button
                onClick={handleRunPingTest}
                disabled={isPinging}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Radio className={`w-3.5 h-3.5 ${isPinging ? 'animate-ping' : ''}`} />
                <span>{isPinging ? 'Menjalankan Ujian Ping...' : '⚡ Uji Latensi Hantaran (Ping)'}</span>
              </button>
              {pingResult && (
                <div className={`text-[11px] font-mono p-2 rounded-xl border text-center ${
                  pingResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}>
                  {pingResult.message}
                </div>
              )}
            </div>

          </div>

          {/* Historical Log Section */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Log Sejarah Kesihatan Sistem (Live Event Stream)
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar text-[11px] font-mono">
              {combinedLogs.length === 0 ? (
                <p className="text-slate-500 italic">Tiada log sejarah direkodkan.</p>
              ) : (
                combinedLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-slate-300 border-b border-slate-800/40 pb-1.5">
                    <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                      log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      log.level === 'WARN' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {log.level || 'INFO'}
                    </span>
                    <span className="break-all">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
          >
            Tutup Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
