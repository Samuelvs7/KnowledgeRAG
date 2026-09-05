import { useState } from 'react';
import { MessageSquare, Pin, Check, X } from 'lucide-react';
import { ConversationMenu } from './ConversationMenu';
import type { AISession } from '../../types';

interface ConversationItemProps {
  session: AISession;
  isActive: boolean;
  isPinned: boolean;
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onPin: () => void;
}

function getAutoTitle(session: AISession): string {
  const title = session.title || '';
  if (title && !title.startsWith('Query: ') && title !== 'New Conversation') {
    return title.length > 50 ? title.slice(0, 47) + '...' : title;
  }
  // Derive from "Query: ..." titles
  const cleaned = title.replace(/^Query:\s*/, '').replace(/\.{3}$/, '');
  if (cleaned.length > 50) return cleaned.slice(0, 47) + '...';
  return cleaned || 'New Conversation';
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationItem({
  session,
  isActive,
  isPinned,
  onClick,
  onRename,
  onDelete,
  onPin,
}: ConversationItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const title = getAutoTitle(session);
  const messageCount = (session.metadata as Record<string, unknown>)?.message_count;

  const handleStartRename = () => {
    setRenameValue(title);
    setIsRenaming(true);
  };

  const handleConfirmRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
  };

  if (isRenaming) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-slate-800 px-2.5 py-2">
        <input
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleConfirmRename();
            if (e.key === 'Escape') handleCancelRename();
          }}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
        />
        <button onClick={handleConfirmRename} className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleCancelRename} className="rounded p-1 text-slate-400 hover:bg-slate-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-all ${
        isActive
          ? 'bg-blue-500/15 border border-blue-500/30 text-white'
          : 'border border-transparent text-slate-300 hover:bg-slate-800/70 hover:text-white'
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">
        <MessageSquare className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isPinned && <Pin className="h-3 w-3 flex-shrink-0 text-amber-400" />}
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          {messageCount != null && <span>{String(messageCount)} msgs</span>}
          <span>{formatRelativeTime(session.updated_at)}</span>
        </div>
      </div>
      <div className="flex-shrink-0">
        <ConversationMenu
          onRename={handleStartRename}
          onDelete={onDelete}
          onPin={onPin}
          isPinned={isPinned}
        />
      </div>
    </button>
  );
}
