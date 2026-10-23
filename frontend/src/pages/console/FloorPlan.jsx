import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, Badge, MicroLabel, EmptyState, STATUS_TONE, btn, field } from '../../components/ui';

/**
 * Floor plan — the branch as a map.
 *
 * Rooms are rectangles on a fixed grid. Drag one by its title bar, pull its
 * corner to resize, drop a department chip onto it to make it serve that
 * queue, and click it for the details. The positions are purely visual — the
 * queue logic never reads them — so the worst a bad layout can do is look odd.
 */

const FALLBACK_FLOOR = { cols: 24, rows: 14 };
const MIN_SIZE = 2;
// Sizes to try, largest first, when dropping a new room onto the map.
const SIZES = [[5, 4], [4, 3], [3, 3], [2, 2]];

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Same rules as the server: whole cells, minimum size, always on the grid. */
function clampToFloor(l, floor) {
  const w = Math.min(Math.max(l.w, MIN_SIZE), floor.cols);
  const h = Math.min(Math.max(l.h, MIN_SIZE), floor.rows);
  return {
    w,
    h,
    x: Math.min(Math.max(l.x, 0), floor.cols - w),
    y: Math.min(Math.max(l.y, 0), floor.rows - h),
  };
}

/** First spot, reading left to right then top to bottom, that nothing occupies. */
function firstFree(placed, floor) {
  for (const [w, h] of SIZES) {
    for (let y = 0; y + h <= floor.rows; y += 1) {
      for (let x = 0; x + w <= floor.cols; x += 1) {
        const spot = { x, y, w, h };
        if (!placed.some((p) => overlaps(spot, p))) return spot;
      }
    }
  }
  return { x: 0, y: 0, w: MIN_SIZE, h: MIN_SIZE }; // floor is full: park it top-left
}

const COUNTER_DOT = { open: 'bg-success', paused: 'bg-warning-ink', closed: 'bg-line-strong' };

export default function FloorPlan() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const [rooms, setRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [floor, setFloor] = useState(FALLBACK_FLOOR);
  const [tokens, setTokens] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('room')); // ?room= comes back from Rooms & Counters
  const [draft, setDraft] = useState(null); // the rectangle being dragged right now
  const [dropId, setDropId] = useState(null); // room a department chip is hovering over
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState({ name: '', code: '' });

  const wrapRef = useRef(null);
  const [cell, setCell] = useState(48);
  const gesture = useRef(null);
  const draftRef = useRef(null);
  const roomsRef = useRef([]);
  roomsRef.current = rooms;

  // The canvas fills its column; one grid cell is whatever width / columns gives.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setCell(Math.max(24, Math.floor(el.clientWidth / floor.cols)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [floor.cols, loaded]);

  const reload = useCallback(async () => {
    const [r, d] = await Promise.all([
      api.get(`/rooms/branch/${branchId}`),
      api.get(`/departments/branch/${branchId}`),
    ]);
    const fl = r.data.floor || FALLBACK_FLOOR;

    // Rooms created before the floor plan existed have no position yet. Give
    // each a free spot and save it, so the map is stable from then on.
    const placed = r.data.rooms.filter((x) => x.layout).map((x) => x.layout);
    const toSave = [];
    const withLayout = r.data.rooms.map((room) => {
      if (room.layout) return room;
      const spot = firstFree(placed, fl);
      placed.push(spot);
      toSave.push([room._id, spot]);
      return { ...room, layout: spot };
    });
    toSave.forEach(([id, layout]) => api.patch(`/rooms/${id}`, { layout }).catch(() => {}));

    setFloor(fl);
    setRooms(withLayout);
    setDepartments(d.data.departments);
    setLoaded(true);
  }, [branchId]);

  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);

  // Live picture: who is waiting where. Poll the same list the counter desks use.
  useEffect(() => {
    const load = () =>
      api.get(`/tokens/branch/${branchId}`).then((r) => setTokens(r.data.tokens)).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [branchId]);

  const waitingIn = (roomId) =>
    tokens.filter((t) => t.status === 'waiting' && String(t.room) === String(roomId)).length;
  const servingAt = (counterId) =>
    tokens.find((t) => t.status === 'serving' && String(t.counter?._id) === String(counterId));

  const selected = rooms.find((r) => r._id === selectedId) || null;
  const layoutOf = (room) => (draft && draft.id === room._id ? draft : room.layout);

  /* ---------------------------------------------------------------- saving */

  async function commitLayout(roomId, layout) {
    setRooms((rs) => rs.map((r) => (r._id === roomId ? { ...r, layout } : r)));
    try {
      await api.patch(`/rooms/${roomId}`, { layout });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not save the layout');
      reload();
    }
  }

  async function saveDepartments(room, ids) {
    const byId = Object.fromEntries(departments.map((d) => [d._id, d]));
    setRooms((rs) =>
      rs.map((r) => (r._id === room._id ? { ...r, departments: ids.map((id) => byId[id]).filter(Boolean) } : r))
    );
    try {
      await api.patch(`/rooms/${room._id}`, { departments: ids });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update departments');
    }
    reload();
  }

  function addDepartment(room, deptId) {
    const have = (room.departments || []).map((d) => d._id);
    if (have.includes(deptId)) {
      toast.info(`${room.name} already serves that`);
      return;
    }
    saveDepartments(room, [...have, deptId]);
  }

  const removeDepartment = (room, deptId) =>
    saveDepartments(room, (room.departments || []).map((d) => d._id).filter((id) => id !== deptId));

  async function createRoom(e) {
    e.preventDefault();
    const name = adding.name.trim();
    if (!name) return;
    const spot = firstFree(rooms.map((r) => r.layout), floor);
    try {
      const { data } = await api.post('/rooms', { branch: branchId, name, code: adding.code, layout: spot });
      toast.success(`Room “${name}” added`);
      setAdding({ name: '', code: '' });
      await reload();
      setSelectedId(data.room._id);
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not add the room');
    }
  }

  async function removeRoom(room) {
    if (!confirm(`Remove the ${room.name} room?`)) return;
    try {
      await api.delete(`/rooms/${room._id}`);
      toast.info(`“${room.name}” removed`);
      setSelectedId(null);
      reload();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not remove the room');
    }
  }

  /* --------------------------------------------------------------- gestures */

  function setDraftBoth(v) {
    draftRef.current = v;
    setDraft(v);
  }

  function startGesture(e, room, mode) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: room._id, mode, sx: e.clientX, sy: e.clientY, orig: room.layout, moved: false };
    setDraftBoth({ id: room._id, ...room.layout, bad: false });
  }

  function moveGesture(e) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (!g.moved) return;

    const dc = Math.round(dx / cell);
    const dr = Math.round(dy / cell);
    const raw = g.mode === 'move'
      ? { ...g.orig, x: g.orig.x + dc, y: g.orig.y + dr }
      : { ...g.orig, w: g.orig.w + dc, h: g.orig.h + dr };
    const next = clampToFloor(raw, floor);
    const bad = roomsRef.current.some((r) => r._id !== g.id && overlaps(next, r.layout));
    setDraftBoth({ id: g.id, ...next, bad });
  }

  function endGesture() {
    const g = gesture.current;
    gesture.current = null;
    const d = draftRef.current;
    setDraftBoth(null);
    if (!g) return;

    if (!g.moved) {
      setSelectedId(g.id); // a click, not a drag
      return;
    }
    const { id, bad, ...layout } = d;
    const same = ['x', 'y', 'w', 'h'].every((k) => layout[k] === g.orig[k]);
    if (same) return;
    if (bad) {
      toast.info('Rooms can’t overlap — put it somewhere free');
      return;
    }
    commitLayout(g.id, layout);
  }

  /** Keyboard: arrows move the selected room a cell, Shift+arrows resize it. */
  function onKeyDown(e, room) {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    const l = room.layout;
    const raw = e.shiftKey
      ? { ...l, w: l.w + step[0], h: l.h + step[1] }
      : { ...l, x: l.x + step[0], y: l.y + step[1] };
    const next = clampToFloor(raw, floor);
    if (rooms.some((r) => r._id !== room._id && overlaps(next, r.layout))) return;
    commitLayout(room._id, next);
  }

  /* ----------------------------------------------------------------- render */

  const placedDeptIds = new Set(rooms.flatMap((r) => (r.departments || []).map((d) => d._id)));
  const gridLine = 'rgba(46,42,34,.07)';

  return (
    <div>
      <PageHeader
        eyebrow="Branch control"
        title="The floor, at a glance."
        description="Drag rooms to where they really are, drop departments into them, and click a room for its counters and live queue."
      />

      <Card className="mb-5">
        <form onSubmit={createRoom} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 flex-1 min-w-[180px]">
            <MicroLabel>New room</MicroLabel>
            <input
              required
              placeholder="Registration"
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              className={field}
            />
          </label>
          <label className="grid gap-2 w-28">
            <MicroLabel>Code</MicroLabel>
            <input
              maxLength={6}
              placeholder="REG"
              value={adding.code}
              onChange={(e) => setAdding({ ...adding, code: e.target.value.toUpperCase() })}
              className={`${field} font-mono`}
            />
          </label>
          <button className={btn.primary}>+ Add to the floor</button>
        </form>
      </Card>

      <Card className="mb-5">
        <MicroLabel className="mb-3">Departments · drag one into a room</MicroLabel>
        {departments.length === 0 ? (
          <p className="text-[14px] text-muted-2">
            No departments yet. <Link to={`/branches/${branchId}/departments`} className="font-semibold text-ink hover:text-clay">Add some</Link> to place them here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => {
              const unplaced = !placedDeptIds.has(d._id);
              return (
                <span
                  key={d._id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/dept', d._id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={unplaced ? 'Not in any room yet' : 'Drag into another room to share it'}
                  className={`px-3.5 py-1.5 rounded-pill text-[13px] font-semibold cursor-grab active:cursor-grabbing select-none border ${
                    unplaced
                      ? 'border-dashed border-clay-tint-border bg-clay-tint text-clay-ink'
                      : 'border-line-input bg-surface text-ink-2'
                  }`}
                >
                  {d.name}
                  {unplaced && <span className="ml-2 font-mono text-[10px] tracking-[.12em] uppercase">no room</span>}
                </span>
              );
            })}
          </div>
        )}
      </Card>

      {loaded && rooms.length === 0 && (
        <Card><EmptyState title="An empty floor" hint="Name a room above and it lands on the map, ready to drag into place." /></Card>
      )}

      {rooms.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
          <div ref={wrapRef} className="min-w-0">
            <div
              className="relative rounded-tile border border-line bg-surface-sunken overflow-hidden select-none"
              style={{
                width: floor.cols * cell,
                height: floor.rows * cell,
                backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${gridLine} 1px, transparent 1px)`,
                backgroundSize: `${cell}px ${cell}px`,
              }}
              onPointerDown={() => setSelectedId(null)}
            >
              {rooms.map((room) => {
                const l = layoutOf(room);
                const isDragging = draft && draft.id === room._id;
                const isSel = selectedId === room._id;
                const waiting = waitingIn(room._id);
                const depts = room.departments || [];
                const tall = l.h >= 3;
                return (
                  <div
                    key={room._id}
                    tabIndex={0}
                    onKeyDown={(e) => onKeyDown(e, room)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSelectedId(room._id)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('text/dept')) {
                        e.preventDefault();
                        setDropId(room._id);
                      }
                    }}
                    onDragLeave={() => setDropId((id) => (id === room._id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropId(null);
                      const id = e.dataTransfer.getData('text/dept');
                      if (id) addDepartment(room, id);
                    }}
                    className={`absolute flex flex-col rounded-[10px] bg-surface outline-none transition-shadow ${
                      isDragging && draft.bad
                        ? 'border-2 border-clay shadow-lift'
                        : isSel || dropId === room._id
                          ? 'border-2 border-espresso shadow-lift'
                          : 'border border-line-strong shadow-rest focus-visible:border-espresso'
                    } ${isDragging ? 'z-10' : ''}`}
                    style={{
                      left: l.x * cell + 2,
                      top: l.y * cell + 2,
                      width: l.w * cell - 4,
                      height: l.h * cell - 4,
                      transition: isDragging ? 'none' : undefined,
                    }}
                  >
                    {/* title bar = the drag handle */}
                    <div
                      onPointerDown={(e) => startGesture(e, room, 'move')}
                      onPointerMove={moveGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={endGesture}
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-espresso text-paper rounded-t-[8px] cursor-grab active:cursor-grabbing touch-none"
                    >
                      <span className="text-[13px] font-semibold truncate">{room.name}</span>
                      {room.code && <span className="font-mono text-[10px] tracking-[.14em] text-paper/60 shrink-0">{room.code}</span>}
                    </div>

                    <div className="flex-1 min-h-0 p-2.5 flex flex-col gap-2 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-mono text-[11px] tnum ${waiting ? 'text-clay-ink font-semibold' : 'text-muted-3'}`}>
                          {waiting} waiting
                        </span>
                        <span className="flex gap-1" title={`${room.counters.length} counter(s)`}>
                          {room.counters.map((c) => (
                            <span key={c._id} title={`${c.name} · ${c.status}`} className={`w-2 h-2 rounded-[2px] ${COUNTER_DOT[c.status] || COUNTER_DOT.closed}`} />
                          ))}
                        </span>
                      </div>
                      {tall ? (
                        <div className="flex flex-wrap gap-1 content-start">
                          {depts.length === 0 && <span className="text-[11px] text-muted-3">Drop a department here</span>}
                          {depts.map((d) => (
                            <span key={d._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-espresso-tint border border-espresso-tint-border text-[11px] font-semibold text-ink-2">
                              {d.name}
                              <button
                                type="button"
                                aria-label={`Remove ${d.name} from ${room.name}`}
                                onClick={(e) => { e.stopPropagation(); removeDepartment(room, d._id); }}
                                className="text-muted-3 hover:text-clay leading-none"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-3">{depts.length} department{depts.length === 1 ? '' : 's'}</span>
                      )}
                    </div>

                    {/* corner handle */}
                    <div
                      onPointerDown={(e) => startGesture(e, room, 'resize')}
                      onPointerMove={moveGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={endGesture}
                      title="Resize"
                      className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize touch-none"
                      style={{ background: 'linear-gradient(135deg, transparent 50%, #B9B09C 50%)', borderBottomRightRadius: 8 }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-[11px] text-muted-3 mt-3">
              Drag a title bar to move · pull the corner to resize · arrow keys move a selected room, Shift+arrows resize
            </p>
          </div>

          {selected && (
            <RoomPanel
              key={selected._id}
              room={selected}
              branchId={branchId}
              departments={departments}
              waiting={waitingIn(selected._id)}
              servingAt={servingAt}
              onClose={() => setSelectedId(null)}
              onRename={async (patch) => {
                try {
                  await api.patch(`/rooms/${selected._id}`, patch);
                  reload();
                } catch (e) {
                  toast.error(e.response?.data?.message || 'Could not save');
                }
              }}
              onAddDepartment={(id) => addDepartment(selected, id)}
              onRemoveDepartment={(id) => removeDepartment(selected, id)}
              onRemove={() => removeRoom(selected)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The side panel for the clicked room: live queue, counters, and the controls. */
function RoomPanel({
  room, branchId, departments, waiting, servingAt, onClose, onRename,
  onAddDepartment, onRemoveDepartment, onRemove,
}) {
  const [name, setName] = useState(room.name);
  const [code, setCode] = useState(room.code || '');
  const have = new Set((room.departments || []).map((d) => d._id));
  const addable = departments.filter((d) => !have.has(d._id));

  return (
    <aside className="w-full lg:w-[340px]">
      <Card className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2 flex-1 min-w-0">
            <MicroLabel>Room</MicroLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== room.name && onRename({ name: name.trim() })}
              className={field}
            />
            <input
              value={code}
              maxLength={6}
              placeholder="Code"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onBlur={() => code !== (room.code || '') && onRename({ code })}
              className={`${field} font-mono`}
            />
          </div>
          <button onClick={onClose} aria-label="Close panel" className="text-muted-3 hover:text-ink text-xl leading-none">×</button>
        </div>

        <div>
          <MicroLabel className="mb-2">Right now</MicroLabel>
          <p className="text-[34px] leading-none font-bold tracking-[-.03em] text-ink tnum">{waiting}</p>
          <p className="text-[13px] text-muted-2 mt-1">waiting in this room</p>
        </div>

        <div>
          <MicroLabel className="mb-2.5">Serves</MicroLabel>
          <div className="flex flex-wrap gap-1.5">
            {(room.departments || []).length === 0 && <span className="text-[13px] text-muted-3">Nothing yet</span>}
            {(room.departments || []).map((d) => (
              <span key={d._id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-espresso-tint border border-espresso-tint-border text-[12px] font-semibold text-ink-2">
                {d.name}
                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => onRemoveDepartment(d._id)} className="text-muted-3 hover:text-clay leading-none">×</button>
              </span>
            ))}
          </div>
          {addable.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && onAddDepartment(e.target.value)}
              className={`${field} mt-3 !py-2 text-[14px]`}
            >
              <option value="">Add a department…</option>
              {addable.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          )}
        </div>

        <div>
          <MicroLabel className="mb-2.5">Counters</MicroLabel>
          {room.counters.length === 0 ? (
            <p className="text-[13px] text-muted-3">No counters in this room yet.</p>
          ) : (
            <ul className="space-y-2">
              {room.counters.map((c) => {
                const serving = servingAt(c._id);
                return (
                  <li key={c._id} className="flex items-center justify-between gap-3 border border-line rounded-tile px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">{c.name}</p>
                      <p className="font-mono text-[11px] text-muted-3 truncate">
                        {serving ? `serving ${serving.tokenNumber}` : c.code}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[c.status] || 'neutral'}>{c.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-2 pt-1">
          <a href={`/board/${branchId}?room=${room._id}`} target="_blank" rel="noreferrer" className={btn.secondary}>Open waiting screen ↗</a>
          <Link to={`/branches/${branchId}/displays?room=${room._id}`} className={btn.secondary}>Join QR code</Link>
          <Link to={`/branches/${branchId}/rooms?room=${room._id}`} className={btn.secondary}>Manage counters</Link>
          <button onClick={onRemove} className={btn.danger}>Remove room</button>
        </div>
      </Card>
    </aside>
  );
}
