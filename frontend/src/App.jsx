import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layout/DashboardLayout';
import { useAuthStore } from './store/authStore';

// Console (staff/admin) pages
import Overview from './pages/console/Overview';
import CounterCaller from './pages/console/CounterCaller';
import Branches from './pages/console/Branches';
import Services from './pages/console/Services';
import Counters from './pages/console/Counters';
import Staff from './pages/console/Staff';
import Analytics from './pages/console/Analytics';
import Displays from './pages/console/Displays';

// Public (no-login) customer + display surfaces
import Join from './pages/public/Join';
import TrackToken from './pages/public/TrackToken';
import Board from './pages/public/Board';

// Where each role lands after login.
function Home() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === 'Staff' || role === 'User' ? '/call' : '/overview'} replace />;
}

// Restrict a console route to specific roles.
function Only({ roles, children }) {
  const role = useAuthStore((s) => s.user?.role);
  return roles.includes(role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const admin = ['Admin'];
  const ops = ['Admin', 'Operator'];

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

        {/* Authenticated console with shared layout */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/overview" element={<Only roles={ops}><Overview /></Only>} />
          <Route path="/call" element={<CounterCaller />} />
          <Route path="/branches" element={<Only roles={admin}><Branches /></Only>} />
          <Route path="/services" element={<Only roles={ops}><Services /></Only>} />
          <Route path="/counters" element={<Only roles={ops}><Counters /></Only>} />
          <Route path="/staff" element={<Only roles={ops}><Staff /></Only>} />
          <Route path="/analytics" element={<Only roles={ops}><Analytics /></Only>} />
          <Route path="/displays" element={<Displays />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
