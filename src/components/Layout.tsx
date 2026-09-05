import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Brain,
  FileText,
  Package,
  Code2,
  GraduationCap,
  Menu,
  X,
  LogOut,
  LogIn,
  Search,
  Sparkles,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Home', icon: Sparkles },
  { to: '/documents', label: 'Documents', icon: FileText, category: 'Knowledge' },
  { to: '/codebase', label: 'GitHub', icon: Code2, category: 'Knowledge' },
  { to: '/learning', label: 'Learning', icon: GraduationCap, category: 'Knowledge' },
  { to: '/products', label: 'StockQuery', icon: Package, category: 'AI Agent' },
];

export function Layout() {
  const { user, profile, loading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => path === location.pathname;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-primary-500/20 rounded-xl blur-lg group-hover:bg-primary-500/30 transition-all duration-300" />
                <div className="relative w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-primary-500/25 transition-all duration-300">
                  <Brain className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                  KnowledgeRAG
                </h1>
                <p className="text-xs text-slate-500 -mt-1">AI Knowledge & Agent Platform</p>
              </div>
            </NavLink>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive(to)
                      ? 'bg-primary-50 text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-primary-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Right section */}
            <div className="flex items-center gap-3">
              {/* Global Search */}
              <button className="hidden sm:flex items-center gap-2 px-3 py-2 text-slate-500 bg-slate-100/50 hover:bg-slate-100 rounded-lg text-sm transition-colors">
                <Search className="w-4 h-4" />
                <span className="hidden lg:inline">Search...</span>
                <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-white rounded border border-slate-200 text-slate-400">
                  <span>⌘</span>K
                </kbd>
              </button>

              {/* Auth button */}
              {!loading && (
                <div className="flex items-center gap-2">
                  {user ? (
                    <div className="flex items-center gap-2">
                      <NavLink
                        to="/profile"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive('/profile')
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-slate-600 hover:text-primary-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-8 h-8 bg-gradient-to-br from-accent-400 to-accent-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
                          {profile?.full_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span className="hidden lg:inline">{profile?.full_name || 'Profile'}</span>
                      </NavLink>
                      <button
                        onClick={signOut}
                        className="p-2 text-slate-500 hover:text-error-500 hover:bg-error-50 rounded-lg transition-colors"
                        title="Sign out"
                      >
                        <LogOut className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <NavLink
                      to="/profile"
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm hover:shadow-md"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </NavLink>
                  )}
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-slate-600 hover:text-primary-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200/50 bg-white animate-slide-down">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-slate-600 hover:text-primary-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 bg-white/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary-500" />
              <span>KnowledgeRAG - AI-Powered Search Platform</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Built with Supabase & pgvector</span>
              <span className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
              <span>Vector Search</span>
              <span className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
              <span>AI Recommendations</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
