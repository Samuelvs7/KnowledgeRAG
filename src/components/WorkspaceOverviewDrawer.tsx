import { useEffect } from 'react';
import { X, BarChart3, Sparkles } from 'lucide-react';
import { DashboardMetrics, type DashboardMetricsProps } from './DashboardMetrics';
import { RecentActivityPanel, type RecentActivityPanelProps } from './RecentActivityPanel';

export interface WorkspaceOverviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: DashboardMetricsProps;
  activity: RecentActivityPanelProps;
}

export function WorkspaceOverviewDrawer({
  isOpen,
  onClose,
  metrics,
  activity,
}: WorkspaceOverviewDrawerProps) {
  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Click outside backdrop overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        {/* Slide-over panel */}
        <div className="w-screen max-w-md transform border-l border-slate-800 bg-slate-950 text-slate-100 shadow-2xl transition duration-300 ease-in-out sm:w-[420px]">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    Workspace Overview
                    <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live system metrics and recent activities
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                title="Close drawer (ESC)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Section 1: Dashboard Metrics */}
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  System Metrics
                </h3>
                <DashboardMetrics {...metrics} gridCols="grid-cols-2" />
              </div>

              <div className="h-px bg-slate-800/80" />

              {/* Section 2: Recent Activity */}
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
                  Recent Activity
                </h3>
                <RecentActivityPanel {...activity} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
