import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, StatCard, SectionTitle, Badge, btn } from '../../components/ui';

/**
 * Smart-ETA panel: shows the self-learning model's state. While "collecting",
 * a progress bar tracks real visits toward activation. Once "active", it shows
 * measured accuracy. The model trains only on this org's own real data.
 */
function SmartEta() {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'Admin';
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const MIN = 120; // must match ETA_MIN_SAMPLES on the ML service

  const load = () => api.get('/analytics/model').then(({ data }) => setM(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function trainNow() {
    setBusy(true);
    try {
      const { data } = await api.post('/analytics/model/train');
      toast[data.active ? 'success' : 'info'](data.reason);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Training failed');
    } finally {
      setBusy(false);
    }
  }

  if (!m) return null;
  const active = m.status === 'active';
  const pct = Math.min(100, Math.round((m.sampleCount / MIN) * 100));

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[0.95rem] font-semibold text-ink-800">Smart ETA</h2>
            <Badge tone={active ? 'success' : 'warning'}>{active ? 'Active' : 'Learning'}</Badge>
          </div>
          <p className="text-sm text-ink-500 mt-1 max-w-lg">
            {active
              ? `Predictions are trained on your real visits — accurate within ~${Math.round((m.maeSeconds || 0) / 60)} min on ${Math.round((m.accuracy || 0) * 100)}% of visits.`
              : 'Until the model has learned your real patterns accurately, wait times use a transparent estimate from your own service times.'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={trainNow} disabled={busy} className={btn.secondary}>
            {busy ? 'Training…' : 'Train now'}
          </button>
        )}
      </div>

      {!active && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-ink-400 mb-1.5">
            <span>{m.sampleCount} real visits collected</span>
            <span>activates at {MIN}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-400 mt-2">{m.reason}</p>
        </div>
      )}
    </Card>
  );
}

/**
 * Analytics for the selected branch (last 24h). Recharts renders hourly volume
 * and the outcome breakdown; stat tiles surface wait/service times and
 * no-show / abandonment rates.
 */
export default function Analytics() {
  const branchId = useBranchStore((s) => s.branchId);
  const [summary, setSummary] = useState(null);
  const [hourly, setHourly] = useState([]);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/analytics/branch/${branchId}/summary`).then(({ data }) => setSummary(data)).catch(() => {});
    api.get(`/analytics/branch/${branchId}/hourly`).then(({ data }) =>
      setHourly(data.hourly.map((h) => ({ hour: `${h.hour}:00`, tokens: h.count })))
    ).catch(() => {});
  }, [branchId]);

  if (!branchId) return <p className="text-sm text-ink-400 max-w-4xl mx-auto">Select a branch from the top bar first.</p>;

  const outcomes = summary
    ? [
        { name: 'Completed', value: summary.completedCount, color: '#059669' },
        { name: 'Missed', value: summary.missedCount, color: '#dc2626' },
        { name: 'Cancelled', value: summary.cancelledCount, color: '#9aa1b2' },
      ]
    : [];

  const axis = { fontSize: 11, fill: '#9aa1b2' };

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader title="Analytics" description="Performance for the selected branch over the last 24 hours." />

      <SmartEta />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total issued" value={summary?.totalIssued ?? '—'} />
        <StatCard label="Avg wait" value={summary ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'} accent />
        <StatCard label="Avg service" value={summary ? `${Math.round(summary.avgServiceSeconds / 60)}m` : '—'} />
        <StatCard label="No-show rate" value={summary ? `${Math.round(summary.noShowRate * 100)}%` : '—'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>Tokens issued by hour</SectionTitle>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={hourly} margin={{ left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="hour" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f4f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e4e7ee', fontSize: 13 }} />
              <Bar dataKey="tokens" fill="#4f52e0" radius={[5, 5, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionTitle>Outcomes</SectionTitle>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={outcomes} margin={{ left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f4f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e4e7ee', fontSize: 13 }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={48}>
                {outcomes.map((o) => <Cell key={o.name} fill={o.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
