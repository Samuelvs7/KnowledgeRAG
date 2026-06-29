import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  User,
  Mail,
  Lock,
  LogOut,
  Loader2,
  UserCircle,
  BarChart3,
  History,
  Heart,
  Settings,
  Shield,
  Database,
} from 'lucide-react';

export function ProfilePage() {
  const { user, profile, loading, signUp, signIn, signOut, updateProfile } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
        setSuccess('Signed in successfully!');
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setSuccess('Account created! You can now sign in.');
        setIsLogin(true);
      }

      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProfile = async () => {
    setUpdatingProfile(true);
    try {
      const { error } = await updateProfile({ full_name: editName });
      if (error) throw error;
      setEditingProfile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="animate-fade-in max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <UserCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-slate-600">
            {isLogin
              ? 'Sign in to access all AI-powered features'
              : 'Create an account to get started'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          {error && (
            <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded-xl text-error-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-success-50 border border-success-200 rounded-xl text-success-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                  minLength={6}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Minimum 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 rounded-xl font-medium transition-all ${
                submitting
                  ? 'bg-slate-100 text-slate-400 cursor-wait'
                  : 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg hover:shadow-xl'
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
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in user profile
  return (
    <div className="animate-fade-in">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl p-8 text-white mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold">
              {profile?.full_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold">{profile?.full_name || 'Welcome!'}</h1>
              <p className="text-primary-100">{profile?.email}</p>
              <p className="text-sm text-primary-200 mt-1">
                Member since {new Date(profile?.created_at || user.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="ml-auto">
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Database, label: 'Documents', value: '0', color: 'from-blue-500 to-blue-600' },
            { icon: Heart, label: 'Favorites', value: '0', color: 'from-error-500 to-error-600' },
            { icon: History, label: 'Searches', value: '0', color: 'from-emerald-500 to-emerald-600' },
            { icon: BarChart3, label: 'Ratings', value: '0', color: 'from-violet-500 to-violet-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-shadow">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Profile Settings */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-500" />
              Profile Settings
            </h2>
          </div>

          {editingProfile ? (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingProfile(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateProfile}
                  disabled={updatingProfile}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {updatingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Full Name</p>
                    <p className="font-medium text-slate-900">{profile?.full_name || 'Not set'}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditName(profile?.full_name || '');
                    setEditingProfile(true);
                  }}
                  className="text-primary-500 hover:text-primary-600 font-medium text-sm"
                >
                  Edit
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Email Address</p>
                    <p className="font-medium text-slate-900">{profile?.email}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-success-100 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-success-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Account Status</p>
                    <p className="font-medium text-success-600">Active & Verified</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Features Info */}
        <div className="mt-8 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Your AI Features</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { title: 'Document RAG', desc: 'Upload and query documents with AI', status: 'Active' },
              { title: 'Product Search', desc: 'Semantic search and recommendations', status: 'Active' },
              { title: 'Codebase RAG', desc: 'Upload and query code repositories', status: 'Active' },
              { title: 'Learning Assistant', desc: 'Generate summaries, quizzes, flashcards', status: 'Active' },
            ].map((feature) => (
              <div key={feature.title} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-100">
                <div className="w-2 h-2 rounded-full bg-success-500 mt-2" />
                <div>
                  <h3 className="font-medium text-slate-900">{feature.title}</h3>
                  <p className="text-sm text-slate-500">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
