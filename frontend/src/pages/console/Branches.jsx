import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, SectionTitle, EmptyState, btn, field } from '../../components/ui';

/**
 * Organization level: the list of locations. Everything operational —
 * departments, rooms, counters, staff — lives inside a branch, so this page is
 * the doorway into each one.
 */
const TZ = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Dubai',
  'Asia/Singapore', 'Australia/Sydney',
];

export default function Branches() {
  const { branches, setBranches } = useBranchStore();
  const [form, setForm] = useState({ name: '', address: '', timezone: 'UTC' });
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    const { data } = await api.get('/branches');
    setBranches(data.branches);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/branches', form);
      toast.success(`Branch “${form.name}” created`);
      setForm({ name: '', address: '', timezone: 'UTC' });
      setShowForm(false);
      await reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create branch');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader
        title="Branches"
        description="Each location runs its own departments, rooms, counters and staff."
        actions={
          <button className={btn.primary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'Add branch'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <SectionTitle>New branch</SectionTitle>
          <form onSubmit={create} className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Branch name (e.g. Downtown Clinic)" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              <input placeholder="Address" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[13px] font-medium text-ink-600">
                  Timezone — daily token numbers reset at this location's midnight
                </span>
                <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={field}>
                  {TZ.map((tz) => <option key={tz}>{tz}</option>)}
                </select>
              </label>
            </div>
            <div><button disabled={busy} className={btn.primary}>Create branch</button></div>
          </form>
        </Card>
      )}

      {branches.length === 0 ? (
        <Card><EmptyState title="No branches yet" hint="Add your first location to start configuring queues." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {branches.map((b) => (
            <Link key={b._id} to={`/branches/${b._id}`} className="group">
              <Card className="h-full transition group-hover:shadow-card-hover group-hover:border-brand-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 truncate">{b.name}</p>
                    <p className="text-xs text-ink-400 mt-0.5 truncate">{b.address || 'No address'}</p>
                    <p className="text-xs text-ink-400">{b.timezone}</p>
                  </div>
                  <span className="text-brand-600 text-sm shrink-0">Open →</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-ink-100">
                  <Count label="Depts" value={b.counts?.departments} />
                  <Count label="Rooms" value={b.counts?.rooms} />
                  <Count label="Counters" value={b.counts?.counters} />
                  <Count label="Staff" value={b.counts?.staff} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Count({ label, value }) {
  return (
    <div>
      <p className="text-lg font-semibold text-ink-900 tnum">{value ?? 0}</p>
      <p className="text-[11px] text-ink-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}
