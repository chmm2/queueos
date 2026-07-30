import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { roleInfo, ROLE_INFO } from '../../lib/roles';
import { PageHeader, Card, SectionTitle, Badge, EmptyState, btn, field } from '../../components/ui';

/**
 * Staff working at this branch. Two roles only: Admin (configures the
 * organization) and Staff (works a counter).
 */
const ROLE_TONE = { Admin: 'brand', Staff: 'neutral' };

export default function Staff() {
  const { branchId } = useParams();
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Staff' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await api.get(`/users?branch=${branchId}`);
    setUsers(data.users);
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/users', { ...form, branch: form.role === 'Staff' ? branchId : undefined });
      toast.success(`${roleInfo(form.role).label} account created`);
      setForm({ name: '', email: '', password: '', role: 'Staff' });
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
      <PageHeader title="Staff" description="People who work at this branch and the counters they're assigned to." />

      <Card pad={false} className="mb-6">
        {users.length === 0 ? (
          <EmptyState title="No staff at this branch yet" hint="Add an account below, then assign them to a counter on the Rooms page." />
        ) : (
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
                      <Badge tone={ROLE_TONE[u.role]}>{roleInfo(u.role).label}</Badge>
                      {!u.isActive && <Badge tone="danger">deactivated</Badge>}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5 truncate">
                      {u.email}
                      {u.counter?.code && ` · ${u.counter.code}`}
                    </p>
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
        )}
      </Card>

      <Card>
        <SectionTitle>Add a staff account</SectionTitle>
        <form onSubmit={invite} className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            <input required type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            <input required type="password" minLength={6} placeholder="Temporary password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
              <option value="Staff">{ROLE_INFO.Staff.label} (Staff)</option>
              <option value="Admin">{ROLE_INFO.Admin.label} (Admin)</option>
            </select>
          </div>
          <p className="text-xs text-ink-500">{roleInfo(form.role).can}</p>
          <div><button disabled={busy} className={btn.primary}>Create account</button></div>
        </form>
      </Card>
    </div>
  );
}
