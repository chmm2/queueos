import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import Toaster from '../components/Toaster';
import Logo from '../components/Logo';
import { btn, field, MicroLabel, Sparkline } from '../components/ui';

/**
 * Sign-in for two kinds of account: an administrator, or a counter signing in
 * as itself (the machine at a desk). Customers never sign in — they scan a QR.
 *
 * The decorative floaters are anchored to the centred card so they never
 * collide with it, and hide below 1180px.
 */
const HEADLINES = [
  'Take the desk.',
  'The line moves again.',
  'Nobody likes waiting. Fix the waiting.',
  'Ten counters. One console.',
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % HEADLINES.length), 4200);
    return () => clearInterval(id);
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data);
      navigate(data.principal === 'counter' ? '/counter' : '/branches');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-6 py-14 bg-paper">
      {/* Background: 72px grid + a soft radial wash */}
      <div className="absolute inset-0 paper-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(60% 55% at 50% 42%, #FFFDF8, transparent 70%)' }}
      />

      <Floaters />

      <div className="relative w-full max-w-[460px] animate-rise">
        {/* Brand */}
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

        {/* Rotating headline */}
        <h1
          key={line}
          className="text-[38px] leading-[1.08] font-bold tracking-[-.035em] text-ink text-center mb-8 animate-rise-fast min-h-[2.2em] flex items-center justify-center"
        >
          {HEADLINES[line]}
        </h1>

        <form
          onSubmit={signIn}
          className="bg-surface border border-line rounded-[22px] shadow-login p-7 grid gap-4"
        >
          <label className="grid gap-2">
            <MicroLabel>Email</MicroLabel>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
              placeholder="you@clinic.com"
            />
          </label>
          <label className="grid gap-2">
            <MicroLabel>Password</MicroLabel>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              placeholder="••••••••"
            />
          </label>

          <button type="submit" disabled={busy} className={`${btn.primary} w-full py-3.5 mt-1`}>
            {busy ? 'Opening…' : 'Open the console →'}
          </button>

          <p className="text-center text-[14px] text-muted-2 mt-1">
            First time here?{' '}
            <Link to="/signup" className="text-espresso hover:text-clay">
              Start an organization
            </Link>
          </p>
        </form>

        <p className="font-mono text-[11px] text-muted-3 text-center mt-7 tracking-wide">
          1,284 tokens today · 4 branches live · no app installs
        </p>
      </div>
      <Toaster />
    </div>
  );
}

/** Decorative cards anchored to the centred column; hidden under 1180px. */
function Floaters() {
  const wrap =
    'hidden xl:block absolute z-0 pointer-events-none animate-floaty bg-surface border border-line rounded-[18px] shadow-card p-5';
  return (
    <>
      <div className={wrap} style={{ right: 'calc(50% + 265px)', top: '20%' }}>
        <MicroLabel>Now serving</MicroLabel>
        <p className="font-mono text-[34px] leading-none font-semibold text-espresso mt-2 tnum">
          B-042
        </p>
        <p className="text-[13px] text-muted-2 mt-2">Billing Desk · Counter 1</p>
      </div>

      <div
        className={wrap}
        style={{ left: 'calc(50% + 265px)', top: '26%', animationDelay: '-3s', width: 210 }}
      >
        <MicroLabel>Avg wait today</MicroLabel>
        <p className="text-[26px] leading-none font-bold tracking-[-.03em] text-ink mt-2">
          4m 12s <span className="font-mono text-xs text-success align-middle">▼38%</span>
        </p>
        <div className="mt-3">
          <Sparkline values={[6, 9, 7, 12, 10, 14, 11, 9, 13, 8, 10, 7, 5, 4]} height={26} />
        </div>
      </div>

      <div
        className="hidden xl:block absolute z-0 pointer-events-none animate-floaty bg-espresso border border-espresso rounded-[18px] shadow-card p-5"
        style={{ right: 'calc(50% + 285px)', bottom: '18%', animationDelay: '-6s' }}
      >
        <p className="font-mono text-[10px] tracking-[.18em] uppercase text-paper/50">Queue joined</p>
        <p className="font-mono text-[19px] text-paper mt-2 tnum">C-118 · ~9m</p>
      </div>

      <div
        className="hidden xl:flex absolute z-0 pointer-events-none animate-floaty items-center gap-2.5 bg-surface border border-line rounded-pill shadow-card px-4 py-2.5"
        style={{ left: 'calc(50% + 285px)', bottom: '20%', animationDelay: '-9s' }}
      >
        <span className="w-2 h-2 rounded-full bg-clay animate-blink" />
        <span className="text-[13px] font-semibold text-ink-2">Counter 3 just opened</span>
      </div>
    </>
  );
}
