
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  FileText,
  Package,
  Code2,
  GraduationCap,
  ArrowRight,
  Cpu,
  Zap,
  Brain,
  Database,
  Activity,
  RefreshCw,
} from 'lucide-react';

const modules = [
  {
    icon: FileText,
    title: 'Documents',
    subtitle: 'AI Document Intelligence',
    description: 'Upload PDFs, DOCX, TXT. Ask questions with citations. Full ingestion pipeline visualization.',
    link: '/documents',
    color: 'from-blue-500 to-blue-600',
    stats: ['RAG with Citations', 'Chunk Visualization', 'Ingestion Pipeline'],
  },
  {
    icon: Package,
    title: 'Products',
    subtitle: 'StockQuery AI',
    description: 'Inventory intelligence with AI agent. Track stock, manage alerts, optimize orders.',
    link: '/products',
    color: 'from-emerald-500 to-emerald-600',
    stats: ['AI Inventory Agent', 'Tool Verification', 'Dashboard KPIs'],
  },
  {
    icon: Code2,
    title: 'Codebase',
    subtitle: 'Code Intelligence',
    description: 'Upload repositories. Symbol search, function analysis, architecture understanding.',
    link: '/codebase',
    color: 'from-violet-500 to-violet-600',
    stats: ['Symbol Search', 'Function Index', 'Architecture Analysis'],
  },
  {
    icon: GraduationCap,
    title: 'Learning',
    subtitle: 'AI Learning Environment',
    description: 'Generate summaries, quizzes, flashcards, interview questions. Track progress.',
    link: '/learning',
    color: 'from-orange-500 to-orange-600',
    stats: ['Auto-Generated Content', 'Spaced Repetition', 'Progress Tracking'],
  },
];

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
              <p className="text-xs text-slate-500">AI Intelligence Platform</p>
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
            <span>AI Intelligence Platform</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-6">
            One Platform.<br />
            <span className="bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
              Multiple AI Modules
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            All Knowledge. AI-Powered Search, Retrieval, Recommendations, and Intelligence.
            Each workspace is its own dedicated AI application.
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
              to="/engine"
              className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium border border-slate-700 transition-colors"
            >
              <Cpu className="w-5 h-5 text-cyan-400" />
              <span>AI Engine</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Module Cards */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Choose Your Workspace</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Each module is a complete product with dedicated AI infrastructure, diagnostics, and tooling.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {modules.map((module) => (
            <Link
              key={module.title}
              to={module.link}
              className="group relative overflow-hidden rounded-2xl bg-slate-800 border border-slate-700 p-8 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="relative z-10">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transition-shadow`}>
                  <module.icon className="w-7 h-7 text-white" />
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold text-white">{module.title}</h3>
                  <span className="text-xs text-slate-500">{module.subtitle}</span>
                </div>

                <p className="text-slate-400 mb-6">{module.description}</p>

                <div className="flex flex-wrap gap-2">
                  {module.stats.map(stat => (
                    <span key={stat} className="px-3 py-1 bg-slate-900 rounded-lg text-xs text-slate-500">
                      {stat}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-2 text-primary-400 font-medium group-hover:gap-3 transition-all">
                  <span>Open Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
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
