import { FileText, FolderOpen, MessageSquare, Clock, ChevronRight } from 'lucide-react';
import type { Document, DocumentCollection, AIQuery } from '../types';

export interface RecentActivityPanelProps {
  documents: Document[];
  collections: DocumentCollection[];
  queryLogs: AIQuery[];
  onOpenDocument: (doc: Document) => void;
  onOpenCollection: (collection: DocumentCollection) => void;
  onViewAllQueries?: () => void;
}

export function RecentActivityPanel({
  documents,
  collections,
  queryLogs,
  onOpenDocument,
  onOpenCollection,
  onViewAllQueries,
}: RecentActivityPanelProps) {
  const shortDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Recent Documents */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recent Documents
          </h3>
          <span className="text-xs text-slate-600">{documents.length} total</span>
        </div>
        <div className="space-y-1.5">
          {documents.slice(0, 5).map((doc) => (
            <button
              key={doc.id}
              onClick={() => onOpenDocument(doc)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-800/80 group"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                <FileText className="h-3.5 w-3.5" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300 group-hover:text-white">
                {doc.title}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
          {documents.length === 0 && (
            <p className="py-2 text-xs text-slate-500">No documents uploaded yet</p>
          )}
        </div>
      </div>

      {/* Recent Collections */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recent Collections
          </h3>
          <span className="text-xs text-slate-600">{collections.length} total</span>
        </div>
        <div className="space-y-1.5">
          {collections.slice(0, 5).map((collection) => (
            <button
              key={collection.id}
              onClick={() => onOpenCollection(collection as unknown as DocumentCollection)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-800/80 group"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20">
                <FolderOpen className="h-3.5 w-3.5" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300 group-hover:text-white">
                {collection.name}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
          {collections.length === 0 && (
            <p className="py-2 text-xs text-slate-500">No collections created yet</p>
          )}
        </div>
      </div>

      {/* Recent AI Conversations */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recent AI Conversations
          </h3>
          {onViewAllQueries && (
            <button
              onClick={onViewAllQueries}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View all
            </button>
          )}
        </div>
        <div className="space-y-2">
          {queryLogs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-2.5 text-left transition-colors hover:border-slate-700/60"
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium text-slate-300">
                    {log.query_text}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-600" />
                      {shortDate(log.created_at)}
                    </span>
                    {log.response_time_ms && <span>{log.response_time_ms}ms</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {queryLogs.length === 0 && (
            <p className="py-2 text-xs text-slate-500">No conversations logged yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
