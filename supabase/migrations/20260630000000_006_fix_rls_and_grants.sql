-- Fix missing table privileges in public schema for Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

-- Fix Storage Objects Upload Policy missing owner validation
DROP POLICY IF EXISTS "users_upload_own_documents" ON storage.objects;
CREATE POLICY "users_upload_own_documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND owner = auth.uid()
);

-- Fix additional storage policies missing owner validation
DROP POLICY IF EXISTS "users_upload_own_repositories" ON storage.objects;
CREATE POLICY "users_upload_own_repositories" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'repositories' AND owner = auth.uid()
);
