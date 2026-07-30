import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import Toaster from '../components/Toaster';

/**
 * Sign-in for administrators and counter staff. Customers never sign in —
 * they join a queue by scanning a QR code.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white text-sm text-ink-800 placeholder-ink-400 transition focus:border-brand-400';

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ink-50">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-b from-brand-700 to-brand-900 text-white p-12">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center font-bold">Q</span>
          <span className="font-semibold text-lg">QueueOS</span>
        </div>
        <div>
          <h1 className="text-[2.1rem] leading-tight font-semibold mb-3 tracking-tight">
            Run every queue,<br />across every branch.
          </h1>
          <p className="text-brand-100/80 max-w-sm">
            Departments, rooms and counters configured per location — each room with its own
            display and its own QR code.
          </p>
        </div>
        <p className="text-brand-100/50 text-sm">No app install for customers · real-time updates</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">Q</span>
            <span className="font-semibold text-lg text-ink-900">QueueOS</span>
          </div>

          <h2 className="text-2xl font-semibold text-ink-900 tracking-tight mb-1">Welcome back</h2>
          <p className="text-sm text-ink-500 mb-6">Sign in to your console.</p>

          <form onSubmit={signIn} className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium text-ink-600">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium text-ink-600">Password</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium transition shadow-sm active:scale-[.99]"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-ink-500 mt-6 text-center">
            New here? <Link to="/signup" className="text-brand-600 hover:underline font-medium">Start an organization</Link>
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
