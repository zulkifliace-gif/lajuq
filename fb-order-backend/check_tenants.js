const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wpykjqedncfwqvcaqrni.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweWtqcWVkbmNmd3F2Y2Fxcm5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0MjkxNywiZXhwIjoyMTAxNTE4OTE3fQ.9w3PdVSJ0d5wqDzUsvtYpcwdGi2NFpgSU724dWtEJ2A';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkTenants() {
  const { data, error } = await supabaseAdmin.from('tenants').select('*');
  console.log('Tenants Table Error:', error);
  console.log('Tenants:', JSON.stringify(data, null, 2));
}

checkTenants();
