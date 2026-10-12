import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { Badge, LABEL, STATUSES, when } from './ui';
import { downloadXlsx } from './xlsx';

const useLoad = (url) => {
  const [d, setD] = useState(null), [err, setErr] = useState('');
  const load = () => api('GET', url).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [url]);
  return [d, load, err];
};
const fail = (e) => alert(e.message);

export function AdminHome() {
  const [s, , err] = useLoad('/admin/stats');
  if (!s) return <p className="empty">{err || 'Loading…'}</p>;
  const n = (k) => s.byStatus.find((x) => x.k === k)?.n || 0, total = s.byStatus.reduce((a, x) => a + x.n, 0);
  return (
    <>
      <h1>Admin overview</h1>
      <div className="stats">
        <div className="card stat"><b>{s.users}</b>Users</div><div className="card stat"><b>{total}</b>Requests</div>
        {STATUSES.map((k) => <div className="card stat" key={k}><b>{n(k)}</b>{LABEL[k]}</div>)}
      </div>
      <div className="card"><h3>Requests by type</h3>
        {s.byType.map((t) => <div className="row" key={t.k}><span>{t.k}</span><b>{t.n}</b></div>)}
        {!s.byType.length && <p className="empty">No data yet.</p>}</div>
      <div className="card sc"><div className="hd"><h3>Recently updated</h3><Link to="/admin/requests">View all</Link></div>
        <table><thead><tr><th>Vendor</th><th>User</th><th>Status</th><th>Updated</th></tr></thead><tbody>
          {s.recent.map((r) => <tr key={r.id}><td><Link to={'/requests/' + r.id}>{r.vendor}</Link></td><td>{r.owner?.name}</td><td><Badge s={r.status} /></td><td>{when(r.updatedAt)}</td></tr>)}
        </tbody></table></div>
    </>
  );
}

export function AdminRequests() {
  const [status, setStatus] = useState(''), [q, setQ] = useState('');
  const [rows, load, err] = useLoad(`/admin/requests?status=${status}&q=${encodeURIComponent(q)}`);
  const patch = async (id, b) => { try { await api('PATCH', '/admin/requests/' + id, b); load(); } catch (e) { fail(e); } };
  const dl = async (id) => { try { await downloadXlsx(await api('GET', '/requests/' + id)); } catch (e) { fail(e); } };
  const del = async (id) => { if (confirm('Delete this request permanently?')) { try { await api('DELETE', '/requests/' + id); load(); } catch (e) { fail(e); } } };
  return (
    <>
      <h1>All requests</h1>
      <div className="card g">
        <label>Search vendor<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Mitsuyado" /></label>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="card sc"><table>
        <thead><tr><th>Vendor</th><th>User</th><th>Type</th><th>Status</th><th>Note to user</th><th>Updated</th><th /></tr></thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={`${r.id}-${r.updatedAt}`}>
              <td><Link to={'/requests/' + r.id}>{r.vendor}</Link></td>
              <td>{r.owner?.name}<br /><small className="note">{r.owner?.email}</small></td>
              <td>{r.types.join(', ')}</td>
              <td><select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></td>
              <td><input defaultValue={r.adminNote} placeholder="Optional note"
                onBlur={(e) => e.target.value !== (r.adminNote || '') && patch(r.id, { adminNote: e.target.value })} /></td>
              <td>{when(r.updatedAt)}</td>
              <td><button onClick={() => dl(r.id)}>.xlsx</button><button className="x" onClick={() => del(r.id)}>Delete</button></td>
            </tr>
          ))}
          {rows && !rows.length && <tr><td colSpan="7" className="empty">No requests match.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

export function AdminUsers() {
  const [rows, load, err] = useLoad('/admin/users'), { user } = useAuth();
  const patch = async (id, b) => { try { await api('PATCH', '/admin/users/' + id, b); load(); } catch (e) { fail(e); } };
  const del = async (u) => { if (confirm(`Delete ${u.email} and all of their requests?`)) { try { await api('DELETE', '/admin/users/' + u.id); load(); } catch (e) { fail(e); } } };
  return (
    <>
      <h1>Users</h1>{err && <p className="err">{err}</p>}
      <div className="card sc"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Requests</th><th>Joined</th><th /></tr></thead>
        <tbody>
          {(rows || []).map((u) => { const self = u.id === user.id; return (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td>
              <td><select value={u.role} disabled={self} onChange={(e) => patch(u.id, { role: e.target.value })}><option>user</option><option>admin</option></select></td>
              <td><input type="checkbox" checked={u.active} disabled={self} onChange={(e) => patch(u.id, { active: e.target.checked })} /></td>
              <td>{u.requests}</td><td>{when(u.createdAt)}</td>
              <td>{!self && <button className="x" onClick={() => del(u)}>Delete</button>}</td>
            </tr>); })}
        </tbody>
      </table></div>
    </>
  );
}
