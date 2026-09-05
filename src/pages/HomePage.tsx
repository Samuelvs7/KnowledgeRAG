
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  FileText,
  Code2,
  GraduationCap,
  ArrowRight,
  Cpu,
  Zap,
  Brain,
  Database,
  Activity,
  RefreshCw,
  Bot,
} from 'lucide-react';

const knowledgeModules = [
  {
    icon: FileText,
    title: 'Document Intelligence',
    subtitle: 'Documents',
    description: 'Chat with documents, search your knowledge base, and get citation-backed answers.',
    link: '/documents',
    color: 'from-blue-500 to-blue-600',
    stats: ['RAG with Citations', 'Chunk Visualization', 'Ingestion Pipeline'],
    action: 'Open Documents',
  },
  {
    icon: Code2,
    title: 'GitHub Intelligence',
    subtitle: 'GitHub',
    description: 'Understand repositories, search code, and interact with your codebase using AI.',
    link: '/codebase',
    color: 'from-violet-500 to-violet-600',
    stats: ['Symbol Search', 'Function Index', 'Architecture Analysis'],
    action: 'Open GitHub',
  },
  {
    icon: GraduationCap,
    title: 'Learning Platform',
    subtitle: 'Learning',
    description: 'Turn knowledge into guided learning experiences, explanations, and assessments.',
    link: '/learning',
    color: 'from-orange-500 to-orange-600',
    stats: ['Auto-Generated Content', 'Spaced Repetition', 'Progress Tracking'],
    action: 'Start Learning',
  },
];

const agentModule = {
  icon: Bot,
  title: 'StockQuery AI',
  subtitle: 'Tool-Using AI Agent',
  description: 'An AI agent that understands your questions, selects the right tools, queries data, and explains the results.',
  link: '/products',
  color: 'from-emerald-500 to-emerald-600',
  stats: ['Tool-Using AI Agent', 'Intent Router', 'Inventory Intelligence'],
  action: 'Open StockQuery',
  badge: 'AI AGENT',
};

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">KnowledgeRAG</h1>
              <p className="text-xs text-slate-500">AI Knowledge & Agent Platform</p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {user && (
              <Link to="/engine" className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-sm transition-colors">
                <Cpu className="w-4 h-4" />
                <span>AI Engine</span>
              </Link>
            )}
            <Link
              to={user ? '/profile' : '/profile'}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {user ? 'Profile' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-cyan-500/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full text-sm text-slate-300 mb-8">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>AI Knowledge & Agent Platform</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-6">
            One Platform.<br />
            <span className="bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
              Knowledge & AI Agents
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Search, understand, and learn from connected knowledge, or deploy tool-using AI agents that reason over structured data.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              to="/documents"
              className="flex items-center gap-2 px-8 py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/products"
              className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium shadow-lg transition-all"
            >
              <Bot className="w-5 h-5 text-white" />
              <span>Open StockQuery AI</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Knowledge Workspace Section */}
      <section className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-800">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              KNOWLEDGE
            </span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Knowledge Workspace</h2>
          <p className="text-slate-400">
            Search, understand, explore, and learn from your connected knowledge.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {knowledgeModules.map((module) => (
            <Link
              key={module.title}
              to={module.link}
              className="group relative overflow-hidden rounded-2xl bg-slate-800/80 border border-slate-700 p-6 hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
            >
              <div className="relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-5 shadow-lg group-hover:shadow-xl transition-shadow`}>
                  <module.icon className="w-6 h-6 text-white" />
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-white">{module.title}</h3>
                  <span className="text-xs text-slate-500">({module.subtitle})</span>
                </div>

                <p className="text-slate-400 text-sm mb-6">{module.description}</p>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {module.stats.map(stat => (
                    <span key={stat} className="px-2.5 py-1 bg-slate-900 rounded-lg text-xs text-slate-500 border border-slate-800">
                      {stat}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700/50 flex items-center gap-2 text-primary-400 font-medium text-sm group-hover:gap-3 transition-all">
                <span>{module.action}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Agent Workspace Section */}
      <section className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-800">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              AI AGENTS
            </span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Agent Workspace</h2>
          <p className="text-slate-400">
            AI agents that reason, use tools, and interact with structured data.
          </p>
        </div>

        <div className="bg-slate-800/90 rounded-2xl border border-emerald-500/30 p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Bot className="w-64 h-64 text-emerald-400" />
          </div>

          <div className="relative z-10 grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Bot className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-white">{agentModule.title}</h3>
                    <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded">
                      {agentModule.badge}
                    </span>
                  </div>
                  <p className="text-sm text-emerald-400/90 font-medium">{agentModule.subtitle}</p>
                </div>
              </div>

              <p className="text-slate-300 text-base mb-6 max-w-xl">
                {agentModule.description}
              </p>

              {/* Reasoning Flow Diagram */}
              <div className="bg-slate-900/80 border border-slate-700/70 rounded-xl p-4 mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Agent Execution Pipeline</p>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700 font-medium">User Question</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 font-medium">AI Agent</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700 font-medium">Tool Selection</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700 font-medium">Data / API</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700 font-medium">AI Reasoning</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 font-medium">Answer</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Link
                  to={agentModule.link}
                  className="flex items-center gap-2 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium shadow-lg hover:shadow-emerald-500/25 transition-all"
                >
                  <span>{agentModule.action}</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            <div className="md:col-span-5 bg-slate-900/90 rounded-xl border border-slate-700 p-5 space-y-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Agent Capabilities
              </h4>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 text-slate-300">
                  <span className="text-emerald-400 font-medium">Intent Classifier:</span> Smart routing bypasses RAG for greetings & direct query tools
                </div>
                <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 text-slate-300">
                  <span className="text-emerald-400 font-medium">Inventory Intelligence:</span> Autonomous stock check, reorder estimation & low-stock alerts
                </div>
                <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 text-slate-300">
                  <span className="text-emerald-400 font-medium">Verified Outputs:</span> Cross-checks database records with tool calling for high precision
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Infrastructure */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Shared AI Infrastructure</h2>
              <p className="text-slate-400">All modules share the same powerful AI engine</p>
            </div>
            <Link to="/engine" className="ml-auto px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-sm">
              View Dashboard
            </Link>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { icon: Brain, label: 'Embedding Model', desc: 'text-embedding-3-small', status: '768-dim vectors' },
              { icon: Database, label: 'Vector Database', desc: 'pgvector on Supabase', status: 'IVFFlat index' },
              { icon: RefreshCw, label: 'Reranker', desc: 'Context refinement', status: 'AI-powered' },
              { icon: Activity, label: 'LLM', desc: 'Response generation', status: 'Prompt tracking' },
            ].map((item) => (
              <div key={item.label} className="p-4 bg-slate-900 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <item.icon className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm font-medium text-white">{item.label}</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">{item.desc}</p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-400">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Flow */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Transparent AI Pipeline</h2>
          <p className="text-slate-400">Every step is visible and trackable</p>
        </div>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { label: 'User Query', icon: Zap },
            { label: 'Embedding', icon: Brain },
            { label: 'Vector Search', icon: Database },
            { label: 'Reranking', icon: RefreshCw },
            { label: 'LLM Response', icon: Cpu },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                <step.icon className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-slate-300">{step.label}</span>
              </div>
              {i < 4 && <ArrowRight className="w-4 h-4 text-slate-600" />}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            All AI operations include diagnostics: token counts, latency metrics, context chunks, and confidence scores.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary-500" />
            <span>KnowledgeRAG</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Built with Supabase + pgvector</span>
            <span className="w-1 h-1 bg-slate-700 rounded-full" />
            <span>React + TypeScript</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
