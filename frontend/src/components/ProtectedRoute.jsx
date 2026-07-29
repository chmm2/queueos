import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * Wraps a route element. If `roles` is provided, only those roles may
 * pass — this is the frontend half of RBAC (the backend middleware is
 * the real enforcement; this just keeps the UI from showing pages a
 * user has no business seeing).
 */
export default function ProtectedRoute({ children, roles }) {
  const { token, user } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;

  return children;
}
