require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  console.log('Running Security Migrations...');

  // 1. Add access_token to sessions
  const { error: err1 } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS access_token UUID DEFAULT gen_random_uuid();
    `
  });
  if (err1) console.error('Error adding access_token to sessions:', err1);
  else console.log('✅ Added access_token to sessions');

  // 2. Add columns to orders
  const { error: err2 } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS client_reported_total NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS final_total NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS client_order_draft_id UUID;
      
      -- Backfill final_total for existing records
      UPDATE orders SET final_total = total_amount WHERE final_total IS NULL;
    `
  });
  if (err2) console.error('Error modifying orders:', err2);
  else console.log('✅ Modified orders table');

  // 3. Add unique constraint on orders (tenant_id, client_order_draft_id)
  const { error: err3 } = await supabase.rpc('exec_sql', {
    query: `
      DO $$
      BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'unique_tenant_draft_id'
        ) THEN
            ALTER TABLE orders ADD CONSTRAINT unique_tenant_draft_id UNIQUE (tenant_id, client_order_draft_id);
        END IF;
      END
      $$;
    `
  });
  if (err3) console.error('Error adding unique constraint to orders:', err3);
  else console.log('✅ Added unique constraint to orders');

  // 4. Create payment_discrepancy_log table
  const { error: err4 } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS payment_discrepancy_log (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID REFERENCES tenant_profiles(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
        client_total NUMERIC(10,2),
        server_total NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  });
  if (err4) console.error('Error creating payment_discrepancy_log:', err4);
  else console.log('✅ Created payment_discrepancy_log table');

  // 5. Update customer_feedbacks (Assuming it has order_id)
  const { error: err5 } = await supabase.rpc('exec_sql', {
    query: `
      DO $$
      BEGIN
        -- If order_id doesn't exist, we can't easily enforce it if there are old rows without it.
        -- We will just make sure the column exists and we will enforce it in the API logic.
        ALTER TABLE customer_feedbacks ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(order_id);
      END
      $$;
    `
  });
  if (err5) console.error('Error modifying customer_feedbacks:', err5);
  else console.log('✅ Modified customer_feedbacks table');

  console.log('Migration complete!');
}

runMigration();
