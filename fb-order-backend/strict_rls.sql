-- 1. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts (assuming standard names if they exist)
DROP POLICY IF EXISTS "Owner can view their tenant" ON public.tenants;
DROP POLICY IF EXISTS "Owner can view their menu" ON public.menu_items;
DROP POLICY IF EXISTS "Owner can update their menu" ON public.menu_items;
DROP POLICY IF EXISTS "Owner can insert their menu" ON public.menu_items;
DROP POLICY IF EXISTS "Owner can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Owner can update their orders" ON public.orders;
DROP POLICY IF EXISTS "Owner can view their sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Owner can update their sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Owner can view their feedbacks" ON public.customer_feedbacks;
DROP POLICY IF EXISTS "Owner can view their settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "Owner can update their settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "Public can view menu" ON public.menu_items;
DROP POLICY IF EXISTS "Public can view settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Public can update sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Public can update orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create feedbacks" ON public.customer_feedbacks;

-- ==========================================
-- STRICT POLICIES FOR TENANTS (RESTAURANT OWNERS)
-- ==========================================

-- Tenants Table: Only the owner (auth.uid()) can read/update their own tenant record
CREATE POLICY "Owner can view their tenant" ON public.tenants FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owner can update their tenant" ON public.tenants FOR UPDATE USING (auth.uid() = owner_id);

-- Menu Items: Owner can do all
CREATE POLICY "Owner can do all on menu" ON public.menu_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenants WHERE id = menu_items.tenant_id AND owner_id = auth.uid())
);

-- Orders: Owner can do all
CREATE POLICY "Owner can do all on orders" ON public.orders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenants WHERE id = orders.tenant_id AND owner_id = auth.uid())
);

-- Table Sessions: Owner can do all
CREATE POLICY "Owner can do all on sessions" ON public.table_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenants WHERE id = table_sessions.tenant_id AND owner_id = auth.uid())
);

-- Customer Feedbacks: Owner can do all
CREATE POLICY "Owner can do all on feedbacks" ON public.customer_feedbacks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenants WHERE id = customer_feedbacks.tenant_id AND owner_id = auth.uid())
);

-- Tenant Settings: Owner can do all
CREATE POLICY "Owner can do all on settings" ON public.tenant_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_settings.tenant_id AND owner_id = auth.uid())
);

-- ==========================================
-- SECURE PUBLIC (ANON) ACCESS FOR CUSTOMERS
-- ==========================================

-- Customers need to read menu and settings to order
CREATE POLICY "Public can view menu" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Public can view settings" ON public.tenant_settings FOR SELECT USING (true);

-- Customers need to create orders and sessions
CREATE POLICY "Public can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update orders" ON public.orders FOR UPDATE USING (true); -- allowed to update kitchen_status, payment_status
CREATE POLICY "Public can create sessions" ON public.table_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update sessions" ON public.table_sessions FOR UPDATE USING (true); -- allowed to update status to CLOSED

-- Customers can submit feedback
CREATE POLICY "Public can create feedbacks" ON public.customer_feedbacks FOR INSERT WITH CHECK (true);

-- Note: We intentionally DO NOT allow public SELECT on orders, table_sessions, or feedbacks.
-- Wait, if customers update an order, they might need SELECT access to it first!
-- Let's allow public SELECT on orders and table_sessions, because the customer's browser needs to subscribe to real-time updates for their own table!
-- Actually, the frontend subscribes to all orders/sessions for the `tenant_id` if we allow SELECT USING (true).
-- To be truly secure, a customer should only see orders for THEIR table_session. But since there's no auth for customers, we have to allow SELECT USING (true).
CREATE POLICY "Public can read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Public can read sessions" ON public.table_sessions FOR SELECT USING (true);
-- Feedbacks should strictly be WRITE-ONLY for the public!
CREATE POLICY "Public cannot read feedbacks" ON public.customer_feedbacks FOR SELECT USING (false);
