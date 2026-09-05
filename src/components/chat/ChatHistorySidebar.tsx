import { useState } from 'react';
import { Plus, MessageSquare, AlertTriangle } from 'lucide-react';
import { ConversationSearch } from './ConversationSearch';
import { ConversationGroups } from './ConversationGroups';
import type { AISession } from '../../types';

interface ChatHistorySidebarProps {
  sessions: AISession[];
  activeSessionId: string | null;
  pinnedIds: Set<string>;
  loading: boolean;
  onNewChat: () => void;
  onSelectSession: (session: AISession) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onPinSession: (sessionId: string) => void;
}

interface DeleteConfirmation {
  sessionId: string;
  title: string;
}

export function ChatHistorySidebar({
  sessions,
  activeSessionId,
  pinnedIds,
  loading,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onPinSession,
}: ChatHistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);

  const filteredSessions = searchQuery.trim()
    ? sessions.filter(session => {
        const q = searchQuery.toLowerCase();
        const title = (session.title || '').toLowerCase();
        return title.includes(q);
      })
    : sessions;

  const handleDelete = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    setDeleteConfirm({
      sessionId,
      title: session?.title || 'Untitled',
    });
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      onDeleteSession(deleteConfirm.sessionId);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Chat History</h3>
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <ConversationSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            {/* Loading skeletons */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-full animate-pulse rounded-lg bg-slate-800/60 p-3">
                <div className="mb-2 h-3 w-3/4 rounded bg-slate-700" />
                <div className="h-2 w-1/2 rounded bg-slate-700/60" />
              </div>
            ))}
          </div>
        ) : (
          <ConversationGroups
            sessions={filteredSessions}
            pinnedIds={pinnedIds}
            activeSessionId={activeSessionId}
            onSelect={onSelectSession}
            onRename={onRenameSession}
            onDelete={handleDelete}
            onPin={onPinSession}
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h4 className="text-lg font-semibold text-white">Delete Conversation?</h4>
            </div>
            <p className="mb-5 mt-2 text-sm text-slate-400">
              This will permanently delete <span className="font-medium text-slate-300">"{deleteConfirm.title}"</span> and all its messages.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
