import { Loader2, CheckCircle2, Target, BookX } from 'lucide-react';
import type { MistakeItem } from '../../../types';

interface MistakeNotebookProps {
  mistakes: MistakeItem[];
  loading: boolean;
  practicingId: string | null;
  onPractice: (mistake: MistakeItem) => void;
  onMaster: (mistake: MistakeItem) => void;
}

const STATUS_TONE: Record<string, string> = {
  open: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  practicing: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  mastered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

export function MistakeNotebook({ mistakes, loading, practicingId, onPractice, onMaster }: MistakeNotebookProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (mistakes.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <BookX className="w-10 h-10 text-slate-700 mx-auto mb-4" />
        <h3 className="text-white font-semibold mb-1.5">No mistakes yet</h3>
        <p className="text-sm text-slate-500">
          That's a good sign! Complete a few quizzes and we'll track concepts that need more practice here.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-3">
      {mistakes.map((mistake) => (
        <div key={mistake.id} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{mistake.subject}</span>
              <span>&middot;</span>
              <span>{mistake.topic}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${STATUS_TONE[mistake.status]}`}>
              {mistake.status}
            </span>
          </div>

          {mistake.question_text && (
            <p className="text-sm text-white leading-relaxed">{mistake.question_text}</p>
          )}

          {mistake.correct_answer && (
            <div className="text-sm">
              <span className="text-slate-500">Correct answer: </span>
              <span className="text-emerald-400 font-medium">{mistake.correct_answer}</span>
            </div>
          )}

          {mistake.explanation && (
            <div className="text-sm text-slate-400">
              <span className="text-slate-500 block mb-0.5">Concept</span>
              {mistake.explanation}
            </div>
          )}

          {mistake.status !== 'mastered' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onPractice(mistake)}
                disabled={practicingId === mistake.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {practicingId === mistake.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                Practice Similar Questions
              </button>
              <button
                onClick={() => onMaster(mistake)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-600 text-xs font-medium transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark as Understood
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
