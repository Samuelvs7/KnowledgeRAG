-- Production hardening for the KnowledgeRAG document pipeline.
-- This migration keeps the existing 768-dimensional pgvector schema and adds
-- service-role-only primitives for atomic indexing and scoped retrieval.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE document_ingestion
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_message TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_ingestion_status_check'
      AND conrelid = 'document_ingestion'::regclass
  ) THEN
    ALTER TABLE document_ingestion DROP CONSTRAINT document_ingestion_status_check;
  END IF;
END $$;

ALTER TABLE document_ingestion
  ADD CONSTRAINT document_ingestion_status_check
  CHECK (status IN ('pending', 'parsing', 'chunking', 'embedding', 'vectorizing', 'ready', 'failed'));

CREATE TABLE IF NOT EXISTS document_chunk_staging (
  job_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, document_id, chunk_index)
);

ALTER TABLE document_chunk_staging ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_document_chunk_staging_document_job
  ON document_chunk_staging(document_id, job_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_chunk
  ON document_chunks(document_id, chunk_index);

UPDATE storage.buckets
SET file_size_limit = 157286400
WHERE id = 'documents';

DROP POLICY IF EXISTS select_document_ingestion ON document_ingestion;
DROP POLICY IF EXISTS insert_document_ingestion ON document_ingestion;
DROP POLICY IF EXISTS update_document_ingestion ON document_ingestion;

CREATE POLICY select_document_ingestion ON document_ingestion FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM documents
      WHERE documents.id = document_ingestion.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY insert_document_ingestion ON document_ingestion FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM documents
      WHERE documents.id = document_ingestion.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY update_document_ingestion ON document_ingestion FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM documents
      WHERE documents.id = document_ingestion.document_id
        AND documents.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM documents
      WHERE documents.id = document_ingestion.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION finalize_document_chunks(
  p_document_id UUID,
  p_job_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_document_id) THEN
    RAISE EXCEPTION 'Document % not found', p_document_id;
  END IF;

  DELETE FROM document_chunks
  WHERE document_id = p_document_id;

  INSERT INTO document_chunks (document_id, content, embedding, chunk_index, metadata)
  SELECT document_id, content, embedding, chunk_index, metadata
  FROM document_chunk_staging
  WHERE document_id = p_document_id
    AND job_id = p_job_id
  ORDER BY chunk_index;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  DELETE FROM document_chunk_staging
  WHERE document_id = p_document_id
    AND job_id = p_job_id;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION finalize_document_chunks(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_document_chunks(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION finalize_document_chunks(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_document_chunks(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION match_documents_scoped(
  query_embedding vector(768),
  p_user_id UUID,
  p_document_id UUID DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 20
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
  similarity FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    d.title AS document_title,
    scoped_collection.id AS collection_id,
    scoped_collection.name AS collection_name,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d
    ON d.id = dc.document_id
  LEFT JOIN LATERAL (
    SELECT c.id, c.name
    FROM collection_documents cd
    JOIN document_collections c
      ON c.id = cd.collection_id
    WHERE cd.document_id = dc.document_id
      AND c.user_id = p_user_id
      AND (p_collection_id IS NULL OR c.id = p_collection_id)
    ORDER BY c.name
    LIMIT 1
  ) scoped_collection ON TRUE
  WHERE d.user_id = p_user_id
    AND dc.embedding IS NOT NULL
    AND (p_document_id IS NULL OR dc.document_id = p_document_id)
    AND (p_collection_id IS NULL OR scoped_collection.id = p_collection_id)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_documents_scoped(vector, UUID, UUID, UUID, FLOAT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION match_documents_scoped(vector, UUID, UUID, UUID, FLOAT, INT) FROM anon;
REVOKE ALL ON FUNCTION match_documents_scoped(vector, UUID, UUID, UUID, FLOAT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION match_documents_scoped(vector, UUID, UUID, UUID, FLOAT, INT) TO service_role;
