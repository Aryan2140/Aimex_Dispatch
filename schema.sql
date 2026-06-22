-- PostgreSQL schema for Aimex Dispatch

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS dispatch_providers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  barcode TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES profiles(id),
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  dispatch_provider_id INTEGER REFERENCES dispatch_providers(id),
  tracking_number TEXT,
  carrier_status_text TEXT,
  label_photo_path TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS packaging_photos (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


INSERT INTO dispatch_providers (name, key, is_active, sort_order)
VALUES
  ('Australia Post', 'australia_post', true, 10),
  ('Couriers Please', 'couriers_please', true, 20),
  ('StarTrack', 'startrack', true, 30),
  ('DHL', 'dhl', true, 40),
  ('FedEx', 'fedex', true, 50),
  ('TNT', 'tnt', true, 60),
  ('Aramex', 'aramex', true, 70),
  ('Direct/Pickup', 'direct_pickup', true, 80)
ON CONFLICT (key) DO NOTHING;
