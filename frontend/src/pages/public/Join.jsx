import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import publicApi from '../../api/publicClient';
import Logo from '../../components/Logo';

/**
 * The customer join flow — opened by scanning the QR on a room's wall. Because
 * the QR is scoped to that room, the customer only sees the departments served
 * there, and the picker disappears entirely when the room handles just one.
 */
export default function Join() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const qrToken = params.get('t');
  const roomId = params.get('room');
  const departmentParam = params.get('department');
  const navigate = useNavigate();

  const [config, setConfig] = useState(null);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (roomId) q.set('room', roomId);
    if (departmentParam) q.set('department', departmentParam);
    publicApi
      .get(`/branch/${branchId}/config?${q.toString()}`)
      .then(({ data }) => {
        setConfig(data);
        if (data.departments.length === 1) setDepartmentId(data.departments[0]._id);
      })
      .catch(() => setFatal('This location could not be found. Please re-scan the code at the venue.'));
  }, [branchId, roomId, departmentParam]);

  async function requestOtp() {
    setError('');
    try {
      const { data } = await publicApi.post('/otp/request', { phone });
      setOtpSent(true);
      if (data.devCode) setDevCode(data.devCode);
    } catch {
      setError('Could not send the code. Check the number and try again.');
    }
  }

  function getGeo() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!departmentId) return setError('Please choose what you need first.');
    setError('');
    setSubmitting(true);
    try {
      const geo = config?.policy?.requireGeofence ? await getGeo() : undefined;
      const { data } = await publicApi.post('/join', {
        branchId, departmentId, roomId, qrToken,
        customerName: name, customerPhone: phone,
        otp: otp || undefined, geo,
      });
      localStorage.setItem(`qtoken:${data.tokenId}`, data.sessionToken);
      localStorage.setItem(`qtoken:${data.tokenId}:startpos`, String(data.position));
      navigate(`/t/${data.tokenId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join the queue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (fatal) {
    return (
      <Shell>
        <div className="bg-surface border border-line rounded-[22px] shadow-card p-8 text-center animate-rise">
          <p className="font-semibold text-ink">Location not found</p>
          <p className="text-[14px] text-muted mt-2">{fatal}</p>
        </div>
      </Shell>
    );
  }

  if (!config) {
    return (
      <Shell>
        <div className="bg-surface border border-line rounded-[22px] shadow-card p-10 text-center">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-line border-t-espresso animate-spin" />
        </div>
      </Shell>
    );
  }

  const needsOtp = config.policy.requireOtp;
  const inputCls =
    'w-full px-4 py-3.5 rounded-[11px] border border-line-input bg-surface-sunken text-[15px] text-ink placeholder-muted-3 transition-colors';
  const customer = config.organization?.terminology?.customer || 'Customer';

  return (
    <Shell org={config.organization.name} branch={config.branch.name}>
      <form
        onSubmit={submit}
        className="bg-surface border border-line rounded-[22px] shadow-card p-6 sm:p-7 animate-rise"
        style={{ animationDelay: '60ms' }}
      >
        <h1 className="text-[26px] leading-tight font-bold tracking-[-.03em] text-ink">
          {config.area ? `Join the ${config.area} queue` : 'Join the queue'}
        </h1>
        <p className="text-[14px] text-muted mt-2 mb-6">
          Take your place, then wait wherever you like — we'll tell you when you're up.
        </p>

        {config.departments.length > 1 && (
          <>
            <p className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3 mb-2.5">
              What are you here for?
            </p>
            <div className="grid gap-2 mb-6">
              {config.departments.map((d) => {
                const active = departmentId === d._id;
                return (
                  <button
                    type="button"
                    key={d._id}
                    onClick={() => setDepartmentId(d._id)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-[13px] border text-left transition-all ${
                      active
                        ? 'bg-espresso border-espresso text-paper'
                        : 'bg-surface-sunken border-line-input hover:border-line-strong'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-[9px] grid place-items-center font-mono text-[12px] font-semibold ${
                          active ? 'bg-paper/15 text-paper' : 'bg-espresso-tint text-espresso'
                        }`}
                      >
                        {d.tokenPrefix}
                      </span>
                      <span className="text-[15px] font-semibold">{d.name}</span>
                    </span>
                    <span className={`w-[18px] h-[18px] rounded-full border-2 grid place-items-center ${
                      active ? 'border-paper' : 'border-line-strong'
                    }`}>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-paper" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3">Your name</span>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </label>

          <label className="grid gap-2">
            <span className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3">
              Mobile {needsOtp ? '· verification required' : '· for updates'}
            </span>
            <input
              className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 012 3456" required={needsOtp} inputMode="tel"
            />
          </label>

          {needsOtp && (
            <div className="grid gap-2">
              {!otpSent ? (
                <button type="button" onClick={requestOtp} disabled={!phone}
                  className="px-4 py-3 rounded-[11px] border border-clay-tint-border bg-clay-tint text-clay-ink text-[14px] font-semibold disabled:opacity-40">
                  Send verification code
                </button>
              ) : (
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3">
                    Enter the 6-digit code
                  </span>
                  <input className={`${inputCls} font-mono tracking-[.35em] text-center`} value={otp}
                    onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} />
                  {devCode && (
                    <span className="font-mono text-[11px] text-muted-3">Demo code: <b className="text-muted">{devCode}</b></span>
                  )}
                </label>
              )}
            </div>
          )}

          {config.policy.requireGeofence && (
            <p className="text-[12px] text-muted-3 leading-relaxed">
              This venue asks you to confirm you're on-site — your browser will request your location once.
            </p>
          )}

          {error && (
            <p className="text-[14px] text-clay-ink bg-clay-tint border border-clay-tint-border rounded-[11px] px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || (needsOtp && !otp)}
            className="w-full py-4 rounded-[13px] bg-espresso hover:bg-espresso-hover text-paper text-[15px] font-semibold transition-colors disabled:opacity-45 active:scale-[.99]"
          >
            {submitting ? 'Getting your place…' : 'Get my place in line →'}
          </button>
        </div>
      </form>

      <p className="font-mono text-[10px] tracking-[.2em] uppercase text-muted-3 text-center mt-6">
        no app · no account · keep your place from your seat
      </p>
    </Shell>
  );
}

function Shell({ children, org, branch }) {
  return (
    <div className="relative min-h-screen bg-paper flex flex-col items-center px-5 py-10 sm:justify-center">
      <div className="absolute inset-0 paper-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(70% 50% at 50% 28%, #FFFDF8, transparent 70%)' }}
      />
      <div className="relative w-full max-w-[440px]">
        <div className="flex items-center gap-3 mb-5 animate-rise">
          <Logo size="badge" />
          {org && (
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{org}</p>
              <p className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3 truncate">{branch}</p>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
