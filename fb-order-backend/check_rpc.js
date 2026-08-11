require('dotenv').config({path: './.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSessionsTable() {
  // Semak jadual sessions
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('*')
    .limit(3);
  
  if (sessErr) {
    console.log('sessions error:', sessErr.code, sessErr.message);
  } else {
    console.log('✅ sessions table ada:', sessions?.length, 'rekod');
    if (sessions?.length > 0) {
      console.log('Kunci:', Object.keys(sessions[0]).join(', '));
      console.log('Contoh rekod:', JSON.stringify(sessions[0], null, 2));
    }
  }

  // Semak jadual tables/stands
  const tableNames = ['tables', 'stands', 'table_sessions', 'order_sessions'];
  for (const t of tableNames) {
    const { data, error } = await supabase.from(t).select('*').limit(2);
    if (!error) {
      console.log(`\n✅ ${t} table ada: ${data?.length} rekod`);
      if (data?.length > 0) console.log('   Kunci:', Object.keys(data[0]).join(', '));
    } else if (error.code === 'PGRST205') {
      console.log(`❌ ${t}: TIDAK WUJUD`);
    } else {
      console.log(`⚠️  ${t}:`, error.message);
    }
  }
}
checkSessionsTable();
