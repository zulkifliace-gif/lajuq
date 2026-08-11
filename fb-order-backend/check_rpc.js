require('dotenv').config({path: './.env'});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRPC() {
  const combos = [
    // 5 args
    { p_slug: null, p_stand_number: 1, p_access_token: null, p_pax_count: 1, p_tenant_id: 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc' },
    // 4 args (no p_tenant_id)
    { p_slug: null, p_stand_number: 1, p_access_token: null, p_pax_count: 1 },
    // 4 args (no p_pax_count)
    { p_slug: null, p_stand_number: 1, p_access_token: null, p_tenant_id: 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc' },
    // 3 args (slug, stand, token)
    { p_slug: null, p_stand_number: 1, p_access_token: null },
    // 2 args
    { p_slug: null, p_stand_number: 1 }
  ];

  for (let i = 0; i < combos.length; i++) {
    const { data, error } = await supabase.rpc('create_or_join_session', combos[i]);
    console.log(`\nCombo ${i + 1} (${Object.keys(combos[i]).length} args):`);
    if (error) {
      if (error.code === 'PGRST202') {
        console.log('-> PGRST202: Not found');
      } else {
        console.log('-> ERROR:', error.message);
      }
    } else {
      console.log('-> SUCCESS:', data);
    }
  }
}
checkRPC();
