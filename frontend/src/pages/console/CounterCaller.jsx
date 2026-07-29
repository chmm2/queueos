import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { getSocket, joinBranch, leaveBranch } from '../../api/socket';
import { useAuthStore } from '../../store/authStore';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import { PageHeader, Card, Badge, STATUS_TONE, EmptyState, btn } from '../../components/ui';

/**
 * The operator workstation. Pick your counter, call the next customer, work
 * the token (hold / skip / complete). The queue updates live over Socket.IO.
 */
export default function CounterCaller() {
  const { user, token: authToken } = useAuthStore();
  const branchId = useBranchStore((s) => s.branchId);
  const t = useTerms();
  const [counters, setCounters] = useState([]);
  const [counterId, setCounterId] = useState('');
  const [tokens, setTokens] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!branchId) return;
    const { data } = await api.get(`/tokens/branch/${branchId}`);
    setTokens(data.tokens);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/counters/branch/${branchId}`).then(({ data }) => {
      setCounters(data.counters);
      const mine = data.counters.find((c) => c.assignedStaff?._id === user._id) || data.counters.find((c) => c.status === 'open');
      if (mine) setCounterId((prev) => prev || mine._id);
    });
    refresh();

    const socket = getSocket(authToken);
    joinBranch(branchId);
    socket.on('queue:update', refresh);
    socket.on('token:called', refresh);
    return () => {
      socket.off('queue:update', refresh);
      socket.off('token:called', refresh);
      leaveBranch(branchId);
    };
  }, [branchId, refresh, authToken, user._id]);

  const cid = (x) => (x.counter && (x.counter._id || x.counter)) || null;
  const serving = tokens.find((x) => x.status === 'serving' && cid(x) === counterId);
  const waiting = tokens.filter((x) => x.status === 'waiting');
  const counter = counters.find((c) => c._id === counterId);

  async function callNext() {
    if (!counterId) return toast.error(`Select your ${t.counter.toLowerCase()} first.`);
    setBusy(true);
    try {
      const { data } = await api.post('/tokens/call-next', { counterId });
      if (data.token) toast.success(`Now serving ${data.token.tokenNumber}`);
      else toast.info('The queue is empty.');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not call next.');
    } finally {
      setBusy(false);
    }
  }

  const LABELS = { hold: 'held', skip: 'marked no-show', complete: 'completed', recall: 'recalled' };
  async function act(id, action, tokenNumber) {
    try {
      await api.patch(`/tokens/${id}/${action}`, {});
      toast.success(`${tokenNumber} ${LABELS[action] || action}`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader
        title="Call next"
        description={`Call and serve ${t.customerPlural.toLowerCase()} at your ${t.counter.toLowerCase()}.`}
        actions={
          <select
            value={counterId}
            onChange={(e) => setCounterId(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-700"
          >
            <option value="">Select a {t.counter.toLowerCase()}…</option>
            {counters.map((c) => (
              <option key={c._id} value={c._id}>{c.name} · {c.status}</option>
            ))}
          </select>
        }
      />

      {counter && counter.status !== 'open' && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
          This {t.counter.toLowerCase()} is {counter.status}.{' '}
          {user?.role !== 'Staff' ? <Link to="/counters" className="underline font-medium">Open it in {t.counterPlural}</Link> : 'Ask an operator to open it.'}
        </p>
      )}
      {counters.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
          No {t.counterPlural.toLowerCase()} yet.{' '}
          {user?.role !== 'Staff' ? <Link to="/counters" className="underline font-medium">Create one in {t.counterPlural}</Link> : 'Ask an operator to set one up.'}
        </p>
      )}

      {/* Action zone */}
      <Card className="mb-5">
        <div className="flex flex-col md:flex-row items-stretch gap-5">
          <button
            onClick={callNext}
            disabled={busy || !counterId}
            className="md:w-64 shrink-0 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[.99] disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-lg px-8 py-8 transition shadow-sm"
          >
            {busy ? 'Calling…' : `Call next ${t.token.toLowerCase()}`}
            <span className="block text-xs font-normal text-brand-200 mt-1.5">{waiting.length} waiting</span>
          </button>

          <div className="flex-1 rounded-2xl bg-ink-50 px-6 py-5 flex items-center">
            {serving ? (
              <div className="w-full flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-[0.15em]">Now serving</p>
                  <p className="text-[2.4rem] leading-tight font-bold text-ink-900 tnum">{serving.tokenNumber}</p>
                  {serving.customerName && <p className="text-sm text-ink-500">{serving.customerName}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => act(serving._id, 'hold', serving.tokenNumber)} className="px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium transition">Hold</button>
                  <button onClick={() => act(serving._id, 'skip', serving.tokenNumber)} className="px-4 py-2.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium transition">No-show</button>
                  <button onClick={() => act(serving._id, 'complete', serving.tokenNumber)} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">Complete</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-400">Nothing being served at this {t.counter.toLowerCase()} yet — call the next {t.token.toLowerCase()} to begin.</p>
            )}
          </div>
        </div>
      </Card>

      {/* Live queue */}
      <Card pad={false}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[0.95rem] font-semibold text-ink-800">Branch queue</h2>
          <span className="text-sm text-ink-400 tnum">{waiting.length} waiting</span>
        </div>
        {tokens.length === 0 ? (
          <EmptyState title="The queue is empty" hint={`New ${t.customerPlural.toLowerCase()} appear here the moment they join.`} />
        ) : (
          <div className="divide-y divide-ink-100">
            {tokens.map((x) => (
              <div key={x._id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-ink-900 tnum">{x.tokenNumber}</span>
                  <span className="text-sm text-ink-400 truncate">{x.service?.name}</span>
                  {x.isPriority && <Badge tone="danger">priority</Badge>}
                  <Badge tone={STATUS_TONE[x.status]}>{x.status}</Badge>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm text-ink-400 tnum">
                    {x.predictedEtaSeconds != null ? `~${Math.round(x.predictedEtaSeconds / 60)}m` : '—'}
                  </span>
                  {(x.status === 'held' || x.status === 'skipped') && (
                    <button onClick={() => act(x._id, 'recall', x.tokenNumber)} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Recall
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
