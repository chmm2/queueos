import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { PageHeader, Card, SectionTitle, Badge, btn, field } from '../../components/ui';

/**
 * Administrator accounts — the only accounts belonging to a PERSON.
 * The people working the desks don't have accounts here: each counter is its
 * own login, created alongside the counter itself (see Rooms & Counters).
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
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader
        title="Administrators"
        description="People who configure the organization. Desk staff don't need accounts — each counter signs in as itself."
      />

      <Card pad={false} className="mb-6">
        <div className="divide-y divide-ink-100">
          {users.map((u) => (
            <div key={u._id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-ink-100 text-ink-500 grid place-items-center text-sm font-semibold shrink-0">
                  {u.name?.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink-900 flex items-center gap-2 flex-wrap">
                    {u.name}
                    {u._id === me?._id && <Badge tone="brand">you</Badge>}
                    {!u.isActive && <Badge tone="danger">deactivated</Badge>}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5 truncate">{u.email}</p>
                </div>
              </div>
              {u.isActive && u._id !== me?._id && (
                <button onClick={() => deactivate(u._id)} className="text-sm text-ink-400 hover:text-red-600 shrink-0">
                  Deactivate
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Add an administrator</SectionTitle>
        <form onSubmit={invite} className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            <input required type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            <input required type="password" minLength={6} placeholder="Temporary password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${field} sm:col-span-2`} />
          </div>
          <div><button disabled={busy} className={btn.primary}>Add administrator</button></div>
        </form>
      </Card>
    </div>
  );
}
