const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

// Tables are created automatically on startup.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  types JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','in_progress','completed','needs_changes')),
  admin_note TEXT NOT NULL DEFAULT '',
  submitted_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_owner_idx ON requests(owner_id);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  pos INT NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pos INT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  srp DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS modifiers (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pos INT NOT NULL,
  name TEXT NOT NULL,
  required TEXT NOT NULL,
  min_sel INT NOT NULL,
  max_sel INT NOT NULL
);
CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY,
  modifier_id INT NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  pos INT NOT NULL,
  name TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL DEFAULT 0
);`;

const init = () => pool.query(SCHEMA);

// save(id|null, {owner, vendor, types, cats}) -> request id;  load(id) -> request with nested menu
async function save(id, b) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const now = Date.now();
    if (id) {
      await c.query('UPDATE requests SET vendor=$1, types=$2, updated_at=$3 WHERE id=$4', [b.vendor, JSON.stringify(b.types), now, id]);
      await c.query('DELETE FROM categories WHERE request_id=$1', [id]);
    } else {
      id = (await c.query('INSERT INTO requests(vendor,types,created_at,updated_at,owner_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [b.vendor, JSON.stringify(b.types), now, now, b.owner])).rows[0].id;
    }
    // Insert level by level (one query per table) and map new ids back by position.
    const catId = {};
    (await c.query(
      'INSERT INTO categories(request_id,pos,name) SELECT $1,t.pos,t.name FROM unnest($2::int[],$3::text[]) AS t(pos,name) RETURNING id,pos',
      [id, b.cats.map((_, i) => i), b.cats.map((x) => x.name)])).rows.forEach((r) => (catId[r.pos] = r.id));

    const P = [];
    b.cats.forEach((cat, ci) => cat.products.forEach((p, pi) => P.push({ ci, pi, p })));
    const prodId = {};
    if (P.length) {
      (await c.query(
        `INSERT INTO products(category_id,pos,name,description,photo_url,srp)
         SELECT t.cid,t.pos,t.name,t.descr,t.url,t.srp FROM unnest($1::int[],$2::int[],$3::text[],$4::text[],$5::text[],$6::float8[]) AS t(cid,pos,name,descr,url,srp)
         RETURNING id,category_id,pos`,
        [P.map((x) => catId[x.ci]), P.map((x) => x.pi), P.map((x) => x.p.name), P.map((x) => x.p.desc || ''),
         P.map((x) => x.p.url || ''), P.map((x) => (x.p.srp === '' || x.p.srp == null ? null : +x.p.srp))]
      )).rows.forEach((r) => (prodId[r.category_id + ':' + r.pos] = r.id));
    }

    const M = [];
    P.forEach((x) => x.p.mods.forEach((m, mi) => M.push({ pid: prodId[catId[x.ci] + ':' + x.pi], mi, m })));
    const modId = {};
    if (M.length) {
      (await c.query(
        `INSERT INTO modifiers(product_id,pos,name,required,min_sel,max_sel)
         SELECT t.pid,t.pos,t.name,t.req,t.mn,t.mx FROM unnest($1::int[],$2::int[],$3::text[],$4::text[],$5::int[],$6::int[]) AS t(pid,pos,name,req,mn,mx)
         RETURNING id,product_id,pos`,
        [M.map((x) => x.pid), M.map((x) => x.mi), M.map((x) => x.m.name), M.map((x) => x.m.req),
         M.map((x) => +x.m.min), M.map((x) => +x.m.max)]
      )).rows.forEach((r) => (modId[r.product_id + ':' + r.pos] = r.id));
    }

    const O = [];
    M.forEach((x) => x.m.opts.forEach((o, oi) => O.push({ mid: modId[x.pid + ':' + x.mi], oi, o })));
    if (O.length) {
      await c.query(
        `INSERT INTO options(modifier_id,pos,name,price)
         SELECT t.mid,t.pos,t.name,t.price FROM unnest($1::int[],$2::int[],$3::text[],$4::float8[]) AS t(mid,pos,name,price)`,
        [O.map((x) => x.mid), O.map((x) => x.oi), O.map((x) => x.o.name ?? x.o.n),
         O.map((x) => (x.o.p === '' || x.o.p == null ? 0 : +x.o.p))]);
    }
    await c.query('COMMIT');
    return id;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function load(id) {
  const r = (await pool.query('SELECT * FROM requests WHERE id=$1', [id])).rows[0];
  if (!r) return null;
  const [cats, prods, mods, opts] = (await Promise.all([
    pool.query('SELECT * FROM categories WHERE request_id=$1 ORDER BY pos', [id]),
    pool.query('SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE c.request_id=$1 ORDER BY p.pos', [id]),
    pool.query('SELECT m.* FROM modifiers m JOIN products p ON p.id=m.product_id JOIN categories c ON c.id=p.category_id WHERE c.request_id=$1 ORDER BY m.pos', [id]),
    pool.query('SELECT o.* FROM options o JOIN modifiers m ON m.id=o.modifier_id JOIN products p ON p.id=m.product_id JOIN categories c ON c.id=p.category_id WHERE c.request_id=$1 ORDER BY o.pos', [id]),
  ])).map((x) => x.rows);
  const by = (rows, key) => rows.reduce((a, x) => ((a[x[key]] ||= []).push(x), a), {});
  const pByC = by(prods, 'category_id'), mByP = by(mods, 'product_id'), oByM = by(opts, 'modifier_id');
  return {
    id: r.id, owner: r.owner_id, status: r.status, adminNote: r.admin_note, vendor: r.vendor, types: r.types,
    cats: cats.map((c) => ({
      name: c.name,
      products: (pByC[c.id] || []).map((p) => ({
        name: p.name, desc: p.description, url: p.photo_url, srp: p.srp ?? '',
        mods: (mByP[p.id] || []).map((m) => ({
          name: m.name, req: m.required, min: m.min_sel, max: m.max_sel,
          opts: (oByM[m.id] || []).map((o) => ({ n: o.name, p: o.price })),
        })),
      })),
    })),
  };
}


module.exports = { pool, init, save, load };
