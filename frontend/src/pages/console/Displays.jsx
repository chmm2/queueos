import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import Logo from '../../components/Logo';
import { PageHeader, Card, EmptyState, MicroLabel, btn } from '../../components/ui';

/**
 * Displays & QR — one screen and one join code per ROOM.
 *
 * This is the point of modelling rooms: the Registration screen shows only
 * Registration, and the QR on its wall drops customers straight into that
 * queue. Nothing from Pharmacy leaks onto it.
 */
export default function Displays() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const [rooms, setRooms] = useState([]);
  const [selected, setSelected] = useState(params.get('room') || '');
  const [qr, setQr] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.get(`/rooms/branch/${branchId}`).then(({ data }) => {
      setRooms(data.rooms);
      setSelected((s) => s || data.rooms[0]?._id || '');
    });
  }, [branchId]);

  const scope = selected ? `?room=${selected}` : '';

  const loadQr = useCallback(async () => {
    if (!branchId) return;
    const { data } = await api.get(`/branches/${branchId}/qr${scope}`);
    setQr(data);
  }, [branchId, scope]);

  useEffect(() => {
    loadQr();
    const id = setInterval(loadQr, 30000); // keep the rotating code fresh
    return () => clearInterval(id);
  }, [loadQr]);

  // A small live read so the preview shows something real.
  useEffect(() => {
    if (!branchId) return;
    const load = () =>
      api.get(`/public/board/${branchId}${scope}`)
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [branchId, scope]);

  const room = rooms.find((r) => r._id === selected);
  const label = room ? room.name : 'Whole branch';
  const boardUrl = `/board/${branchId}${scope}`;

  const nowServing = preview?.departments?.flatMap((d) => d.nowServing) || [];
  const firstToken = nowServing[0]?.tokenNumber;

  if (rooms.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Branch control" title="Displays & QR" />
        <Card>
          <EmptyState
            title="No rooms yet"
            hint="Each room gets its own display and QR code — create a room first."
            action={<Link to={`/branches/${branchId}/rooms`} className={btn.primary}>Go to Rooms</Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Branch control"
        title="Two screens per room."
        description="One code customers scan at the door, one screen they watch while they wait."
      />

      {/* Room chooser */}
      <Card className="mb-5">
        <MicroLabel className="mb-3">Choose a room</MicroLabel>
        <div className="flex flex-wrap gap-2">
          {rooms.map((r) => (
            <Chip key={r._id} active={selected === r._id} onClick={() => setSelected(r._id)}>
              {r.name}
            </Chip>
          ))}
          <Chip active={selected === ''} onClick={() => setSelected('')}>Whole branch</Chip>
        </div>
        {room && (
          <p className="text-[13px] text-muted-2 mt-3.5">
            Shows: {(room.departments || []).map((d) => d.name).join(' · ') || 'no departments assigned'}
          </p>
        )}
      </Card>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
        {/* Join QR */}
        <Card className="text-center flex flex-col">
          <MicroLabel>Join QR — {label}</MicroLabel>
          {qr ? (
            <>
              <div className="relative mx-auto my-6 w-[186px] h-[186px]">
                <img src={qr.dataUrl} alt={`Join QR for ${label}`} className="w-full h-full rounded-tile" />
                {/* Brand badge sitting on the code, with a paper ring */}
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="p-1.5 bg-surface rounded-[16px]">
                    <Logo size="badge" static />
                  </div>
                </div>
              </div>
              <p className="font-mono text-[11px] text-muted-3">
                Rotates every {qr.expiresInSeconds}s — screenshots go stale
              </p>
              <a href={qr.url} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-espresso hover:text-clay mt-2">
                Open the join page ↗
              </a>
            </>
          ) : (
            <div className="py-24">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-line border-t-espresso animate-spin" />
            </div>
          )}
        </Card>

        {/* Waiting screen preview */}
        <Card className="flex flex-col">
          <MicroLabel>Waiting screen — {label}</MicroLabel>
          <div className="flex-1 bg-board-bg rounded-tile mt-4 mb-5 px-7 py-8 min-h-[240px] flex flex-col justify-center">
            <p className="font-mono text-[10px] tracking-[.3em] uppercase text-paper/40">{label}</p>
            <p className="text-[86px] leading-none font-bold tracking-[-.04em] text-board-amber tnum mt-3">
              {firstToken || '···'}
            </p>
            <p className="font-mono text-[11px] tracking-[.2em] uppercase text-paper/40 mt-3">now serving</p>
            {nowServing.length > 1 && (
              <div className="flex gap-2 mt-5">
                {nowServing.slice(1, 4).map((n, i) => (
                  <span key={i} className="font-mono text-[13px] px-2.5 py-1 rounded-[8px] bg-paper/10 text-paper/70">
                    {n.tokenNumber}
                  </span>
                ))}
              </div>
            )}
          </div>
          <a href={boardUrl} target="_blank" rel="noreferrer" className={`${btn.primary} w-full`}>
            Open this screen full-size ↗
          </a>
        </Card>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-pill text-[13px] font-semibold border transition-colors ${
        active
          ? 'bg-espresso border-espresso text-paper'
          : 'bg-surface border-line-input text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
