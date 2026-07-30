import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { getSocket, joinBranch, leaveBranch } from '../../api/socket';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import Toaster from '../../components/Toaster';
import PriorityDialog from '../../components/PriorityDialog';
import Logo from '../../components/Logo';
import { Card, Badge, MicroLabel, EmptyState, STATUS_TONE, btn } from '../../components/ui';

/**
 * The counter workstation — the whole screen for the machine at a desk.
 *
 * There's no counter picker and no branch switcher: this machine IS the
 * counter it signed in as, so it can only ever serve its own room's queues.
 * One button. The rest of the room takes care of itself.
 */
export default function CounterConsole() {
  const { counter, organization, token: authToken, logout, setCounter } = useAuthStore();
  const t = useTerms();
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [priorityFor, setPriorityFor] = useState(null);

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
      else toast.info('Nobody is waiting.');
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

  /** No-show: further down the line, or out once the chances are used up. */
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

  const isOpen = me?.status === 'open';
  const roomName = me?.room?.name || counter?.room?.name || 'Your counter';

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Identity bar */}
      <header className="border-b border-line bg-surface">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-4 flex flex-wrap items-center gap-4">
          <Logo size="sidebar" />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[12px] px-2 py-0.5 rounded-[6px] bg-espresso text-paper">
                {me?.code || counter?.code}
              </span>
              <Badge tone={isOpen ? 'success' : 'neutral'} dot={isOpen}>
                counter {me?.status || 'closed'}
              </Badge>
            </div>
            <p className="font-mono text-[10px] tracking-[.16em] uppercase text-muted-3 mt-1.5 truncate">
              {organization?.name}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[15px] text-muted tnum hidden sm:inline">
              {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
            <button onClick={toggleOpen} className={isOpen ? btn.danger : btn.primary}>
              {isOpen ? 'Close counter' : 'Open counter'}
            </button>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-[13px] font-semibold text-muted-2 hover:text-clay transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1180px] w-full mx-auto px-6 lg:px-10 py-10">
        <h1 className="text-[42px] leading-[1.05] font-bold tracking-[-.035em] text-ink animate-rise">
          {roomName}
        </h1>
        <p className="text-[16px] text-muted mt-2.5 mb-8">
          One button. The rest of the room takes care of itself.
        </p>

        {!isOpen && (
          <div className="rounded-tile border border-warning-tint-border bg-warning-tint px-5 py-3.5 mb-6 text-[14px] text-warning-ink">
            This counter is closed — open it to start calling {t.customerPlural.toLowerCase()}.
          </div>
        )}

        <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' }}>
          {/* Call next */}
          <div className="relative grid place-items-center">
            {isOpen && waiting.length > 0 && (
              <span className="absolute inset-0 rounded-card bg-espresso/20 animate-ripple pointer-events-none" />
            )}
            <button
              onClick={callNext}
              disabled={busy || !isOpen}
              className="relative w-full h-full min-h-[220px] rounded-card bg-espresso hover:bg-espresso-hover active:scale-[.99] disabled:opacity-40 disabled:pointer-events-none text-paper transition-all duration-150 px-8 py-10"
            >
              <span className="block text-[30px] font-bold tracking-[-.03em]">
                {busy ? 'Calling…' : 'Call next'}
              </span>
              <span className="block font-mono text-[11px] tracking-[.2em] uppercase text-paper/50 mt-3">
                {waiting.length} waiting
              </span>
            </button>
          </div>

          {/* Now serving */}
          <Card className="flex items-center min-h-[220px]">
            {serving ? (
              <div className="w-full">
                <MicroLabel>Now serving</MicroLabel>
                <p className="text-[64px] leading-none font-bold tracking-[-.04em] text-ink tnum mt-3">
                  {serving.tokenNumber}
                </p>
                <p className="text-[15px] text-muted mt-2">
                  {serving.department?.name}
                  {serving.customerName && ` · ${serving.customerName}`}
                </p>
                {serving.noShowCount > 0 && (
                  <p className="text-[13px] text-clay-ink mt-1.5">
                    {serving.noShowCount} previous no-show{serving.noShowCount > 1 ? 's' : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-2.5 mt-6">
                  <button onClick={() => act(serving._id, 'hold', serving.tokenNumber)} className={btn.secondary}>Hold</button>
                  <button onClick={() => markNoShow(serving._id)} className={btn.danger}>No-show</button>
                  <button onClick={() => act(serving._id, 'complete', serving.tokenNumber)} className={btn.primary}>Complete</button>
                </div>
              </div>
            ) : (
              <div className="w-full">
                <EmptyState
                  dashed
                  title="Nobody at this counter right now."
                  hint={<>Hit <b className="text-ink-2">Call next</b> and the screen out front updates instantly.</>}
                />
              </div>
            )}
          </Card>
        </div>

        {/* Your queue */}
        <Card pad={false} className="overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-.02em] text-ink">Your queue</h2>
              <p className="font-mono text-[10px] tracking-[.16em] uppercase text-muted-3 mt-1">
                {me?.departments?.length ? me.departments.map((d) => d.name).join(' · ') : `all of ${roomName}`}
              </p>
            </div>
            <span className="font-mono text-[13px] text-muted-2 tnum">{waiting.length} waiting</span>
          </div>

          {relevant.length === 0 ? (
            <EmptyState
              title="Nobody waiting"
              hint={`New ${t.customerPlural.toLowerCase()} appear here the moment they join.`}
            />
          ) : (
            <div className="divide-y divide-line-soft">
              {relevant.map((x, i) => (
                <div
                  key={x._id}
                  className="px-6 py-4 hover:bg-surface-alt transition-colors animate-rise-fast"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <span className="font-mono text-[17px] font-semibold text-ink tnum">{x.tokenNumber}</span>
                      <span className="text-[14px] text-muted-2 truncate">{x.department?.name}</span>
                      {x.isPriority && <Badge tone="espresso">Priority</Badge>}
                      {x.noShowCount > 0 && (
                        <Badge tone="warning">{x.noShowCount} no-show{x.noShowCount > 1 ? 's' : ''}</Badge>
                      )}
                      <Badge tone={STATUS_TONE[x.status]}>{x.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-[13px] text-muted-3 tnum">
                        {x.predictedEtaSeconds != null ? `~${Math.round(x.predictedEtaSeconds / 60)}m` : '—'}
                      </span>
                      {!x.isPriority && ['waiting', 'held'].includes(x.status) && (
                        <button onClick={() => setPriorityFor(x)} className={btn.ghost}>Priority</button>
                      )}
                      {(x.status === 'held' || x.status === 'skipped') && (
                        <button onClick={() => act(x._id, 'recall', x.tokenNumber)} className={btn.ghost}>Recall</button>
                      )}
                    </div>
                  </div>
                  {x.isPriority && x.priorityReason && (
                    <p className="text-[12px] text-muted-3 mt-1.5">Priority: {x.priorityReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      {priorityFor && (
        <PriorityDialog token={priorityFor} onConfirm={grantPriority} onCancel={() => setPriorityFor(null)} />
      )}
      <Toaster />
    </div>
  );
}
