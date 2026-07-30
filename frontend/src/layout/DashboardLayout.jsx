import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useBranchStore } from '../store/branchStore';
import { roleInfo } from '../lib/roles';
import { Icon, NAV_ICON } from '../components/icons';
import Toaster from '../components/Toaster';

/**
 * The console shell. Navigation is deliberately two-level, mirroring how the
 * business actually works:
 *
 *   ORGANIZATION  →  Branches (create locations, then step into one)
 *   BRANCH        →  Departments · Rooms · Staff · Analytics · Displays & QR
 *
 * Everything operational belongs to a specific branch, so the branch-scoped
 * section only appears once you're inside one.
 */
const BRANCH_NAV = [
  ['', 'Overview'],
  ['departments', 'Departments'],
  ['rooms', 'Rooms & Counters'],
  ['staff', 'Staff'],
  ['analytics', 'Analytics'],
  ['displays', 'Displays & QR'],
];

export default function DashboardLayout() {
  const { user, organization, logout } = useAuthStore();
  const { branches, setBranches } = useBranchStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId } = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    api.get('/branches').then(({ data }) => setBranches(data.branches)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const branch = branches.find((b) => b._id === branchId);
  const orgName = organization?.name || 'Your organization';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
      isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
    }`;

  const Sidebar = (
    <div className="h-full flex flex-col bg-white">
      <div className="px-5 py-4 border-b border-ink-100 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">Q</span>
            <span className="font-semibold text-ink-900">QueueOS</span>
          </div>
          <p className="text-xs text-ink-400 mt-1.5 truncate max-w-[11rem]">{orgName}</p>
        </div>
        <button className="lg:hidden text-ink-400" onClick={() => setMobileOpen(false)} aria-label="Close menu"><Icon.x /></button>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {/* Organization level */}
        <p className="px-3 pb-1.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Organization</p>
        <div className="space-y-0.5">
          {isAdmin && (
            <NavLink to="/branches" end className={linkCls}>
              <Icon.building /> Branches
            </NavLink>
          )}
          <NavLink to="/call" className={linkCls}>
            <Icon.call /> Call next
          </NavLink>
        </div>

        {/* Branch level — only once you're inside a branch */}
        {branch && (
          <>
            <div className="px-3 pt-5 pb-1.5">
              <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider">Branch</p>
              <p className="text-sm font-semibold text-ink-800 truncate mt-0.5">{branch.name}</p>
            </div>
            <div className="space-y-0.5">
              {BRANCH_NAV.map(([seg, label]) => {
                const to = `/branches/${branchId}${seg ? `/${seg}` : ''}`;
                const IconCmp = Icon[NAV_ICON[seg || 'overview']] || Icon.grid;
                return (
                  <NavLink key={seg} to={to} end={seg === ''} className={linkCls}>
                    <IconCmp /> {label}
                  </NavLink>
                );
              })}
            </div>
            {isAdmin && (
              <Link to="/branches" className="flex items-center gap-2 px-3 py-2 mt-2 text-xs text-ink-400 hover:text-ink-600">
                ← All branches
              </Link>
            )}
          </>
        )}
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
      <aside className="hidden lg:block w-60 shrink-0 border-r border-ink-200/70">{Sidebar}</aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 shadow-xl">{Sidebar}</aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white/80 backdrop-blur border-b border-ink-200/70 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden text-ink-500" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Icon.menu /></button>
            {branch ? (
              <nav className="flex items-center gap-2 text-sm min-w-0">
                <Link to="/branches" className="text-ink-400 hover:text-ink-600 hidden sm:inline">Branches</Link>
                <span className="text-ink-300 hidden sm:inline">/</span>
                <span className="font-semibold text-ink-800 truncate">{branch.name}</span>
              </nav>
            ) : (
              <span className="text-sm font-semibold text-ink-800">{orgName}</span>
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
