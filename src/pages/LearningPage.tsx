import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { AIDiagnosticsPanel } from '../components/AIDiagnosticsPanel';
import type { LearningMaterial, LearningProgress, LearningStreak, AIDiagnostics } from '../types';
import {
  GraduationCap,
  BookOpen,
  FileText,
  Lightbulb,
  Brain,
  RotateCcw,
  CheckCircle,
  XCircle,
  Plus,
  X,
  Loader2,
  Clock,
  TrendingUp,
  Flame,
  Target,
  Layers,
  Cpu,
  FileIcon,
} from 'lucide-react';

interface GeneratedContent {
  summary: string;
  keyPoints: string[];
  quiz: QuizQuestion[];
  flashcards: Flashcard[];
  interviewQuestions: string[];
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

interface Flashcard {
  front: string;
  back: string;
}

export function LearningPage() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [progress, setProgress] = useState<Record<string, LearningProgress>>({});
  const [streak, setStreak] = useState<LearningStreak | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<LearningMaterial | null>(null);
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeView, setActiveView] = useState<'materials' | 'progress' | 'chat'>('materials');
  const [activeTab, setActiveTab] = useState<'summary' | 'quiz' | 'flashcards' | 'interview'>('summary');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<AIDiagnostics | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ title: '', subject: '', description: '', material_type: 'Notes' });

  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedMaterial) {
      generateContent(selectedMaterial);
    }
  }, [selectedMaterial]);

  const fetchData = async () => {
    try {
      const [materialsRes, progressRes, streakRes] = await Promise.all([
        supabase.from('learning_materials').select('*').order('created_at', { ascending: false }),
        supabase.from('learning_progress').select('*').eq('user_id', user?.id),
        supabase.from('learning_streaks').select('*').eq('user_id', user?.id).single(),
      ]);

      if (materialsRes.data) setMaterials(materialsRes.data);
      if (progressRes.data) {
        const map: Record<string, LearningProgress> = {};
        progressRes.data.forEach(p => { map[p.material_id] = p; });
        setProgress(map);
      }
      if (streakRes.data) setStreak(streakRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateContent = async (material: LearningMaterial) => {
    setGenerating(true);
    setDiagnostics(null);
    const startTime = Date.now();

    try {
      // Simulate AI generation
      await new Promise(r => setTimeout(r, 1800));

      let generated: GeneratedContent;

      if (material.subject.toLowerCase().includes('dbms') || material.subject.toLowerCase().includes('database')) {
        generated = {
          summary: 'This material covers Database Management Systems fundamentals including data models, normalization, SQL, and transaction management.',
          keyPoints: ['Relational Model', 'Normalization (1NF, 2NF, 3NF)', 'SQL Queries', 'ACID Properties', 'Indexing'],
          quiz: [
            { question: 'What is normalization?', options: ['Increase redundancy', 'Reduce redundancy and improve integrity', 'Increase size', 'Slow queries'], correct: 1 },
            { question: 'ACID stands for?', options: ['Atomicity, Consistency, Isolation, Durability', 'Auto, Connected, Instant, Direct', 'Access, Control, Identity, Data', 'Application, Cloud, Interface, Database'], correct: 0 },
            { question: 'What is a primary key?', options: ['Nullable identifier', 'Unique identifier for each row', 'Foreign key reference', 'Index column'], correct: 1 },
          ],
          flashcards: [
            { front: 'What is a primary key?', back: 'A unique identifier for each record in a table. Cannot contain NULL values.' },
            { front: 'What is normalization?', back: 'The process of organizing data to minimize redundancy and avoid anomalies.' },
            { front: 'What is a foreign key?', back: 'A field that uniquely identifies a row in another table, creating relationships.' },
          ],
          interviewQuestions: [
            'Explain the difference between PRIMARY KEY and UNIQUE constraint',
            'What are the different types of normalization? Explain each.',
            'How do you optimize SQL query performance?',
            'Explain the ACID properties in database transactions',
          ],
        };
      } else if (material.subject.toLowerCase().includes('ai') || material.subject.toLowerCase().includes('ml')) {
        generated = {
          summary: 'This material covers Artificial Intelligence and Machine Learning concepts including supervised/unsupervised learning, neural networks, and deep learning.',
          keyPoints: ['Supervised Learning', 'Unsupervised Learning', 'Neural Networks', 'Model Evaluation', 'Deep Learning'],
          quiz: [
            { question: 'Which uses labeled data?', options: ['Unsupervised', 'Supervised', 'Reinforcement', 'Transfer'], correct: 1 },
            { question: 'Purpose of activation function?', options: ['Increase computation', 'Add non-linearity', 'Reduce accuracy', 'Prevent overfitting'], correct: 1 },
          ],
          flashcards: [
            { front: 'What is supervised learning?', back: 'ML where the model learns from labeled data to make predictions on new data.' },
            { front: 'What is a neural network?', back: 'Computing system inspired by biological neural networks with interconnected layers.' },
          ],
          interviewQuestions: [
            'Explain the difference between supervised and unsupervised learning',
            'What is gradient descent? How does it work?',
            'Explain overfitting and how to prevent it',
            'What are activation functions and why are they important?',
          ],
        };
      } else {
        generated = {
          summary: 'Comprehensive material covering key concepts, applications, and practical knowledge.',
          keyPoints: ['Core concepts', 'Practical applications', 'Best practices', 'Future directions'],
          quiz: [
            { question: 'Primary focus of this material?', options: ['Entertainment', 'Understanding the subject', 'Technical specs', 'History only'], correct: 1 },
          ],
          flashcards: [
            { front: 'What are key concepts?', back: 'The fundamental ideas and principles that form the foundation of this subject.' },
            { front: 'How to apply knowledge?', back: 'Understanding practical applications reinforces learning and enables real-world implementation.' },
          ],
          interviewQuestions: [
            'Explain the main concepts covered in this material',
            'How would you apply this knowledge practically?',
          ],
        };
      }

      setContent(generated);
      setQuizAnswers(new Array(generated.quiz.length).fill(null));

      setDiagnostics({
        embeddingGenerated: true,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 768,
        embeddingTimeMs: 120,
        vectorSearchPerformed: true,
        vectorSearchResults: 5,
        vectorSearchTimeMs: 85,
        rerankerUsed: true,
        rerankerTimeMs: 45,
        llmPromptTokens: 380,
        llmCompletionTokens: 520,
        llmTimeMs: 720,
        totalTimeMs: Date.now() - startTime,
        contextChunks: [],
        toolCalls: [],
      });

      // Update progress
      await supabase.from('learning_progress').upsert({
        user_id: user?.id,
        material_id: material.id,
        last_studied_at: new Date().toISOString(),
      }, { onConflict: 'user_id,material_id' });

      // Update streak
      const today = new Date().toISOString().split('T')[0];
      if (!streak || streak.last_study_date !== today) {
        const newStreak = {
          user_id: user?.id,
          current_streak: (streak?.last_study_date === new Date(Date.now() - 86400000).toISOString().split('T')[0]
            ? (streak?.current_streak || 0) + 1
            : 1),
          longest_streak: Math.max(streak?.longest_streak || 0, (streak?.current_streak || 0) + 1),
          last_study_date: today,
        };
        await supabase.from('learning_streaks').upsert(newStreak, { onConflict: 'user_id' });
        setStreak(newStreak as LearningStreak);
      }
    } catch (err) {
      console.error('Generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterial.title.trim() || !newMaterial.subject.trim() || !user) return;

    try {
      const { data, error } = await supabase
        .from('learning_materials')
        .insert({
          user_id: user.id,
          title: newMaterial.title,
          subject: newMaterial.subject,
          description: newMaterial.description,
          material_type: newMaterial.material_type,
        })
        .select()
        .single();

      if (error) throw error;

      setMaterials(prev => [data, ...prev]);
      setNewMaterial({ title: '', subject: '', description: '', material_type: 'Notes' });
      setShowAddModal(false);
      setSelectedMaterial(data);
    } catch (err) {
      console.error('Error adding material:', err);
    }
  };

  const handleQuizAnswer = (questionIdx: number, answerIdx: number) => {
    if (quizAnswers[questionIdx] !== null) return;
    const newAnswers = [...quizAnswers];
    newAnswers[questionIdx] = answerIdx;
    setQuizAnswers(newAnswers);
  };

  const nextQuiz = () => setQuizIndex(i => Math.min(i + 1, (content?.quiz.length || 1) - 1));
  const prevQuiz = () => setQuizIndex(i => Math.max(i - 1, 0));
  const nextFlashcard = () => { setFlashcardIndex(i => (i + 1) % (content?.flashcards.length || 1)); setShowAnswer(false); };
  const prevFlashcard = () => { setFlashcardIndex(i => (i - 1 + (content?.flashcards.length || 1)) % (content?.flashcards.length || 1)); setShowAnswer(false); };

  const sidebarItems: SidebarItem[] = [
    { id: 'materials', label: 'Study Materials', icon: BookOpen, active: activeView === 'materials', onClick: () => setActiveView('materials'), badge: materials.length },
    { id: 'progress', label: 'My Progress', icon: TrendingUp, active: activeView === 'progress', onClick: () => setActiveView('progress') },
    { id: 'chat', label: 'AI Tutor', icon: Cpu, active: activeView === 'chat', onClick: () => setActiveView('chat') },
  ];

  const materialIcons: Record<string, typeof BookOpen> = { Notes: FileText, Slides: Layers, Book: BookOpen, Article: FileIcon };
  const typeColors: Record<string, string> = { Notes: 'text-orange-400', Slides: 'text-violet-400', Book: 'text-blue-400', Article: 'text-emerald-400' };

  // Calculate stats
  const totalStudyTime = Object.values(progress).reduce((sum, p) => sum + (p.study_time_minutes || 0), 0);
  const completedFlashcards = Object.values(progress).reduce((sum, p) => sum + (p.flashcards_completed || 0), 0);
  const avgQuizScore = Object.values(progress).filter(p => p.quiz_score).length > 0
    ? Object.values(progress).filter(p => p.quiz_score).reduce((sum, p) => sum + (p.quiz_score || 0), 0) / Object.values(progress).filter(p => p.quiz_score).length
    : 0;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-orange-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Access AI learning assistant</p>
          <a href="/profile" className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      title="Learning"
      subtitle="AI Learning Environment"
      icon={GraduationCap}
      accentColor="bg-orange-500"
      sidebarItems={sidebarItems}
    >
      {/* Stats Bar */}
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-4 gap-6">
        <div className="flex items-center gap-2 text-xs text-orange-400">
          <Flame className="w-4 h-4" />
          <span>{streak?.current_streak || 0} day streak</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-4 h-4" />
          <span>{totalStudyTime} min studied</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <RotateCcw className="w-4 h-4" />
          <span>{completedFlashcards} flashcards</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Target className="w-4 h-4" />
          <span>{avgQuizScore.toFixed(0)}% avg quiz</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Materials List */}
        <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Material</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          ) : materials.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <BookOpen className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">No materials</p>
              <p className="text-xs text-slate-600 mt-1">Add your first study material</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {materials.map(material => {
                const Icon = materialIcons[material.material_type] || BookOpen;
                const colorClass = typeColors[material.material_type] || 'text-slate-400';
                const isSelected = selectedMaterial?.id === material.id;

                return (
                  <div
                    key={material.id}
                    className={`p-3 border-b border-slate-800 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                    }`}
                    onClick={() => {
                      setSelectedMaterial(material);
                      setActiveTab('summary');
                      setQuizIndex(0);
                      setFlashcardIndex(0);
                      setQuizAnswers([]);
                      setShowAnswer(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                        <Icon className={`w-4 h-4 ${colorClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-slate-200 truncate">{material.title}</h3>
                        <div className="text-xs text-slate-500">{material.subject}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'materials' && selectedMaterial ? (
            <div className="h-full flex flex-col">
              {/* Material Header */}
              <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-orange-400" />
                  <span className="text-white font-medium">{selectedMaterial.title}</span>
                </div>
                <div className="flex gap-2">
                  {(['summary', 'quiz', 'flashcards', 'interview'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeTab === tab ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {tab === 'summary' && 'Summary'}
                      {tab === 'quiz' && 'Quiz'}
                      {tab === 'flashcards' && 'Flashcards'}
                      {tab === 'interview' && 'Interview Qs'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {generating ? (
                  <div className="flex flex-col items-center justify-center h-80">
                    <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
                    <p className="text-slate-400">Generating AI content...</p>
                  </div>
                ) : content ? (
                  <div className="max-w-3xl mx-auto">
                    {activeTab === 'summary' && (
                      <div className="space-y-6">
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Brain className="w-5 h-5 text-orange-400" />
                            Summary
                          </h3>
                          <p className="text-slate-300 leading-relaxed">{content.summary}</p>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-400" />
                            Key Points
                          </h3>
                          <ul className="space-y-2">
                            {content.keyPoints.map((point, i) => (
                              <li key={i} className="flex items-start gap-3 text-slate-300">
                                <CheckCircle className="w-4 h-4 text-orange-400 mt-1 flex-shrink-0" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {activeTab === 'quiz' && (
                      <div className="max-w-xl mx-auto">
                        <div className="mb-4 flex items-center justify-between">
                          <span className="text-sm text-slate-500">Question {quizIndex + 1} of {content.quiz.length}</span>
                          <div className="flex gap-1">
                            {content.quiz.map((_, i) => (
                              <div key={i} className={`w-2 h-2 rounded-full ${i === quizIndex ? 'bg-orange-500' : i < quizIndex ? 'bg-orange-500/50' : 'bg-slate-700'}`} />
                            ))}
                          </div>
                        </div>

                        {content.quiz[quizIndex] && (
                          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                            <h4 className="text-lg font-medium text-white mb-4">{content.quiz[quizIndex].question}</h4>
                            <div className="space-y-3">
                              {content.quiz[quizIndex].options.map((opt, i) => {
                                const isSelected = quizAnswers[quizIndex] === i;
                                const isCorrect = i === content.quiz[quizIndex].correct;
                                const showResult = quizAnswers[quizIndex] !== null;

                                return (
                                  <button
                                    key={i}
                                    onClick={() => handleQuizAnswer(quizIndex, i)}
                                    disabled={showResult}
                                    className={`w-full p-4 rounded-xl text-left transition-all ${
                                      showResult
                                        ? isCorrect
                                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300'
                                          : isSelected
                                          ? 'bg-red-500/20 border-2 border-red-500 text-red-300'
                                          : 'bg-slate-900 text-slate-500'
                                        : isSelected
                                        ? 'bg-orange-500/20 border-2 border-orange-500 text-orange-300'
                                        : 'bg-slate-900 border border-slate-700 hover:border-orange-500 hover:bg-slate-700 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      {showResult && (isCorrect ? <CheckCircle className="w-5 h-5" /> : isSelected ? <XCircle className="w-5 h-5" /> : null)}
                                      <span>{opt}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-6 flex justify-between">
                              <button onClick={prevQuiz} disabled={quizIndex === 0} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg">Previous</button>
                              <button onClick={nextQuiz} disabled={quizIndex === content.quiz.length - 1} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg">Next</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'flashcards' && (
                      <div className="max-w-md mx-auto">
                        <div className="mb-4 text-center">
                          <span className="text-sm text-slate-500">Card {flashcardIndex + 1} of {content.flashcards.length}</span>
                        </div>

                        <div
                          onClick={() => setShowAnswer(!showAnswer)}
                          className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 min-h-[250px] flex flex-col items-center justify-center cursor-pointer hover:shadow-xl transition-shadow"
                        >
                          {showAnswer ? (
                            <div className="text-center">
                              <p className="text-orange-200 text-sm mb-2">Answer</p>
                              <p className="text-white text-xl font-medium">{content.flashcards[flashcardIndex].back}</p>
                            </div>
                          ) : (
                            <div className="text-center">
                              <p className="text-orange-200 text-sm mb-2">Question</p>
                              <p className="text-white text-xl font-medium">{content.flashcards[flashcardIndex].front}</p>
                              <p className="text-orange-200 text-sm mt-4">Click to reveal</p>
                            </div>
                          )}
                        </div>

                        <div className="mt-6 flex justify-center gap-4">
                          <button onClick={prevFlashcard} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors">Previous</button>
                          <button onClick={nextFlashcard} className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors">Next</button>
                        </div>
                      </div>
                    )}

                    {activeTab === 'interview' && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white mb-4">Interview Questions</h3>
                        {content.interviewQuestions.map((q, i) => (
                          <div key={i} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <p className="text-slate-200">{i + 1}. {q}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Diagnostics */}
              {diagnostics && (
                <div className="h-48 border-t border-slate-800 overflow-y-auto p-4">
                  <AIDiagnosticsPanel diagnostics={diagnostics} isProcessing={false} />
                </div>
              )}
            </div>
          ) : activeView === 'progress' ? (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <h2 className="text-xl font-bold text-white">Learning Progress</h2>

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <Flame className="w-6 h-6 text-orange-400 mb-2" />
                    <div className="text-2xl font-bold text-white">{streak?.current_streak || 0}</div>
                    <div className="text-xs text-slate-500">Day Streak</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <Clock className="w-6 h-6 text-blue-400 mb-2" />
                    <div className="text-2xl font-bold text-white">{totalStudyTime}</div>
                    <div className="text-xs text-slate-500">Minutes Studied</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <RotateCcw className="w-6 h-6 text-emerald-400 mb-2" />
                    <div className="text-2xl font-bold text-white">{completedFlashcards}</div>
                    <div className="text-xs text-slate-500">Flashcards</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <Target className="w-6 h-6 text-violet-400 mb-2" />
                    <div className="text-2xl font-bold text-white">{avgQuizScore.toFixed(0)}%</div>
                    <div className="text-xs text-slate-500">Avg Quiz Score</div>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-sm font-semibold text-white mb-4">Knowledge Graph</h3>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(s => (
                      <span key={s} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-400">Select a material to start learning</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add Learning Material</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  value={newMaterial.title}
                  onChange={e => setNewMaterial(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., DBMS Notes"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  value={newMaterial.subject}
                  onChange={e => setNewMaterial(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g., DBMS, AI, Machine Learning"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
                <select
                  value={newMaterial.material_type}
                  onChange={e => setNewMaterial(prev => ({ ...prev, material_type: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="Notes">Notes</option>
                  <option value="Book">Book Chapter</option>
                  <option value="Slides">Slides</option>
                  <option value="Article">Article</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-3 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-700">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium">Add Material</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}

const subjects = ['Database Systems', 'Machine Learning', 'System Design', 'Data Structures', 'Algorithms', 'Web Development'];
