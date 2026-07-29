import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useBranchStore } from '../../store/branchStore';
import { toast } from '../../store/toastStore';
import { roleInfo, ROLE_INFO } from '../../lib/roles';
import { PageHeader, Card, SectionTitle, Badge, btn, field } from '../../components/ui';

/**
 * Staff management (Admin). Invite Staff / Operator / Admin accounts and
 * assign them to a branch.
 */
const ROLE_TONE = { Admin: 'brand', Operator: 'warning', Staff: 'neutral' };

export default function Staff() {
  const { user } = useAuthStore();
  const { branches, branchId } = useBranchStore();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Staff', branch: '' });
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
      await api.post('/users', { ...form, branch: form.branch || branchId || undefined });
      toast.success(`${roleInfo(form.role).label} account created`);
      setForm({ name: '', email: '', password: '', role: 'Staff', branch: '' });
      reload();
    } catch (e2) {
      toast.error(e2.response?.data?.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id) {
    await api.patch(`/users/${id}/deactivate`);
    toast.info('Account deactivated');
    reload();
  }

  const isAdmin = user?.role === 'Admin';

  return (
    <div className="max-w-3xl mx-auto animate-rise">
      <PageHeader title="Staff" description="People who run your queues — administrators, branch managers, and front-desk agents." />

      <Card pad={false} className="mb-6">
        <div className="divide-y divide-ink-100">
          {users.map((u) => (
            <div key={u._id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-ink-100 text-ink-500 grid place-items-center text-sm font-semibold">
                  {u.name?.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-ink-900 flex items-center gap-2">
                    {u.name}
                    <Badge tone={ROLE_TONE[u.role]}>{roleInfo(u.role).label}</Badge>
                    {!u.isActive && <Badge tone="danger">deactivated</Badge>}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">{u.email}</p>
                </div>
              </div>
              {isAdmin && u.isActive && u._id !== user._id && (
                <button onClick={() => deactivate(u._id)} className="text-sm text-ink-400 hover:text-red-600">Deactivate</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <SectionTitle>Add a staff account</SectionTitle>
          <form onSubmit={invite} className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
              <input required type="password" minLength={6} placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
                <option value="Staff">{ROLE_INFO.Staff.label} (Staff)</option>
                <option value="Operator">{ROLE_INFO.Operator.label} (Operator)</option>
                <option value="Admin">{ROLE_INFO.Admin.label} (Admin)</option>
              </select>
              <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={`${field} sm:col-span-2`}>
                <option value="">Assign to branch…</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-ink-500">{roleInfo(form.role).can}</p>
            <div><button disabled={busy} className={btn.primary}>Create account</button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
