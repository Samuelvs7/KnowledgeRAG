import { useState } from 'react';
import { Lightbulb, HelpCircle } from 'lucide-react';
import type { QuizQuestion, QuizAnswerResult } from '../../../types';
import { ExplanationPanel } from './ExplanationPanel';

interface QuestionCardProps {
  question: QuizQuestion;
  result: QuizAnswerResult | null;
  selectedAnswer: string | null;
  onAnswer: (selected: string | null, isUnknown: boolean, usedHint: boolean) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionCard({ question, result, selectedAnswer, onAnswer }: QuestionCardProps) {
  const [showHint, setShowHint] = useState(false);
  const answered = result !== null;

  const optionClasses = (option: string) => {
    if (!answered) {
      return option === selectedAnswer
        ? 'border-amber-500 bg-amber-500/10 text-white'
        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900';
    }
    const isCorrectOption = option.trim() === result.correct_answer.trim();
    const isSelectedOption = option === selectedAnswer;
    if (isCorrectOption) return 'border-emerald-500 bg-emerald-500/10 text-white';
    if (isSelectedOption) return 'border-rose-500 bg-rose-500/10 text-white';
    return 'border-slate-800 bg-slate-900/40 text-slate-500';
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <span>{question.subject}</span>
          <span>&middot;</span>
          <span>{question.topic}</span>
          <span>&middot;</span>
          <span className="capitalize">{question.difficulty}</span>
        </div>
        <h2 className="text-lg font-semibold text-white leading-relaxed">{question.question_text}</h2>
      </div>

      <div className="space-y-2.5">
        {question.options.map((option, index) => (
          <button
            key={option}
            disabled={answered}
            onClick={() => onAnswer(option, false, showHint)}
            className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all disabled:cursor-default ${optionClasses(option)}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-xs font-semibold text-slate-400">
              {OPTION_LETTERS[index]}
            </span>
            <span className="pt-0.5">{option}</span>
          </button>
        ))}
      </div>

      {!answered && (
        <div className="flex items-center justify-between">
          {question.hint ? (
            <button
              onClick={() => setShowHint((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {showHint ? 'Hide hint' : 'Need a hint?'}
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => onAnswer(null, true, showHint)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            I don't know
          </button>
        </div>
      )}

      {!answered && showHint && question.hint && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200/90">
          {question.hint}
        </div>
      )}

      {answered && (
        <ExplanationPanel
          isCorrect={result.is_correct}
          isUnknown={selectedAnswer === null}
          correctAnswer={result.correct_answer}
          selectedAnswer={selectedAnswer}
          explanation={result.explanation}
        />
      )}
    </div>
  );
}
