import express from 'express';
import session from 'express-session';
import cors from 'cors';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
dotenv.config({ path: path.resolve(rootDir, '.env') });

const PORT = Number(process.env.PORT ?? 3001);
const uploadPath = path.resolve(rootDir, process.env.UPLOAD_PATH || 'uploads');
fs.mkdirSync(uploadPath, { recursive: true });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME || 'aimex_dispatch',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: false,
  },
}));
app.use('/uploads', express.static(uploadPath));

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

async function getProfileById(userId) {
  const result = await pool.query('SELECT id, email, display_name, role FROM profiles WHERE id = $1', [userId]);
  return result.rows[0] ?? null;
}

app.get('/api/auth/me', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ message: 'Not signed in' });
  const profile = await getProfileById(req.session.userId);
  if (!profile) return res.status(401).json({ message: 'Not signed in' });
  res.json(profile);
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const result = await pool.query('SELECT id, email, password_hash, role, display_name FROM profiles WHERE email = $1', [email.toLowerCase().trim()]);
  const profile = result.rows[0];
  if (!profile) return res.status(400).json({ message: 'Invalid email or password' });
  const match = await bcrypt.compare(password, profile.password_hash);
  if (!match) return res.status(400).json({ message: 'Invalid email or password' });
  req.session.userId = profile.id;
  req.session.email = profile.email;
  res.json({});
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await pool.query('SELECT id FROM profiles WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    return res.status(400).json({ message: 'That email is already registered. Sign in instead.' });
  }
  const roleResult = await pool.query('SELECT COUNT(*)::int AS count FROM profiles');
  const role = roleResult.rows[0]?.count === 0 ? 'admin' : 'user';
  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    'INSERT INTO profiles (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, display_name, role',
    [normalizedEmail, passwordHash, role],
  );
  const profile = inserted.rows[0];
  req.session.userId = profile.id;
  req.session.email = profile.email;
  res.json({});
});

app.post('/api/auth/signout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Unable to sign out' });
    }
    res.json({});
  });
});

app.get('/api/providers', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM dispatch_providers ORDER BY sort_order');
  res.json(result.rows);
});

app.get('/api/products', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let result;
  if (q) {
    const search = `%${q}%`;
    result = await pool.query(
      'SELECT * FROM products WHERE name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1 ORDER BY name LIMIT 500',
      [search],
    );
  } else {
    result = await pool.query('SELECT * FROM products ORDER BY name LIMIT 500');
  }
  res.json(result.rows);
});

app.post('/api/products', async (req, res) => {
  const { name, sku, barcode, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Product name is required' });
  const result = await pool.query(
    'INSERT INTO products (name, sku, barcode, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [name.trim(), sku || null, barcode || null, description || null],
  );
  res.json(result.rows[0]);
});

app.patch('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);
  const { name, sku, barcode, description } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = $' + (values.length + 1)); values.push(name.trim()); }
  if (sku !== undefined) { fields.push('sku = $' + (values.length + 1)); values.push(sku || null); }
  if (barcode !== undefined) { fields.push('barcode = $' + (values.length + 1)); values.push(barcode || null); }
  if (description !== undefined) { fields.push('description = $' + (values.length + 1)); values.push(description || null); }
  if (!fields.length) return res.status(400).json({ message: 'No product fields to update' });
  values.push(productId);
  const result = await pool.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  res.json(result.rows[0]);
});

app.delete('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);
  await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  res.status(204).send();
});

app.get('/api/orders', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const params = [];
  let filter = '';
  if (q) {
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    filter = 'WHERE o.customer_name ILIKE $1 OR o.tracking_number ILIKE $2 OR o.customer_address ILIKE $3';
  }
  const query = `SELECT o.*, p.id AS provider_id, p.name AS provider_name, p.key AS provider_key, p.carrier_code, p.is_active, p.sort_order,
    COALESCE(json_agg(json_build_object('id', i.id, 'order_id', i.order_id, 'product_id', i.product_id, 'name', i.name, 'sku', i.sku, 'quantity', i.quantity)) FILTER (WHERE i.id IS NOT NULL), '[]') AS order_items
    FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id
    LEFT JOIN dispatch_providers p ON p.id = o.dispatch_provider_id
    ${filter}
    GROUP BY o.id, p.id, p.name, p.key, p.carrier_code, p.is_active, p.sort_order
    ORDER BY o.created_at DESC
    LIMIT 100`;
  const result = await pool.query(query, params);
  const rows = result.rows.map((row) => ({
    ...row,
    dispatch_provider: row.provider_id ? {
      id: row.provider_id,
      name: row.provider_name,
      key: row.provider_key,
      carrier_code: row.carrier_code,
      is_active: row.is_active,
      sort_order: row.sort_order,
    } : null,
  }));
  res.json(rows);
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  const query = `SELECT o.*, p.id AS provider_id, p.name AS provider_name, p.key AS provider_key, p.carrier_code, p.is_active, p.sort_order,
    COALESCE(json_agg(json_build_object('id', i.id, 'order_id', i.order_id, 'product_id', i.product_id, 'name', i.name, 'sku', i.sku, 'quantity', i.quantity)) FILTER (WHERE i.id IS NOT NULL), '[]') AS order_items
    FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id
    LEFT JOIN dispatch_providers p ON p.id = o.dispatch_provider_id
    WHERE o.id = $1
    GROUP BY o.id, p.id, p.name, p.key, p.carrier_code, p.is_active, p.sort_order`;
  const result = await pool.query(query, [orderId]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ message: 'Order not found' });
  res.json({
    ...row,
    dispatch_provider: row.provider_id ? {
      id: row.provider_id,
      name: row.provider_name,
      key: row.provider_key,
      carrier_code: row.carrier_code,
      is_active: row.is_active,
      sort_order: row.sort_order,
    } : null,
  });
});

app.post('/api/orders', requireAuth, async (req, res) => {
  const {
    customer_name,
    customer_address,
    customer_phone,
    customer_email,
    dispatch_provider_id,
    tracking_number,
    carrier_status_text,
    label_photo_path,
    notes,
    status,
    order_items,
  } = req.body;
  if (!customer_name || !customer_address) {
    return res.status(400).json({ message: 'Customer name and address are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `INSERT INTO orders (created_by, customer_name, customer_address, customer_phone, customer_email, dispatch_provider_id, tracking_number, carrier_status_text, label_photo_path, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [req.session.userId, customer_name.trim(), customer_address.trim(), customer_phone || null, customer_email || null, dispatch_provider_id || null, tracking_number || null, carrier_status_text || null, label_photo_path || null, notes || null, status || 'captured'],
    );
    const order = orderResult.rows[0];
    const items = Array.isArray(order_items) ? order_items : [];
    const insertedItems = [];
    for (const item of items) {
      if (!item.name || !item.quantity) continue;
      const productId = item.product_id ? Number(item.product_id) : null;
      const result = await client.query(
        'INSERT INTO order_items (order_id, product_id, name, sku, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [order.id, productId, item.name.trim(), item.sku || null, item.quantity],
      );
      insertedItems.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ ...order, order_items: insertedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Unable to create order' });
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  const allowedFields = [
    'customer_name',
    'customer_address',
    'customer_phone',
    'customer_email',
    'dispatch_provider_id',
    'tracking_number',
    'carrier_status_text',
    'label_photo_path',
    'notes',
    'status',
  ];
  const fields = [];
  const values = [];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      fields.push(`${field} = $${values.length + 1}`);
      values.push(req.body[field]);
    }
  });
  if (!fields.length) return res.status(400).json({ message: 'No updates provided' });
  values.push(orderId);
  const result = await pool.query(
    `UPDATE orders SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  res.json(result.rows[0]);
});

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadPath,
    filename(req, file, cb) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`);
    },
  }),
});

app.post('/api/photos/label', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });
  res.json({ path: req.file.filename });
});

app.post('/api/photos/packaging/:orderId', requireAuth, upload.single('photo'), async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });
  const result = await pool.query(
    'INSERT INTO packaging_photos (order_id, storage_path) VALUES ($1, $2) RETURNING *',
    [orderId, req.file.filename],
  );
  res.json(result.rows[0]);
});

app.get('/api/photos/packaging/:orderId', requireAuth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const result = await pool.query(
    'SELECT * FROM packaging_photos WHERE order_id = $1 ORDER BY taken_at ASC',
    [orderId],
  );
  res.json(result.rows);
});

app.delete('/api/photos/packaging/:photoId', requireAuth, async (req, res) => {
  const photoId = Number(req.params.photoId);
  const photoResult = await pool.query('SELECT storage_path FROM packaging_photos WHERE id = $1', [photoId]);
  const photo = photoResult.rows[0];
  if (!photo) return res.status(404).json({ message: 'Photo not found' });
  const filePath = path.join(uploadPath, photo.storage_path);
  await pool.query('DELETE FROM packaging_photos WHERE id = $1', [photoId]);
  fs.unlink(filePath, () => {});
  res.status(204).send();
});

app.post('/api/carrier-track', requireAuth, (req, res) => {
  const { carrier, trackingNumber } = req.body;
  if (!carrier || !trackingNumber) {
    return res.status(400).json({ message: 'Carrier and tracking number are required' });
  }
  res.json({
    carrier,
    trackingNumber,
    status: null,
    events: [],
    note: 'Carrier tracking is not configured on this local server.',
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
