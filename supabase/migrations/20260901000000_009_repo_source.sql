-- Migration: 009_repo_source.sql
-- Purpose: Track how a repository was ingested (uploaded ZIP vs. imported from a
-- GitHub URL) and remember the source URL/branch for re-indexing and display.

ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS default_branch TEXT;

-- Backfill existing rows explicitly so the column is never null for old repos.
UPDATE repositories SET source_type = 'upload' WHERE source_type IS NULL;
