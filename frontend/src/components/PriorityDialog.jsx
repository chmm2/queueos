import { useState } from 'react';
import { btn, MicroLabel } from './ui';

/**
 * Granting a priority pass always requires a reason. Making that a deliberate,
 * typed step — rather than a one-click jump — is the point: the courtesy stays
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
    <div className="fixed inset-0 z-[90] grid place-items-center p-5">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onCancel} />
      <form
        onSubmit={submit}
        className="relative bg-surface border border-line rounded-[22px] shadow-login w-full max-w-md p-7 animate-rise-fast"
      >
        <h2 className="text-[19px] font-bold tracking-[-.02em] text-ink">
          Priority pass for <span className="font-mono tnum">{token.tokenNumber}</span>
        </h2>
        <p className="text-[14px] text-muted mt-2 mb-5">
          They'll move ahead of everyone else waiting. Record why — this stays on the token.
        </p>

        <label className="grid gap-2 mb-3">
          <MicroLabel>Reason</MicroLabel>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Elderly customer, unable to stand in line"
            className="w-full px-4 py-3 rounded-[11px] border border-line-input bg-surface-sunken text-[15px] text-ink placeholder-muted-3 resize-none transition-colors"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 mb-6">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReason(s)}
              className="px-2.5 py-1 rounded-pill text-[12px] border border-line-input text-muted-2 hover:border-clay-tint-border hover:text-clay-ink hover:bg-clay-tint transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2.5 justify-end">
          <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
          <button type="submit" disabled={!valid || busy} className={btn.primary}>
            {busy ? 'Granting…' : 'Grant priority pass'}
          </button>
        </div>
        {!valid && reason.length > 0 && (
          <p className="text-[12px] text-clay-ink mt-2.5 text-right">Please write a few more words.</p>
        )}
      </form>
    </div>
  );
}
