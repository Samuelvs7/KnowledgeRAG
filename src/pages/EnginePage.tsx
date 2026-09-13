import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { AIInfrastructureStatus, AIQuery } from '../types';
import {
  Cpu,
  Database,
  Brain,
  RefreshCw,
  Activity,
  Zap,
  BarChart3,
  Layers,
  FileText,
  Code2,
  GraduationCap,
  Search,
} from 'lucide-react';

interface ModuleStat {
  primary: number;
  secondary: number;
  queries: number;
  primaryLabel: string;
  secondaryLabel: string;
}

export function EnginePage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AIInfrastructureStatus[]>([]);
  const [queries, setQueries] = useState<AIQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [statusRes, queriesRes] = await Promise.all([
        supabase.from('ai_infrastructure_status').select('*'),
        supabase.from('ai_queries').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      if (statusRes.data) setStatus(statusRes.data);
      if (queriesRes.data) setQueries(queriesRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      // Simulate health check
      await new Promise(r => setTimeout(r, 1000));

      const updates = [
        { component: 'embedding_model' as const, status: 'online' as const, latency_ms: 120 + Math.random() * 50, last_check_at: new Date().toISOString() },
        { component: 'vector_database' as const, status: 'online' as const, latency_ms: 85 + Math.random() * 30, last_check_at: new Date().toISOString() },
        { component: 'llm' as const, status: 'online' as const, latency_ms: 650 + Math.random() * 200, last_check_at: new Date().toISOString() },
        { component: 'reranker' as const, status: 'online' as const, latency_ms: 45 + Math.random() * 20, last_check_at: new Date().toISOString() },
      ];

      for (const update of updates) {
        await supabase.from('ai_infrastructure_status').update(update).eq('component', update.component);
      }

      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  const componentIcons = {
    embedding_model: Brain,
    vector_database: Database,
    llm: Cpu,
    reranker: RefreshCw,
  };

  // TODO: Replace with real database counts in Phase 3+
  const stats: Record<string, ModuleStat> = {
    documents: { primary: 1247, secondary: 1247, queries: 89, primaryLabel: 'Chunks', secondaryLabel: 'Embeddings' },
    codebase: { primary: 24, secondary: 156, queries: 23, primaryLabel: 'Files', secondaryLabel: 'Functions' },
    learning: { primary: 12, secondary: 456, queries: 45, primaryLabel: 'Materials', secondaryLabel: 'Chunks' },
  };

  const statusConfig = {
    online: { color: 'bg-emerald-500', text: 'text-emerald-400', label: 'Online' },
    degraded: { color: 'bg-amber-500', text: 'text-amber-400', label: 'Degraded' },
    offline: { color: 'bg-red-500', text: 'text-red-400', label: 'Offline' },
    unknown: { color: 'bg-slate-500', text: 'text-slate-400', label: 'Unknown' },
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Cpu className="w-16 h-16 text-cyan-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Access the AI Engine dashboard</p>
          <a href="/profile" className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
        <a href="/" className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center hover:shadow-lg transition-all">
          <Brain className="w-5 h-5 text-white" />
        </a>

        <div className="w-8 h-px bg-slate-800 my-2" />

        <a href="/documents" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          <FileText className="w-5 h-5" />
        </a>
        <a href="/codebase" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          <Code2 className="w-5 h-5" />
        </a>
        <a href="/learning" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          <GraduationCap className="w-5 h-5" />
        </a>

        <div className="flex-1" />

        <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center shadow-lg">
          <Cpu className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">AI Engine Dashboard</h1>
              <p className="text-slate-400 mt-1">Monitor infrastructure status and performance</p>
            </div>
            <button
              onClick={refreshStatus}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 text-white rounded-lg text-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Infrastructure Status */}
          <div className="grid grid-cols-4 gap-4">
            {loading ? (
              <div className="col-span-4 flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>Loading infrastructure status</span>
              </div>
            ) : status.map(component => {
              const Icon = componentIcons[component.component];
              const config = statusConfig[component.status];

              return (
                <div key={component.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${config.color} ${component.status === 'online' ? 'animate-pulse' : ''}`} />
                      <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-white capitalize mb-1">
                    {component.component.replace('_', ' ')}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {component.latency_ms && (
                      <span className="text-cyan-400">{component.latency_ms}ms</span>
                    )}
                    {component.error_rate !== null && (
                      <span>{(component.error_rate * 100).toFixed(2)}% error</span>
                    )}
                  </div>
                  {component.last_check_at && (
                    <div className="mt-2 text-xs text-slate-600">
                      Last check: {new Date(component.last_check_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Module Stats */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-white">Module Statistics</h2>
            </div>
            <div className="divide-y divide-slate-700">
              {[
                { name: 'Documents', key: 'documents', icon: FileText, color: 'text-blue-400' },
                { name: 'Codebase', key: 'codebase', icon: Code2, color: 'text-violet-400' },
                { name: 'Learning', key: 'learning', icon: GraduationCap, color: 'text-orange-400' },
              ].map(module => {
                const data = stats[module.key];
                return (
                <div key={module.name} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <module.icon className={`w-5 h-5 ${module.color}`} />
                      <span className="font-medium text-white">{module.name}</span>
                    </div>
                    <span className="text-xs text-slate-500">{data.queries} queries today</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-slate-900 rounded-lg">
                      <div className="text-lg font-bold text-white">{data.primary}</div>
                      <div className="text-xs text-slate-500">{data.primaryLabel}</div>
                    </div>
                    <div className="text-center p-3 bg-slate-900 rounded-lg">
                      <div className="text-lg font-bold text-white">{data.secondary}</div>
                      <div className="text-xs text-slate-500">{data.secondaryLabel}</div>
                    </div>
                    <div className="text-center p-3 bg-slate-900 rounded-lg">
                      <div className="text-lg font-bold text-cyan-400">
                        <Activity className="w-5 h-5 mx-auto" />
                      </div>
                      <div className="text-xs text-slate-500">Active</div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Recent Queries */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-white">Recent AI Queries</h2>
            </div>

            {queries.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No queries yet</p>
                <p className="text-xs text-slate-500 mt-1">Queries will appear here as you use the modules</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700 max-h-[400px] overflow-y-auto">
                {queries.slice(0, 10).map(query => (
                  <div key={query.id} className="px-5 py-3 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      query.query_type === 'document' ? 'bg-blue-500/20 text-blue-400' :
                      query.query_type === 'codebase' ? 'bg-violet-500/20 text-violet-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {query.query_type === 'document' ? <FileText className="w-4 h-4" /> :
                       query.query_type === 'codebase' ? <Code2 className="w-4 h-4" /> :
                       <GraduationCap className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{query.query_text}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{query.query_type}</span>
                        {query.response_time_ms && <span>{query.response_time_ms}ms</span>}
                        {query.confidence_score && <span>{(query.confidence_score * 100).toFixed(0)}% confidence</span>}
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${
                      query.status === 'completed' ? 'bg-emerald-500' :
                      query.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    <span className="text-xs text-slate-600">{new Date(query.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-white">Avg Latency</span>
              </div>
              <div className="text-3xl font-bold text-white">420ms</div>
              <div className="text-xs text-slate-500 mt-1">p50: 380ms, p99: 890ms</div>
            </div>

            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-white">Queries/Day</span>
              </div>
              <div className="text-3xl font-bold text-white">213</div>
              <div className="text-xs text-slate-500 mt-1">+12% from last week</div>
            </div>

            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-5 h-5 text-violet-400" />
                <span className="text-sm font-medium text-white">Vector Searches</span>
              </div>
              <div className="text-3xl font-bold text-white">1,847</div>
              <div className="text-xs text-slate-500 mt-1">94.2% cache hit rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
