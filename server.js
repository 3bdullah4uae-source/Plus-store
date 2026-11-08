import express from 'express';
import pg from 'pg';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scrypt = promisify(scryptCallback);
const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
if (!databaseUrl || !sessionSecret || sessionSecret.length < 32) {
  throw new Error('DATABASE_URL and SESSION_SECRET (32+ characters) are required');
}
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: true } : undefined
});
const isProduction = process.env.NODE_ENV === 'production';
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const allowed = process.env.PUBLIC_ORIGIN;
    if (!origin || !allowed || origin !== allowed) return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});
const limits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip + ':' + req.path;
  const state = limits.get(key) || { count: 0, reset: now + 60000 };
  if (now > state.reset) { state.count = 0; state.reset = now + 60000; }
  state.count++;
  limits.set(key, state);
  if (state.count > 12) return res.status(429).json({ error: 'Too many attempts' });
  next();
}
setInterval(() => { const now = Date.now(); for (const [key, val] of limits) if (now > val.reset) limits.delete(key); }, 120000).unref();
const idHash = token => createHash('sha256').update(token + sessionSecret).digest('hex');
const parseCookie = (cookie, key) => (cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(key + '='))?.slice(key.length + 1);
const cookieFlags = 'HttpOnly; SameSite=Strict; Path=/api; ' + (isProduction ? 'Secure; ' : '') + 'Max-Age=604800';
const clearFlags = 'HttpOnly; SameSite=Strict; Path=/api; ' + (isProduction ? 'Secure; ' : '') + 'Max-Age=0';
const goodEmail = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
async function hashPassword(p) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(p, salt, 64);
  return salt + ':' + derived.toString('hex');
}
async function verifyPassword(p, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex || hex.length !== 128) return false;
  const actual = await scrypt(p, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return timingSafeEqual(actual, expected);
}
async function makeSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval \'7 days\')', [idHash(token), userId]);
  res.setHeader('Set-Cookie', 'plus_session=' + token + '; ' + cookieFlags);
}
async function auth(req, res, next) {
  try {
    const token = parseCookie(req.headers.cookie, 'plus_session');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Login required' });
    const result = await pool.query(
      'SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [idHash(token)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired' });
    req.user = result.rows[0];
    next();
  } catch (err) { next(err); }
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Forbidden' });
// Serve only specifically named HTML pages. Do not expose source code or database files.
const root = dirname(fileURLToPath(import.meta.url));
for (const [route, filename] of [['/', 'index.html'], ['/account', 'account.html'], ['/demo', 'app.html']]) {
  app.get(route, async (_req, res, next) => {
    try {
      res.type('html').send(await readFile(join(root, filename), 'utf8'));
    } catch (err) { next(err); }
  });
}
app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected', payments: false, signing: false }); } catch { res.status(503).json({ status: 'unavailable', database: 'disconnected', payments: false, signing: false }); } });
app.post('/api/register', rateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!goodEmail(email) || typeof password !== 'string' || password.length < 12 || password.length > 128)
      return res.status(400).json({ error: 'Valid email and 12–128 character password required' });
    const hash = await hashPassword(password);
    const row = await pool.query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,\'customer\') ON CONFLICT(email) DO NOTHING RETURNING id', [email, hash]);
    if (!row.rowCount) return res.status(409).json({ error: 'Account unavailable' });
    await makeSession(res, row.rows[0].id);
    res.status(201).json({ registered: true, email });
  } catch (err) { next(err); }
});
app.post('/api/login', rateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!goodEmail(email) || typeof password !== 'string') return res.status(401).json({ error: 'Invalid login' });
    const result = await pool.query('SELECT id,password_hash FROM users WHERE email=$1', [email]);
    if (!result.rowCount || !(await verifyPassword(password, result.rows[0].password_hash)))
      return res.status(401).json({ error: 'Invalid login' });
    await makeSession(res, result.rows[0].id);
    res.json({ authenticated: true });
  } catch (err) { next(err); }
});
app.post('/api/logout', auth, async (req, res, next) => {
  try {
    const token = parseCookie(req.headers.cookie, 'plus_session');
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [idHash(token)]);
    res.setHeader('Set-Cookie', 'plus_session=; ' + clearFlags);
    res.json({ authenticated: false });
  } catch (err) { next(err); }
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));
app.get('/api/catalog', async (_req, res, next) => {
  try {
    const data = await pool.query('SELECT id,slug,name_ar,description_ar,category FROM catalog_items WHERE is_published=true ORDER BY created_at DESC LIMIT 100');
    res.json({ items: data.rows });
  } catch (err) { next(err); }
});
app.get('/api/plans', async (_req, res, next) => {
  try {
    const data = await pool.query('SELECT id,code,name_ar,duration_days,price_fils,currency FROM plans WHERE is_active=true ORDER BY price_fils NULLS LAST LIMIT 50');
    res.json({ plans: data.rows });
  } catch (err) { next(err); }
});
app.post('/api/orders', auth, async (req, res, next) => {
  try {
    const { itemId, planId = null } = req.body || {};
    if (typeof itemId !== 'string' || (planId !== null && typeof planId !== 'string'))
      return res.status(400).json({ error: 'Invalid item or plan' });
    const item = await pool.query('SELECT id FROM catalog_items WHERE id=$1 AND is_published=true', [itemId]);
    if (!item.rowCount) return res.status(404).json({ error: 'Service unavailable' });
    if (planId) {
      const plan = await pool.query('SELECT id FROM plans WHERE id=$1 AND is_active=true', [planId]);
      if (!plan.rowCount) return res.status(400).json({ error: 'Plan unavailable' });
    }
    const created = await pool.query('INSERT INTO orders(customer_id,item_id,plan_id,status) VALUES($1,$2,$3,\'draft\') RETURNING id,status,created_at', [req.user.id,itemId,planId]);
    res.status(201).json({ order: created.rows[0], paymentEnabled: false });
  } catch (err) { next(err); }
});
app.get('/api/orders', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT o.id,o.status,o.created_at,c.name_ar AS service FROM orders o JOIN catalog_items c ON c.id=o.item_id WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 100', [req.user.id]);
    res.json({ orders: result.rows });
  } catch (err) { next(err); }
});
app.get('/api/admin/orders', auth, adminOnly, async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT o.id,o.status,o.created_at,c.name_ar AS service,u.email FROM orders o JOIN catalog_items c ON c.id=o.item_id JOIN users u ON u.id=o.customer_id ORDER BY o.created_at DESC LIMIT 100');
    res.json({ orders: result.rows });
  } catch (err) { next(err); }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, _req, res, _next) => {
  console.error('API error:', err.code || err.name);
  res.status(500).json({ error: 'Server error' });
});
const server = app.listen(port, () => console.log('Plus Store API listening on port', port));
function shutdown() { server.close(() => pool.end().finally(() => process.exit(0))); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
