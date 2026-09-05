import { ConversationItem } from './ConversationItem';
import type { AISession } from '../../types';

interface GroupedSessions {
  label: string;
  sessions: AISession[];
}

function groupByDate(sessions: AISession[]): GroupedSessions[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7 = new Date(today.getTime() - 7 * 86400000);
  const last30 = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, AISession[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
    Older: [],
  };

  sessions.forEach(session => {
    const date = new Date(session.updated_at);
    if (date >= today) groups['Today'].push(session);
    else if (date >= yesterday) groups['Yesterday'].push(session);
    else if (date >= last7) groups['Last 7 Days'].push(session);
    else if (date >= last30) groups['Last 30 Days'].push(session);
    else groups['Older'].push(session);
  });

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, sessions: items }));
}

interface ConversationGroupsProps {
  sessions: AISession[];
  pinnedIds: Set<string>;
  activeSessionId: string | null;
  onSelect: (session: AISession) => void;
  onRename: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
  onPin: (sessionId: string) => void;
}

export function ConversationGroups({
  sessions,
  pinnedIds,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onPin,
}: ConversationGroupsProps) {
  const pinned = sessions.filter(s => pinnedIds.has(s.id));
  const unpinned = sessions.filter(s => !pinnedIds.has(s.id));
  const groups = groupByDate(unpinned);

  const renderSession = (session: AISession) => (
    <ConversationItem
      key={session.id}
      session={session}
      isActive={session.id === activeSessionId}
      isPinned={pinnedIds.has(session.id)}
      onClick={() => onSelect(session)}
      onRename={newTitle => onRename(session.id, newTitle)}
      onDelete={() => onDelete(session.id)}
      onPin={() => onPin(session.id)}
    />
  );

  return (
    <div className="space-y-1">
      {/* Pinned Section */}
      {pinned.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">Pinned</span>
          </div>
          <div className="space-y-0.5">
            {pinned.map(renderSession)}
          </div>
        </div>
      )}

      {/* Date Groups */}
      {groups.map(group => (
        <div key={group.label}>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</span>
          </div>
          <div className="space-y-0.5">
            {group.sessions.map(renderSession)}
          </div>
        </div>
      ))}

      {sessions.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500">
          No conversations yet.
        </div>
      )}
    </div>
  );
}
