import { Sparkles, RotateCcw, BookOpen, Target, Home } from 'lucide-react';
import type { QuizCompleteResult } from '../../../types';

interface QuizResultsProps {
  result: QuizCompleteResult;
  quizTitle: string;
  hasMistakes: boolean;
  onRetry: () => void;
  onReviewMistakes: () => void;
  onPracticeWeakAreas: () => void;
  onBackToDashboard: () => void;
}

function scoreTone(score: number) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-blue-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-rose-400';
}

export function QuizResults({
  result,
  quizTitle,
  hasMistakes,
  onRetry,
  onReviewMistakes,
  onPracticeWeakAreas,
  onBackToDashboard,
}: QuizResultsProps) {
  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 py-4">
      <div className="text-center space-y-2">
        <p className="text-sm text-slate-500">{quizTitle} Complete</p>
        <div className={`text-5xl font-bold ${scoreTone(result.score)}`}>{result.score.toFixed(0)}%</div>
        <p className="text-sm text-slate-400">
          {result.correct_count} / {result.correct_count + result.incorrect_count + result.unknown_count + result.skipped_count} correct
          <span className="mx-2 text-slate-700">&middot;</span>
          {result.classification}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {[
          { label: 'Correct', value: result.correct_count, tone: 'text-emerald-400' },
          { label: 'Incorrect', value: result.incorrect_count, tone: 'text-rose-400' },
          { label: 'Unknown', value: result.unknown_count, tone: 'text-amber-400' },
          { label: 'Skipped', value: result.skipped_count, tone: 'text-slate-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <div className={`text-xl font-bold ${stat.tone}`}>{stat.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {result.topic_breakdown.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Topic Performance</h3>
          <div className="space-y-2.5">
            {result.topic_breakdown.map((t) => (
              <div key={`${t.subject}-${t.topic}`}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="text-slate-300">{t.topic}</span>
                  <span className="text-slate-400">{t.accuracy.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${t.accuracy >= 70 ? 'bg-emerald-500' : t.accuracy >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${t.accuracy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-2">
          <Sparkles className="w-4 h-4" />
          Your Learning Insight
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{result.learning_insight}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300 hover:border-slate-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Retry Quiz
        </button>
        <button
          onClick={onReviewMistakes}
          disabled={!hasMistakes}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300 hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          Review Mistakes
        </button>
        <button
          onClick={onPracticeWeakAreas}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300 hover:border-slate-700 transition-colors"
        >
          <Target className="w-4 h-4" />
          Practice Weak Areas
        </button>
        <button
          onClick={onBackToDashboard}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300 hover:border-slate-700 transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
