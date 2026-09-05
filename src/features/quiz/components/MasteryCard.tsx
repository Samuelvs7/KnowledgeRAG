import type { TopicMastery } from '../../../types';

interface MasteryCardProps {
  title: string;
  items: TopicMastery[];
  emptyMessage: string;
  onPractice?: (item: TopicMastery) => void;
}

const LABEL_TONE: Record<string, string> = {
  Mastered: 'text-emerald-400',
  Strong: 'text-blue-400',
  'Good Progress': 'text-cyan-400',
  Developing: 'text-amber-400',
  'Needs Review': 'text-rose-400',
};

const BAR_TONE: Record<string, string> = {
  Mastered: 'bg-emerald-500',
  Strong: 'bg-blue-500',
  'Good Progress': 'bg-cyan-500',
  Developing: 'bg-amber-500',
  'Needs Review': 'bg-rose-500',
};

export function MasteryCard({ title, items, emptyMessage, onPractice }: MasteryCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={`${item.subject}-${item.topic}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-300">{item.topic}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${LABEL_TONE[item.label] || 'text-slate-400'}`}>
                    {item.mastery_score.toFixed(0)}%
                  </span>
                  {onPractice && (
                    <button
                      onClick={() => onPractice(item)}
                      className="text-[11px] text-slate-500 hover:text-amber-400 transition-colors"
                    >
                      Practice
                    </button>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${BAR_TONE[item.label] || 'bg-slate-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.mastery_score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
