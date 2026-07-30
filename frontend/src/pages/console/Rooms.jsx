import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import {
  PageHeader, Card, SectionTitle, Badge, EmptyState, MicroLabel, btn, field,
} from '../../components/ui';

/**
 * Rooms & Counters — the physical layout of a branch.
 *
 * A Room is a space (Registration, Pharmacy) that owns a display and a QR.
 * A Counter is a desk inside it — and also a LOGIN: creating one hands back an
 * email + password for the machine at that desk, shown exactly once.
 */
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

  const toggle = (id) =>
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(id) ? f.departments.filter((x) => x !== id) : [...f.departments, id],
    }));

  return (
    <div>
      <PageHeader
        eyebrow="Branch control"
        title="The floor, mapped."
        description="Each room is a physical space with its own screen and QR. Counters are the desks inside it — and each one is its own login."
        actions={
          <button className={btn.primary} onClick={() => setShowNew((s) => !s)}>
            {showNew ? 'Cancel' : '+ Add room'}
          </button>
        }
      />

      {showNew && (
        <Card className="mb-6 animate-rise-fast">
          <SectionTitle>New room</SectionTitle>
          <form onSubmit={createRoom} className="grid gap-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="grid gap-2 sm:col-span-2">
                <MicroLabel>Room name</MicroLabel>
                <input required placeholder="Registration" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              </label>
              <label className="grid gap-2">
                <MicroLabel>Short code</MicroLabel>
                <input maxLength={6} placeholder="REG" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={`${field} font-mono`} />
              </label>
            </div>
            {departments.length > 0 && (
              <div>
                <MicroLabel className="mb-2.5">
                  Departments served here — optional, you can set this later
                </MicroLabel>
                <ChipRow items={departments} selected={form.departments} onToggle={toggle} />
              </div>
            )}
            <div><button className={btn.primary}>Create room</button></div>
          </form>
        </Card>
      )}

      {rooms.length === 0 && !showNew && (
        <Card><EmptyState title="No rooms yet" hint="Add a room to give a physical space its own queue display and QR code." /></Card>
      )}

      <div className="space-y-5">
        {rooms.map((room, i) => (
          <RoomCard
            key={room._id}
            room={room}
            allDepartments={departments}
            branchId={branchId}
            index={i}
            onChange={reload}
            onRemove={() => removeRoom(room._id, room.name)}
          />
        ))}
      </div>
    </div>
  );
}

/** Selectable department chips, used for both rooms and counters. */
function ChipRow({ items, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((d) => {
        const on = selected.includes(d._id);
        return (
          <button
            key={d._id}
            type="button"
            onClick={() => onToggle(d._id)}
            className={`px-3.5 py-1.5 rounded-pill text-[13px] font-semibold border transition-colors ${
              on
                ? 'bg-espresso border-espresso text-paper'
                : 'bg-surface border-line-input text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

function RoomCard({ room, allDepartments, branchId, index, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState((room.departments || []).map((d) => d._id));
  const [adding, setAdding] = useState(false);
  const [newCounter, setNewCounter] = useState({ name: '', departments: [] });
  const [credentials, setCredentials] = useState(null);

  const roomDepts = room.departments || [];

  async function saveDepts() {
    try {
      await api.patch(`/rooms/${room._id}`, { departments: picked });
      toast.success('Room departments updated');
      setEditing(false);
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
    <Card pad={false} className="overflow-hidden animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
      {/* Room header strip */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-surface-sunken border-b border-line">
        <p className="text-[17px] font-bold tracking-[-.02em] text-ink">{room.name}</p>
        {room.code && (
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-[6px] bg-espresso-tint border border-espresso-tint-border text-espresso">
            {room.code}
          </span>
        )}
        <span className="text-[13px] text-muted-2 truncate">
          serves {roomDepts.length ? roomDepts.map((d) => d.name).join(', ') : 'nothing yet'}
        </span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Link to={`/branches/${branchId}/displays?room=${room._id}`} className={btn.secondary}>
            Display &amp; QR
          </Link>
          <button onClick={onRemove} className={btn.danger}>Remove</button>
        </div>
      </div>

      {/* Departments served, editable inline */}
      <div className="px-6 pt-4">
        {!editing ? (
          <button
            onClick={() => { setPicked(roomDepts.map((d) => d._id)); setEditing(true); }}
            className={btn.ghost}
          >
            Edit departments served
          </button>
        ) : (
          <div className="pb-2">
            <ChipRow
              items={allDepartments}
              selected={picked}
              onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={saveDepts} className={btn.primary}>Save</button>
              <button onClick={() => setEditing(false)} className={btn.secondary}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Credentials — the only time a password is readable */}
      {credentials && (
        <div className="mx-6 mt-4 rounded-tile border border-success-tint-border bg-success-tint p-5">
          <p className="text-[14px] font-bold text-success">
            Sign-in details for {credentials.code} — copy these now
          </p>
          <p className="text-[13px] text-success/80 mt-1 mb-3.5">
            This password is shown once. Give it to the team who'll use that machine.
          </p>
          <div className="grid sm:grid-cols-2 gap-2.5 font-mono text-[13px]">
            <div className="bg-surface rounded-[10px] px-3.5 py-2.5 border border-success-tint-border break-all">
              {credentials.email}
            </div>
            <div className="bg-surface rounded-[10px] px-3.5 py-2.5 border border-success-tint-border">
              {credentials.password}
            </div>
          </div>
          <button onClick={() => setCredentials(null)} className="text-[12px] font-semibold text-success hover:underline mt-3.5">
            I've saved these — dismiss
          </button>
        </div>
      )}

      {/* Counters */}
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <MicroLabel>Counters ({room.counters?.length || 0})</MicroLabel>
          <button onClick={() => setAdding((a) => !a)} className={btn.ghost}>
            {adding ? 'Cancel' : '+ Add counter'}
          </button>
        </div>

        {(room.counters || []).length === 0 && !adding && (
          <p className="text-[14px] text-muted-2 py-2">No counters here yet — add one to create a desk login.</p>
        )}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {(room.counters || []).map((c) => (
            <CounterTile
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
          <form onSubmit={addCounter} className="mt-4 border border-line-input rounded-tile p-5 grid gap-4 bg-surface-alt">
            <label className="grid gap-2">
              <MicroLabel>Counter name — optional</MicroLabel>
              <input placeholder="Defaults to Counter N" value={newCounter.name}
                onChange={(e) => setNewCounter({ ...newCounter, name: e.target.value })} className={field} />
            </label>
            {roomDepts.length > 0 ? (
              <div>
                <MicroLabel className="mb-2.5">
                  Which of this room's departments? Leave empty for all of them
                </MicroLabel>
                <ChipRow
                  items={roomDepts}
                  selected={newCounter.departments}
                  onToggle={(id) =>
                    setNewCounter((n) => ({
                      ...n,
                      departments: n.departments.includes(id)
                        ? n.departments.filter((x) => x !== id)
                        : [...n.departments, id],
                    }))
                  }
                />
              </div>
            ) : (
              <p className="text-[13px] text-clay-ink">
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

function CounterTile({ counter: c, roomDepts, onChange, onReset, onRemove }) {
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
    <div className="rounded-tile border border-line bg-surface-alt p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="font-mono text-[11px] px-2 py-0.5 rounded-[6px] bg-espresso text-paper">
          {c.code}
        </span>
        <span className="text-[14px] font-semibold text-ink">{c.name}</span>
        <Badge tone={c.status === 'open' ? 'success' : c.status === 'paused' ? 'warning' : 'neutral'}>
          {c.status}
        </Badge>
      </div>
      <p className="font-mono text-[11px] text-muted-3 truncate" title={c.email}>{c.email}</p>

      <div className="mt-3 pt-3 border-t border-line-soft">
        {!editing ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted-2 truncate">
              {c.departments?.length ? c.departments.map((d) => d.name).join(', ') : 'All depts in room'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {roomDepts.length > 0 && (
                <button onClick={() => { setPicked((c.departments || []).map((d) => d._id || d)); setEditing(true); }}
                  className="text-[12px] font-semibold text-muted hover:text-clay">Change</button>
              )}
              <button onClick={onReset} className="text-[12px] font-semibold text-muted hover:text-clay">Reset password</button>
              <button onClick={onRemove} className="text-[12px] text-muted-3 hover:text-clay">✕</button>
            </div>
          </div>
        ) : (
          <div>
            <ChipRow
              items={roomDepts}
              selected={picked}
              onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
            />
            <p className="text-[11px] text-muted-3 mt-2">Select none to handle everything in this room.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={save} className={btn.primary}>Save</button>
              <button onClick={() => setEditing(false)} className={btn.secondary}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
