-- Quiz & Learning Progression System (Phase 1: Foundation + Core Quiz + Intelligence)

CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  mode TEXT NOT NULL DEFAULT 'practice' CHECK (mode IN ('practice', 'assessment', 'exam', 'adaptive')),
  source TEXT NOT NULL CHECK (source IN ('lernify_knowledge', 'my_documents', 'specific_document', 'ai_generated', 'mistakes')),
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  hint TEXT,
  topic TEXT NOT NULL,
  subject TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  source_excerpt TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  score DECIMAL(5,2),
  accuracy DECIMAL(5,2),
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE NOT NULL,
  selected_answer TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  is_unknown BOOLEAN NOT NULL DEFAULT false,
  used_hint BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE topic_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  mastery_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  questions_attempted INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject, topic)
);

CREATE TABLE mistake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE NOT NULL,
  attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'practicing', 'mastered')),
  review_count INTEGER NOT NULL DEFAULT 0,
  mastered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_started ON quiz_attempts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt ON quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_user ON topic_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_mistake_items_user_status ON mistake_items(user_id, status);

-- Row Level Security
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_quizzes" ON quizzes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_quizzes" ON quizzes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_quizzes" ON quizzes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_quizzes" ON quizzes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "select_own_quiz_questions" ON quiz_questions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_questions.quiz_id AND quizzes.user_id = auth.uid())
  );

CREATE POLICY "select_own_quiz_attempts" ON quiz_attempts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_quiz_attempts" ON quiz_attempts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_quiz_attempts" ON quiz_attempts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_quiz_answers" ON quiz_answers FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quiz_attempts WHERE quiz_attempts.id = quiz_answers.attempt_id AND quiz_attempts.user_id = auth.uid())
  );
CREATE POLICY "insert_own_quiz_answers" ON quiz_answers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM quiz_attempts WHERE quiz_attempts.id = quiz_answers.attempt_id AND quiz_attempts.user_id = auth.uid())
  );
CREATE POLICY "update_own_quiz_answers" ON quiz_answers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM quiz_attempts WHERE quiz_attempts.id = quiz_answers.attempt_id AND quiz_attempts.user_id = auth.uid())
  );

CREATE POLICY "select_own_topic_mastery" ON topic_mastery FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_topic_mastery" ON topic_mastery FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_topic_mastery" ON topic_mastery FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_mistake_items" ON mistake_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_mistake_items" ON mistake_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_mistake_items" ON mistake_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
