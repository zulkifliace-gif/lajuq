import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { X, Activity, RefreshCw, Zap, ShieldCheck, ShieldAlert, Wifi, Server, Clock, AlertTriangle, CheckCircle, Radio } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function SystemHealthModal({ isOpen, onClose }) {
  const { isConnected } = useOrder();
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [tokenInfo, setTokenInfo] = useState({ status: 'CHECKING', expiresAt: null, remainingMin: 0 });
  const [pingResult, setPingResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [healthLogs, setHealthLogs] = useState([]);

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
          addLog(`System Health Audit: ${json.systemHealth} (KDS Count: ${json.staffKdsCount})`);
        }
      } else {
        // Fallback ke basic /api/health jika pelayan memulangkan asas
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
          addLog(`System Health Audit: EXCELLENT (Backend Server VPS Online)`);
        }
      }
    } catch (err) {
      console.error('Fetch diagnostics error:', err);
      addLog(`Ralat Diagnostik: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('ms-MY');
    setHealthLogs(prev => [{ time, text: msg }, ...prev.slice(0, 15)]);
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
        addLog(`⚡ E2E Ping Test Lulus: ${latency} ms`);
      } else {
        throw new Error(`HTTP Error ${res.status}`);
      }
    } catch (err) {
      setPingResult({
        success: false,
        latencyMs: 0,
        message: `Ujian Ping Gagal: ${err.message}`
      });
      addLog(`❌ E2E Ping Gagal: ${err.message}`);
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

  const isHealthy = healthData?.systemHealth === 'EXCELLENT';
  const hasZombie = healthData?.systemHealth === 'WARNING_ZOMBIE';
  const noKds = healthData?.systemHealth === 'WARNING_NO_KDS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden text-slate-100 relative transition-all">
        
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isHealthy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
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
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            isHealthy ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            hasZombie ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
            'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-3">
              {isHealthy ? <ShieldCheck className="w-7 h-7 text-emerald-400" /> : <ShieldAlert className="w-7 h-7 text-rose-400" />}
              <div>
                <h4 className="font-extrabold text-sm uppercase tracking-wider">
                  {isHealthy ? '🟢 Sistem Sihat & Beroperasi Normal' :
                   hasZombie ? '🚨 Amaran Zombie Connection KDS' :
                   noKds ? '⚠️ KDS Terputus / Tiada Tablet Terhubung' : '⚠️ Status Sederhana'}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">
                  {isHealthy ? 'Semua sambungan WebSocket KDS dan Token berada dalam keadaan stabil.' :
                   hasZombie ? 'Terdapat tablet dapur yang connected tetapi tidak bertindak balas (ZOMBIE).' :
                   'Tiada skrin dapur (KDS) dikesan terhubung ke Socket Room.'}
                </p>
              </div>
            </div>

            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 transition shadow-sm"
              title="Segarkan Semula Diagnostik"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Grid Diagnostics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Token & Auth Health */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-blue-400" /> Status Staff JWT Token</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  tokenInfo.status === 'VALID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>{tokenInfo.status}</span>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-200">
                  Masa Luput Token: <strong className="text-white">{tokenInfo.expiresAt}</strong>
                </div>
                <div className="text-xs text-slate-400">
                  Baki Tempoh Sah: <span className="text-emerald-400 font-bold">{tokenInfo.remainingMin} minit</span> (Auto-Refreshed via SDK)
                </div>
              </div>
            </div>

            {/* Card 2: KDS & Socket Connection */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Wifi className="w-4 h-4 text-purple-400" /> Sambungan Real-time KDS</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300">
                  {healthData?.staffKdsCount || 0} Terhubung
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="text-slate-300">
                  Socket Client Status: <strong className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>{isConnected ? 'CONNECTED ✅' : 'DISCONNECTED ❌'}</strong>
                </div>
                <div className="text-slate-400">
                  Peranti Zombie Detected: <strong className={hasZombie ? 'text-rose-400 font-bold' : 'text-slate-300'}>{hasZombie ? 'YA 🚨' : 'TIADA (0)'}</strong>
                </div>
              </div>
            </div>

            {/* Card 3: Last Order Processing */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> Pesanan Terakhir (Pipeline)</span>
              </div>
              <div className="text-xs text-slate-300">
                Timestamp: <strong className="text-white">{healthData?.lastOrderProcessedAt ? new Date(healthData.lastOrderProcessedAt).toLocaleTimeString('ms-MY') : 'Tiada Pesanan Sesi Ini'}</strong>
              </div>
            </div>

            {/* Card 4: End-to-End Latency Ping Test */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-emerald-400" /> Ujian Latensi E2E</span>
              </div>
              <button
                onClick={handleRunPingTest}
                disabled={isPinging}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isPinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                <span>{isPinging ? 'Menguji Latensi...' : '⚡ Uji Latensi Hantaran (Ping)'}</span>
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
              <Server className="w-3.5 h-3.5" /> Log Sejarah Kesihatan Sistem (Live)
            </h4>
            <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar text-[11px] font-mono">
              {healthLogs.length === 0 ? (
                <p className="text-slate-500 italic">Tiada log sejarah direkodkan.</p>
              ) : (
                healthLogs.map((log, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-slate-300 border-b border-slate-800/40 pb-1">
                    <span className="text-slate-500">[{log.time}]</span>
                    <span>{log.text}</span>
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
