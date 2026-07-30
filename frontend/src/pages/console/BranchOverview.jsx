import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import { useBranchStore } from '../../store/branchStore';
import { PageHeader, Card, StatCard, SectionTitle, btn, field } from '../../components/ui';
import { Icon, NAV_ICON } from '../../components/icons';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Branch home: live numbers, shortcuts into the branch's own sections, and the
 * location's settings (address, timezone, opening hours).
 */
export default function BranchOverview() {
  const { branchId } = useParams();
  const setBranches = useBranchStore((s) => s.setBranches);
  const [branch, setBranch] = useState(null);
  const [live, setLive] = useState({ waiting: 0, serving: 0 });
  const [summary, setSummary] = useState(null);
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
  }, [branchId]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.patch(`/branches/${branchId}`, {
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        timezone: branch.timezone,
        openingHours: branch.openingHours,
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

  function setHour(day, patch) {
    setBranch((b) => ({
      ...b,
      openingHours: b.openingHours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    }));
  }

  if (!branch) return <p className="text-sm text-ink-400">Loading…</p>;

  const sections = [
    ['departments', 'Departments', 'The queues this branch offers'],
    ['rooms', 'Rooms & Counters', 'Physical spaces and the desk logins inside them'],
    ['displays', 'Displays & QR', 'A screen and join code per room'],
    ['analytics', 'Analytics', 'Wait times, volume and no-shows'],
  ];

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader title={branch.name} description={branch.address || 'No address set'} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Waiting now" value={live.waiting} accent />
        <StatCard label="Being served" value={live.serving} />
        <StatCard label="Avg wait (24h)" value={summary ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'} />
        <StatCard label="No-show rate" value={summary ? `${Math.round(summary.noShowRate * 100)}%` : '—'} />
      </div>

      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">Configure this branch</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {sections.map(([seg, title, desc]) => {
          const IconCmp = Icon[NAV_ICON[seg]] || Icon.grid;
          return (
            <Link key={seg} to={`/branches/${branchId}/${seg}`} className="group">
              <Card className="h-full transition group-hover:shadow-card-hover group-hover:border-brand-200">
                <div className="flex items-start gap-4">
                  <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 grid place-items-center shrink-0">
                    <IconCmp />
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{title}</p>
                    <p className="text-sm text-ink-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <SectionTitle>Location settings</SectionTitle>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={field} value={branch.name || ''} onChange={(e) => setBranch({ ...branch, name: e.target.value })} placeholder="Branch name" />
            <input className={field} value={branch.address || ''} onChange={(e) => setBranch({ ...branch, address: e.target.value })} placeholder="Address" />
            <input className={field} value={branch.phone || ''} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} placeholder="Phone" />
            <input className={field} value={branch.timezone || ''} onChange={(e) => setBranch({ ...branch, timezone: e.target.value })} placeholder="Timezone (e.g. Asia/Kolkata)" />
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink-600 mb-2">Opening hours</p>
            <div className="space-y-1.5">
              {(branch.openingHours || []).map((h) => (
                <div key={h.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-ink-600">{DAYS[h.day]}</span>
                  <label className="flex items-center gap-1.5 text-xs text-ink-500">
                    <input type="checkbox" checked={!h.isClosed} onChange={(e) => setHour(h.day, { isClosed: !e.target.checked })} />
                    Open
                  </label>
                  <input type="time" value={h.open} disabled={h.isClosed}
                    onChange={(e) => setHour(h.day, { open: e.target.value })}
                    className="px-2 py-1 rounded-lg border border-ink-200 text-sm disabled:opacity-40" />
                  <span className="text-ink-400">–</span>
                  <input type="time" value={h.close} disabled={h.isClosed}
                    onChange={(e) => setHour(h.day, { close: e.target.value })}
                    className="px-2 py-1 rounded-lg border border-ink-200 text-sm disabled:opacity-40" />
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
