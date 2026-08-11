const io = require('socket.io-client');
const socket = io('https://api.lajuq.my/staff', {
  transports: ['polling', 'websocket'],
  auth: { token: 'invalid_token_just_to_see_connection' } // We just want to see if it responds with 'unauthenticated'
});

socket.on('connect_error', (err) => {
  console.log('Connect error:', err.message);
  process.exit(1);
});

socket.on('connect', () => {
  console.log('Connected!');
  process.exit(0);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 5000);
