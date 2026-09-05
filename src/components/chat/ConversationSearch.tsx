import { Search, X } from 'lucide-react';

interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ConversationSearch({ value, onChange }: ConversationSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search conversations..."
        className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-8 text-sm text-white placeholder-slate-500 transition-colors focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
