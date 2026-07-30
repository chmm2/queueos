import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import { PageHeader, Card, SectionTitle, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Departments are the queues this branch offers. They're pure configuration,
 * which is why they can be copied wholesale from another branch — opening a
 * second location usually means running the same set of queues.
 */
const QUEUE_TYPES = ['walk-in', 'appointment', 'vip', 'emergency'];
const TYPE_TONE = { 'walk-in': 'neutral', appointment: 'brand', vip: 'warning', emergency: 'danger' };

export default function Departments() {
  const { branchId } = useParams();
  const branches = useBranchStore((s) => s.branches);
  const t = useTerms();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ name: '', tokenPrefix: '', queueType: 'walk-in', avgServiceTimeSeconds: 300 });
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await api.get(`/departments/branch/${branchId}`);
    setDepartments(data.departments);
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/departments', {
        ...form,
        branch: branchId,
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

  const otherBranches = branches.filter((b) => b._id !== branchId);

  return (
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader
        title="Departments"
        description={`The queues this branch offers. Each gets its own ${t.token.toLowerCase()} prefix and rules.`}
      />

      {/* Copy from another branch */}
      {otherBranches.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>Copy from another branch</SectionTitle>
          <p className="text-sm text-ink-500 -mt-2 mb-3">
            Bring the same queues over from an existing location. Departments already here are skipped.
          </p>
          <div className="flex flex-wrap gap-2">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={`${field} flex-1 min-w-[12rem]`}>
              <option value="">Choose a branch…</option>
              {otherBranches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <button onClick={copy} disabled={!copyFrom} className={btn.secondary}>Copy departments</button>
          </div>
        </Card>
      )}

      <Card pad={false} className="mb-6">
        {departments.length === 0 ? (
          <EmptyState title="No departments yet" hint="Add one below — customers pick from these when they join." />
        ) : (
          <div className="divide-y divide-ink-100">
            {departments.map((d) => (
              <div key={d._id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-bold text-sm">
                    {d.tokenPrefix}
                  </span>
                  <div>
                    <p className="font-medium text-ink-900 flex items-center gap-2">
                      {d.name} <Badge tone={TYPE_TONE[d.queueType]}>{d.queueType}</Badge>
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      ~{Math.round(d.avgServiceTimeSeconds / 60)} min per {t.customer.toLowerCase()}
                    </p>
                  </div>
                </div>
                <button onClick={() => archive(d._id, d.name)} className="text-sm text-ink-400 hover:text-red-600">Archive</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Add a department</SectionTitle>
        <form onSubmit={create} className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="Name (e.g. Registration)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            <input required maxLength={3} placeholder="Token prefix (e.g. R)" value={form.tokenPrefix}
              onChange={(e) => setForm({ ...form, tokenPrefix: e.target.value.toUpperCase() })} className={field} />
            <select value={form.queueType} onChange={(e) => setForm({ ...form, queueType: e.target.value })} className={field}>
              {QUEUE_TYPES.map((q) => <option key={q}>{q}</option>)}
            </select>
            <input type="number" min={30} placeholder="Avg service seconds" value={form.avgServiceTimeSeconds}
              onChange={(e) => setForm({ ...form, avgServiceTimeSeconds: Number(e.target.value) })} className={field} />
          </div>
          <div><button disabled={busy} className={btn.primary}>Add department</button></div>
        </form>
      </Card>
    </div>
  );
}
