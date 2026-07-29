import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import { PageHeader, Card, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Counter management. Create counters, assign staff, and open / pause / close
 * them. Only "open" counters serve the queue and count toward ETA capacity.
 */
const STATUS_TONE = { open: 'success', paused: 'warning', closed: 'neutral' };

export default function Counters() {
  const branchId = useBranchStore((s) => s.branchId);
  const t = useTerms();
  const [counters, setCounters] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState('');

  const reload = useCallback(async () => {
    if (!branchId) return;
    const [c, s, u] = await Promise.all([
      api.get(`/counters/branch/${branchId}`),
      api.get(`/services/branch/${branchId}`),
      api.get('/users'),
    ]);
    setCounters(c.data.counters);
    setServices(s.data.services);
    setStaff(u.data.users.filter((x) => x.role === 'Staff'));
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function create(e) {
    e.preventDefault();
    await api.post('/counters', { branch: branchId, name, services: services.map((s) => s._id) });
    toast.success(`${t.counter} “${name}” added`);
    setName('');
    reload();
  }
  async function assign(id, staffId) {
    if (!staffId) return;
    await api.patch(`/counters/${id}/assign`, { staffId });
    toast.success('Staff assigned · counter open');
    reload();
  }
  async function pause(id) { const { data } = await api.patch(`/counters/${id}/pause`); toast.info(`${t.counter} ${data.counter.status}`); reload(); }
  async function close(id) { await api.patch(`/counters/${id}/close`); toast.info(`${t.counter} closed`); reload(); }

  if (!branchId) return <p className="text-sm text-ink-400 max-w-3xl mx-auto">Select a branch from the top bar first.</p>;

  return (
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader title={t.counterPlural} description={`Serving points at this branch. Open a ${t.counter.toLowerCase()} and assign staff to start serving.`} />

      <div className="space-y-3 mb-6">
        {counters.length === 0 && (
          <Card><EmptyState title={`No ${t.counterPlural.toLowerCase()} yet`} hint="Add one below." /></Card>
        )}
        {counters.map((c) => (
          <Card key={c._id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink-900 flex items-center gap-2">
                {c.name} <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </p>
              <p className="text-xs text-ink-400 mt-0.5">
                {c.assignedStaff?.name ? `Staffed by ${c.assignedStaff.name}` : 'No staff assigned'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select defaultValue="" onChange={(e) => assign(c._id, e.target.value)} className="px-3 py-1.5 rounded-lg border border-ink-200 text-sm bg-white">
                <option value="">Assign staff…</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <button onClick={() => pause(c._id)} className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium transition">
                {c.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button onClick={() => close(c._id)} className="px-3 py-1.5 rounded-lg hover:bg-ink-100 text-ink-500 text-sm transition">Close</button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <form onSubmit={create} className="flex gap-2">
          <input required placeholder={`${t.counter} name (e.g. ${t.counter} 4)`} value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <button className={`${btn.primary} shrink-0`}>Add {t.counter.toLowerCase()}</button>
        </form>
      </Card>
    </div>
  );
}
