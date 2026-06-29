import { FileText, Clock, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { AIDiagnostics, IngestionStatus } from '../types';

interface AIDiagnosticsPanelProps {
  diagnostics: AIDiagnostics | null;
  isProcessing: boolean;
}

export function AIDiagnosticsPanel({ diagnostics, isProcessing }: AIDiagnosticsPanelProps) {
  if (!diagnostics && !isProcessing) return null;

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin text-primary-500' : ''}`} />
          <span>AI Pipeline</span>
        </div>
        {diagnostics && (
          <span className="text-xs text-slate-500">{diagnostics.totalTimeMs}ms</span>
        )}
      </div>

      {isProcessing && !diagnostics ? (
        <div className="p-6 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
          <p className="text-sm text-slate-400">Processing query...</p>
        </div>
      ) : diagnostics ? (
        <div className="divide-y divide-slate-800">
          {/* Embedding Generation */}
          <div className="p-4 flex items-center gap-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              diagnostics.embeddingGenerated ? 'bg-success-500/20 text-success-500' : 'bg-slate-800 text-slate-500'
            }`}>
              {diagnostics.embeddingGenerated ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-200">Embedding Generation</span>
                {diagnostics.embeddingTimeMs && (
                  <span className="text-xs text-slate-500">{diagnostics.embeddingTimeMs}ms</span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {diagnostics.embeddingModel || 'text-embedding-3-small'} • {diagnostics.embeddingDimensions || 768} dimensions
              </div>
            </div>
          </div>

          {/* Vector Search */}
          <div className="p-4 flex items-center gap-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              diagnostics.vectorSearchPerformed ? 'bg-success-500/20 text-success-500' : 'bg-slate-800 text-slate-500'
            }`}>
              {diagnostics.vectorSearchPerformed ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-200">Vector Search</span>
                {diagnostics.vectorSearchTimeMs && (
                  <span className="text-xs text-slate-500">{diagnostics.vectorSearchTimeMs}ms</span>
                )}
              </div>
              {diagnostics.vectorSearchPerformed ? (
                <div className="text-xs text-slate-500">
                  Retrieved {diagnostics.vectorSearchResults} chunks from pgvector
                </div>
              ) : (
                <div className="text-xs text-amber-500">No vector search performed</div>
              )}
            </div>
          </div>

          {/* Reranking */}
          {diagnostics.rerankerUsed && (
            <div className="p-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-success-500/20 text-success-500">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-200">AI Reranking</span>
                  {diagnostics.rerankerTimeMs && (
                    <span className="text-xs text-slate-500">{diagnostics.rerankerTimeMs}ms</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Context refined and reranked
                </div>
              </div>
            </div>
          )}

          {/* LLM Response */}
          {diagnostics.llmTimeMs && (
            <div className="p-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary-500/20 text-primary-500">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-200">LLM Generation</span>
                  <span className="text-xs text-slate-500">{diagnostics.llmTimeMs}ms</span>
                </div>
                <div className="text-xs text-slate-500">
                  {diagnostics.llmPromptTokens || 0} prompt + {diagnostics.llmCompletionTokens || 0} completion tokens
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface IngestionStatusBadgeProps {
  status: IngestionStatus;
  size?: 'sm' | 'md';
}

export function IngestionStatusBadge({ status, size = 'md' }: IngestionStatusBadgeProps) {
  const config = {
    pending: { color: 'bg-slate-500', text: 'Pending', icon: Clock },
    parsing: { color: 'bg-blue-500', text: 'Parsing', icon: RefreshCw },
    chunking: { color: 'bg-violet-500', text: 'Chunking', icon: RefreshCw },
    embedding: { color: 'bg-orange-500', text: 'Embedding', icon: RefreshCw },
    vectorizing: { color: 'bg-pink-500', text: 'Vectorizing', icon: RefreshCw },
    ready: { color: 'bg-success-500', text: 'Ready', icon: CheckCircle },
    failed: { color: 'bg-error-500', text: 'Failed', icon: AlertTriangle },
  };

  const { color, text, icon: Icon } = config[status];
  const isProcessing = ['parsing', 'chunking', 'embedding', 'vectorizing'].includes(status);

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${color}/20`}>
      <Icon className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} ${color.replace('bg-', 'text-')} ${isProcessing ? 'animate-spin' : ''}`} />
      <span className={`text-xs font-medium ${color.replace('bg-', 'text-')}`}>{text}</span>
    </div>
  );
}

interface ContextChunksPanelProps {
  chunks: Array<{
    id: string;
    content: string;
    similarity: number;
    source: string;
  }>;
  maxVisible?: number;
}

export function ContextChunksPanel({ chunks, maxVisible = 5 }: ContextChunksPanelProps) {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <FileText className="w-4 h-4" />
          <span>Retrieved Context</span>
        </div>
        <span className="text-xs text-slate-500">{chunks.length} chunks</span>
      </div>
      <div className="divide-y divide-slate-800 max-h-[400px] overflow-y-auto">
        {chunks.slice(0, maxVisible).map((chunk, idx) => (
          <div key={chunk.id} className="p-3 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Chunk {idx + 1}</span>
              <span className="text-xs text-primary-400">{(chunk.similarity * 100).toFixed(1)}% match</span>
            </div>
            <p className="text-sm text-slate-300 line-clamp-3">{chunk.content}</p>
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span className="truncate">{chunk.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
