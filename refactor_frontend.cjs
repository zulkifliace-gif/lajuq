const fs = require('fs');

const file = 'src/context/OrderContext.jsx';
let c = fs.readFileSync(file, 'utf8');

const target = `socketRef.current = io(BACKEND_URL, {
          transports: ['polling', 'websocket'],
          reconnectionAttempts: 20,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000
        });

        socketRef.current.on('connect', () => {
          console.log('🔌 Connected to Socket.io:', BACKEND_URL);
          const tid = tenantRef.current?.id || localStorage.getItem('fb_tenant_id');
          if (tid) socketRef.current.emit('JOIN_TENANT', tid);
        });`;

const replacement = `const urlParams = new URLSearchParams(window.location.search);
        const isCustomerPath = window.location.pathname.includes('customer') || urlParams.has('session');

        if (isCustomerPath) {
          const session_id = urlParams.get('session') || localStorage.getItem('fb_customer_session_id');
          const access_token = urlParams.get('token') || localStorage.getItem('fb_customer_access_token') || 'dummy_token';
          
          socketRef.current = io(\`\${BACKEND_URL}/customer\`, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 20,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            auth: { session_id, access_token }
          });
        } else {
          socketRef.current = io(\`\${BACKEND_URL}/staff\`, {
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
          console.log(\`🔌 Connected to Socket.io Namespace: \${isCustomerPath ? '/customer' : '/staff'}\`);
        });`;

if (c.includes(target)) {
    c = c.replace(target, replacement);
    fs.writeFileSync(file, c);
    console.log("Successfully refactored OrderContext.jsx socket connection.");
} else {
    console.log("Target string not found in OrderContext.jsx!");
}
