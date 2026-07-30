import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { getSocket, joinBranch, leaveBranch } from '../../api/socket';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import Toaster from '../../components/Toaster';
import PriorityDialog from '../../components/PriorityDialog';
import { Badge, STATUS_TONE } from '../../components/ui';
import { Icon } from '../../components/icons';

/**
 * The counter workstation — the whole screen for the machine at a desk.
 *
 * There is no counter picker and no branch switcher: this machine IS the
 * counter it signed in as, so it can only ever serve its own room's queues.
 */
export default function CounterConsole() {
  const { counter, organization, token: authToken, logout, setCounter } = useAuthStore();
  const t = useTerms();
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [priorityFor, setPriorityFor] = useState(null); // token awaiting a reason

  const branchId = counter?.branch;

  const refresh = useCallback(async () => {
    if (!branchId) return;
    const { data } = await api.get(`/tokens/branch/${branchId}`);
    setTokens(data.tokens);
  }, [branchId]);

  useEffect(() => {
    api.get('/counters/me').then(({ data }) => {
      setMe(data.counter);
      setCounter({ ...counter, status: data.counter.status });
    }).catch(() => {});
    refresh();

    const socket = getSocket(authToken);
    if (branchId) joinBranch(branchId);
    socket.on('queue:update', refresh);
    socket.on('token:called', refresh);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      socket.off('queue:update', refresh);
      socket.off('token:called', refresh);
      if (branchId) leaveBranch(branchId);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refresh, authToken]);

  // Only the queues this counter is responsible for.
  const myDeptIds = me?.departments?.length
    ? me.departments.map((d) => String(d._id))
    : (me?.room?.departments || []).map((d) => String(d._id || d));

  const relevant = tokens.filter((x) =>
    myDeptIds.length === 0 ? true : myDeptIds.includes(String(x.department?._id || x.department))
  );
  const serving = relevant.find(
    (x) => x.status === 'serving' && String(x.counter?._id || x.counter) === String(counter?._id)
  );
  const waiting = relevant.filter((x) => x.status === 'waiting');

  async function callNext() {
    setBusy(true);
    try {
      const { data } = await api.post('/tokens/call-next');
      if (data.token) toast.success(`Now serving ${data.token.tokenNumber}`);
      else toast.info('No one is waiting.');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not call next.');
    } finally {
      setBusy(false);
    }
  }

  const LABELS = { hold: 'held', complete: 'completed', recall: 'recalled' };
  async function act(id, action, tokenNumber) {
    try {
      await api.patch(`/tokens/${id}/${action}`, {});
      toast.success(`${tokenNumber} ${LABELS[action] || action}`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Action failed.');
    }
  }

  /**
   * No-show: they go back in line further down, or out entirely once they've
   * used up their chances. The response tells us which happened.
   */
  async function markNoShow(id) {
    try {
      const { data } = await api.patch(`/tokens/${id}/no-show`, {});
      if (data.outcome === 'removed') toast.error(data.message);
      else toast.info(data.message);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not record the no-show.');
    }
  }

  async function grantPriority(reason) {
    try {
      const { data } = await api.patch(`/tokens/${priorityFor._id}/priority`, { reason });
      toast.success(data.message);
      setPriorityFor(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not grant priority.');
    }
  }

  async function toggleOpen() {
    const open = me?.status === 'open';
    const { data } = await api.patch(`/counters/${counter._id}/${open ? 'close' : 'open'}`);
    setMe((m) => ({ ...m, status: data.counter.status }));
    toast.info(`Counter ${data.counter.status}`);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const isOpen = me?.status === 'open';

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      {/* Counter identity bar */}
      <header className="bg-white border-b border-ink-200/70 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold shrink-0">Q</span>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[13px] bg-ink-100 rounded px-1.5 py-0.5">{me?.code || counter?.code}</span>
              <Badge tone={isOpen ? 'success' : 'neutral'}>{me?.status || 'closed'}</Badge>
            </p>
            <p className="text-xs text-ink-400 truncate">
              {organization?.name} · {me?.room?.name || counter?.room?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-400 tnum hidden sm:inline">
            {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          <button onClick={toggleOpen} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            isOpen ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}>
            {isOpen ? 'Close counter' : 'Open counter'}
          </button>
          <button onClick={handleLogout} className="p-2 rounded-lg text-ink-400 hover:bg-ink-100" title="Sign out">
            <Icon.logout />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto">
        {!isOpen && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
            This counter is closed — open it to start calling {t.customerPlural.toLowerCase()}.
          </p>
        )}

        {/* Action zone */}
        <div className="bg-white rounded-2xl border border-ink-200/70 shadow-card p-6 mb-5">
          <div className="flex flex-col md:flex-row items-stretch gap-5">
            <button
              onClick={callNext}
              disabled={busy || !isOpen}
              className="md:w-72 shrink-0 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[.99] disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xl px-8 py-10 transition shadow-sm"
            >
              {busy ? 'Calling…' : 'Call next'}
              <span className="block text-sm font-normal text-brand-200 mt-2">{waiting.length} waiting</span>
            </button>

            <div className="flex-1 rounded-2xl bg-ink-50 px-6 py-5 flex items-center">
              {serving ? (
                <div className="w-full flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-[0.15em]">Now serving</p>
                    <p className="text-5xl leading-tight font-bold text-ink-900 tnum">{serving.tokenNumber}</p>
                    <p className="text-sm text-ink-500">
                      {serving.department?.name}
                      {serving.customerName && ` · ${serving.customerName}`}
                    </p>
                    {serving.noShowCount > 0 && (
                      <p className="text-xs text-orange-700 mt-1">
                        {serving.noShowCount} previous no-show{serving.noShowCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => act(serving._id, 'hold', serving.tokenNumber)} className="px-4 py-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium transition">Hold</button>
                    <button onClick={() => markNoShow(serving._id)} className="px-4 py-3 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium transition">No-show</button>
                    <button onClick={() => act(serving._id, 'complete', serving.tokenNumber)} className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition">Complete</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-400">
                  Nobody at this counter right now — press <b>Call next</b> to serve the next person.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Queue this counter is responsible for */}
        <div className="bg-white rounded-2xl border border-ink-200/70 shadow-card">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-ink-800">Your queue</h2>
              <p className="text-xs text-ink-400 mt-0.5">
                {me?.departments?.length
                  ? me.departments.map((d) => d.name).join(' · ')
                  : `All of ${me?.room?.name || 'this room'}`}
              </p>
            </div>
            <span className="text-sm text-ink-400 tnum">{waiting.length} waiting</span>
          </div>
          {relevant.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-10">
              Nobody waiting. New {t.customerPlural.toLowerCase()} appear here the moment they join.
            </p>
          ) : (
            <div className="divide-y divide-ink-100">
              {relevant.map((x) => (
                <div key={x._id} className="px-6 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <span className="font-semibold text-ink-900 tnum">{x.tokenNumber}</span>
                      <span className="text-sm text-ink-400 truncate">{x.department?.name}</span>
                      {x.isPriority && <Badge tone="danger">priority</Badge>}
                      {x.noShowCount > 0 && (
                        <Badge tone="orange">{x.noShowCount} no-show{x.noShowCount > 1 ? 's' : ''}</Badge>
                      )}
                      <Badge tone={STATUS_TONE[x.status]}>{x.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-ink-400 tnum">
                        {x.predictedEtaSeconds != null ? `~${Math.round(x.predictedEtaSeconds / 60)}m` : '—'}
                      </span>
                      {!x.isPriority && ['waiting', 'held'].includes(x.status) && (
                        <button onClick={() => setPriorityFor(x)}
                          className="text-sm font-medium text-ink-500 hover:text-brand-700" title="Grant a priority pass">
                          Priority
                        </button>
                      )}
                      {(x.status === 'held' || x.status === 'skipped') && (
                        <button onClick={() => act(x._id, 'recall', x.tokenNumber)} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                          Recall
                        </button>
                      )}
                    </div>
                  </div>
                  {x.isPriority && x.priorityReason && (
                    <p className="text-xs text-ink-400 mt-1">Priority: {x.priorityReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {priorityFor && (
        <PriorityDialog
          token={priorityFor}
          onConfirm={grantPriority}
          onCancel={() => setPriorityFor(null)}
        />
      )}
      <Toaster />
    </div>
  );
}
