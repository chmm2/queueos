import { useState } from 'react';
import { btn } from './ui';

/**
 * Granting a priority pass always requires a reason. Making that a deliberate,
 * typed step (rather than a one-click jump) is the point: the courtesy stays
 * available, but it's never anonymous.
 */
const SUGGESTIONS = [
  'Elderly / mobility need',
  'Medical urgency',
  'Pregnant',
  'With small children',
  'Staff error — lost their place',
  'Returning after being sent elsewhere',
];

export default function PriorityDialog({ token, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = reason.trim().length >= 3;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onCancel} />
      <form
        onSubmit={submit}
        className="relative bg-white rounded-2xl shadow-pop border border-ink-200/70 w-full max-w-md p-6 animate-rise"
      >
        <h2 className="text-lg font-semibold text-ink-900">
          Priority pass for <span className="tnum">{token.tokenNumber}</span>
        </h2>
        <p className="text-sm text-ink-500 mt-1 mb-4">
          They'll move ahead of everyone else waiting. Record why — this is kept
          against the token.
        </p>

        <label className="grid gap-1.5 mb-3">
          <span className="text-[13px] font-medium text-ink-600">Reason</span>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Elderly customer, unable to stand in line"
            className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white text-sm text-ink-800 placeholder-ink-400 transition focus:border-brand-400 resize-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReason(s)}
              className="px-2.5 py-1 rounded-full text-xs border border-ink-200 text-ink-600 hover:border-brand-300 hover:text-brand-700 transition"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
          <button type="submit" disabled={!valid || busy} className={btn.primary}>
            {busy ? 'Granting…' : 'Grant priority pass'}
          </button>
        </div>
        {!valid && reason.length > 0 && (
          <p className="text-xs text-amber-700 mt-2 text-right">Please write a few more words.</p>
        )}
      </form>
    </div>
  );
}
