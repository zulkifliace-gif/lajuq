const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'fb-order-backend', 'server.js');
let content = fs.readFileSync(serverFile, 'utf8');

// 1. Find the start of io.on('connection')
const ioStartIndex = content.indexOf("io.on('connection'");
if (ioStartIndex === -1) {
    console.error("Could not find io.on('connection'");
    process.exit(1);
}

// 2. Find the end of io.on('connection') block
let openBraces = 0;
let ioEndIndex = -1;
for (let i = ioStartIndex; i < content.length; i++) {
    if (content[i] === '{') openBraces++;
    if (content[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
            // Check if it's the end of the block
            // The block ends with });
            if (content.substring(i, i+3) === '});') {
                ioEndIndex = i + 3;
                break;
            }
        }
    }
}

if (ioEndIndex === -1) {
    console.error("Could not find the end of io.on('connection')");
    process.exit(1);
}

// 3. Extract the old block (for reference if needed)
const oldSocketBlock = content.substring(ioStartIndex, ioEndIndex);

// 4. Create the new namespaces block
const newNamespacesBlock = `
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
const staffNamespace = io.of('/staff');

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
  console.log(\`🔑 [STAFF] Socket \${socket.id} joined room: \${socket.data.tenantId}\`);

  getSupabaseSystemState(socket.data.tenantId)
    .then((state) => socket.emit('INIT_STATE', state))
    .catch((err) => {
      console.error('[INIT_STATE] error', err);
      socket.emit('INIT_STATE_ERROR', { error: 'load_failed' });
    });

  socket.on('disconnect', (reason) => {
    console.log(\`[staff] \${socket.data.userId} disconnected: \${reason}\`);
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
const customerNamespace = io.of('/customer');

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
  socket.join(\`session:\${socket.data.sessionId}\`);

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
`;

content = content.replace(oldSocketBlock, newNamespacesBlock);
fs.writeFileSync(serverFile, content, 'utf8');
console.log('Successfully refactored server.js namespaces.');
