import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { AIDiagnosticsPanel, ContextChunksPanel, IngestionStatusBadge } from '../components/AIDiagnosticsPanel';
import type {
  AIQuery,
  AIDiagnostics,
  CollectionDocument,
  ContextChunk,
  Document,
  DocumentCollection,
  DocumentIngestion,
} from '../types';
import {
  Bot,
  CheckCircle,
  Clock,
  Database,
  FileSearch,
  FileText,
  FolderOpen,
  Gauge,
  HardDrive,
  Inbox,
  Layers,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type DocumentView = 'dashboard' | 'documents' | 'collections' | 'recent' | 'citations' | 'settings' | 'details' | 'collection-workspace';
type AIMode = 'all' | 'collection' | 'document';
type SortKey = 'updated' | 'created' | 'name' | 'size';
type StatusFilter = 'all' | DocumentIngestion['status'];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ContextChunk[];
  createdAt: string;
}

interface BackendHealth {
  status: string;
  model: string;
  embedding_model?: string;
  embedding_dimensions?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const ACCEPTED_FILE_TYPES = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
].join(',');

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
};

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export function DocumentsPage() {
  const { user, session } = useAuth();
  const [activeView, setActiveView] = useState<DocumentView>('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [collectionDocuments, setCollectionDocuments] = useState<CollectionDocument[]>([]);
  const [ingestionStatus, setIngestionStatus] = useState<Record<string, DocumentIngestion>>({});
  const [queryLogs, setQueryLogs] = useState<AIQuery[]>([]);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<DocumentCollection | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [aiMode, setAIMode] = useState<AIMode>('all');
  const [modeDocumentId, setModeDocumentId] = useState('');
  const [modeCollectionId, setModeCollectionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AIDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const queryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (user) {
      void fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, activeView]);

  useEffect(() => () => {
    queryAbortRef.current?.abort();
  }, []);

  const documentsById = useMemo(() => new Map(documents.map(doc => [doc.id, doc])), [documents]);

  const collectionStats = useMemo(() => {
    const stats: Record<string, { files: number; chunks: number; embeddings: number; storage: number; updatedAt: string | null }> = {};
    collections.forEach(collection => {
      stats[collection.id] = { files: 0, chunks: 0, embeddings: 0, storage: 0, updatedAt: collection.updated_at };
    });

    collectionDocuments.forEach(link => {
      const doc = documentsById.get(link.document_id);
      const stat = stats[link.collection_id];
      if (!doc || !stat) return;

      const ingestion = ingestionStatus[doc.id];
      stat.files += 1;
      stat.chunks += ingestion?.chunk_count || 0;
      stat.embeddings += ingestion?.embedding_count || 0;
      stat.storage += doc.file_size || 0;
      stat.updatedAt = maxDate(stat.updatedAt, doc.updated_at);
    });

    return stats;
  }, [collections, collectionDocuments, documentsById, ingestionStatus]);

  const documentCollectionName = useMemo(() => {
    const collectionById = new Map(collections.map(collection => [collection.id, collection.name]));
    const names: Record<string, string> = {};
    collectionDocuments.forEach(link => {
      names[link.document_id] = collectionById.get(link.collection_id) || 'Unassigned';
    });
    return names;
  }, [collections, collectionDocuments]);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filtered = documents.filter(doc => {
      const ingestion = ingestionStatus[doc.id];
      const status = ingestion?.status || 'pending';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [
        doc.title,
        doc.description || '',
        doc.file_type,
        documentCollectionName[doc.id] || '',
      ].join(' ').toLowerCase().includes(normalizedSearch);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'size') return (b.file_size || 0) - (a.file_size || 0);
      const left = new Date(sortBy === 'created' ? a.created_at : a.updated_at).getTime();
      const right = new Date(sortBy === 'created' ? b.created_at : b.updated_at).getTime();
      return right - left;
    });
  }, [documents, documentCollectionName, ingestionStatus, searchQuery, sortBy, statusFilter]);

  const latestPipelineDocument = useMemo(() => {
    if (selectedDocument) return selectedDocument;
    const active = documents.find(doc => {
      const status = ingestionStatus[doc.id]?.status;
      return status && status !== 'ready' && status !== 'failed';
    });
    return active || documents[0] || null;
  }, [documents, ingestionStatus, selectedDocument]);

  const readyDocs = Object.values(ingestionStatus).filter(status => status.status === 'ready').length;
  const totalChunks = Object.values(ingestionStatus).reduce((sum, status) => sum + (status.chunk_count || 0), 0);
  const totalEmbeddings = Object.values(ingestionStatus).reduce((sum, status) => sum + (status.embedding_count || 0), 0);
  const storageUsed = documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0);
  const todayQueries = queryLogs.filter(log => isToday(log.created_at)).length;
  const lastCitations = diagnostics?.contextChunks || (queryLogs[0]?.context_chunks as ContextChunk[] | undefined) || [];

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [docsRes, collectionsRes, linksRes, queriesRes, healthRes] = await Promise.all([
        supabase.from('documents').select('*').order('updated_at', { ascending: false }),
        supabase.from('document_collections').select('*').order('updated_at', { ascending: false }),
        supabase.from('collection_documents').select('*'),
        supabase.from('ai_queries').select('*').eq('query_type', 'document').order('created_at', { ascending: false }).limit(25),
        fetch(`${API_BASE_URL}/api/health`).then(res => res.ok ? res.json() : null).catch(() => null),
      ]);

      if (docsRes.error) throw docsRes.error;
      if (collectionsRes.error) throw collectionsRes.error;
      if (linksRes.error) throw linksRes.error;
      if (queriesRes.error) throw queriesRes.error;

      const nextDocuments = docsRes.data || [];
      setDocuments(nextDocuments);
      setCollections(collectionsRes.data || []);
      setCollectionDocuments(linksRes.data || []);
      setQueryLogs(queriesRes.data || []);
      setHealth(healthRes);

      if (nextDocuments.length > 0) {
        const docIds = nextDocuments.map(doc => doc.id);
        const ingestionRes = await supabase
          .from('document_ingestion')
          .select('*')
          .in('document_id', docIds);

        if (ingestionRes.error) throw ingestionRes.error;

        const statusMap: Record<string, DocumentIngestion> = {};
        (ingestionRes.data || []).forEach(status => {
          statusMap[status.document_id] = status;
        });
        setIngestionStatus(statusMap);
      } else {
        setIngestionStatus({});
      }
    } catch (err) {
      console.error('Error loading documents workspace:', err);
      setError('Unable to load the document workspace.');
    } finally {
      setLoading(false);
    }
  };

  const authorizedJsonHeaders = () => {
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const refreshIngestionStatus = async (documentId: string) => {
    const { data, error: statusError } = await supabase
      .from('document_ingestion')
      .select('*')
      .eq('document_id', documentId)
      .limit(1);

    if (statusError) throw statusError;
    const status = (data?.[0] || null) as DocumentIngestion | null;
    if (status) {
      setIngestionStatus(prev => ({ ...prev, [documentId]: status }));
    }
    return status;
  };

  const pollIngestionStatus = async (documentId: string) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await wait(2000);
      const status = await refreshIngestionStatus(documentId);
      if (status && ['ready', 'failed'].includes(status.status)) {
        return status;
      }
    }
    return null;
  };

  const runIngestion = async (doc: Document) => {
    try {
      setIngestionStatus(prev => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] || {}),
          document_id: doc.id,
          status: 'pending',
          chunk_count: prev[doc.id]?.chunk_count || 0,
          embedding_count: prev[doc.id]?.embedding_count || 0,
        } as DocumentIngestion,
      }));

      const response = await fetch(`${API_BASE_URL}/api/documents/ingest`, {
        method: 'POST',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({
          document_id: doc.id,
          title: doc.title,
          file_type: doc.file_type,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        throw new Error(data.message || data.detail || 'Document ingestion failed.');
      }

      await pollIngestionStatus(doc.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document ingestion failed.';
      console.error('Ingestion error:', err);
      setError(message);
      setIngestionStatus(prev => ({
        ...prev,
        [doc.id]: {
          ...prev[doc.id],
          document_id: doc.id,
          status: 'failed',
          error_message: message,
        } as DocumentIngestion,
      }));
    } finally {
      void fetchData();
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!user || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const createdDocuments = await Promise.all(files.map(async file => {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'txt';
        const storagePath = `${user.id}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
        let uploadedPath: string | null = null;

        try {
          const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file);
          if (uploadError) throw uploadError;
          uploadedPath = storagePath;

          const { data: doc, error: insertError } = await supabase
            .from('documents')
            .insert({
              user_id: user.id,
              title: file.name,
              description: `Uploaded on ${new Date().toLocaleDateString()}`,
              file_type: file.type || fileExt,
              file_size: file.size,
              file_url: storagePath,
            })
            .select()
            .single();

          if (insertError) throw insertError;
          return doc as Document;
        } catch (err) {
          if (uploadedPath) {
            await supabase.storage.from('documents').remove([uploadedPath]);
          }
          throw err;
        }
      }));

      setDocuments(prev => [...createdDocuments, ...prev]);
      setShowUpload(false);
      createdDocuments.forEach(doc => void runIngestion(doc));
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload document.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInputUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    void uploadFiles(files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files || []));
  };

  const createCollection = async () => {
    if (!user || !newCollectionName.trim()) return;

    try {
      const { data, error: collectionError } = await supabase
        .from('document_collections')
        .insert({
          user_id: user.id,
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim() || null,
        })
        .select()
        .single();

      if (collectionError) throw collectionError;

      setCollections(prev => [data, ...prev]);
      setNewCollectionName('');
      setNewCollectionDescription('');
    } catch (err) {
      console.error('Create collection error:', err);
      setError('Failed to create collection.');
    }
  };

  const deleteDocument = async (docId: string) => {
    if (!confirm('Delete this document and its indexed chunks?')) return;

    try {
      const doc = documentsById.get(docId);
      if (doc?.file_url) {
        await supabase.storage.from('documents').remove([storagePathFromUrl(doc.file_url)]);
      }

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', docId);
      if (deleteError) throw deleteError;

      setDocuments(prev => prev.filter(doc => doc.id !== docId));
      setSelectedRows(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
        setActiveView('documents');
      }
    } catch (err) {
      console.error('Delete document error:', err);
      setError('Failed to delete document.');
    }
  };

  const deleteSelectedDocuments = async () => {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected document${ids.length === 1 ? '' : 's'}?`)) return;

    for (const id of ids) {
      const doc = documentsById.get(id);
      if (doc?.file_url) {
        await supabase.storage.from('documents').remove([storagePathFromUrl(doc.file_url)]);
      }
      await supabase.from('documents').delete().eq('id', id);
    }

    setSelectedRows(new Set());
    await fetchData();
  };

  const openDocumentWorkspace = (doc: Document) => {
    setSelectedDocument(doc);
    setModeDocumentId(doc.id);
    setAIMode('document');
    setActiveView('details');
    setMessages([]);
    setDiagnostics(null);
  };

  const openCollectionWorkspace = (collection: DocumentCollection) => {
    setSelectedCollection(collection);
    setModeCollectionId(collection.id);
    setAIMode('collection');
    setActiveView('collection-workspace');
    setMessages([]);
    setDiagnostics(null);
  };

  const handleQuerySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || processing || !user) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query.trim(),
      createdAt: new Date().toISOString(),
    };
    const assistantMessageId = crypto.randomUUID();

    setMessages(prev => [...prev, userMessage, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }]);
    setQuery('');
    setProcessing(true);
    setDiagnostics(null);

    const startTime = Date.now();

    try {
      queryAbortRef.current?.abort();
      const controller = new AbortController();
      queryAbortRef.current = controller;
      const response = await fetch(`${API_BASE_URL}/api/documents/query/stream`, {
        method: 'POST',
        headers: authorizedJsonHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          query: userMessage.content,
          scope: {
            mode: aiMode,
            document_id: aiMode === 'document' ? modeDocumentId || selectedDocument?.id : null,
            collection_id: aiMode === 'collection' ? modeCollectionId || selectedCollection?.id : null,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Document query failed.');
      }
      if (!response.body) {
        throw new Error('Document query stream is unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let finalCitations: ContextChunk[] = [];

      const updateAssistantMessage = (content: string, citations?: ContextChunk[]) => {
        setMessages(prev => prev.map(message => (
          message.id === assistantMessageId
            ? { ...message, content, citations: citations ?? message.citations }
            : message
        )));
      };

      const handleStreamEvent = (rawEvent: string) => {
        const lines = rawEvent.split(/\r?\n/);
        const eventName = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
        const dataText = lines
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n');

        if (!dataText) return;
        const payload = JSON.parse(dataText);
        if (eventName === 'context') {
          const nextDiagnostics = payload.diagnostics as AIDiagnostics;
          finalCitations = nextDiagnostics.contextChunks || [];
          setDiagnostics(nextDiagnostics);
          updateAssistantMessage(assistantContent, finalCitations);
        } else if (eventName === 'delta') {
          assistantContent += payload.text || '';
          updateAssistantMessage(assistantContent, finalCitations);
        } else if (eventName === 'done') {
          const nextDiagnostics = payload.diagnostics as AIDiagnostics;
          finalCitations = nextDiagnostics.contextChunks || finalCitations;
          assistantContent = payload.answer || assistantContent;
          setDiagnostics(nextDiagnostics);
          updateAssistantMessage(assistantContent, finalCitations);
        } else if (eventName === 'error') {
          throw new Error(payload.message || 'Document query stream failed.');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        events.forEach(handleStreamEvent);
      }
      if (buffer.trim()) {
        handleStreamEvent(buffer);
      }
      void fetchData();
    } catch (err) {
      console.error('Query error:', err);
      setDiagnostics({
        embeddingGenerated: false,
        embeddingModel: null,
        embeddingDimensions: null,
        embeddingTimeMs: null,
        vectorSearchPerformed: false,
        vectorSearchResults: 0,
        vectorSearchTimeMs: null,
        rerankerUsed: false,
        rerankerTimeMs: null,
        llmPromptTokens: null,
        llmCompletionTokens: null,
        llmTimeMs: null,
        totalTimeMs: Date.now() - startTime,
        contextChunks: [],
        toolCalls: [],
      });
      setMessages(prev => prev.map(message => (
        message.id === assistantMessageId
          ? { ...message, content: 'I could not complete the document query. Check the backend logs and try again.' }
          : message
      )));
    } finally {
      queryAbortRef.current = null;
      setProcessing(false);
    }
  };

  const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge, active: activeView === 'dashboard', onClick: () => setActiveView('dashboard') },
    { id: 'documents', label: 'My Documents', icon: FileText, active: activeView === 'documents' || activeView === 'details', onClick: () => setActiveView('documents'), badge: documents.length },
    { id: 'collections', label: 'Collections', icon: FolderOpen, active: activeView === 'collections' || activeView === 'collection-workspace', onClick: () => setActiveView('collections'), badge: collections.length },
    { id: 'recent', label: 'Recent Queries', icon: Clock, active: activeView === 'recent', onClick: () => setActiveView('recent') },
    { id: 'citations', label: 'Citations', icon: FileSearch, active: activeView === 'citations', onClick: () => setActiveView('citations'), badge: lastCitations.length || undefined },
    { id: 'settings', label: 'Settings', icon: Settings, active: activeView === 'settings', onClick: () => setActiveView('settings') },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Access AI document intelligence</p>
          <a href="/profile" className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium">
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      title="Documents"
      subtitle="AI Document Intelligence"
      icon={FileText}
      accentColor="bg-blue-500"
      sidebarItems={sidebarItems}
    >
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <div>
            <div className="text-sm font-medium text-white">AI Document Workspace</div>
            <div className="text-xs text-slate-500">Ask across all indexed knowledge, a collection, or one file.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <div className="max-w-md truncate rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              {error}
            </div>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>
      </div>

      {renderActiveView()}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Upload documents</h2>
                <p className="mt-1 text-sm text-slate-500">Files start indexing immediately after upload.</p>
              </div>
              <button onClick={() => setShowUpload(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              onDragOver={event => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                isDragging ? 'border-blue-400 bg-blue-500/10' : 'border-slate-700 bg-slate-950'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-400" />
                  <div className="text-sm font-medium text-white">Uploading and starting indexing</div>
                </>
              ) : (
                <>
                  <Upload className="mb-4 h-10 w-10 text-blue-400" />
                  <div className="text-lg font-semibold text-white">Drop files here</div>
                  <p className="mt-2 max-w-md text-sm text-slate-500">
                    PDF, DOCX, TXT, Markdown, and CSV are parsed by the current backend. Multiple files are accepted.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
                  >
                    Select files
                  </button>
                </>
              )}
              <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={handleInputUpload} className="hidden" />
            </div>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );

  function renderActiveView() {
    if (activeView === 'documents') return renderDocumentsTable();
    if (activeView === 'collections') return renderCollections();
    if (activeView === 'recent') return renderRecentQueries();
    if (activeView === 'citations') return renderCitations();
    if (activeView === 'settings') return renderSettings();
    if (activeView === 'details') return renderDocumentDetails();
    if (activeView === 'collection-workspace') return renderCollectionWorkspace();
    return renderDashboard();
  }

  function renderDashboard() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto">
          {renderAIWorkspace({
            title: 'Ask anything from your documents',
            subtitle: 'Search all indexed files unless you switch scope.',
            placeholder: 'Ask anything from your documents...',
          })}

          <section className="border-t border-slate-800 p-5">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Documents', value: documents.length.toLocaleString(), icon: FileText, tone: 'text-blue-400' },
                { label: 'Collections', value: collections.length.toLocaleString(), icon: FolderOpen, tone: 'text-violet-400' },
                { label: 'Chunks', value: totalChunks.toLocaleString(), icon: Layers, tone: 'text-cyan-400' },
                { label: 'Embeddings', value: totalEmbeddings.toLocaleString(), icon: Database, tone: 'text-emerald-400' },
                { label: 'Indexed Files', value: readyDocs.toLocaleString(), icon: CheckCircle, tone: 'text-green-400' },
                { label: 'Storage Used', value: formatBytes(storageUsed), icon: HardDrive, tone: 'text-amber-400' },
                { label: 'Queries Today', value: todayQueries.toLocaleString(), icon: MessageSquare, tone: 'text-pink-400' },
                { label: 'Active AI Model', value: health?.model || 'Unknown', icon: Bot, tone: 'text-blue-300' },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <item.icon className={`h-5 w-5 ${item.tone}`} />
                    <span className="text-xs text-slate-600">{item.label}</span>
                  </div>
                  <div className="truncate text-2xl font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-4">
              {renderRecentDocumentsCard()}
              {renderRecentCollectionsCard()}
              {renderRecentConversationsCard()}
            </div>
          </section>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderAIWorkspace({ title, subtitle, placeholder }: { title: string; subtitle: string; placeholder: string }) {
    return (
      <section className="flex min-h-[520px] flex-col bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={aiMode}
                onChange={event => setAIMode(event.target.value as AIMode)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Documents</option>
                <option value="collection">Collection</option>
                <option value="document">Single Document</option>
              </select>
              {aiMode === 'collection' && (
                <select
                  value={modeCollectionId}
                  onChange={event => setModeCollectionId(event.target.value)}
                  className="max-w-52 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select collection</option>
                  {collections.map(collection => (
                    <option key={collection.id} value={collection.id}>{collection.name}</option>
                  ))}
                </select>
              )}
              {aiMode === 'document' && (
                <select
                  value={modeDocumentId}
                  onChange={event => setModeDocumentId(event.target.value)}
                  className="max-w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select document</option>
                  {documents.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15">
                <Sparkles className="h-7 w-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">Start with a question</h3>
              <p className="mt-2 max-w-xl text-sm text-slate-500">
                Ask for summaries, compare documents, extract decisions, find citations, or query a specific document or collection.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {['Summarize my latest document', 'What decisions are mentioned?', 'Find risks and action items'].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => setQuery(prompt)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 hover:border-blue-500 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map(message => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${
                    message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-200'
                  }`}>
                    <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.citations.slice(0, 4).map((citation, index) => (
                          <span key={citation.id} className="rounded-md bg-slate-950 px-2 py-1 text-xs text-blue-300">
                            [{index + 1}] {citation.source}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {processing && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    Reading indexed context
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleQuerySubmit} className="border-t border-slate-800 bg-slate-950 p-4">
          <div className="mx-auto flex max-w-3xl gap-3">
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              disabled={processing}
              placeholder={placeholder}
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!query.trim() || processing}
              className="rounded-xl bg-blue-500 px-5 py-3 text-white hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderDocumentsTable() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">My Documents</h2>
              <p className="mt-1 text-sm text-slate-500">Manage files, indexing status, citations, and document workspaces.</p>
            </div>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm text-white hover:bg-blue-600">
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="relative min-w-72 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search file name, collection, type..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as SortKey)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="updated">Sort: Updated</option>
              <option value="created">Sort: Created</option>
              <option value="name">Sort: Name</option>
              <option value="size">Sort: Size</option>
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="parsing">Parsing</option>
              <option value="chunking">Chunking</option>
              <option value="embedding">Embedding</option>
              <option value="vectorizing">Vectorizing</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed</option>
            </select>
            <button
              onClick={() => void deleteSelectedDocuments()}
              disabled={selectedRows.size === 0}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:text-slate-600"
            >
              Delete selected
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_120px_90px_110px_70px_90px_110px_110px_92px] border-b border-slate-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span />
              <span>File Name</span>
              <span>Collection</span>
              <span>Status</span>
              <span>Chunks</span>
              <span>Embeddings</span>
              <span>Pages</span>
              <span>Size</span>
              <span>Indexed</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                Loading documents
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="py-14 text-center">
                <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-400">No documents match this view.</p>
              </div>
            ) : (
              filteredDocuments.map(doc => {
                const ingestion = ingestionStatus[doc.id];
                const status = ingestion?.status || 'pending';
                return (
                  <div
                    key={doc.id}
                    className="grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_120px_90px_110px_70px_90px_110px_110px_92px] items-center border-b border-slate-800 px-3 py-3 text-sm last:border-b-0 hover:bg-slate-800/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRows.has(doc.id)}
                      onChange={event => {
                        setSelectedRows(prev => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(doc.id);
                          else next.delete(doc.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                    />
                    <button onClick={() => openDocumentWorkspace(doc)} className="min-w-0 text-left">
                      <div className="truncate font-medium text-slate-100">{doc.title}</div>
                      <div className="truncate text-xs text-slate-500">{fileTypeLabel(doc.file_type)}</div>
                    </button>
                    <span className="truncate text-slate-400">{documentCollectionName[doc.id] || 'Unassigned'}</span>
                    <IngestionStatusBadge status={status} size="sm" />
                    <span className="text-slate-300">{ingestion?.chunk_count || 0}</span>
                    <span className="text-slate-300">{ingestion?.embedding_count || 0}</span>
                    <span className="text-slate-500">{metadataValue(doc, 'pages')}</span>
                    <span className="text-slate-400">{formatBytes(doc.file_size || 0)}</span>
                    <span className="text-slate-400">{ingestion?.completed_at ? shortDate(ingestion.completed_at) : '--'}</span>
                    <span className="text-slate-400">{shortDate(doc.updated_at)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openDocumentWorkspace(doc)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white" title="Ask document">
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <button onClick={() => void deleteDocument(doc.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderDocumentDetails() {
    if (!selectedDocument) return renderDocumentsTable();
    const ingestion = ingestionStatus[selectedDocument.id];
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto">
          <section className="border-b border-slate-800 bg-slate-950 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <button onClick={() => setActiveView('documents')} className="mb-2 text-xs text-slate-500 hover:text-slate-300">Back to documents</button>
                <h2 className="text-xl font-semibold text-white">{selectedDocument.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{documentCollectionName[selectedDocument.id] || 'Unassigned collection'}</p>
              </div>
              <IngestionStatusBadge status={ingestion?.status || 'pending'} />
            </div>
            <div className="mt-4 grid grid-cols-6 gap-3">
              {[
                ['Chunks', ingestion?.chunk_count || 0],
                ['Embeddings', ingestion?.embedding_count || 0],
                ['Vector Store', ingestion?.status === 'ready' ? 'Ready' : 'Pending'],
                ['Indexed Time', ingestion?.completed_at ? shortDate(ingestion.completed_at) : '--'],
                ['Model Used', diagnostics?.embeddingModel || health?.embedding_model || 'Unknown'],
                ['Size', formatBytes(selectedDocument.file_size || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-1 truncate text-sm font-medium text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>
          {renderAIWorkspace({
            title: `Ask about ${selectedDocument.title}`,
            subtitle: 'The AI mode is scoped to this document.',
            placeholder: 'Ask about this document...',
          })}
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderCollections() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Collections</h2>
              <p className="mt-1 text-sm text-slate-500">Collections are separate AI workspaces for grouped documents.</p>
            </div>
            <div className="flex gap-2">
              <input value={newCollectionName} onChange={event => setNewCollectionName(event.target.value)} placeholder="Collection name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500" />
              <input value={newCollectionDescription} onChange={event => setNewCollectionDescription(event.target.value)} placeholder="Description" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500" />
              <button onClick={createCollection} disabled={!newCollectionName.trim()} className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {collections.map(collection => {
              const stats = collectionStats[collection.id] || { files: 0, chunks: 0, embeddings: 0, storage: 0, updatedAt: collection.updated_at };
              return (
                <button key={collection.id} onClick={() => openCollectionWorkspace(collection)} className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left hover:border-blue-500/60">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
                      <FolderOpen className="h-5 w-5 text-violet-400" />
                    </div>
                    <MoreHorizontal className="h-4 w-4 text-slate-600" />
                  </div>
                  <h3 className="truncate text-base font-semibold text-white">{collection.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{collection.description || 'No description'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded bg-slate-950 px-2 py-1 text-slate-400">{stats.files} files</span>
                    <span className="rounded bg-slate-950 px-2 py-1 text-slate-400">{stats.chunks} chunks</span>
                    <span className="rounded bg-slate-950 px-2 py-1 text-slate-400">{stats.embeddings} embeddings</span>
                    <span className="rounded bg-slate-950 px-2 py-1 text-slate-400">{formatBytes(stats.storage)}</span>
                  </div>
                  <div className="mt-4 text-xs text-slate-600">Updated {stats.updatedAt ? shortDate(stats.updatedAt) : '--'}</div>
                </button>
              );
            })}
          </div>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderCollectionWorkspace() {
    if (!selectedCollection) return renderCollections();
    const stats = collectionStats[selectedCollection.id] || { files: 0, chunks: 0, embeddings: 0, storage: 0, updatedAt: selectedCollection.updated_at };
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto">
          <section className="border-b border-slate-800 bg-slate-950 px-5 py-4">
            <button onClick={() => setActiveView('collections')} className="mb-2 text-xs text-slate-500 hover:text-slate-300">Back to collections</button>
            <h2 className="text-xl font-semibold text-white">{selectedCollection.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{selectedCollection.description || 'Collection AI workspace'}</p>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {[
                ['Files', stats.files],
                ['Chunks', stats.chunks],
                ['Embeddings', stats.embeddings],
                ['Storage', formatBytes(stats.storage)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-1 text-sm font-medium text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>
          {renderAIWorkspace({
            title: `Ask ${selectedCollection.name}`,
            subtitle: 'The AI mode is scoped to this collection.',
            placeholder: 'Ask about this collection...',
          })}
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderRecentQueries() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto p-5">
          <h2 className="text-xl font-semibold text-white">Recent AI Conversations</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            {queryLogs.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-500">No document conversations yet.</div>
            ) : queryLogs.map(log => (
              <div key={log.id} className="border-b border-slate-800 p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{log.query_text}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span>{shortDate(log.created_at)}</span>
                      {log.response_time_ms && <span>{log.response_time_ms}ms</span>}
                      {log.confidence_score && <span>{(log.confidence_score * 100).toFixed(0)}% confidence</span>}
                    </div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${log.status === 'completed' ? 'bg-emerald-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                </div>
              </div>
            ))}
          </div>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderCitations() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto p-5">
          <h2 className="text-xl font-semibold text-white">Citations</h2>
          <p className="mt-1 text-sm text-slate-500">Citations from the latest AI answer or recent query logs.</p>
          <div className="mt-4">
            {lastCitations.length > 0 ? (
              <ContextChunksPanel chunks={lastCitations} maxVisible={20} />
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900 py-14 text-center text-sm text-slate-500">
                Ask a document question to generate citations.
              </div>
            )}
          </div>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <main className="overflow-y-auto p-5">
          <h2 className="text-xl font-semibold text-white">Document AI Settings</h2>
          <div className="mt-5 grid max-w-4xl grid-cols-2 gap-4">
            {[
              ['LLM Provider', 'Google Gemini'],
              ['Active Model', health?.model || 'Unknown'],
              ['Embedding Model', health?.embedding_model || diagnostics?.embeddingModel || 'Unknown'],
              ['Vector Store', 'Supabase pgvector'],
              ['Chunking', 'tiktoken overlapping chunks'],
              ['Supported Parsers', 'PDF, DOCX, TXT, Markdown, CSV'],
              ['Backend', API_BASE_URL],
              ['Status', health?.status || 'Unknown'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-2 text-sm font-medium text-white">{value}</div>
              </div>
            ))}
          </div>
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderPipelinePanel() {
    const ingestion = latestPipelineDocument ? ingestionStatus[latestPipelineDocument.id] : null;
    const ingestionSteps = pipelineStepsForStatus(ingestion?.status, uploading);
    const querySteps = [
      { label: 'Searching', done: Boolean(diagnostics?.vectorSearchPerformed), active: processing },
      { label: 'Vector Retrieval', done: Boolean(diagnostics?.vectorSearchPerformed), active: processing },
      { label: 'Reranking', done: Boolean(diagnostics?.rerankerUsed), active: processing && Boolean(diagnostics?.vectorSearchPerformed) },
      { label: 'Generating Answer', done: Boolean(diagnostics?.llmTimeMs), active: processing },
      { label: 'Completed', done: Boolean(diagnostics) && !processing, active: false },
    ];

    return (
      <aside className="overflow-y-auto border-l border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-400" />
          <h3 className="font-semibold text-white">AI Pipeline</h3>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Indexing</div>
          <div className="space-y-3">
            {ingestionSteps.map(step => (
              <PipelineRow key={step.label} {...step} />
            ))}
          </div>
          {latestPipelineDocument && (
            <div className="mt-4 truncate text-xs text-slate-500">{latestPipelineDocument.title}</div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Answering</div>
          <div className="space-y-3">
            {querySteps.map(step => (
              <PipelineRow key={step.label} {...step} />
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <AIDiagnosticsPanel diagnostics={diagnostics} isProcessing={processing} />
          {diagnostics?.contextChunks && diagnostics.contextChunks.length > 0 && (
            <ContextChunksPanel chunks={diagnostics.contextChunks} />
          )}
        </div>
      </aside>
    );
  }

  function renderRecentDocumentsCard() {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Recent Documents</h3>
        <div className="space-y-2">
          {documents.slice(0, 5).map(doc => (
            <button key={doc.id} onClick={() => openDocumentWorkspace(doc)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-800">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{doc.title}</span>
            </button>
          ))}
          {documents.length === 0 && <p className="text-sm text-slate-500">No documents yet</p>}
        </div>
      </div>
    );
  }

  function renderRecentCollectionsCard() {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Recent Collections</h3>
        <div className="space-y-2">
          {collections.slice(0, 5).map(collection => (
            <button key={collection.id} onClick={() => openCollectionWorkspace(collection)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-800">
              <FolderOpen className="h-4 w-4 text-violet-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{collection.name}</span>
            </button>
          ))}
          {collections.length === 0 && <p className="text-sm text-slate-500">No collections yet</p>}
        </div>
      </div>
    );
  }

  function renderRecentConversationsCard() {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Recent AI Conversations</h3>
        <div className="space-y-2">
          {queryLogs.slice(0, 5).map(log => (
            <div key={log.id} className="rounded-lg px-2 py-2">
              <div className="truncate text-sm text-slate-300">{log.query_text}</div>
              <div className="mt-1 text-xs text-slate-600">{shortDate(log.created_at)}</div>
            </div>
          ))}
          {queryLogs.length === 0 && <p className="text-sm text-slate-500">No conversations yet</p>}
        </div>
      </div>
    );
  }
}

function PipelineRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
        done ? 'bg-emerald-500/20 text-emerald-400' : active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-600'
      }`}>
        {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      </div>
      <span className={`text-sm ${done ? 'text-slate-200' : active ? 'text-blue-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

function pipelineStepsForStatus(status: DocumentIngestion['status'] | undefined, uploading: boolean) {
  const order = ['pending', 'parsing', 'chunking', 'embedding', 'vectorizing', 'ready'] as const;
  const currentIndex = status ? order.indexOf(status as typeof order[number]) : -1;
  const failed = status === 'failed';

  return [
    { label: 'Uploading', done: Boolean(status) && !uploading, active: uploading },
    { label: 'Reading File', done: currentIndex > 1 || status === 'ready', active: status === 'parsing' },
    { label: 'Extracting Text', done: currentIndex > 1 || status === 'ready', active: status === 'parsing' },
    { label: 'Cleaning', done: currentIndex > 2 || status === 'ready', active: status === 'chunking' },
    { label: 'Semantic Chunking', done: currentIndex > 2 || status === 'ready', active: status === 'chunking' },
    { label: 'Generating Embeddings', done: currentIndex > 4 || status === 'ready', active: status === 'embedding' },
    { label: 'Saving Vector Database', done: status === 'ready', active: status === 'vectorizing' },
    { label: failed ? 'Index Failed' : 'Index Complete', done: status === 'ready', active: false },
  ];
}

function fileTypeLabel(fileType: string) {
  return FILE_TYPE_LABELS[fileType] || fileType.split('/').pop()?.toUpperCase() || fileType;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function maxDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() > new Date(right).getTime() ? left : right;
}

function storagePathFromUrl(fileUrl: string) {
  if (!fileUrl.startsWith('http')) return fileUrl;
  const marker = '/documents/';
  const index = fileUrl.indexOf(marker);
  return index >= 0 ? fileUrl.slice(index + marker.length) : fileUrl.split('/').slice(-2).join('/');
}

function metadataValue(doc: Document, key: string) {
  const value = (doc as Document & { metadata?: Record<string, unknown> }).metadata?.[key];
  return typeof value === 'string' || typeof value === 'number' ? value : '--';
}
