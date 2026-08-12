require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBanner() {
  const { data } = await supabase.from('tenant_settings').select('tenant_id, welcome_banner_url');
  console.log(data);
}
checkBanner();
