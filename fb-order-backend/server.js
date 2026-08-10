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
  const [tablesRes, sessionsRes, ordersRes, settingsRes] = await Promise.all([
    supabaseAdmin.from('tables').select('*').eq('tenant_id', tid).order('table_number'),
    supabaseAdmin.from('sessions').select('*').eq('tenant_id', tid).eq('status','ACTIVE').order('created_at', { ascending: false }),
    supabaseAdmin.from('orders').select('*').eq('tenant_id', tid).neq('payment_status','PAID').order('created_at'),
    supabaseAdmin.from('tenant_settings').select('*').eq('tenant_id', tid).maybeSingle()
  ]);
  const dbTables = tablesRes.data || [];
  const sessionsArr = sessionsRes.data || [];
  const orders = (ordersRes.data || []).map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }));
  const s = settingsRes.data || {};
  const tableCount = s.table_count ? Number(s.table_count) : 20;

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
    footerMsg: s.receipt_footer || 'Terima Kasih!',
    logoUrl: s.logo_url || null,
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
    customChargeName: s.custom_charge_name || '',
    customChargeType: s.custom_charge_type || 'RM',
    customChargeAmount: Number(s.custom_charge_amount || 0),
    kdsSound: s.kds_sound || 'DEFAULT',
    waveMode: s.wave_mode !== false,
    waveCapacity: Number(s.wave_capacity || 10),
    menuStock: s.menu_stock || {},
    telegramEnabled: Boolean(s.telegram_enabled),
    telegramBotToken: s.telegram_bot_token || '',
    telegramChatId: s.telegram_chat_id || ''
  };
  // Convert sessions array to map keyed by session_id
  const sessions = {};
  sessionsArr.forEach(sess => { sessions[sess.session_id] = sess; });
  return { tables, sessions, orders, feedbacks: [], receiptSettings, settings: receiptSettings };
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
    const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id || 'default';
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
  crossOriginEmbedderPolicy: false
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

// REST API Endpoints
app.get('/api/health', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || DEFAULT_TENANT_ID;
    const settings = await getSupabaseSettings(tenantId);
    res.json({
      status: 'OK',
      message: 'F&B Order Backend Server is Running! (Supabase Cloud)',
      timestamp: new Date().toISOString(),
      database: 'SUPABASE_CLOUD',
      operationalMode: settings.operationalMode || 'POSTPAY',
      emergencyMode: settings.emergencyMode?.enabled || false
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message, database: 'ERROR' });
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

app.post('/api/reset', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id || DEFAULT_TENANT_ID;
    // Padam semua sesi aktif, pesanan belum bayar, dan reset meja ke KOSONG
    await Promise.all([
      supabaseAdmin.from('sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('status','ACTIVE'),
      supabaseAdmin.from('orders').delete().eq('tenant_id', tenantId).neq('payment_status','PAID'),
      supabaseAdmin.from('tables').update({ status: 'KOSONG', current_session_id: null }).eq('tenant_id', tenantId)
    ]);
    const state = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', state);
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
app.post('/api/settings', async (req, res) => {
  try {
    const newSettings = req.body || {};
    const tenantId = req.headers['x-tenant-id'] || newSettings?.tenant_id || newSettings?.tenantId;

    if (!tenantId) {
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
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);

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
app.post('/api/menu', async (req, res) => {
  try {
    const menuArray = req.body;
    if (!Array.isArray(menuArray)) {
      return res.status(400).json({ status: 'ERROR', message: 'Data menu mesti dalam format senarai (array).' });
    }

    const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id;

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
// Fail gambar disimpan ke PC/VPS (uploads/menu-images/)
// URL fail dikembalikan kepada frontend untuk disimpan ke Supabase menu_items.image_url
app.post('/api/menu/upload-image', (req, res) => {
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
app.delete('/api/menu/image/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Only allow deleting files in the uploads directory (security)
    const filePath = path.join(UPLOADS_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  IMAGE_DELETED: ${filename}`);
      res.json({ status: 'OK', message: 'Gambar berjaya dipadam.' });
    }
  } catch (error) {
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
    const orderIdStr = escapeTelegramHtml(order_id || 'N/A');
    const tableStr = table_number ? ` (MEJA ${table_number})` : '';
    const nameStr = escapeTelegramHtml(customer_name || 'Pelanggan');

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
app.post('/api/banner/upload', async (req, res) => {
  try {
    const { imageBase64, tenant_id } = req.body || {};
    const headerTenant = req.headers['x-tenant-id'];
    const activeTenantId = tenant_id || headerTenant || 'default';
    const sanitizeTenant = String(activeTenantId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

    if (!imageBase64) {
      return res.status(400).json({ status: 'ERROR', message: 'Tiada data gambar yang dihantar.' });
    }

    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ status: 'ERROR', message: 'Format data gambar tidak sah.' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `welcome-banner-${sanitizeTenant}-${Date.now()}.${ext}`;

    // Simpan fail ke disk PC/VPS
    const filePath = path.join(BANNER_UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    // Bina URL relatif berasaskan /uploads/ (bebas masalah domain/localhost)
    const bannerUrl = `/uploads/banners/${filename}`;

    console.log(`🖼️  BANNER_SAVED (VPS): ${filename} (${(buffer.length/1024).toFixed(1)}KB)`);
    console.log(`🔗  URL: ${bannerUrl}`);

    // Kemaskini URL ke Supabase tenant_settings.welcome_banner_url
    if (activeTenantId && activeTenantId !== 'default') {
      const { error: dbErr } = await supabaseAdmin
        .from('tenant_settings')
        .upsert({
          tenant_id: activeTenantId,
          welcome_banner_url: bannerUrl
        }, { onConflict: 'tenant_id' });

      if (dbErr) {
        console.warn('⚠️  Supabase banner URL update warning:', dbErr.message);
      } else {
        console.log(`✅  Supabase tenant_settings.welcome_banner_url updated: ${bannerUrl}`);
      }
    }

    res.json({ status: 'OK', message: 'Banner disimpan di server & URL dikemas kini ke Supabase!', url: bannerUrl });

  } catch (error) {
    console.error('BANNER_UPLOAD Error:', error);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/banner/reset — Reset banner ke null di Supabase
app.post('/api/banner/reset', async (req, res) => {
  try {
    const headerTenant = req.headers['x-tenant-id'];
    const { tenant_id } = req.body || {};
    const activeTenantId = tenant_id || headerTenant;

    if (!activeTenantId) {
      return res.status(400).json({ status: 'ERROR', message: 'Tenant ID diperlukan.' });
    }

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

// --- STAFF NAMESPACE ---


staffNamespace.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthenticated'));

    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) return next(new Error('invalid_token'));

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('tenant_id, role')
      .eq('id', userData.user.id)
      .single();

    if (staffErr || !staff) return next(new Error('not_staff'));

    socket.data.userId = userData.user.id;
    socket.data.tenantId = staff.tenant_id;
    socket.data.role = staff.role;
    next();
  } catch (err) {
    console.error('[staff auth] error', err);
    next(new Error('auth_failed'));
  }
});

staffNamespace.on('connection', (socket) => {
  socket.join(socket.data.tenantId);
  console.log(`🔑 [STAFF] Socket ${socket.id} joined room: ${socket.data.tenantId}`);

  getSupabaseSystemState(socket.data.tenantId)
    .then((state) => socket.emit('INIT_STATE', state))
    .catch((err) => {
      console.error('[INIT_STATE] error', err);
      socket.emit('INIT_STATE_ERROR', { error: 'load_failed' });
    });

  socket.on('disconnect', (reason) => {
    console.log(`[staff] ${socket.data.userId} disconnected: ${reason}`);
  });

  socket.on('CREATE_SESSION', safeHandler(async (payload, callback) => {
    if (typeof payload?.stand_number !== 'number' && typeof payload?.table_number !== 'number') {
      return callback && callback({ error: 'invalid_payload' });
    }
    
    // Convert table_number to stand_number if needed for backward compatibility
    const standNumber = payload.stand_number || payload.table_number;

    const { data, error } = await supabaseAdmin.rpc('create_or_join_session', {
      p_slug: null, // Staff bypasses slug check
      p_stand_number: standNumber,
      p_access_token: null, // Staff bypass token
      p_pax_count: payload.pax_count ?? 1,
      p_tenant_id: socket.data.tenantId // Custom param to allow staff bypass
    });

    if (error) throw error;
    if (data && data.error) return callback && callback({ error: data.error });

    const updatedState = await getSupabaseSystemState(socket.data.tenantId);
    staffNamespace.to(socket.data.tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok', session: data });
  }));

  socket.on('UPDATE_KITCHEN_STATUS', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { order_id, status } = payload;
    await supabaseAdmin.from('orders').update({ kitchen_status: status }).eq('tenant_id', tenantId).eq('order_id', order_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('MARK_STATION_DONE', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('ORDER_CANCELLED_BY_KITCHEN', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { order_id, reason } = payload;
    await supabaseAdmin.from('orders').update({ kitchen_status: 'CANCELLED', kitchen_cancel_reason: reason }).eq('tenant_id', tenantId).eq('order_id', order_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('CLOSE_SESSION', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { session_id } = payload;
    await supabaseAdmin.from('sessions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('CANCEL_SESSION', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    const { session_id, reason } = payload;
    await supabaseAdmin.from('sessions').update({ status: 'CLOSED', is_cancelled: true, closed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('session_id', session_id);
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    staffNamespace.to(tenantId).emit('SESSION_HAS_BEEN_CANCELLED', { session_id, reason: reason || 'Sesi dibatalkan oleh kaunter' });
    if (callback) callback({ status: 'ok' });
  }));

  socket.on('RESET_ALL_DATA', safeHandler(async (payload, callback) => {
    const tenantId = socket.data.tenantId;
    // (Implementation similar to /api/reset)
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
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
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);
    staffNamespace.to(tenantId).emit('SETTINGS_UPDATED', settings);
    if (payload?.emergencyMode) staffNamespace.to(tenantId).emit('EMERGENCY_MODE_TOGGLED', payload.emergencyMode);
    if (callback) callback({ status: 'ok' });
  }));
});

// --- CUSTOMER NAMESPACE ---


customerNamespace.use(async (socket, next) => {
  try {
    const { session_id, access_token } = socket.handshake.auth || {};
    if (!session_id || !access_token) return next(new Error('missing_credentials'));

    const { data: session, error } = await supabaseAdmin
      .from('table_sessions')
      .select('id, tenant_id, status, expires_at, stands!inner(access_token, stand_number)')
      .eq('id', session_id)
      .eq('status', 'ACTIVE')
      .single();

    if (error || !session) return next(new Error('session_not_found'));
    if (session.stands.access_token !== access_token) return next(new Error('invalid_token'));
    if (new Date(session.expires_at) <= new Date()) return next(new Error('session_expired'));

    socket.data.tenantId = session.tenant_id;
    socket.data.sessionId = session.id;
    socket.data.standNumber = session.stands.stand_number;
    next();
  } catch (err) {
    console.error('[customer auth] error', err);
    next(new Error('auth_failed'));
  }
});

customerNamespace.on('connection', (socket) => {
  socket.join(`session:${socket.data.sessionId}`);

  socket.on('SUBMIT_ORDER', safeHandler(async (payload, callback) => {
    if (!checkRateLimit(socket.id)) {
      return callback && callback({ error: 'rate_limited' });
    }

    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      return callback && callback({ error: 'invalid_payload' });
    }
    if (payload.items.length > 50) {
      return callback && callback({ error: 'too_many_items' });
    }
    
    // In our system, frontend sends payload containing items, customerName, etc.
    const tenantId = socket.data.tenantId;
    const sessionId = socket.data.sessionId;

    const { data: freshSession } = await supabaseAdmin
      .from('table_sessions')
      .select('status, expires_at')
      .eq('id', sessionId)
      .single();

    if (!freshSession || freshSession.status !== 'ACTIVE' || new Date(freshSession.expires_at) <= new Date()) {
      return callback && callback({ error: 'session_expired' });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({ 
        tenant_id: tenantId, 
        session_id: sessionId, 
        items: payload.items,
        customer_name: payload.customerName || '',
        order_type: payload.orderType || 'DINE_IN',
        subtotal: payload.subtotal || 0,
        tax: payload.tax || 0,
        total_amount: payload.total_amount || 0,
        special_instruction: payload.specialInstruction || null,
        kitchen_status: 'PENDING',
        payment_status: 'UNPAID'
      })
      .select()
      .single();

    if (error) throw error;

    staffNamespace.to(tenantId).emit('NEW_ORDER_RECEIVED', order);
    
    const updatedState = await getSupabaseSystemState(tenantId);
    staffNamespace.to(tenantId).emit('SYSTEM_STATE_UPDATED', updatedState);

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
