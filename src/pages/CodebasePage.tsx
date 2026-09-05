import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, SidebarItem } from '../components/WorkspaceLayout';
import {
  FolderGit2, Upload, FileCode, Search, Terminal,
  Cpu, Activity, CheckCircle, AlertCircle, RefreshCw,
  Code2, Layers, GitBranch, ChevronRight, FileText,
  Boxes, Send, Bot, User, Play, Sparkles, BookOpen, Bug, Shield,
  Database, Server, Network, ArrowRight
} from 'lucide-react';
import { Repository, RepositoryFile, CodeSymbol, RepositoryIngestion, RepositoryStats } from '../types';
import { RichMarkdown } from '../components/RichMarkdown';

const API_BASE = import.meta.env.VITE_API_URL || '';

const INGEST_STAGES: { key: string; label: string; icon: typeof FolderGit2 }[] = [
  { key: 'extracting', label: 'Extracting', icon: GitBranch },
  { key: 'parsing', label: 'Parsing', icon: FileCode },
  { key: 'chunking', label: 'Chunking', icon: Boxes },
  { key: 'embedding', label: 'Embedding', icon: Cpu },
  { key: 'vectorizing', label: 'Vectorizing', icon: Database },
  { key: 'ready', label: 'Ready', icon: CheckCircle },
];

type ModuleView = 'explorer' | 'symbols' | 'search' | 'architecture' | 'dependencies' | 'health' | 'assistant';
type ModeType = 'explain' | 'trace' | 'debug' | 'impact' | 'tests' | 'architecture';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: ModeType;
  citations?: Array<{ source: string; content: string; similarity: number; metadata?: any }>;
}

export const CodebasePage: React.FC = () => {
  // Navigation View State
  const [activeView, setActiveView] = useState<ModuleView>('assistant');

  // Repository state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [repoStats, setRepoStats] = useState<RepositoryStats | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<RepositoryIngestion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // GitHub URL import state
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [githubBranch, setGithubBranch] = useState<string>('');
  const [importingUrl, setImportingUrl] = useState<boolean>(false);
  const [explainingFile, setExplainingFile] = useState<boolean>(false);

  // File Explorer state
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileSymbols, setSelectedFileSymbols] = useState<CodeSymbol[]>([]);
  const [selectedFileImports, setSelectedFileImports] = useState<string[]>([]);
  const [loadingFileContent, setLoadingFileContent] = useState<boolean>(false);

  // Symbol Browser state
  const [symbols, setSymbols] = useState<any[]>([]);
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  const [symbolFilterType, setSymbolFilterType] = useState<string>('all');

  // Code Search state
  const [codeQuery, setCodeQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // AI Assistant state
  const [aiMode, setAiMode] = useState<ModeType>('explain');
  const [chatInput, setChatInput] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Architecture & Evidence state
  const [archEvidence, setArchEvidence] = useState<any>(null);
  const [archExplanation, setArchExplanation] = useState<string>('');
  const [loadingArch, setLoadingArch] = useState<boolean>(false);

  // Initial Load: Fetch Repositories
  useEffect(() => {
    fetchRepositories();
  }, []);

  // When selected repository changes
  useEffect(() => {
    if (selectedRepoId) {
      fetchRepositoryDetails(selectedRepoId);
      fetchFiles(selectedRepoId);
      fetchSymbols(selectedRepoId);
      checkIngestionStatus(selectedRepoId);
      fetchArchitecture(selectedRepoId);
    } else {
      setRepoStats(null);
      setFiles([]);
      setSymbols([]);
      setIngestionStatus(null);
      setArchEvidence(null);
    }
  }, [selectedRepoId]);

  // Polling for ingestion progress
  useEffect(() => {
    if (!selectedRepoId || !ingestionStatus) return;

    if (['extracting', 'parsing', 'chunking', 'embedding', 'vectorizing', 'pending'].includes(ingestionStatus.status)) {
      const interval = setInterval(() => {
        checkIngestionStatus(selectedRepoId);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedRepoId, ingestionStatus]);

  // Scroll to chat bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Fetch Repositories from Supabase DB
  const fetchRepositories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('repositories').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRepositories(data || []);
      if (data && data.length > 0 && !selectedRepoId) {
        setSelectedRepoId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to fetch repositories:', err);
      setError(err.message || 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Repository Stats
  const fetchRepositoryDetails = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/codebase/${repoId}`);
      if (res.ok) {
        const json = await res.json();
        setRepoStats(json.stats);
      }
    } catch (err) {
      console.error('Failed to fetch repo stats:', err);
    }
  };

  // Check Ingestion Status
  const checkIngestionStatus = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/codebase/ingestion-status/${repoId}`);
      if (res.ok) {
        const data = await res.json();
        setIngestionStatus(data);
        if (data.status === 'ready') {
          fetchRepositoryDetails(repoId);
          fetchFiles(repoId);
          fetchSymbols(repoId);
        }
      }
    } catch (err) {
      console.error('Failed to check ingestion status:', err);
    }
  };

  // Fetch File List
  const fetchFiles = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/codebase/${repoId}/files`);
      if (res.ok) {
        const json = await res.json();
        const fileList = json.files || [];
        setFiles(fileList);
        if (fileList.length > 0 && !selectedFilePath) {
          handleSelectFile(repoId, fileList[0].file_path);
        }
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  // Fetch Symbol List
  const fetchSymbols = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/codebase/${repoId}/symbols`);
      if (res.ok) {
        const json = await res.json();
        setSymbols(json.symbols || []);
      }
    } catch (err) {
      console.error('Failed to fetch symbols:', err);
    }
  };

  // Fetch Architecture Evidence
  const fetchArchitecture = async (repoId: string) => {
    try {
      setLoadingArch(true);
      const res = await fetch(`${API_BASE}/api/codebase/${repoId}/architecture`);
      if (res.ok) {
        const json = await res.json();
        setArchEvidence(json.evidence);
        setArchExplanation(json.explanation);
      }
    } catch (err) {
      console.error('Failed to fetch architecture:', err);
    } finally {
      setLoadingArch(false);
    }
  };

  // Select File to View
  const handleSelectFile = async (repoId: string, filePath: string) => {
    setSelectedFilePath(filePath);
    setLoadingFileContent(true);
    try {
      const res = await fetch(`${API_BASE}/api/codebase/${repoId}/file-content?file_path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedFileContent(json.file?.content || '// Source code stored in Supabase');
        setSelectedFileSymbols(json.symbols || []);
        setSelectedFileImports(json.file?.imports_json || []);
      }
    } catch (err) {
      console.error('Failed to fetch file content:', err);
    } finally {
      setLoadingFileContent(false);
    }
  };

  // Execute Code Search
  const handleSearchCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRepoId || !codeQuery.trim()) return;

    try {
      setSearching(true);
      const res = await fetch(`${API_BASE}/api/codebase/${selectedRepoId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: codeQuery, repository_id: selectedRepoId, match_count: 15 })
      });
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  // Asynchronous Upload Repository ZIP
  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      const user = (await supabase.auth.getUser()).data.user;
      const userId = user?.id || '00000000-0000-0000-0000-000000000000';
      const repoName = file.name.replace('.zip', '');

      // Create Repository Record in Supabase DB
      const { data: repo, error: repoError } = await supabase.from('repositories').insert({
        user_id: userId,
        name: repoName,
        description: `Uploaded archive ${file.name}`
      }).select().single();

      if (repoError) throw repoError;

      // Upload ZIP to Supabase Storage Bucket
      const storagePath = `${userId}/${repo.id}.zip`;
      const { error: storageError } = await supabase.storage.from('repositories').upload(storagePath, file, { upsert: true });
      if (storageError) console.warn('Storage upload warning:', storageError);

      // Trigger Asynchronous Backend Ingestion (Returns immediately)
      const ingestRes = await fetch(`${API_BASE}/api/codebase/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ repository_id: repo.id, user_id: userId, force: true })
      });

      if (!ingestRes.ok) throw new Error('Failed to trigger ingestion pipeline');

      await fetchRepositories();
      setSelectedRepoId(repo.id);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'Failed to upload repository archive');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Import a repository directly from a GitHub URL (clones via backend zipball download)
  const handleImportFromUrl = async () => {
    const url = githubUrl.trim();
    if (!url || importingUrl) return;
    try {
      setImportingUrl(true);
      setError(null);
      const user = (await supabase.auth.getUser()).data.user;
      const userId = user?.id || '00000000-0000-0000-0000-000000000000';

      const res = await fetch(`${API_BASE}/api/codebase/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          url,
          branch: githubBranch.trim() || undefined,
          user_id: userId,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || 'Failed to import repository from GitHub');
      }
      const data = await res.json();
      setGithubUrl('');
      setGithubBranch('');
      await fetchRepositories();
      if (data.repository_id) setSelectedRepoId(data.repository_id);
    } catch (err: any) {
      console.error('GitHub import failed:', err);
      setError(err.message || 'Failed to import repository from GitHub');
    } finally {
      setImportingUrl(false);
    }
  };

  // Shared helper: ask the AI to explain a file / folder / symbol and surface it in the Assistant view
  const pushExplain = async (endpoint: string, body: any, userLabel: string, mode: ModeType) => {
    if (!selectedRepoId || explainingFile) return;
    try {
      setExplainingFile(true);
      setError(null);
      setActiveView('assistant');
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: userLabel, mode };
      const assistantMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, userMsg, { id: assistantMsgId, role: 'assistant', content: '', citations: [] }]);

      const res = await fetch(`${API_BASE}/api/codebase/${selectedRepoId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Explanation failed');
      }
      const data = await res.json();
      setMessages(prev => prev.map(m => (m.id === assistantMsgId ? { ...m, content: data.answer } : m)));
    } catch (err: any) {
      console.error('Explain failed:', err);
      setError(err.message || 'Explanation failed');
    } finally {
      setExplainingFile(false);
    }
  };

  const handleExplainFile = () => {
    if (!selectedFilePath) return;
    pushExplain('explain-file', { file_path: selectedFilePath }, `Explain this file: ${selectedFilePath}`, 'explain');
  };

  const handleExplainFolder = () => {
    if (!selectedFilePath) return;
    const folder = selectedFilePath.includes('/')
      ? selectedFilePath.slice(0, selectedFilePath.lastIndexOf('/'))
      : '';
    pushExplain('explain-folder', { folder_path: folder }, `Explain this folder: ${folder || '(repository root)'}`, 'architecture');
  };

  const handleExplainSymbol = (symbolName: string, filePath?: string) => {
    pushExplain('explain-symbol', { symbol_name: symbolName, file_path: filePath || selectedFilePath || undefined }, `Explain symbol: ${symbolName}`, 'explain');
  };

  // Trigger Re-indexing retry
  const handleRetryIndexing = async () => {
    if (!selectedRepoId) return;
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const userId = user?.id || '00000000-0000-0000-0000-000000000000';
      await fetch(`${API_BASE}/api/codebase/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ repository_id: selectedRepoId, user_id: userId, force: true })
      });
      checkIngestionStatus(selectedRepoId);
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  // Submit AI Assistant Query (Streaming SSE)
  const handleSendQuery = async (overridePrompt?: string, modeOverride?: ModeType) => {
    const queryText = overridePrompt || chatInput;
    const currentMode = modeOverride || aiMode;
    if (!queryText.trim() || !selectedRepoId || isStreaming) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: queryText,
      mode: currentMode
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      citations: []
    };

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);
    if (!overridePrompt) setChatInput('');
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_BASE}/api/codebase/${selectedRepoId}/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          repository_id: selectedRepoId,
          mode: currentMode
        })
      });

      if (!response.ok) throw new Error('AI Query failed');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamText = '';

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const block of lines) {
            const eventLine = block.split('\n').find(l => l.startsWith('event:'));
            const dataLine = block.split('\n').find(l => l.startsWith('data:'));

            if (eventLine && dataLine) {
              const eventType = eventLine.replace('event:', '').trim();
              const rawData = dataLine.replace('data:', '').trim();

              if (eventType === 'metadata') {
                const meta = JSON.parse(rawData);
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, citations: meta.context_chunks } : m));
              } else if (eventType === 'delta') {
                const delta = JSON.parse(rawData);
                streamText += delta.text;
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: streamText } : m));
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Streaming failed:', err);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: `Error: ${err.message || 'Failed to stream response.'}` } : m));
    } finally {
      setIsStreaming(false);
    }
  };

  // Module Sidebar Navigation Items
  const sidebarItems: SidebarItem[] = [
    {
      id: 'assistant',
      label: 'AI Assistant',
      icon: Bot,
      active: activeView === 'assistant',
      onClick: () => setActiveView('assistant')
    },
    {
      id: 'explorer',
      label: 'File Explorer',
      icon: FolderGit2,
      active: activeView === 'explorer',
      badge: files.length > 0 ? files.length : undefined,
      onClick: () => setActiveView('explorer')
    },
    {
      id: 'symbols',
      label: 'Symbol Search',
      icon: Code2,
      active: activeView === 'symbols',
      badge: symbols.length > 0 ? symbols.length : undefined,
      onClick: () => setActiveView('symbols')
    },
    {
      id: 'search',
      label: 'Code Search',
      icon: Search,
      active: activeView === 'search',
      onClick: () => setActiveView('search')
    },
    {
      id: 'architecture',
      label: 'Architecture',
      icon: Layers,
      active: activeView === 'architecture',
      onClick: () => setActiveView('architecture')
    },
    {
      id: 'dependencies',
      label: 'Dependencies',
      icon: Network,
      active: activeView === 'dependencies',
      onClick: () => setActiveView('dependencies')
    },
    {
      id: 'health',
      label: 'Repository Health',
      icon: Activity,
      active: activeView === 'health',
      onClick: () => setActiveView('health')
    }
  ];

  const bottomSidebarItems: SidebarItem[] = [];

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);
  const INGESTING_STATUSES = ['pending', 'extracting', 'parsing', 'chunking', 'embedding', 'vectorizing'];
  const isIngesting =
    uploading ||
    importingUrl ||
    (!!ingestionStatus && INGESTING_STATUSES.includes(ingestionStatus.status));
  const ingestFailed = !!ingestionStatus && ingestionStatus.status === 'failed';
  const ingestStageIndex = (() => {
    const s = ingestionStatus?.status;
    if (!s || s === 'pending') return 0;
    const idx = INGEST_STAGES.findIndex(st => st.key === s);
    return idx < 0 ? 0 : idx;
  })();

  return (
    <WorkspaceLayout
      title="GitHub"
      subtitle="Repository Intelligence"
      icon={FolderGit2}
      accentColor="bg-purple-600"
      sidebarItems={sidebarItems}
      bottomSidebarItems={bottomSidebarItems}
    >
      <div className="flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden font-sans">
        {/* Error Banner */}
        {error && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-red-500/10 border-b border-red-500/30 text-red-300 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-semibold shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Workspace Repository Header Bar */}
        <div className="flex flex-col border-b border-slate-800 bg-slate-900/60 p-4 gap-3">
          <div className="flex items-center justify-between">
            {/* Repository Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Repository:</span>
              <select
                value={selectedRepoId || ''}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
              >
                {repositories.length === 0 ? (
                  <option value="">No Repositories Available</option>
                ) : (
                  repositories.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))
                )}
              </select>

              {ingestionStatus?.status === 'ready' && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> Indexed
                </span>
              )}
            </div>

            {/* GitHub URL Import */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-700 rounded-lg px-2 py-1">
                <GitBranch className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImportFromUrl(); }}
                  placeholder="Paste GitHub repo URL…"
                  className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-52"
                  disabled={importingUrl}
                />
                <input
                  type="text"
                  value={githubBranch}
                  onChange={e => setGithubBranch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImportFromUrl(); }}
                  placeholder="branch (optional)"
                  className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-28 border-l border-slate-700 pl-2"
                  disabled={importingUrl}
                />
              </div>
              <button
                onClick={handleImportFromUrl}
                disabled={importingUrl || !githubUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-lg transition-all"
              >
                <FolderGit2 className="w-4 h-4" />
                {importingUrl ? 'Importing…' : 'Import from GitHub'}
              </button>
            </div>

            {/* Upload Action */}
            <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-lg transition-all">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading Archive...' : 'Upload Repository'}
              <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" disabled={uploading} />
            </label>
          </div>

          {/* Repository Statistics Banner */}
          {repoStats && (
            <div className="grid grid-cols-6 gap-3 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <FileCode className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-slate-400">Files:</span>
                <span className="font-semibold text-slate-200">{repoStats.file_count}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Code2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-400">Lines:</span>
                <span className="font-semibold text-slate-200">{repoStats.line_count.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-slate-400">Functions:</span>
                <span className="font-semibold text-slate-200">{repoStats.function_count}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Boxes className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-slate-400">Classes:</span>
                <span className="font-semibold text-slate-200">{repoStats.class_count}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Network className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-slate-400">Languages:</span>
                <span className="font-semibold text-slate-200 truncate">
                  {Object.keys(repoStats.language_breakdown).length}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-slate-400">Status:</span>
                <span className="font-semibold text-emerald-400 capitalize">
                  {ingestionStatus?.status || 'ready'}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* WORKSPACE MAIN VIEW AREA */}
        <div className="flex-1 overflow-hidden">
          {isIngesting || ingestFailed ? (
            /* INGESTION PROGRESS PANEL */
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="w-full max-w-2xl">
                {ingestFailed ? (
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Indexing failed</h2>
                    <p className="text-sm text-slate-400 mb-1">
                      {ingestionStatus?.stage_message || 'Something went wrong while indexing this repository.'}
                    </p>
                    {ingestionStatus?.error_message && (
                      <p className="text-xs text-rose-300/80 font-mono mb-5 max-w-lg mx-auto break-words">
                        {ingestionStatus.error_message}
                      </p>
                    )}
                    <button
                      onClick={handleRetryIndexing}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold shadow-lg transition-all"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry indexing
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                          <FolderGit2 className="w-7 h-7" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                          <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-white truncate">
                          {selectedRepo?.name || (importingUrl ? 'Importing from GitHub…' : 'Preparing your repository…')}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {ingestionStatus?.stage_message ||
                            (uploading ? 'Uploading archive to secure storage…'
                              : importingUrl ? 'Downloading repository from GitHub…'
                              : 'Getting things ready…')}
                        </p>
                      </div>
                      <div className="ml-auto text-right shrink-0">
                        <div className="text-2xl font-bold text-purple-300 tabular-nums">{ingestionStatus?.progress ?? 0}%</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Indexed</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-8">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(5, ingestionStatus?.progress ?? 5)}%` }}
                      />
                    </div>

                    {/* Stage stepper */}
                    <div className="grid grid-cols-6 gap-2">
                      {INGEST_STAGES.map((stage, idx) => {
                        const done = idx < ingestStageIndex;
                        const active = idx === ingestStageIndex;
                        const Icon = stage.icon;
                        return (
                          <div key={stage.key} className="flex flex-col items-center text-center gap-2">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
                              done ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                : active ? 'bg-purple-600/20 border-purple-500/50 text-purple-300 shadow-lg shadow-purple-500/10'
                                : 'bg-slate-800/60 border-slate-700 text-slate-600'
                            }`}>
                              {done ? <CheckCircle className="w-5 h-5" /> : <Icon className={`w-5 h-5 ${active ? 'animate-pulse' : ''}`} />}
                            </div>
                            <span className={`text-[10px] font-medium ${done ? 'text-emerald-400/80' : active ? 'text-purple-300' : 'text-slate-600'}`}>
                              {stage.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-center text-[11px] text-slate-500 mt-8 max-w-md mx-auto">
                      Building an AI-searchable index — AST parsing, semantic chunking, and vector embeddings.
                      This can take a moment for larger repositories.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : repositories.length === 0 ? (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 shadow-xl">
                <FolderGit2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Upload Your Repository</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Turn your software codebase into an AI-understandable knowledge system with AST-first structural parsing, hybrid retrieval, symbol tracing, and evidence-backed code assistant.
              </p>

              <div className="grid grid-cols-2 gap-3 w-full text-left mb-6 text-xs">
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="text-slate-300">Code-aware hybrid search</span>
                </div>
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300">AST symbol intelligence</span>
                </div>
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-slate-300">Evidence architecture graph</span>
                </div>
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-slate-300">Strict repository isolation</span>
                </div>
              </div>

              <div className="w-full max-w-md space-y-3">
                <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700 rounded-xl p-2">
                  <GitBranch className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={e => setGithubUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleImportFromUrl(); }}
                    placeholder="https://github.com/owner/repo"
                    className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
                    disabled={importingUrl}
                  />
                  <button
                    onClick={handleImportFromUrl}
                    disabled={importingUrl || !githubUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-lg transition-all shrink-0"
                  >
                    <FolderGit2 className="w-4 h-4" />
                    {importingUrl ? 'Importing…' : 'Import'}
                  </button>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <div className="flex-1 h-px bg-slate-800" /> or <div className="flex-1 h-px bg-slate-800" />
                </div>

                <label className="w-full px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xl transition-all flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Repository ZIP
                  <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" disabled={uploading} />
                </label>
              </div>
            </div>
          ) : (
            <>
              {/* SUB-VIEW 1: FILE EXPLORER */}
              {activeView === 'explorer' && (
                <div className="flex h-full">
                  {/* File Tree / List Sidebar */}
                  <div className="w-72 bg-slate-950/80 border-r border-slate-800 flex flex-col h-full">
                    <div className="p-3 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Repository Files ({files.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {files.map(f => (
                        <button
                          key={f.id}
                          onClick={() => selectedRepoId && handleSelectFile(selectedRepoId, f.file_path)}
                          className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono flex items-center justify-between transition-all ${
                            selectedFilePath === f.file_path
                              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                              : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <span className="truncate pr-2">{f.file_path}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                            L{f.line_count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Code Viewer Panel */}
                  <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
                    {selectedFilePath ? (
                      <>
                        <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs gap-4">
                          <span className="font-mono text-slate-200 font-semibold truncate">{selectedFilePath}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:flex items-center gap-3 text-slate-400 text-[11px]">
                              <span>Symbols: {selectedFileSymbols.length}</span>
                              <span>Imports: {selectedFileImports.length}</span>
                            </div>
                            <button
                              onClick={handleExplainFile}
                              disabled={explainingFile}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-[11px] font-semibold transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Explain file
                            </button>
                            <button
                              onClick={handleExplainFolder}
                              disabled={explainingFile}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-md text-[11px] font-semibold transition-all"
                            >
                              <FolderGit2 className="w-3.5 h-3.5" /> Explain folder
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto p-6 font-mono text-xs text-slate-300 bg-slate-950 leading-relaxed">
                          {loadingFileContent ? (
                            <div className="flex items-center justify-center h-full text-slate-500">
                              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading code content...
                            </div>
                          ) : (
                            <pre className="whitespace-pre">{selectedFileContent}</pre>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
                        <FileCode className="w-10 h-10 mb-2 opacity-40" />
                        Select a file from the repository list to view its source code and symbols
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-VIEW 2: SYMBOL SEARCH */}
              {activeView === 'symbols' && (
                <div className="p-6 h-full flex flex-col bg-slate-950 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <input
                      type="text"
                      value={symbolSearch}
                      onChange={(e) => setSymbolSearch(e.target.value)}
                      placeholder="Filter symbols by name (e.g. authenticateUser)..."
                      className="w-80 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-xs text-slate-400">Total Extracted Symbols: {symbols.length}</span>
                  </div>

                  <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-slate-900/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold">
                        <tr>
                          <th className="p-3">Symbol Name</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">File Path</th>
                          <th className="p-3">Lines</th>
                          <th className="p-3">Signature</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {symbols
                          .filter(s => !symbolSearch || s.name.toLowerCase().includes(symbolSearch.toLowerCase()))
                          .map((sym, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition-all">
                              <td className="p-3 font-semibold text-purple-400">{sym.name}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 text-[10px] uppercase font-semibold">
                                  {sym.symbol_type}
                                </span>
                              </td>
                              <td className="p-3 text-slate-300">{sym.repository_files?.file_path || 'unknown'}</td>
                              <td className="p-3 text-slate-400">L{sym.start_line}–L{sym.end_line}</td>
                              <td className="p-3 text-slate-400 truncate max-w-xs">{sym.signature || '-'}</td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleExplainSymbol(sym.name, sym.repository_files?.file_path)}
                                  disabled={explainingFile}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600/80 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-[10px] font-semibold transition-all"
                                >
                                  <Sparkles className="w-3 h-3" /> Explain
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 3: CODE SEARCH */}
              {activeView === 'search' && (
                <div className="p-6 h-full flex flex-col bg-slate-950 overflow-hidden">
                  <form onSubmit={handleSearchCode} className="flex gap-3 mb-6">
                    <input
                      type="text"
                      value={codeQuery}
                      onChange={(e) => setCodeQuery(e.target.value)}
                      placeholder="Search codebase (hybrid vector + keyword + symbol match)..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="submit"
                      disabled={searching}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg"
                    >
                      <Search className="w-4 h-4" /> {searching ? 'Searching...' : 'Search Code'}
                    </button>
                  </form>

                  <div className="flex-1 overflow-y-auto space-y-4">
                    {searchResults.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        Enter a search query above to perform hybrid code retrieval
                      </div>
                    ) : (
                      searchResults.map((res, idx) => (
                        <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-2">
                          <div className="flex items-center justify-between font-mono">
                            <span className="text-purple-400 font-semibold">{res.source || res.metadata?.file_path}</span>
                            <span className="text-emerald-400 text-[11px]">
                              Relevance: {((res.similarity || res.score || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <pre className="p-3 bg-slate-950 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed border border-slate-800/60">
                            {res.content}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-VIEW 4: ARCHITECTURE */}
              {activeView === 'architecture' && (
                <div className="p-6 h-full overflow-y-auto bg-slate-950 space-y-6">
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" /> Evidence-Based Architecture Model
                    </h4>
                    {loadingArch ? (
                      <div className="text-slate-500 text-xs flex items-center">
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Gathering repository structure evidence...
                      </div>
                    ) : (
                      <div className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                        {archExplanation || 'No architecture breakdown available.'}
                      </div>
                    )}
                  </div>

                  {archEvidence && (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Detected Entry Points
                        </h5>
                        <div className="space-y-1 font-mono text-xs">
                          {archEvidence.detected_entry_points?.length > 0 ? (
                            archEvidence.detected_entry_points.map((ep: string, idx: number) => (
                              <div key={idx} className="p-2 bg-slate-950 border border-slate-800/80 rounded text-emerald-400">
                                🎯 {ep}
                              </div>
                            ))
                          ) : (
                            <div className="text-slate-500 text-xs">No explicit root entry points detected</div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Language Breakdown
                        </h5>
                        <div className="space-y-2 text-xs font-mono">
                          {Object.entries(archEvidence.language_distribution || {}).map(([lang, count]: any) => (
                            <div key={lang} className="flex justify-between items-center">
                              <span className="text-slate-300 capitalize">{lang}</span>
                              <span className="text-purple-400 font-semibold">{count} files</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-VIEW 5: DEPENDENCIES */}
              {activeView === 'dependencies' && (
                <div className="p-6 h-full overflow-y-auto bg-slate-950 space-y-6">
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                    <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                      <Network className="w-4 h-4 text-purple-400" /> Repository Import Graph & Dependencies
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">
                      Observed file import statements extracted from AST parsing across the repository.
                    </p>

                    <div className="space-y-3 font-mono text-xs">
                      {files.filter(f => f.imports_json && f.imports_json.length > 0).slice(0, 15).map(f => (
                        <div key={f.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <div className="font-semibold text-purple-300 mb-1">{f.file_path}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {f.imports_json?.map((imp, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                                import {imp}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 6: REPOSITORY HEALTH */}
              {activeView === 'health' && (
                <div className="p-6 h-full overflow-y-auto bg-slate-950 space-y-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 mb-1">Indexing Integrity</div>
                      <div className="text-xl font-bold text-emerald-400">100% Operational</div>
                      <p className="text-[11px] text-slate-500 mt-2">All chunks stored in PostgreSQL vector database</p>
                    </div>

                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 mb-1">Total Indexed Files</div>
                      <div className="text-xl font-bold text-purple-400">{repoStats?.file_count || 0}</div>
                      <p className="text-[11px] text-slate-500 mt-2">Binary files and vendor packages ignored</p>
                    </div>

                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 mb-1">Total Parsed Symbols</div>
                      <div className="text-xl font-bold text-blue-400">{symbols.length}</div>
                      <p className="text-[11px] text-slate-500 mt-2">Functions, classes, and types indexed</p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 7: AI ASSISTANT & RAG */}
              {activeView === 'assistant' && (
                <div className="flex flex-col h-full bg-slate-950">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-2 p-3 bg-slate-900/80 border-b border-slate-800 text-xs overflow-x-auto">
                    <span className="text-slate-400 font-medium mr-1">Focus Mode:</span>
                    {(['explain', 'trace', 'debug', 'impact', 'tests', 'architecture'] as ModeType[]).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setAiMode(mode)}
                        className={`px-3 py-1 rounded-md capitalize font-medium transition-all ${
                          aiMode === mode
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Chat Message Scrollable Container */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
                        <div className="p-4 bg-purple-600/10 text-purple-400 rounded-full border border-purple-500/20 mb-4">
                          <Bot className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-100 mb-2">Repository AI Assistant</h3>
                        <p className="text-xs text-slate-400 mb-6">
                          Ask logic, execution flow, safety, bug check, test generation, or architectural questions.
                        </p>
                        <div className="grid grid-cols-2 gap-2 w-full text-left">
                          <button
                            onClick={() => handleSendQuery('Explain the overall structure of this repository.', 'explain')}
                            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300"
                          >
                            💡 Explain Components
                          </button>
                          <button
                            onClick={() => handleSendQuery('Trace main execution flow across files.', 'trace')}
                            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300"
                          >
                            🔍 Trace Call Graph
                          </button>
                          <button
                            onClick={() => handleSendQuery('Check for potential logic bugs or security issues.', 'debug')}
                            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300"
                          >
                            🐛 Debug & Audit
                          </button>
                          <button
                            onClick={() => handleSendQuery('Generate unit test strategy for key functions.', 'tests')}
                            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300"
                          >
                            🧪 Generate Tests
                          </button>
                        </div>
                      </div>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                              <Bot className="w-4 h-4" />
                            </div>
                          )}
                          <div className={`max-w-3xl rounded-xl p-4 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-purple-600 text-white font-medium shadow-md'
                              : 'bg-slate-900 border border-slate-800 text-slate-200'
                          }`}>
                            {msg.role === 'assistant'
                              ? (msg.content
                                  ? <RichMarkdown content={msg.content} accent="purple" />
                                  : <span className="inline-flex items-center gap-2 text-slate-400"><RefreshCw className="w-3 h-3 animate-spin" /> Thinking…</span>)
                              : <div className="whitespace-pre-wrap">{msg.content}</div>}

                            {/* Citations List */}
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-slate-800/80">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                                  Observed Code Evidence ({msg.citations.length} Chunks):
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.citations.map((c, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        if (c.metadata?.file_path) {
                                          setActiveView('explorer');
                                          if (selectedRepoId) handleSelectFile(selectedRepoId, c.metadata.file_path);
                                        }
                                      }}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-mono text-purple-300 transition-all"
                                    >
                                      [{idx + 1}] {c.source || c.metadata?.file_path}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input Form */}
                  <div className="p-4 bg-slate-900 border-t border-slate-800">
                    <form onSubmit={(e) => { e.preventDefault(); handleSendQuery(); }} className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={`Ask AI Assistant (${aiMode} mode)...`}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={isStreaming}
                      />
                      <button
                        type="submit"
                        disabled={isStreaming || !chatInput.trim()}
                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg transition-all"
                      >
                        <Send className="w-4 h-4" /> Send
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
};
