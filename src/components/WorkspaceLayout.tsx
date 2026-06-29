import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Brain,
  FileText,
  Package,
  Code2,
  GraduationCap,
  Cpu,
  ChevronLeft,
  Settings,
  LogOut,
} from 'lucide-react';

interface WorkspaceLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  accentColor: string;
  sidebarItems: SidebarItem[];
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
}: WorkspaceLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();

  const modules = [
    { to: '/documents', label: 'Documents', icon: FileText, color: 'bg-blue-500' },
    { to: '/products', label: 'Products', icon: Package, color: 'bg-emerald-500' },
    { to: '/codebase', label: 'Codebase', icon: Code2, color: 'bg-violet-500' },
    { to: '/learning', label: 'Learning', icon: GraduationCap, color: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left Sidebar - Module Navigation */}
      <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
        <Link to="/" className="mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center hover:shadow-lg hover:shadow-primary-500/25 transition-all">
            <Brain className="w-5 h-5 text-white" />
          </div>
        </Link>

        <div className="w-8 h-px bg-slate-800 mb-2" />

        {modules.map((mod) => {
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
              title={mod.label}
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
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300">
              {profile?.full_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
            </div>
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
            <div className={`w-10 h-10 rounded-xl ${accentColor} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white">{title}</h1>
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
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
