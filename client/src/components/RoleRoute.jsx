import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, homePathForRole } from '../context/AuthContext';

/** Restrict a route tree to one or more roles */
export default function RoleRoute({ roles = ['admin'] }) {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-pulse text-primary-600 text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  return <Outlet />;
}
