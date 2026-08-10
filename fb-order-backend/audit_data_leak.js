const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wpykjqedncfwqvcaqrni.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweWtqcWVkbmNmd3F2Y2Fxcm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDI5MTcsImV4cCI6MjEwMTUxODkxN30.RsqkdayIqKyogxaHklZ46qTWU20lzps8PvqnhwTFyrk';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testTable(tableName) {
  console.log(`\n--- Testing ${tableName} (Anon Key) ---`);
  const { data, error } = await supabase.from(tableName).select('*').limit(5);
  
  if (error) {
    console.log(`❌ Error / Blocked by RLS:`, error.message);
  } else {
    if (data.length > 0) {
      console.log(`⚠️ DATA LEAK! RLS allows public read for ${tableName}. Returned ${data.length} rows.`);
      console.log(`Example:`, data[0]);
    } else {
      console.log(`✅ No data returned. Either table is empty, or RLS is working (returning 0 rows).`);
      // check if table is actually empty using service key to be sure
    }
  }
}

async function run() {
  const tables = ['tenants', 'menu_items', 'orders', 'table_sessions', 'customer_feedbacks', 'tenant_settings'];
  for (const table of tables) {
    await testTable(table);
  }
}

run();
