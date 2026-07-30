import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import publicApi from '../../api/publicClient';

/**
 * The waiting-room screen — a public TV surface with no app chrome. Scopeable
 * so each physical area gets its own:
 *   /board/:branchId                 -> whole branch
 *   /board/:branchId?room=<id>       -> just that room (e.g. Pharmacy)
 *   /board/:branchId?department=<id> -> a single department
 */
export default function Board() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const scope = new URLSearchParams();
  if (params.get('room')) scope.set('room', params.get('room'));
  if (params.get('department')) scope.set('department', params.get('department'));
  const scopeStr = scope.toString();

  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res = await publicApi.get(`/board/${branchId}${scopeStr ? `?${scopeStr}` : ''}`);
      setData(res.data);
      setErr('');
    } catch {
      setErr('Display temporarily unavailable.');
    }
  }, [branchId, scopeStr]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  const shell =
    "min-h-screen bg-board-bg text-paper font-sans flex flex-col";

  if (err || !data) {
    return (
      <div className={`${shell} items-center justify-center`}>
        <p className="text-[2vw] text-paper/40">{err || 'Loading…'}</p>
      </div>
    );
  }

  const title = data.area || data.branch.name;
  const serving = data.departments.flatMap((d) =>
    d.nowServing.map((n) => ({ ...n, department: d.department }))
  );
  const current = serving[0];
  const upNext = data.departments
    .filter((d) => d.waiting > 0)
    .map((d) => ({ department: d.department, waiting: d.waiting }));

  return (
    <div className={shell} style={{ padding: '52px 64px' }}>
      {/* Header */}
      <div className="flex items-end justify-between gap-8 pb-9 border-b border-paper/10">
        <div className="min-w-0">
          <p className="font-mono text-[13px] tracking-[.34em] uppercase text-paper/40 mb-3">
            Now serving
          </p>
          <h1 className="text-[62px] leading-none font-bold tracking-[-.035em] truncate">{title}</h1>
          {data.area && <p className="text-[18px] text-paper/40 mt-3">{data.branch.name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[50px] leading-none font-semibold tnum">
            {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="font-mono text-[12px] tracking-[.24em] uppercase text-success mt-3 flex items-center justify-end gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-blink" /> Live
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 grid gap-10 py-10" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div className="rounded-[28px] bg-paper/[0.04] border border-paper/10 flex flex-col items-center justify-center px-10 py-12">
          {current ? (
            <>
              <p className="text-[170px] leading-[.9] font-bold tracking-[-.05em] text-board-amber tnum">
                {current.tokenNumber}
              </p>
              <p className="text-[26px] text-paper/70 mt-8 text-center">
                Please proceed to <span className="font-bold text-paper">{current.counter}</span>
              </p>
              <p className="font-mono text-[13px] tracking-[.2em] uppercase text-paper/35 mt-3">
                {current.department}
              </p>
            </>
          ) : (
            <>
              <p className="text-[170px] leading-[.9] font-bold tracking-[-.05em] text-paper/10 tnum">···</p>
              <p className="text-[22px] text-paper/40 mt-8">No one is being served right now.</p>
            </>
          )}
        </div>

        <div className="flex flex-col">
          <p className="font-mono text-[13px] tracking-[.28em] uppercase text-paper/40 mb-6">Up next</p>
          {upNext.length === 0 ? (
            <p className="text-[18px] text-paper/30">Nobody waiting.</p>
          ) : (
            <div className="space-y-5">
              {upNext.map((d) => (
                <div key={d.department} className="flex items-baseline justify-between gap-4 pb-4 border-b border-paper/10">
                  <span className="text-[22px] text-paper/75 truncate">{d.department}</span>
                  <span className="font-mono text-[34px] font-semibold text-paper tnum shrink-0">
                    {d.waiting}
                  </span>
                </div>
              ))}
            </div>
          )}
          {serving.length > 1 && (
            <div className="mt-8">
              <p className="font-mono text-[11px] tracking-[.24em] uppercase text-paper/30 mb-3">
                Also serving
              </p>
              <div className="flex flex-wrap gap-2.5">
                {serving.slice(1).map((s, i) => (
                  <span key={i} className="font-mono text-[20px] px-3 py-1.5 rounded-[10px] bg-paper/[0.07] text-board-amber tnum">
                    {s.tokenNumber}
                    <span className="text-paper/35 text-[13px] ml-2">{s.counter}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-6 pt-7 border-t border-paper/10">
        <p className="text-[16px] text-paper/40">
          Scan the code at the entrance — keep your place from your seat.
        </p>
        <p className="font-mono text-[11px] tracking-[.28em] uppercase text-paper/25">
          Powered by QueueOS
        </p>
      </div>
    </div>
  );
}
