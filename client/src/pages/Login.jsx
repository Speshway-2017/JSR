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
          <div className="inline-flex items-center justify-center mb-4">
            <BrandLogo className="w-20 h-20 shadow-soft" />
          </div>
          <h1 className="text-3xl font-bold text-primary-700">JSR</h1>
          <p className="text-primary-500 mt-2 text-lg">Vendor &amp; Sales Management</p>
        </div>

        <form onSubmit={handleSubmit} className="card !p-8 space-y-5">
          <h2 className="text-xl font-bold text-primary-700 text-center">Sign In</h2>

          <div>
            <label className="label">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-300" />
              <input
                type="email"
                className="input-field pl-12"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field pl-12 pr-12"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full !py-4 text-lg" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-primary-400 text-sm mt-6 space-y-1">
          <p>Admin: admin@jsr.com / admin123</p>
          <p>Sales: sales@jsr.com / sales123</p>
        </div>
      </div>
    </div>
  );
}
