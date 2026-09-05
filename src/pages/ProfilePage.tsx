import { useState, useEffect } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  User,
  Mail,
  Lock,
  Loader2,
  ArrowLeft,
  Brain
} from 'lucide-react';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading, signUp, signIn } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto redirect to main app if they just signed up/in and were dropped here
  useEffect(() => {
    if (user && success === 'Signed in successfully!') {
      navigate('/', { replace: true });
    }
  }, [user, success, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate('/documents', { replace: true });
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        // Redirect directly since signUp auto-signs in 
        navigate('/documents', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (isLogin) {
        setEmail('');
        setPassword('');
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm p-6 w-full">
          <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white max-w-7xl mx-auto">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="animate-fade-in max-w-md w-full">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Brain className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p className="text-slate-400">
                {isLogin
                  ? 'Sign in to access all AI-powered features'
                  : 'Create an account to get started'}
              </p>
            </div>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl">
              {error && (
                <div className="mb-6 p-4 bg-error-500/10 border border-error-500/20 rounded-xl text-error-400 text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-6 p-4 bg-success-500/10 border border-success-500/20 rounded-xl text-success-400 text-sm">
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500"
                        required={!isLogin}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500"
                      required
                      minLength={6}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Minimum 6 characters</p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    submitting
                      ? 'bg-slate-700 text-slate-400 cursor-wait'
                      : 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg hover:shadow-primary-500/25'
                  }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {isLogin ? 'Signing in...' : 'Creating account...'}
                    </span>
                  ) : (
                    isLogin ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  {isLogin
                    ? "Don't have an account? Sign up"
                    : 'Already have an account? Sign in'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Profile UI moved to WorkspaceLayout modal
  // Redirect away if navigating here manually while authenticated
  return <Navigate to='/' replace />;
}
