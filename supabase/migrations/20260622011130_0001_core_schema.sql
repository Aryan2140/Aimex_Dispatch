/*
# Core schema (dispatch capture app)
Order: tables and indexes first; helper function + trigger + policies + seed last
so function bodies and policies can reference existing tables.
*/

-- =================== TABLES ===================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatch_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  key text NOT NULL UNIQUE,
  carrier_code text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  description text,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_address text NOT NULL,
  customer_phone text,
  customer_email text,
  dispatch_provider_id uuid REFERENCES dispatch_providers(id) ON DELETE SET NULL,
  tracking_number text,
  tracking_status jsonb,
  carrier_status_text text,
  label_photo_path text,
  notes text,
  status text NOT NULL DEFAULT 'captured' CHECK (status IN ('captured','packed','dispatched','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packaging_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);

-- =================== INDEXES ===================
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_dispatch_provider ON orders(dispatch_provider_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_packaging_photos_order_id ON packaging_photos(order_id);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- =================== HELPER FUNCTIONS ===================
CREATE OR REPLACE FUNCTION is_admin(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = uid AND p.role = 'admin');
$$;

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  first_user_is_admin boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO first_user_is_admin;
  INSERT INTO profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    CASE WHEN first_user_is_admin THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =================== RLS + POLICIES ===================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_photos ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR is_admin(auth.uid()));
DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self"
ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- dispatch_providers
DROP POLICY IF EXISTS "dispatch_providers_select_auth" ON dispatch_providers;
CREATE POLICY "dispatch_providers_select_auth"
ON dispatch_providers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "dispatch_providers_modify_admin" ON dispatch_providers;
CREATE POLICY "dispatch_providers_modify_admin"
ON dispatch_providers FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "dispatch_providers_update_admin" ON dispatch_providers;
CREATE POLICY "dispatch_providers_update_admin"
ON dispatch_providers FOR UPDATE TO authenticated
USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "dispatch_providers_delete_admin" ON dispatch_providers;
CREATE POLICY "dispatch_providers_delete_admin"
ON dispatch_providers FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- products
DROP POLICY IF EXISTS "products_select_auth" ON products;
CREATE POLICY "products_select_auth"
ON products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "products_insert_admin" ON products;
CREATE POLICY "products_insert_admin"
ON products FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "products_update_admin" ON products;
CREATE POLICY "products_update_admin"
ON products FOR UPDATE TO authenticated
USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "products_delete_admin" ON products;
CREATE POLICY "products_delete_admin"
ON products FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- orders
DROP POLICY IF EXISTS "orders_select_own" ON orders;
CREATE POLICY "orders_select_own"
ON orders FOR SELECT TO authenticated USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "orders_insert_own" ON orders;
CREATE POLICY "orders_insert_own"
ON orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "orders_update_own" ON orders;
CREATE POLICY "orders_update_own"
ON orders FOR UPDATE TO authenticated
USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "orders_delete_own" ON orders;
CREATE POLICY "orders_delete_own"
ON orders FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- order_items
DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
CREATE POLICY "order_items_select_own"
ON order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.created_by = auth.uid()));
DROP POLICY IF EXISTS "order_items_insert_own" ON order_items;
CREATE POLICY "order_items_insert_own"
ON order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.created_by = auth.uid()));
DROP POLICY IF EXISTS "order_items_update_own" ON order_items;
CREATE POLICY "order_items_update_own"
ON order_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.created_by = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.created_by = auth.uid()));
DROP POLICY IF EXISTS "order_items_delete_own" ON order_items;
CREATE POLICY "order_items_delete_own"
ON order_items FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.created_by = auth.uid()));

-- packaging_photos
DROP POLICY IF EXISTS "packaging_photos_select_own" ON packaging_photos;
CREATE POLICY "packaging_photos_select_own"
ON packaging_photos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = packaging_photos.order_id AND o.created_by = auth.uid()));
DROP POLICY IF EXISTS "packaging_photos_insert_own" ON packaging_photos;
CREATE POLICY "packaging_photos_insert_own"
ON packaging_photos FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = packaging_photos.order_id AND o.created_by = auth.uid()));
DROP POLICY IF EXISTS "packaging_photos_delete_own" ON packaging_photos;
CREATE POLICY "packaging_photos_delete_own"
ON packaging_photos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = packaging_photos.order_id AND o.created_by = auth.uid()));

-- =================== SEED ===================
INSERT INTO dispatch_providers (name, key, carrier_code, sort_order)
VALUES
  ('Australia Post','australia_post','AUSPOST',10),
  ('Couriers Please','couriers_please','CP',20),
  ('Toll','toll',NULL,30),
  ('StarTrack','startrack',NULL,40),
  ('Fastway / Aramex','fastway',NULL,50),
  ('DHL','dhl',NULL,60),
  ('FedEx','fedex',NULL,70),
  ('TNT','tnt',NULL,80),
  ('Other','other',NULL,90)
ON CONFLICT (key) DO NOTHING;

INSERT INTO products (sku, name, barcode)
VALUES
  ('SKU-001','Wireless Mouse',NULL),
  ('SKU-002','USB-C Cable 1m',NULL),
  ('SKU-003','Mechanical Keyboard',NULL)
ON CONFLICT (sku) DO NOTHING;
