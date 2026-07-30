import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, SectionTitle, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Rooms & Counters — the physical layout of a branch.
 *
 * A Room is a space (Registration, Pharmacy) that owns a display and a QR.
 * A Counter is a desk inside that room, carrying a unique printable code and
 * serving some or all of the room's departments.
 */
const STATUS_TONE = { open: 'success', paused: 'warning', closed: 'neutral' };

export default function Rooms() {
  const { branchId } = useParams();
  const [rooms, setRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', departments: [] });

  const reload = useCallback(async () => {
    const [r, d, u] = await Promise.all([
      api.get(`/rooms/branch/${branchId}`),
      api.get(`/departments/branch/${branchId}`),
      api.get(`/users?branch=${branchId}`),
    ]);
    setRooms(r.data.rooms);
    setDepartments(d.data.departments);
    setStaff(u.data.users.filter((x) => x.role === 'Staff'));
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function createRoom(e) {
    e.preventDefault();
    if (!form.departments.length) return toast.error('Pick at least one department for this room');
    try {
      await api.post('/rooms', { ...form, branch: branchId });
      toast.success(`Room “${form.name}” created`);
      setForm({ name: '', code: '', departments: [] });
      setShowNew(false);
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create room');
    }
  }

  async function removeRoom(id, name) {
    try {
      await api.delete(`/rooms/${id}`);
      toast.info(`“${name}” removed`);
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not remove room');
    }
  }

  const toggleDept = (id) =>
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(id) ? f.departments.filter((x) => x !== id) : [...f.departments, id],
    }));

  return (
    <div className="max-w-4xl mx-auto animate-rise">
      <PageHeader
        title="Rooms & Counters"
        description="Each room is a physical space with its own display and QR. Counters are the desks inside it."
        actions={
          <button className={btn.primary} onClick={() => setShowNew((s) => !s)} disabled={departments.length === 0}>
            {showNew ? 'Cancel' : 'Add room'}
          </button>
        }
      />

      {departments.length === 0 && (
        <Card className="mb-6">
          <EmptyState
            title="Add departments first"
            hint="A room serves one or more departments, so create those before laying out the rooms."
            action={<Link to={`/branches/${branchId}/departments`} className={btn.primary}>Go to Departments</Link>}
          />
        </Card>
      )}

      {showNew && (
        <Card className="mb-6">
          <SectionTitle>New room</SectionTitle>
          <form onSubmit={createRoom} className="grid gap-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <input required placeholder="Room name (e.g. Registration)" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${field} sm:col-span-2`} />
              <input maxLength={6} placeholder="Short code (REG)" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={field} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink-600 mb-2">
                Departments served in this room — pick several to combine them under one screen
              </p>
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <button key={d._id} type="button" onClick={() => toggleDept(d._id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      form.departments.includes(d._id)
                        ? 'bg-brand-50 border-brand-300 text-brand-700 font-medium'
                        : 'border-ink-200 text-ink-600 hover:border-ink-300'
                    }`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div><button className={btn.primary}>Create room</button></div>
          </form>
        </Card>
      )}

      {rooms.length === 0 && !showNew && departments.length > 0 && (
        <Card><EmptyState title="No rooms yet" hint="Add a room to give a physical space its own queue display and QR code." /></Card>
      )}

      <div className="space-y-4">
        {rooms.map((room) => (
          <RoomCard
            key={room._id}
            room={room}
            staff={staff}
            branchId={branchId}
            onChange={reload}
            onRemove={() => removeRoom(room._id, room.name)}
          />
        ))}
      </div>
    </div>
  );
}

/** One room, with the counters inside it. */
function RoomCard({ room, staff, branchId, onChange, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);

  const roomDepts = room.departments || [];

  async function addCounter(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/counters', {
        room: room._id,
        name: name || undefined,
        departments: picked,
      });
      toast.success(`Counter ${data.counter.code} added`);
      setName(''); setPicked([]); setAdding(false);
      onChange();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not add counter');
    }
  }

  async function assign(counterId, staffId) {
    if (!staffId) return;
    await api.patch(`/counters/${counterId}/assign`, { staffId });
    toast.success('Staff assigned · counter open');
    onChange();
  }
  async function pause(id) {
    const { data } = await api.patch(`/counters/${id}/pause`);
    toast.info(`Counter ${data.counter.status}`);
    onChange();
  }
  async function close(id) { await api.patch(`/counters/${id}/close`); toast.info('Counter closed'); onChange(); }
  async function removeCounter(id, code) {
    if (!confirm(`Remove counter ${code}?`)) return;
    await api.delete(`/counters/${id}`);
    toast.info(`${code} removed`);
    onChange();
  }

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card pad={false}>
      {/* Room header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-ink-100">
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 flex items-center gap-2">
            {room.name}
            {room.code && <Badge tone="neutral">{room.code}</Badge>}
          </p>
          <p className="text-xs text-ink-400 mt-1">
            {roomDepts.length ? roomDepts.map((d) => d.name).join(' · ') : 'No departments assigned'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/branches/${branchId}/displays?room=${room._id}`} className={btn.ghost}>Display &amp; QR</Link>
          <button onClick={onRemove} className="text-sm text-ink-400 hover:text-red-600 px-2">Remove</button>
        </div>
      </div>

      {/* Counters inside this room */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-ink-700">
            Counters <span className="text-ink-400 font-normal">({room.counters?.length || 0})</span>
          </p>
          <button onClick={() => setAdding((a) => !a)} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            {adding ? 'Cancel' : '+ Add counter'}
          </button>
        </div>

        {(room.counters || []).length === 0 && !adding && (
          <p className="text-sm text-ink-400 py-2">No counters here yet — add one so staff can serve this room.</p>
        )}

        <div className="space-y-2">
          {(room.counters || []).map((c) => (
            <div key={c._id} className="flex flex-wrap items-center justify-between gap-3 border border-ink-100 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[13px] bg-ink-100 rounded px-1.5 py-0.5">{c.code}</span>
                  {c.name}
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </p>
                <p className="text-xs text-ink-400 mt-0.5">
                  {c.departments?.length ? c.departments.map((d) => d.name).join(', ') : 'All departments in this room'}
                  {c.assignedStaff?.name && ` · ${c.assignedStaff.name}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select defaultValue="" onChange={(e) => assign(c._id, e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-ink-200 text-sm bg-white">
                  <option value="">Assign staff…</option>
                  {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
                <button onClick={() => pause(c._id)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm">
                  {c.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button onClick={() => close(c._id)} className="px-2.5 py-1.5 rounded-lg hover:bg-ink-100 text-ink-500 text-sm">Close</button>
                <button onClick={() => removeCounter(c._id, c.code)} className="text-sm text-ink-400 hover:text-red-600 px-1">✕</button>
              </div>
            </div>
          ))}
        </div>

        {adding && (
          <form onSubmit={addCounter} className="mt-3 border border-ink-200 rounded-xl p-4 grid gap-3 bg-ink-50/50">
            <input placeholder="Counter name (optional — defaults to Counter N)" value={name}
              onChange={(e) => setName(e.target.value)} className={field} />
            <div>
              <p className="text-xs text-ink-500 mb-2">
                Which of this room's departments does it handle? Leave empty for all of them.
              </p>
              <div className="flex flex-wrap gap-2">
                {roomDepts.map((d) => (
                  <button key={d._id} type="button" onClick={() => togglePick(d._id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      picked.includes(d._id) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-ink-200 text-ink-600'
                    }`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div><button className={btn.primary}>Add counter</button></div>
          </form>
        )}
      </div>
    </Card>
  );
}
