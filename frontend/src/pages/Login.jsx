import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import Toaster from '../components/Toaster';

/**
 * Sign-in for staff/operators/admins. Includes one-tap demo logins so anyone
 * can get into each role instantly without remembering credentials.
 */
const DEMO = [
  { role: 'Admin', email: 'admin@queue.com', blurb: 'Full setup + analytics' },
  { role: 'Operator', email: 'operator@queue.com', blurb: 'Counters + staff' },
  { role: 'Staff', email: 'staff@queue.com', blurb: 'Call next token' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function signIn(e, creds) {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', creds || { email, password });
      login(data);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition';

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-700 text-white p-12">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center font-bold">Q</span>
          <span className="font-semibold text-lg">QueueOS</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight mb-3">Run any queue,<br />in minutes.</h1>
          <p className="text-brand-100/80 max-w-sm">One platform for hospitals, banks, restaurants, and government offices — customers scan a QR, you call them from here.</p>
        </div>
        <p className="text-brand-100/50 text-sm">No app install for customers · real-time updates</p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <span className="w-8 h-8 rounded-lg bg-brand-500 text-white grid place-items-center font-bold">Q</span>
            <span className="font-semibold text-lg text-gray-800">QueueOS</span>
          </div>

          <h2 className="text-2xl font-semibold text-gray-800 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-6">Sign in to your console.</p>

          <form onSubmit={(e) => signIn(e)} className="space-y-3">
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            <button type="submit" disabled={busy} className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white py-2.5 rounded-lg font-medium transition">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* One-tap demo access */}
          <div className="mt-7">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Try the demo</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="space-y-2">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  onClick={() => signIn(null, { email: d.email, password: 'password123' })}
                  disabled={busy}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition text-left disabled:opacity-60"
                >
                  <span>
                    <span className="font-medium text-gray-800">{d.role}</span>
                    <span className="text-gray-400 text-sm"> · {d.blurb}</span>
                  </span>
                  <span className="text-brand-600 text-sm">Enter →</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-500 mt-6 text-center">
            New here? <Link to="/signup" className="text-brand-600 hover:underline font-medium">Start an organization</Link>
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
