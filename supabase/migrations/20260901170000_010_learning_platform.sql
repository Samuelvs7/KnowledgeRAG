-- Migration: 010_learning_platform.sql
-- Purpose: Backbone for the AI Tutor learning platform. Tracks each topic a learner
-- is studying, their XP/progress on it, and caches the most recent generated lesson
-- so revisiting a topic is instant. Quizzes/mastery reuse the 008 quiz tables;
-- streaks reuse learning_streaks.

CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General',
  topic TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  lessons_completed INTEGER NOT NULL DEFAULT 0,
  flashcards_reviewed INTEGER NOT NULL DEFAULT 0,
  quizzes_taken INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  last_lesson JSONB,
  last_studied_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_learning_topics_user_recent
  ON learning_topics(user_id, last_studied_at DESC);

ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_learning_topics" ON learning_topics;
CREATE POLICY "select_own_learning_topics" ON learning_topics FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_learning_topics" ON learning_topics;
CREATE POLICY "insert_own_learning_topics" ON learning_topics FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_learning_topics" ON learning_topics;
CREATE POLICY "update_own_learning_topics" ON learning_topics FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_learning_topics" ON learning_topics;
CREATE POLICY "delete_own_learning_topics" ON learning_topics FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
