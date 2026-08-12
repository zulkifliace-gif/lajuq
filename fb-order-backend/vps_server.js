require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ============================================================
// GLOBAL CRASH GUARDS — Server must NEVER crash from unhandled errors
// Log the error and keep the server running.
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('\n❌❌❌ UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  // Untuk uncaughtException, proses berada dalam keadaan tak menentu. Restart terkawal via PM2/systemd
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n⚠️⚠️⚠️ UNHANDLED PROMISE REJECTION:', reason);
  // Log sahaja. JANGAN process.exit() secara membuta, elak tumbangkan semua tenant
});

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wpykjqedncfwqvcaqrni.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper: Dapatkan tenant_id aktif
const DEFAULT_TENANT_ID = null;
function getActiveTenantId(payload, socket) {
  return payload?.tenant_id || socket?.handshake?.headers?.['x-tenant-id'] || null;
}

// Helper: Sanitize text inputs against XSS
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;').trim();
}

// Helper: Dapatkan keseluruhan system state dari Supabase (gantikan getSystemState SQLite)
async function getSupabaseSystemState(tenantId) {
  const tid = tenantId || DEFAULT_TENANT_ID;
  const [tablesRes, sessionsRes, ordersRes, settingsRes, menuItemsRes] = await Promise.all([
    supabaseAdmin.from('tables').select('*').eq('tenant_id', tid).order('table_number'),
    supabaseAdmin.from('sessions').select('*').eq('tenant_id', tid).eq('status','ACTIVE').order('created_at', { ascending: false }),
    supabaseAdmin.from('orders').select('*').eq('tenant_id', tid).neq('payment_status','PAID').order('created_at'),
    supabaseAdmin.from('tenant_settings').select('*').eq('tenant_id', tid).maybeSingle(),
    supabaseAdmin.from('menu_items').select('*').eq('tenant_id', tid).order('sort_order', { ascending: true })
  ]);
  const dbTables = tablesRes.data || [];
  const sessionsArr = sessionsRes.data || [];
  const orders = (ordersRes.data || []).map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }));
  const s = settingsRes.data || {};
  const tableCount = s.table_count ? Number(s.table_count) : 20;

  const menuItems = (menuItemsRes.data || []).map(row => ({
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

  // Bina senarai penuh meja dari 1 hingga tableCount supaya grid meja sentiasa lengkap
  const tablesMap = new Map();
  dbTables.forEach(t => tablesMap.set(Number(t.table_number), t));

  const tables = [];
  for (let i = 1; i <= tableCount; i++) {
    if (tablesMap.has(i)) {
      tables.push(tablesMap.get(i));
    } else {
      tables.push({
        table_number: i,
        status: 'KOSONG',
        current_session_id: null
      });
    }
  }

  const receiptSettings = {
    headerTitle: s.header_title || 'RESTORAN KAMI',
    headerAddress: s.header_address || '',
    receiptHeader: s.receipt_header || 'Selamat Datang!',
    footerMsg: s.receipt_footer || 'Terima Kasih Atas Kunjungan Anda!',
    logoUrl: s.logo_url || null,
    welcomeBannerUrl: s.welcome_banner_url || null,
    staffPin: s.staff_pin || '1234',
    paperWidth: s.paper_width || '58mm',
    tableCount: tableCount,
    operationalMode: s.operational_mode || 'POSTPAY',
    enableSst: Boolean(s.enable_sst),
    sstRate: Number(s.sst_rate || 0),
    enableServiceCharge: Boolean(s.enable_service_charge),
    serviceChargeRate: Number(s.service_charge_rate || 0),
    enableTakeawayCharge: Boolean(s.enable_takeaway_charge),
    takeawayChargeType: s.takeaway_charge_type || 'RM',
    takeawayChargeAmount: Number(s.takeaway_charge_amount || 0),
    enableCustomCharge: Boolean(s.enable_custom_charge),
    customChargeName: s.custom_charge_name || 'Cas Tambahan',
    customChargeType: s.custom_charge_type || 'RM',
    customChargeAmount: Number(s.custom_charge_amount || 0),
    customerMenuTemplate: s.customer_menu_template || 'modern',
    customerMenuViewMode: s.customer_menu_view_mode || 'grid',
    kdsSound: s.kds_sound || 'DEFAULT',
    waveMode: s.wave_mode !== false,
    waveCapacity: Number(s.wave_capacity || 10),
    menuStock: s.menu_stock || {},
    telegramEnabled: Boolean(s.telegram_enabled),
    telegramBotToken: s.telegram_bot_token || '',
    telegramChatId: s.telegram_chat_id || '',
    emergencyMode: s.emergency_mode || { enabled: false }
  };
  // Convert sessions array to map keyed by session_id
  const sessions = {};
  sessionsArr.forEach(sess => { sessions[sess.session_id] = sess; });
  return { tables, sessions, orders, menuItems, feedbacks: [], receiptSettings, settings: receiptSettings };
}

// Helper: Dapatkan settings dari Supabase
async function getSupabaseSettings(tenantId) {
  const tid = tenantId || DEFAULT_TENANT_ID;
  const { data: s } = await supabaseAdmin.from('tenant_settings').select('*').eq('tenant_id', tid).maybeSingle();
  if (!s) return { operationalMode: 'POSTPAY', waveMode: true, waveCapacity: 10 };
  return {
    headerTitle: s.header_title || 'RESTORAN KAMI',
    headerAddress: s.header_address || '',
    receiptHeader: s.receipt_header || 'Selamat Datang!',
    footerMsg: s.receipt_footer || 'Terima Kasih Atas Kunjungan Anda!',
    logoUrl: s.logo_url || null,
    welcomeBannerUrl: s.welcome_banner_url || null,
    paperWidth: s.paper_width || '58mm',
    tableCount: s.table_count !== undefined ? s.table_count : 20,
    operationalMode: s.operational_mode || 'POSTPAY',
    staffPin: s.staff_pin || '1234',
    enableSst: Boolean(s.enable_sst),
    sstRate: s.sst_rate !== undefined ? Number(s.sst_rate) : 6.00,
    enableServiceCharge: Boolean(s.enable_service_charge),
    serviceChargeRate: s.service_charge_rate !== undefined ? Number(s.service_charge_rate) : 10.00,
    enableTakeawayCharge: Boolean(s.enable_takeaway_charge),
    takeawayChargeType: s.takeaway_charge_type || 'RM',
    takeawayChargeAmount: s.takeaway_charge_amount !== undefined ? Number(s.takeaway_charge_amount) : 0.50,
    enableCustomCharge: Boolean(s.enable_custom_charge),
    customChargeName: s.custom_charge_name || 'Cas Tambahan',
    customChargeType: s.custom_charge_type || 'RM',
    customChargeAmount: s.custom_charge_amount !== undefined ? Number(s.custom_charge_amount) : 0.00,
    customerMenuTemplate: s.customer_menu_template || 'modern',
    customerMenuViewMode: s.customer_menu_view_mode || 'grid',
    kdsSound: s.kds_sound || 'DEFAULT',
    waveMode: s.wave_mode !== false,
    waveCapacity: Number(s.wave_capacity || 10),
    menuStock: s.menu_stock || {},
    telegramEnabled: Boolean(s.telegram_enabled),
    telegramBotToken: s.telegram_bot_token || '',
    telegramChatId: s.telegram_chat_id || '',
    emergencyMode: s.emergency_mode || { enabled: false }
  };
}

// ============================================================
// EXPRESS MIDDLEWARES
// ============================================================

// Middleware untuk memastikan API endpoint dipanggil oleh staf yang disahkan
const requireStaffToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'ERROR', message: 'Token pengesahan tiada.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !userData?.user) {
      return res.status(401).json({ status: 'ERROR', message: 'Token tidak sah.' });
    }

    // Ambil profil staf untuk dapatkan tenant_id sebenar
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('tenant_id, role')
      .eq('id', userData.user.id)
      .single();

    if (staffErr || !staff) {
      return res.status(403).json({ status: 'ERROR', message: 'Akses ditolak: Anda bukan staf yang sah.' });
    }

    req.user = { id: userData.user.id, ...staff };
    // MESTI pakai tenant_id dari server (token), bukan dari header client yang boleh dipalsukan!
    req.tenantId = staff.tenant_id;
    next();
  } catch (err) {
    console.error('[requireStaffToken] Error:', err);
    res.status(500).json({ status: 'ERROR', message: 'Ralat pelayan semasa pengesahan.' });
  }
};


// ============================================================
// MENU DATA PATH (Persistent JSON storage on VPS/PC)
// ============================================================
const MENU_DATA_PATH = path.join(__dirname, 'data', 'menu.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'menu-images');
const BANNER_UPLOAD_DIR = path.join(__dirname, 'uploads', 'banners');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(BANNER_UPLOAD_DIR)) fs.mkdirSync(BANNER_UPLOAD_DIR, { recursive: true });

// Helper: Read menu from JSON file
function readMenuData() {
  try {
    if (fs.existsSync(MENU_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(MENU_DATA_PATH, 'utf8'));
    }
  } catch (e) { console.error('Error reading menu.json:', e); }
  return [];
}

// Helper: Write menu to JSON file
function writeMenuData(menuArray) {
  fs.writeFileSync(MENU_DATA_PATH, JSON.stringify(menuArray, null, 2), 'utf8');
}

// Multer Config: save uploaded images to uploads/menu-images/
const menuImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Gunakan req.tenantId yang telah disahkan oleh requireStaffToken middleware
    const tenantId = req.tenantId || 'default';
    const sanitizeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const safeName = `menu-${sanitizeTenant}-${Date.now()}-${Math.floor(Math.random()*10000)}${ext}`;
    cb(null, safeName);
  }
});
const uploadMenuImage = multer({
  storage: menuImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Format fail tidak disokong. Sila guna JPG, PNG, atau WEBP.'));
    }
  }
});

const app = express();
const server = http.createServer(app);

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security HTTP headers
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts & dynamic assets
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // Benarkan Vercel load gambar dari VPS
}));

// Rate Limiter for API endpoints (DDoS & Brute-force protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 mins per IP
  message: { error: 'Terlalu banyak permintaan dari IP anda. Sila cuba sebentar lagi.' }
});

// Enable CORS for Express REST API & Socket.io
app.use(cors({ origin: '*' }));
app.use('/api/', apiLimiter);

// Stripe Webhook requires raw body parsing before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount Stripe & Supabase SaaS Routes
app.use('/api/stripe', require('./stripeRoutes'));

// ============================================================
// SERVE STATIC FRONTEND BUILD (dist/) FROM BACKEND PORT
// This enables single-port architecture:
// - Local Dev:  Frontend Vite :3000, Backend :5000 (both work)
// - ngrok/VPS:  ONLY tunnel port 5000 — serves everything!
//   Run: ngrok http 5000
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log('📦 Serving built frontend from dist/ folder');
} else {
  console.warn('⚠️  No dist/ folder found. Run "npm run build" first for production mode.');
}

// Serve uploaded images as static files with CORS headers (boleh diakses dari mana-mana peranti)
// Access via: /uploads/menu-images/filename.jpg  or  /uploads/banners/filename.jpg
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 1 hari
  next();
}, express.static(path.join(__dirname, 'uploads')));

const io = new Server(server, {
  maxHttpBufferSize: 5e7,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const staffNamespace = io.of('/staff');
const customerNamespace = io.of('/customer');


const PORT = process.env.PORT || 5000;

const tenantLastOrderMap = new Map();

// REST API Endpoints
app.get('/api/health', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || DEFAULT_TENANT_ID;
    const settings = await getSupabaseSettings(tenantId);
    const memUsage = process.memoryUsage();

    res.json({
      status: 'OK',
      message: 'F&B Order Backend Server is Running! (Supabase Cloud)',
      timestamp: new Date().toISOString(),
      database: 'SUPABASE_CLOUD',
      operationalMode: settings.operationalMode || 'POSTPAY',
      emergencyMode: settings.emergencyMode?.enabled || false,
      processUptimeSeconds: Math.floor(process.uptime()),
      heapMemoryUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      rssMemoryUsedMb: Math.round(memUsage.rss / 1024 / 1024),
      pm2ProcessId: process.env.pm_id || 'STANDALONE'
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message, database: 'ERROR' });
  }
});

// DEDICATED SUPABASE LIGHTWEIGHT DB PING ENDPOINT
app.get('/api/db/ping', async (req, res) => {
  const startTime = Date.now();
  try {
    // Simulation hook for testing DB unreachable state via query param ?simulate=error
    if (req.query.simulate === 'error' || req.query.simulate === 'down') {
      return res.status(500).json({
        status: 'ERROR',
        isDbReachable: false,
        latencyMs: 42,
        error: 'Simulated DB Unreachable Error (Ujian Simulasi DB Down)',
        timestamp: new Date().toISOString()
      });
    }

    // Ultra-lightweight HEAD count query (0 byte payload)
    const { error } = await supabaseAdmin
      .from('tenants')
      .select('count', { count: 'exact', head: true });

    const latencyMs = Date.now() - startTime;
    if (error) {
      return res.status(500).json({
        status: 'ERROR',
        isDbReachable: false,
        latencyMs,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      status: 'OK',
      isDbReachable: true,
      latencyMs,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      isDbReachable: false,
      latencyMs: Date.now() - startTime,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DIAGNOSTICS & HEALTH CHECK ENGINE (KHUSUS UNTUK KDS & TOKEN MONITORING)
app.get('/api/health/detailed', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || DEFAULT_TENANT_ID;
    
    // 1. KDS Staff Sockets
    const staffSockets = await staffNamespace.in(tenantId).fetchSockets();
    const now = Date.now();
    
    const kdsDevices = staffSockets.map(s => {
      const lastPong = s.data.lastPong || s.handshake.issued || now;
      const isZombie = (now - lastPong) > 45000; // Tiada respon > 45s
      return {
        socketId: s.id,
        connectedAt: new Date(s.handshake.issued || now).toISOString(),
        lastLatencyMs: s.data.lastLatency || 12,
        isZombie: isZombie,
        status: isZombie ? 'ZOMBIE' : 'HEALTHY'
      };
    });

    // 2. Customer Sockets
    const customerSockets = await customerNamespace.in(tenantId).fetchSockets();

    // 3. Last Order Timestamp
    const lastOrderTime = tenantLastOrderMap.get(tenantId) || null;

    res.json({
      status: 'OK',
      tenantId: tenantId,
      timestamp: new Date().toISOString(),
      staffKdsCount: staffSockets.length,
      customerCount: customerSockets.length,
      kdsDevices: kdsDevices,
      lastOrderProcessedAt: lastOrderTime ? new Date(lastOrderTime).toISOString() : null,
      systemHealth: staffSockets.length === 0 ? 'WARNING_NO_KDS' : kdsDevices.some(d => d.isZombie) ? 'WARNING_ZOMBIE' : 'EXCELLENT'
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || DEFAULT_TENANT_ID;
    const state = await getSupabaseSystemState(tenantId);
    res.json({ status: 'OK', data: state });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

app.post('/api/reset', requireStaffToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    // Padam semua sesi aktif, pesanan belum bayar, dan reset meja ke KOSONG
    await Promise.all([
      supabaseAdmin.from('sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('status','ACTIVE'),
      supabaseAdmin.from('orders').delete().eq('tenant_id', tenantId).neq('payment_status','PAID'),
      supabaseAdmin.from('tables').update({ status: 'KOSONG', current_session_id: null }).eq('tenant_id', tenantId)
    ]);
    const state = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', state); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', state);
    res.json({ status: 'OK', message: 'All system data reset successfully (Supabase)', data: state });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// GET /api/settings — Get receipt & system settings (Cloud Supabase primary if tenant_id provided)
app.get('/api/settings', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    if (tenantId) {
      const { data, error } = await supabaseAdmin
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!error && data) {
        const mappedSettings = {
          headerTitle: data.header_title || 'RESTORAN KAMI',
          headerAddress: data.header_address || '',
          receiptHeader: data.receipt_header || 'Selamat Datang!',
          footerMsg: data.receipt_footer || 'Terima Kasih Atas Kunjungan Anda!',
          logoUrl: data.logo_url || null,
          welcomeBannerUrl: data.welcome_banner_url || null,
          paperWidth: data.paper_width || '58mm',
          tableCount: data.table_count !== undefined ? data.table_count : 20,
          operationalMode: data.operational_mode || 'POSTPAY',
          staffPin: data.staff_pin || '1234',
          enableSst: Boolean(data.enable_sst),
          sstRate: data.sst_rate !== undefined ? Number(data.sst_rate) : 6.00,
          enableServiceCharge: Boolean(data.enable_service_charge),
          service_charge_rate: data.service_charge_rate !== undefined ? Number(data.service_charge_rate) : 10.00,
          enableTakeawayCharge: Boolean(data.enable_takeaway_charge),
          takeawayChargeType: data.takeaway_charge_type || 'RM',
          takeawayChargeAmount: data.takeaway_charge_amount !== undefined ? Number(data.takeaway_charge_amount) : 0.50,
          enableCustomCharge: Boolean(data.enable_custom_charge),
          customChargeName: data.custom_charge_name || 'Cas Tambahan',
          customChargeType: data.custom_charge_type || 'RM',
          customChargeAmount: data.custom_charge_amount !== undefined ? Number(data.custom_charge_amount) : 0.00,
          customerMenuTemplate: data.customer_menu_template || 'modern',
          customerMenuViewMode: data.customer_menu_view_mode || 'grid',
          kdsSound: data.kds_sound || 'DEFAULT',
          // Telegram Bot — per-tenant, selamat & tersendiri
          telegramEnabled: Boolean(data.telegram_enabled),
          telegramBotToken: data.telegram_bot_token || '',
          telegramChatId: data.telegram_chat_id || ''
        };
        return res.json({ status: 'OK', data: mappedSettings });
      }
    }

    // Fallback: tenant_id tidak disertakan — kembalikan settings default
    const defaultSettings = await getSupabaseSettings(DEFAULT_TENANT_ID);
    res.json({ status: 'OK', data: defaultSettings });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/settings — Update settings & sync DIRECTLY to Supabase tenant_settings Cloud DB
app.post('/api/settings', requireStaffToken, async (req, res) => {
  try {
    const newSettings = req.body;
    
    // Guna tenant_id dari token yang disahkan (req.tenantId)
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === 'default') {
      return res.status(400).json({ status: 'ERROR', message: 'tenant_id diperlukan untuk simpan settings' });
    }

    // Simpan terus ke Supabase tenant_settings (Service Role — bypass RLS)
    const supabaseSettings = {
      header_title: newSettings.headerTitle || null,
      header_address: newSettings.headerAddress || null,
      receipt_header: newSettings.receiptHeader || null,
      receipt_footer: newSettings.footerMsg || newSettings.receiptFooter || null,
      logo_url: newSettings.logoUrl || null,
      welcome_banner_url: newSettings.welcomeBannerUrl || null,
      paper_width: newSettings.paperWidth || '58mm',
      table_count: newSettings.tableCount ? Number(newSettings.tableCount) : 20,
      operational_mode: newSettings.operationalMode || 'POSTPAY',
      staff_pin: newSettings.staffPin || '1234',
      enable_sst: Boolean(newSettings.enableSst),
      sst_rate: newSettings.sstRate !== undefined ? Number(newSettings.sstRate) : 6.00,
      enable_service_charge: Boolean(newSettings.enableServiceCharge),
      service_charge_rate: newSettings.serviceChargeRate !== undefined ? Number(newSettings.serviceChargeRate) : 10.00,
      enable_takeaway_charge: Boolean(newSettings.enableTakeawayCharge),
      takeaway_charge_type: newSettings.takeawayChargeType || 'RM',
      takeaway_charge_amount: newSettings.takeawayChargeAmount !== undefined ? Number(newSettings.takeawayChargeAmount) : 0.50,
      enable_custom_charge: Boolean(newSettings.enableCustomCharge),
      custom_charge_name: newSettings.customChargeName || null,
      custom_charge_type: newSettings.customChargeType || 'RM',
      custom_charge_amount: newSettings.customChargeAmount !== undefined ? Number(newSettings.customChargeAmount) : 0.00,
      customer_menu_template: newSettings.customerMenuTemplate || 'modern',
      customer_menu_view_mode: newSettings.customerMenuViewMode || 'grid',
      kds_sound: newSettings.kdsSound || 'DEFAULT',
      wave_mode: newSettings.waveMode !== false,
      wave_capacity: newSettings.waveCapacity !== undefined ? Number(newSettings.waveCapacity) : 10,
      menu_stock: typeof newSettings.menuStock === 'object' ? newSettings.menuStock : {},
      // Telegram Bot — per-tenant, tersendiri
      telegram_enabled: Boolean(newSettings.telegramEnabled),
      telegram_bot_token: newSettings.telegramBotToken || null,
      telegram_chat_id: newSettings.telegramChatId || null,
      updated_at: new Date().toISOString()
    };

    const { error: dbErr } = await supabaseAdmin
      .from('tenant_settings')
      .upsert({ tenant_id: tenantId, ...supabaseSettings }, { onConflict: 'tenant_id' });

    if (dbErr) {
      console.error('❌ Supabase tenant_settings sync error:', dbErr.message);
      return res.status(500).json({ status: 'ERROR', message: dbErr.message });
    }

    console.log(`✅ Supabase tenant_settings updated for tenant: ${tenantId} (termasuk Telegram config)`);

    // Broadcast settings terkini ke bilik tenant sahaja
    const updatedSettings = await getSupabaseSettings(tenantId);
    staffNamespace.to(tenantId).emit('SETTINGS_UPDATED', updatedSettings);
    if (newSettings?.emergencyMode) staffNamespace.to(tenantId).emit('EMERGENCY_MODE_TOGGLED', newSettings.emergencyMode);

    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);

    res.json({ status: 'OK', message: 'Tetapan disimpan ke Supabase Cloud!', data: updatedSettings });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});



// ============================================================
// MENU MANAGEMENT REST API
// ============================================================

// GET /api/menu — Get all menu items
app.get('/api/menu', (req, res) => {
  try {
    const menu = readMenuData();
    res.json({ status: 'OK', data: menu });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/menu — Simpan menu array ke disk & sync ke Supabase menu_items (Service Role)
app.post('/api/menu', requireStaffToken, async (req, res) => {
  try {
    const menuArray = req.body;
    if (!Array.isArray(menuArray)) {
      return res.status(400).json({ status: 'ERROR', message: 'Data menu mesti dalam format senarai (array).' });
    }

    const tenantId = req.tenantId;
    if (!tenantId || tenantId === 'default') {
      return res.status(400).json({ status: 'ERROR', message: 'tenant_id diperlukan.' });
    }

    // 1. Simpan ke disk (menu.json) — backup lokal
    writeMenuData(menuArray);
    if (tenantId) {
      staffNamespace.to(tenantId).emit('MENU_UPDATED', menuArray);
    } else {
      staffNamespace.emit('MENU_UPDATED', menuArray); // Fallback for backwards compatibility if no tenantId
    }
    console.log(`🍽️  MENU_UPDATED (local): ${menuArray.length} item(s)`);

    // 2. Sync ke Supabase menu_items menggunakan Service Role key (bypass RLS)
    if (tenantId) {
      try {
        const isValidUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        const mapped = menuArray.map((item, idx) => {
          const record = {
            tenant_id: tenantId,
            category_name: item.category || 'Lain-lain',
            name: item.name,
            description: item.description || null,
            price: Number(item.price) || 0,
            image_url: item.image || null,
            is_active: item.isActive !== false,
            sort_order: idx,
            option_groups: Array.isArray(item.optionGroups) ? item.optionGroups : []
          };
          if (isValidUUID(item.id)) {
            record.id = item.id;
          }
          return record;
        });

        // Padam semua item lama untuk tenant ini
        const { error: delErr } = await supabaseAdmin
          .from('menu_items')
          .delete()
          .eq('tenant_id', tenantId);

        if (delErr) {
          console.error('❌ Supabase menu delete error:', delErr.message);
          return res.status(500).json({ status: 'ERROR', message: `Gagal padam menu lama di Supabase: ${delErr.message}` });
        } else if (mapped.length > 0) {
          // Insert semua item baharu
          const { error: insErr } = await supabaseAdmin
            .from('menu_items')
            .insert(mapped);

          if (insErr) {
            console.error('❌ Supabase menu insert error:', insErr.message);
            return res.status(500).json({ status: 'ERROR', message: `Gagal simpan menu baharu ke Supabase: ${insErr.message}` });
          } else {
            console.log(`✅ Supabase menu_items synced: ${mapped.length} items for tenant ${tenantId}`);
          }
        } else {
          console.log(`✅ Supabase menu_items cleared for tenant ${tenantId}`);
        }
      } catch (supaErr) {
        console.error('❌ Supabase menu sync exception:', supaErr.message);
        return res.status(500).json({ status: 'ERROR', message: `Ralat Supabase menu: ${supaErr.message}` });
      }
    } else {
      console.warn('⚠️  No tenant_id — skipping Supabase sync');
      return res.status(400).json({ status: 'ERROR', message: 'Tenant ID diperlukan untuk menyimpan menu ke Supabase.' });
    }

    res.json({ status: 'OK', message: 'Menu berjaya disimpan & dikemas kini ke Cloud Supabase!', data: menuArray });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/menu/upload-image
// Accepts multipart/form-data with a file and tenant_id
app.post('/api/menu/upload-image', requireStaffToken, (req, res) => {
  uploadMenuImage.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ status: 'ERROR', message: err.message || 'Gagal muat naik gambar.' });
    }
    if (!req.file) {
      return res.status(400).json({ status: 'ERROR', message: 'Tiada fail gambar yang dihantar.' });
    }

    // Bina URL relatif berasaskan /uploads/ (bebas masalah domain/localhost)
    const imageUrl = `/uploads/menu-images/${req.file.filename}`;

    console.log(`🖼️  MENU_IMAGE_SAVED (VPS): ${req.file.filename} (${(req.file.size/1024).toFixed(1)}KB)`);
    console.log(`🔗  URL: ${imageUrl}`);

    res.json({
      status: 'OK',
      message: 'Gambar disimpan di server. URL dikemas kini ke Supabase.',
      url: imageUrl,
      filename: req.file.filename
    });
  });
});

// DELETE /api/menu/image/:filename — Delete a menu image from server
app.delete('/api/menu/image/:filename', requireStaffToken, (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 1. Sanitize filename: pastikan ia hanya nama fail, bukan path traversal (cth: ../../)
    const safeFilename = path.basename(filename);
    
    // 2. Semak jika fail tersebut milik tenant ini menggunakan EXACT PREFIX MATCH
    const sanitizeTenant = String(req.tenantId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    // Guna startsWith dan tanda '-' untuk elak substring collision
    if (!safeFilename.startsWith(`menu-${sanitizeTenant}-`)) {
      return res.status(403).json({ status: 'ERROR', message: 'Akses ditolak: Gambar bukan milik tenant anda.' });
    }

    // 3. Bina path sebenar ke direktori muat naik
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    // 4. Pengesahan Traversal Ekstra: Pastikan filePath yang diresolve (path mutlak) 
    // masih berada di dalam direktori UPLOADS_DIR yang dibenarkan.
    const resolvedFilePath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (!resolvedFilePath.startsWith(resolvedUploadsDir)) {
      return res.status(403).json({ status: 'ERROR', message: 'Percubaan capaian tidak sah (Path Traversal).' });
    }

    // 5. Semak jika fail wujud sebelum padam
    if (!fs.existsSync(resolvedFilePath)) {
      return res.status(404).json({ status: 'ERROR', message: 'Gambar tidak dijumpai.' });
    }

    // Padam fail
    fs.unlinkSync(resolvedFilePath);
    console.log(`🗑️  IMAGE_DELETED: ${safeFilename} by Tenant ${req.tenantId}`);
    res.json({ status: 'OK', message: 'Gambar berjaya dipadam.' });
  } catch (error) {
    console.error('DELETE_IMAGE Error:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// GET /api/feedbacks — Dikendalikan oleh laluan Supabase Cloud di bawah

// Helper function to escape HTML special characters for Telegram HTML parse_mode
function escapeTelegramHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to translate Telegram API error response codes to human-readable Malay messages
function parseTelegramError(responseStatus, resJson) {
  const desc = resJson?.description || '';
  if (responseStatus === 401 || desc.toLowerCase().includes('unauthorized') || desc.toLowerCase().includes('invalid token')) {
    return '❌ Bot Token Telegram tidak sah (HTTP 401 Unauthorized). Sila semak semula Token daripada @BotFather.';
  }
  if (responseStatus === 403 || desc.toLowerCase().includes('forbidden') || desc.toLowerCase().includes('blocked') || desc.toLowerCase().includes('not a member')) {
    return '❌ Telegram Bot disekat atau belum dimasukkan ke dalam Group (HTTP 403 Forbidden). Sila unblock atau masukkan bot ke dalam group & beri kebenaran.';
  }
  if (responseStatus === 400 || desc.toLowerCase().includes('chat not found') || desc.toLowerCase().includes('bad request')) {
    return `❌ Chat ID / Channel ID tidak dijumpai (HTTP 400 Bad Request: ${desc || 'Chat not found'}). Sila tekan /start pada bot atau semak ID.`;
  }
  return `❌ Gagal berhubung dengan Telegram Bot API (HTTP ${responseStatus}): ${desc || 'Ralat sambungan'}`;
}

// Safe helper function to send Telegram notifications asynchronously (non-blocking)
async function sendTelegramFeedbackNotification(feedbackData, telegramConfig) {
  try {
    const { telegramEnabled, telegramBotToken, telegramChatId } = telegramConfig || {};
    if (!telegramEnabled || !telegramBotToken || !telegramChatId) {
      return false;
    }

    const { order_id, table_number, customer_name, rating, commented_items, comment, created_at } = feedbackData || {};

    const isGood = rating === 'GOOD';
    const ratingBadge = isGood ? '👍 <b>PUAS HATI</b>' : '👎 <b>KURANG PUAS</b>';
    const orderIdStr = escapeHtml(order_id || 'N/A');
    const tableStr = table_number ? ` (MEJA ${table_number})` : '';
    const nameStr = escapeHtml(customer_name || 'Pelanggan');

    let itemsList = '<i>(Tiada item ditandakan)</i>';
    let parsedItems = commented_items;
    if (typeof parsedItems === 'string') {
      try { parsedItems = JSON.parse(parsedItems); } catch(e) { parsedItems = []; }
    }
    if (Array.isArray(parsedItems) && parsedItems.length > 0) {
      itemsList = parsedItems.map(i => `• 🍲 ${escapeTelegramHtml(i)}`).join('\n');
    }

    const cleanComment = comment ? escapeTelegramHtml(comment.trim()) : '';
    const commentStr = cleanComment ? `<i>"${cleanComment}"</i>` : '<i>(Tiada ulasan bertulis)</i>';

    const dateObj = created_at ? new Date(created_at) : new Date();
    const dateStr = dateObj.toLocaleDateString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    const timeStr = dateObj.toLocaleTimeString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });

    const messageHtml = 
`💬 <b>MAKLUM BALAS PELANGGAN BAHARU</b>
━━━━━━━━━━━━━━━━━━
<b>Status:</b> ${ratingBadge}
<b>Resit #:</b> <code>${orderIdStr}</code>${tableStr}
<b>Pelanggan:</b> ${nameStr}

<b>Hidangan Ditandakan:</b>
${itemsList}

<b>Komen Pelanggan:</b>
${commentStr}

<b>Tarikh/Masa:</b> 📅 ${dateStr}, ${timeStr}
━━━━━━━━━━━━━━━━━━`;

    const token = String(telegramBotToken).trim().replace(/^bot/i, '');
    const chatId = String(telegramChatId).trim();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML'
      })
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || !resJson.ok) {
      console.warn('⚠️ Telegram Bot API error response:', parseTelegramError(response.status, resJson));
      return false;
    }

    console.log(`✈️ TELEGRAM NOTIFICATION SENT: Order ${orderIdStr} (${rating})`);
    return true;
  } catch (err) {
    console.warn('⚠️ Telegram notification error (non-blocking background):', err.message);
    return false;
  }
}

// Helper: Hantar Amaran Keselamatan / Disconnection terus ke Telegram Kedai
async function sendTelegramAlertMessage(tenantId, alertTitle, alertMessage) {
  try {
    if (!tenantId) return false;
    const { data: s } = await supabaseAdmin
      .from('tenant_settings')
      .select('telegram_enabled, telegram_bot_token, telegram_chat_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!s || !s.telegram_enabled || !s.telegram_bot_token || !s.telegram_chat_id) {
      return false;
    }

    const token = String(s.telegram_bot_token).trim().replace(/^bot/i, '');
    const chatId = String(s.telegram_chat_id).trim();
    const now = new Date();
    const dateStr = now.toLocaleDateString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    const timeStr = now.toLocaleTimeString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });

    const htmlMsg = 
`🚨 <b>[AMARAN LAJUQ] ${escapeTelegramHtml(alertTitle)}</b>
━━━━━━━━━━━━━━━━━━
<b>Masa:</b> 📅 ${dateStr}, ${timeStr}
<b>Tenant ID:</b> <code>${escapeTelegramHtml(tenantId)}</code>

<b>Maklumat Ralat:</b>
${escapeTelegramHtml(alertMessage)}

⚠️ <i>Sila semak peranti tablet dapur (KDS) dan pastikan sambungan internet & token staf aktif.</i>`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: htmlMsg, parse_mode: 'HTML' })
    });
    return true;
  } catch (err) {
    console.warn('⚠️ Telegram Alert Error:', err.message);
    return false;
  }
}

// PUBLIC UNPROTECTED FEEDBACK SUBMISSION & FETCH HANDLERS (PURE CLOUD SUPABASE)
const handlePublicFeedbackSubmission = async (req, res) => {
  try {
    const body = req.body || {};
    const routeOrderId = req.params?.orderId;
    const order_id = routeOrderId || body.order_id || body.orderId || 'N/A';
    const table_number = body.table_number || body.tableNumber || null;
    const customer_name = body.customer_name || body.customerName || 'Pelanggan';
    const rating = body.rating || body.ratingScore || 'GOOD';
    const commented_items = body.commented_items || body.commentedItems || [];
    const comment = body.comment || body.feedback || body.message || '';
    const tenantId = req.headers['x-tenant-id'] || body.tenant_id || body.tenantId || 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc';

    // Check if order exists and is PAID
    if (order_id !== 'N/A') {
      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('payment_status')
        .eq('tenant_id', tenantId)
        .eq('order_id', order_id)
        .single();
        
      if (!orderData || orderData.payment_status !== 'PAID') {
        return res.status(403).json({ status: 'ERROR', message: 'Sila buat pembayaran sebelum meninggalkan maklum balas.' });
      }

      // Check if feedback already exists for this order
      const { data: existingFeedback } = await supabaseAdmin
        .from('customer_feedbacks')
        .select('feedback_id')
        .eq('tenant_id', tenantId)
        .eq('order_id', order_id)
        .maybeSingle();

      if (existingFeedback) {
        return res.status(409).json({ status: 'ERROR', message: 'Maklum balas telah pun dihantar untuk pesanan ini.' });
      }
    }

    const feedbackRecord = {
      tenant_id: tenantId,
      feedback_id: body.feedback_id || `FB-${Date.now()}`,
      order_id,
      table_number: table_number ? Number(table_number) : null,
      customer_name,
      rating,
      commented_items: Array.isArray(commented_items) ? commented_items : [],
      comment,
      created_at: new Date().toISOString()
    };

    // Insert DIRECTLY into Cloud Supabase customer_feedbacks table via Service Role
    const { data: dbData, error: dbErr } = await supabaseAdmin
      .from('customer_feedbacks')
      .upsert(feedbackRecord, { onConflict: 'feedback_id' })
      .select();

    if (dbErr) {
      console.error('❌ Supabase customer_feedbacks insert error:', dbErr.message);
      return res.status(500).json({ status: 'ERROR', message: dbErr.message });
    }

    console.log(`💬 [SUPABASE FEEDBACK SAVED]: ${feedbackRecord.feedback_id} for tenant ${tenantId}`);

    // Broadcast new feedback live via Socket.io to all connected /staff screens for this tenant
    staffNamespace.to(tenantId).emit('NEW_FEEDBACK_SUBMITTED', feedbackRecord);

    setImmediate(async () => {
      try {
        // Ambil Telegram config PER-TENANT dari Supabase Cloud (bukan SQLite global)
        const tenantIdForTg = feedbackRecord.tenant_id;
        if (tenantIdForTg) {
          const { data: tgSettings } = await supabaseAdmin
            .from('tenant_settings')
            .select('telegram_enabled, telegram_bot_token, telegram_chat_id')
            .eq('tenant_id', tenantIdForTg)
            .maybeSingle();

          if (tgSettings?.telegram_enabled && tgSettings?.telegram_bot_token && tgSettings?.telegram_chat_id) {
            sendTelegramFeedbackNotification(feedbackRecord, {
              telegramEnabled: true,
              telegramBotToken: tgSettings.telegram_bot_token,
              telegramChatId: tgSettings.telegram_chat_id
            }).catch(tErr => {
              console.warn('⚠️ Telegram async error:', tErr.message);
            });
          }
        }
      } catch (tErr) {
        console.warn('⚠️ Telegram check background error:', tErr.message);
      }
    });

    res.json({ status: 'OK', message: 'Maklum balas berjaya disimpan ke Cloud Supabase!', data: feedbackRecord });
  } catch (error) {
    console.error('Error submitting feedback to Supabase:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
};

// PUBLIC UNPROTECTED FEEDBACK ENDPOINTS — Customer Phone / QR Code Access
app.post('/api/feedback', handlePublicFeedbackSubmission);
app.post('/api/feedbacks', handlePublicFeedbackSubmission);
app.post('/api/orders/:orderId/feedback', handlePublicFeedbackSubmission);
app.post('/api/order/:orderId/feedback', handlePublicFeedbackSubmission);

// GET CUSTOMER FEEDBACKS DIRECTLY FROM CLOUD SUPABASE
app.get('/api/feedbacks', async (req, res) => {
  try {
    let tenantId = req.query.tenant_id || req.headers['x-tenant-id'];
    if (!tenantId || tenantId === 'null' || tenantId === 'undefined') {
      tenantId = 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc';
    }
    const { data, error } = await supabaseAdmin
      .from('customer_feedbacks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ GET /api/feedbacks Supabase error:', error.message);
      return res.status(500).json({ status: 'ERROR', message: error.message });
    }

    console.log(`💬 GET /api/feedbacks: Returned ${data?.length || 0} record(s) from Supabase Cloud`);
    res.json({ status: 'OK', data: data || [] });
  } catch (err) {
    console.error('❌ GET /api/feedbacks Exception:', err.message);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// POST /api/telegram/test — Test Telegram Bot connection
app.post('/api/telegram/test', async (req, res) => {
  try {
    const { telegramBotToken, telegramChatId } = req.body || {};
    if (!telegramBotToken || !telegramChatId) {
      return res.status(400).json({ status: 'ERROR', message: 'Sila masukkan Bot Token dan Chat ID / Channel ID.' });
    }

    const token = String(telegramBotToken).trim().replace(/^bot/i, '');
    const chatId = String(telegramChatId).trim();

    const testMessageHtml = 
`🤖 <b>UJIAN SAMBUNGAN TELEGRAM BOT BERJAYA!</b>
━━━━━━━━━━━━━━━━━━
Sistem F&B Ordering anda kini telah berjaya dihubungkan ke Telegram Bot!

<b>Bot Token:</b> <code>${escapeTelegramHtml(token.slice(0, 12))}...</code>
<b>Chat ID:</b> <code>${escapeTelegramHtml(chatId)}</code>
<b>Tarikh/Masa:</b> 📅 ${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
━━━━━━━━━━━━━━━━━━
<i>Setiap kali pelanggan menghantar maklum balas (feedback), notifikasi lengkap akan terus dihantar ke Telegram ini secara automatik.</i>`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testMessageHtml,
        parse_mode: 'HTML'
      })
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || !resJson.ok) {
      const friendlyErrMsg = parseTelegramError(response.status, resJson);
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 400).json({
        status: 'ERROR',
        message: friendlyErrMsg
      });
    }

    res.json({ status: 'OK', message: 'Mesej ujian berjaya dihantar ke Telegram!' });
  } catch (error) {
    console.error('Telegram Test Error:', error);
    res.status(500).json({ status: 'ERROR', message: `Ralat Ujian Telegram: ${error.message}` });
  }
});

// POST /api/banner/upload
// Fail banner disimpan ke PC/VPS (uploads/banners/)
// URL dikemas kini ke Supabase tenant_settings.welcome_banner_url
app.post('/api/banner/upload', requireStaffToken, async (req, res) => {
  uploadMenuImage.single('banner')(req, res, async (err) => {
    if (err) return res.status(400).json({ status: 'ERROR', message: err.message });
    if (!req.file) return res.status(400).json({ status: 'ERROR', message: 'Tiada fail gambar banner dihantar.' });

    const tenantId = req.tenantId; // Derived dari JWT
    const imageUrl = `/uploads/menu-images/${req.file.filename}`;

    console.log(`🖼️  BANNER_SAVED (VPS): ${req.file.filename} (${(req.file.size/1024).toFixed(1)}KB)`);
    console.log(`🔗  URL: ${imageUrl}`);

    // Kemaskini URL ke Supabase tenant_settings.welcome_banner_url
    if (tenantId && tenantId !== 'default') {
      const { error: dbErr } = await supabaseAdmin
        .from('tenant_settings')
        .upsert({
          tenant_id: tenantId,
          welcome_banner_url: imageUrl
        }, { onConflict: 'tenant_id' });

      if (dbErr) {
        console.warn('⚠️  Supabase banner URL update warning:', dbErr.message);
      } else {
        console.log(`✅  Supabase tenant_settings.welcome_banner_url updated: ${imageUrl}`);
      }
    }

    res.json({ status: 'OK', message: 'Banner disimpan di server & URL dikemas kini ke Supabase!', url: imageUrl });
  });
});

// POST /api/banner/reset — Reset banner ke null di Supabase
app.post('/api/banner/reset', requireStaffToken, async (req, res) => {
  try {
    const tenantId = req.tenantId; // Derived dari JWT
    if (!tenantId) return res.status(400).json({ status: 'ERROR', message: 'tenant_id (JWT) diperlukan.' });

    const { error: dbErr } = await supabaseAdmin
      .from('tenant_settings')
      .upsert({
        tenant_id: activeTenantId,
        welcome_banner_url: null
      }, { onConflict: 'tenant_id' });

    if (dbErr) {
      console.error('❌ Supabase banner reset error:', dbErr.message);
      return res.status(500).json({ status: 'ERROR', message: dbErr.message });
    }

    console.log(`✅  Supabase tenant_settings.welcome_banner_url set to null for tenant: ${activeTenantId}`);
    res.json({ status: 'OK', message: 'Banner diset semula. welcome_banner_url = null di Supabase.' });

  } catch (error) {
    console.error('BANNER_RESET Error:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Fallback: serve index.html for all non-API routes (React SPA routing)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built yet. Run: npm run build');
  }
});

// Socket.io Real-Time Events Engine

// ==========================================
// SOCKET.IO NAMESPACES & MIDDLEWARES
// ==========================================

function safeHandler(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error('[handler error]', err);
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        callback({ error: 'internal_error' });
      }
    }
  };
}

const rateLimitMap = new Map();
function checkRateLimit(socketId, maxPerMinute = 10) {
  const now = Date.now();
  const entry = rateLimitMap.get(socketId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(socketId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count += 1;
  return true;
}

// Helper: Siarkan Log Kesihatan Real-time via Socket.io 'HEALTH_LOG_EVENT'
function broadcastHealthLog(tenantId, level, eventType, message, details = {}) {
  try {
    const _tid = tenantId || DEFAULT_TENANT_ID;
    const payload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      tenant_id: _tid,
      level, // 'ERROR' | 'WARN' | 'INFO'
      eventType, // 'SUBMIT_ORDER_FAILED' | 'SOCKET_AUTH_REJECTED' | 'KDS_DISCONNECTED' | 'KDS_CONNECTED'
      message,
      details
    };
    if (staffNamespace) {
      staffNamespace.to(_tid).emit('HEALTH_LOG_EVENT', payload);
    }
    if (customerNamespace) {
      customerNamespace.to(_tid).emit('HEALTH_LOG_EVENT', payload);
    }
    console.log(`📡 [HEALTH_LOG_EVENT] [${level}] ${eventType}:`, message);
  } catch (err) {
    console.warn('⚠️ Error broadcasting health log:', err.message);
  }
}

// --- STAFF NAMESPACE ---

staffNamespace.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      const _tid = socket.handshake.auth?.tenant_id || socket.handshake.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
      broadcastHealthLog(_tid, 'ERROR', 'SOCKET_AUTH_REJECTED', 'Sambungan KDS ditolak: Tiada Token (unauthenticated)', { reason: 'unauthenticated' });
      return next(new Error('unauthenticated'));
    }

    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) {
      const _tid = socket.handshake.auth?.tenant_id || socket.handshake.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
      broadcastHealthLog(_tid, 'ERROR', 'SOCKET_AUTH_REJECTED', `Sambungan KDS ditolak: Token Tidak Sah (${error?.message || 'invalid_token'})`, { reason: error?.message || 'invalid_token' });
      sendTelegramAlertMessage(_tid, 'KDS Auth Token Terbatal / Luput', `Sambungan Socket KDS ditolak oleh pelayan: ${error?.message || 'invalid_token'}. Tablet KDS mungkin terputus.`);
      return next(new Error('invalid_token'));
    }

    // Cari tenant berdasarkan owner_id (jadual staff_profiles tidak wujud — guna tenants.owner_id)
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug')
      .eq('owner_id', userData.user.id)
      .single();

    if (tenantErr || !tenant) {
      console.error('[staff auth] user not owner of any tenant:', userData.user.id, tenantErr?.message);
      broadcastHealthLog(DEFAULT_TENANT_ID, 'ERROR', 'SOCKET_AUTH_REJECTED', `Sambungan KDS ditolak: Pengguna bukan pemilik tenant (not_staff)`, { reason: 'not_staff', userId: userData.user.id });
      return next(new Error('not_staff'));
    }

    socket.data.userId = userData.user.id;
    socket.data.tenantId = tenant.id;
    socket.data.role = 'owner';
    next();
  } catch (err) {
    console.error('[staff auth] error', err);
    broadcastHealthLog(DEFAULT_TENANT_ID, 'ERROR', 'SOCKET_AUTH_REJECTED', `Sambungan KDS ditolak: Ralat Pelayan (${err.message})`, { reason: err.message });
    next(new Error('auth_failed'));
  }
});

staffNamespace.on('connection', (socket) => {
  socket.join(socket.data.tenantId);
  console.log(`🔑 [STAFF] Socket ${socket.id} joined room: ${socket.data.tenantId}`);
  broadcastHealthLog(socket.data.tenantId, 'INFO', 'KDS_CONNECTED', `Peranti KDS terhubung (Socket ID: ${socket.id})`, { socket_id: socket.id });

  socket.on('disconnect', (reason) => {
    broadcastHealthLog(socket.data.tenantId, 'WARN', 'KDS_DISCONNECTED', `Peranti KDS terputus sambungan (Reason: ${reason})`, { socket_id: socket.id, reason });
  });

  getSupabaseSystemState(socket.data.tenantId)
    .then((state) => socket.emit('INIT_STATE', state))
    .catch((err) => {
      console.error('[INIT_STATE] error', err);
      socket.emit('INIT_STATE_ERROR', { error: 'load_failed' });
    });

  socket.on('SYNTHETIC_PING', safeHandler(async (payload, callback) => {
    const startTime = Date.now();
    staffNamespace.to(socket.data.tenantId).emit('KDS_PING_TEST', { pingId: startTime });
    if (callback) callback({ status: 'ok', sentAt: startTime });
  }));

  socket.on('KDS_PONG_RESPONSE', safeHandler(async (payload) => {
    const now = Date.now();
    const latency = now - (payload?.pingId || now);
    socket.data.lastLatency = latency;
    socket.data.lastPong = now;
  }));

  socket.on('KDS_ACK_ORDER_RECEIVED', safeHandler(async (payload) => {
    console.log(`✅ [KDS ACK CONFIRMED] Pesanan #${payload?.order_id} sah diterima oleh KDS (Socket ${socket.id})`);
    const _tid = payload?.tenant_id || socket.data.tenantId;
    broadcastHealthLog(_tid, 'INFO', 'KDS_ORDER_ACK', `KDS sah menerima & memaparkan pesanan #${payload?.order_id || 'N/A'}`, {
      order_id: payload?.order_id,
      socket_id: socket.id,
      received_at: payload?.received_at || new Date().toISOString()
    });
  }));

  socket.on('disconnect', (reason) => {
    console.log(`[staff] ${socket.data.userId} disconnected: ${reason}`);
  });

  socket.on('CREATE_SESSION', safeHandler(async (payload, callback) => {
    if (typeof payload?.stand_number !== 'number' && typeof payload?.table_number !== 'number') {
      return callback && callback({ error: 'invalid_payload' });
    }

    const tenantId = socket.data.tenantId;
    const tableNumber = payload.stand_number || payload.table_number;

    // 1. Semak sama ada meja sudah ada sesi AKTIF (status bukan KOSONG)
    const { data: existingTable } = await supabaseAdmin
      .from('tables')
      .select('current_session_id, status')
      .eq('tenant_id', tenantId)
      .eq('table_number', tableNumber)
      .single();

    if (existingTable?.current_session_id && existingTable?.status !== 'KOSONG') {
      // Meja sudah ada sesi — semak sesi masih ACTIVE
      const { data: existSess } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('session_id', existingTable.current_session_id)
        .eq('tenant_id', tenantId)
        .eq('status', 'ACTIVE')
        .single();
      
      if (existSess) {
        const updatedState = await getSupabaseSystemState(tenantId);
        staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
        customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
        return callback && callback({ status: 'ok', session: existSess });
      }
    }

    // 2. Cipta sesi baharu
    const sessionId = 'SES-' + Math.floor(10000 + Math.random() * 90000);
    const accessToken = require('crypto').randomUUID();

    const { data: newSession, error: insertErr } = await supabaseAdmin
      .from('sessions')
      .insert({
        tenant_id: tenantId,
        session_id: sessionId,
        table_number: tableNumber,
        status: 'ACTIVE',
        access_token: accessToken,
        customer_name: ''
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 3. Kemaskini jadual tables — guna 'ADA_PELANGGAN' supaya UI tahu meja berisi
    const { error: upsertErr } = await supabaseAdmin
      .from('tables')
      .upsert({
        tenant_id: tenantId,
        table_number: tableNumber,
        status: 'ADA_PELANGGAN',
        current_session_id: sessionId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,table_number' });

    if (upsertErr) {
      console.error('[CREATE_SESSION] upsert tables error:', upsertErr.message);
    }

    console.log(`✅ [CREATE_SESSION] Meja ${tableNumber} → Sesi ${sessionId} untuk tenant ${tenantId}`);

    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok', session: newSession });
  }));


  socket.on('SUBMIT_ORDER', safeHandler(async (payload, callback) => {
    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      return callback && callback({ error: 'invalid_payload' });
    }
    
    const tenantId = socket.data.tenantId;
    const rawSessionId = payload.session_id;
    const strSessionId = rawSessionId ? String(rawSessionId) : '';
    const sessionId = (strSessionId && !strSessionId.startsWith('SES-') && strSessionId !== 'GUEST')
      ? `SES-${strSessionId}`
      : (strSessionId || 'GUEST');
    const { client_order_draft_id } = payload;
    
    // Idempotency Check
    if (client_order_draft_id) {
      const { data: existingDraft } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_order_draft_id', client_order_draft_id)
        .single();
        
      if (existingDraft) {
        return callback && callback({ status: 'ok', order: existingDraft });
      }
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({ 
        order_id: payload.order_id || payload.client_order_draft_id || `ORD-${Date.now().toString().slice(-8)}`,
        tenant_id: tenantId, 
        table_number: Number(payload.table_number || payload.tableNumber) || 0,
        session_id: sessionId, 
        items: payload.items,
        customer_name: payload.customerName || payload.customer_name || '',
        order_type: payload.orderType || payload.order_type || 'DINE_IN',
        subtotal: payload.subtotal || payload.total_amount || 0,
        tax: payload.tax || 0,
        total_amount: payload.total_amount || payload.subtotal || 0,
        special_instruction: payload.specialInstruction || payload.special_notes || null,
        kitchen_status: 'PENDING',
        payment_status: 'UNPAID',
        client_order_draft_id: client_order_draft_id || payload.order_id || null
      })
      .select()
      .single();

    if (error) throw error;

    staffNamespace.to(tenantId).emit('NEW_ORDER_RECEIVED', order);
    
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);

    if (callback) callback({ status: 'ok', order });
  }));

  socket.on('UPDATE_KITCHEN_STATUS', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { order_id, status } = payload;
    await supabaseAdmin.from('orders').update({ kitchen_status: status }).eq('tenant_id', tenantId).eq('order_id', order_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('MARK_STATION_DONE', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('ORDER_CANCELLED_BY_KITCHEN', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { order_id, reason } = payload;
    await supabaseAdmin.from('orders').update({ kitchen_status: 'CANCELLED', kitchen_cancel_reason: reason }).eq('tenant_id', tenantId).eq('order_id', order_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('COMPLETE_PAYMENT', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { session_id, client_reported_total } = payload;
    
    const settings = await getSupabaseSettings(tenantId);
    
    // Server-side recomputation of orders
    const { data: sessionOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('session_id', session_id)
      .neq('kitchen_status', 'CANCELLED');

    let serverCalculatedTotal = 0;
    if (sessionOrders) {
      sessionOrders.forEach(ord => {
        serverCalculatedTotal += Number(ord.total_amount) || 0;
      });
    }

    const difference = Math.abs(serverCalculatedTotal - (client_reported_total || 0));
    
    if (difference > 0.05) {
      await supabaseAdmin.from('payment_discrepancy_log').insert({
        tenant_id: tenantId,
        session_id: session_id,
        client_reported_total: client_reported_total,
        server_calculated_total: serverCalculatedTotal,
        discrepancy_amount: difference
      });
      console.warn(`[PAYMENT DISCREPANCY] Tenant ${tenantId} Session ${session_id} Client: ${client_reported_total} Server: ${serverCalculatedTotal}`);
      
      if (difference > 1.00) {
        return callback && callback({ error: 'discrepancy_too_high', server_total: serverCalculatedTotal });
      }
    }

    // Update orders to PAID
    await supabaseAdmin.from('orders').update({ payment_status: 'PAID' }).eq('tenant_id', tenantId).eq('session_id', session_id);
    
    // TUGASAN A: Lepaskan pesanan PAYMENT_PENDING ke PENDING supaya masuk dapur
    await supabaseAdmin.from('orders').update({ kitchen_status: 'PENDING' })
      .eq('tenant_id', tenantId)
      .eq('session_id', session_id)
      .eq('kitchen_status', 'PAYMENT_PENDING');

    // Jika mod POSTPAY, tutup sesi kerana pelanggan makan dulu baru bayar (sudah selesai).
    // Jika PREPAY, biar sesi kekal AKTIF supaya dapur nampak pesanan dan pelanggan boleh makan.
    if (settings.operationalMode !== 'PREPAY') {
      await supabaseAdmin.from('sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
      await supabaseAdmin.from('table_sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
      // Kosongkan meja
      await supabaseAdmin.from('tables').update({ status: 'KOSONG', current_session_id: null }).eq('tenant_id', tenantId).eq('current_session_id', session_id);
    }

    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('CLOSE_SESSION', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { session_id } = payload;
    await supabaseAdmin.from('sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
    await supabaseAdmin.from('table_sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('CANCEL_SESSION', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { session_id, reason } = payload;
    
    // 1. Tutup sesi
    await supabaseAdmin.from('sessions').update({ 
      status: 'CLOSED', 
      is_cancelled: true, 
      cancel_reason: reason || 'Sesi dibatalkan oleh kaunter',
      closed_at: new Date().toISOString() 
    }).eq('tenant_id', tenantId).eq('session_id', session_id);
    
    // 2. Kosongkan meja (cari meja yang ada sesi ini dan set KOSONG)
    await supabaseAdmin.from('tables').update({
      status: 'KOSONG',
      current_session_id: null,
      updated_at: new Date().toISOString()
    }).eq('tenant_id', tenantId).eq('current_session_id', session_id);

    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); 
    customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    staffNamespace.to(tenantId).emit('SESSION_HAS_BEEN_CANCELLED', { session_id, reason: reason || 'Sesi dibatalkan oleh kaunter' });
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('RESET_ALL_DATA', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    // (Implementation similar to /api/reset)
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('UPDATE_SETTINGS', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const updateObj = {};
    if (payload.operationalMode) updateObj.operational_mode = payload.operationalMode;
    if (payload.staffPin) updateObj.staff_pin = payload.staffPin;
    if (payload.tableCount) updateObj.table_count = Number(payload.tableCount);
    if (payload.kdsSound) updateObj.kds_sound = payload.kdsSound;
    if (payload.waveMode !== undefined) updateObj.wave_mode = payload.waveMode;
    if (payload.waveCapacity) updateObj.wave_capacity = Number(payload.waveCapacity);
    if (payload.menuStock) updateObj.menu_stock = payload.menuStock;
    if (payload.emergencyMode) updateObj.emergency_mode = payload.emergencyMode;
    if (Object.keys(updateObj).length > 0) {
      await supabaseAdmin.from('tenant_settings').upsert({ tenant_id: tenantId, ...updateObj, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    }
    const settings = await getSupabaseSettings(tenantId);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    staffNamespace.to(tenantId).emit('SETTINGS_UPDATED', settings);
    if (payload?.emergencyMode) staffNamespace.to(tenantId).emit('EMERGENCY_MODE_TOGGLED', payload.emergencyMode);
    if (callback) callback({ status: 'ok' });
  }));
});

// --- CUSTOMER NAMESPACE ---


customerNamespace.use(async (socket, next) => {
  try {
    const { session_id, tenant_id, token } = socket.handshake.auth || {};
    if (!tenant_id) return next(new Error('missing_tenant_id'));

    let normalizedSessionId = session_id ? String(session_id) : '';
    if (normalizedSessionId && !normalizedSessionId.startsWith('SES-') && normalizedSessionId !== 'GUEST') {
      normalizedSessionId = `SES-${normalizedSessionId}`;
    }

    if (normalizedSessionId && normalizedSessionId !== 'GUEST') {
      // Semak jadual sessions untuk sahkan token pelanggan
      const { data: sessionData } = await supabaseAdmin
        .from('sessions')
        .select('access_token')
        .eq('session_id', normalizedSessionId)
        .eq('tenant_id', tenant_id)
        .single();
        
      if (sessionData && sessionData.access_token) {
        if (token !== sessionData.access_token) {
          return next(new Error('unauthorized_token'));
        }
      }
    }

    socket.data.tenantId = tenant_id;
    socket.data.sessionId = normalizedSessionId || 'GUEST';
    next();
  } catch (err) {
    console.error('[customer auth] error', err);
    next(new Error('auth_failed'));
  }
});

customerNamespace.on('connection', (socket) => {
  socket.join(`session:${socket.data.sessionId}`);
  socket.join(socket.data.tenantId); // Join tenant room to receive global updates

  getSupabaseSystemState(socket.data.tenantId)
    .then(async (state) => {
      // Guard Check: Sahkan struktur state dan sessions
      if (!state || typeof state !== 'object' || !state.sessions || typeof state.sessions !== 'object') {
        console.error('🚨 [CRITICAL ERROR] sessions state corrupted!', state);
        broadcastHealthLog(socket.data.tenantId, 'ERROR', 'SYSTEM_STATE_CORRUPTED', 'Struktur sessions state tidak sah (sessions state corrupted)');
        throw new Error('sessions state corrupted');
      }

      // TUGASAN A: Inject spesifik sesi yang CLOSED supaya UI pelanggan boleh paparkan popup "Sesi Dibatalkan"
      if (socket.data.sessionId && socket.data.sessionId !== 'GUEST') {
        const isArray = Array.isArray(state.sessions);
        const sessionExists = isArray
          ? state.sessions.some(s => s.session_id === socket.data.sessionId)
          : Boolean(state.sessions[socket.data.sessionId]);

        if (!sessionExists) {
          const { data: specificSession } = await supabaseAdmin
            .from('sessions')
            .select('*')
            .eq('session_id', socket.data.sessionId)
            .eq('tenant_id', socket.data.tenantId)
            .single();
            
          if (specificSession) {
            if (isArray) {
              state.sessions.push(specificSession);
            } else {
              state.sessions[specificSession.session_id] = specificSession;
            }
          }
        }
      }
      socket.emit('INIT_STATE', state);
    })
    .catch((err) => {
      console.error('[customer INIT_STATE] error', err);
      socket.emit('INIT_STATE_ERROR', { error: err.message || 'load_failed' });
    });

  socket.on('SUBMIT_ORDER', safeHandler(async (payload, callback) => {
    if (!checkRateLimit(socket.id)) {
      broadcastHealthLog(tenantId, 'WARN', 'SUBMIT_ORDER_FAILED', `Pesanan ditolak: Had Kekerapan (Rate Limited) [Socket: ${socket.id}]`, { reason: 'rate_limited', socket_id: socket.id });
      return callback && callback({ error: 'rate_limited' });
    }

    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      broadcastHealthLog(tenantId, 'WARN', 'SUBMIT_ORDER_FAILED', `Pesanan ditolak: Payload Tidak Sah (Items Kosong)`, { reason: 'invalid_payload' });
      return callback && callback({ error: 'invalid_payload' });
    }
    if (payload.items.length > 50) {
      broadcastHealthLog(tenantId, 'WARN', 'SUBMIT_ORDER_FAILED', `Pesanan ditolak: Terlalu Banyak Item (>50)`, { reason: 'too_many_items' });
      return callback && callback({ error: 'too_many_items' });
    }
    
    // In our system, frontend sends payload containing items, customerName, etc.
    const tenantId = socket.data.tenantId || payload?.tenant_id;
    // PREFER payload.session_id sent explicitly by submitOrder over stale socket.data.sessionId
    const rawSessionId = payload?.session_id || socket.data.sessionId;
    const strSessionId = rawSessionId ? String(rawSessionId) : '';
    const sessionId = (strSessionId && !strSessionId.startsWith('SES-') && strSessionId !== 'GUEST')
      ? `SES-${strSessionId}`
      : (strSessionId || 'GUEST');

    // Update socket data with normalized session ID
    socket.data.sessionId = sessionId;

    // TUGASAN B: Security Check - Pastikan sesi masih wujud dan berstatus ACTIVE
    let freshSession = null;
    if (sessionId && sessionId !== 'GUEST') {
      const { data } = await supabaseAdmin
        .from('sessions')
        .select('status')
        .eq('session_id', sessionId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      freshSession = data;

      // Fallback: jika tidak ditemui dengan SES- prefix, semak ID mentah
      if (!freshSession && rawSessionId && rawSessionId !== sessionId) {
        const { data: rawData } = await supabaseAdmin
          .from('sessions')
          .select('status')
          .eq('session_id', rawSessionId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        freshSession = rawData;
      }
    }

    if (!freshSession || freshSession.status !== 'ACTIVE') {
      broadcastHealthLog(tenantId, 'ERROR', 'SUBMIT_ORDER_FAILED', `Pesanan Gagal: Sesi Ditutup (${sessionId || 'N/A'})`, { reason: 'session_closed', session_id: sessionId });
      return callback && callback({ error: 'session_closed', message: 'Sesi anda telah ditutup. Pesanan tidak dapat dihantar.' });
    }

    const { client_order_draft_id } = payload;
    
    // Idempotency Check
    if (client_order_draft_id) {
      const { data: existingDraft } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_order_draft_id', client_order_draft_id)
        .single();
        
      if (existingDraft) {
        return callback && callback({ status: 'ok', order: existingDraft });
      }
    }

    // --- TUGASAN D: SERVER-SIDE PRICE CALCULATION ---
    // Ambil harga sebenar dari jadual menu_items di Supabase
    const { data: dbMenuItems, error: menuErr } = await supabaseAdmin
      .from('menu_items')
      .select('id, price, is_active')
      .eq('tenant_id', tenantId);

    if (menuErr) {
      return callback && callback({ error: 'menu_error', message: 'Gagal menyemak harga menu dari pelayan.' });
    }

    const menuMap = {};
    if (dbMenuItems) {
      dbMenuItems.forEach(item => menuMap[item.id] = item);
    }

    let calculatedSubtotal = 0;

    // Validate setiap item dan semak harga sebenar
    for (let clientItem of payload.items) {
      const dbItem = menuMap[clientItem.id];
      
      // Semak jika item tidak wujud atau tidak aktif
      if (!dbItem) {
        return callback && callback({ error: 'item_not_found', message: `Item "${clientItem.name || 'Unknown'}" tidak wujud dalam menu terkini. Sila muat semula menu.` });
      }
      if (dbItem.is_active === false) {
        return callback && callback({ error: 'item_inactive', message: `Item "${clientItem.name || 'Unknown'}" telah kehabisan stok atau tidak aktif.` });
      }

      // LAJUQ tidak mempunyai harga pada option (hanya string), jadi harga final = base price
      const finalItemPrice = Number(dbItem.price) || 0;
      const quantity = Number(clientItem.quantity) || 1;
      calculatedSubtotal += (finalItemPrice * quantity);

      // Override harga item dari payload client dengan harga sebenar dari DB
      clientItem.price = finalItemPrice;
    }

    // Pengiraan Cukai & Caj Tambahan dari tenant_settings
    const settings = await getSupabaseSettings(tenantId);
    let calculatedTax = 0;
    
    if (settings.enableSst) {
      calculatedTax += calculatedSubtotal * ((settings.sstRate || 0) / 100);
    }
    if (settings.enableServiceCharge) {
      calculatedTax += calculatedSubtotal * ((settings.serviceChargeRate || 0) / 100);
    }
    
    let takeawayCharge = 0;
    const isTakeaway = payload.orderType === 'TAKEAWAY' || payload.order_type === 'TAKEAWAY';
    if (isTakeaway && settings.enableTakeawayCharge) {
      if (settings.takeawayChargeType === '%') {
        takeawayCharge = calculatedSubtotal * ((settings.takeawayChargeAmount || 0) / 100);
      } else {
        takeawayCharge = Number(settings.takeawayChargeAmount || 0);
      }
    }

    let customChargeTotal = 0;
    if (settings.enableCustomCharge) {
      if (settings.customChargeType === '%') {
        customChargeTotal = calculatedSubtotal * ((settings.customChargeAmount || 0) / 100);
      } else {
        customChargeTotal = Number(settings.customChargeAmount || 0);
      }
    }

    calculatedTax += takeawayCharge + customChargeTotal;
    const calculatedTotal = calculatedSubtotal + calculatedTax;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({ 
        order_id: payload.order_id || payload.client_order_draft_id || `ORD-${Date.now().toString().slice(-8)}`,
        tenant_id: tenantId, 
        table_number: Number(payload.table_number || payload.tableNumber) || 0,
        session_id: sessionId, 
        items: payload.items,
        customer_name: payload.customerName || payload.customer_name || '',
        order_type: payload.orderType || payload.order_type || 'DINE_IN',
        subtotal: calculatedSubtotal, // Guna nilai server
        tax: calculatedTax,           // Guna nilai server
        total_amount: calculatedTotal, // Guna nilai server
        special_instruction: payload.specialInstruction || payload.special_notes || null,
        kitchen_status: settings.operationalMode === 'PREPAY' ? 'PAYMENT_PENDING' : 'PENDING',
        payment_status: 'UNPAID',
        client_order_draft_id: client_order_draft_id || null
      })
      .select()
      .single();

    if (error) throw error;

    tenantLastOrderMap.set(tenantId, Date.now());

    staffNamespace.to(tenantId).emit('NEW_ORDER_RECEIVED', order);
    
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState); customerNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);

    if (callback) callback({ status: 'ok', order });
  }));

  socket.on('CUSTOMER_FEEDBACK', safeHandler(async (payload, callback) => {
    if (!checkRateLimit(socket.id)) {
      return callback && callback({ error: 'rate_limited' });
    }
    if (typeof payload?.comment !== 'string' || payload.comment.length > 1000) {
      return callback && callback({ error: 'invalid_payload' });
    }

    const tenantId = socket.data.tenantId;

    // Check if feedback already exists for this session/order in Socket handler
    const { data: existingFeedback } = await supabaseAdmin
      .from('customer_feedbacks')
      .select('feedback_id')
      .eq('tenant_id', tenantId)
      .eq('session_id', socket.data.sessionId)
      .maybeSingle();

    if (existingFeedback) {
      return callback && callback({ error: 'Maklum balas telah pun dihantar.' });
    }

    const { data: feedback, error } = await supabaseAdmin
      .from('customer_feedbacks')
      .insert({ 
        tenant_id: tenantId, 
        session_id: socket.data.sessionId, 
        comment: payload.comment,
        rating: payload.rating,
        customer_name: payload.customer_name
      })
      .select()
      .single();

    if (error) throw error;

    staffNamespace.to(tenantId).emit('NEW_FEEDBACK_SUBMITTED', feedback);

    const { data: telegramConfig } = await supabaseAdmin
      .from('tenant_settings')
      .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
      .eq('tenant_id', tenantId)
      .single();

    if (telegramConfig?.telegram_enabled && telegramConfig?.telegram_bot_token) {
      try {
        // Assume sendTelegramFeedbackNotification exists
        sendTelegramFeedbackNotification(telegramConfig, feedback);
      } catch (err) {
        console.error('[telegram] gagal hantar', err);
      }
    }

    if (callback) callback({ status: 'ok' });
  }));

  socket.on('disconnect', () => {
    // cleanup ringkas
  });
});


// Helper: Escape HTML entities to prevent Telegram API 400 Bad Request
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Laluan feedback Supabase Cloud telah didefinisikan di atas (handlePublicFeedbackSubmission)

// ============================================================
// REST API: SUPPORT TICKET -> TELEGRAM BOT API
// ============================================================
app.post('/api/support-ticket', async (req, res) => {
  try {
    const { issueType, phoneNumber, description, imageUrl, messageHtml } = req.body || {};
    if (!issueType || !phoneNumber || !description || !imageUrl) {
      return res.status(400).json({ error: 'Sila lengkapkan SEMUA 4 maklumat borang tiket bantuan.' });
    }

    const TELEGRAM_BOT_TOKEN = '8676460374:AAG08d_gieND5UfawUVIylwY7MaEoNMGdCA';
    const TELEGRAM_CHANNEL_ID = '-1004438116944';

    const safeIssue = escapeHtml(issueType);
    const safePhone = escapeHtml(phoneNumber);
    const safeDesc = escapeHtml(description);
    const safeUrl = escapeHtml(imageUrl);

    const text = messageHtml || `
<b>🚨 TIKET BANTUAN TEKNIKAL BAHARU 🚨</b>

<b>📌 Jenis Masalah:</b> ${safeIssue}
<b>📞 No. Telefon:</b> ${safePhone}
<b>⏰ Masa Dihantar:</b> ${escapeHtml(new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' }))}

<b>📝 Penerangan Masalah:</b>
${safeDesc}

<b>🖼️ Bukti Gambar:</b>
<a href="${safeUrl}">${safeUrl}</a>
`.trim();

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });

    const tgData = await tgRes.json();
    if (tgData.ok) {
      console.log('📩 Telegram Support Ticket Sent Successfully:', tgData.result?.message_id);
      return res.json({ success: true, message: 'Laporan Berjaya Dihantar' });
    } else {
      console.error('Telegram API Error:', tgData);
      return res.status(500).json({ error: tgData.description || 'Gagal menghantar tiket ke Telegram.' });
    }
  } catch (err) {
    console.error('Support Ticket Handler Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Start Periodic Background Ping for Zombie Detection (Every 30 seconds)
setInterval(() => {
  const pingId = Date.now();
  staffNamespace.emit('KDS_PING_TEST', { pingId });
}, 30000);

// Start Express HTTP + Socket.io Server
server.listen(PORT, () => {
  const distExists = fs.existsSync(distPath);
  console.log(`
🚀 ====================================================
   F&B Ordering System Backend Server Active!
   ----------------------------------------------------
   PORT:          ${PORT}
   REST API:      http://localhost:${PORT}/api/health
   Frontend:      ${distExists ? `http://localhost:${PORT}/ ✅` : 'NOT BUILT — run: npm run build ⚠️'}
   Socket.io:     Ready for Multi-Device Connections!
   ====================================================

   📱 CARA BETUL UNTUK NGROK/VPS:
   Jalankan: ngrok http ${PORT}
   (Tunnel satu port sahaja — semua berjalan!)
   ====================================================
  `);
});
