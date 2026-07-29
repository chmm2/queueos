import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useBranchStore } from '../../store/branchStore';
import { useTerms } from '../../lib/terms';
import { roleInfo } from '../../lib/roles';
import { PageHeader, StatCard, Card } from '../../components/ui';
import { Icon, NAV_ICON } from '../../components/icons';

/**
 * Landing page for the console: a quick health read of the current branch and
 * shortcuts to what each role does most.
 */
export default function Overview() {
  const { user } = useAuthStore();
  const t = useTerms();
  const branchId = useBranchStore((s) => s.branchId);
  const branch = useBranchStore((s) => s.branches.find((b) => b._id === branchId));
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState({ waiting: 0, serving: 0 });

  useEffect(() => {
    if (!branchId) return;
    api.get(`/analytics/branch/${branchId}/summary`).then(({ data }) => setSummary(data)).catch(() => {});
    api.get(`/tokens/branch/${branchId}`).then(({ data }) => {
      setLive({
        waiting: data.tokens.filter((x) => x.status === 'waiting').length,
        serving: data.tokens.filter((x) => x.status === 'serving').length,
      });
    });
  }, [branchId]);

  const role = roleInfo(user?.role);

  const cards = [
    ['/call', 'Call next', `Serve the queue at your ${t.counter.toLowerCase()}`],
    ['/services', `Configure ${t.servicePlural.toLowerCase()}`, 'Queues, prefixes, priorities'],
    ['/counters', `Manage ${t.counterPlural.toLowerCase()}`, `Open ${t.counterPlural.toLowerCase()}, assign staff`],
    ['/displays', 'Displays & QR', 'Waiting-room board + join QR'],
  ];

  return (
    <div className="max-w-5xl mx-auto animate-rise">
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || ''}`}
        description={`${branch ? branch.name : 'Select a branch'} · live status`}
      />

      {/* Role explainer */}
      <div className="bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 mb-6">
        <p className="text-sm text-ink-800">
          You're signed in as <span className="font-semibold text-brand-700">{role.label}</span> — {role.tagline}.
        </p>
        <p className="text-sm text-ink-500 mt-0.5">{role.can}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Waiting now" value={live.waiting} accent />
        <StatCard label="Being served" value={live.serving} />
        <StatCard label="Avg wait (24h)" value={summary ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'} />
        <StatCard label="No-show rate" value={summary ? `${Math.round(summary.noShowRate * 100)}%` : '—'} />
      </div>

      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">Quick actions</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map(([to, title, desc]) => {
          const IconCmp = Icon[NAV_ICON[to]] || Icon.grid;
          return (
            <Link key={to} to={to} className="group">
              <Card className="transition group-hover:shadow-card-hover group-hover:border-brand-200 h-full">
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
    </div>
  );
}
