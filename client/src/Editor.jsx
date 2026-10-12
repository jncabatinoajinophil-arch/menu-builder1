import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { mk, TYPES, validate, downloadXlsx } from './xlsx';
import { Badge } from './ui';

const blank = () => ({ vendor: '', types: ['Add New Item'], status: 'draft', cats: [mk.cat()] });

export default function Editor() {
  const { id } = useParams(), nav = useNavigate(), { user } = useAuth();
  const [r, setR] = useState(id === 'new' ? blank() : null), [msg, setMsg] = useState(''), [errs, setErrs] = useState([]);
  useEffect(() => {
    if (id === 'new') setR(blank()); else api('GET', '/requests/' + id).then(setR).catch((e) => setMsg(e.message));
  }, [id]);
  if (!r) return <p className="empty">{msg || 'Loading…'}</p>;

  const mine = !r.id || r.owner === user.id;
  const locked = !!r.id && mine && !['draft', 'needs_changes'].includes(r.status);
  const get = (p) => p.split('.').reduce((o, k) => o?.[k], r);
  const upd = (p, fn) => setR((o) => {
    const n = structuredClone(o), k = p.split('.'), l = k.pop();
    let t = n; for (const x of k) t = t[x];
    t[l] = fn(t[l]); return n;
  });
  const add = (p, kind) => upd(p, (a) => [...a, mk[kind]()]);
  const del = (p) => { const k = p.split('.'), i = +k.pop(); upd(k.join('.'), (a) => a.filter((_, x) => x !== i)); };
  const inp = (p, label, x = {}) => (
    <label>{label}<input value={get(p) ?? ''} {...x}
      onChange={(e) => upd(p, () => /\.(min|max)$/.test(p) && e.target.value !== '' ? +e.target.value : e.target.value)} /></label>
  );

  const body = () => ({ vendor: r.vendor, types: r.types, cats: r.cats });
  const persist = async () => (r.id ? api('PUT', '/requests/' + r.id, body()) : api('POST', '/requests', body()));
  const save = async () => {
    try { const n = await persist(); setMsg('Saved ✓'); r.id ? setR(n) : nav('/requests/' + n.id, { replace: true }); }
    catch (e) { setMsg(e.message); }
  };
  const check = () => { const e = validate(r); if (!r.vendor.trim()) e.unshift('Vendor name is required.'); setErrs(e); return !e.length; };
  const submit = async () => {
    if (!check()) return;
    try { const n = await persist(); await api('POST', `/requests/${n.id}/submit`); nav('/'); } catch (e) { setMsg(e.message); }
  };

  return (
    <>
      <div className="hd"><h1>{r.id ? 'Request' : 'New request'} {r.id && <Badge s={r.status} />}</h1></div>
      {r.adminNote && <div className="card note"><b>Admin note:</b> {r.adminNote}</div>}
      {locked && <div className="card">This request was submitted and is locked. You can still download it.</div>}
      <fieldset disabled={locked}>
        <div className="card">
          <label>Vendor name<input value={r.vendor} onChange={(e) => upd('vendor', () => e.target.value)} /></label>
          <label style={{ marginTop: 12 }}>Request type</label>
          <div className="types">{TYPES.map((t) => (
            <label key={t}><input type="checkbox" checked={r.types.includes(t)}
              onChange={(e) => upd('types', (a) => (e.target.checked ? [...a, t] : a.filter((x) => x !== t)))} />{t}</label>
          ))}</div>
        </div>
        {r.cats.map((c, ci) => { const cp = `cats.${ci}`; return (
          <section className="card" key={ci}>
            <div className="hd"><h3>Category {ci + 1}</h3><button className="x" onClick={() => del(cp)}>Remove</button></div>
            {inp(cp + '.name', 'Category name (max. 60 characters)', { maxLength: 60 })}
            {c.products.map((p, pi) => { const pp = `${cp}.products.${pi}`; return (
              <div className="prod" key={pi}>
                <div className="hd"><b>Product {pi + 1}</b><button className="x" onClick={() => del(pp)}>Remove</button></div>
                <div className="g">
                  {inp(pp + '.name', 'Product name')}{inp(pp + '.srp', 'SRP (₱)', { type: 'number', min: 0, step: '0.01' })}
                  {inp(pp + '.desc', 'Product description')}{inp(pp + '.url', 'Dish photo URL')}
                </div>
                {p.mods.map((m, mi) => { const mp = `${pp}.mods.${mi}`; return (
                  <div className="mod" key={mi}>
                    <div className="hd"><b>Modifier group</b><button className="x" onClick={() => del(mp)}>Remove</button></div>
                    <div className="g4">
                      {inp(mp + '.name', 'Modifier name')}
                      <label>Required / Optional<select value={m.req}
                        onChange={(e) => upd(mp, (o) => ({ ...o, req: e.target.value, min: e.target.value === 'Required' ? 1 : 0, max: 1 }))}>
                        <option>Required</option><option>Optional</option></select></label>
                      {inp(mp + '.min', 'Min', { type: 'number', min: 0 })}{inp(mp + '.max', 'Max', { type: 'number', min: 1 })}
                    </div>
                    {m.opts.map((o, oi) => (
                      <div className="g2" key={oi}>
                        {inp(`${mp}.opts.${oi}.n`, 'Option name')}{inp(`${mp}.opts.${oi}.p`, 'Price (₱)', { type: 'number', min: 0, step: '0.01' })}
                        <button className="x" onClick={() => del(`${mp}.opts.${oi}`)}>✕</button>
                      </div>
                    ))}
                    <button className="b2" onClick={() => add(mp + '.opts', 'opt')}>+ Add option</button>
                  </div>); })}
                <button className="b2" onClick={() => add(pp + '.mods', 'mod')}>+ Add modifier group</button>
              </div>); })}
            <button className="b2" onClick={() => add(cp + '.products', 'prod')}>+ Add product</button>
          </section>); })}
        <button className="b2" onClick={() => add('cats', 'cat')}>+ Add category</button>
      </fieldset>
      {errs.length > 0 && <div className="card err"><b>Please fix:</b><ul>{errs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      <div className="bar">
        <span>{msg}</span>
        <div>
          <button onClick={() => check() && downloadXlsx(r)}>Download .xlsx</button>
          {!locked && <button onClick={save}>Save draft</button>}
          {!locked && mine && <button className="b1" onClick={submit}>Submit for review</button>}
        </div>
      </div>
    </>
  );
}
