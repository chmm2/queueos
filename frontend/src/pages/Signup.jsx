import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import Toaster from '../components/Toaster';

/**
 * Self-serve organization signup — the front door. Creates the org + its first
 * admin and seeds an industry template so the account is usable immediately.
 */
const INDUSTRIES = [
  ['hospital', 'Hospital / Clinic'],
  ['bank', 'Bank'],
  ['restaurant', 'Restaurant / Food court'],
  ['government', 'Government office'],
  ['pharmacy', 'Pharmacy'],
  ['salon', 'Salon / Spa'],
  ['other', 'Something else'],
];

export default function Signup() {
  const [form, setForm] = useState({ orgName: '', industry: 'hospital', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const field = 'w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white text-sm text-ink-800 placeholder-ink-400 transition focus:border-brand-400';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/register-org', form);
      login(data);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ink-50">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-b from-brand-700 to-brand-900 text-white p-12">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center font-bold">Q</span>
          <span className="font-semibold text-lg">QueueOS</span>
        </div>
        <div>
          <h1 className="text-[2.1rem] leading-tight font-semibold mb-3 tracking-tight">Set up your queues<br />in minutes.</h1>
          <p className="text-brand-100/80 max-w-sm">Pick your industry and we'll seed a working setup — services, counters, and a scannable QR — instantly. No integration, no install.</p>
        </div>
        <p className="text-brand-100/50 text-sm">Trusted by teams in healthcare, banking, government &amp; retail</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-rise">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">Q</span>
            <span className="font-semibold text-lg text-ink-900">QueueOS</span>
          </div>

          <h2 className="text-2xl font-semibold text-ink-900 tracking-tight mb-1">Start your organization</h2>
          <p className="text-sm text-ink-500 mb-6">Free to set up. You'll be running queues in a couple of minutes.</p>

          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-ink-600">Organization name</span>
              <input required value={form.orgName} onChange={set('orgName')} className={field} placeholder="e.g. City Health Clinic" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-ink-600">Industry</span>
              <select value={form.industry} onChange={set('industry')} className={field}>
                {INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <span className="text-[13px] font-medium text-ink-600">Your name</span>
                <input required value={form.name} onChange={set('name')} className={field} />
              </div>
              <div className="grid gap-1.5">
                <span className="text-[13px] font-medium text-ink-600">Work email</span>
                <input type="email" required value={form.email} onChange={set('email')} className={field} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-ink-600">Password</span>
              <input type="password" required minLength={6} value={form.password} onChange={set('password')} className={field} placeholder="At least 6 characters" />
            </div>

            <button type="submit" disabled={busy} className="mt-2 w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium transition shadow-sm active:scale-[.99]">
              {busy ? 'Creating your workspace…' : 'Create organization'}
            </button>
          </form>

          <p className="text-sm text-ink-500 mt-6 text-center">
            Already have an account? <Link to="/login" className="text-brand-600 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
