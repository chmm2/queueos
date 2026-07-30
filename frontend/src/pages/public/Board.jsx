import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import publicApi from '../../api/publicClient';

/**
 * Public wall-display board — the screen in a waiting area. Scopeable so each
 * physical area has its OWN screen:
 *   /board/:branchId               -> whole branch
 *   /board/:branchId?room=<id>       -> just that room (e.g. Pharmacy)
 *   /board/:branchId?department=<id> -> a single department
 * Dark, high-contrast, large type — built for TVs.
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

  const shell = 'min-h-screen bg-[#0c0d13] text-slate-100 font-sans px-[4vw] py-[4vh] flex flex-col';

  if (err || !data) {
    return <div className={`${shell} items-center justify-center`}><p className="text-[2vw] text-slate-500">{err || 'Loading…'}</p></div>;
  }

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const title = data.area || data.branch.name; // e.g. "Pharmacy" or the branch

  return (
    <div className={shell}>
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/10 pb-[2.5vh] mb-[3.5vh]">
        <div>
          <p className="text-[1vw] font-semibold uppercase tracking-[0.25em] text-slate-500 mb-[0.8vh]">Now serving</p>
          <h1 className="text-[3vw] leading-none font-bold tracking-tight">{title}</h1>
          {data.area && <p className="text-[1.1vw] text-slate-500 mt-[1vh]">{data.branch.name}</p>}
        </div>
        <div className="text-right">
          <p className="text-[2.4vw] leading-none font-semibold tnum">{time}</p>
          <p className="text-[0.9vw] text-emerald-400 font-semibold tracking-widest uppercase mt-[1vh] flex items-center justify-end gap-2">
            <span className="w-[0.6vw] h-[0.6vw] rounded-full bg-emerald-400 animate-pulse-soft" /> Live
          </p>
        </div>
      </div>

      {/* One panel per department in scope */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[1.6vw] flex-1 content-start">
        {data.departments.length === 0 && <p className="text-[1.4vw] text-slate-500">No departments configured for this area.</p>}
        {data.departments.map((s) => (
          <div key={s.department} className="rounded-[1.2vw] border border-white/10 bg-white/[0.03] p-[1.8vw]">
            <div className="flex items-center justify-between mb-[1.6vh]">
              <p className="text-[1.4vw] font-semibold">{s.department}</p>
              <p className="text-[1vw] text-slate-400"><span className="text-slate-200 font-bold tnum">{s.waiting}</span> waiting</p>
            </div>
            {s.nowServing.length === 0 ? (
              <p className="text-[3vw] font-bold text-slate-700 tnum">···</p>
            ) : (
              <div className="flex flex-wrap gap-x-[2.5vw] gap-y-[1.2vh]">
                {s.nowServing.map((n, i) => (
                  <div key={i}>
                    <p className="text-[3.4vw] leading-none font-bold text-amber-300 tnum">{n.tokenNumber}</p>
                    {n.counter && <p className="text-[0.9vw] text-slate-400 mt-[0.6vh]">{n.counter}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-right text-[0.85vw] text-slate-600 uppercase tracking-[0.2em] mt-[3vh]">Powered by QueueOS</p>
    </div>
  );
}
