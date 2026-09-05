import { useCallback, useEffect, useState } from 'react';
import { Trophy, LayoutDashboard, BookOpen, Loader2, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { useQuizApi } from '../features/quiz/hooks/useQuizApi';
import { QuizDashboard } from '../features/quiz/pages/QuizDashboard';
import { QuizSetup } from '../features/quiz/pages/QuizSetup';
import { QuizSession, type AnswerState } from '../features/quiz/pages/QuizSession';
import { QuizResults } from '../features/quiz/pages/QuizResults';
import { MistakeNotebook } from '../features/quiz/pages/MistakeNotebook';
import type {
  Document,
  MistakeItem,
  Quiz,
  QuizCompleteResult,
  QuizDashboard as QuizDashboardData,
  TopicMastery,
} from '../types';

type SidebarView = 'dashboard' | 'mistakes';
type Flow = 'idle' | 'setup' | 'session' | 'results';

const GENERATION_STEPS = [
  'Analyzing your material',
  'Selecting concepts',
  'Generating questions',
  'Checking question quality',
  'Preparing your quiz',
];

function GeneratingOverlay() {
  return (
    <div className="max-w-sm mx-auto text-center py-24">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-6" />
      <h3 className="text-white font-semibold mb-4">Creating your quiz...</h3>
      <div className="space-y-1.5 text-sm text-slate-500">
        {GENERATION_STEPS.map((step) => <div key={step}>{step}</div>)}
      </div>
    </div>
  );
}

export function QuizPage() {
  const { user, profile } = useAuth();
  const api = useQuizApi();

  const [sidebarView, setSidebarView] = useState<SidebarView>('dashboard');
  const [flow, setFlow] = useState<Flow>('idle');

  const [dashboard, setDashboard] = useState<QuizDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [mistakesLoading, setMistakesLoading] = useState(false);
  const [practicingMistakeId, setPracticingMistakeId] = useState<string | null>(null);

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [sessionInitialAnswers, setSessionInitialAnswers] = useState<Record<string, AnswerState>>({});
  const [sessionInitialIndex, setSessionInitialIndex] = useState(0);
  const [completeResult, setCompleteResult] = useState<QuizCompleteResult | null>(null);
  const [setupPreset, setSetupPreset] = useState<{ subject?: string; topic?: string }>({});

  const [generating, setGenerating] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      setDashboard(await api.getDashboard());
    } catch {
      setFlowError('Could not load your dashboard. Please refresh.');
    } finally {
      setDashboardLoading(false);
    }
  }, [api]);

  const loadMistakes = useCallback(async () => {
    setMistakesLoading(true);
    try {
      const { mistakes: rows } = await api.getMistakes();
      setMistakes(rows);
    } finally {
      setMistakesLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
    supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setDocuments(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const runQuickQuiz = async (subject: string, topic: string, count: number, source = 'lernify_knowledge') => {
    setFlowError(null);
    setGenerating(true);
    try {
      const quiz = await api.generateQuiz({ subject, topic, difficulty: 'medium', question_count: count, source });
      const { attempt_id } = await api.startQuiz(quiz.id);
      setActiveQuiz(quiz);
      setAttemptId(attempt_id);
      setSessionInitialAnswers({});
      setSessionInitialIndex(0);
      setCompleteResult(null);
      setFlow('session');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : "We couldn't generate this quiz. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleQuickPractice = (count: number) => {
    const weak = dashboard?.weak_areas[0];
    runQuickQuiz(weak?.subject || 'General Knowledge', weak?.topic || 'Mixed Review', count);
  };

  const handlePracticeTopic = (item: TopicMastery) => runQuickQuiz(item.subject, item.topic, 5);

  const handleSetupStart = async (config: {
    subject: string;
    topic: string;
    difficulty: string;
    question_count: number;
    source: string;
    document_id?: string;
  }) => {
    const quiz = await api.generateQuiz(config);
    const { attempt_id } = await api.startQuiz(quiz.id);
    setActiveQuiz(quiz);
    setAttemptId(attempt_id);
    setSessionInitialAnswers({});
    setSessionInitialIndex(0);
    setCompleteResult(null);
    setFlow('session');
  };

  const handleContinue = async () => {
    const attemptToResume = dashboard?.continue_learning?.attempt_id;
    if (!attemptToResume) {
      setSetupPreset({});
      setFlow('setup');
      return;
    }
    setGenerating(true);
    try {
      const resumed = await api.resumeQuiz(attemptToResume);
      const answers: Record<string, AnswerState> = {};
      for (const a of resumed.answers) {
        answers[a.question_id] = {
          selectedAnswer: a.selected_answer,
          result: {
            is_correct: a.is_correct,
            correct_answer: a.correct_answer,
            explanation: a.explanation,
            mastery_score: 0,
            mastery_label: '',
          },
        };
      }
      setActiveQuiz(resumed.quiz);
      setAttemptId(resumed.attempt_id);
      setSessionInitialAnswers(answers);
      setSessionInitialIndex(Math.min(resumed.answers.length, Math.max(0, resumed.quiz.questions.length - 1)));
      setCompleteResult(null);
      setFlow('session');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Could not resume this quiz.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitAnswer = (
    questionId: string,
    payload: { selected_answer: string | null; is_unknown: boolean; used_hint: boolean; time_spent_seconds: number }
  ) => {
    if (!attemptId) throw new Error('No active quiz attempt');
    return api.submitAnswer(attemptId, { question_id: questionId, ...payload });
  };

  const handleFinish = async () => {
    if (!attemptId) return;
    const result = await api.completeQuiz(attemptId);
    setCompleteResult(result);
    setFlow('results');
    loadDashboard();
  };

  const handleBackToDashboard = () => {
    setFlow('idle');
    setSidebarView('dashboard');
    setActiveQuiz(null);
    setAttemptId(null);
    setCompleteResult(null);
    loadDashboard();
  };

  const handleExitSession = () => {
    handleBackToDashboard();
  };

  const handleRetry = () => {
    if (!activeQuiz) return;
    runQuickQuiz(activeQuiz.subject, activeQuiz.topic, activeQuiz.question_count, activeQuiz.source);
  };

  const handleReviewMistakes = () => {
    setFlow('idle');
    setSidebarView('mistakes');
    loadMistakes();
  };

  const handlePracticeWeakAreas = () => {
    const weak = dashboard?.weak_areas[0];
    if (weak) runQuickQuiz(weak.subject, weak.topic, 5);
    else {
      setSetupPreset({});
      setFlow('setup');
    }
  };

  const handleMistakePractice = async (mistake: MistakeItem) => {
    setPracticingMistakeId(mistake.id);
    setFlowError(null);
    try {
      const quiz = await api.practiceMistake(mistake.id);
      const { attempt_id } = await api.startQuiz(quiz.id);
      setActiveQuiz(quiz);
      setAttemptId(attempt_id);
      setSessionInitialAnswers({});
      setSessionInitialIndex(0);
      setCompleteResult(null);
      setFlow('session');
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : "We couldn't generate practice questions. Please try again.");
    } finally {
      setPracticingMistakeId(null);
    }
  };

  const handleMistakeMaster = async (mistake: MistakeItem) => {
    await api.masterMistake(mistake.id);
    loadMistakes();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Track your quizzes, mistakes, and mastery</p>
          <a href="/profile" className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl">Sign In</a>
        </div>
      </div>
    );
  }

  const sidebarItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: flow === 'idle' && sidebarView === 'dashboard',
      onClick: handleBackToDashboard,
    },
    {
      id: 'mistakes',
      label: 'Mistake Notebook',
      icon: BookOpen,
      active: flow === 'idle' && sidebarView === 'mistakes',
      onClick: handleReviewMistakes,
      badge: mistakes.filter((m) => m.status === 'open').length || undefined,
    },
  ];

  const userName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there';

  let mainContent: JSX.Element;
  if (flow === 'setup') {
    mainContent = (
      <QuizSetup
        documents={documents}
        initialSubject={setupPreset.subject}
        initialTopic={setupPreset.topic}
        onCancel={handleBackToDashboard}
        onStart={handleSetupStart}
      />
    );
  } else if (flow === 'session' && activeQuiz && attemptId) {
    mainContent = (
      <QuizSession
        quiz={activeQuiz}
        initialAnswers={sessionInitialAnswers}
        initialIndex={sessionInitialIndex}
        onSubmitAnswer={handleSubmitAnswer}
        onFinish={handleFinish}
        onExit={handleExitSession}
      />
    );
  } else if (flow === 'results' && completeResult && activeQuiz) {
    mainContent = (
      <QuizResults
        result={completeResult}
        quizTitle={activeQuiz.title}
        hasMistakes={completeResult.incorrect_count + completeResult.unknown_count > 0}
        onRetry={handleRetry}
        onReviewMistakes={handleReviewMistakes}
        onPracticeWeakAreas={handlePracticeWeakAreas}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  } else if (generating) {
    mainContent = <GeneratingOverlay />;
  } else if (sidebarView === 'mistakes') {
    mainContent = (
      <MistakeNotebook
        mistakes={mistakes}
        loading={mistakesLoading}
        practicingId={practicingMistakeId}
        onPractice={handleMistakePractice}
        onMaster={handleMistakeMaster}
      />
    );
  } else {
    mainContent = (
      <QuizDashboard
        dashboard={dashboard}
        loading={dashboardLoading}
        userName={userName}
        onQuickPractice={handleQuickPractice}
        onNewQuiz={() => { setSetupPreset({}); setFlow('setup'); }}
        onContinue={handleContinue}
        onPracticeTopic={handlePracticeTopic}
      />
    );
  }

  const isSession = flow === 'session' && activeQuiz && attemptId;

  return (
    <WorkspaceLayout title="Quiz" subtitle="Learning Progression" icon={Trophy} accentColor="bg-amber-500" sidebarItems={sidebarItems}>
      <div className={isSession ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto p-6'}>
        {!isSession && flowError && (
          <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <span>{flowError}</span>
            <button onClick={() => setFlowError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {mainContent}
      </div>
    </WorkspaceLayout>
  );
}
