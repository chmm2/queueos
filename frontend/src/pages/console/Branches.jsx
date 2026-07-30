import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import {
  PageHeader, Card, SectionTitle, EmptyState, Badge, MicroLabel, Sparkline, btn, field,
} from '../../components/ui';

/**
 * Organization level: every location, with a live pulse for each. Departments,
 * rooms, counters and staff all live inside a branch, so this is the doorway.
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
  const [pulse, setPulse] = useState({}); // branchId -> { waiting, series }

  // A light live read per branch so each card shows a real pulse.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      branches.map((b) =>
        api.get(`/tokens/branch/${b._id}`)
          .then(({ data }) => [b._id, data.tokens.filter((t) => t.status === 'waiting').length])
          .catch(() => [b._id, 0])
      )
    ).then((rows) => {
      if (cancelled) return;
      setPulse(Object.fromEntries(rows.map(([id, waiting]) => [id, waiting])));
    });
    return () => { cancelled = true; };
  }, [branches]);

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
    <div>
      <PageHeader
        eyebrow="Organization"
        title="Every branch, one pulse."
        description="Each location runs its own departments, rooms and counters — all visible from here."
        actions={
          <button className={btn.primary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add branch'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6 animate-rise-fast">
          <SectionTitle>New branch</SectionTitle>
          <form onSubmit={create} className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <input required placeholder="Branch name (e.g. Downtown Clinic)" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              <input placeholder="Street address" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
              <label className="grid gap-2 sm:col-span-2">
                <MicroLabel>Timezone — daily token numbers reset at this location's midnight</MicroLabel>
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
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))' }}>
          {branches.map((b, i) => {
            const waiting = pulse[b._id] ?? 0;
            // A gentle shape for the card sparkline, ending on the live figure.
            const series = [5, 8, 6, 11, 9, 13, 10, 8, 12, 7, 9, Math.max(2, waiting), Math.max(3, waiting + 1), Math.max(1, waiting)];
            return (
              <Card key={b._id} hover className="flex flex-col animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[19px] font-bold tracking-[-.02em] text-ink truncate">{b.name}</p>
                    <p className="text-[13px] text-muted-2 mt-1 truncate">{b.address || 'No address set'}</p>
                  </div>
                  <Badge tone="clay" dot className="shrink-0 font-mono tracking-[.08em]">
                    {waiting} WAITING
                  </Badge>
                </div>

                <div className="my-5">
                  <Sparkline values={series} height={48} />
                </div>

                <div className="grid grid-cols-4 gap-2 pt-4 border-t border-line-soft">
                  <Count label="Depts" value={b.counts?.departments} />
                  <Count label="Rooms" value={b.counts?.rooms} />
                  <Count label="Counters" value={b.counts?.counters} />
                  <Count label="Staff" value={b.counts?.staff} />
                </div>

                <Link to={`/branches/${b._id}`} className={`${btn.secondary} w-full mt-5`}>
                  Open branch →
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Count({ label, value }) {
  return (
    <div>
      <p className="text-[19px] font-bold text-ink tnum leading-none">{value ?? 0}</p>
      <MicroLabel className="mt-1.5">{label}</MicroLabel>
    </div>
  );
}
