import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import publicApi from '../../api/publicClient';
import Logo from '../../components/Logo';

/**
 * Live token tracking — the screen a customer keeps open on their phone.
 * Shows their place, the estimated wait, and the projected clock time, then
 * flips to a full "it's your turn" state when they're called.
 */
const STATUS_LABEL = {
  waiting: 'In queue',
  serving: "It's your turn",
  held: 'On hold',
  skipped: 'Please see the desk',
  completed: 'All done',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

function formatEta(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return '<1 min';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function turnClock(seconds) {
  if (seconds == null) return null;
  return new Date(Date.now() + seconds * 1000)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function TrackToken() {
  const { tokenId } = useParams();
  const session = useMemo(
    () => new URLSearchParams(window.location.search).get('s') || localStorage.getItem(`qtoken:${tokenId}`),
    [tokenId]
  );
  const startPos = Number(localStorage.getItem(`qtoken:${tokenId}:startpos`)) || null;

  const [token, setToken] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await publicApi.get(`/token/${tokenId}`, { headers: { 'x-session': session } });
      setToken(data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your token.');
    }
  }, [tokenId, session]);

  useEffect(() => {
    if (session) localStorage.setItem(`qtoken:${tokenId}`, session);
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load, session, tokenId]);

  async function cancel() {
    if (!confirm('Leave the queue? You will lose your place.')) return;
    try {
      await publicApi.post(`/token/${tokenId}/cancel`, {}, { headers: { 'x-session': session } });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel.');
    }
  }

  if (error) {
    return (
      <Shell>
        <div className="bg-surface border border-line rounded-[22px] shadow-card p-8 text-center animate-rise">
          <p className="font-semibold text-ink">Something's not right</p>
          <p className="text-[14px] text-muted mt-2">{error}</p>
        </div>
      </Shell>
    );
  }
  if (!token) {
    return (
      <Shell>
        <div className="bg-surface border border-line rounded-[22px] shadow-card p-10 text-center">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-line border-t-espresso animate-spin" />
        </div>
      </Shell>
    );
  }

  const isTurn = token.status === 'serving';
  const waiting = token.status === 'waiting';
  const active = ['waiting', 'held', 'skipped'].includes(token.status);
  const ahead = waiting ? Math.max(0, token.position - 1) : 0;

  // Ring fills as they move from where they started to the front.
  const progress =
    waiting && startPos && startPos > 1
      ? Math.min(1, Math.max(0, (startPos - token.position) / (startPos - 1)))
      : waiting ? 0.04 : 1;
  const R = 84;
  const C = 2 * Math.PI * R;

  return (
    <Shell>
      <div
        className={`rounded-[24px] border p-8 text-center animate-rise ${
          isTurn ? 'bg-espresso border-espresso' : 'bg-surface border-line shadow-card'
        }`}
      >
        <p className={`font-mono text-[11px] tracking-[.22em] uppercase ${isTurn ? 'text-board-amber' : 'text-clay'}`}>
          {token.department}
        </p>

        <div className="relative w-[210px] h-[210px] mx-auto my-6">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" strokeWidth="9"
              className={isTurn ? 'stroke-paper/15' : 'stroke-espresso-tint'} />
            <circle
              cx="100" cy="100" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
              className={isTurn ? 'stroke-board-amber' : 'stroke-espresso'}
              style={{ transition: 'stroke-dashoffset .6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <p className={`font-mono text-[44px] leading-none font-semibold tnum ${isTurn ? 'text-paper' : 'text-ink'}`}>
                {token.tokenNumber}
              </p>
              <p className={`text-[12px] mt-2 font-semibold ${isTurn ? 'text-paper/60' : 'text-muted-2'}`}>
                {STATUS_LABEL[token.status]}
              </p>
            </div>
          </div>
        </div>

        {isTurn ? (
          <div className="text-paper">
            <p className="text-[17px] text-paper/60">Please proceed to</p>
            <p className="text-[28px] font-bold tracking-[-.02em] mt-1">{token.counter || 'the counter'}</p>
          </div>
        ) : waiting ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ahead of you" value={ahead} />
              <Stat label="Est. wait" value={formatEta(token.etaSeconds)} />
            </div>
            {token.etaSeconds != null && (
              <p className="text-[14px] text-muted mt-4">
                Your turn around <span className="font-semibold text-ink">{turnClock(token.etaSeconds)}</span>
              </p>
            )}
            {ahead > 0 && ahead <= 5 && (
              <p className="text-[13px] font-semibold text-clay-ink bg-clay-tint border border-clay-tint-border rounded-tile px-4 py-3 mt-4">
                Almost there — only {ahead} ahead. Please stay close by.
              </p>
            )}
          </>
        ) : (
          <p className="text-[14px] text-muted">This token is no longer active.</p>
        )}

        {active && (
          <button
            onClick={cancel}
            className="mt-6 w-full py-3 rounded-[11px] border border-line-input text-[14px] font-semibold text-muted hover:text-ink hover:border-line-strong transition-colors"
          >
            Leave the queue
          </button>
        )}
      </div>

      <p className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-[.2em] uppercase text-muted-3 mt-6">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-blink" />
        Live
      </p>
    </Shell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface-sunken rounded-tile px-4 py-4">
      <p className="text-[26px] leading-none font-bold tracking-[-.03em] text-ink tnum">{value}</p>
      <p className="font-mono text-[10px] tracking-[.16em] uppercase text-muted-3 mt-2">{label}</p>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="relative min-h-screen bg-paper flex flex-col items-center px-5 py-10 sm:justify-center">
      <div className="absolute inset-0 paper-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(70% 50% at 50% 30%, #FFFDF8, transparent 70%)' }}
      />
      <div className="relative w-full max-w-[380px]">
        <div className="flex justify-center mb-6">
          <Logo size="badge" />
        </div>
        {children}
      </div>
    </div>
  );
}
