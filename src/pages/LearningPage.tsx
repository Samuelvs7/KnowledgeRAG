import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { RichMarkdown } from '../components/RichMarkdown';
import { LessonDiagram, type Diagram } from '../components/LessonDiagram';
import { QuizGame } from '../components/QuizGame';
import { StudyPlanner } from '../components/StudyPlanner';
import { useQuizApi } from '../features/quiz/hooks/useQuizApi';
import type { Quiz, QuizAnswerResult } from '../types';
import {
  GraduationCap, Flame, Sparkles, BookOpen, Brain, Lightbulb, CheckCircle, XCircle,
  ArrowRight, Loader2, Zap, Trophy, Target, RotateCcw, Send, Wand2, FileText, X,
  Layers, AlertTriangle, Star, Play, MessageCircle, CalendarDays, Upload,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

type Level = 'beginner' | 'intermediate' | 'advanced';

interface LessonConcept { heading: string; explanation: string; analogy: string; }
interface Lesson {
  title: string; level: string; introduction: string;
  concepts: LessonConcept[]; worked_example: string;
  key_takeaways: string[]; common_mistakes: string[]; next_topics: string[];
  diagram?: Diagram | null;
  grounded?: boolean;
}
interface Flashcard { front: string; back: string; }
interface TopicRow {
  id: string; topic: string; subject: string; level: string; xp: number;
  source_document_id: string | null; last_studied_at: string; mastery?: number | null;
}
interface DocRow { id: string; title: string; file_type: string; }
interface Overview {
  progress: { level: number; xp_into_level: number; xp_for_next: number; total_xp: number };
  streak: { current: number; longest: number; last_study_date: string | null };
  stats: { topics_started: number; lessons_completed: number; flashcards_reviewed: number };
  continue_learning: TopicRow[];
  topics: TopicRow[];
  documents: DocRow[];
  recommendations: { topic: string; subject: string; reason: string }[];
}

const LEVELS: { id: Level; label: string; blurb: string }[] = [
  { id: 'beginner', label: 'Beginner', blurb: 'Start from zero' },
  { id: 'intermediate', label: 'Intermediate', blurb: 'Go deeper' },
  { id: 'advanced', label: 'Advanced', blurb: 'Master the nuances' },
];

export function LearningPage() {
  const { user, session } = useAuth();
  const token = session?.access_token;
  const quizApi = useQuizApi();

  const [view, setView] = useState<'dashboard' | 'lesson' | 'tutor' | 'schedule'>('dashboard');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Launcher
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState<Level>('beginner');
  const [sourceDocId, setSourceDocId] = useState<string>('');

  // Upload-to-learn
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [uploadName, setUploadName] = useState('');

  // Lesson
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonTopic, setLessonTopic] = useState('');
  const [loadingLesson, setLoadingLesson] = useState(false);

  // Flashcards
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [fcIndex, setFcIndex] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [loadingFc, setLoadingFc] = useState(false);

  // Tutor chat
  const [chatMsgs, setChatMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatSession, setChatSession] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  // Quiz
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<string | null>(null);
  const [quizQ, setQuizQ] = useState(0);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizAnswerResult | null>(null);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const uploadAndLearn = useCallback(async (file: File) => {
    if (!user) return;
    setError(null);
    setUploadName(file.name);
    setUploadStatus('uploading');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
    const storagePath = `${user.id}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
    let uploadedPath: string | null = null;
    try {
      const { error: upErr } = await supabase.storage.from('documents').upload(storagePath, file);
      if (upErr) throw upErr;
      uploadedPath = storagePath;

      const { data: doc, error: insErr } = await supabase.from('documents').insert({
        user_id: user.id,
        title: file.name,
        description: `Uploaded from Learning on ${new Date().toLocaleDateString()}`,
        file_type: file.type || ext,
        file_size: file.size,
        file_url: storagePath,
      }).select().single();
      if (insErr) throw insErr;

      const docId = (doc as { id: string }).id;
      setUploadStatus('processing');
      const res = await fetch(`${API_BASE}/api/documents/ingest`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ document_id: docId, title: file.name, file_type: file.type || ext }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not process this file');

      // Poll ingestion until it finishes (or time out ~90s).
      const deadline = Date.now() + 90_000;
      let status = 'pending';
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const { data: ing } = await supabase
          .from('document_ingestion').select('status').eq('document_id', docId).maybeSingle();
        status = (ing as { status?: string } | null)?.status || status;
        if (status === 'completed' || status === 'failed') break;
      }
      if (status === 'failed') throw new Error('We could not read that file. Try a PDF, PPTX, DOCX or text file.');

      await loadOverview();
      setSourceDocId(docId);
      setUploadStatus('done');
      setTimeout(() => setUploadStatus('idle'), 4000);
    } catch (err: any) {
      if (uploadedPath) { try { await supabase.storage.from('documents').remove([uploadedPath]); } catch { /* ignore */ } }
      setUploadStatus('error');
      setError(err?.message || 'Upload failed. Please try again.');
    }
  }, [user, authHeaders]);

  const loadOverview = useCallback(async () => {
    if (!token) { setLoadingOverview(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/learning/overview`, { headers: authHeaders() });
      if (res.ok) setOverview(await res.json());
    } catch { /* ignore */ } finally {
      setLoadingOverview(false);
    }
  }, [token, authHeaders]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs, chatSending]);

  const startLesson = async (t: string, lvl: Level, subj: string, docId: string) => {
    const cleanTopic = t.trim();
    if (!cleanTopic) return;
    setError(null);
    setLessonTopic(cleanTopic);
    setLesson(null);
    setFlashcards(null);
    setView('lesson');
    setLoadingLesson(true);
    try {
      const res = await fetch(`${API_BASE}/api/learning/lesson`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ topic: cleanTopic, subject: subj || 'General', level: lvl, document_id: docId || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not generate the lesson');
      const data = await res.json();
      setLesson(data.lesson);
      loadOverview();
    } catch (err: any) {
      setError(err.message || 'Could not generate the lesson');
      setView('dashboard');
    } finally {
      setLoadingLesson(false);
    }
  };

  const loadFlashcards = async () => {
    if (!lessonTopic) return;
    setLoadingFc(true);
    setFcIndex(0);
    setFcFlipped(false);
    try {
      const res = await fetch(`${API_BASE}/api/learning/flashcards`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ topic: lessonTopic, subject: subject || 'General', count: 8, document_id: sourceDocId || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not generate flashcards');
      const data = await res.json();
      setFlashcards(data.flashcards);
      loadOverview();
    } catch (err: any) {
      setError(err.message || 'Could not generate flashcards');
    } finally {
      setLoadingFc(false);
    }
  };

  const sendChat = async (text?: string) => {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatSending) return;
    setChatInput('');
    setChatMsgs(prev => [...prev, { role: 'user', content: msg }]);
    setChatSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/learning/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query: msg, topic: lessonTopic || null, session_id: chatSession, document_id: sourceDocId || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'The tutor is unavailable');
      const data = await res.json();
      setChatSession(data.session_id);
      setChatMsgs(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err: any) {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message || 'Something went wrong.'}` }]);
    } finally {
      setChatSending(false);
    }
  };

  // ---- Quiz flow (reuses the quiz backend) ----
  const startQuiz = async () => {
    if (!lessonTopic) return;
    setQuizLoading(true);
    setQuizDone(false);
    setQuizCorrect(0);
    setQuizQ(0);
    setQuizSelected(null);
    setQuizResult(null);
    try {
      const difficulty = level === 'beginner' ? 'easy' : level === 'advanced' ? 'hard' : 'medium';
      const generated = await quizApi.generateQuiz({
        subject: subject || 'General', topic: lessonTopic, difficulty, question_count: 5,
        source: sourceDocId ? 'specific_document' : 'ai_generated', document_id: sourceDocId || null,
      });
      const started = await quizApi.startQuiz(generated.id);
      setQuiz(started.quiz);
      setQuizAttempt(started.attempt_id);
    } catch (err: any) {
      setError(err.message || 'Could not start the quiz');
      setQuiz(null);
    } finally {
      setQuizLoading(false);
    }
  };

  const answerQuiz = async (option: string) => {
    if (!quiz || !quizAttempt || quizResult) return;
    setQuizSelected(option);
    try {
      const q = quiz.questions[quizQ];
      const result = await quizApi.submitAnswer(quizAttempt, {
        question_id: q.id, selected_answer: option, time_spent_seconds: 0,
      });
      setQuizResult(result);
      if (result.is_correct) setQuizCorrect(c => c + 1);
    } catch (err: any) {
      setError(err.message || 'Could not submit answer');
    }
  };

  const timeoutQuiz = async () => {
    if (!quiz || !quizAttempt || quizResult) return;
    try {
      const q = quiz.questions[quizQ];
      const result = await quizApi.submitAnswer(quizAttempt, {
        question_id: q.id, is_unknown: true, time_spent_seconds: 20,
      });
      setQuizResult(result);
    } catch (err: any) {
      setError(err.message || 'Could not submit answer');
    }
  };

  const nextQuiz = async () => {
    if (!quiz) return;
    if (quizQ + 1 >= quiz.questions.length) {
      if (quizAttempt) { try { await quizApi.completeQuiz(quizAttempt); } catch { /* ignore */ } }
      setQuizDone(true);
      loadOverview();
      return;
    }
    setQuizQ(i => i + 1);
    setQuizSelected(null);
    setQuizResult(null);
  };

  const closeQuiz = () => { setQuiz(null); setQuizAttempt(null); setQuizDone(false); };

  const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: GraduationCap, active: view === 'dashboard', onClick: () => setView('dashboard') },
    { id: 'schedule', label: 'Study Plan', icon: CalendarDays, active: view === 'schedule', onClick: () => setView('schedule') },
    { id: 'tutor', label: 'AI Tutor', icon: MessageCircle, active: view === 'tutor', onClick: () => setView('tutor') },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-orange-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in to start learning</h2>
          <p className="text-slate-400 mb-6">Your AI tutor, lessons, flashcards and quizzes live here.</p>
          <a href="/profile" className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium">Sign In</a>
        </div>
      </div>
    );
  }

  const prog = overview?.progress;
  const xpPct = prog ? Math.round((prog.xp_into_level / prog.xp_for_next) * 100) : 0;

  return (
    <WorkspaceLayout
      title="Learning"
      subtitle="Your AI Tutor"
      icon={GraduationCap}
      accentColor="bg-orange-500"
      sidebarItems={sidebarItems}
    >
      <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 overflow-hidden">
        {/* Top stat strip */}
        <div className="h-16 border-b border-slate-800 bg-slate-950/70 backdrop-blur flex items-center px-6 gap-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-bold shadow-lg shadow-orange-500/20">
              {prog?.level ?? 1}
            </div>
            <div className="w-40">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Level {prog?.level ?? 1}</span>
                <span>{prog?.xp_into_level ?? 0}/{prog?.xp_for_next ?? 100} XP</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700" style={{ width: `${xpPct}%` }} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Flame className={`w-5 h-5 ${overview?.streak.current ? 'text-orange-400' : 'text-slate-600'}`} />
            <span className="font-semibold text-white">{overview?.streak.current ?? 0}</span>
            <span className="text-slate-500 text-xs">day streak</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span className="text-white font-semibold">{overview?.stats.lessons_completed ?? 0}</span> lessons
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-400">
            <RotateCcw className="w-4 h-4 text-blue-400" />
            <span className="text-white font-semibold">{overview?.stats.flashcards_reviewed ?? 0}</span> flashcard sets
          </div>
          <div className="ml-auto">
            <button onClick={() => setView('tutor')} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-all">
              <MessageCircle className="w-4 h-4 text-orange-400" /> Ask the tutor
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-rose-500/10 border-b border-rose-500/30 text-rose-300 text-xs">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</span>
            <button onClick={() => setError(null)} className="hover:text-rose-100 font-semibold">Dismiss</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {view === 'dashboard' && (
            <Dashboard
              overview={overview}
              loading={loadingOverview}
              topic={topic} setTopic={setTopic}
              subject={subject} setSubject={setSubject}
              level={level} setLevel={setLevel}
              sourceDocId={sourceDocId} setSourceDocId={setSourceDocId}
              onUpload={uploadAndLearn} uploadStatus={uploadStatus} uploadName={uploadName}
              onStart={() => startLesson(topic, level, subject, sourceDocId)}
              onResume={(t) => { setTopic(t.topic); setSubject(t.subject); setLevel((t.level as Level) || 'beginner'); setSourceDocId(t.source_document_id || ''); startLesson(t.topic, (t.level as Level) || 'beginner', t.subject, t.source_document_id || ''); }}
            />
          )}

          {view === 'lesson' && (
            <LessonView
              loading={loadingLesson}
              lesson={lesson}
              topic={lessonTopic}
              onFlashcards={loadFlashcards}
              onQuiz={startQuiz}
              onTutor={() => setView('tutor')}
              onNext={(t) => { setTopic(t); startLesson(t, level, subject, sourceDocId); }}
              onBack={() => setView('dashboard')}
              quizLoading={quizLoading}
            />
          )}

          {view === 'schedule' && (
            <StudyPlanner
              userId={user.id}
              onStudy={(t, lvl) => { setTopic(t); setLevel(lvl); startLesson(t, lvl, subject, sourceDocId); }}
            />
          )}

          {view === 'tutor' && (
            <TutorChat
              msgs={chatMsgs} input={chatInput} setInput={setChatInput}
              sending={chatSending} onSend={sendChat} chatEnd={chatEnd}
              topic={lessonTopic}
            />
          )}
        </div>
      </div>

      {/* Flashcards overlay */}
      {(flashcards || loadingFc) && (
        <FlashcardOverlay
          loading={loadingFc}
          cards={flashcards || []}
          index={fcIndex} flipped={fcFlipped}
          onFlip={() => setFcFlipped(f => !f)}
          onPrev={() => { setFcIndex(i => Math.max(0, i - 1)); setFcFlipped(false); }}
          onNext={() => { setFcIndex(i => Math.min((flashcards?.length || 1) - 1, i + 1)); setFcFlipped(false); }}
          onClose={() => { setFlashcards(null); }}
        />
      )}

      {/* Quiz overlay */}
      {(quiz || quizLoading) && (
        <QuizGame
          loading={quizLoading}
          quiz={quiz}
          qIndex={quizQ}
          selected={quizSelected}
          result={quizResult}
          correct={quizCorrect}
          done={quizDone}
          onAnswer={answerQuiz}
          onTimeout={timeoutQuiz}
          onNext={nextQuiz}
          onClose={closeQuiz}
        />
      )}
    </WorkspaceLayout>
  );
}

/* ------------------------------- Dashboard ------------------------------- */
function Dashboard(props: {
  overview: Overview | null; loading: boolean;
  topic: string; setTopic: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  level: Level; setLevel: (v: Level) => void;
  sourceDocId: string; setSourceDocId: (v: string) => void;
  onUpload: (file: File) => void;
  uploadStatus: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  uploadName: string;
  onStart: () => void; onResume: (t: TopicRow) => void;
}) {
  const { overview, loading, topic, setTopic, subject, setSubject, level, setLevel, sourceDocId, setSourceDocId, onUpload, uploadStatus, uploadName, onStart, onResume } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Hero launcher */}
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-slate-900 to-slate-900 p-8">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-orange-300 text-sm font-medium mb-1">
            <Sparkles className="w-4 h-4" /> {greeting}
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">What do you want to learn today?</h1>
          <p className="text-slate-400 text-sm mb-6">Type any topic and your AI tutor will teach it — step by step, at your level.</p>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onStart(); }}
              placeholder="e.g. Binary Search Trees, Photosynthesis, Neural Networks…"
              className="flex-1 bg-slate-950/70 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={onStart}
              disabled={!topic.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20 transition-all"
            >
              <Wand2 className="w-5 h-5" /> Teach me
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {LEVELS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setLevel(l.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    level === l.id ? 'bg-orange-500 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={l.blurb}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="w-40 bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            {overview && overview.documents.length > 0 && (
              <select
                value={sourceDocId}
                onChange={e => setSourceDocId(e.target.value)}
                className="bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">📚 General knowledge</option>
                {overview.documents.map(d => <option key={d.id} value={d.id}>From: {d.title}</option>)}
              </select>
            )}

            {/* Upload a PDF / PPT / DOCX to learn from it directly */}
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".pdf,.pptx,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
              className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-700 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 disabled:opacity-60 transition-all"
              title="Upload a PDF, PPT, DOCX or text file and learn from it"
            >
              {uploadStatus === 'uploading' || uploadStatus === 'processing'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" /> {uploadStatus === 'uploading' ? 'Uploading…' : 'Reading file…'}</>
                : <><Upload className="w-3.5 h-3.5 text-orange-400" /> Upload PPT / PDF</>}
            </button>
            {uploadStatus === 'done' && (
              <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Ready — learning from “{uploadName}”</span>
            )}
          </div>
          {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
            <p className="text-[11px] text-slate-500 mt-2">Processing “{uploadName}” — this takes a few seconds, then it'll be selected as your source.</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-orange-500 animate-spin" /></div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Flame} color="from-orange-500 to-red-500" label="Day Streak" value={overview?.streak.current ?? 0} sub={`Best: ${overview?.streak.longest ?? 0}`} />
            <StatCard icon={Zap} color="from-amber-400 to-orange-500" label="Total XP" value={overview?.progress.total_xp ?? 0} sub={`Level ${overview?.progress.level ?? 1}`} />
            <StatCard icon={BookOpen} color="from-emerald-500 to-teal-500" label="Lessons" value={overview?.stats.lessons_completed ?? 0} sub={`${overview?.stats.topics_started ?? 0} topics`} />
            <StatCard icon={Trophy} color="from-violet-500 to-fuchsia-500" label="Flashcard Sets" value={overview?.stats.flashcards_reviewed ?? 0} sub="Keep it up!" />
          </div>

          {/* Continue learning */}
          {overview && overview.continue_learning.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><Play className="w-5 h-5 text-orange-400" /> Continue learning</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overview.continue_learning.map(t => (
                  <button key={t.id} onClick={() => onResume(t)}
                    className="group text-left p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-orange-500/40 hover:bg-slate-800/60 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-orange-300 capitalize">{t.level}</span>
                      <span className="text-[10px] text-slate-500">{t.subject}</span>
                    </div>
                    <h3 className="font-semibold text-white group-hover:text-orange-300 transition-colors">{t.topic}</h3>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1 text-xs text-amber-400"><Zap className="w-3.5 h-3.5" /> {t.xp} XP</div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-orange-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {overview && overview.recommendations.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><Target className="w-5 h-5 text-rose-400" /> Recommended for you</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {overview.recommendations.map((r, i) => (
                  <button key={i} onClick={() => { setTopic(r.topic); setSubject(r.subject); onStart(); }}
                    className="text-left p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 transition-all">
                    <Star className="w-4 h-4 text-rose-400 mb-2" />
                    <h3 className="font-semibold text-white text-sm">{r.topic}</h3>
                    <p className="text-xs text-slate-500 mt-1">{r.reason}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(!overview || (overview.continue_learning.length === 0 && overview.recommendations.length === 0)) && (
            <div className="text-center py-10 text-slate-500">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Your journey starts with your first lesson. Type a topic above and hit <span className="text-orange-400 font-medium">Teach me</span>.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, sub }: { icon: typeof Flame; color: string; label: string; value: number | string; sub: string }) {
  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-3 shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

/* ------------------------------- Lesson ------------------------------- */
function LessonView(props: {
  loading: boolean; lesson: Lesson | null; topic: string;
  onFlashcards: () => void; onQuiz: () => void; onTutor: () => void;
  onNext: (t: string) => void; onBack: () => void; quizLoading: boolean;
}) {
  const { loading, lesson, topic, onFlashcards, onQuiz, onTutor, onNext, onBack, quizLoading } = props;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 flex flex-col items-center justify-center h-full text-center">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-orange-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
          <GraduationCap className="w-8 h-8 text-orange-400 absolute inset-0 m-auto" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Crafting your lesson on “{topic}”…</h2>
        <p className="text-sm text-slate-400 max-w-sm">Your tutor is structuring the concepts, examples and analogies just for you. This usually takes a few moments.</p>
      </div>
    );
  }
  if (!lesson) return null;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">← Back to dashboard</button>

      <div className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-slate-900 p-7">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 capitalize">{lesson.level}</span>
          {lesson.grounded && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><FileText className="w-3 h-3" /> From your document</span>}
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{lesson.title}</h1>
        <p className="text-slate-300 leading-relaxed">{lesson.introduction}</p>
      </div>

      {lesson.diagram && lesson.diagram.nodes && lesson.diagram.nodes.length > 0 && (
        <LessonDiagram diagram={lesson.diagram} />
      )}

      {lesson.concepts.map((c, i) => (
        <div key={i} className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-300 text-xs flex items-center justify-center font-bold">{i + 1}</span>
            {c.heading}
          </h3>
          <p className="text-slate-300 leading-relaxed">{c.explanation}</p>
          {c.analogy && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-200/90"><span className="font-semibold">Think of it like:</span> {c.analogy}</p>
            </div>
          )}
        </div>
      ))}

      {lesson.worked_example && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-400" /> Worked example</h3>
          <RichMarkdown content={lesson.worked_example} accent="blue" />
        </div>
      )}

      {lesson.key_takeaways.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-400" /> Key takeaways</h3>
          <ul className="space-y-2">
            {lesson.key_takeaways.map((k, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300"><CheckCircle className="w-4 h-4 text-emerald-400 mt-1 shrink-0" /><span>{k}</span></li>
            ))}
          </ul>
        </div>
      )}

      {lesson.common_mistakes.length > 0 && (
        <div className="rounded-2xl bg-rose-500/5 border border-rose-500/20 p-6">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-400" /> Common mistakes</h3>
          <ul className="space-y-2">
            {lesson.common_mistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300"><XCircle className="w-4 h-4 text-rose-400 mt-1 shrink-0" /><span>{m}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-slate-950/90 backdrop-blur border-t border-slate-800 flex flex-wrap gap-3">
        <button onClick={onFlashcards} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all">
          <RotateCcw className="w-4 h-4" /> Flashcards
        </button>
        <button onClick={onQuiz} disabled={quizLoading} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all">
          {quizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />} Quiz me
        </button>
        <button onClick={onTutor} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-all">
          <MessageCircle className="w-4 h-4 text-orange-400" /> Ask the tutor
        </button>
        {lesson.next_topics.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Up next:</span>
            {lesson.next_topics.slice(0, 2).map((t, i) => (
              <button key={i} onClick={() => onNext(t)} className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-orange-500/20 border border-slate-700 hover:border-orange-500/40 text-slate-200 rounded-xl text-xs transition-all">
                {t} <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Tutor chat ------------------------------- */
function TutorChat(props: {
  msgs: { role: 'user' | 'assistant'; content: string }[];
  input: string; setInput: (v: string) => void;
  sending: boolean; onSend: (t?: string) => void;
  chatEnd: React.RefObject<HTMLDivElement>; topic: string;
}) {
  const { msgs, input, setInput, sending, onSend, chatEnd, topic } = props;
  const suggestions = ['Explain this more simply', 'Give me another example', 'Why does this matter?', 'Quiz me on this'];
  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Your personal AI tutor</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-sm">Ask anything{topic ? <> about <span className="text-orange-300">{topic}</span></> : ''} — or any subject. I'll explain, give examples, and check your understanding.</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {suggestions.map(s => (
                <button key={s} onClick={() => onSend(s)} className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500/40 text-xs text-slate-300 text-left transition-all">{s}</button>
              ))}
            </div>
          </div>
        ) : msgs.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white shrink-0"><Brain className="w-4 h-4" /></div>}
            <div className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${m.role === 'user' ? 'bg-orange-600 text-white whitespace-pre-wrap' : 'bg-slate-900 border border-slate-800 text-slate-200'}`}>
              {m.role === 'assistant' ? <RichMarkdown content={m.content} accent="orange" /> : m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white shrink-0"><Brain className="w-4 h-4" /></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</div>
          </div>
        )}
        <div ref={chatEnd} />
      </div>
      <div className="p-4 border-t border-slate-800 bg-slate-950/70">
        <form onSubmit={e => { e.preventDefault(); onSend(); }} className="flex gap-2 max-w-3xl mx-auto">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask your tutor anything…" disabled={sending}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <button type="submit" disabled={sending || !input.trim()} className="px-5 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center gap-2 transition-all"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------- Flashcards ------------------------------- */
function FlashcardOverlay(props: {
  loading: boolean; cards: Flashcard[]; index: number; flipped: boolean;
  onFlip: () => void; onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  const { loading, cards, index, flipped, onFlip, onPrev, onNext, onClose } = props;
  const card = cards[index];
  return (
    <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold flex items-center gap-2"><RotateCcw className="w-5 h-5 text-violet-400" /> Flashcards</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {loading ? (
          <div className="h-64 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Building your flashcards…</p>
          </div>
        ) : card ? (
          <>
            <div className="text-center text-xs text-slate-500 mb-2">Card {index + 1} of {cards.length}</div>
            <button onClick={onFlip}
              className="w-full min-h-[260px] rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all shadow-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:shadow-2xl">
              <p className="text-white/70 text-xs mb-3 uppercase tracking-wider">{flipped ? 'Answer' : 'Question'}</p>
              <p className="text-white text-xl font-medium">{flipped ? card.back : card.front}</p>
              {!flipped && <p className="text-white/60 text-xs mt-4">Tap to reveal</p>}
            </button>
            <div className="flex justify-between mt-5">
              <button onClick={onPrev} disabled={index === 0} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl text-sm font-medium">Previous</button>
              <button onClick={onNext} disabled={index === cards.length - 1} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium">Next</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

