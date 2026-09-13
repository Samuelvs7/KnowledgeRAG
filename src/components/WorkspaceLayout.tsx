import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Brain,
  FileText,
  Code2,
  GraduationCap,
  Cpu,
  ChevronLeft,
  Settings,
  LogOut,
  X,
  User,
  Mail,
  Shield,
  Database,
  History,
  Heart,
  BarChart3,
} from 'lucide-react';

interface WorkspaceLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  accentColor: string;
  sidebarItems: SidebarItem[];
  bottomSidebarItems?: SidebarItem[];
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: typeof FileText;
  onClick?: () => void;
  active?: boolean;
  badge?: number | string;
  indent?: boolean;
}

export function WorkspaceLayout({
  children,
  title,
  subtitle,
  icon: Icon,
  accentColor,
  sidebarItems,
  bottomSidebarItems,
}: WorkspaceLayoutProps) {
  const { user, profile, signOut, updateProfile } = useAuth();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const knowledgeModules = [
    { to: '/documents', label: 'Documents', icon: FileText, color: 'bg-blue-500' },
    { to: '/codebase', label: 'GitHub', icon: Code2, color: 'bg-violet-500' },
    { to: '/learning', label: 'Learning', icon: GraduationCap, color: 'bg-orange-500' },
  ];

  const handleUpdateProfile = async () => {
    setUpdatingProfile(true);
    try {
      const { error } = await updateProfile({ full_name: editName });
      if (!error) {
        setEditingProfile(false);
      }
    } finally {
      setUpdatingProfile(false);
    }
  };

  return (
    <div className="h-screen bg-slate-900 flex overflow-hidden">
      {/* Left Sidebar - Module Navigation */}
      <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
        <Link to="/" className="mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center hover:shadow-lg hover:shadow-primary-500/25 transition-all">
            <Brain className="w-5 h-5 text-white" />
          </div>
        </Link>

        {/* KNOWLEDGE Section Header */}
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider my-0.5 text-center">
          KNL
        </div>

        {knowledgeModules.map((mod) => {
          const isActive = location.pathname.startsWith(mod.to);
          return (
            <Link
              key={mod.to}
              to={mod.to}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? `${mod.color} text-white shadow-lg`
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
              title={`Knowledge > ${mod.label}`}
            >
              <mod.icon className="w-5 h-5" />
            </Link>
          );
        })}

        <div className="flex-1" />

        {user && (
          <Link
            to="/engine"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              location.pathname === '/engine'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title="AI Engine"
          >
            <Cpu className="w-5 h-5" />
          </Link>
        )}

        <div className="w-8 h-px bg-slate-800 my-2" />

        {user ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 hover:bg-primary-500 hover:text-white transition-all shadow-md"
              title="Your Profile"
            >
              {profile?.full_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
            </button>
            <button
              onClick={signOut}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-error-400 hover:bg-slate-800 transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            to="/profile"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
          >
            <Settings className="w-5 h-5" />
          </Link>
        )}
      </div>

      {/* Module Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Module Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${accentColor} flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-white">{title}</h1>
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-slate-800 text-slate-400 border border-slate-700">
                  KNOWLEDGE
                </span>
              </div>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="px-3 py-2 border-b border-slate-800">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Sidebar Items */}
        <div className="flex-1 overflow-y-auto p-2">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                item.active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              } ${item.indent ? 'ml-4' : ''}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bottom Sidebar Items */}
        {bottomSidebarItems && bottomSidebarItems.length > 0 && (
          <div className="p-2 border-t border-slate-800 bg-slate-950/40">
            {bottomSidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  item.active
                    ? 'bg-blue-600 text-white font-medium shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0 text-blue-400" />
                <span className="flex-1 text-left font-medium">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {children}
        
        {/* Unified Profile Modal */}
        {showProfile && user && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 overflow-y-auto">
            <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden relative animate-fade-in my-auto">
              {/* Close Button */}
              <button 
                onClick={() => setShowProfile(false)}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-white relative">
                <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
                <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                  <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold shadow-inner">
                    {profile?.full_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="text-center sm:text-left">
                    <h1 className="text-2xl font-bold">{profile?.full_name || 'Welcome!'}</h1>
                    <p className="text-primary-200">{profile?.email}</p>
                    <p className="text-sm text-primary-300 mt-1">
                      Member since {new Date(profile?.created_at || user.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <button
                      onClick={() => {
                        setShowProfile(false);
                        signOut();
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-black/20 hover:bg-black/40 backdrop-blur-sm rounded-xl transition-colors font-medium border border-white/10"
                    >
                      <LogOut className="w-4 h-4 text-white" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-8">
                {/* Stats row */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { icon: Database, label: 'Documents', value: '0', color: 'from-blue-500 to-blue-600' },
                    { icon: Heart, label: 'Favorites', value: '0', color: 'from-rose-500 to-rose-600' },
                    { icon: History, label: 'Searches', value: '0', color: 'from-emerald-500 to-emerald-600' },
                    { icon: BarChart3, label: 'Ratings', value: '0', color: 'from-violet-500 to-violet-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-slate-800 rounded-xl border border-slate-700 p-4 shadow-lg flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-inner`}>
                        <stat.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Settings Box */}
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg">
                    <div className="p-5 border-b border-slate-700">
                      <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <Settings className="w-4 h-4 text-slate-400" />
                        Account Details
                      </h2>
                    </div>
                    
                    {editingProfile ? (
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Edit Display Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Your name"
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={() => setEditingProfile(false)}
                            className="px-4 py-2 border border-slate-600 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleUpdateProfile}
                            disabled={updatingProfile}
                            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium disabled:opacity-50 transition-colors text-sm"
                          >
                            {updatingProfile ? 'Saving...' : 'Save Name'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary-400" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Full Name</p>
                              <p className="text-sm font-medium text-white">{profile?.full_name || 'Not set'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setEditName(profile?.full_name || '');
                              setEditingProfile(true);
                            }}
                            className="text-primary-400 hover:text-primary-300 font-medium text-xs px-3 py-1.5 rounded-lg hover:bg-primary-500/10 transition-colors"
                          >
                            Edit
                          </button>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-primary-400" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Email Address</p>
                            <p className="text-sm font-medium text-white">{profile?.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Security</p>
                            <p className="text-sm font-medium text-emerald-400">Active & Verified</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Features Box */}
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg">
                    <div className="p-5 border-b border-slate-700">
                      <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <Brain className="w-4 h-4 text-slate-400" />
                        Licensed Features
                      </h2>
                    </div>
                    <div className="p-5 grid gap-3">
                      {[
                        { title: 'Document RAG', desc: 'Query unstructured documents' },
                        { title: 'Codebase Support', desc: 'Symbol and logic querying' },
                        { title: 'Learning Suite', desc: 'Flashcards and summaries' },
                      ].map((feature) => (
                        <div key={feature.title} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-colors">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] mt-1.5 shrink-0" />
                          <div>
                            <h3 className="text-sm font-medium text-white mb-0.5">{feature.title}</h3>
                            <p className="text-xs text-slate-400">{feature.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
