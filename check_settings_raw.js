import { supabaseAdmin } from './fb-order-backend/supabaseClient.js';

async function check() {
  console.log("Checking tenant_settings schema/data for tenant: f75e8dfd-67cd-475f-b88c-2f1ba391e1bc");
  const { data, error } = await supabaseAdmin
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', 'f75e8dfd-67cd-475f-b88c-2f1ba391e1bc')
    .maybeSingle();
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

check();
