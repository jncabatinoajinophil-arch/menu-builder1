import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Badge, LABEL, STATUSES, when } from './ui';

export default function Dashboard() {
  const [rows, setRows] = useState(null), [err, setErr] = useState('');
  const load = () => api('GET', '/requests').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const del = async (id) => {
    if (!confirm('Delete this request?')) return;
    try { await api('DELETE', '/requests/' + id); load(); } catch (e) { setErr(e.message); }
  };
  if (!rows) return <p className="empty">{err || 'Loading…'}</p>;
  const n = (s) => rows.filter((r) => r.status === s).length;
  return (
    <>
      <div className="hd"><h1>My requests</h1><Link to="/requests/new"><button className="b1">+ New request</button></Link></div>
      <div className="stats">{STATUSES.map((s) => <div className="card stat" key={s}><b>{n(s)}</b>{LABEL[s]}</div>)}</div>
      {err && <p className="err">{err}</p>}
      <div className="card sc"><table>
        <thead><tr><th>Vendor</th><th>Request type</th><th>Status</th><th>Updated</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.vendor}</td><td>{r.types.join(', ')}</td>
              <td><Badge s={r.status} />{r.adminNote && <small className="note"><br />{r.adminNote}</small>}</td>
              <td>{when(r.updatedAt)}</td>
              <td><Link to={'/requests/' + r.id}>Open</Link>
                {['draft', 'needs_changes'].includes(r.status) && <button className="x" onClick={() => del(r.id)}>Delete</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="5" className="empty">No requests yet. Create your first one.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
