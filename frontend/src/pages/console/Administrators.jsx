import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import {
  PageHeader, Card, SectionTitle, Badge, MicroLabel, btn, field,
} from '../../components/ui';

/**
 * Administrator accounts — the only accounts belonging to a PERSON. The people
 * working the desks don't have accounts here: each counter is its own login,
 * created alongside the counter itself (see Rooms & Counters).
 */
export default function Administrators() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await api.get('/users');
    setUsers(data.users);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/users', form);
      toast.success('Administrator added');
      setForm({ name: '', email: '', password: '' });
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id) {
    try {
      await api.patch(`/users/${id}/deactivate`);
      toast.info('Account deactivated');
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not deactivate');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Organization"
        title="Who runs the place."
        description="Administrators configure branches, departments and rooms. Desk staff don't need accounts — each counter signs in as itself."
      />

      <Card pad={false} className="mb-6 overflow-hidden">
        <div className="divide-y divide-line-soft">
          {users.map((u, i) => (
            <div
              key={u._id}
              className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface-alt transition-colors animate-rise-fast"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-10 h-10 rounded-[13px] bg-espresso-tint border border-espresso-tint-border grid place-items-center font-mono text-[13px] font-semibold text-espresso shrink-0">
                  {u.name?.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                    {u.name}
                    {u._id === me?._id && <Badge tone="neutral">you</Badge>}
                    {!u.isActive && <Badge tone="clay">deactivated</Badge>}
                  </p>
                  <p className="font-mono text-[11px] text-muted-3 mt-1 truncate">{u.email}</p>
                </div>
              </div>
              {u.isActive && u._id !== me?._id && (
                <button onClick={() => deactivate(u._id)} className={btn.secondary}>Deactivate</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Add an administrator</SectionTitle>
        <form onSubmit={invite} className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="grid gap-2">
              <MicroLabel>Full name</MicroLabel>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            </label>
            <label className="grid gap-2">
              <MicroLabel>Email</MicroLabel>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <MicroLabel>Temporary password</MicroLabel>
              <input required type="password" minLength={6} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
            </label>
          </div>
          <div><button disabled={busy} className={btn.primary}>Add administrator</button></div>
        </form>
      </Card>
    </div>
  );
}
