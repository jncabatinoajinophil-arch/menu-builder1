require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, init, save, load } = require('./db');

const { JWT_SECRET, PORT = 5000, NODE_ENV, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!JWT_SECRET || !process.env.DATABASE_URL) { console.error('Set JWT_SECRET and DATABASE_URL in server/.env'); process.exit(1); }

const STATUS = ['draft', 'submitted', 'in_progress', 'completed', 'needs_changes'];
const TYPES = ['Price Change', 'Add New Item', 'Full Menu Revamp', 'Item Removal/Activation'];
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }), express.json({ limit: '5mb' }), cookieParser());

const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const login = (res, u) => res.cookie('t', jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' }),
  { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production', maxAge: 7 * 864e5 });
const auth = async (req, res, next) => {
  try {
    const { id } = jwt.verify(req.cookies.t, JWT_SECRET);
    const [u] = await q('SELECT id, name, email, role, active FROM users WHERE id=$1', [id]);
    if (!u || !u.active) throw new Error('inactive');
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));

// ---- auth ----
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.post('/api/auth/register', limiter, ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(email || '')) || String(password || '').length < 8)
    return res.status(400).json({ error: 'Name, a valid email and a password of 8+ characters are required' });
  try {
    const [u] = await q('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role',
      [String(name).trim(), String(email).trim().toLowerCase(), await bcrypt.hash(String(password), 10)]); // role defaults to "user"
    login(res, u); res.json(pub(u));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
}));
app.post('/api/auth/login', limiter, ah(async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const [u] = await q('SELECT * FROM users WHERE email=$1', [String(email).trim().toLowerCase()]);
  if (!u || !u.active || !(await bcrypt.compare(String(password), u.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  login(res, u); res.json(pub(u));
}));
app.post('/api/auth/logout', (req, res) => res.clearCookie('t').json({ ok: true }));
app.get('/api/auth/me', auth, (req, res) => res.json(pub(req.user)));

// ---- requests (owner, or admin) ----
const editable = (d) => ['draft', 'needs_changes'].includes(d.status);
const str = (v) => typeof v === 'string';
const okMenu = (cats) => Array.isArray(cats) && cats.every((c) => c && str(c.name) && c.name.length <= 60 && Array.isArray(c.products)
  && c.products.every((p) => p && str(p.name) && Array.isArray(p.mods)
    && p.mods.every((m) => m && str(m.name) && ['Required', 'Optional'].includes(m.req) && Array.isArray(m.opts)
      && m.opts.every((o) => o && str(o.n)))));
const clean = (b = {}) => ({
  vendor: String(b.vendor || '').trim(),
  types: (Array.isArray(b.types) ? b.types : []).filter((t) => TYPES.includes(t)),
  cats: b.cats,
});
const REQ_COLS = `r.id, r.vendor, r.types, r.status, r.admin_note AS "adminNote", r.updated_at::float8 AS "updatedAt"`;

const r = express.Router();
app.use('/api/requests', auth, r);
const own = ah(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const d = Number.isInteger(id) ? await load(id) : null;
  if (!d || (req.user.role !== 'admin' && d.owner !== req.user.id)) return res.status(404).json({ error: 'Not found' });
  req.doc = d; next();
});
const body = (req, res) => {
  const d = clean(req.body);
  if (!d.vendor) { res.status(400).json({ error: 'Vendor name is required' }); return null; }
  if (!okMenu(d.cats)) { res.status(400).json({ error: 'Invalid menu data' }); return null; }
  return d;
};
r.get('/', ah(async (req, res) => res.json(await q(`SELECT ${REQ_COLS} FROM requests r WHERE r.owner_id=$1 ORDER BY r.updated_at DESC`, [req.user.id]))));
r.post('/', ah(async (req, res) => {
  const d = body(req, res); if (!d) return;
  res.json(await load(await save(null, { ...d, owner: req.user.id })));
}));
r.get('/:id', own, (req, res) => res.json(req.doc));
r.put('/:id', own, ah(async (req, res) => {
  const d = body(req, res); if (!d) return;
  if (req.doc.owner === req.user.id && !editable(req.doc)) return res.status(409).json({ error: 'This request is locked after submission' });
  res.json(await load(await save(req.doc.id, d)));
}));
r.post('/:id/submit', own, ah(async (req, res) => {
  const d = req.doc;
  if (d.owner !== req.user.id || !editable(d)) return res.status(409).json({ error: 'This request cannot be submitted' });
  if (!d.cats.length) return res.status(400).json({ error: 'Add at least one category first' });
  await q("UPDATE requests SET status='submitted', submitted_at=$2, updated_at=$2 WHERE id=$1", [d.id, Date.now()]);
  res.json(await load(d.id));
}));
r.delete('/:id', own, ah(async (req, res) => {
  if (req.user.role !== 'admin' && !editable(req.doc)) return res.status(409).json({ error: 'Submitted requests cannot be deleted' });
  await q('DELETE FROM requests WHERE id=$1', [req.doc.id]); res.json({ ok: true });
}));

// ---- admin ----
const adminRows = (status, search, limit) => q(
  `SELECT ${REQ_COLS}, json_build_object('name', u.name, 'email', u.email) AS owner
   FROM requests r JOIN users u ON u.id = r.owner_id
   WHERE ($1 = '' OR r.status = $1) AND ($2 = '' OR r.vendor ILIKE '%' || $2 || '%')
   ORDER BY r.updated_at DESC LIMIT $3`,
  [STATUS.includes(status) ? status : '', String(search || '').replace(/[\\%_]/g, '\\$&'), limit]);

const a = express.Router();
app.use('/api/admin', auth, adminOnly, a);
a.get('/stats', ah(async (req, res) => {
  const [[{ n: users }], byStatus, byType, recent] = await Promise.all([
    q('SELECT count(*)::int AS n FROM users'),
    q('SELECT status AS k, count(*)::int AS n FROM requests GROUP BY status'),
    q('SELECT t AS k, count(*)::int AS n FROM requests, jsonb_array_elements_text(types) AS t GROUP BY t ORDER BY n DESC'),
    adminRows('', '', 5),
  ]);
  res.json({ users, byStatus, byType, recent });
}));
a.get('/requests', ah(async (req, res) => res.json(await adminRows(req.query.status, req.query.q, 200))));
a.patch('/requests/:id', ah(async (req, res) => {
  const { status, adminNote } = req.body || {};
  if (status !== undefined && !STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const rows = await q('UPDATE requests SET status=COALESCE($2,status), admin_note=COALESCE($3,admin_note), updated_at=$4 WHERE id=$1 RETURNING id',
    [parseInt(req.params.id, 10) || 0, status ?? null, adminNote === undefined ? null : String(adminNote).slice(0, 1000), Date.now()]);
  rows.length ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
a.get('/users', ah(async (req, res) => res.json(await q(
  `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at::float8 AS "createdAt",
          (SELECT count(*)::int FROM requests r WHERE r.owner_id = u.id) AS requests
   FROM users u ORDER BY u.created_at DESC`))));
a.patch('/users/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  if (id === req.user.id) return res.status(400).json({ error: "You can't change your own role or status" });
  const { role, active } = req.body || {};
  const rows = await q('UPDATE users SET role=COALESCE($2,role), active=COALESCE($3,active) WHERE id=$1 RETURNING id',
    [id, ['user', 'admin'].includes(role) ? role : null, typeof active === 'boolean' ? active : null]);
  rows.length ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
}));
a.delete('/users/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete yourself" });
  await q('DELETE FROM users WHERE id=$1', [id]); // their requests are removed by ON DELETE CASCADE
  res.json({ ok: true });
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- serve the built React app in production ----
const dist = path.join(__dirname, '../client/dist');
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (e) => e && next()));
app.use((e, req, res, next) => { console.error(e); res.status(500).json({ error: 'Server error' }); });

init().then(async () => {
  if (ADMIN_EMAIL && ADMIN_PASSWORD && !(await q("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).length) {
    await q("INSERT INTO users(name,email,password_hash,role) VALUES('Administrator',$1,$2,'admin') ON CONFLICT (email) DO UPDATE SET role='admin'",
      [ADMIN_EMAIL.trim().toLowerCase(), await bcrypt.hash(ADMIN_PASSWORD, 10)]);
    console.log('Created first admin:', ADMIN_EMAIL);
  }
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
}).catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
