import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { connectBluetoothPrinter, printKitchenRunnerTicketBluetooth, isDrinkItem } from '../utils/bluetoothPrinter';
import { getSubscriptionCycleInfo, getCycleOrdersCount, isFreePlan, FREE_PLAN_LIMIT } from '../utils/subscriptionQuota';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getBackendBaseUrl } from '../utils/apiConfig';

// Create Context
const OrderContext = createContext();

// Mock Initial Menu Data with Malaysian F&B items, categories, and options
// Menu kosong - data sebenar diambil dari Supabase menu_items apabila logged in
export const INITIAL_MENU = [];

const INITIAL_TABLES = Array.from({ length: 20 }, (_, i) => ({
  table_number: i + 1,
  status: 'KOSONG', // KOSONG | ADA_PELANGGAN | SEDANG_MAKAN
  current_session_id: null
}));

// Removed STORAGE_KEYS. Local caching disabled for multi-tenant data isolation.

const DEFAULT_RECEIPT_SETTINGS = {
  paperWidth: '58mm',
  tableCount: 20,
  headerTitle: 'RESTORAN RASA SELERA',
  headerAddress: 'No. 18, Jalan Telawi 3, Bangsar, 59100 Kuala Lumpur',
  footerMsg: 'Terima Kasih! Sila Datang Lagi.',
  logoUrl: null,
  staffPin: '1234',
  operationalMode: 'POSTPAY', // Default: 'POSTPAY' (Makan Dulu) | 'PREPAY' (Bayar Dulu)

  // Extra Charges & Tax Configuration (Cas Tambahan & Cukai)
  enableSst: false,           // SST (OFF by default)
  sstRate: 0,                 // 0% default
  enableServiceCharge: false, // Cas Perkhidmatan (Service Charge)
  serviceChargeRate: 0,       // 0% default
  enableCustomCharge: false,  // Cas Tambahan Custom
  customChargeName: 'Cas Bungkus / Servis',
  customChargeType: 'RM',     // 'RM' or '%'
  customChargeAmount: 0.00,

  // Cas Bungkus (Takeaway Charge) — Auto dikenakan bila pelanggan pilih Bungkus semasa Semakan Pesanan
  enableTakeawayCharge: false, // OFF by default
  takeawayChargeType: 'RM',    // 'RM' or '%'
  takeawayChargeAmount: 0.50,  // RM 0.50 default

  // Emergency Maintenance Mode Settings (Mod Kecemasan / Selenggaraan)
  emergencyMode: {
    enabled: false,
    message: 'Sistem mengalami gangguan secara tiba-tiba, sila buat pesanan secara manual dengan waiter.'
  }
};

export function OrderProvider({ children }) {
  const { user, tenant } = useAuth();
  
  // Extract tenant ID from URL for customer QR scans (tid or tenant_id)
  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search);
    const urlTid = searchParams.get('tid') || searchParams.get('tenant_id');
    if (urlTid) {
      localStorage.setItem('fb_tenant_id', urlTid);
    }
  }

  const tenantRef = useRef(tenant);
  const userRef = useRef(user);

  useEffect(() => {
    tenantRef.current = tenant;
    userRef.current = user;
    window.__CURRENT_TENANT = tenant;
    if (tenant?.id) {
      localStorage.setItem('fb_tenant_id', tenant.id);
    }
  }, [tenant, user]);

  const [tables, setTables] = useState(INITIAL_TABLES);
  const [sessions, setSessions] = useState({});
  const [orders, setOrders] = useState([]);

  const sessionsRef = useRef(sessions);
  const ordersRef = useRef(orders);
  const receiptSettingsRef = useRef(DEFAULT_RECEIPT_SETTINGS);

  // Re-join socket room whenever tenant changes (e.g. after login completes)
  useEffect(() => {
    const tid = tenant?.id || localStorage.getItem('fb_tenant_id');
    if (tid && socketRef.current && socketRef.current.connected) {
      console.log(`🔄 Tenant changed, re-joining socket room: ${tid}`);
      socketRef.current.emit('JOIN_TENANT', tid);
    }
  }, [tenant?.id]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Customer Feedbacks State — Purely loaded from Cloud Supabase customer_feedbacks table
  const [feedbacks, setFeedbacks] = useState([]);
  const fetchingFeedbacksRef = useRef(false); // Guard: elak panggilan berganda serentak

  // Fungsi tunggal untuk fetch feedbacks dari REST API (Service Role — bypass RLS)
  const fetchFeedbacksFromAPI = useCallback(async (tenantId) => {
    if (fetchingFeedbacksRef.current) return; // Sudah dalam proses fetch
    fetchingFeedbacksRef.current = true;
    const activeTenantId = tenantId || localStorage.getItem('fb_tenant_id');
    const BASE = getBackendBaseUrl();
    try {
      const res = await fetch(`${BASE}/api/feedbacks?tenant_id=${activeTenantId}`);
      const json = await res.json();
      const records = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : null);
      if (records) {
        console.log('💬 [FEEDBACKS] Loaded', records.length, 'record(s) from Supabase Cloud');
        setFeedbacks(records);
      }
    } catch {
      // Fallback: baca terus dari Supabase client jika REST API gagal
      try {
        const { data } = await supabase
          .from('customer_feedbacks')
          .select('*')
          .eq('tenant_id', activeTenantId)
          .order('created_at', { ascending: false });
        if (Array.isArray(data)) setFeedbacks(data);
      } catch {}
    } finally {
      fetchingFeedbacksRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch feedbacks sekali sahaja apabila tenant berubah
  useEffect(() => {
    const tid = tenant?.id || localStorage.getItem('fb_tenant_id');
    fetchFeedbacksFromAPI(tid);
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // FETCH SETTINGS DARI SUPABASE CLOUD (termasuk Telegram) \u2014 override localStorage
  useEffect(() => {
    const tid = tenant?.id || localStorage.getItem('fb_tenant_id');
    if (!tid) return;
    const BASE = getBackendBaseUrl();
    fetch(`${BASE}/api/settings`, {
      headers: { 'x-tenant-id': tid }
    })
      .then(r => r.json())
      .then(json => {
        const s = json?.data || json;
        if (s && typeof s === 'object' && !s.status) {
          // Override receiptSettings dengan data dari Supabase (termasuk Telegram)
          setReceiptSettings(prev => {
            const merged = { ...prev, ...s };
            // Simpan ke localStorage TANPA Telegram credentials
            const { telegramEnabled, telegramBotToken, telegramChatId, ...forStorage } = merged;
            
            return merged;
          });
          console.log('⚙️ [SETTINGS_FROM_SUPABASE] Loaded termasuk Telegram config');
        }
      })
      .catch(() => {}); // Senyap jika gagal — localStorage digunakan sebagai fallback
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // STRICT SUPABASE DATA SCOPING & REALTIME SYNC FOR LOGGED IN RESTAURANTS
  useEffect(() => {
    if (user && tenant && tenant.id) {
      // CLEAR PREVIOUS STATE TO PREVENT TENANT DATA MIXING
      setMenuItems([]);
      setOrders([]);
      setSessions({});
      setFeedbacks([]);

      // 1. Fetch Tenant Menu Items from 'menu_items' table
      supabase
        .from('menu_items')
        .select('*')
        .eq('tenant_id', tenant.id)
        .then(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            if (data.length > 0) {
              // Map Supabase snake_case columns to camelCase used in app
              const mapped = data.map(row => ({
                id: row.id,
                name: row.name,
                category: row.category_name,
                price: Number(row.price),
                description: row.description || '',
                image: row.image_url || '',
                isActive: row.is_active !== false,
                sortOrder: row.sort_order || 0,
                optionGroups: Array.isArray(row.option_groups) ? row.option_groups : []
              }));
              setMenuItems(mapped);
            } else {
              // Brand new tenant — start with empty menu []
              setMenuItems([]);
            }
          } else if (error) {
            console.error('Supabase menu_items fetch error:', error.message);
            setMenuItems([]);
          }
        });

      // 2. Fetch Tenant Settings from 'tenant_settings' table
      supabase
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data) {
            setReceiptSettings(prev => ({
                ...prev,
                headerTitle: data.header_title || prev.headerTitle,
                headerAddress: data.header_address || prev.headerAddress,
                footerMsg: data.receipt_footer || prev.footerMsg,
                logoUrl: data.logo_url || prev.logoUrl,
                welcomeBannerUrl: data.welcome_banner_url || prev.welcomeBannerUrl,
                paperWidth: data.paper_width || prev.paperWidth,
                tableCount: data.table_count || prev.tableCount,
                operationalMode: data.operational_mode || prev.operationalMode,
                staffPin: data.staff_pin || prev.staffPin,
                enableSst: data.enable_sst || prev.enableSst,
                sstRate: data.sst_rate || prev.sstRate,
                enableServiceCharge: data.enable_service_charge || prev.enableServiceCharge,
                serviceChargeRate: data.service_charge_rate || prev.serviceChargeRate,
                enableTakeawayCharge: data.enable_takeaway_charge || prev.enableTakeawayCharge,
                takeawayChargeType: data.takeaway_charge_type || prev.takeawayChargeType,
                takeawayChargeAmount: data.takeaway_charge_amount || prev.takeawayChargeAmount,
                enableCustomCharge: data.enable_custom_charge || prev.enableCustomCharge,
                customChargeName: data.custom_charge_name || prev.customChargeName,
                customChargeType: data.custom_charge_type || prev.customChargeType,
                customChargeAmount: data.custom_charge_amount || prev.customChargeAmount,
                customerMenuTemplate: data.customer_menu_template || prev.customerMenuTemplate,
                kdsSound: data.kds_sound || prev.kdsSound,
                waveMode: data.wave_mode !== false,
                waveCapacity: data.wave_capacity !== undefined ? Number(data.wave_capacity) : 10,
                menuStock: typeof data.menu_stock === 'object' && data.menu_stock !== null ? data.menu_stock : (prev.menuStock || {})
              }));
          }
        });

      // 3. Fetch Tenant Orders from Supabase (Atomic Merge Strategy)
      supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .then(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            setOrders(prev => {
              const map = new Map();
              (prev || []).forEach(o => map.set(o.order_id, o));
              data.forEach(o => map.set(o.order_id, o));
              return Array.from(map.values());
            });
          }
        });

      // 4. Fetch Tenant Sessions from Supabase (Atomic Merge Strategy)
      supabase
        .from('table_sessions')
        .select('*')
        .eq('tenant_id', tenant.id)
        .then(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            setSessions(prev => {
              const merged = { ...prev };
              data.forEach(s => {
                merged[s.session_id] = { ...(prev[s.session_id] || {}), ...s };
              });
              return merged;
            });
          }
        });

      // 5. Fetch Tenant Feedbacks — guna fungsi tunggal fetchFeedbacksFromAPI (tidak berganda)
      fetchFeedbacksFromAPI(tenant.id);

      // 6. SUPABASE REALTIME CHANNELS FOR POS <-> KITCHEN <-> FEEDBACK LIVE SYNC
      const realtimeOrdersChannel = supabase
        .channel(`tenant_orders_${tenant.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenant.id}` },
          () => {
            supabase
              .from('orders')
              .select('*')
              .eq('tenant_id', tenant.id)
              .then(({ data }) => {
                if (data && Array.isArray(data)) {
                  setOrders(prev => {
                    const map = new Map();
                    (prev || []).forEach(o => map.set(o.order_id, o));
                    data.forEach(o => map.set(o.order_id, o));
                    return Array.from(map.values());
                  });
                }
              });
          }
        )
        .subscribe();

      const realtimeSessionsChannel = supabase
        .channel(`tenant_sessions_${tenant.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'table_sessions', filter: `tenant_id=eq.${tenant.id}` },
          () => {
            supabase
              .from('table_sessions')
              .select('*')
              .eq('tenant_id', tenant.id)
              .then(({ data }) => {
                if (data && Array.isArray(data)) {
                  setSessions(prev => {
                    const merged = { ...prev };
                    data.forEach(s => {
                      merged[s.session_id] = { ...(prev[s.session_id] || {}), ...s };
                    });
                    return merged;
                  });
                }
              });
          }
        )
        .subscribe();

      const realtimeFeedbacksChannel = supabase
        .channel(`tenant_feedbacks_${tenant.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customer_feedbacks', filter: `tenant_id=eq.${tenant.id}` },
          () => {
            // Guna fungsi tunggal — guard ref elak berganda
            fetchFeedbacksFromAPI(tenant.id);
          }
        )
        .subscribe();

      const realtimeMenuChannel = supabase
        .channel(`tenant_menu_${tenant.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_items', filter: `tenant_id=eq.${tenant.id}` },
          () => {
            supabase
              .from('menu_items')
              .select('*')
              .eq('tenant_id', tenant.id)
              .then(({ data }) => {
                if (data && Array.isArray(data)) {
                  const mapped = data.map(row => ({
                    id: row.id,
                    name: row.name,
                    category: row.category_name,
                    price: Number(row.price),
                    image: row.image_url,
                    is_active: row.is_active !== false,
                    optionGroups: Array.isArray(row.option_groups) ? row.option_groups : []
                  }));
                  setMenuItems(mapped);
                }
              });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(realtimeOrdersChannel);
        supabase.removeChannel(realtimeSessionsChannel);
        supabase.removeChannel(realtimeFeedbacksChannel);
        supabase.removeChannel(realtimeMenuChannel);
      };
    }
  }, [user, tenant?.id]);

  useEffect(() => {
    try {
      // Removed localStorage cleanup for removed STORAGE_KEYS
    } catch (e) {}
  }, []);

  // Centralized Bluetooth Printer State for POS / Counter
  const [btDevice, setBtDevice] = useState(null);
  const [btConnecting, setBtConnecting] = useState(false);
  const [btStatusMsg, setBtStatusMsg] = useState('');

  // Dedicated Bluetooth Printer State for Kitchen Display System (KDS)
  const [kitchenBtDevice, setKitchenBtDevice] = useState(null);
  const [kitchenBtConnecting, setKitchenBtConnecting] = useState(false);
  const [kitchenBtStatusMsg, setKitchenBtStatusMsg] = useState('');

  // KDS Print Error Tracking State
  const [failedPrintOrderIds, setFailedPrintOrderIds] = useState({});

  const markPrintFailed = useCallback((orderId) => {
    setFailedPrintOrderIds(prev => ({ ...prev, [orderId]: true }));
  }, []);

  const clearPrintFailed = useCallback((orderId) => {
    setFailedPrintOrderIds(prev => {
      const copy = { ...prev };
      delete copy[orderId];
      return copy;
    });
  }, []);

  // Receipt Settings State (paper width, header title, address, footer)
  // Telegram fields TIDAK diambil dari localStorage — mesti dari Supabase Cloud
  const [receiptSettings, setReceiptSettings] = useState(DEFAULT_RECEIPT_SETTINGS);

  // Menu Items State — starts with INITIAL_MENU, loads from server on mount
  const [menuItems, setMenuItems] = useState(INITIAL_MENU);

  // Reset state ke kosong sepenuhnya apabila pengguna log keluar (logout)
  useEffect(() => {
    if (!user) {
      setMenuItems([]);
      setOrders([]);
      setSessions({});
      setFeedbacks([]);
      setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
      // Local storage items already removed via architecture updates
    }
  }, [user]);

  // getBackendBaseUrl di-import dari '../utils/apiConfig'

  // Update menu and save to Supabase 'menu_items' table via backend (Service Role - bypass RLS)
  const updateMenuItems = useCallback(async (newMenu) => {
    setMenuItems(newMenu);

    const activeTenantId = tenantRef.current?.id || tenant?.id || localStorage.getItem('fb_tenant_id') || '';
    const BASE = getBackendBaseUrl();

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';

    try {
      console.log('📡 Syncing menu to Supabase for tenant:', activeTenantId, '| Count:', newMenu.length);
      const res = await fetch(`${BASE}/api/menu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newMenu)
      });
      const result = await res.json();
      console.log('📋 Menu save result:', result?.status, result?.message);
      return result;
    } catch (e) {
      console.error('Failed to save menu to server:', e);
      return { status: 'ERROR', message: 'Gagal sambung ke server.' };
    }
  }, [tenant, getBackendBaseUrl]);

  // Audio Context State for KDS
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const audioCtxRef = useRef(null);

  const channelRef = useRef(null);

  // Removed localStorage sync useEffects for tables, sessions, orders, and receiptSettings

  // Consecutive Bluetooth Failure Ref
  const btConsecutiveFailuresRef = useRef(0);

  // Helper to play MP3 audio files from public directory
  const playAudioFile = useCallback((fileUrl) => {
    try {
      const audio = new Audio(fileUrl);
      audio.play().catch(e => console.warn('Audio play error:', e));
    } catch (e) {
      console.warn('Audio play exception:', e);
    }
  }, []);

  const handleBtConnectSuccess = useCallback(() => {
    btConsecutiveFailuresRef.current = 0;
    playAudioFile('/chrysalyn-clean-double-pop.mp3');
  }, [playAudioFile]);

  const handleBtConnectFailure = useCallback(() => {
    btConsecutiveFailuresRef.current += 1;
    if (btConsecutiveFailuresRef.current >= 3) {
      playAudioFile('/Sambungan Bluetooth gagal.mp3');
      btConsecutiveFailuresRef.current = 0; // Reset counter after playing 3x failure alert
    } else {
      playAudioFile('/windows-error-sound-effect.mp3');
    }
  }, [playAudioFile]);

  // Centralized Bluetooth Connect Handler
  const connectCentralizedBluetooth = useCallback(async () => {
    setBtConnecting(true);
    setBtStatusMsg('Mencari printer Bluetooth...');
    try {
      const conn = await connectBluetoothPrinter();
      setBtDevice(conn);
      setBtStatusMsg(`Terhubung: ${conn.name}`);
      handleBtConnectSuccess();
      return conn;
    } catch (err) {
      handleBtConnectFailure();
      if (err.message === 'WEB_BLUETOOTH_NOT_SUPPORTED') {
        alert('Browser ini tidak menyokong Web Bluetooth. Sila gunakan Chrome atau Edge.');
      } else {
        setBtStatusMsg('Sambungan Bluetooth dibatalkan.');
      }
      console.error(err);
      return null;
    } finally {
      setBtConnecting(false);
    }
  }, [handleBtConnectSuccess, handleBtConnectFailure]);

  const disconnectCentralizedBluetooth = useCallback(() => {
    if (btDevice && btDevice.device && btDevice.device.gatt) {
      try {
        btDevice.device.gatt.disconnect();
      } catch (e) {
        console.log(e);
      }
    }
    setBtDevice(null);
    setBtStatusMsg('Sambungan POS Bluetooth diputuskan.');
  }, [btDevice]);

  // Dedicated Kitchen Bluetooth Connect Handler
  const connectKitchenBluetooth = useCallback(async () => {
    setKitchenBtConnecting(true);
    setKitchenBtStatusMsg('Mencari printer Bluetooth Dapur...');
    try {
      const conn = await connectBluetoothPrinter();
      setKitchenBtDevice(conn);
      setKitchenBtStatusMsg(`Terhubung Dapur: ${conn.name}`);
      handleBtConnectSuccess();
      return conn;
    } catch (err) {
      handleBtConnectFailure();
      if (err.message === 'WEB_BLUETOOTH_NOT_SUPPORTED') {
        alert('Browser ini tidak menyokong Web Bluetooth. Sila gunakan Chrome atau Edge.');
      } else {
        setKitchenBtStatusMsg('Sambungan Bluetooth Dapur dibatalkan.');
      }
      console.error(err);
      return null;
    } finally {
      setKitchenBtConnecting(false);
    }
  }, [handleBtConnectSuccess, handleBtConnectFailure]);

  const disconnectKitchenBluetooth = useCallback(() => {
    if (kitchenBtDevice && kitchenBtDevice.device && kitchenBtDevice.device.gatt) {
      try {
        kitchenBtDevice.device.gatt.disconnect();
      } catch (e) {
        console.log(e);
      }
    }
    setKitchenBtDevice(null);
    setKitchenBtStatusMsg('Sambungan Bluetooth Dapur diputuskan.');
  }, [kitchenBtDevice]);

  useEffect(() => {
    receiptSettingsRef.current = receiptSettings;
  }, [receiptSettings]);

  // Play KDS sound (Default Web Audio BEEP or Custom Selected Sound from /public/sound/)
  const playBeepSound = useCallback(() => {
    try {
      const selectedSound = receiptSettingsRef.current?.kdsSound || 'DEFAULT';

      if (selectedSound !== 'DEFAULT') {
        const soundUrl = selectedSound.startsWith('/') ? selectedSound : `/sound/${selectedSound}`;
        const audio = new Audio(soundUrl);
        audio.play().catch(e => console.warn('Custom KDS audio play blocked/error:', e));
        return;
      }

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0.4, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.65);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }, []);

  const enableAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      setIsAudioEnabled(true);
      playBeepSound();
      return true;
    } catch (e) {
      console.error('Failed to enable audio context:', e);
      return false;
    }
  }, [playBeepSound]);

  const handleRemoteUpdate = useCallback((data) => {
    if (!data || !data.type) return;

    // MULTI-TENANT ISOLATION FOR BROADCASTCHANNEL:
    // Abaikan broadcast inter-tab jika data dari tenant_id lain
    const currentTenantId = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
    if (data.tenant_id && currentTenantId && data.tenant_id !== currentTenantId) {
      console.log('🛡️ BroadcastChannel ignored cross-tenant update:', data.tenant_id, 'vs', currentTenantId);
      return;
    }

    if (data.sessions) setSessions(prev => ({ ...prev, ...data.sessions }));
    if (data.orders) setOrders(prev => {
      const map = new Map();
      (prev || []).forEach(o => map.set(o.order_id, o));
      (data.orders || []).forEach(o => map.set(o.order_id, o));
      return Array.from(map.values());
    });
    if (data.tables && Array.isArray(data.tables) && data.tables.length > 0) {
      setTables(prev => {
        return data.tables.map(st => {
          const activeSession = Object.values(sessionsRef.current || {}).find(s => Number(s.table_number) === Number(st.table_number) && s.status !== 'CLOSED');
          if (activeSession) {
            return {
              ...st,
              status: st.status === 'KOSONG' ? 'ADA_PELANGGAN' : st.status,
              current_session_id: activeSession.session_id
            };
          }
          return st;
        });
      });
    }
    if (data.receiptSettings) setReceiptSettings(prev => ({ ...prev, ...data.receiptSettings }));
  }, []);

  // Keep handleRemoteUpdate in a ref so socket listeners always call latest version
  // without needing to re-register (prevents event handler accumulation)
  const handleRemoteUpdateRef = useRef(handleRemoteUpdate);
  useEffect(() => {
    handleRemoteUpdateRef.current = handleRemoteUpdate;
  }, [handleRemoteUpdate]);

  const socketRef = useRef(null);

  // Real-Time Cross-Device Socket.io Synchronization Engine
  // IMPORTANT: This runs ONCE on mount only (empty deps [])
  // Socket is stored in socketRef and NEVER disconnected on re-render
  // to prevent the connect/disconnect spam loop.
  useEffect(() => {
    const BACKEND_URL = getBackendBaseUrl();

    // Only create socket once — never recreate on re-render
    if (!socketRef.current) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const isCustomerPath = window.location.pathname.includes('customer') || window.location.pathname.includes('/order') || window.location.pathname === '/o' || urlParams.has('session') || urlParams.has('s');

        if (isCustomerPath) {
          const session_id = urlParams.get('session') || urlParams.get('s') || localStorage.getItem('fb_customer_session_id') || 'GUEST';
          const tenant_id = urlParams.get('tid') || localStorage.getItem('fb_tenant_id');
          const token = urlParams.get('token') || localStorage.getItem('fb_customer_token');
          
          if (urlParams.has('session') || urlParams.has('s')) localStorage.setItem('fb_customer_session_id', session_id);
          if (urlParams.has('tid')) localStorage.setItem('fb_tenant_id', tenant_id);
          if (urlParams.has('token')) localStorage.setItem('fb_customer_token', token);

          socketRef.current = io(`${BACKEND_URL}/customer`, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 20,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            auth: { session_id, tenant_id, token }
          });
        } else {
          socketRef.current = io(`${BACKEND_URL}/staff`, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 20,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            auth: (cb) => {
              supabase.auth.getSession().then(({ data: { session } }) => {
                cb({ token: session?.access_token });
              });
            }
          });
        }

        socketRef.current.on('connect', () => {
          console.log(`🔌 Connected to Socket.io Namespace: ${isCustomerPath ? '/customer' : '/staff'}`);
        });

        socketRef.current.on('disconnect', (reason) => {
          console.log('⚠️ Socket disconnected:', reason);
        });

        socketRef.current.on('connect_error', (err) => {
          console.error('❌ Socket connect_error:', err.message, err.data);
        });

        socketRef.current.on('INIT_STATE', (state) => {
          if (state) {
            if (state.tables && state.tables.length > 0) setTables(state.tables);
            // Merge sessions (server is authoritative on INIT, but preserve any local sessions not yet in server)
            if (state.sessions) setSessions(prev => ({ ...prev, ...state.sessions }));
            // Merge incoming orders with local orders (server is authoritative on INIT)
            if (state.orders) setOrders(prev => {
              const map = new Map();
              prev.forEach(o => map.set(o.order_id, o));
              state.orders.forEach(o => map.set(o.order_id, o));
              return Array.from(map.values());
            });
            // feedbacks TIDAK diambil dari Socket state — diuruskan 100% dari Supabase Cloud
            const st = state.receiptSettings || state.settings;
            if (st) {
              setReceiptSettings(st);
            }
          }
        });

        socketRef.current.on('SYSTEM_STATE_UPDATED', (state) => {
          if (state) {
            if (state.tables && state.tables.length > 0) setTables(state.tables);
            // CRITICAL FIX: Merge sessions instead of replacing.
            // A newly created session (in local state) can be wiped if SYSTEM_STATE_UPDATED
            // arrives before the server's SQLite insert completes.
            // Merge strategy: server entries override local for same key (status updates),
            // but local-only sessions (not yet in server) are preserved.
            if (state.sessions) setSessions(prev => ({ ...prev, ...state.sessions }));
            // CRITICAL FIX: Merge orders instead of replacing.
            // Direct replacement causes a race condition where a newly submitted order
            // (added to local state immediately) can disappear if the server's
            // SYSTEM_STATE_UPDATED broadcast arrives before the DB insert completes.
            if (state.orders) setOrders(prev => {
              const map = new Map();
              // Server state is authoritative for status updates (COOKING, READY, etc.)
              // but we preserve any local-only orders not yet in server state
              prev.forEach(o => map.set(o.order_id, o));
              state.orders.forEach(o => map.set(o.order_id, o));
              return Array.from(map.values());
            });
            // feedbacks TIDAK diambil dari Socket state — diuruskan 100% dari Supabase Cloud
            const st = state.receiptSettings || state.settings;
            if (st) {
              setReceiptSettings(prev => ({ ...prev, ...st }));
            }
          }
        });

        // Real-Time Cross-Device Customer Feedback Synchronization Listener
        socketRef.current.on('NEW_FEEDBACK_SUBMITTED', (newFb) => {
          if (!newFb) return;
          console.log('💬 Socket Received NEW_FEEDBACK_SUBMITTED:', newFb);
          setFeedbacks(prev => {
            const exists = prev.some(f => f.feedback_id === newFb.feedback_id || (f.order_id === newFb.order_id && f.order_id !== 'N/A'));
            if (exists) return prev;
            // Tambah rekod baharu di bahagian atas — TANPA simpan ke localStorage
            return [newFb, ...prev];
          });
        });

        socketRef.current.on('SETTINGS_UPDATED', (st) => {
          if (st) {
            console.log('⚡ SETTINGS_UPDATED received:', st);
            setReceiptSettings(prev => ({ ...prev, ...st }));
          }
        });

        socketRef.current.on('EMERGENCY_MODE_TOGGLED', (emergencyData) => {
          console.log('🚨 EMERGENCY_MODE_TOGGLED received:', emergencyData);
          if (emergencyData) {
            setReceiptSettings(prev => ({ ...prev, emergencyMode: emergencyData }));
          }
        });

        socketRef.current.on('NEW_ORDER_RECEIVED', () => {
          // Socket event received
        });

        socketRef.current.on('MENU_UPDATED', (updatedMenu) => {
          if (!userRef.current && Array.isArray(updatedMenu) && updatedMenu.length > 0) {
            setMenuItems(updatedMenu);
          }
        });

        socketRef.current.on('SESSION_HAS_ENDED', (data) => {
          if (data && data.session_id) {
            setSessions(prev => ({
              ...prev,
              [data.session_id]: {
                ...(prev[data.session_id] || {}),
                status: 'CLOSED',
                closed_at: data.closed_at || new Date().toISOString()
              }
            }));
            // Transition PAYMENT_PENDING → PENDING so KDS auto-receives and customer screen updates
            setOrders(prev => prev.map(o => {
              if (o.session_id !== data.session_id) return o;
              const isPaymentPending = o.kitchen_status === 'PAYMENT_PENDING';
              return {
                ...o,
                payment_status: 'PAID',
                kitchen_status: isPaymentPending ? 'PENDING' : o.kitchen_status
              };
            }));
          }
        });

        socketRef.current.on('STOCK_VALIDATION_ERROR', (data) => {
          if (data && data.message) {
            alert(`⚠️ PERHATIAN! ${data.message}`);
          }
        });

        socketRef.current.on('SESSION_HAS_BEEN_CANCELLED', (data) => {
          if (data && data.session_id) {
            setSessions(prev => ({
              ...prev,
              [data.session_id]: {
                ...(prev[data.session_id] || {}),
                status: 'CLOSED',
                is_cancelled: true,
                closed_at: new Date().toISOString()
              }
            }));
            setOrders(prev => prev.map(o => o.session_id === data.session_id ? { ...o, kitchen_status: 'CANCELLED', kitchen_cancel_reason: data.reason || 'Sesi dibatalkan oleh kaunter' } : o));
            setTables(prev => prev.map(t => t.table_number === Number(data.table_number) ? { ...t, status: 'KOSONG', current_session_id: null } : t));
          }
        });

      } catch (e) {
        console.warn('Socket.io client connection error:', e);
      }
    }

    // BroadcastChannel — also created once
    if (!channelRef.current) {
      try {
        channelRef.current = new BroadcastChannel('fb_order_system_channel');
        channelRef.current.onmessage = (event) => {
          handleRemoteUpdateRef.current(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported', e);
      }
    }

    return () => {
      // Cleanup effect if component unmounts
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Emit JOIN_TENANT ke Socket.io apabila tenantId berubah
  useEffect(() => {
    if (tenant?.id && socketRef.current) {
      socketRef.current.emit('JOIN_TENANT', tenant.id);
    }
  }, [tenant?.id]);


  const broadcastState = useCallback((type, updatedTables, updatedSessions, updatedOrders) => {
    const activeTenantId = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
    const payload = {
      type,
      tenant_id: activeTenantId,
      tables: updatedTables,
      sessions: updatedSessions,
      orders: updatedOrders,
      timestamp: Date.now()
    };

    if (channelRef.current) {
      channelRef.current.postMessage(payload);
    }
  }, []);

  const createSession = useCallback((tableNumber) => {
    const activeTenant = window.__CURRENT_TENANT;

    // Check Quota before allowing new sessions
    if (isFreePlan(activeTenant)) {
      const { cycleStart } = getSubscriptionCycleInfo(activeTenant?.created_at);
      const usedCount = getCycleOrdersCount(orders, activeTenant?.id, cycleStart);
      if (usedCount >= FREE_PLAN_LIMIT) {
        return { success: false, error: 'FREE_PLAN_LIMIT_REACHED' };
      }
    }

    return new Promise((resolve, reject) => {
      // Tunggu socket connect jika sedang dalam proses reconnect (maks 6 saat)
      const waitForSocket = (remainingMs, cb) => {
        if (socketRef.current && socketRef.current.connected) {
          cb();
        } else if (remainingMs <= 0) {
          reject(new Error('Sambungan pelayan terputus. Sila muat semula halaman.'));
        } else {
          setTimeout(() => waitForSocket(remainingMs - 200, cb), 200);
        }
      };

      waitForSocket(6000, () => {
        const timeout = setTimeout(() => {
          reject(new Error('Permintaan tamat tempoh (timeout). Sila cuba semula.'));
        }, 8000); // 8 saat

        socketRef.current.emit('CREATE_SESSION', {
          table_number: Number(tableNumber),
          pax_count: 1
        }, (response) => {
          clearTimeout(timeout);
          if (response && response.status === 'ok') {
            resolve(response.session?.session_id || response.session?.id || null);
          } else {
            resolve(null);
          }
        });
      });
    });
  }, [sessions, tables, orders, broadcastState]);

  const submitOrder = useCallback(async (sessionId, tableNumber, cartItems, overallNote = '', orderType = 'DINE_IN', customerName = '') => {
    // Guard 1: Prevent ordering if session is already closed
    const currentSess = sessions[sessionId];
    if (currentSess && currentSess.status === 'CLOSED') {
      alert('Sesi pesanan untuk meja ini telah ditutup atau dibatalkan oleh kaunter.');
      return { success: false, error: 'SESSION_CLOSED' };
    }

    // Guard 1B: Free Plan 100 Orders Quota Enforcement
    const currentTenant = (window.__CURRENT_TENANT || null);
    if (isFreePlan(currentTenant)) {
      const { cycleStart } = getSubscriptionCycleInfo(currentTenant?.created_at);
      const usedCount = getCycleOrdersCount(orders, currentTenant?.id, cycleStart);
      if (usedCount >= FREE_PLAN_LIMIT) {
        return { success: false, error: 'FREE_PLAN_LIMIT_REACHED' };
      }
    }

    const currentStock = receiptSettingsRef.current?.menuStock || {};
    const stockErrors = [];

    // Helper to extract option names from cart item
    const extractOptionNames = (item) => {
      const result = [];
      if (item.selectedOptions && typeof item.selectedOptions === 'object') {
        Object.values(item.selectedOptions).forEach(val => {
          if (Array.isArray(val)) {
            val.forEach(v => { if (v && typeof v === 'string') result.push(v.trim()); });
          } else if (val && typeof val === 'string') {
            result.push(val.trim());
          }
        });
      } else if (item.options && typeof item.options === 'string') {
        item.options.split(',').forEach(o => {
          const trimmed = o.trim();
          if (trimmed) result.push(trimmed);
        });
      }
      return result;
    };

    // Guard 2: Strict Pre-Check Main Item & Option Add-on Stock BEFORE creating order
    (cartItems || []).forEach(item => {
      if (item.cancelled) return;
      const orderedQty = Number(item.quantity) || 1;
      const mainKey = item.id || item.name;

      // 1. Check Main Item Stock
      const mainStock = currentStock[mainKey] || currentStock[item.name];
      if (mainStock) {
        if (mainStock.status === 'OUT_OF_STOCK') {
          stockErrors.push(`"${item.name}" telah HABIS STOK.`);
        } else if (mainStock.stock_qty !== null && mainStock.stock_qty !== undefined) {
          const avail = Number(mainStock.stock_qty) || 0;
          if (avail <= 0) {
            stockErrors.push(`"${item.name}" telah HABIS STOK.`);
          } else if (orderedQty > avail) {
            stockErrors.push(`"${item.name}" melebihi baki stok (Diminta: ${orderedQty}, Baki: ${avail}).`);
          }
        }
      }

      // 2. Check Option / Add-on Stock
      const optNames = extractOptionNames(item);
      optNames.forEach(optName => {
        const optKey1 = `opt::${mainKey}::${optName}`;
        const optKey2 = `opt::${item.name}::${optName}`;
        const optKey3 = `opt::${optName}`;
        const optStock = currentStock[optKey1] || currentStock[optKey2] || currentStock[optKey3];

        if (optStock) {
          if (optStock.status === 'OUT_OF_STOCK') {
            stockErrors.push(`Pilihan add-on "${optName}" telah HABIS STOK.`);
          } else if (optStock.stock_qty !== null && optStock.stock_qty !== undefined) {
            const avail = Number(optStock.stock_qty) || 0;
            if (avail <= 0) {
              stockErrors.push(`Pilihan add-on "${optName}" telah HABIS STOK.`);
            } else if (orderedQty > avail) {
              stockErrors.push(`Pilihan add-on "${optName}" melebihi baki stok (Diminta: ${orderedQty}, Baki: ${avail}).`);
            }
          }
        }
      });
    });

    if (stockErrors.length > 0) {
      alert(`⚠️ PESANAN DITOLAK KERANA MASALAH STOK!\n\n${stockErrors.join('\n')}\n\nSila kemaskini troli anda.`);
      return { success: false, error: 'STOCK_ERROR', details: stockErrors };
    }

    const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${Date.now().toString().slice(-4)}${uniqueSuffix}`;
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Auto-capitalize customer name (e.g. 'haziq' → 'Haziq', 'nur alia' → 'Nur Alia')
    const formattedName = customerName
      ? customerName.trim().replace(/\b\w/g, (c) => c.toUpperCase())
      : '';

    const isPrepayMode = receiptSettingsRef.current?.operationalMode === 'PREPAY';
    const initialKitchenStatus = isPrepayMode ? 'PAYMENT_PENDING' : 'PENDING';
    const activeTenant = tenantRef.current;
    const targetTenantId = activeTenant?.id || currentSess?.tenant_id || window.__CURRENT_TENANT?.id || localStorage.getItem('fb_tenant_id') || null;

    const newOrder = {
      order_id: orderId,
      session_id: sessionId,
      table_number: Number(tableNumber),
      customer_name: formattedName,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      order_type: orderType, // DINE_IN | TAKEAWAY
      items: cartItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        options: item.selectedOptions ? Object.values(item.selectedOptions).flat().join(', ') : '',
        selectedOptions: item.selectedOptions,
        special_note: item.itemNote || ''
      })),
      total_amount: totalAmount,
      kitchen_status: initialKitchenStatus,
      payment_status: 'UNPAID',
      special_notes: overallNote,
      tenant_id: targetTenantId
    };

    return new Promise((resolve) => {
      if (socketRef.current) {
        socketRef.current.emit('SUBMIT_ORDER', {
          session_id: sessionId,
          table_number: Number(tableNumber),
          client_order_draft_id: orderId, // Used for idempotency check on backend
          order_id: orderId, // For fallback
          customer_name: formattedName,
          order_type: orderType,
          items: newOrder.items,
          total_amount: totalAmount,
          special_notes: overallNote,
          tenant_id: targetTenantId
        }, (res) => {
          if (res && res.status === 'ok') {
            resolve({ success: true, order: res.order });
          } else {
            resolve({ success: false, error: res?.error || 'Failed to submit order' });
          }
        });
      } else {
        // Fallback for when socket is disconnected? We must fail since direct DB write is removed.
        resolve({ success: false, error: 'Tiada sambungan internet atau server.' });
      }
    });
  }, [orders, tables, sessions, broadcastState, isAudioEnabled, playBeepSound]);

  const updateKitchenStatus = useCallback((orderId, newStatus) => {
    let targetOrder = null;
    const updatedOrders = orders.map(ord => {
      if (ord.order_id === orderId) {
        targetOrder = { 
          ...ord, 
          kitchen_status: newStatus,
          cooking_started_at: newStatus === 'COOKING' ? (ord.cooking_started_at || Date.now()) : ord.cooking_started_at
        };
        return targetOrder;
      }
      return ord;
    });

    const cookingStartedAt = newStatus === 'COOKING' ? (targetOrder?.cooking_started_at || Date.now()) : targetOrder?.cooking_started_at;

    setOrders(updatedOrders);
    broadcastState('STATUS_UPDATE', tables, sessions, updatedOrders);

    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId) {
      supabase
        .from('orders')
        .update({
          kitchen_status: newStatus,
          cooking_started_at: cookingStartedAt ? new Date(cookingStartedAt).toISOString() : null
        })
        .eq('order_id', orderId)
        .then(({ error }) => {
          if (error) console.error('Supabase update kitchen_status error:', error);
        });
    }

    // FIXED: backend reads 'kitchen_status', and we include cooking_started_at for the 40s delay timer
    if (socketRef.current) {
      const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
      socketRef.current.emit('UPDATE_KITCHEN_STATUS', { 
        order_id: orderId, 
        kitchen_status: newStatus,
        cooking_started_at: cookingStartedAt,
        tenant_id: _tid
      });
    }

    // Auto-Print Kitchen Runner Ticket when order becomes READY if Kitchen Bluetooth Printer is connected
    const activeKitchenPrinter = kitchenBtDevice || btDevice;
    if (newStatus === 'READY' && targetOrder && activeKitchenPrinter) {
      (async () => {
        try {
          await printKitchenRunnerTicketBluetooth(activeKitchenPrinter, {
            tableNumber: targetOrder.table_number,
            orderId: targetOrder.order_id,
            customerName: targetOrder.customer_name || '',
            items: targetOrder.items || [],
            orderType: targetOrder.order_type || 'DINE_IN',
            specialNotes: targetOrder.special_notes || '',
            timestamp: targetOrder.timestamp
          }, receiptSettings);
          clearPrintFailed(targetOrder.order_id);
        } catch (err) {
          console.warn('Auto-print kitchen runner slip error:', err);
          markPrintFailed(targetOrder.order_id);
        }
      })();
    }
  }, [orders, tables, sessions, broadcastState, kitchenBtDevice, btDevice, receiptSettings, clearPrintFailed, markPrintFailed]);

  // ============================================================
  // STATION-ISOLATED ACTION FUNCTIONS
  // ============================================================

  /**
   * Mark a station as "currently cooking/preparing" for an order.
   * Sets food_cooking or bar_cooking flag on the order WITHOUT changing overall kitchen_status.
   * station: 'FOOD' | 'BAR'
   */
  const markStationCooking = useCallback((orderId, station) => {
    let updatedTargetOrder = null;
    const updatedOrders = orders.map(ord => {
      if (ord.order_id === orderId) {
        const updatedItems = (ord.items || []).map(item => {
          const isDrink = isDrinkItem(item, menuItems);
          if (station === 'FOOD' && !isDrink) {
            return { ...item, food_cooking: true };
          }
          if (station === 'BAR' && isDrink) {
            return { ...item, bar_cooking: true };
          }
          return item;
        });

        // Determine if order contains un-cancelled food items
        const hasFoodItems = (ord.items || []).some(item => !item.cancelled && !isDrinkItem(item, menuItems));

        // Mixed order: Only FOOD station triggers overall 'COOKING' status.
        // Drinks-only order (no food): BAR station 'Bancuh' WILL trigger overall 'COOKING' status.
        let newKitchenStatus = ord.kitchen_status;
        if (ord.kitchen_status === 'PENDING') {
          if (station === 'FOOD' || !hasFoodItems) {
            newKitchenStatus = 'COOKING';
          }
        }

        updatedTargetOrder = {
          ...ord,
          items: updatedItems,
          kitchen_status: newKitchenStatus,
          cooking_started_at: newKitchenStatus === 'COOKING' ? (ord.cooking_started_at || Date.now()) : ord.cooking_started_at
        };
        return updatedTargetOrder;
      }
      return ord;
    });
    setOrders(updatedOrders);
    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId && updatedTargetOrder) {
      supabase
        .from('orders')
        .update({
          items: updatedTargetOrder.items,
          kitchen_status: updatedTargetOrder.kitchen_status,
          cooking_started_at: updatedTargetOrder.cooking_started_at ? new Date(updatedTargetOrder.cooking_started_at).toISOString() : null
        })
        .eq('order_id', orderId)
        .then(({ error }) => {
          if (error) console.error('Supabase markStationCooking error:', error);
        });
    }

    if (socketRef.current && updatedTargetOrder) {
      socketRef.current.emit('UPDATE_KITCHEN_STATUS', {
        order_id: orderId,
        kitchen_status: updatedTargetOrder.kitchen_status,
        cooking_started_at: updatedTargetOrder.cooking_started_at,
        items: updatedTargetOrder.items,
        tenant_id: tenantRef.current?.id || localStorage.getItem('fb_tenant_id')
      });
    }
  }, [orders, tables, sessions, menuItems, broadcastState]);

  /**
   * Mark all items for a station as DONE (completed).
   * Sets food_done or bar_done on each matching item.
   * station: 'FOOD' | 'BAR'
   * Does NOT change overall kitchen_status — that is managed by Clear/Serve.
   */
  const markStationItemsDone = useCallback((orderId, station) => {
    let updatedTargetOrder = null;
    const updatedOrders = orders.map(ord => {
      if (ord.order_id === orderId) {
        const updatedItems = (ord.items || []).map(item => {
          if (item.cancelled) return item;
          const isDrink = isDrinkItem(item, menuItems);
          if (station === 'FOOD' && !isDrink) {
            return { ...item, food_done: true, food_cooking: false };
          }
          if (station === 'BAR' && isDrink) {
            return { ...item, bar_done: true, bar_cooking: false };
          }
          return item;
        });
        updatedTargetOrder = { ...ord, items: updatedItems };
        return updatedTargetOrder;
      }
      return ord;
    });
    setOrders(updatedOrders);
    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId && updatedTargetOrder) {
      supabase
        .from('orders')
        .update({ items: updatedTargetOrder.items })
        .eq('order_id', orderId)
        .then(({ error }) => {
          if (error) console.error('Supabase markStationItemsDone error:', error);
        });
    }

    if (socketRef.current) {
      socketRef.current.emit('MARK_STATION_DONE', { 
        order_id: orderId, 
        station,
        items: updatedTargetOrder ? updatedTargetOrder.items : undefined,
        tenant_id: tenantRef.current?.id || localStorage.getItem('fb_tenant_id')
      });
    }
  }, [orders, tables, sessions, broadcastState]);

  // Manual Print Handler for KDS Cards (supports station-filtered printing)
  const manualPrintOrder = useCallback(async (targetOrder, stationFilter = 'ALL') => {
    const activeKitchenPrinter = kitchenBtDevice || btDevice;
    if (!targetOrder || !activeKitchenPrinter) {
      throw new Error('Sila sambungkan Bluetooth / Printer terlebih dahulu.');
    }
    // Filter items based on active station
    const allItems = targetOrder.items || [];
    let printItems = allItems;
    if (stationFilter === 'FOOD') {
      printItems = allItems.filter(i => !isDrinkItem(i, menuItems));
    } else if (stationFilter === 'BAR') {
      printItems = allItems.filter(i => isDrinkItem(i, menuItems));
    }
    if (printItems.length === 0) {
      throw new Error('Tiada item untuk dicetak bagi stesen ini.');
    }
    try {
      await printKitchenRunnerTicketBluetooth(activeKitchenPrinter, {
        tableNumber: targetOrder.table_number,
        orderId: targetOrder.order_id,
        customerName: targetOrder.customer_name || '',
        items: printItems,
        orderType: targetOrder.order_type || 'DINE_IN',
        specialNotes: targetOrder.special_notes || '',
        timestamp: targetOrder.timestamp
      }, receiptSettings, stationFilter, menuItems);
      clearPrintFailed(targetOrder.order_id);
      return true;
    } catch (err) {
      console.warn('Manual print error:', err);
      markPrintFailed(targetOrder.order_id);
      throw err;
    }
  }, [kitchenBtDevice, btDevice, receiptSettings, menuItems, clearPrintFailed, markPrintFailed]);

  const cancelOrderFromKitchen = useCallback((orderId, reason) => {
    const cancelReason = reason || 'Stok bahan mentah menu telah habis';
    let cancelledOrder = null;
    const updatedOrders = orders.map(ord => {
      if (ord.order_id === orderId) {
        cancelledOrder = ord;
        return {
          ...ord,
          kitchen_status: 'CANCELLED',
          kitchen_cancel_reason: cancelReason
        };
      }
      return ord;
    });

    setOrders(updatedOrders);
    broadcastState('STATUS_UPDATE', tables, sessions, updatedOrders);

    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId) {
      supabase
        .from('orders')
        .update({
          kitchen_status: 'CANCELLED',
          kitchen_cancel_reason: cancelReason
        })
        .eq('order_id', orderId)
        .then(({ error }) => {
          if (error) console.error('Supabase cancelOrderFromKitchen error:', error);
        });
    }

    if (socketRef.current) {
      const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
      socketRef.current.emit('UPDATE_KITCHEN_STATUS', { order_id: orderId, kitchen_status: 'CANCELLED', tenant_id: _tid });
      socketRef.current.emit('ORDER_CANCELLED_BY_KITCHEN', { order_id: orderId, reason: cancelReason, tenant_id: _tid });
    }

    // AUTO-SYNC: Mark items in cancelled order as OUT_OF_STOCK in KDS Stock Manager & Customer Menu
    if (cancelledOrder && cancelledOrder.items) {
      const itemsList = typeof cancelledOrder.items === 'string' ? JSON.parse(cancelledOrder.items) : cancelledOrder.items;
      if (Array.isArray(itemsList) && itemsList.length > 0) {
        const currentStock = receiptSettingsRef.current?.menuStock || {};
        const newStock = { ...currentStock };
        itemsList.forEach(item => {
          const key = item.id || item.name;
          if (key) newStock[key] = { status: 'OUT_OF_STOCK', stock_qty: 0 };
          if (item.name) newStock[item.name] = { status: 'OUT_OF_STOCK', stock_qty: 0 };
        });

        const mergedSettings = { ...receiptSettingsRef.current, menuStock: newStock };
        setReceiptSettings(mergedSettings);
        

        if (socketRef.current) {
          const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
          socketRef.current.emit('UPDATE_SETTINGS', { ...mergedSettings, tenant_id: _tid });
        }
        const BASE = getBackendBaseUrl();
        supabase.auth.getSession().then(({ data: { session } }) => {
          const token = session?.access_token || '';
          try {
            fetch(`${BASE}/api/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(mergedSettings)
            });
          } catch(e) {}
        });
      }
    }
  }, [orders, tables, sessions, broadcastState]);

  const cancelOrderItemsFromKitchen = useCallback((orderId, itemIndicesToCancel, reason) => {
    const cancelReason = reason || 'Stok bahan mentah menu telah habis';
    let isFullyCancelled = false;
    let targetOrder = null;

    const updatedOrders = orders.map(ord => {
      if (ord.order_id === orderId) {
        const currentItems = ord.items || [];
        const updatedItems = currentItems.map((item, idx) => {
          if (itemIndicesToCancel.includes(idx)) {
            return {
              ...item,
              cancelled: true,
              cancel_reason: cancelReason,
              food_done: false,
              bar_done: false,
              food_cooking: false,
              bar_cooking: false
            };
          }
          return item;
        });

        const activeItems = updatedItems.filter(i => !i.cancelled);
        isFullyCancelled = activeItems.length === 0;
        const newKitchenStatus = isFullyCancelled ? 'CANCELLED' : ord.kitchen_status;

        targetOrder = {
          ...ord,
          items: updatedItems,
          kitchen_status: newKitchenStatus,
          kitchen_cancel_reason: isFullyCancelled ? cancelReason : ord.kitchen_cancel_reason
        };
        return targetOrder;
      }
      return ord;
    });

    setOrders(updatedOrders);
    broadcastState('STATUS_UPDATE', tables, sessions, updatedOrders);

    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId && targetOrder) {
      supabase
        .from('orders')
        .update({
          items: targetOrder.items,
          kitchen_status: targetOrder.kitchen_status,
          kitchen_cancel_reason: targetOrder.kitchen_cancel_reason
        })
        .eq('order_id', orderId)
        .then(({ error }) => {
          if (error) console.error('Supabase cancelOrderItemsFromKitchen error:', error);
        });
    }

    if (socketRef.current && targetOrder) {
      const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
      if (isFullyCancelled) {
        socketRef.current.emit('UPDATE_KITCHEN_STATUS', { order_id: orderId, kitchen_status: 'CANCELLED', items: targetOrder.items, tenant_id: _tid });
        socketRef.current.emit('ORDER_CANCELLED_BY_KITCHEN', {
          order_id: orderId,
          reason: cancelReason,
          is_full_cancel: true,
          items: targetOrder.items,
          tenant_id: _tid
        });
      } else {
        socketRef.current.emit('UPDATE_KITCHEN_STATUS', {
          order_id: orderId,
          kitchen_status: targetOrder.kitchen_status,
          items: targetOrder.items,
          tenant_id: _tid
        });
        socketRef.current.emit('ORDER_CANCELLED_BY_KITCHEN', {
          order_id: orderId,
          reason: `Item dibatalkan: ${cancelReason}`,
          is_full_cancel: false,
          items: targetOrder.items,
          tenant_id: _tid
        });
      }
    }

    // AUTO-SYNC: Mark cancelled items as OUT_OF_STOCK in KDS Stock Manager & Customer Menu
    if (targetOrder && Array.isArray(targetOrder.items)) {
      const currentStock = receiptSettingsRef.current?.menuStock || {};
      const newStock = { ...currentStock };
      let updatedAny = false;

      targetOrder.items.forEach((item, idx) => {
        if (itemIndicesToCancel.includes(idx)) {
          const key = item.id || item.name;
          if (key) newStock[key] = { status: 'OUT_OF_STOCK', stock_qty: 0 };
          if (item.name) newStock[item.name] = { status: 'OUT_OF_STOCK', stock_qty: 0 };
          updatedAny = true;
        }
      });

      if (updatedAny) {
        const mergedSettings = { ...receiptSettingsRef.current, menuStock: newStock };
        setReceiptSettings(mergedSettings);

        if (socketRef.current) {
          const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
          socketRef.current.emit('UPDATE_SETTINGS', { ...mergedSettings, tenant_id: _tid });
        }
        const BASE = getBackendBaseUrl();
        supabase.auth.getSession().then(({ data: { session } }) => {
          const token = session?.access_token || '';
          try {
            fetch(`${BASE}/api/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(mergedSettings)
            });
          } catch(e) {}
        });
      }
    }
  }, [orders, tables, sessions, broadcastState]);

  const completePayment = useCallback((sessionId, tableNumber) => {
    return new Promise((resolve, reject) => {
      let client_reported_total = 0;
      orders.forEach(ord => {
        if (ord.session_id === sessionId && ord.kitchen_status !== 'CANCELLED') {
          client_reported_total += Number(ord.total_amount) || 0;
        }
      });

      if (socketRef.current) {
        socketRef.current.emit('COMPLETE_PAYMENT', {
          session_id: sessionId,
          table_number: Number(tableNumber),
          client_reported_total: client_reported_total
        }, (res) => {
          if (res && res.status === 'ok') {
            resolve(true);
          } else {
            console.error('Payment rejected by server:', res?.error);
            reject(new Error(res?.error || 'Payment failed validation'));
          }
        });
      } else {
        reject(new Error('No socket connection'));
      }
    });
  }, [sessions, orders, tables, broadcastState]);

  const cancelSession = useCallback((sessionId, tableNumber, reason = 'Sesi dibatalkan oleh kaunter') => {
    const updatedSessions = {
      ...sessions,
      [sessionId]: {
        ...(sessions[sessionId] || { session_id: sessionId, table_number: Number(tableNumber) }),
        status: 'CLOSED',
        is_cancelled: true,
        closed_at: new Date().toISOString()
      }
    };

    const updatedOrders = orders.map(ord => {
      if (ord.session_id === sessionId) {
        return {
          ...ord,
          kitchen_status: 'CANCELLED',
          kitchen_cancel_reason: reason
        };
      }
      return ord;
    });

    const updatedTables = tables.map(t => {
      if (t.table_number === Number(tableNumber)) {
        return { ...t, status: 'KOSONG', current_session_id: null };
      }
      return t;
    });

    setSessions(updatedSessions);
    setOrders(updatedOrders);
    setTables(updatedTables);
    broadcastState('CLOSE_SESSION', updatedTables, updatedSessions, updatedOrders);

    const activeTenant = tenantRef.current;
    const tenantId = activeTenant?.id || localStorage.getItem('fb_tenant_id');
    if (tenantId) {
      supabase
        .from('sessions')
        .update({ status: 'CLOSED', is_cancelled: true, cancel_reason: reason || 'Sesi dibatalkan oleh kaunter', closed_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .then(({ error }) => {
          if (error) console.error('Supabase cancelSession error:', error);
        });

      supabase
        .from('tables')
        .update({ status: 'KOSONG', current_session_id: null, updated_at: new Date().toISOString() })
        .eq('current_session_id', sessionId)
        .then(({ error }) => {
          if (error) console.error('Supabase update table status error:', error);
        });

      supabase
        .from('orders')
        .update({ kitchen_status: 'CANCELLED', kitchen_cancel_reason: reason })
        .eq('session_id', sessionId)
        .then(({ error }) => {
          if (error) console.error('Supabase cancelSession orders error:', error);
        });
    }

    // Emit Socket Event for real-time cross-device session cancellation sync
    if (socketRef.current) {
      socketRef.current.emit('CANCEL_SESSION', { 
        session_id: sessionId, 
        table_number: Number(tableNumber),
        reason,
        tenant_id: tenantRef.current?.id || localStorage.getItem('fb_tenant_id')
      });
    }
  }, [sessions, tables, orders, broadcastState]);

  const resetDemoData = useCallback(async () => {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('fb_customer_name_')) {
        sessionStorage.removeItem(key);
      }
    });

    // 2. Reset React State
    setTables(INITIAL_TABLES);
    setSessions({});
    setOrders([]);

    // 3. Reset Backend SQLite Database if active
    try {
      const BASE = getBackendBaseUrl();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      await fetch(`${BASE}/api/reset`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.warn('Backend reset call bypassed (server offline or local mode)');
    }

    // 4. Broadcast RESET state to all active browser tabs
    broadcastState('RESET', INITIAL_TABLES, {}, []);
  }, [broadcastState]);

  const clearSingleTable = useCallback((tableNumber) => {
    const tableNum = Number(tableNumber);
    
    // Find the session on this table before clearing it
    const tableToClear = tables.find(t => t.table_number === tableNum);
    
    // 1. If table has an active session, officially cancel it to clean up orphaned orders
    if (tableToClear && tableToClear.current_session_id) {
      cancelSession(tableToClear.current_session_id, tableNum, 'Meja dikosongkan secara paksa');
      return; // cancelSession handles all the status updates and broadcasts internally
    }

    // 2. Otherwise, just force reset the table state (no active session was attached)
    const updatedTables = tables.map(t => {
      if (t.table_number === tableNum) {
        return { ...t, status: 'KOSONG', current_session_id: null };
      }
      return t;
    });

    setTables(updatedTables);
    broadcastState('TABLE_CLEAR', updatedTables, sessions, orders);
  }, [tables, sessions, orders, cancelSession, broadcastState]);

  const seedSampleDemo = useCallback(() => {
    const tableNo = 5;
    const sessionId = `SES-59823`;

    const sampleSession = {
      session_id: sessionId,
      table_number: tableNo,
      created_at: new Date(Date.now() - 15 * 60000).toISOString(),
      status: 'ACTIVE'
    };

    const sampleOrder1 = {
      order_id: 'ORD-1001',
      session_id: sessionId,
      table_number: tableNo,
      timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
      items: [
        {
          id: 'M1',
          name: 'Nasi Ayam Hainan Steam',
          price: 12.90,
          quantity: 2,
          options: 'Bahagian Paha (Thigh)',
          special_note: 'Kuah lebih halia'
        },
        {
          id: 'M7',
          name: 'Teh Tarik Kaw / Teh Ais',
          price: 3.50,
          quantity: 2,
          options: 'Ais (Teh Ais), Kurang Manis',
          special_note: ''
        }
      ],
      total_amount: 32.80,
      kitchen_status: 'COOKING',
      payment_status: 'UNPAID',
      special_notes: 'Sila hantar air dahulu.'
    };

    const sampleOrder2 = {
      order_id: 'ORD-1002',
      session_id: sessionId,
      table_number: tableNo,
      timestamp: new Date(Date.now() - 4 * 60000).toISOString(),
      items: [
        {
          id: 'M6',
          name: 'Keropok Lekor Terengganu (6 Pcs)',
          price: 6.90,
          quantity: 1,
          options: '',
          special_note: 'Goreng garing'
        }
      ],
      total_amount: 6.90,
      kitchen_status: 'PENDING',
      payment_status: 'UNPAID',
      special_notes: ''
    };

    const updatedSessions = { [sessionId]: sampleSession };
    const updatedOrders = [sampleOrder2, sampleOrder1];
    const updatedTables = INITIAL_TABLES.map(t => {
      if (t.table_number === tableNo) {
        return { ...t, status: 'SEDANG_MAKAN', current_session_id: sessionId };
      }
      return t;
    });

    setTables(updatedTables);
    setSessions(updatedSessions);
    setOrders(updatedOrders);
    broadcastState('SEED_DEMO', updatedTables, updatedSessions, updatedOrders);
  }, [broadcastState]);

  const submitCustomerFeedback = useCallback(async (feedbackData) => {
    const { order_id, table_number, customer_name, rating, commented_items, comment, tenant_id } = feedbackData || {};
    const activeTenant = tenantRef.current;
    const targetTenantId = tenant_id || activeTenant?.id || localStorage.getItem('fb_tenant_id');

    const newFb = {
      tenant_id: targetTenantId,
      feedback_id: `FB-${Date.now()}`,
      order_id: order_id || 'N/A',
      table_number: table_number ? Number(table_number) : null,
      customer_name: customer_name || 'Pelanggan',
      rating: rating || 'GOOD',
      commented_items: Array.isArray(commented_items) ? commented_items : [],
      comment: comment || '',
      created_at: new Date().toISOString()
    };

    // 1. Direct Supabase Client Upsert
    try {
      supabase.from('customer_feedbacks').upsert(newFb, { onConflict: 'feedback_id' }).then(({ error }) => {
        if (error) console.error('Supabase customer_feedbacks upsert error:', error.message);
        else console.log('✅ Supabase customer_feedbacks upserted directly!');
      });
    } catch (e) {}

    // 2. Also send to REST API /api/feedback
    const BACKEND_URL = getBackendBaseUrl();
    const targetEndpointUrl = `${BACKEND_URL}/api/feedback`;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';

    try {
      await fetch(targetEndpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newFb)
      });
    } catch (netErr) {
      console.warn('Backend REST API call fallback:', netErr.message);
    }

    // 3. Update React state immediately
    setFeedbacks(prev => {
      const exists = prev.some(f => f.feedback_id === newFb.feedback_id);
      if (exists) return prev;
      return [newFb, ...prev];
    });

    return { status: 'OK', data: newFb };
  }, []);

  return (
    <OrderContext.Provider value={{
      tables,
      sessions,
      orders,
      feedbacks,
      submitCustomerFeedback,
      menuItems,
      updateMenuItems,
      menuStock: receiptSettings?.menuStock || {},
      updateMenuStock: async (newStockMap) => {
        const merged = { ...receiptSettings, menuStock: newStockMap };
        setReceiptSettings(merged);
        if (socketRef.current) {
          const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
          socketRef.current.emit('UPDATE_SETTINGS', { ...merged, tenant_id: _tid });
        }
        const BASE = getBackendBaseUrl();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        try {
          await fetch(`${BASE}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(merged)
          });
        } catch(e) {
          console.warn('Failed to post stock update to API:', e);
        }
      },
      isAudioEnabled,
      enableAudio,
      playBeepSound,
      btDevice,
      btConnecting,
      btStatusMsg,
      connectCentralizedBluetooth,
      disconnectCentralizedBluetooth,
      kitchenBtDevice,
      kitchenBtConnecting,
      kitchenBtStatusMsg,
      connectKitchenBluetooth,
      disconnectKitchenBluetooth,
      createSession,
      submitOrder,
      updateKitchenStatus,
      cancelOrderFromKitchen,
      cancelOrderItemsFromKitchen,
      completePayment,
      cancelSession,
      clearSingleTable,
      receiptSettings,
      operationalMode: receiptSettings?.operationalMode || 'POSTPAY',
      updateReceiptSettings: async (newSettings) => {
        const merged = { ...receiptSettings, ...newSettings };
        setReceiptSettings(merged);

        // Dynamically adjust tables grid count if tableCount was updated
        if (newSettings.tableCount && Number(newSettings.tableCount) !== tables.length) {
          const targetCount = Number(newSettings.tableCount);
          let updatedTables = [...tables];
          if (targetCount > tables.length) {
            const extra = Array.from({ length: targetCount - tables.length }, (_, i) => ({
              table_number: tables.length + i + 1,
              status: 'KOSONG',
              current_session_id: null
            }));
            updatedTables = [...tables, ...extra];
          } else {
            updatedTables = tables.slice(0, targetCount);
          }
          setTables(updatedTables);
          broadcastState('TABLES_RESIZED', updatedTables, sessions, orders);
        }

        // Emit UPDATE_SETTINGS via Socket.io for real-time multi-device sync
        if (socketRef.current) {
          const _tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
          socketRef.current.emit('UPDATE_SETTINGS', { ...merged, tenant_id: _tid });
        }

        // Send to backend REST API — Express backend will save locally & sync to Supabase Cloud tenant_settings
        const tenantId = tenantRef.current?.id || tenant?.id || localStorage.getItem('fb_tenant_id') || '';
        const BASE = getBackendBaseUrl();

        try {
          const res = await fetch(`${BASE}/api/settings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': tenantId
            },
            body: JSON.stringify({ ...merged, tenant_id: tenantId })
          });
          const data = await res.json();
          console.log('⚡ [SETTINGS_SAVED]', data?.message || 'OK');
        } catch (e) {
          console.warn('⚠️ Server offline, saved locally to browser localStorage:', e.message);
        }
      },
      failedPrintOrderIds: failedPrintOrderIds || {},
      markPrintFailed,
      clearPrintFailed,
      manualPrintOrder,
      markStationCooking,
      markStationItemsDone,
      playAudioFile,
      handleBtConnectSuccess,
      handleBtConnectFailure,
      resetDemoData,
      seedSampleDemo
    }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
}
