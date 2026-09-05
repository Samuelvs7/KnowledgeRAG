import { Sparkles, Zap, Target, ArrowRight, Trophy } from 'lucide-react';
import type { QuizDashboard as QuizDashboardData, TopicMastery } from '../../../types';

interface QuizDashboardProps {
  dashboard: QuizDashboardData | null;
  loading: boolean;
  userName: string;
  onQuickPractice: (count: number) => void;
  onNewQuiz: () => void;
  onContinue: () => void;
  onPracticeTopic: (item: TopicMastery) => void;
}

function Skeleton() {
  return (
    <div className="max-w-3xl mx-auto w-full space-y-5 animate-pulse">
      <div className="h-8 w-64 bg-slate-800 rounded-lg" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-xl" />)}
      </div>
      <div className="h-32 bg-slate-800 rounded-xl" />
      <div className="h-24 bg-slate-800 rounded-xl" />
    </div>
  );
}

export function QuizDashboard({
  dashboard,
  loading,
  userName,
  onQuickPractice,
  onNewQuiz,
  onContinue,
  onPracticeTopic,
}: QuizDashboardProps) {
  if (loading || !dashboard) return <Skeleton />;

  const hasActivity = dashboard.questions_answered > 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">{greeting}, {userName}</h1>
        <p className="text-sm text-slate-500 mt-1">Ready to improve your knowledge?</p>
      </div>

      {hasActivity && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Overall Mastery', value: `${dashboard.overall_mastery.toFixed(0)}%`, tone: 'text-amber-400' },
            { label: 'Questions Answered', value: dashboard.questions_answered.toLocaleString(), tone: 'text-blue-400' },
            { label: 'Accuracy', value: `${dashboard.accuracy.toFixed(0)}%`, tone: 'text-emerald-400' },
            { label: 'Topics Mastered', value: dashboard.topics_mastered.toString(), tone: 'text-violet-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
              <div className={`text-xl font-bold ${stat.tone}`}>{stat.value}</div>
              <div className="text-[11px] text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {dashboard.continue_learning ? (
        <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-400 uppercase tracking-wide mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Continue Learning
          </div>
          <h3 className="text-lg font-semibold text-white">{dashboard.continue_learning.topic}</h3>
          <p className="text-sm text-slate-400 mt-1">{dashboard.continue_learning.reason}</p>
          {dashboard.continue_learning.progress_percent !== null && (
            <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden max-w-xs">
              <div
                className="h-full bg-amber-500"
                style={{ width: `${dashboard.continue_learning.progress_percent}%` }}
              />
            </div>
          )}
          <button
            onClick={onContinue}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-center">
          <Trophy className="w-8 h-8 text-amber-500/60 mx-auto mb-3" />
          <h3 className="text-white font-semibold mb-1">Start your first quiz</h3>
          <p className="text-sm text-slate-500 mb-4">Pick a topic or one of your documents and see what you know.</p>
          <button
            onClick={onNewQuiz}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create a Quiz
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            Quick Practice
          </h3>
          <button onClick={onNewQuiz} className="text-xs text-slate-500 hover:text-amber-400 transition-colors">
            Custom Quiz
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {[5, 10, 15, 20].map((count) => (
            <button
              key={count}
              onClick={() => onQuickPractice(count)}
              className="py-3 rounded-xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              {count} Questions
            </button>
          ))}
        </div>
      </div>

      {(dashboard.weak_areas.length > 0 || dashboard.recommendations.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-rose-400" />
              Weak Areas
            </h3>
            {dashboard.weak_areas.length === 0 ? (
              <p className="text-sm text-slate-500">No weak areas detected yet.</p>
            ) : (
              <div className="space-y-2">
                {dashboard.weak_areas.map((area) => (
                  <button
                    key={`${area.subject}-${area.topic}`}
                    onClick={() => onPracticeTopic(area)}
                    className="w-full flex items-center justify-between text-sm px-2.5 py-2 rounded-lg hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <span className="text-slate-300">{area.topic}</span>
                    <span className="text-rose-400 font-medium">{area.mastery_score.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Recommended</h3>
            {dashboard.recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">Keep practicing — recommendations show up here.</p>
            ) : (
              <div className="space-y-2.5">
                {dashboard.recommendations.map((rec) => (
                  <div key={rec.label} className="text-sm">
                    <div className="text-slate-200">{rec.label}</div>
                    <div className="text-xs text-slate-500">{rec.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {dashboard.recent_quizzes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-2.5">Recent Quizzes</h3>
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 divide-y divide-slate-800">
            {dashboard.recent_quizzes.map((item) => (
              <div key={item.attempt_id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-300">{item.title}</span>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{item.correct_count}/{item.question_count}</span>
                  <span className="text-slate-300 font-medium">{item.accuracy?.toFixed(0) ?? 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
