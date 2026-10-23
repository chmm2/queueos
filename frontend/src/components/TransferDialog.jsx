import { useEffect, useState } from 'react';
import api from '../api/client';
import { btn, MicroLabel } from './ui';

/**
 * Send a patient on. Every room in the branch is offered — the counter decides
 * where they go, there is no preset route. A room that serves several
 * departments shows each one, so picking a department also picks the room.
 *
 * The patient keeps the link they already have; it follows them to the new
 * queue, where they are issued a fresh token at the back of the line.
 */
export default function TransferDialog({ token, branchId, onConfirm, onCancel }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [pick, setPick] = useState(null); // { roomId, departmentId, label }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/rooms/branch/${branchId}/destinations`)
      .then(({ data }) => setRooms(data.rooms))
      .catch(() => setError('Could not load the rooms. Close this and try again.'));
  }, [branchId]);

  const currentDept = String(token.department?._id || token.department || '');

  async function submit(e) {
    e.preventDefault();
    if (!pick) return;
    setBusy(true);
    try {
      await onConfirm({ roomId: pick.roomId, departmentId: pick.departmentId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-5">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onCancel} />
      <form
        onSubmit={submit}
        className="relative bg-surface border border-line rounded-[22px] shadow-login w-full max-w-lg p-7 animate-rise-fast max-h-[88vh] flex flex-col"
      >
        <h2 className="text-[19px] font-bold tracking-[-.02em] text-ink">
          Send <span className="font-mono tnum">{token.tokenNumber}</span> to…
        </h2>
        <p className="text-[14px] text-muted mt-2 mb-5">
          Choose where they go next. They join the back of that line with a new token, and the page
          they already have open follows them there.
        </p>

        <div className="overflow-y-auto -mx-1 px-1 space-y-4 flex-1 min-h-[120px]">
          {error && <p className="text-[14px] text-clay-ink">{error}</p>}
          {!rooms && !error && <p className="text-[14px] text-muted-3">Loading rooms…</p>}
          {rooms && rooms.length === 0 && (
            <p className="text-[14px] text-muted-3">There are no other rooms in this branch yet.</p>
          )}

          {rooms && rooms.map((room) => (
            <div key={room._id}>
              <MicroLabel className="mb-2">
                {room.name}{room.code ? ` · ${room.code}` : ''}
              </MicroLabel>
              {room.departments.length === 0 ? (
                <p className="text-[13px] text-muted-3">Doesn’t serve any department yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {room.departments.map((d) => {
                    const here = String(d._id) === currentDept;
                    const on = pick && pick.departmentId === d._id && pick.roomId === room._id;
                    return (
                      <button
                        key={d._id}
                        type="button"
                        disabled={here}
                        onClick={() => setPick({
                          roomId: room._id,
                          departmentId: d._id,
                          label: room.departments.length > 1 ? `${d.name} · ${room.name}` : room.name,
                        })}
                        className={`px-3.5 py-2 rounded-[11px] text-[13px] font-semibold border transition-colors text-left ${
                          here
                            ? 'border-line bg-surface-sunken text-muted-3 cursor-not-allowed'
                            : on
                              ? 'bg-espresso border-espresso text-paper'
                              : 'bg-surface border-line-input text-ink-2 hover:border-line-strong'
                        }`}
                      >
                        {d.name}
                        <span className={`block font-mono text-[11px] font-normal mt-0.5 ${on ? 'text-paper/65' : 'text-muted-3'}`}>
                          {here ? 'they are here now' : `${d.waiting} waiting`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2.5 justify-end mt-6">
          <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
          <button type="submit" disabled={!pick || busy} className={btn.primary}>
            {busy ? 'Sending…' : pick ? `Send to ${pick.label}` : 'Choose a room'}
          </button>
        </div>
      </form>
    </div>
  );
}
