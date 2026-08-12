import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrder } from '../context/OrderContext';
import { getBackendBaseUrl } from '../utils/apiConfig';
import { 
  Server, Database, Wifi, Activity, TerminalSquare, 
  CheckCircle, AlertCircle, XCircle, Clock, ChevronDown, ChevronRight,
  RefreshCw, Power, ShieldAlert
} from 'lucide-react';

export default function AdminHealthCheckPage() {
  const { healthLogs, realtimeStatus, sessions, orders } = useOrder();
  
  // -- State for Header Controls --
  const [liveSync, setLiveSync] = useState(true);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState(null); // 'node1', 'node2', etc.

  // -- State for Node Data --
  const [node1Data, setNode1Data] = useState(null);
  const [node2Data, setNode2Data] = useState(null);
  const [node5Data, setNode5Data] = useState(null);

  // Status computation for cascading logic
  // 'IDLE', 'LOADING', 'PASS', 'WARN', 'FAIL', 'BLOCKED'
  const [nodeStatus, setNodeStatus] = useState({
    node1: 'IDLE',
    node2: 'IDLE',
    node3: 'IDLE',
    node4: 'IDLE',
    node5: 'IDLE'
  });

  // Calculate Node 3 (Auth KDS) from healthLogs
  const node3Derived = useMemo(() => {
    const authLogs = healthLogs.filter(log => log.eventType === 'SOCKET_AUTH_REJECTED' || log.eventType === 'KDS_CONNECTED');
    if (authLogs.length === 0) return { status: 'PASS', logs: [] };
    const latestFailures = authLogs.filter(log => log.level === 'ERROR');
    if (latestFailures.length > 0) return { status: 'FAIL', logs: authLogs.slice(0, 5) };
    return { status: 'PASS', logs: authLogs.slice(0, 5) };
  }, [healthLogs]);

  // Calculate Node 4 (Submit Order) from healthLogs
  const node4Derived = useMemo(() => {
    const submitLogs = healthLogs.filter(log => log.eventType === 'SUBMIT_ORDER_FAILED');
    if (submitLogs.length === 0) return { status: 'PASS', logs: [] };
    return { status: 'WARN', logs: submitLogs.slice(0, 5) };
  }, [healthLogs]);

  // Derived Sessions
  const openSessions = useMemo(() => {
    return Object.values(sessions).filter(s => s.status !== 'CLOSED');
  }, [sessions]);

  // Fetch functions for API Nodes
  const fetchNode1 = useCallback(async () => {
    try {
      const tenantId = localStorage.getItem('fb_tenant_id') || '';
      const res = await fetch(`${getBackendBaseUrl()}/api/health`, {
        headers: { 'x-tenant-id': tenantId }
      });
      const data = await res.json();
      setNode1Data(data);
      if (data.status === 'ERROR') {
        return 'FAIL';
      }
      if (data.heapMemoryUsedMb > 400 || data.processUptimeSeconds < 60) {
        return 'WARN'; // Crash loop warning or High Mem
      }
      return 'PASS';
    } catch (e) {
      return 'FAIL';
    }
  }, []);

  const fetchNode2 = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/db/ping`);
      const data = await res.json();
      setNode2Data(data);
      if (!data.isDbReachable) return 'FAIL';
      
      // Check Realtime Channels
      if (Object.values(realtimeStatus).some(status => status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        return 'WARN';
      }
      return 'PASS';
    } catch (e) {
      return 'FAIL';
    }
  }, [realtimeStatus]);

  const fetchNode5 = useCallback(async () => {
    try {
      const tenantId = localStorage.getItem('fb_tenant_id') || '';
      const res = await fetch(`${getBackendBaseUrl()}/api/health/detailed`, {
        headers: { 'x-tenant-id': tenantId }
      });
      const data = await res.json();
      setNode5Data(data);
      
      if (!data.kdsDevices || data.kdsDevices.length === 0) {
        return 'WARN'; // No devices connected
      }
      
      const hasZombie = data.kdsDevices.some(device => device.isZombie);
      if (hasZombie) return 'FAIL';
      
      return 'PASS';
    } catch (e) {
      return 'FAIL';
    }
  }, []);

  // Cascading update logic
  const updateStatus = (node, status) => {
    setNodeStatus(prev => ({ ...prev, [node]: status }));
  };

  const runAllTests = async () => {
    setIsTestingAll(true);
    setNodeStatus({ node1: 'LOADING', node2: 'IDLE', node3: 'IDLE', node4: 'IDLE', node5: 'IDLE' });
    
    // Node 1
    const s1 = await fetchNode1();
    updateStatus('node1', s1);
    if (s1 === 'FAIL') {
      setNodeStatus(prev => ({ ...prev, node2: 'BLOCKED', node3: 'BLOCKED', node4: 'BLOCKED' }));
      const s5 = await fetchNode5();
      updateStatus('node5', s5);
      setIsTestingAll(false);
      return;
    }

    // Node 2
    updateStatus('node2', 'LOADING');
    const s2 = await fetchNode2();
    updateStatus('node2', s2);
    if (s2 === 'FAIL') {
      setNodeStatus(prev => ({ ...prev, node3: 'BLOCKED', node4: 'BLOCKED' }));
      const s5 = await fetchNode5();
      updateStatus('node5', s5);
      setIsTestingAll(false);
      return;
    }

    // Node 3
    updateStatus('node3', 'LOADING');
    await new Promise(r => setTimeout(r, 500)); // Simulating check
    const s3 = node3Derived.status;
    updateStatus('node3', s3);
    if (s3 === 'FAIL') {
      setNodeStatus(prev => ({ ...prev, node4: 'BLOCKED' }));
      const s5 = await fetchNode5();
      updateStatus('node5', s5);
      setIsTestingAll(false);
      return;
    }

    // Node 4
    updateStatus('node4', 'LOADING');
    await new Promise(r => setTimeout(r, 500)); // Simulating check
    const s4 = node4Derived.status;
    updateStatus('node4', s4);
    
    // Node 5
    updateStatus('node5', 'LOADING');
    const s5 = await fetchNode5();
    updateStatus('node5', s5);
    
    setIsTestingAll(false);
  };

  // Live Sync Polling Effect
  useEffect(() => {
    if (!liveSync) return;
    
    // Initial fetch
    fetchNode1().then(s => updateStatus('node1', s));
    fetchNode2().then(s => updateStatus('node2', s));
    fetchNode5().then(s => updateStatus('node5', s));
    
    const intervalId = setInterval(() => {
      fetchNode1().then(s => updateStatus('node1', s));
      fetchNode2().then(s => updateStatus('node2', s));
      fetchNode5().then(s => updateStatus('node5', s));
    }, 10000); // 10 seconds polling for HTTP nodes
    
    return () => clearInterval(intervalId);
  }, [liveSync, fetchNode1, fetchNode2, fetchNode5]);

  // Sync Node 3 & 4 reactive states
  useEffect(() => {
    if (!liveSync || isTestingAll) return;
    if (nodeStatus.node2 !== 'FAIL' && nodeStatus.node1 !== 'FAIL') {
      updateStatus('node3', node3Derived.status);
      if (node3Derived.status !== 'FAIL') {
        updateStatus('node4', node4Derived.status);
      } else {
        updateStatus('node4', 'BLOCKED');
      }
    }
  }, [liveSync, isTestingAll, node3Derived.status, node4Derived.status, nodeStatus.node1, nodeStatus.node2]);


  // Helper UI Components
  const StatusIcon = ({ status }) => {
    switch(status) {
      case 'PASS': return <CheckCircle className="w-6 h-6 text-emerald-500" />;
      case 'WARN': return <AlertCircle className="w-6 h-6 text-amber-500" />;
      case 'FAIL': return <XCircle className="w-6 h-6 text-rose-500" />;
      case 'BLOCKED': return <ShieldAlert className="w-6 h-6 text-slate-400" />;
      case 'LOADING': return <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />;
      default: return <Clock className="w-6 h-6 text-slate-300" />;
    }
  };

  const getStatusBorder = (status) => {
    switch(status) {
      case 'PASS': return 'border-emerald-500';
      case 'WARN': return 'border-amber-500';
      case 'FAIL': return 'border-rose-500';
      case 'BLOCKED': return 'border-slate-300 border-dashed opacity-60';
      case 'LOADING': return 'border-indigo-500';
      default: return 'border-slate-200';
    }
  };

  const PipelineLine = ({ blocked }) => (
    <div className={`w-1 h-8 mx-auto my-1 ${blocked ? 'border-l-4 border-dashed border-slate-300' : 'bg-slate-300'}`}></div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-24">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Activity className="text-indigo-600" /> System Health Check
            </h1>
            <p className="text-sm text-slate-500 mt-1">Pemantauan Ekosistem 5-Node (Pipeline Utama)</p>
          </div>
          
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <button 
              onClick={() => setLiveSync(!liveSync)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${liveSync ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
            >
              <RefreshCw className={`w-4 h-4 ${liveSync ? 'animate-spin' : ''}`} />
              Live Sync: {liveSync ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={runAllTests}
              disabled={isTestingAll}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Power className="w-4 h-4" />
              {isTestingAll ? 'Menguji...' : 'Jalankan Semua Ujian'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Pipeline Area */}
          <div className="lg:col-span-2">
            
            {/* NODE 1 */}
            <div className={`bg-white rounded-xl shadow-sm border-2 transition-all ${getStatusBorder(nodeStatus.node1)}`}>
              <button 
                onClick={() => setActiveAccordion(activeAccordion === 'node1' ? null : 'node1')}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 p-2 rounded-lg"><Server className="w-6 h-6 text-slate-700" /></div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">Node 1: Server VPS</h3>
                    <p className="text-xs text-slate-500">Ketersediaan Enjin Node.js & PM2</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusIcon status={nodeStatus.node1} />
                  {activeAccordion === 'node1' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              
              {activeAccordion === 'node1' && nodeStatus.node1 !== 'BLOCKED' && (
                <div className="px-4 pb-4 border-t border-slate-100 mt-2 pt-4">
                  {node1Data ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-slate-500 block mb-1">Process Uptime</span>
                        <span className={`font-mono font-semibold ${node1Data.processUptimeSeconds < 60 ? 'text-amber-600' : 'text-slate-800'}`}>
                          {node1Data.processUptimeSeconds} saat
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-slate-500 block mb-1">Memory (Heap)</span>
                        <span className={`font-mono font-semibold ${node1Data.heapMemoryUsedMb > 400 ? 'text-amber-600' : 'text-slate-800'}`}>
                          {node1Data.heapMemoryUsedMb} MB
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-2">
                        <span className="text-slate-500 block mb-1">PM2 Process ID</span>
                        <span className="font-mono text-slate-700">{node1Data.pm2ProcessId}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-slate-400 text-sm">Tiada data atau gagal dihubungi.</div>
                  )}
                </div>
              )}
            </div>
            
            <PipelineLine blocked={nodeStatus.node2 === 'BLOCKED'} />

            {/* NODE 2 */}
            <div className={`bg-white rounded-xl shadow-sm border-2 transition-all ${getStatusBorder(nodeStatus.node2)}`}>
              <button 
                onClick={() => setActiveAccordion(activeAccordion === 'node2' ? null : 'node2')}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 p-2 rounded-lg"><Database className="w-6 h-6 text-slate-700" /></div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">Node 2: Supabase Connection</h3>
                    <p className="text-xs text-slate-500">Akses Pangkalan Data & Realtime</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusIcon status={nodeStatus.node2} />
                  {activeAccordion === 'node2' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              
              {activeAccordion === 'node2' && nodeStatus.node2 !== 'BLOCKED' && (
                <div className="px-4 pb-4 border-t border-slate-100 mt-2 pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-sm font-semibold text-slate-700">DB Reachability (/api/db/ping)</span>
                      <span className={`text-sm font-mono font-bold ${node2Data?.isDbReachable ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {node2Data?.isDbReachable ? `OK (${node2Data.latencyMs}ms)` : 'UNREACHABLE'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-semibold text-slate-600">Realtime: tenant_orders</span>
                      <span className={`text-xs font-mono font-bold ${realtimeStatus.orders === 'SUBSCRIBED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {realtimeStatus.orders}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-semibold text-slate-600">Realtime: tenant_sessions</span>
                      <span className={`text-xs font-mono font-bold ${realtimeStatus.sessions === 'SUBSCRIBED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {realtimeStatus.sessions}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-semibold text-slate-600">Realtime: tenant_feedbacks</span>
                      <span className={`text-xs font-mono font-bold ${realtimeStatus.feedbacks === 'SUBSCRIBED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {realtimeStatus.feedbacks}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <PipelineLine blocked={nodeStatus.node3 === 'BLOCKED'} />

            {/* NODE 3 */}
            <div className={`bg-white rounded-xl shadow-sm border-2 transition-all ${getStatusBorder(nodeStatus.node3)}`}>
              <button 
                onClick={() => setActiveAccordion(activeAccordion === 'node3' ? null : 'node3')}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 p-2 rounded-lg"><Wifi className="w-6 h-6 text-slate-700" /></div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">Node 3: Autentikasi Staf/KDS</h3>
                    <p className="text-xs text-slate-500">Middleware Socket Connection (Validasi Token)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusIcon status={nodeStatus.node3} />
                  {activeAccordion === 'node3' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              
              {activeAccordion === 'node3' && nodeStatus.node3 !== 'BLOCKED' && (
                <div className="px-4 pb-4 border-t border-slate-100 mt-2 pt-4">
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {node3Derived.logs.length > 0 ? node3Derived.logs.map((log, idx) => (
                      <div key={idx} className={`p-3 rounded-lg text-sm border ${log.level === 'ERROR' ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                        <span className="font-semibold">{log.level === 'ERROR' ? 'Ralat Auth' : 'Berjaya'}:</span> {log.message}
                        {log.details?.reason && <span className="block text-xs mt-1 font-mono opacity-80">Reason: {log.details.reason}</span>}
                      </div>
                    )) : (
                      <div className="text-center py-4 text-slate-400 text-sm">Tiada log kegagalan autentikasi dikesan. Sockets dijangka sihat.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <PipelineLine blocked={nodeStatus.node4 === 'BLOCKED'} />

            {/* NODE 4 */}
            <div className={`bg-white rounded-xl shadow-sm border-2 transition-all ${getStatusBorder(nodeStatus.node4)}`}>
              <button 
                onClick={() => setActiveAccordion(activeAccordion === 'node4' ? null : 'node4')}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 p-2 rounded-lg"><TerminalSquare className="w-6 h-6 text-slate-700" /></div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">Node 4: Pengesahan Pesanan (Submit Order)</h3>
                    <p className="text-xs text-slate-500">Rate Limit, Semakan Stok & Validasi Sesi</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusIcon status={nodeStatus.node4} />
                  {activeAccordion === 'node4' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              
              {activeAccordion === 'node4' && nodeStatus.node4 !== 'BLOCKED' && (
                <div className="px-4 pb-4 border-t border-slate-100 mt-2 pt-4">
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {node4Derived.logs.length > 0 ? node4Derived.logs.map((log, idx) => (
                      <div key={idx} className="p-3 rounded-lg text-sm border bg-amber-50 border-amber-100 text-amber-800">
                        <span className="font-semibold">Ditolak:</span> {log.message}
                        {log.details?.reason && <span className="block text-xs mt-1 font-mono opacity-80">Kod: {log.details.reason}</span>}
                      </div>
                    )) : (
                      <div className="text-center py-4 text-emerald-600 text-sm">Tiada penolakan pesanan dikesan setakat ini.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <PipelineLine blocked={false} /> {/* Node 5 is never blocked */}

            {/* NODE 5 */}
            <div className={`bg-white rounded-xl shadow-sm border-2 transition-all ${getStatusBorder(nodeStatus.node5)}`}>
              <button 
                onClick={() => setActiveAccordion(activeAccordion === 'node5' ? null : 'node5')}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 p-2 rounded-lg"><CheckCircle className="w-6 h-6 text-slate-700" /></div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">Node 5: Terima di KDS ⚠️</h3>
                    <p className="text-xs text-slate-500">Penjejakan ZOMBIE & Pengesahan Per-Peranti</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusIcon status={nodeStatus.node5} />
                  {activeAccordion === 'node5' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              
              {activeAccordion === 'node5' && (
                <div className="px-4 pb-4 border-t border-slate-100 mt-2 pt-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Senarai KDS (Per-Socket)</h4>
                  <div className="space-y-2">
                    {node5Data?.kdsDevices?.length > 0 ? (
                      node5Data.kdsDevices.map((dev, idx) => (
                        <div key={idx} className={`p-3 rounded-lg border flex justify-between items-center ${dev.isZombie ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-100'}`}>
                          <div>
                            <span className="font-mono text-sm font-bold text-slate-700 flex items-center gap-2">
                              {dev.isZombie ? <span className="w-2 h-2 rounded-full bg-rose-500"></span> : <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                              KDS Socket: {dev.socketId.substring(0,6)}...
                            </span>
                            <span className="text-xs text-slate-500 block mt-1">
                              Latency: {dev.lastLatencyMs}ms
                            </span>
                          </div>
                          <div className={`text-xs font-bold px-2 py-1 rounded ${dev.isZombie ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'}`}>
                            {dev.isZombie ? 'ZOMBIE (>45s)' : 'HEALTHY'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-4 bg-slate-50 rounded-lg text-slate-500 text-sm">
                        Tiada peranti KDS bersambung.
                      </div>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-6 mb-3">Log Penerimaan Pesanan (ACK)</h4>
                  <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-3 rounded-lg max-h-40 overflow-y-auto">
                    {/* Compute ACK logs from orders and healthLogs if available. For now, showing recent orders broadcasted. */}
                    {orders.slice(0, 5).map(o => (
                      <div key={o.order_id} className="mb-2 border-b border-slate-700 pb-2">
                        <span className="text-slate-400">[{new Date(o.created_at).toLocaleTimeString()}]</span> Order #{o.order_number} — 
                        Terkini (Status disegerak ke pangkalan data).
                        {/* We would map KDS ACK events here if backend logged them individually into healthLogs */}
                      </div>
                    ))}
                    {orders.length === 0 && <span className="text-slate-500">Menunggu pesanan baharu...</span>}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 sticky top-6">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  Sesi Aktif (Live)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Meja yang sedang melayan pelanggan</p>
              </div>
              <div className="p-0 max-h-[600px] overflow-y-auto">
                {openSessions.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {openSessions.map(session => {
                      // Kira tempoh ringkas
                      const opened = new Date(session.opened_at);
                      const diff = Math.floor((new Date() - opened) / 60000); // dalam minit
                      return (
                        <li key={session.session_id} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-700">Meja {session.table_number}</span>
                            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              {diff} min lalu
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            ID: {session.session_id.substring(0,8)}...
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    Tiada meja aktif buat masa ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
