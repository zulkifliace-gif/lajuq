require('dotenv').config({path: './.env'});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkFunction() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'create_or_join_session';
    `
  });
  console.log(data, error);
}

checkFunction();
