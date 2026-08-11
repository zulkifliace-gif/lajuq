require('dotenv').config({path: './.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTenants() {
  const { data, error } = await supabase.from('tenants').select('*');
  if (error) { console.log('ERROR:', error.message); return; }
  console.log('\n✅ Tenants:');
  data?.forEach(t => {
    console.log(`\n   Tenant: ${t.name} | slug: ${t.slug}`);
    console.log(`   id: ${t.id}`);
    console.log(`   owner_id: ${t.owner_id}`);
    console.log(`   plan: ${t.plan_type} | status: ${t.subscription_status}`);
  });
}
checkTenants();
