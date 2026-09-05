import { useState } from 'react';
import { Loader2, FileText, BookOpen, ArrowLeft } from 'lucide-react';
import type { Document } from '../../../types';

interface QuizSetupProps {
  documents: Document[];
  initialSubject?: string;
  initialTopic?: string;
  onCancel: () => void;
  onStart: (config: {
    subject: string;
    topic: string;
    difficulty: string;
    question_count: number;
    source: string;
    document_id?: string;
  }) => Promise<void>;
}

const QUESTION_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export function QuizSetup({ documents, initialSubject, initialTopic, onCancel, onStart }: QuizSetupProps) {
  const [mode, setMode] = useState<'topic' | 'document'>('topic');
  const [subject, setSubject] = useState(initialSubject || '');
  const [topic, setTopic] = useState(initialTopic || '');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [documentId, setDocumentId] = useState<string>(documents[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocument = documents.find((d) => d.id === documentId);
  const canSubmit = mode === 'topic' ? subject.trim() && topic.trim() : !!documentId;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'document' && selectedDocument) {
        await onStart({
          subject: 'My Documents',
          topic: topic.trim() || selectedDocument.title,
          difficulty,
          question_count: questionCount,
          source: 'specific_document',
          document_id: selectedDocument.id,
        });
      } else {
        await onStart({
          subject: subject.trim(),
          topic: topic.trim(),
          difficulty,
          question_count: questionCount,
          source: 'lernify_knowledge',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full space-y-6">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div>
        <h2 className="text-xl font-bold text-white mb-1">Set up your quiz</h2>
        <p className="text-sm text-slate-500">Choose what to study and how you want to be tested.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('topic')}
          className={`rounded-xl border p-4 text-left transition-all ${
            mode === 'topic' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
          }`}
        >
          <BookOpen className={`w-5 h-5 mb-2 ${mode === 'topic' ? 'text-amber-400' : 'text-slate-500'}`} />
          <div className="text-sm font-medium text-white">By Topic</div>
          <div className="text-xs text-slate-500 mt-0.5">Pick a subject and topic to be quizzed on</div>
        </button>
        <button
          onClick={() => setMode('document')}
          disabled={documents.length === 0}
          className={`rounded-xl border p-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === 'document' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
          }`}
        >
          <FileText className={`w-5 h-5 mb-2 ${mode === 'document' ? 'text-amber-400' : 'text-slate-500'}`} />
          <div className="text-sm font-medium text-white">From a Document</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {documents.length === 0 ? 'Upload a document first' : 'Generate questions grounded in your document'}
          </div>
        </button>
      </div>

      {mode === 'topic' ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Computer Science"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Neural Networks"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Document</label>
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Focus topic (optional)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={selectedDocument?.title || 'Leave blank to cover the whole document'}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Difficulty</label>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`flex-1 py-2 rounded-lg text-sm border transition-all ${
                difficulty === d.value
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Question Count</label>
        <div className="flex gap-2">
          {QUESTION_COUNTS.map((count) => (
            <button
              key={count}
              onClick={() => setQuestionCount(count)}
              className={`flex-1 py-2 rounded-lg text-sm border transition-all ${
                questionCount === count
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing your quiz...
          </>
        ) : (
          'Start Quiz'
        )}
      </button>
    </div>
  );
}
