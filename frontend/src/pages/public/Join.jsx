import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import publicApi from '../../api/publicClient';

/**
 * The customer join flow — the public face of the product, opened from a
 * scanned branch QR. Picks a service (tappable cards, not a dropdown),
 * collects what the org's policy requires (OTP / location), and issues a
 * token. Branded with the organization's accent color.
 */
export default function Join() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const qrToken = params.get('t');
  const zone = params.get('zone');
  const service = params.get('service');
  const navigate = useNavigate();

  const [config, setConfig] = useState(null);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (zone) q.set('zone', zone);
    if (service) q.set('service', service);
    publicApi
      .get(`/branch/${branchId}/config?${q.toString()}`)
      .then(({ data }) => {
        setConfig(data);
        // If the scanned area has exactly one service, pre-select it.
        if (data.services.length === 1) setServiceId(data.services[0]._id);
      })
      .catch(() => setFatal('This location could not be found. Please re-scan the QR code at the venue.'));
  }, [branchId, zone, service]);

  const accent = config?.organization?.brandColor || '#4f52e0';

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
    if (!serviceId) return setError('Please choose a service.');
    setError('');
    setSubmitting(true);
    try {
      const geo = config?.policy?.requireGeofence ? await getGeo() : undefined;
      const { data } = await publicApi.post('/join', {
        branchId,
        serviceId,
        qrToken,
        customerName: name,
        customerPhone: phone,
        otp: otp || undefined,
        geo,
      });
      // Session + starting position: the tracking page uses these.
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
        <div className="bg-white rounded-2xl shadow-card border border-ink-200/70 p-8 text-center animate-rise">
          <p className="text-ink-700 font-medium">Location not found</p>
          <p className="text-sm text-ink-500 mt-2">{fatal}</p>
        </div>
      </Shell>
    );
  }

  if (!config) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow-card border border-ink-200/70 p-8 text-center">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin" />
          <p className="text-sm text-ink-400 mt-3">Loading…</p>
        </div>
      </Shell>
    );
  }

  const needsOtp = config.policy.requireOtp;
  const inputCls =
    'w-full px-4 py-3 rounded-xl border border-ink-200 bg-white text-[15px] text-ink-800 placeholder-ink-400 transition focus:border-brand-400';

  return (
    <Shell>
      {/* Org identity */}
      <div className="flex items-center gap-3 mb-5 animate-rise">
        <span
          className="w-11 h-11 rounded-xl grid place-items-center text-white font-bold text-lg shadow-sm shrink-0"
          style={{ background: accent }}
        >
          {config.organization.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 truncate">{config.organization.name}</p>
          <p className="text-sm text-ink-500 truncate">{config.branch.name}</p>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl shadow-card border border-ink-200/70 p-6 sm:p-7 animate-rise" style={{ animationDelay: '60ms' }}>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 mb-1">
          {config.area ? `Join the ${config.area} queue` : 'Join the queue'}
        </h1>
        <p className="text-sm text-ink-500 mb-6">Get your place in line — we'll keep you updated live.</p>

        {/* Service picker: tappable cards (hidden when the area has just one) */}
        {config.services.length > 1 && <p className="text-[13px] font-medium text-ink-600 mb-2">Choose a service</p>}
        <div className={`grid gap-2 mb-6 ${config.services.length === 1 ? 'hidden' : ''}`}>
          {config.services.map((s) => {
            const active = serviceId === s._id;
            return (
              <button
                type="button"
                key={s._id}
                onClick={() => setServiceId(s._id)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                  active ? 'border-transparent ring-2' : 'border-ink-200 hover:border-ink-300'
                }`}
                style={active ? { '--tw-ring-color': accent, background: `${accent}0d` } : undefined}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`w-8 h-8 rounded-lg grid place-items-center text-xs font-bold ${active ? 'text-white' : 'text-ink-500 bg-ink-100'}`}
                    style={active ? { background: accent } : undefined}
                  >
                    {s.tokenPrefix}
                  </span>
                  <span className={`text-[15px] font-medium ${active ? 'text-ink-900' : 'text-ink-700'}`}>{s.name}</span>
                </span>
                <span
                  className={`w-[18px] h-[18px] rounded-full border-2 grid place-items-center ${active ? 'border-transparent' : 'border-ink-300'}`}
                  style={active ? { background: accent } : undefined}
                >
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-ink-600">Your name</span>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-ink-600">
              Mobile number{' '}
              {needsOtp ? <span style={{ color: accent }}>· verification required</span> : <span className="text-ink-400">· for updates</span>}
            </span>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 012 3456"
              required={needsOtp}
              inputMode="tel"
            />
          </label>

          {needsOtp && (
            <div className="grid gap-2">
              {!otpSent ? (
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={!phone}
                  className="px-4 py-2.5 rounded-xl border text-sm font-medium transition disabled:opacity-40"
                  style={{ borderColor: accent, color: accent }}
                >
                  Send verification code
                </button>
              ) : (
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-medium text-ink-600">Enter the 6-digit code</span>
                  <input className={`${inputCls} tracking-[0.35em] text-center font-semibold`} value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} />
                  {devCode && (
                    <span className="text-xs text-ink-400">
                      Demo code: <b className="text-ink-600">{devCode}</b>
                    </span>
                  )}
                </label>
              )}
            </div>
          )}

          {config.policy.requireGeofence && (
            <p className="text-xs text-ink-400 leading-relaxed">
              This venue asks you to confirm you're on-site — your browser will request your location once.
            </p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

          <button
            type="submit"
            disabled={submitting || (needsOtp && !otp)}
            className="w-full py-3.5 rounded-xl text-white text-[15px] font-semibold transition shadow-sm disabled:opacity-50 active:scale-[.99]"
            style={{ background: accent }}
          >
            {submitting ? 'Getting your spot…' : 'Get my spot in line'}
          </button>
        </div>
      </form>

      <Footer />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col items-center px-4 py-8 sm:justify-center">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function Footer() {
  return (
    <p className="text-center text-xs text-ink-400 mt-6">
      Powered by <span className="font-semibold text-ink-500">QueueOS</span> · no app required
    </p>
  );
}
