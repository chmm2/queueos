import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import {
  PageHeader, Card, SectionTitle, Badge, EmptyState, MicroLabel, LoadBar, btn, field, fieldMono,
} from '../../components/ui';

/**
 * Departments are the queues a branch offers. They're pure configuration —
 * no physical layout — which is why they can be copied wholesale to another
 * branch when a second location opens.
 */
const QUEUE_TYPES = ['walk-in', 'appointment', 'vip', 'emergency'];
const TYPE_TONE = { 'walk-in': 'neutral', appointment: 'neutral', vip: 'warning', emergency: 'clay' };

export default function Departments() {
  const { branchId } = useParams();
  const branches = useBranchStore((s) => s.branches);
  const t = useTerms();
  const [departments, setDepartments] = useState([]);
  const [waiting, setWaiting] = useState({});
  const [form, setForm] = useState({ name: '', tokenPrefix: '', queueType: 'walk-in', avgServiceTimeSeconds: 300 });
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [d, tk] = await Promise.all([
      api.get(`/departments/branch/${branchId}`),
      api.get(`/tokens/branch/${branchId}`).catch(() => ({ data: { tokens: [] } })),
    ]);
    setDepartments(d.data.departments);
    const counts = {};
    tk.data.tokens.filter((x) => x.status === 'waiting').forEach((x) => {
      const id = String(x.department?._id || x.department);
      counts[id] = (counts[id] || 0) + 1;
    });
    setWaiting(counts);
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/departments', {
        ...form, branch: branchId,
        priorityWeight: form.queueType === 'emergency' ? 100 : form.queueType === 'vip' ? 50 : 0,
      });
      toast.success(`Department “${form.name}” added`);
      setForm({ name: '', tokenPrefix: '', queueType: 'walk-in', avgServiceTimeSeconds: 300 });
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create department');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!copyFrom) return;
    try {
      const { data } = await api.post('/departments/copy', { fromBranch: copyFrom, toBranch: branchId });
      toast.success(`Copied ${data.copied} department(s)${data.skipped ? `, skipped ${data.skipped} already here` : ''}`);
      setCopyFrom('');
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not copy');
    }
  }

  async function archive(id, name) {
    await api.delete(`/departments/${id}`);
    toast.info(`“${name}” archived`);
    reload();
  }

  const others = branches.filter((b) => b._id !== branchId);
  const busiest = Math.max(1, ...Object.values(waiting));

  return (
    <div>
      <PageHeader
        eyebrow="Branch control"
        title="What people are here for."
        description={`Every department is its own queue, with its own ${t.token.toLowerCase()} prefix, pace and priority.`}
      />

      {others.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>Copy from another branch</SectionTitle>
          <p className="text-[14px] text-muted -mt-3 mb-4">
            Opening a second location usually means running the same queues. Departments already here are skipped.
          </p>
          <div className="flex flex-wrap gap-3">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={`${field} flex-1 min-w-[14rem]`}>
              <option value="">Choose a branch…</option>
              {others.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <button onClick={copy} disabled={!copyFrom} className={btn.secondary}>Copy departments</button>
          </div>
        </Card>
      )}

      <Card pad={false} className="mb-6 overflow-hidden">
        {departments.length === 0 ? (
          <EmptyState title="No departments yet" hint="Add one below — customers pick from these when they join." />
        ) : (
          <div className="divide-y divide-line-soft">
            {departments.map((d, i) => {
              const n = waiting[String(d._id)] || 0;
              return (
                <div
                  key={d._id}
                  className="grid items-center gap-4 px-6 py-4 hover:bg-surface-alt transition-colors animate-rise-fast"
                  style={{ gridTemplateColumns: '44px minmax(0,1fr) 90px 150px 110px', animationDelay: `${i * 35}ms` }}
                >
                  <span className="w-11 h-11 rounded-[13px] bg-espresso-tint border border-espresso-tint-border grid place-items-center font-mono text-[15px] font-semibold text-espresso">
                    {d.tokenPrefix}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                      {d.name}
                      <Badge tone={TYPE_TONE[d.queueType]}>{d.queueType}</Badge>
                    </p>
                    <p className="font-mono text-[11px] text-muted-3 mt-1 truncate">
                      ~{Math.round(d.avgServiceTimeSeconds / 60)} min per {t.customer.toLowerCase()} · prefix {d.tokenPrefix}
                    </p>
                  </div>
                  <div>
                    <p className="text-[19px] font-bold text-ink tnum leading-none">{n}</p>
                    <MicroLabel className="mt-1">Waiting</MicroLabel>
                  </div>
                  <LoadBar value={n} max={busiest} />
                  <button onClick={() => archive(d._id, d.name)} className={btn.secondary}>Archive</button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Add a department</SectionTitle>
        <form onSubmit={create} className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
          <label className="grid gap-2 min-w-0">
            <MicroLabel>Name</MicroLabel>
            <input required placeholder="Registration" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          </label>
          <label className="grid gap-2 min-w-0">
            <MicroLabel>Prefix</MicroLabel>
            <input required maxLength={3} placeholder="R" value={form.tokenPrefix}
              onChange={(e) => setForm({ ...form, tokenPrefix: e.target.value.toUpperCase() })} className={fieldMono} />
          </label>
          <label className="grid gap-2 min-w-0">
            <MicroLabel>Type</MicroLabel>
            <select value={form.queueType} onChange={(e) => setForm({ ...form, queueType: e.target.value })} className={field}>
              {QUEUE_TYPES.map((q) => <option key={q}>{q}</option>)}
            </select>
          </label>
          <label className="grid gap-2 min-w-0">
            <MicroLabel>Seconds each</MicroLabel>
            <input type="number" min={30} value={form.avgServiceTimeSeconds}
              onChange={(e) => setForm({ ...form, avgServiceTimeSeconds: Number(e.target.value) })} className={fieldMono} />
          </label>
          <div className="flex items-end">
            <button disabled={busy} className={btn.primary}>Add department</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
