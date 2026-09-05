import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { Quiz, QuizAnswerResult } from '../../../types';
import { QuestionCard } from '../components/QuestionCard';
import { QuizProgressBar } from '../components/QuizProgressBar';

export interface AnswerState {
  selectedAnswer: string | null;
  result: QuizAnswerResult;
}

interface QuizSessionProps {
  quiz: Quiz;
  initialAnswers?: Record<string, AnswerState>;
  initialIndex?: number;
  onSubmitAnswer: (
    questionId: string,
    payload: { selected_answer: string | null; is_unknown: boolean; used_hint: boolean; time_spent_seconds: number }
  ) => Promise<QuizAnswerResult>;
  onFinish: () => Promise<void>;
  onExit: () => void;
}

export function QuizSession({ quiz, initialAnswers, initialIndex, onSubmitAnswer, onFinish, onExit }: QuizSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers || {});
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);

  const question = quiz.questions[currentIndex];
  const currentAnswer = answers[question.id] || null;
  const isLast = currentIndex === quiz.questions.length - 1;
  const answeredCount = Object.keys(answers).length;

  const goTo = (index: number) => {
    setCurrentIndex(index);
    setQuestionStartedAt(Date.now());
  };

  const handleAnswer = async (selected: string | null, isUnknown: boolean, usedHint: boolean) => {
    const timeSpent = Math.round((Date.now() - questionStartedAt) / 1000);
    const result = await onSubmitAnswer(question.id, {
      selected_answer: selected,
      is_unknown: isUnknown,
      used_hint: usedHint,
      time_spent_seconds: timeSpent,
    });
    setAnswers((prev) => ({ ...prev, [question.id]: { selectedAnswer: selected, result } }));
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
    }
  };

  const navigatorStatus = (index: number) => {
    const q = quiz.questions[index];
    const answer = answers[q.id];
    if (index === currentIndex) return 'current';
    if (!answer) return 'unanswered';
    if (answer.result.is_correct) return 'correct';
    if (answer.selectedAnswer === null) return 'unknown';
    return 'incorrect';
  };

  const NAVIGATOR_CLASSES: Record<string, string> = {
    current: 'bg-amber-500 text-white',
    correct: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    incorrect: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
    unknown: 'bg-slate-700 text-slate-400 border border-slate-600',
    unanswered: 'bg-slate-800 text-slate-500 border border-slate-700',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 shrink-0 border-b border-slate-800 flex items-center justify-between px-6 gap-6">
        <button onClick={onExit} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 max-w-md">
          <QuizProgressBar current={currentIndex} total={quiz.questions.length} />
        </div>
        <div className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <QuestionCard
          question={question}
          result={currentAnswer?.result || null}
          selectedAnswer={currentAnswer?.selectedAnswer ?? null}
          onAnswer={handleAnswer}
        />
      </div>

      <div className="shrink-0 border-t border-slate-800 px-6 py-4 space-y-3">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-1.5">
          {quiz.questions.map((q, index) => (
            <button
              key={q.id}
              onClick={() => goTo(index)}
              className={`w-6 h-6 rounded-md text-[10px] font-medium flex items-center justify-center transition-colors ${NAVIGATOR_CLASSES[navigatorStatus(index)]}`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => goTo(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {isLast ? (
            <button
              onClick={handleFinish}
              disabled={finishing || answeredCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-colors"
            >
              {finishing && <Loader2 className="w-4 h-4 animate-spin" />}
              Finish Quiz
            </button>
          ) : (
            <button
              onClick={() => goTo(currentIndex + 1)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
