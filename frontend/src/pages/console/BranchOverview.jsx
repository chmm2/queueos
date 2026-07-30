import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import { useBranchStore } from '../../store/branchStore';
import {
  PageHeader, Card, StatCard, SectionTitle, MicroLabel, Badge, btn, field,
} from '../../components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Branch home: the room in one glance, shortcuts into each configuration
 * surface, and the location's own settings.
 */
export default function BranchOverview() {
  const { branchId } = useParams();
  const setBranches = useBranchStore((s) => s.setBranches);
  const [branch, setBranch] = useState(null);
  const [live, setLive] = useState({ waiting: 0, serving: 0 });
  const [summary, setSummary] = useState(null);
  const [counts, setCounts] = useState({ departments: 0, rooms: 0, counters: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}`).then(({ data }) => setBranch(data.branch)).catch(() => {});
    api.get(`/analytics/branch/${branchId}/summary`).then(({ data }) => setSummary(data)).catch(() => {});
    api.get(`/tokens/branch/${branchId}`).then(({ data }) => {
      setLive({
        waiting: data.tokens.filter((t) => t.status === 'waiting').length,
        serving: data.tokens.filter((t) => t.status === 'serving').length,
      });
    }).catch(() => {});
    Promise.all([
      api.get(`/departments/branch/${branchId}`).then((r) => r.data.departments.length).catch(() => 0),
      api.get(`/rooms/branch/${branchId}`).then((r) => r.data.rooms).catch(() => []),
    ]).then(([departments, rooms]) => {
      setCounts({
        departments,
        rooms: rooms.length,
        counters: rooms.reduce((n, r) => n + (r.counters?.length || 0), 0),
      });
    });
  }, [branchId]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.patch(`/branches/${branchId}`, {
        name: branch.name, address: branch.address, phone: branch.phone,
        timezone: branch.timezone, openingHours: branch.openingHours,
      });
      setBranch(data.branch);
      const list = await api.get('/branches');
      setBranches(list.data.branches);
      toast.success('Branch settings saved');
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const setHour = (day, patch) =>
    setBranch((b) => ({
      ...b,
      openingHours: b.openingHours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    }));

  if (!branch) return <p className="text-sm text-muted-2">Loading…</p>;

  const cards = [
    ['departments', 'Departments', 'The queues this branch offers.', 'espresso'],
    ['rooms', 'Rooms & Counters', 'Physical spaces and the desk logins inside them.', 'espresso'],
    ['analytics', 'Analytics', 'Wait times, volume and no-shows.', 'clay'],
    ['displays', 'Displays & QR', 'A screen and join code for every room.', 'clay'],
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Branch control"
        title={branch.name}
        description={`${counts.departments} departments awake. ${counts.counters} counters listening. Here's the room in one glance.`}
      />

      <div className="grid gap-4 mb-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <StatCard label="Waiting now" value={live.waiting} delta={live.waiting === 0 ? 'clear' : 'in line'} deltaTone={live.waiting === 0 ? 'success' : 'muted'} />
        <StatCard label="Being served" value={live.serving} delta={live.serving === 0 ? 'idle' : 'active'} deltaTone="muted" />
        <StatCard label="Avg wait (24h)" value={summary ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'} delta={summary?.completedCount ? `${summary.completedCount} served` : 'no data yet'} deltaTone="muted" />
        <StatCard label="No-show rate" value={summary ? `${Math.round(summary.noShowRate * 100)}%` : '—'} accent="clay" delta={summary && summary.noShowRate === 0 ? 'steady' : ''} deltaTone="clay" />
      </div>

      <MicroLabel className="mb-4">Configure this branch</MicroLabel>
      <div className="grid gap-4 mb-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        {cards.map(([seg, title, desc, tone], i) => (
          <Link key={seg} to={`/branches/${branchId}/${seg}`} className="block">
            <Card hover className="h-full animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
              <span
                className={`w-11 h-11 rounded-[13px] grid place-items-center mb-4 border ${
                  tone === 'clay'
                    ? 'bg-clay-tint border-clay-tint-border text-clay'
                    : 'bg-espresso-tint border-espresso-tint-border text-espresso'
                }`}
              >
                <span className="w-2 h-2 rounded-[3px] bg-current" />
              </span>
              <p className="text-[17px] font-bold tracking-[-.02em] text-ink">{title}</p>
              <p className="text-[14px] text-muted mt-1.5">{desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <SectionTitle>Location settings</SectionTitle>
        <form onSubmit={save} className="grid gap-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="grid gap-2">
              <MicroLabel>Name</MicroLabel>
              <input className={field} value={branch.name || ''} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
            </label>
            <label className="grid gap-2">
              <MicroLabel>Street address</MicroLabel>
              <input className={field} value={branch.address || ''} onChange={(e) => setBranch({ ...branch, address: e.target.value })} />
            </label>
            <label className="grid gap-2">
              <MicroLabel>Phone</MicroLabel>
              <input className={field} value={branch.phone || ''} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} />
            </label>
            <label className="grid gap-2">
              <MicroLabel>Timezone</MicroLabel>
              <input className={field} value={branch.timezone || ''} onChange={(e) => setBranch({ ...branch, timezone: e.target.value })} />
            </label>
          </div>

          <div>
            <MicroLabel className="mb-3">Opening hours</MicroLabel>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
              {(branch.openingHours || []).map((h) => (
                <div key={h.day} className="flex items-center gap-3 py-2 border-b border-line-soft">
                  <span className="text-[14px] text-ink-2 w-[104px] shrink-0">{DAYS[h.day]}</span>
                  <button
                    type="button"
                    onClick={() => setHour(h.day, { isClosed: !h.isClosed })}
                    className="shrink-0"
                  >
                    <Badge tone={h.isClosed ? 'neutral' : 'success'}>{h.isClosed ? 'Closed' : 'Open'}</Badge>
                  </button>
                  <div className="ml-auto flex items-center gap-1.5">
                    {h.isClosed ? (
                      <span className="font-mono text-[13px] text-muted-3">—</span>
                    ) : (
                      <>
                        <input type="time" value={h.open} onChange={(e) => setHour(h.day, { open: e.target.value })}
                          className="font-mono text-[13px] px-2 py-1 rounded-[8px] border border-line-input bg-surface-sunken" />
                        <span className="text-muted-3">—</span>
                        <input type="time" value={h.close} onChange={(e) => setHour(h.day, { close: e.target.value })}
                          className="font-mono text-[13px] px-2 py-1 rounded-[8px] border border-line-input bg-surface-sunken" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div><button disabled={busy} className={btn.primary}>Save settings</button></div>
        </form>
      </Card>
    </div>
  );
}
