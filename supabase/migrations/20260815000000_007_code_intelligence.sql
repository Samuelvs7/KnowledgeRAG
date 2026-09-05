-- Migration: 007_code_intelligence.sql
-- Purpose: Schema updates for Repository Intelligence platform, including ingestion status tracking,
-- chunk staging, FTS search, content hash tracking, and strictly-scoped code match RPC.

-- 1. Ingestion status tracking for repositories
CREATE TABLE IF NOT EXISTS repository_ingestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'parsing', 'chunking', 'embedding', 'vectorizing', 'ready', 'failed')),
  progress INTEGER DEFAULT 0,
  stage_message TEXT,
  file_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on repository_ingestion
ALTER TABLE repository_ingestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_repository_ingestion ON repository_ingestion FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM repositories 
      WHERE repositories.id = repository_ingestion.repository_id 
        AND repositories.user_id = auth.uid()
    )
  );

CREATE POLICY insert_repository_ingestion ON repository_ingestion FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM repositories 
      WHERE repositories.id = repository_ingestion.repository_id 
        AND repositories.user_id = auth.uid()
    )
  );

CREATE POLICY update_repository_ingestion ON repository_ingestion FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM repositories 
      WHERE repositories.id = repository_ingestion.repository_id 
        AND repositories.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM repositories 
      WHERE repositories.id = repository_ingestion.repository_id 
        AND repositories.user_id = auth.uid()
    )
  );

-- 2. Code Chunk Staging Table (for atomic indexing)
CREATE TABLE IF NOT EXISTS code_chunk_staging (
  job_id UUID NOT NULL,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  chunk_index INTEGER NOT NULL,
  language TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, repository_id, file_path, chunk_index)
);

ALTER TABLE code_chunk_staging ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_code_chunk_staging_repo_job
  ON code_chunk_staging(repository_id, job_id);

-- 3. Enhance repository_files table
ALTER TABLE repository_files 
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS imports_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_binary BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_stored BOOLEAN DEFAULT true;

-- 4. Enhance code_symbols table
ALTER TABLE code_symbols
  ADD COLUMN IF NOT EXISTS parent_symbol TEXT,
  ADD COLUMN IF NOT EXISTS imports JSONB DEFAULT '[]'::jsonb;

-- 5. Enhance code_chunks table with FTS and Metadata
ALTER TABLE code_chunks
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_code_chunks_fts ON code_chunks USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_code_chunks_repo_id ON code_chunks(repository_id);

-- 6. Atomic Finalization Function for Code Chunks
CREATE OR REPLACE FUNCTION finalize_code_chunks(
  p_repository_id UUID,
  p_job_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM repositories WHERE id = p_repository_id) THEN
    RAISE EXCEPTION 'Repository % not found', p_repository_id;
  END IF;

  -- Delete old code chunks for this repository
  DELETE FROM code_chunks
  WHERE repository_id = p_repository_id;

  -- Insert staged chunks into production table
  INSERT INTO code_chunks (repository_id, file_path, file_name, content, embedding, chunk_index, language, metadata)
  SELECT repository_id, file_path, file_name, content, embedding, chunk_index, language, metadata
  FROM code_chunk_staging
  WHERE repository_id = p_repository_id
    AND job_id = p_job_id
  ORDER BY file_path, chunk_index;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Clean up staging
  DELETE FROM code_chunk_staging
  WHERE repository_id = p_repository_id
    AND job_id = p_job_id;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION finalize_code_chunks(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_code_chunks(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION finalize_code_chunks(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_code_chunks(UUID, UUID) TO service_role;

-- 7. Strictly-Scoped Code Vector Search Function
CREATE OR REPLACE FUNCTION match_code_scoped(
  query_embedding vector(768),
  p_user_id UUID,
  p_repository_id UUID,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  repository_id UUID,
  file_path TEXT,
  file_name TEXT,
  content TEXT,
  chunk_index INTEGER,
  language TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    cc.id,
    cc.repository_id,
    cc.file_path,
    cc.file_name,
    cc.content,
    cc.chunk_index,
    cc.language,
    cc.metadata,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM code_chunks cc
  JOIN repositories r ON r.id = cc.repository_id
  WHERE r.user_id = p_user_id
    AND cc.repository_id = p_repository_id
    AND cc.embedding IS NOT NULL
    AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_code_scoped(vector, UUID, UUID, FLOAT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION match_code_scoped(vector, UUID, UUID, FLOAT, INT) FROM anon;
REVOKE ALL ON FUNCTION match_code_scoped(vector, UUID, UUID, FLOAT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION match_code_scoped(vector, UUID, UUID, FLOAT, INT) TO service_role;
