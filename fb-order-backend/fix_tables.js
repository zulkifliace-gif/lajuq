require('dotenv').config({path: './.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixStuckTables() {
  console.log('Fetching all tables...');
  const { data: tables, error: tErr } = await supabase.from('tables').select('*').neq('status', 'KOSONG');
  if (tErr) return console.error('tables error:', tErr);

  let fixedCount = 0;
  for (const t of tables) {
    if (t.current_session_id) {
      const { data: sess, error: sErr } = await supabase.from('sessions').select('status').eq('session_id', t.current_session_id).single();
      
      // If session is closed, or doesn't exist
      if (!sess || sess.status === 'CLOSED' || sess.status === 'PAID') {
        console.log(`Fixing stuck table ${t.table_number} (session ${t.current_session_id} is ${sess ? sess.status : 'missing'})`);
        await supabase.from('tables').update({
          status: 'KOSONG',
          current_session_id: null
        }).eq('id', t.id);
        fixedCount++;
      }
    } else {
      // Status is not KOSONG but no current_session_id?
      console.log(`Fixing stuck table ${t.table_number} (no session ID)`);
      await supabase.from('tables').update({
        status: 'KOSONG',
        current_session_id: null
      }).eq('id', t.id);
      fixedCount++;
    }
  }
  console.log(`Done. Fixed ${fixedCount} stuck tables.`);
}
fixStuckTables();
