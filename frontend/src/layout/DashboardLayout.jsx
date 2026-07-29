import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useBranchStore } from '../store/branchStore';
import { useTerms } from '../lib/terms';
import { roleInfo } from '../lib/roles';
import { Icon, NAV_ICON } from '../components/icons';
import Toaster from '../components/Toaster';

/**
 * The console shell: a role-aware sidebar (icons + labels), a top bar with the
 * branch switcher + user, and the active page in the middle. Collapses to a
 * slide-over on mobile so it works on a phone at the counter.
 */
// Routes per role. Labels are resolved from the org's vocabulary at render
// (e.g. "Counters" becomes "Rooms" for a hospital).
const NAV = {
  Admin: ['/overview', '/call', '/branches', '/services', '/counters', '/staff', '/analytics', '/displays'],
  Operator: ['/overview', '/call', '/counters', '/staff', '/analytics', '/displays'],
  Staff: ['/call', '/displays'],
  User: ['/call'],
};

function labelFor(to, t) {
  switch (to) {
    case '/overview': return 'Overview';
    case '/call': return 'Call next';
    case '/branches': return 'Branches';
    case '/services': return t.servicePlural;
    case '/counters': return t.counterPlural;
    case '/staff': return 'Staff';
    case '/analytics': return 'Analytics';
    case '/displays': return 'Displays & QR';
    default: return to;
  }
}

export default function DashboardLayout() {
  const { user, organization, logout } = useAuthStore();
  const { branchId, branches, setBranches, setBranchId } = useBranchStore();
  const navigate = useNavigate();
  const location = useLocation();
  const terms = useTerms();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api.get('/branches').then(({ data }) => {
      setBranches(data.branches);
      if (!branchId) {
        const mine = user?.branch && data.branches.find((b) => b._id === user.branch);
        setBranchId((mine || data.branches[0])?._id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const items = NAV[user?.role] || NAV.Staff;
  const canSwitchBranch = user?.role === 'Admin';
  const orgName = organization?.name || user?.organization?.name || 'Your organization';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const Sidebar = (
    <div className="h-full flex flex-col bg-white">
      <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">Q</span>
            <span className="font-semibold text-ink-900">QueueOS</span>
          </div>
          <p className="text-xs text-ink-400 mt-1.5 truncate max-w-[11rem]">{orgName}</p>
        </div>
        <button className="lg:hidden text-ink-400" onClick={() => setMobileOpen(false)} aria-label="Close menu"><Icon.x /></button>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((to) => {
          const IconCmp = Icon[NAV_ICON[to]] || Icon.grid;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                }`
              }
            >
              <IconCmp />
              {labelFor(to, terms)}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-ink-100">
        <div className="px-2 mb-2">
          <p className="text-sm font-medium text-ink-900 truncate">{user?.name}</p>
          <p className="text-xs text-ink-400" title={roleInfo(user?.role).can}>{roleInfo(user?.role).label}</p>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 transition">
          <Icon.logout /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-ink-50 text-ink-800">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-ink-200/70">{Sidebar}</aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 shadow-xl">{Sidebar}</aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white/80 backdrop-blur border-b border-ink-200/70 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-ink-500" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Icon.menu /></button>
            <span className="text-xs font-medium text-ink-400 uppercase tracking-wider hidden sm:inline">Branch</span>
            {canSwitchBranch ? (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="text-sm font-medium border border-ink-200 rounded-lg px-2.5 py-1.5 bg-white">
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            ) : (
              <span className="text-sm font-semibold text-ink-800">{branches.find((b) => b._id === branchId)?.name || '—'}</span>
            )}
          </div>
          <span className="text-xs text-ink-400 truncate max-w-[45%]">{user?.email}</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  );
}
