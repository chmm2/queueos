import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { PageHeader, Card, EmptyState, btn } from '../../components/ui';

/**
 * Displays & QR — one screen and one join code per ROOM.
 *
 * This is the whole point of modelling rooms: the Registration room's TV shows
 * only Registration, and the QR taped to its wall drops customers straight
 * into that queue. Nothing from Pharmacy leaks onto it.
 */
export default function Displays() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const [rooms, setRooms] = useState([]);
  const [selected, setSelected] = useState(params.get('room') || '');
  const [qr, setQr] = useState(null);

  useEffect(() => {
    api.get(`/rooms/branch/${branchId}`).then(({ data }) => {
      setRooms(data.rooms);
      setSelected((s) => s || data.rooms[0]?._id || '');
    });
  }, [branchId]);

  const loadQr = useCallback(async () => {
    if (!branchId) return;
    const q = selected ? `?room=${selected}` : '';
    const { data } = await api.get(`/branches/${branchId}/qr${q}`);
    setQr(data);
  }, [branchId, selected]);

  useEffect(() => {
    loadQr();
    const id = setInterval(loadQr, 30000); // keep the rotating code fresh
    return () => clearInterval(id);
  }, [loadQr]);

  const room = rooms.find((r) => r._id === selected);
  const boardUrl = `/board/${branchId}${selected ? `?room=${selected}` : ''}`;
  const label = room ? room.name : 'Whole branch';

  if (rooms.length === 0) {
    return (
      <div className="max-w-4xl mx-auto animate-rise">
        <PageHeader title="Displays & QR" />
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
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader
        title="Displays & QR"
        description="Every room has its own waiting screen and its own join code."
      />

      {/* Room picker */}
      <Card className="mb-4">
        <p className="text-[13px] font-semibold text-ink-700 mb-3">Choose a room</p>
        <div className="flex flex-wrap gap-2">
          {rooms.map((r) => (
            <button key={r._id} onClick={() => setSelected(r._id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
                selected === r._id ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}>
              {r.name}
            </button>
          ))}
          <button onClick={() => setSelected('')}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
              selected === '' ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 text-ink-600 hover:border-ink-300'
            }`}>
            Whole branch
          </button>
        </div>
        {room && (
          <p className="text-xs text-ink-400 mt-3">
            Shows: {(room.departments || []).map((d) => d.name).join(' · ') || 'no departments assigned'}
          </p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="text-center flex flex-col">
          <p className="text-[0.95rem] font-semibold text-ink-800 mb-1">Join QR — {label}</p>
          <p className="text-sm text-ink-500 mb-4">
            Print this and put it at the {label.toLowerCase()} entrance. Scanning it joins this room's queue.
          </p>
          {qr ? (
            <>
              <div className="bg-white border border-ink-200 rounded-2xl p-4 inline-block mx-auto">
                <img src={qr.dataUrl} alt={`Join QR for ${label}`} className="w-52 h-52" />
              </div>
              <p className="text-xs text-ink-400 mt-3">Refreshes every {qr.expiresInSeconds}s so screenshots can't be reused</p>
              <a href={qr.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-700 mt-1">
                Open the join page ↗
              </a>
            </>
          ) : (
            <div className="py-16"><div className="w-6 h-6 mx-auto rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin" /></div>
          )}
        </Card>

        <Card className="flex flex-col">
          <p className="text-[0.95rem] font-semibold text-ink-800 mb-1">Waiting screen — {label}</p>
          <p className="text-sm text-ink-500 mb-4">Open this full-screen on the TV in the {label.toLowerCase()}.</p>
          <div className="flex-1 bg-[#0c0d13] rounded-2xl grid place-items-center min-h-[200px] mb-4">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500 mb-2">{label}</p>
              <p className="text-4xl font-bold text-amber-300 tnum">R-042</p>
              <p className="text-xs text-slate-500 mt-2">now serving</p>
            </div>
          </div>
          <a href={boardUrl} target="_blank" rel="noreferrer" className={`${btn.primary} w-full`}>Open this screen ↗</a>
        </Card>
      </div>
    </div>
  );
}
