import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, homePathForRole } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import TitleBar from '../components/TitleBar';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate(homePathForRole(role), { replace: true });
  }, [isAuthenticated, role, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      toast.success('Welcome back!');
      navigate(homePathForRole(data.user?.role));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-cream to-accent-50 p-4">
      <TitleBar standalone />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">JSR</h1>
          <p className="text-primary-500 mt-2 text-lg">Vendor &amp; Sales Management</p>
        </div>

        <form onSubmit={handleSubmit} className="card !p-7 space-y-4 border border-primary-200">
          <h2 className="text-lg font-bold text-primary-800 text-center">Sign In</h2>

          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input
                type="email"
                className="h-10 w-full rounded-lg border border-primary-200 bg-surface pl-10 pr-3 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="h-10 w-full rounded-lg border border-primary-200 bg-surface pl-10 pr-10 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full !py-2.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-2xs" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-primary-400 text-xs mt-6 space-y-0.5">
          <p>Admin: <span className="font-mono text-primary-600">admin@jsr.com / admin123</span></p>
          <p>Sales: <span className="font-mono text-primary-600">sales@jsr.com / sales123</span></p>
        </div>
      </div>
    </div>
  );
}
