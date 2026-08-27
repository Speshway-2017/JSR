import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MDIProvider } from '../context/MDIContext';
import Layout from '../components/Layout';

export default function PrivateRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-pulse text-primary-600 text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <MDIProvider>
      <Layout>
        <Outlet />
      </Layout>
    </MDIProvider>
  );
}
