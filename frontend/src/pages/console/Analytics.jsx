import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import {
  PageHeader, Card, StatCard, SectionTitle, MicroLabel, btn,
} from '../../components/ui';

/**
 * Analytics for a branch over the last 24 hours, plus the state of the
 * self-learning ETA model.
 */
export default function Analytics() {
  const { branchId } = useParams();
  const [summary, setSummary] = useState(null);
  const [hourly, setHourly] = useState([]);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/analytics/branch/${branchId}/summary`).then(({ data }) => setSummary(data)).catch(() => {});
    api.get(`/analytics/branch/${branchId}/hourly`)
      .then(({ data }) => setHourly(data.hourly))
      .catch(() => {});
  }, [branchId]);

  const outcomes = summary
    ? [
        { name: 'Completed', value: summary.completedCount, tone: 'bg-success' },
        { name: 'Missed', value: summary.missedCount, tone: 'bg-warning' },
        { name: 'Cancelled', value: summary.cancelledCount, tone: 'bg-clay' },
      ]
    : [];
  const outcomeTotal = Math.max(1, outcomes.reduce((s, o) => s + o.value, 0));
  const peak = Math.max(1, ...hourly.map((h) => h.count));

  return (
    <div>
      <PageHeader
        eyebrow="Last 24 hours"
        title="The day, measured."
        description="Volume, wait times and outcomes for this branch."
      />

      <SmartEta />

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <StatCard label="Total issued" value={summary?.totalIssued ?? '—'} />
        <StatCard label="Avg wait" value={summary ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'} />
        <StatCard label="Avg service" value={summary ? `${Math.round(summary.avgServiceSeconds / 60)}m` : '—'} />
        <StatCard
          label="No-show rate"
          value={summary ? `${Math.round(summary.noShowRate * 100)}%` : '—'}
          delta={summary && summary.noShowRate <= 0.05 ? 'healthy' : ''}
          deltaTone="success"
        />
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <Card>
          <SectionTitle>Tokens issued by hour</SectionTitle>
          {hourly.length === 0 ? (
            <p className="text-[14px] text-muted-2 py-16 text-center">No tokens issued yet today.</p>
          ) : (
            <>
              <div className="flex items-end gap-2" style={{ height: 210 }}>
                {hourly.map((h, i) => (
                  <div key={h.hour} className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className="w-full rounded-t-[5px] bg-espresso origin-bottom animate-grow"
                      style={{ height: `${Math.max(4, (h.count / peak) * 100)}%`, animationDelay: `${i * 45}ms` }}
                      title={`${h.count} at ${h.hour}:00`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {hourly.map((h) => (
                  <span key={h.hour} className="flex-1 text-center font-mono text-[10px] text-muted-3">
                    {String(h.hour).padStart(2, '0')}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <SectionTitle>Outcomes</SectionTitle>
          <div className="space-y-5">
            {outcomes.map((o, i) => {
              const pct = Math.round((o.value / outcomeTotal) * 100);
              return (
                <div key={o.name}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[14px] text-ink-2">{o.name}</span>
                    <span className="font-mono text-[13px] text-muted">
                      {o.value} <span className="text-muted-3">· {pct}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-pill bg-espresso-tint overflow-hidden">
                    <div
                      className={`h-full rounded-pill ${o.tone} transition-all duration-700`}
                      style={{ width: `${pct}%`, transitionDelay: `${i * 90}ms` }}
                    />
                  </div>
                </div>
              );
            })}
            {outcomes.length === 0 && (
              <p className="text-[14px] text-muted-2 py-8 text-center">Nothing completed yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Smart ETA banner — espresso card, paper text. While "learning" it shows how
 * far the org is from having a model trained on its own real visits.
 */
function SmartEta() {
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const MIN = 120; // matches ETA_MIN_SAMPLES on the ML service

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
    <div className="bg-espresso rounded-card p-7 mb-8 animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[19px] font-bold tracking-[-.02em] text-paper">Smart ETA</h2>
            <span
              className={`px-2.5 py-[3px] rounded-pill text-[11px] font-bold ${
                active ? 'bg-success/25 text-[#9FD3B4]' : 'bg-board-amber/20 text-board-amber'
              }`}
            >
              {active ? 'Active' : 'Learning'}
            </span>
          </div>
          <p className="text-[15px] text-paper/65 mt-2 max-w-xl leading-relaxed">
            {active
              ? `Predictions are trained on your real visits — accurate within about ${Math.round((m.maeSeconds || 0) / 60)} minutes on ${Math.round((m.accuracy || 0) * 100)}% of them.`
              : 'Until the model has your real rhythm, wait times come from a transparent estimate built on your own service durations.'}
          </p>
        </div>
        <button
          onClick={trainNow}
          disabled={busy}
          className="shrink-0 px-5 py-2.5 rounded-[11px] bg-paper hover:bg-surface text-espresso text-[14px] font-semibold transition-colors disabled:opacity-50"
        >
          {busy ? 'Training…' : 'Train now'}
        </button>
      </div>

      {!active && (
        <div className="mt-6">
          <div className="flex justify-between font-mono text-[11px] text-paper/45 mb-2">
            <span>{m.sampleCount} real visits collected</span>
            <span>activates at {MIN}</span>
          </div>
          <div className="h-2 rounded-pill bg-paper/10 overflow-hidden">
            <div className="h-full rounded-pill bg-board-amber transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
