import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, SectionTitle, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Rooms & Counters — the physical layout of a branch.
 *
 * A Room is a space (Registration, Pharmacy) that owns a display and a QR.
 * A Counter is a desk inside it — and also a LOGIN: creating one hands back an
 * email + password for the machine at that desk.
 */
const STATUS_TONE = { open: 'success', paused: 'warning', closed: 'neutral' };

export default function Rooms() {
  const { branchId } = useParams();
  const [rooms, setRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', departments: [] });

  const reload = useCallback(async () => {
    const [r, d] = await Promise.all([
      api.get(`/rooms/branch/${branchId}`),
      api.get(`/departments/branch/${branchId}`),
    ]);
    setRooms(r.data.rooms);
    setDepartments(d.data.departments);
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function createRoom(e) {
    e.preventDefault();
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
    if (!confirm(`Remove the ${name} room?`)) return;
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
        description="Each room is a physical space with its own display and QR. Counters are the desks inside it — and each one is its own login."
        actions={<button className={btn.primary} onClick={() => setShowNew((s) => !s)}>{showNew ? 'Cancel' : 'Add room'}</button>}
      />

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
            {departments.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-ink-600 mb-2">
                  Departments served here <span className="text-ink-400 font-normal">— optional, you can set this later</span>
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
            )}
            <div><button className={btn.primary}>Create room</button></div>
          </form>
        </Card>
      )}

      {rooms.length === 0 && !showNew && (
        <Card><EmptyState title="No rooms yet" hint="Add a room to give a physical space its own queue display and QR code." /></Card>
      )}

      <div className="space-y-4">
        {rooms.map((room) => (
          <RoomCard
            key={room._id}
            room={room}
            allDepartments={departments}
            branchId={branchId}
            onChange={reload}
            onRemove={() => removeRoom(room._id, room.name)}
          />
        ))}
      </div>
    </div>
  );
}

/** One room: its departments (editable) and the counters inside it. */
function RoomCard({ room, allDepartments, branchId, onChange, onRemove }) {
  const [editingDepts, setEditingDepts] = useState(false);
  const [picked, setPicked] = useState((room.departments || []).map((d) => d._id));
  const [adding, setAdding] = useState(false);
  const [newCounter, setNewCounter] = useState({ name: '', departments: [] });
  const [credentials, setCredentials] = useState(null); // shown once after create/reset

  const roomDepts = room.departments || [];

  async function saveDepts() {
    try {
      await api.patch(`/rooms/${room._id}`, { departments: picked });
      toast.success('Room departments updated');
      setEditingDepts(false);
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update');
    }
  }

  async function addCounter(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/counters', {
        room: room._id,
        name: newCounter.name || undefined,
        departments: newCounter.departments,
      });
      setCredentials({ ...data.credentials, code: data.counter.code });
      toast.success(`Counter ${data.counter.code} created`);
      setNewCounter({ name: '', departments: [] });
      setAdding(false);
      onChange();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not add counter');
    }
  }

  async function resetPassword(id, code) {
    if (!confirm(`Issue a new password for ${code}? The current one stops working.`)) return;
    const { data } = await api.post(`/counters/${id}/reset-password`);
    setCredentials({ ...data.credentials, code });
    toast.success('New password issued');
  }

  async function removeCounter(id, code) {
    if (!confirm(`Remove counter ${code}? Its login stops working.`)) return;
    await api.delete(`/counters/${id}`);
    toast.info(`${code} removed`);
    onChange();
  }

  return (
    <Card pad={false}>
      {/* Room header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-ink-100">
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 flex items-center gap-2">
            {room.name}
            {room.code && <Badge tone="neutral">{room.code}</Badge>}
          </p>
          {!editingDepts ? (
            <p className="text-xs text-ink-400 mt-1">
              {roomDepts.length ? roomDepts.map((d) => d.name).join(' · ') : 'No departments yet'}
              <button onClick={() => { setPicked(roomDepts.map((d) => d._id)); setEditingDepts(true); }}
                className="ml-2 text-brand-600 hover:text-brand-700 font-medium">Edit</button>
            </p>
          ) : (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2 mb-2">
                {allDepartments.map((d) => (
                  <button key={d._id} type="button"
                    onClick={() => setPicked((p) => (p.includes(d._id) ? p.filter((x) => x !== d._id) : [...p, d._id]))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      picked.includes(d._id) ? 'bg-brand-50 border-brand-300 text-brand-700 font-medium' : 'border-ink-200 text-ink-600'
                    }`}>
                    {d.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={saveDepts} className={btn.primary}>Save</button>
                <button onClick={() => setEditingDepts(false)} className={btn.secondary}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/branches/${branchId}/displays?room=${room._id}`} className={btn.ghost}>Display &amp; QR</Link>
          <button onClick={onRemove} className="text-sm text-ink-400 hover:text-red-600 px-2">Remove</button>
        </div>
      </div>

      {/* Credentials banner — the only time a password is readable */}
      {credentials && (
        <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Sign-in details for {credentials.code} — copy these now
          </p>
          <p className="text-xs text-emerald-700 mt-0.5 mb-3">
            This password is shown once. Give it to the team who'll use that machine.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 font-mono text-[13px]">
            <div className="bg-white rounded-lg px-3 py-2 border border-emerald-200 break-all">{credentials.email}</div>
            <div className="bg-white rounded-lg px-3 py-2 border border-emerald-200">{credentials.password}</div>
          </div>
          <button onClick={() => setCredentials(null)} className="text-xs text-emerald-700 hover:text-emerald-900 mt-3 font-medium">
            I've saved these — dismiss
          </button>
        </div>
      )}

      {/* Counters */}
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
          <p className="text-sm text-ink-400 py-2">No counters here yet — add one to create a desk login.</p>
        )}

        <div className="space-y-2">
          {(room.counters || []).map((c) => (
            <CounterRow
              key={c._id}
              counter={c}
              roomDepts={roomDepts}
              onChange={onChange}
              onReset={() => resetPassword(c._id, c.code)}
              onRemove={() => removeCounter(c._id, c.code)}
            />
          ))}
        </div>

        {adding && (
          <form onSubmit={addCounter} className="mt-3 border border-ink-200 rounded-xl p-4 grid gap-3 bg-ink-50/50">
            <input placeholder="Counter name (optional — defaults to Counter N)" value={newCounter.name}
              onChange={(e) => setNewCounter({ ...newCounter, name: e.target.value })} className={field} />
            {roomDepts.length > 0 ? (
              <div>
                <p className="text-xs text-ink-500 mb-2">
                  Which of this room's departments does it handle? Leave empty for all of them.
                </p>
                <div className="flex flex-wrap gap-2">
                  {roomDepts.map((d) => (
                    <button key={d._id} type="button"
                      onClick={() => setNewCounter((n) => ({
                        ...n,
                        departments: n.departments.includes(d._id)
                          ? n.departments.filter((x) => x !== d._id)
                          : [...n.departments, d._id],
                      }))}
                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                        newCounter.departments.includes(d._id) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-ink-200 text-ink-600'
                      }`}>
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-700">
                This room has no departments yet — the counter will serve nothing until you add some above.
              </p>
            )}
            <div><button className={btn.primary}>Create counter &amp; login</button></div>
          </form>
        )}
      </div>
    </Card>
  );
}

/** One counter row, with inline editing of which departments it handles. */
function CounterRow({ counter: c, roomDepts, onChange, onReset, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState((c.departments || []).map((d) => d._id || d));

  async function save() {
    try {
      await api.patch(`/counters/${c._id}`, { departments: picked });
      toast.success(`${c.code} updated`);
      setEditing(false);
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update');
    }
  }

  return (
    <div className="border border-ink-100 rounded-xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink-900 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[13px] bg-ink-100 rounded px-1.5 py-0.5">{c.code}</span>
            {c.name}
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          </p>
          <p className="text-xs text-ink-400 mt-0.5 break-all">{c.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onReset} className="px-2.5 py-1.5 rounded-lg hover:bg-ink-100 text-ink-500 text-sm">Reset password</button>
          <button onClick={onRemove} className="text-sm text-ink-400 hover:text-red-600 px-1">✕</button>
        </div>
      </div>

      <div className="mt-2">
        {!editing ? (
          <p className="text-xs text-ink-500">
            Handles: {c.departments?.length ? c.departments.map((d) => d.name).join(', ') : 'all departments in this room'}
            {roomDepts.length > 0 && (
              <button onClick={() => { setPicked((c.departments || []).map((d) => d._id || d)); setEditing(true); }}
                className="ml-2 text-brand-600 hover:text-brand-700 font-medium">Change</button>
            )}
          </p>
        ) : (
          <div>
            <div className="flex flex-wrap gap-2 my-2">
              {roomDepts.map((d) => (
                <button key={d._id} type="button"
                  onClick={() => setPicked((p) => (p.includes(d._id) ? p.filter((x) => x !== d._id) : [...p, d._id]))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    picked.includes(d._id) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-ink-200 text-ink-600'
                  }`}>
                  {d.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-400 mb-2">Select none to handle everything in this room.</p>
            <div className="flex gap-2">
              <button onClick={save} className={btn.primary}>Save</button>
              <button onClick={() => setEditing(false)} className={btn.secondary}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
