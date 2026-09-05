import { useEffect, useRef, useState } from 'react';
import { Edit3, Trash2, Pin, Copy, Download, MoreVertical } from 'lucide-react';

interface ConversationMenuProps {
  onRename: () => void;
  onDelete: () => void;
  onPin: () => void;
  isPinned: boolean;
}

export function ConversationMenu({ onRename, onDelete, onPin, isPinned }: ConversationMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const items = [
    { label: 'Rename', icon: Edit3, action: onRename, disabled: false },
    { label: isPinned ? 'Unpin' : 'Pin', icon: Pin, action: onPin, disabled: false },
    { label: 'Duplicate', icon: Copy, action: () => {}, disabled: true },
    { label: 'Export', icon: Download, action: () => {}, disabled: true },
    { label: 'Delete', icon: Trash2, action: onDelete, disabled: false, destructive: true },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(prev => !prev); }}
        className="rounded-md p-1 text-slate-500 opacity-0 transition-all hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100"
        title="Conversation options"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-in fade-in slide-in-from-top-1">
          {items.map(item => (
            <button
              key={item.label}
              onClick={e => {
                e.stopPropagation();
                if (!item.disabled) {
                  item.action();
                  setOpen(false);
                }
              }}
              disabled={item.disabled}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed text-slate-600'
                  : item.destructive
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{item.label}</span>
              {item.disabled && (
                <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">Soon</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
