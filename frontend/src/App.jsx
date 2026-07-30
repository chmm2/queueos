import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layout/DashboardLayout';
import { useAuthStore } from './store/authStore';

// Organization level
import Branches from './pages/console/Branches';
import CounterCaller from './pages/console/CounterCaller';

// Branch level
import BranchOverview from './pages/console/BranchOverview';
import Departments from './pages/console/Departments';
import Rooms from './pages/console/Rooms';
import Staff from './pages/console/Staff';
import Analytics from './pages/console/Analytics';
import Displays from './pages/console/Displays';

// Public (no-login) customer + display surfaces
import Join from './pages/public/Join';
import TrackToken from './pages/public/TrackToken';
import Board from './pages/public/Board';

// Admins configure the org; staff go straight to their counter.
function Home() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === 'Admin' ? '/branches' : '/call'} replace />;
}

function AdminOnly({ children }) {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'Admin' ? children : <Navigate to="/call" replace />;
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

        {/* Authenticated console */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/call" element={<CounterCaller />} />
          <Route path="/branches" element={<AdminOnly><Branches /></AdminOnly>} />

          {/* Everything operational is scoped to a branch */}
          <Route path="/branches/:branchId" element={<AdminOnly><BranchOverview /></AdminOnly>} />
          <Route path="/branches/:branchId/departments" element={<AdminOnly><Departments /></AdminOnly>} />
          <Route path="/branches/:branchId/rooms" element={<AdminOnly><Rooms /></AdminOnly>} />
          <Route path="/branches/:branchId/staff" element={<AdminOnly><Staff /></AdminOnly>} />
          <Route path="/branches/:branchId/analytics" element={<AdminOnly><Analytics /></AdminOnly>} />
          <Route path="/branches/:branchId/displays" element={<AdminOnly><Displays /></AdminOnly>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
