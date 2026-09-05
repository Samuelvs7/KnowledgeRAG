import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

interface ExplanationPanelProps {
  isCorrect: boolean;
  isUnknown?: boolean;
  correctAnswer: string;
  selectedAnswer?: string | null;
  explanation: string;
}

const TONE_CLASSES = {
  emerald: { panel: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-400' },
  amber: { panel: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-400' },
  rose: { panel: 'border-rose-500/30 bg-rose-500/10', text: 'text-rose-400' },
} as const;

export function ExplanationPanel({
  isCorrect,
  isUnknown,
  correctAnswer,
  selectedAnswer,
  explanation,
}: ExplanationPanelProps) {
  const tone = isCorrect ? 'emerald' : isUnknown ? 'amber' : 'rose';
  const classes = TONE_CLASSES[tone];
  const Icon = isCorrect ? CheckCircle2 : isUnknown ? HelpCircle : XCircle;
  const heading = isCorrect ? 'Correct!' : isUnknown ? "That's okay — now you know" : 'Not quite';

  return (
    <div className={`rounded-xl border ${classes.panel} p-4 space-y-3`}>
      <div className={`flex items-center gap-2 ${classes.text} font-semibold`}>
        <Icon className="w-5 h-5" />
        <span>{heading}</span>
      </div>

      {!isCorrect && (
        <div className="text-sm text-slate-300">
          <span className="text-slate-500">Correct answer: </span>
          <span className="font-medium text-white">{correctAnswer}</span>
          {selectedAnswer && !isUnknown && (
            <div className="mt-1 text-slate-500">
              Your answer: <span className="text-slate-400">{selectedAnswer}</span>
            </div>
          )}
        </div>
      )}

      <div className="text-sm text-slate-300">
        <span className="text-slate-500 block mb-1">Why?</span>
        {explanation}
      </div>
    </div>
  );
}
