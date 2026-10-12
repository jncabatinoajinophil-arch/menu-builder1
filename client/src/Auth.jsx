import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';

export default function Auth({ register }) {
  const { setUser } = useAuth();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); setErr('');
    try { setUser(await api('POST', register ? '/auth/register' : '/auth/login', f)); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card auth" onSubmit={go}>
      <h2>{register ? 'Create account' : 'Log in'}</h2>
      {register && <label>Name<input value={f.name} onChange={set('name')} required /></label>}
      <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
      <label>Password{register && ' (8+ characters)'}<input type="password" value={f.password} onChange={set('password')} required minLength={register ? 8 : undefined} /></label>
      {err && <p className="err">{err}</p>}
      <button className="b1">{register ? 'Sign up' : 'Log in'}</button>
      <p>{register ? <>Have an account? <Link to="/login">Log in</Link></> : <>No account? <Link to="/register">Register</Link></>}</p>
    </form>
  );
}
