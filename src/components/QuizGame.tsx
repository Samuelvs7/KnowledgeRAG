import { useEffect, useRef, useState } from 'react';
import type { Quiz, QuizAnswerResult } from '../types';
import { Target, X, Trophy, CheckCircle, XCircle, Zap, Flame, ArrowRight, Loader2 } from 'lucide-react';

/**
 * QuizGame — a gamified quiz overlay.
 *
 * Wraps the same quiz backend flow (onAnswer / onTimeout / onNext) but adds a
 * per-question countdown, a speed bonus, a combo multiplier, a live score, and
 * animated correct/wrong feedback — so the quiz feels like a game, not a form.
 */

const QUESTION_TIME = 20; // seconds per question
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;

interface Props {
  loading: boolean;
  quiz: Quiz | null;
  qIndex: number;
  selected: string | null;
  result: QuizAnswerResult | null;
  correct: number;
  done: boolean;
  onAnswer: (opt: string) => void;
  onTimeout: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function QuizGame({ loading, quiz, qIndex, selected, result, correct, done, onAnswer, onTimeout, onNext, onClose }: Props) {
  const q = quiz?.questions[qIndex];
  const total = quiz?.questions.length || 0;

  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [points, setPoints] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [gained, setGained] = useState<number | null>(null); // floating "+N" burst
  const answeredAtRef = useRef(QUESTION_TIME);
  const scoredForRef = useRef(-1);
  const timedOutForRef = useRef(-1);

  // Reset the countdown whenever a new question appears.
  useEffect(() => {
    if (!q || done) return;
    setTimeLeft(QUESTION_TIME);
    answeredAtRef.current = QUESTION_TIME;
    setGained(null);
  }, [qIndex, q?.id, done]);

  // Run the countdown while the question is unanswered.
  useEffect(() => {
    if (!q || result || done || loading) return;
    const id = setInterval(() => {
      setTimeLeft(prev => {
        const next = Math.max(0, prev - 0.1);
        if (next <= 0 && timedOutForRef.current !== qIndex) {
          timedOutForRef.current = qIndex;
          onTimeout();
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [q?.id, qIndex, result, done, loading, onTimeout]);

  // Capture how much time was left the instant an answer is chosen.
  const handleAnswer = (opt: string) => {
    if (result) return;
    answeredAtRef.current = timeLeft;
    onAnswer(opt);
  };

  // Score the question exactly once, when its result arrives.
  useEffect(() => {
    if (!result || scoredForRef.current === qIndex) return;
    scoredForRef.current = qIndex;
    if (result.is_correct) {
      const speed = Math.round((answeredAtRef.current / QUESTION_TIME) * MAX_SPEED_BONUS);
      const mult = 1 + Math.min(combo, 4) * 0.25; // up to 2x at a 4+ combo
      const earned = Math.round((BASE_POINTS + speed) * mult);
      setPoints(p => p + earned);
      setGained(earned);
      setCombo(c => { const n = c + 1; setBestCombo(b => Math.max(b, n)); return n; });
    } else {
      setCombo(0);
      setGained(0);
    }
  }, [result, qIndex, combo]);

  const pct = total ? Math.round((correct / total) * 100) : 0;
  const ringPct = Math.max(0, Math.min(1, timeLeft / QUESTION_TIME));
  const urgent = timeLeft <= 5 && !result;

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <style>{`@keyframes qshake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes qpop{0%{transform:scale(.6);opacity:0}50%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes qfloat{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-28px);opacity:0}}`}</style>

      <div className="w-full max-w-xl">
        {/* Header: score + combo + close */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-white font-bold tabular-nums">{points}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">pts</span>
            </div>
            {combo >= 2 && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30" style={{ animation: 'qpop .3s ease-out' }}>
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-orange-300 font-bold text-sm">{combo}× combo</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="h-72 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Building your challenge…</p>
          </div>
        ) : done ? (
          <ResultScreen correct={correct} total={total} pct={pct} points={points} bestCombo={bestCombo} onClose={onClose} />
        ) : q ? (
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6" style={result && !result.is_correct ? { animation: 'qshake .4s' } : undefined}>
            {/* progress dots + timer ring */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1 flex-1">
                {quiz!.questions.map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < qIndex ? 'bg-emerald-500' : i === qIndex ? 'bg-orange-500' : 'bg-slate-700'}`} />
                ))}
              </div>
              <TimerRing pct={ringPct} seconds={Math.ceil(timeLeft)} urgent={urgent} hidden={!!result} />
            </div>

            <div className="text-xs text-slate-500 mb-2">Question {qIndex + 1} of {total}</div>
            <h4 className="text-lg font-medium text-white mb-5">{q.question_text}</h4>

            <div className="space-y-2.5 relative">
              {gained !== null && (
                <div className="absolute -top-8 right-0 font-bold text-lg pointer-events-none" style={{ animation: 'qfloat 1s ease-out forwards', color: gained > 0 ? '#34d399' : '#fb7185' }}>
                  {gained > 0 ? `+${gained}` : 'missed'}
                </div>
              )}
              {q.options.map((opt, i) => {
                const isSel = selected === opt;
                const isCorrect = result && opt === result.correct_answer;
                const showRes = !!result;
                return (
                  <button key={i} onClick={() => handleAnswer(opt)} disabled={showRes}
                    className={`w-full p-3.5 rounded-xl text-left text-sm transition-all ${
                      showRes
                        ? isCorrect ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-100'
                          : isSel ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-100'
                          : 'bg-slate-950 border border-slate-800 text-slate-500'
                        : 'bg-slate-950 border border-slate-800 hover:border-orange-500 hover:bg-slate-800 text-slate-200 active:scale-[.99]'
                    }`}
                    style={showRes && isCorrect ? { animation: 'qpop .35s ease-out' } : undefined}>
                    <div className="flex items-center gap-2.5">
                      <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                        showRes && isCorrect ? 'bg-emerald-500 text-white'
                          : showRes && isSel ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {showRes && isCorrect ? <CheckCircle className="w-4 h-4" /> : showRes && isSel ? <XCircle className="w-4 h-4" /> : String.fromCharCode(65 + i)}
                      </span>
                      <span>{opt}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {result && (
              <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className={`font-semibold ${result.is_correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {result.is_correct ? '✅ Correct!' : selected ? '❌ Not quite.' : '⏱ Time!'}
                  </span> {result.explanation}
                </p>
                <button onClick={onNext} className="mt-3 w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all">
                  {qIndex + 1 >= total ? 'See results' : 'Next question'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimerRing({ pct, seconds, urgent, hidden }: { pct: number; seconds: number; urgent: boolean; hidden: boolean }) {
  if (hidden) return <div className="w-10 h-10" />;
  const r = 16, c = 2 * Math.PI * r;
  return (
    <div className="relative w-10 h-10 shrink-0" style={urgent ? { animation: 'qpop .5s ease-in-out infinite' } : undefined}>
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={urgent ? '#f43f5e' : '#f59e0b'} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .1s linear' }} />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${urgent ? 'text-rose-400' : 'text-amber-300'}`}>
        {seconds}
      </div>
    </div>
  );
}

function ResultScreen({ correct, total, pct, points, bestCombo, onClose }: { correct: number; total: number; pct: number; points: number; bestCombo: number; onClose: () => void }) {
  const great = pct >= 80, ok = pct >= 60;
  return (
    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-8 text-center" style={{ animation: 'qpop .4s ease-out' }}>
      <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${great ? 'bg-amber-500/15 text-amber-400' : ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
        <Trophy className="w-10 h-10" />
      </div>
      <h2 className="text-3xl font-extrabold text-white mb-1 tabular-nums">{points} <span className="text-lg font-semibold text-amber-400">pts</span></h2>
      <p className="text-slate-400 text-sm mb-5">
        {great ? 'Outstanding! You crushed it. 🎉' : ok ? 'Nice work — you\'re getting there!' : 'Good effort — review and run it back!'}
      </p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat icon={CheckCircle} tone="emerald" value={`${correct}/${total}`} label="Correct" />
        <Stat icon={Target} tone="blue" value={`${pct}%`} label="Accuracy" />
        <Stat icon={Flame} tone="orange" value={`${bestCombo}×`} label="Best combo" />
      </div>
      <button onClick={onClose} className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl font-semibold w-full transition-all">Done</button>
    </div>
  );
}

function Stat({ icon: Icon, tone, value, label }: { icon: typeof Flame; tone: 'emerald' | 'blue' | 'orange'; value: string; label: string }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'blue' ? 'text-blue-400' : 'text-orange-400';
  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
      <Icon className={`w-5 h-5 mx-auto mb-1 ${c}`} />
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default QuizGame;
