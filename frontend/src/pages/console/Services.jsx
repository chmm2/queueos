import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { useTerms } from '../../lib/terms';
import { PageHeader, Card, SectionTitle, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Service configuration — the zero-code heart of the platform. Each service is
 * a queue with its own token prefix, type, priority and average service time.
 */
const QUEUE_TYPES = ['walk-in', 'appointment', 'vip', 'emergency'];
const TYPE_TONE = { 'walk-in': 'neutral', appointment: 'brand', vip: 'warning', emergency: 'danger' };

export default function Services() {
  const branchId = useBranchStore((s) => s.branchId);
  const t = useTerms();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: '', tokenPrefix: '', queueType: 'walk-in', avgServiceTimeSeconds: 300 });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!branchId) return;
    const { data } = await api.get(`/services/branch/${branchId}`);
    setServices(data.services);
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/services', { ...form, branch: branchId, priorityWeight: form.queueType === 'emergency' ? 100 : form.queueType === 'vip' ? 50 : 0 });
      toast.success(`${t.service} “${form.name}” added`);
      setForm({ name: '', tokenPrefix: '', queueType: 'walk-in', avgServiceTimeSeconds: 300 });
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create service');
    } finally {
      setBusy(false);
    }
  }

  async function archive(id, name) {
    await api.delete(`/services/${id}`);
    toast.info(`“${name}” archived`);
    reload();
  }

  if (!branchId) return <SelectBranch />;

  return (
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader title={t.servicePlural} description={`The queues this branch offers. Each has its own ${t.token.toLowerCase()} prefix and rules.`} />

      <Card pad={false} className="mb-6">
        {services.length === 0 ? (
          <EmptyState title={`No ${t.servicePlural.toLowerCase()} yet`} hint="Add one below — customers pick from these when they join." />
        ) : (
          <div className="divide-y divide-ink-100">
            {services.map((s) => (
              <div key={s._id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center font-bold text-sm">{s.tokenPrefix}</span>
                  <div>
                    <p className="font-medium text-ink-900 flex items-center gap-2">
                      {s.name} <Badge tone={TYPE_TONE[s.queueType]}>{s.queueType}</Badge>
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">~{Math.round(s.avgServiceTimeSeconds / 60)} min per {t.customer.toLowerCase()}</p>
                  </div>
                </div>
                <button onClick={() => archive(s._id, s.name)} className="text-sm text-ink-400 hover:text-red-600">Archive</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Add a {t.service.toLowerCase()}</SectionTitle>
        <form onSubmit={create} className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder={`${t.service} name (e.g. Consultation)`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            <input required maxLength={3} placeholder="Token prefix (e.g. C)" value={form.tokenPrefix} onChange={(e) => setForm({ ...form, tokenPrefix: e.target.value.toUpperCase() })} className={field} />
            <select value={form.queueType} onChange={(e) => setForm({ ...form, queueType: e.target.value })} className={field}>
              {QUEUE_TYPES.map((q) => <option key={q}>{q}</option>)}
            </select>
            <input type="number" min={30} placeholder="Avg service seconds" value={form.avgServiceTimeSeconds} onChange={(e) => setForm({ ...form, avgServiceTimeSeconds: Number(e.target.value) })} className={field} />
          </div>
          <div><button disabled={busy} className={btn.primary}>Add {t.service.toLowerCase()}</button></div>
        </form>
      </Card>
    </div>
  );
}

function SelectBranch() {
  return <p className="text-sm text-ink-400 max-w-3xl mx-auto">Select a branch from the top bar first.</p>;
}
