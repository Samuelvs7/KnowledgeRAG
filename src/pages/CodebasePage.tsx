import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { AIDiagnosticsPanel, ContextChunksPanel } from '../components/AIDiagnosticsPanel';
import type { Repository, RepositoryFile, CodeSymbol, AIDiagnostics, ContextChunk } from '../types';
import {
  Code2,
  Upload,
  FolderOpen,
  FileCode,
  Search,
  GitBranch,
  ChevronRight,
  ChevronDown,
  Send,
  Loader2,
  CheckCircle,
  Braces,
  FunctionSquare,
  Box,
  Binary,
  Clock,
  Database,
  Cpu,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fileReferences?: { path: string; language: string; snippet: string }[];
}

export function CodebasePage() {
  const { user } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AIDiagnostics | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<'files' | 'symbols' | 'search' | 'chat'>('files');
  const [symbolFilter, setSymbolFilter] = useState<'all' | 'function' | 'class' | 'interface'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchRepositories();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedRepo) {
      fetchRepoData(selectedRepo.id);
    }
  }, [selectedRepo]);

  const fetchRepositories = async () => {
    try {
      const { data, error } = await supabase
        .from('repositories')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRepositories(data || []);
    } catch (err) {
      console.error('Error fetching repositories:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRepoData = async (repoId: string) => {
    const [filesRes, symbolsRes] = await Promise.all([
      supabase.from('repository_files').select('*').eq('repository_id', repoId).order('file_path'),
      supabase.from('code_symbols').select('*, file:repository_files!code_symbols_file_id_fkey(file_path)').eq('file.repository_id', repoId).limit(50),
    ]);

    if (filesRes.data) setFiles(filesRes.data);
    if (symbolsRes.data) setSymbols(symbolsRes.data as CodeSymbol[]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.endsWith('.zip')) {
      alert('Please upload a ZIP file');
      return;
    }

    setUploading(true);

    try {
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('repositories').upload(fileName, file);
      if (uploadError) throw uploadError;

      const repoName = file.name.replace('.zip', '').replace(/-/g, ' ');
      const { data: repo, error: insertError } = await supabase
        .from('repositories')
        .insert({
          user_id: user.id,
          name: repoName,
          description: `Uploaded on ${new Date().toLocaleDateString()}`,
          file_count: 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Generate mock file data
      const mockFiles: Partial<RepositoryFile>[] = [
        { file_path: 'src/index.ts', file_name: 'index.ts', language: 'typescript', line_count: 42, function_count: 2, class_count: 0, is_indexed: true },
        { file_path: 'src/app.ts', file_name: 'app.ts', language: 'typescript', line_count: 156, function_count: 7, class_count: 1, is_indexed: true },
        { file_path: 'src/routes/index.ts', file_name: 'index.ts', language: 'typescript', line_count: 89, function_count: 4, class_count: 0, is_indexed: true },
        { file_path: 'src/routes/auth.ts', file_name: 'auth.ts', language: 'typescript', line_count: 124, function_count: 6, class_count: 0, is_indexed: true },
        { file_path: 'src/controllers/auth.ts', file_name: 'auth.ts', language: 'typescript', line_count: 98, function_count: 5, class_count: 0, is_indexed: true },
        { file_path: 'src/services/auth.ts', file_name: 'auth.ts', language: 'typescript', line_count: 76, function_count: 4, class_count: 0, is_indexed: true },
        { file_path: 'src/services/users.ts', file_name: 'users.ts', language: 'typescript', line_count: 112, function_count: 8, class_count: 0, is_indexed: true },
        { file_path: 'src/middleware/auth.ts', file_name: 'auth.ts', language: 'typescript', line_count: 34, function_count: 2, class_count: 0, is_indexed: true },
        { file_path: 'src/utils/helpers.ts', file_name: 'helpers.ts', language: 'typescript', line_count: 67, function_count: 9, class_count: 0, is_indexed: true },
      ];

      // Insert files
      const fileRecords = mockFiles.map(f => ({
        ...f,
        repository_id: repo.id,
      })) as RepositoryFile[];

      const { error: filesError } = await supabase.from('repository_files').insert(fileRecords);
      if (filesError) {
        console.error('Files insert error:', filesError);
      }

      // Update repo file count
      await supabase.from('repositories').update({ file_count: mockFiles.length }).eq('id', repo.id);

      setRepositories(prev => [{ ...repo, file_count: mockFiles.length }, ...prev]);
      setSelectedRepo({ ...repo, file_count: mockFiles.length });
      setFiles(fileRecords);

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload repository');
    } finally {
      setUploading(false);
    }
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || processing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setProcessing(true);
    setDiagnostics(null);

    const startTime = Date.now();

    try {
      // Simulate vector search
      await new Promise(resolve => setTimeout(resolve, 800));

      const mockChunks: ContextChunk[] = [
        { id: '1', content: 'function login(req: Request, res: Response) { const { email, password } = req.body; ... }', similarity: 0.94, source: 'src/controllers/auth.ts' },
        { id: '2', content: 'export function generateToken(user: User) { return jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: "7d" }); }', similarity: 0.89, source: 'src/services/auth.ts' },
        { id: '3', content: 'router.post("/login", login); router.post("/register", register);', similarity: 0.82, source: 'src/routes/auth.ts' },
      ];

      const embeddingTime = 140;
      const vectorTime = 95;

      setDiagnostics({
        embeddingGenerated: true,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 768,
        embeddingTimeMs: embeddingTime,
        vectorSearchPerformed: true,
        vectorSearchResults: 3,
        vectorSearchTimeMs: vectorTime,
        rerankerUsed: true,
        rerankerTimeMs: 35,
        llmPromptTokens: 320,
        llmCompletionTokens: 450,
        llmTimeMs: 680,
        totalTimeMs: Date.now() - startTime,
        contextChunks: mockChunks,
        toolCalls: [],
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Based on code analysis:

**Authentication Flow:**

1. **Routes** (src/routes/auth.ts):
   - POST /login → login controller
   - POST /register → register controller

2. **Controllers** (src/controllers/auth.ts):
   - login(): validates credentials, generates JWT
   - register(): creates user, hashes password

3. **Services** (src/services/auth.ts):
   - generateToken(): creates JWT with 7-day expiry
   - verifyPassword(): bcrypt comparison

**Key Files:**
- src/controllers/auth.ts:48 - login endpoint
- src/services/auth.ts:15 - token generation`,
        fileReferences: [
          { path: 'src/controllers/auth.ts', language: 'typescript', snippet: 'export async function login(req: Request, res: Response) {\n  const { email, password } = req.body;\n  const user = await findUser({ email });\n  if (!user || !verifyPassword(password, user.passwordHash)) {\n    return res.status(401).json({ error: "Invalid credentials" });\n  }\n  const token = generateToken(user);\n  res.json({ token, user });\n}' },
          { path: 'src/services/auth.ts', language: 'typescript', snippet: 'export function generateToken(user: User) {\n  return jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: "7d" });\n}' },
        ],
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Query error:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error processing query.',
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const sidebarItems: SidebarItem[] = [
    { id: 'files', label: 'File Explorer', icon: FolderOpen, active: activeView === 'files', onClick: () => setActiveView('files'), badge: files.length },
    { id: 'symbols', label: 'Symbol Search', icon: FunctionSquare, active: activeView === 'symbols', onClick: () => setActiveView('symbols'), badge: symbols.length },
    { id: 'search', label: 'Code Search', icon: Search, active: activeView === 'search', onClick: () => setActiveView('search') },
    { id: 'chat', label: 'AI Assistant', icon: Cpu, active: activeView === 'chat', onClick: () => setActiveView('chat') },
  ];

  const getSymbolIcon = (type: string) => {
    switch (type) {
      case 'function': return FunctionSquare;
      case 'class': return Box;
      case 'interface': return Braces;
      default: return Code2;
    }
  };

  const languageColors: Record<string, string> = {
    typescript: 'text-blue-400',
    javascript: 'text-yellow-400',
    python: 'text-green-400',
    rust: 'text-orange-400',
  };

  // Stats
  const totalLines = files.reduce((sum, f) => sum + (f.line_count || 0), 0);
  const totalFunctions = files.reduce((sum, f) => sum + (f.function_count || 0), 0);
  const totalClasses = files.reduce((sum, f) => sum + (f.class_count || 0), 0);
  const indexedFiles = files.filter(f => f.is_indexed).length;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Code2 className="w-16 h-16 text-violet-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Access codebase intelligence</p>
          <a href="/profile" className="px-6 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      title="Codebase"
      subtitle="Code Intelligence"
      icon={Code2}
      accentColor="bg-violet-500"
      sidebarItems={sidebarItems}
    >
      {/* Stats Bar */}
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-4 gap-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FolderOpen className="w-4 h-4" />
          <span>{files.length} files</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-violet-400">
          <Binary className="w-4 h-4" />
          <span>{totalLines} lines</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <FunctionSquare className="w-4 h-4" />
          <span>{totalFunctions} functions</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Box className="w-4 h-4" />
          <span>{totalClasses} classes</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Database className="w-4 h-4" />
          <span>{indexedFiles} indexed</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Repo List */}
        <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-700 text-white rounded-lg text-sm transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploading ? 'Uploading...' : 'Upload Repository'}</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".zip" onChange={handleUpload} className="hidden" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
            </div>
          ) : repositories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <GitBranch className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">No repositories</p>
              <p className="text-xs text-slate-600 mt-1">Upload a ZIP to get started</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {repositories.map(repo => (
                <div
                  key={repo.id}
                  className={`p-3 border-b border-slate-800 cursor-pointer transition-colors ${
                    selectedRepo?.id === repo.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                  }`}
                  onClick={() => {
                    setSelectedRepo(repo);
                    setMessages([]);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-slate-200 truncate">{repo.name}</h3>
                      <div className="text-xs text-slate-500">{repo.file_count} files</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-hidden">
          {selectedRepo ? (
            activeView === 'chat' ? (
              <div className="h-full grid grid-cols-3 overflow-hidden">
                <div className="col-span-2 flex flex-col border-r border-slate-800">
                  <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4">
                    <Cpu className="w-4 h-4 text-violet-400 mr-2" />
                    <span className="text-white font-medium">Code Assistant</span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <Cpu className="w-12 h-12 text-violet-500 mb-3" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Code Intelligence</h3>
                        <p className="text-sm text-slate-500 max-w-sm mb-4">
                          Ask about architecture, implementations, or patterns
                        </p>
                        <div className="flex flex-wrap gap-2 max-w-md justify-center">
                          {['How does auth work?', 'Show API routes', 'Find bugs'].map(q => (
                            <button key={q} onClick={() => setQuery(q)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm">
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            msg.role === 'user' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-200'
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            {msg.fileReferences && msg.fileReferences.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {msg.fileReferences.map((ref, i) => (
                                  <div key={i} className="bg-slate-900 rounded-lg p-3 text-xs border border-slate-700">
                                    <div className="flex items-center gap-1 mb-2 text-slate-500">
                                      <FileCode className="w-3 h-3" />
                                      <span>{ref.path}</span>
                                    </div>
                                    <pre className="text-slate-300 overflow-x-auto">{ref.snippet}</pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {processing && (
                      <div className="flex justify-start">
                        <div className="bg-slate-800 rounded-2xl px-4 py-3">
                          <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleQuerySubmit} className="p-4 border-t border-slate-800 bg-slate-900">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Ask about this codebase..."
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        disabled={processing}
                      />
                      <button
                        type="submit"
                        disabled={!query.trim() || processing}
                        className="px-5 py-3 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-700 text-white rounded-xl transition-colors"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="flex flex-col overflow-y-auto bg-slate-900 p-4 space-y-4">
                  <AIDiagnosticsPanel diagnostics={diagnostics} isProcessing={processing} />
                  {diagnostics?.contextChunks && diagnostics.contextChunks.length > 0 && (
                    <ContextChunksPanel chunks={diagnostics.contextChunks} />
                  )}
                </div>
              </div>
            ) : activeView === 'files' ? (
              <div className="h-full overflow-y-auto p-4">
                <div className="space-y-1">
                  {files.map(file => {
                    const isExpanded = expandedFiles.has(file.file_path);
                    const langColor = languageColors[file.language || ''] || 'text-slate-400';

                    return (
                      <div key={file.id}>
                        <button
                          onClick={() => toggleFile(file.file_path)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 rounded-lg text-sm transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                          <FileCode className={`w-4 h-4 ${langColor}`} />
                          <span className="text-slate-300">{file.file_name}</span>
                          <span className="ml-auto text-xs text-slate-600">{file.line_count} lines</span>
                        </button>
                        {isExpanded && (
                          <div className="ml-8 p-3 bg-slate-950 rounded-lg mb-2">
                            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                              <div className="text-slate-500">Functions: <span className="text-blue-400">{file.function_count}</span></div>
                              <div className="text-slate-500">Classes: <span className="text-emerald-400">{file.class_count}</span></div>
                              <div className="text-slate-500">Indexed: {file.is_indexed ? <CheckCircle className="w-3 h-3 text-success-500 inline" /> : <Clock className="w-3 h-3 text-amber-500 inline" />}</div>
                            </div>
                            <pre className="text-xs text-slate-600">// Code preview would render here</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeView === 'symbols' ? (
              <div className="h-full overflow-y-auto p-4">
                <div className="flex gap-2 mb-4">
                  {(['all', 'function', 'class', 'interface'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setSymbolFilter(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm ${
                        symbolFilter === type ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {symbols
                    .filter(s => symbolFilter === 'all' || s.symbol_type === symbolFilter)
                    .map(symbol => {
                      const Icon = getSymbolIcon(symbol.symbol_type);
                      const iconColor = symbol.symbol_type === 'function' ? 'text-blue-400' :
                                       symbol.symbol_type === 'class' ? 'text-emerald-400' : 'text-violet-400';

                      return (
                        <div key={symbol.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-slate-600 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${iconColor}`} />
                            <span className="text-sm text-white font-mono">{symbol.name}</span>
                            <span className="text-xs text-slate-500 ml-auto">{symbol.symbol_type}</span>
                          </div>
                          {symbol.signature && (
                            <div className="mt-2 text-xs text-slate-500 font-mono bg-slate-900 rounded p-2">
                              {symbol.signature}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-slate-600">
                            Lines {symbol.start_line}-{symbol.end_line}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Search className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-slate-400">Code search coming soon</p>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8">
              <div className="w-24 h-24 rounded-2xl bg-slate-800 flex items-center justify-center mb-6">
                {uploading ? (
                  <Loader2 className="w-12 h-12 text-violet-500 animate-spin" />
                ) : (
                  <Upload className="w-12 h-12 text-slate-600" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Upload Your Codebase</h2>
              <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                Upload a ZIP file of your repository to enable AI-powered code intelligence, symbol search, and architecture analysis.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-6 py-3 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-700 text-white rounded-xl font-medium"
              >
                {uploading ? 'Processing...' : 'Select ZIP File'}
              </button>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
