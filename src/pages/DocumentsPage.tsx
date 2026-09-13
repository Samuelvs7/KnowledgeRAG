import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { AIDiagnosticsPanel, ContextChunksPanel, IngestionStatusBadge } from '../components/AIDiagnosticsPanel';
import type {
  AIQuery,
  AIDiagnostics,
  AISession,
  AIMessage,
  CollectionDocument,
  ContextChunk,
  Document,
  DocumentCollection,
  DocumentIngestion,
} from '../types';
import { WorkspaceOverviewDrawer } from '../components/WorkspaceOverviewDrawer';
import { ChatHistorySidebar } from '../components/chat/ChatHistorySidebar';
import { checkOllamaAvailable, listOllamaModels, ollamaInstallMessage, streamOllamaChat, type OllamaModel } from '../lib/ollama';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Cpu,
  FileSearch,
  FileText,
  FolderOpen,
  Gauge,
  Inbox,
  Loader2,
  MessageSquare,
  MessageSquareText,
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
const SESSIONS_STORAGE_KEY = 'knowledgerag_current_session';
const PINNED_STORAGE_KEY = 'knowledgerag_pinned_sessions';
const LOCAL_OLLAMA_ENABLED_KEY = 'knowledgerag_local_ollama_enabled';
const LOCAL_OLLAMA_MODEL_KEY = 'knowledgerag_local_ollama_model';

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
  const [savedDocTitle, setSavedDocTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showOverviewDrawer, setShowOverviewDrawer] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AIDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // === Chat History State ===
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => localStorage.getItem(SESSIONS_STORAGE_KEY)
  );
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(PINNED_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // === Local Ollama State ===
  const [useLocalOllama, setUseLocalOllama] = useState(
    () => localStorage.getItem(LOCAL_OLLAMA_ENABLED_KEY) === 'true'
  );
  const [ollamaModel, setOllamaModel] = useState(
    () => localStorage.getItem(LOCAL_OLLAMA_MODEL_KEY) || ''
  );
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'checking' | 'available' | 'unavailable'>('unknown');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const queryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem(LOCAL_OLLAMA_ENABLED_KEY, String(useLocalOllama));
  }, [useLocalOllama]);

  useEffect(() => {
    if (ollamaModel) localStorage.setItem(LOCAL_OLLAMA_MODEL_KEY, ollamaModel);
  }, [ollamaModel]);

  const refreshOllamaStatus = async () => {
    setOllamaStatus('checking');
    const available = await checkOllamaAvailable();
    if (!available) {
      setOllamaStatus('unavailable');
      setOllamaModels([]);
      return;
    }
    setOllamaStatus('available');
    const models = await listOllamaModels();
    setOllamaModels(models);
    if (!ollamaModel && models.length > 0) {
      setOllamaModel(models[0].name);
    }
  };

  useEffect(() => {
    if (useLocalOllama) void refreshOllamaStatus();
  }, [useLocalOllama]);

  useEffect(() => {
    if (user) {
      void fetchData();
      void fetchSessions();
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

  // Persist currentSessionId to localStorage
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem(SESSIONS_STORAGE_KEY, currentSessionId);
    } else {
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
    }
  }, [currentSessionId]);

  // Persist pinned IDs to localStorage
  useEffect(() => {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);

  // Restore last conversation on mount
  useEffect(() => {
    if (!user || !session?.access_token) return;
    const savedSessionId = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (savedSessionId && messages.length === 0 && !processing) {
      void restoreSession(savedSessionId);
    }
  }, [user, session?.access_token]);

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

  const fetchSessions = async () => {
    if (!session?.access_token) return;
    setSessionsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions?module_type=document_rag&limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const applySessionScope = (sess: AISession, docsList = documents, colsList = collections) => {
    const meta = (sess.metadata || {}) as Record<string, unknown>;
    const rawType = sess.scope_type || (meta.scope_type as string) || 'all';
    const docId = (sess.scope_document_id || (meta.scope_document_id as string) || '') as string;
    const colId = (sess.scope_collection_id || (meta.scope_collection_id as string) || '') as string;
    const docTitle = (sess.scope_document_title || (meta.scope_document_title as string) || '') as string;

    setSavedDocTitle(docTitle);

    if (rawType === 'single_document' || rawType === 'document') {
      setAIMode('document');
      setModeDocumentId(docId);
      const docMatch = docsList.find(d => d.id === docId);
      setSelectedDocument(docMatch || null);
      setSelectedCollection(null);
      setModeCollectionId('');
    } else if (rawType === 'collection') {
      setAIMode('collection');
      setModeCollectionId(colId);
      const colMatch = colsList.find(c => c.id === colId);
      setSelectedCollection(colMatch || null);
      setSelectedDocument(null);
      setModeDocumentId('');
    } else {
      setAIMode('all');
      setModeDocumentId('');
      setModeCollectionId('');
      setSelectedDocument(null);
      setSelectedCollection(null);
    }
  };

  const restoreSession = async (sessionId: string) => {
    if (!session?.access_token) return;
    try {
      const [sessRes, msgsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages?limit=100`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (!sessRes.ok || !msgsRes.ok) {
        localStorage.removeItem(SESSIONS_STORAGE_KEY);
        return;
      }

      const sessionData: AISession = await sessRes.json();
      const msgsData = await msgsRes.json();
      const restoredMessages: Message[] = (msgsData.messages || []).map((msg: AIMessage) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        citations: (msg.citations_json as unknown) as ContextChunk[] | undefined,
        createdAt: msg.created_at,
      }));

      if (restoredMessages.length > 0) {
        setMessages(restoredMessages);
        setCurrentSessionId(sessionId);
        applySessionScope(sessionData);
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setDiagnostics(null);
    setQuery('');
    setAIMode('all');
    setModeDocumentId('');
    setModeCollectionId('');
    setSelectedDocument(null);
    setSelectedCollection(null);
    setSavedDocTitle('');
    setActiveView('dashboard');
    localStorage.removeItem(SESSIONS_STORAGE_KEY);
    // Focus input after render
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('form input[type="text"], form input:not([type])');
      input?.focus();
    }, 100);
  };

  const resumeSession = async (sessionToResume: AISession) => {
    if (!session?.access_token) return;
    setMessages([]);
    setDiagnostics(null);
    setCurrentSessionId(sessionToResume.id);
    localStorage.setItem(SESSIONS_STORAGE_KEY, sessionToResume.id);
    setActiveView('dashboard');

    applySessionScope(sessionToResume);

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionToResume.id}/messages?limit=100`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      const loadedMessages: Message[] = (data.messages || []).map((msg: AIMessage) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        citations: (msg.citations_json as unknown) as ContextChunk[] | undefined,
        createdAt: msg.created_at,
      }));
      setMessages(loadedMessages);
    } catch (err) {
      console.error('Failed to resume session:', err);
      setError('Could not load conversation history.');
    }
  };

  const persistScopeToActiveSession = async (
    sessionId: string | null,
    mode: AIMode,
    docId?: string,
    colId?: string,
    docTitle?: string
  ) => {
    if (!session?.access_token || !sessionId) return;
    const scopeType = mode === 'document' ? 'single_document' : (mode === 'collection' ? 'collection' : 'all');
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({
          scope_type: scopeType,
          scope_document_id: mode === 'document' ? docId || null : null,
          scope_collection_id: mode === 'collection' ? colId || null : null,
          scope_document_title: mode === 'document' ? docTitle || null : null,
        }),
      });
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        scope_type: scopeType,
        scope_document_id: mode === 'document' ? docId || null : null,
        scope_collection_id: mode === 'collection' ? colId || null : null,
        scope_document_title: mode === 'document' ? docTitle || null : null,
      } : s));
    } catch (err) {
      console.error('Failed to persist session scope update:', err);
    }
  };

  const renameSession = async (sessionId: string, newTitle: string) => {
    if (!session?.access_token) return;
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ title: newTitle }),
      });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!session?.access_token) return;
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const pinSession = (sessionId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

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

    if (useLocalOllama) {
      await handleLocalOllamaQuery(userMessage, assistantMessageId, startTime);
      return;
    }

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
          session_id: currentSessionId || undefined,
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
          // Capture session_id from backend
          if (payload.session_id && !currentSessionId) {
            setCurrentSessionId(payload.session_id as string);
          }
        } else if (eventName === 'delta') {
          assistantContent += payload.text || '';
          updateAssistantMessage(assistantContent, finalCitations);
        } else if (eventName === 'done') {
          const nextDiagnostics = payload.diagnostics as AIDiagnostics;
          finalCitations = nextDiagnostics.contextChunks || finalCitations;
          assistantContent = payload.answer || assistantContent;
          setDiagnostics(nextDiagnostics);
          updateAssistantMessage(assistantContent, finalCitations);
          // Capture session_id from done event
          if (payload.session_id && !currentSessionId) {
            setCurrentSessionId(payload.session_id as string);
          }
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
      void fetchSessions();
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

  const handleLocalOllamaQuery = async (userMessage: Message, assistantMessageId: string, startTime: number) => {
    const updateAssistantMessage = (content: string, citations?: ContextChunk[]) => {
      setMessages(prev => prev.map(message => (
        message.id === assistantMessageId
          ? { ...message, content, citations: citations ?? message.citations }
          : message
      )));
    };

    try {
      const available = await checkOllamaAvailable();
      if (!available) {
        setOllamaStatus('unavailable');
        updateAssistantMessage(ollamaInstallMessage());
        return;
      }
      setOllamaStatus('available');

      let model = ollamaModel;
      if (!model) {
        const models = await listOllamaModels();
        setOllamaModels(models);
        if (models.length === 0) {
          updateAssistantMessage(
            'Ollama is running, but no models are pulled yet. Run `ollama pull llama3.2` (or any model you like) in a terminal, then try again.'
          );
          return;
        }
        model = models[0].name;
        setOllamaModel(model);
      }

      const prepResponse = await fetch(`${API_BASE_URL}/api/documents/query/prepare`, {
        method: 'POST',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({
          query: userMessage.content,
          session_id: currentSessionId || undefined,
          scope: {
            mode: aiMode,
            document_id: aiMode === 'document' ? modeDocumentId || selectedDocument?.id : null,
            collection_id: aiMode === 'collection' ? modeCollectionId || selectedCollection?.id : null,
          },
        }),
      });

      if (!prepResponse.ok) {
        const data = await prepResponse.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not prepare the query.');
      }

      const prepared = await prepResponse.json();
      if (prepared.session_id && !currentSessionId) {
        setCurrentSessionId(prepared.session_id as string);
      }
      const preparedDiagnostics = prepared.diagnostics as AIDiagnostics;
      const citations = preparedDiagnostics.contextChunks || [];
      setDiagnostics(preparedDiagnostics);
      updateAssistantMessage('', citations);

      let assistantContent = '';
      const answer = await streamOllamaChat(model, prepared.system_instruction, prepared.prompt, delta => {
        assistantContent += delta;
        updateAssistantMessage(assistantContent, citations);
      });

      const finalAnswer = (answer || assistantContent).trim();
      const llmTimeMs = Date.now() - startTime;
      const finalDiagnostics: AIDiagnostics = {
        ...preparedDiagnostics,
        llmTimeMs,
        totalTimeMs: (preparedDiagnostics.totalTimeMs || 0) + llmTimeMs,
      };
      setDiagnostics(finalDiagnostics);
      updateAssistantMessage(finalAnswer, citations);

      await fetch(`${API_BASE_URL}/api/documents/query/complete`, {
        method: 'POST',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({
          session_id: prepared.session_id,
          query: userMessage.content,
          answer: finalAnswer,
          diagnostics: finalDiagnostics,
        }),
      });

      void fetchData();
      void fetchSessions();
    } catch (err) {
      console.error('Local Ollama query error:', err);
      updateAssistantMessage(ollamaInstallMessage());
    } finally {
      setProcessing(false);
    }
  };

  const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge, active: activeView === 'dashboard', onClick: () => setActiveView('dashboard') },
    { id: 'documents', label: 'My Documents', icon: FileText, active: activeView === 'documents' || activeView === 'details', onClick: () => setActiveView('documents'), badge: documents.length },
    { id: 'collections', label: 'Collections', icon: FolderOpen, active: activeView === 'collections' || activeView === 'collection-workspace', onClick: () => setActiveView('collections'), badge: collections.length },
    { id: 'recent', label: 'Chat History', icon: MessageSquareText, active: activeView === 'recent', onClick: () => { setActiveView('recent'); void fetchSessions(); }, badge: sessions.length || undefined },
    { id: 'citations', label: 'Citations', icon: FileSearch, active: activeView === 'citations', onClick: () => setActiveView('citations'), badge: lastCitations.length || undefined },
    { id: 'settings', label: 'Settings', icon: Settings, active: activeView === 'settings', onClick: () => setActiveView('settings') },
  ];

  const bottomSidebarItems: SidebarItem[] = [
    {
      id: 'overview',
      label: 'Workspace Overview',
      icon: BarChart3,
      onClick: () => setShowOverviewDrawer(true),
    },
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
      bottomSidebarItems={bottomSidebarItems}
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

      {/* Workspace Overview Drawer */}
      <WorkspaceOverviewDrawer
        isOpen={showOverviewDrawer}
        onClose={() => setShowOverviewDrawer(false)}
        metrics={{
          documentsCount: documents.length,
          collectionsCount: collections.length,
          totalChunks,
          totalEmbeddings,
          readyDocs,
          storageUsedFormatted: formatBytes(storageUsed),
          todayQueries,
          activeModel: health?.model || 'Unknown',
        }}
        activity={{
          documents,
          collections,
          queryLogs,
          onOpenDocument: openDocumentWorkspace,
          onOpenCollection: openCollectionWorkspace,
          onViewAllQueries: () => setActiveView('recent'),
        }}
      />

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
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden h-full">
        <main className="flex flex-col h-full overflow-hidden">
          {renderAIWorkspace({
            title: 'Ask anything from your documents',
            subtitle: 'Search all indexed files unless you switch scope.',
            placeholder: 'Ask anything from your documents...',
          })}
        </main>
        {renderPipelinePanel()}
      </div>
    );
  }

  function renderAIWorkspace({ title, subtitle, placeholder }: { title: string; subtitle: string; placeholder: string }) {
    return (
      <section className="flex flex-col h-full overflow-hidden bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={aiMode}
                onChange={event => {
                  const newMode = event.target.value as AIMode;
                  setAIMode(newMode);
                  if (currentSessionId) {
                    const doc = documents.find(d => d.id === modeDocumentId);
                    void persistScopeToActiveSession(currentSessionId, newMode, modeDocumentId, modeCollectionId, doc?.title || savedDocTitle);
                  }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Documents</option>
                <option value="collection">Collection</option>
                <option value="document">Single Document</option>
              </select>
              {aiMode === 'collection' && (
                <select
                  value={modeCollectionId}
                  onChange={event => {
                    const colId = event.target.value;
                    setModeCollectionId(colId);
                    if (currentSessionId) {
                      void persistScopeToActiveSession(currentSessionId, 'collection', undefined, colId, undefined);
                    }
                  }}
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
                  onChange={event => {
                    const docId = event.target.value;
                    setModeDocumentId(docId);
                    const found = documents.find(d => d.id === docId);
                    setSelectedDocument(found || null);
                    if (found?.title) setSavedDocTitle(found.title);
                    if (currentSessionId) {
                      void persistScopeToActiveSession(currentSessionId, 'document', docId, undefined, found?.title || savedDocTitle);
                    }
                  }}
                  className="max-w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select document</option>
                  {modeDocumentId && !documents.some(doc => doc.id === modeDocumentId) && (
                    <option value={modeDocumentId} disabled className="text-amber-400 font-medium">
                      {savedDocTitle ? `${savedDocTitle} (Unavailable)` : 'Document Unavailable'}
                    </option>
                  )}
                  {documents.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {aiMode === 'document' && modeDocumentId && !documents.some(doc => doc.id === modeDocumentId) && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              The referenced document (<strong>{savedDocTitle || 'Document'}</strong>) is unavailable or has been deleted. Please select an available document to ask new questions.
            </span>
          </div>
        )}

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
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setUseLocalOllama(prev => !prev)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors ${
                useLocalOllama
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
              title="When on, answers are generated by Ollama running on this device instead of the cloud LLM"
            >
              <Cpu className="h-3.5 w-3.5" />
              Local Ollama
            </button>
            {useLocalOllama && (
              <>
                {ollamaStatus === 'checking' && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking for Ollama...
                  </span>
                )}
                {ollamaStatus === 'unavailable' && (
                  <span className="text-amber-400">Ollama not reachable on this device</span>
                )}
                {ollamaStatus === 'available' && ollamaModels.length > 0 && (
                  <select
                    value={ollamaModel}
                    onChange={event => setOllamaModel(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 focus:outline-none"
                  >
                    {ollamaModels.map(model => (
                      <option key={model.name} value={model.name}>{model.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => void refreshOllamaStatus()}
                  className="text-slate-500 hover:text-slate-300"
                  title="Re-check for Ollama"
                >
                  <Loader2 className={`h-3.5 w-3.5 ${ollamaStatus === 'checking' ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
          </div>
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
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_360px] overflow-hidden h-full">
        <main className="relative flex h-full flex-col overflow-hidden">
          <ChatHistorySidebar
            sessions={sessions}
            activeSessionId={currentSessionId}
            pinnedIds={pinnedIds}
            loading={sessionsLoading}
            onNewChat={handleNewChat}
            onSelectSession={resumeSession}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
            onPinSession={pinSession}
          />
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
