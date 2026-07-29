import { useState } from 'react';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, SectionTitle, EmptyState, btn, field } from '../../components/ui';

/**
 * Branch management (Admin). Add locations; each seeds its own services and
 * counters. Timezone drives daily token-number resets.
 */
const TZ = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'];

export default function Branches() {
  const { branches, setBranches, setBranchId } = useBranchStore();
  const [form, setForm] = useState({ name: '', address: '', timezone: 'UTC' });
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { data } = await api.get('/branches');
    setBranches(data.branches);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/branches', form);
      toast.success(`Branch “${form.name}” created`);
      setForm({ name: '', address: '', timezone: 'UTC' });
      await reload();
      setBranchId(data.branch._id);
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create branch');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader title="Branches" description="Every physical location your organization runs." />

      <Card pad={false} className="mb-6">
        {branches.length === 0 ? (
          <EmptyState title="No branches yet" hint="Add your first location below to start configuring queues." />
        ) : (
          <div className="divide-y divide-ink-100">
            {branches.map((b) => (
              <div key={b._id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium text-ink-900">{b.name}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{b.address || 'No address'} · {b.timezone}</p>
                </div>
                <button onClick={() => setBranchId(b._id)} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Add a branch</SectionTitle>
        <form onSubmit={create} className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="Branch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={`${field} sm:col-span-2`}>
              {TZ.map((tz) => <option key={tz}>{tz}</option>)}
            </select>
          </div>
          <div><button disabled={busy} className={btn.primary}>Add branch</button></div>
        </form>
      </Card>
    </div>
  );
}
