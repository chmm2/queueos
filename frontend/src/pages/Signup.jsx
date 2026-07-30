import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import Toaster from '../components/Toaster';
import Logo from '../components/Logo';
import { btn, field, MicroLabel } from '../components/ui';

/**
 * Self-serve organization signup — the front door. Creates the org plus its
 * first administrator, and seeds an industry template (branch, departments,
 * rooms and counter logins) so it's usable immediately.
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

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/register-org', form);
      login(data);
      navigate('/branches');
    } catch (err) {
      toast.error(
        err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Sign up failed'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-6 py-14 bg-paper">
      <div className="absolute inset-0 paper-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(60% 55% at 50% 40%, #FFFDF8, transparent 70%)' }}
      />

      <div className="relative w-full max-w-[520px] animate-rise">
        <div className="flex flex-col items-center gap-3.5 mb-7">
          <div className="flex items-center gap-3">
            <Logo size="login" />
            <div>
              <div className="text-2xl font-bold tracking-[-.03em] text-ink">QueueOS</div>
              <div className="font-mono text-[10px] tracking-[.2em] uppercase text-muted-2">
                the line, run properly
              </div>
            </div>
          </div>
        </div>

        <h1 className="text-[38px] leading-[1.08] font-bold tracking-[-.035em] text-ink text-center mb-3">
          Open the doors.
        </h1>
        <p className="text-[16px] text-muted text-center mb-8 max-w-md mx-auto">
          Pick your industry and we'll set up a working branch — departments, rooms and counter
          logins — before you finish your coffee.
        </p>

        <form onSubmit={submit} className="bg-surface border border-line rounded-[22px] shadow-login p-7 grid gap-4">
          <label className="grid gap-2">
            <MicroLabel>Organization name</MicroLabel>
            <input required value={form.orgName} onChange={set('orgName')} className={field} placeholder="City Health Clinic" />
          </label>
          <label className="grid gap-2">
            <MicroLabel>Industry</MicroLabel>
            <select value={form.industry} onChange={set('industry')} className={field}>
              {INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="grid gap-2">
              <MicroLabel>Your name</MicroLabel>
              <input required value={form.name} onChange={set('name')} className={field} />
            </label>
            <label className="grid gap-2">
              <MicroLabel>Work email</MicroLabel>
              <input type="email" required value={form.email} onChange={set('email')} className={field} />
            </label>
          </div>
          <label className="grid gap-2">
            <MicroLabel>Password</MicroLabel>
            <input type="password" required minLength={6} value={form.password} onChange={set('password')}
              className={field} placeholder="At least 6 characters" />
          </label>

          <button type="submit" disabled={busy} className={`${btn.primary} w-full py-3.5 mt-1`}>
            {busy ? 'Setting up your branch…' : 'Create organization →'}
          </button>

          <p className="text-center text-[14px] text-muted-2 mt-1">
            Already have an account?{' '}
            <Link to="/login" className="text-espresso hover:text-clay">Sign in</Link>
          </p>
        </form>
      </div>
      <Toaster />
    </div>
  );
}
