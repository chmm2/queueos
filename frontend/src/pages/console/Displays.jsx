import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useBranchStore } from '../../store/branchStore';
import { useTerms } from '../../lib/terms';
import { PageHeader, Card, SectionTitle, btn } from '../../components/ui';

/**
 * Displays & QR. Because Consultation and Pharmacy are in different physical
 * places, each AREA gets its own screen and its own QR. Pick an area (whole
 * branch, a zone, or a single service) and this shows that area's live QR and
 * a link to open its board full-screen.
 */
export default function Displays() {
  const branchId = useBranchStore((s) => s.branchId);
  const t = useTerms();
  const [zones, setZones] = useState([]);
  const [services, setServices] = useState([]);
  const [scope, setScope] = useState({ kind: 'branch', id: '', label: 'Whole branch' });
  const [qr, setQr] = useState(null);

  // Load the areas available for this branch.
  useEffect(() => {
    if (!branchId) return;
    setScope({ kind: 'branch', id: '', label: 'Whole branch' });
    Promise.all([
      api.get(`/zones/branch/${branchId}`).then((r) => r.data.zones),
      api.get(`/services/branch/${branchId}`).then((r) => r.data.services),
    ]).then(([z, s]) => { setZones(z); setServices(s); });
  }, [branchId]);

  const scopeQuery = scope.kind === 'zone' ? `?zone=${scope.id}` : scope.kind === 'service' ? `?service=${scope.id}` : '';

  const loadQr = useCallback(async () => {
    if (!branchId) return;
    const { data } = await api.get(`/branches/${branchId}/qr${scopeQuery}`);
    setQr(data);
  }, [branchId, scopeQuery]);

  useEffect(() => {
    loadQr();
    const id = setInterval(loadQr, 30000);
    return () => clearInterval(id);
  }, [loadQr]);

  if (!branchId) return <p className="text-sm text-ink-400 max-w-4xl mx-auto">Select a branch from the top bar first.</p>;

  const boardUrl = `/board/${branchId}${scopeQuery}`;

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader title="Displays & QR" description="Each physical area gets its own screen and its own QR. Pick an area below." />

      {/* Area picker */}
      <Card className="mb-4">
        <SectionTitle>Area</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Chip active={scope.kind === 'branch'} onClick={() => setScope({ kind: 'branch', id: '', label: 'Whole branch' })}>
            Whole branch
          </Chip>
          {zones.map((z) => (
            <Chip key={z._id} active={scope.kind === 'zone' && scope.id === z._id} onClick={() => setScope({ kind: 'zone', id: z._id, label: z.name })}>
              {z.name}
            </Chip>
          ))}
        </div>
        {zones.length === 0 && (
          <p className="text-xs text-ink-400 mt-3">
            No areas defined yet — showing the whole branch. Create areas below to give each part of your venue its own screen &amp; QR.
          </p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="text-center flex flex-col">
          <SectionTitle>Join QR — {scope.label}</SectionTitle>
          <p className="text-sm text-ink-500 -mt-2 mb-4">Print or display this at the {scope.label.toLowerCase()}. Scanning it joins that area's queue.</p>
          {qr ? (
            <>
              <div className="bg-white border border-ink-200 rounded-2xl p-4 inline-block mx-auto">
                <img src={qr.dataUrl} alt="Join QR code" className="w-52 h-52" />
              </div>
              <p className="text-xs text-ink-400 mt-3">Refreshes every {qr.expiresInSeconds}s for security</p>
              <a href={qr.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-700 mt-1">Open the join page ↗</a>
            </>
          ) : (
            <div className="py-16"><div className="w-6 h-6 mx-auto rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin" /></div>
          )}
        </Card>

        <Card className="flex flex-col">
          <SectionTitle>Waiting screen — {scope.label}</SectionTitle>
          <p className="text-sm text-ink-500 -mt-2 mb-4">Open this full-screen on the display in the {scope.label.toLowerCase()}.</p>
          <div className="flex-1 bg-[#0c0d13] rounded-2xl grid place-items-center min-h-[180px] mb-4">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500 mb-2">{scope.label}</p>
              <p className="text-4xl font-bold text-amber-300 tnum">A-042</p>
            </div>
          </div>
          <a href={boardUrl} target="_blank" rel="noreferrer" className={`${btn.primary} w-full`}>Open this screen ↗</a>
        </Card>
      </div>

      <ZoneManager branchId={branchId} services={services} zones={zones} term={t.servicePlural} onChange={(z) => setZones(z)} />
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
        active ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 text-ink-600 hover:border-ink-300'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Lightweight zone (area) management — create a named area from a set of
 * services, e.g. group Lab + X-Ray into "Diagnostics".
 */
function ZoneManager({ branchId, services, zones, term, onChange }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);

  const reload = () => api.get(`/zones/branch/${branchId}`).then((r) => onChange(r.data.zones));

  async function create(e) {
    e.preventDefault();
    if (!name || picked.length === 0) return;
    await api.post('/zones', { branch: branchId, name, services: picked });
    setName(''); setPicked([]);
    reload();
  }
  async function remove(id) {
    await api.delete(`/zones/${id}`);
    reload();
  }
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card>
      <SectionTitle>Areas (zones)</SectionTitle>
      <p className="text-sm text-ink-500 -mt-2 mb-4">Group services that share a physical space and one screen. Each area gets its own QR.</p>

      <div className="space-y-2 mb-5">
        {zones.map((z) => (
          <div key={z._id} className="flex items-center justify-between border border-ink-100 rounded-xl px-4 py-3">
            <div>
              <p className="font-medium text-ink-900">{z.name}</p>
              <p className="text-xs text-ink-400">{(z.services || []).map((s) => s.name).join(', ') || 'No services'}</p>
            </div>
            <button onClick={() => remove(z._id)} className="text-sm text-ink-400 hover:text-red-600">Remove</button>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-ink-400">No areas yet.</p>}
      </div>

      <form onSubmit={create} className="grid gap-3">
        <input className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 text-sm" placeholder="Area name (e.g. Diagnostics)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button key={s._id} type="button" onClick={() => toggle(s._id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${picked.includes(s._id) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-ink-200 text-ink-600'}`}>
              {s.name}
            </button>
          ))}
        </div>
        <div><button className={btn.primary} disabled={!name || !picked.length}>Create area</button></div>
      </form>
    </Card>
  );
}
