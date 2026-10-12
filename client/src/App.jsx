import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { api } from './api';
import { AuthCtx, useAuth } from './auth';
import Auth from './Auth';
import Dashboard from './Dashboard';
import Editor from './Editor';
import { AdminHome, AdminRequests, AdminUsers } from './Admin';

const Guard = ({ admin, children }) => {
  const { user } = useAuth();
  return !user ? <Navigate to="/login" /> : admin && user.role !== 'admin' ? <Navigate to="/" /> : children;
};

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { api('GET', '/auth/me').then(setUser).catch(() => setUser(null)); }, []);
  if (user === undefined) return <p className="empty">Loading…</p>;
  const isAdmin = user?.role === 'admin', home = isAdmin ? '/admin' : '/';
  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      <BrowserRouter>
        {user && (
          <nav>
            <b>Menu Builder</b>
            {isAdmin ? <>
              <NavLink to="/admin" end>Overview</NavLink><NavLink to="/admin/requests">Requests</NavLink><NavLink to="/admin/users">Users</NavLink>
            </> : <>
              <NavLink to="/" end>My requests</NavLink><NavLink to="/requests/new">New request</NavLink>
            </>}
            <span className="sp" /><small>{user.name} · {user.role}</small>
            <button onClick={async () => { await api('POST', '/auth/logout'); setUser(null); }}>Log out</button>
          </nav>
        )}
        <main>
          <Routes>
            <Route path="/login" element={user ? <Navigate to={home} /> : <Auth />} />
            <Route path="/register" element={user ? <Navigate to={home} /> : <Auth register />} />
            <Route path="/" element={<Guard>{isAdmin ? <Navigate to="/admin" /> : <Dashboard />}</Guard>} />
            <Route path="/requests/:id" element={<Guard><Editor /></Guard>} />
            <Route path="/admin" element={<Guard admin><AdminHome /></Guard>} />
            <Route path="/admin/requests" element={<Guard admin><AdminRequests /></Guard>} />
            <Route path="/admin/users" element={<Guard admin><AdminUsers /></Guard>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
