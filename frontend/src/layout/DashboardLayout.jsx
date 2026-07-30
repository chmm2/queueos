import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useBranchStore } from '../store/branchStore';
import Toaster from '../components/Toaster';
import { Wordmark } from '../components/Logo';

/**
 * The admin console shell.
 *
 * Navigation mirrors how the business is organised: the ORGANIZATION group is
 * always present, the BRANCH group appears once you step into a location, and
 * LIVE SURFACES links out to the screens that face customers.
 */
export default function DashboardLayout() {
  const { user, organization, logout } = useAuthStore();
  const { branches, setBranches } = useBranchStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId } = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api.get('/branches').then(({ data }) => setBranches(data.branches)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const branch = branches.find((b) => b._id === branchId);
  const orgName = organization?.name || 'Your organization';
  const initials = (user?.name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const Sidebar = (
    <div className="h-full flex flex-col bg-sidebar overflow-x-hidden min-w-0">
      <div className="px-5 py-5">
        <Wordmark size="sidebar" sub={orgName} />
      </div>

      <nav className="flex-1 px-3 pb-4 overflow-y-auto overflow-x-hidden min-w-0">
        <NavGroup label="Organization">
          <NavRow to="/branches" end>Branches</NavRow>
          <NavRow to="/administrators">Administrators</NavRow>
        </NavGroup>

        {branch && (
          <NavGroup label={`Branch — ${branch.name}`}>
            <NavRow to={`/branches/${branchId}`} end>Overview</NavRow>
            <NavRow to={`/branches/${branchId}/departments`}>Departments</NavRow>
            <NavRow to={`/branches/${branchId}/rooms`}>Rooms &amp; Counters</NavRow>
            <NavRow to={`/branches/${branchId}/analytics`}>Analytics</NavRow>
            <NavRow to={`/branches/${branchId}/displays`}>Displays &amp; QR</NavRow>
          </NavGroup>
        )}

      </nav>

      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="w-9 h-9 rounded-[11px] bg-espresso text-paper grid place-items-center font-mono text-[12px] font-semibold shrink-0">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink truncate">{user?.name}</p>
            <p className="font-mono text-[10px] tracking-[.16em] uppercase text-muted-3">Administrator</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[13px] font-semibold text-muted-2 hover:text-clay transition-colors shrink-0"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid" style={{ gridTemplateColumns: '250px minmax(0,1fr)' }}>
      <aside className="hidden lg:block border-r border-line min-w-0">{Sidebar}</aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[260px] shadow-lift">{Sidebar}</aside>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur">
          <div className="max-w-[1280px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="lg:hidden text-ink-2 text-xl leading-none"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                ≡
              </button>
              <nav className="flex items-center gap-2 text-[14px] min-w-0">
                <Link to="/branches" className="text-muted-2 hover:text-ink font-normal hidden sm:inline">
                  Branches
                </Link>
                {branch && (
                  <>
                    <span className="text-line-strong hidden sm:inline">/</span>
                    <span className="font-bold text-ink truncate">{branch.name}</span>
                  </>
                )}
              </nav>
            </div>
            <span className="font-mono text-[11px] text-muted-3 truncate max-w-[240px] hidden md:inline shrink-0">
              {user?.email}
            </span>
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-[72px]">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  );
}

function NavGroup({ label, children }) {
  return (
    <div className="mb-6">
      <p className="font-mono text-[10px] tracking-[.18em] uppercase text-muted-3 px-3 mb-2">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** A nav row: a 7px square marker plus the label. */
function NavRow({ to, end, children }) {
  const base =
    'flex items-center gap-3 px-3 py-2 rounded-[10px] text-[14px] transition-all duration-150 min-w-0';
  const marker = (active) =>
    `w-[7px] h-[7px] rounded-[2px] shrink-0 ${active ? 'bg-espresso' : 'bg-[#CFC7B5]'}`;

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? 'bg-surface border border-line-input shadow-rest font-semibold text-ink'
            : 'border border-transparent text-muted hover:text-ink font-normal'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={marker(isActive)} />
          <span className="truncate">{children}</span>
        </>
      )}
    </NavLink>
  );
}
