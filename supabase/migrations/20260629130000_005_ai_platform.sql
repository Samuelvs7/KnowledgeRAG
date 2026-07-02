-- AI Platform Refactor: Memory and Hybrid Retrieval

-- Generic AI Memory
CREATE TABLE ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_type TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  citations_json JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hybrid Search Setup
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON document_chunks USING GIN (fts);

-- Row Level Security
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_sessions" ON ai_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_sessions" ON ai_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_sessions" ON ai_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_sessions" ON ai_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "select_session_messages" ON ai_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ai_sessions WHERE ai_sessions.id = ai_messages.session_id AND ai_sessions.user_id = auth.uid())
  );
CREATE POLICY "insert_session_messages" ON ai_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ai_sessions WHERE ai_sessions.id = ai_messages.session_id AND ai_sessions.user_id = auth.uid())
  );

-- Hybrid Match RPC (Reciprocal Rank Fusion)
CREATE OR REPLACE FUNCTION match_documents_hybrid(
  query_text TEXT,
  query_embedding vector(768),
  p_user_id UUID,
  p_document_id UUID DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  match_count INT DEFAULT 20,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  document_title TEXT,
  collection_id UUID,
  collection_name TEXT,
  score FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
WITH semantic_search AS (
  SELECT
    dc.id,
    RANK() OVER (ORDER BY dc.embedding <=> query_embedding) as rank,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.title as document_title,
    cd.collection_id,
    c.name as collection_name
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN collection_documents cd ON cd.document_id = dc.document_id
  LEFT JOIN document_collections c ON c.id = cd.collection_id
  WHERE d.user_id = p_user_id
    AND dc.embedding IS NOT NULL
    AND (p_document_id IS NULL OR dc.document_id = p_document_id)
    AND (p_collection_id IS NULL OR cd.collection_id = p_collection_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count * 2
),
keyword_search AS (
  SELECT
    dc.id,
    RANK() OVER (ORDER BY ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) DESC) as rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN collection_documents cd ON cd.document_id = dc.document_id
  WHERE d.user_id = p_user_id
    AND (p_document_id IS NULL OR dc.document_id = p_document_id)
    AND (p_collection_id IS NULL OR cd.collection_id = p_collection_id)
    AND dc.fts @@ websearch_to_tsquery('english', query_text)
  ORDER BY ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) DESC
  LIMIT match_count * 2
)
SELECT
  dc.id,
  dc.document_id,
  dc.content,
  dc.chunk_index,
  dc.metadata,
  COALESCE(ss.document_title, d.title) as document_title,
  ss.collection_id,
  ss.collection_name,
  (COALESCE(1.0 / (rrf_k + ss.rank), 0.0) + COALESCE(1.0 / (rrf_k + ks.rank), 0.0))::float as score
FROM document_chunks dc
LEFT JOIN semantic_search ss ON ss.id = dc.id
LEFT JOIN keyword_search ks ON ks.id = dc.id
JOIN documents d ON d.id = dc.document_id
WHERE ss.id IS NOT NULL OR ks.id IS NOT NULL
ORDER BY score DESC
LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_documents_hybrid FROM PUBLIC;
REVOKE ALL ON FUNCTION match_documents_hybrid FROM anon;
REVOKE ALL ON FUNCTION match_documents_hybrid FROM authenticated;
GRANT EXECUTE ON FUNCTION match_documents_hybrid TO service_role;
