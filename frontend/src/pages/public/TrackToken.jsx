import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import publicApi from '../../api/publicClient';

/**
 * Live token tracking — the screen a customer keeps open. Shows their token,
 * a progress ring from where they started to the front of the line, people
 * ahead, estimated wait, and the projected "your turn around" clock time.
 * Flips to a full "It's your turn" state when called.
 */
const STATUS_LABEL = {
  waiting: 'In queue',
  serving: "It's your turn",
  held: 'On hold',
  skipped: 'Skipped — see staff',
  completed: 'Completed',
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

function turnClockTime(etaSeconds) {
  if (etaSeconds == null) return null;
  const d = new Date(Date.now() + etaSeconds * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
    if (!confirm('Cancel your spot? You will lose your place in line.')) return;
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
        <div className="bg-white rounded-2xl shadow-card border border-ink-200/70 p-8 text-center animate-rise">
          <p className="text-ink-700 font-medium">Something's not right</p>
          <p className="text-sm text-ink-500 mt-2">{error}</p>
        </div>
      </Shell>
    );
  }
  if (!token) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow-card border border-ink-200/70 p-8 text-center">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin" />
        </div>
      </Shell>
    );
  }

  const isTurn = token.status === 'serving';
  const waiting = token.status === 'waiting';
  const active = ['waiting', 'held', 'skipped'].includes(token.status);
  const ahead = waiting ? Math.max(0, token.position - 1) : 0;

  // Ring progress: how far you've moved from your starting position.
  const progress = waiting && startPos && startPos > 1 ? Math.min(1, Math.max(0, (startPos - token.position) / (startPos - 1))) : waiting ? 0.05 : 1;
  const R = 84;
  const C = 2 * Math.PI * R;

  return (
    <Shell>
      <div
        className={`rounded-2xl shadow-card border p-7 text-center animate-rise ${
          isTurn ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-ink-200/70'
        }`}
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isTurn ? 'text-emerald-100' : 'text-ink-400'}`}>
          {token.service}
        </p>

        {/* Token number inside the progress ring */}
        <div className="relative w-[200px] h-[200px] mx-auto my-5">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" strokeWidth="10" className={isTurn ? 'stroke-emerald-500' : 'stroke-ink-100'} />
            <circle
              cx="100" cy="100" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              className={isTurn ? 'stroke-white' : 'stroke-brand-500'}
              style={{ transition: 'stroke-dashoffset .6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <p className={`text-[2.6rem] leading-none font-bold tracking-tight tnum ${isTurn ? 'text-white' : 'text-ink-900'}`}>
                {token.tokenNumber}
              </p>
              <p className={`text-xs mt-1.5 font-medium ${isTurn ? 'text-emerald-100' : 'text-ink-400'}`}>
                {STATUS_LABEL[token.status]}
              </p>
            </div>
          </div>
        </div>

        {isTurn ? (
          <div className="text-white">
            <p className="text-xl font-semibold">Please proceed to</p>
            <p className="text-2xl font-bold mt-0.5">{token.counter || 'the counter'}</p>
          </div>
        ) : waiting ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ahead of you" value={ahead} />
              <Stat label="Est. wait" value={formatEta(token.etaSeconds)} />
            </div>
            {token.etaSeconds != null && (
              <p className="text-sm text-ink-500 mt-4">
                Your turn around <span className="font-semibold text-ink-800">{turnClockTime(token.etaSeconds)}</span>
              </p>
            )}
            {ahead > 0 && ahead <= 5 && (
              <p className="text-[13px] font-medium text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5 mt-4">
                Almost there — only {ahead} ahead. Please stay close by.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-500">This token is no longer active.</p>
        )}

        {active && (
          <button
            onClick={cancel}
            className="mt-6 w-full py-2.5 rounded-xl border border-ink-200 text-sm text-ink-500 hover:bg-ink-50 transition"
          >
            Cancel my spot
          </button>
        )}
      </div>

      <p className="text-center text-xs text-ink-400 mt-5 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
        Live — updates automatically
      </p>
    </Shell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-ink-50 rounded-xl px-4 py-3.5">
      <p className="text-[1.55rem] leading-none font-bold text-ink-900 tnum">{value}</p>
      <p className="text-[11px] font-medium text-ink-400 uppercase tracking-wider mt-1.5">{label}</p>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col items-center px-4 py-8 sm:justify-center">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
