-- ====================================================================
-- LAJUQ SAAS - COMPREHENSIVE SUPABASE MULTI-TENANT SCHEMA (V2)
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TENANTS (RESTORAN / CLIENT) TABLE
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'trialing', -- 'trialing', 'active', 'past_due', 'canceled'
    plan_type TEXT DEFAULT 'starter',            -- 'starter', 'pro', 'vps'
    card_verified BOOLEAN DEFAULT false,
    trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TENANT SETTINGS TABLE (Tetapan Resit, Template, Banner, Cukai, LHDN, Telegram, KDS, POS & Kaunter)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    welcome_banner_url TEXT,
    customer_menu_template TEXT DEFAULT 'modern', -- 'modern', 'kopitiam'
    customer_menu_view_mode TEXT DEFAULT 'grid',  -- 'grid', 'book'
    
    -- Tetapan Resit & POS Kaunter
    header_title TEXT DEFAULT 'RESTORAN LAJUQ',   -- Nama Restoran pada Resit
    header_address TEXT,                          -- Alamat Restoran pada Resit
    receipt_header TEXT DEFAULT 'Terima Kasih Atas Kunjungan Anda!',
    receipt_footer TEXT DEFAULT 'Sila Datang Lagi!',
    logo_url TEXT,                                -- Logo Restoran pada Resit Thermal
    table_count INT DEFAULT 20,                   -- Jumlah Meja Restoran (Lalai: 20)
    operational_mode TEXT DEFAULT 'POSTPAY',       -- Mod Operasi: 'POSTPAY' (Makan Dulu) atau 'PREPAY' (Bayar Dulu)
    paper_width TEXT DEFAULT '58mm',              -- Saiz Kertas Thermal (58mm / 80mm)
    currency TEXT DEFAULT 'MYR',

    -- Tetapan Cukai & Cas Tambahan POS
    enable_sst BOOLEAN DEFAULT false,             -- Suis Cukai SST
    sst_rate NUMERIC(5, 2) DEFAULT 6.00,          -- Kadar SST (6% atau 8%)
    enable_service_charge BOOLEAN DEFAULT false,  -- Suis Cas Perkhidmatan
    service_charge_rate NUMERIC(5, 2) DEFAULT 10.00, -- Kadar Cas Perkhidmatan (10%)
    enable_takeaway_charge BOOLEAN DEFAULT false, -- Suis Cas Bungkus
    takeaway_charge_type TEXT DEFAULT 'RM',        -- 'RM' atau '%'
    takeaway_charge_amount NUMERIC(5, 2) DEFAULT 0.50, -- Amaun Cas Bungkus per bekas
    enable_custom_charge BOOLEAN DEFAULT false,   -- Suis Cas Khas Tambahan
    custom_charge_name TEXT DEFAULT 'Cas Tambahan',
    custom_charge_type TEXT DEFAULT 'RM',
    custom_charge_amount NUMERIC(5, 2) DEFAULT 0.00,

    -- Tetapan LHDN MyInvois Malaysia
    lhdn_tin_no TEXT,                             -- Nombor TIN LHDN Restoran
    sst_registration_no TEXT,                     -- Nombor Pendaftaran SST
    msic_code TEXT DEFAULT '56101',               -- Kod MSIC LHDN (56101 = Restoran)
    
    -- Tetapan Notifikasi Telegram Bot
    telegram_bot_token TEXT,                      -- Token Telegram Bot Restoran
    telegram_chat_id TEXT,                        -- ID Group Telegram Staf
    telegram_enabled BOOLEAN DEFAULT false,       -- Suis Notifikasi Telegram Realtime
    
    -- Tetapan KDS Dapur & PIN Staf
    staff_pin TEXT DEFAULT '1234',                -- PIN 4-Digit Keselamatan Staf/KDS (Lalai: 1234)
    kds_sound TEXT DEFAULT 'DEFAULT',             -- Fail Bunyi Notifikasi Audio Dapur
    wave_mode BOOLEAN DEFAULT true,               -- Mod Batch Gelombang Pesanan Dapur
    wave_capacity INT DEFAULT 10,                 -- Kapasiti Batch Pesanan Dapur
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. MENU CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. MENU ITEMS TABLE (Dengan Sokongan JSONB Option Groups)
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    category_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    option_groups JSONB DEFAULT '[]'::jsonb, -- Options like Level Pedas, Extra Cheese
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABLE SESSIONS (Slip QR Code Dinamik Per Meja)
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    table_no TEXT NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active', -- 'active', 'closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    order_no TEXT NOT NULL,
    table_no TEXT NOT NULL,
    kitchen_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PREPARING', 'READY', 'SERVED'
    payment_status TEXT DEFAULT 'UNPAID',  -- 'UNPAID', 'PAID'
    payment_method TEXT DEFAULT 'CASH',    -- 'CASH', 'FPX', 'CARD'
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    selected_options JSONB DEFAULT '[]'::jsonb
);

-- 9. CUSTOMER FEEDBACKS TABLE (Real-Time Telegram/Staff Alert)
CREATE TABLE IF NOT EXISTS public.customer_feedbacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    order_id TEXT,                                 -- ID Pesanan Terlibat
    table_number TEXT NOT NULL,                    -- Nombor Meja Pelanggan
    customer_name TEXT DEFAULT 'Pelanggan',        -- Nama Pelanggan
    rating_status TEXT DEFAULT 'GOOD',             -- 'GOOD' (👍 PUAS HATI) atau 'BAD' (👎 KURANG PUAS)
    category TEXT DEFAULT 'Pujian',                -- 'Pujian', 'Aduan', 'Kritikan'
    comment TEXT NOT NULL,                         -- Komen Ulasan Pelanggan
    commented_items JSONB DEFAULT '[]'::jsonb,     -- Hidangan yang ditandakan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. LHDN MYINVOIS LOGS TABLE (Pelaporan E-Invois LHDN Malaysia)
CREATE TABLE IF NOT EXISTS public.lhdn_einvoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    invoice_uuid TEXT UNIQUE, -- Nombor Siri E-Invois Disahkan LHDN
    buyer_tin TEXT DEFAULT 'EI00000000010', -- General Public TIN
    buyer_name TEXT DEFAULT 'Pelanggan Awam',
    buyer_ic_pasport TEXT,
    buyer_phone TEXT,
    buyer_email TEXT,
    total_taxable_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_sst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_payable_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SUBMITTED', 'VALIDATED', 'CANCELLED'
    validation_qr_url TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- AUTOMATIC TENANT CREATION TRIGGER ON USER SIGNUP
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_tenant_id UUID;
    restaurant_name TEXT;
    restaurant_slug TEXT;
BEGIN
    restaurant_name := COALESCE(NEW.raw_user_meta_data->>'restaurant_name', 'Restoran ' || split_part(NEW.email, '@', 1));
    restaurant_slug := COALESCE(NEW.raw_user_meta_data->>'restaurant_slug', lower(regexp_replace(restaurant_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || floor(random()*8999 + 1000)::text);

    -- Insert new tenant
    INSERT INTO public.tenants (name, slug, owner_id, subscription_status, plan_type)
    VALUES (restaurant_name, restaurant_slug, NEW.id, 'trialing', 'starter')
    RETURNING id INTO new_tenant_id;

    -- Insert default settings for tenant
    INSERT INTO public.tenant_settings (tenant_id)
    VALUES (new_tenant_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ====================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lhdn_einvoices ENABLE ROW LEVEL SECURITY;

-- Public Read & Write Policies for Application Access
CREATE POLICY "Public read tenants" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "Public read tenant_settings" ON public.tenant_settings FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Public read items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Public read sessions" ON public.table_sessions FOR SELECT USING (true);
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert order items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Public insert feedbacks" ON public.customer_feedbacks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read lhdn_einvoices" ON public.lhdn_einvoices FOR SELECT USING (true);

-- Realtime Activation
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_feedbacks;
