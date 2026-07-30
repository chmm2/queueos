import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layout/DashboardLayout';
import { useAuthStore } from './store/authStore';

// Admin console (organization + branch level)
import Branches from './pages/console/Branches';
import BranchOverview from './pages/console/BranchOverview';
import Departments from './pages/console/Departments';
import Rooms from './pages/console/Rooms';
import Analytics from './pages/console/Analytics';
import Displays from './pages/console/Displays';
import Administrators from './pages/console/Administrators';

// Counter workstation (its own full-screen surface)
import CounterConsole from './pages/counter/CounterConsole';

// Public (no-login) customer + display surfaces
import Join from './pages/public/Join';
import TrackToken from './pages/public/TrackToken';
import Board from './pages/public/Board';

/** Admins land in the console; a counter lands on its own workstation. */
function Home() {
  const principal = useAuthStore((s) => s.principal);
  return <Navigate to={principal === 'counter' ? '/counter' : '/branches'} replace />;
}

/** The admin console is for administrators only — counters can't reach it. */
function AdminOnly({ children }) {
  const principal = useAuthStore((s) => s.principal);
  if (!principal) return <Navigate to="/login" replace />;
  return principal === 'user' ? children : <Navigate to="/counter" replace />;
}

/** The workstation is for counters only. */
function CounterOnly({ children }) {
  const principal = useAuthStore((s) => s.principal);
  if (!principal) return <Navigate to="/login" replace />;
  return principal === 'counter' ? children : <Navigate to="/branches" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Public customer + display routes — no authentication */}
        <Route path="/join/:slug/:branchId" element={<Join />} />
        <Route path="/join/:branchId" element={<Join />} />
        <Route path="/t/:tokenId" element={<TrackToken />} />
        <Route path="/board/:branchId" element={<Board />} />

        {/* Counter workstation */}
        <Route
          path="/counter"
          element={
            <ProtectedRoute>
              <CounterOnly><CounterConsole /></CounterOnly>
            </ProtectedRoute>
          }
        />

        {/* Admin console */}
        <Route
          element={
            <ProtectedRoute>
              <AdminOnly><DashboardLayout /></AdminOnly>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/administrators" element={<Administrators />} />
          <Route path="/branches/:branchId" element={<BranchOverview />} />
          <Route path="/branches/:branchId/departments" element={<Departments />} />
          <Route path="/branches/:branchId/rooms" element={<Rooms />} />
          <Route path="/branches/:branchId/analytics" element={<Analytics />} />
          <Route path="/branches/:branchId/displays" element={<Displays />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
