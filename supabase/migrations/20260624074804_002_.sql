-- Create storage buckets for documents and repositories
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('documents', 'documents', false, 52428800, ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed'
  ]),
  ('repositories', 'repositories', false, 104857600, ARRAY['application/zip'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents bucket
CREATE POLICY "users_upload_own_documents" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_select_own_documents" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_delete_own_documents" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for repositories bucket
CREATE POLICY "users_upload_own_repositories" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'repositories' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_select_own_repositories" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'repositories' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_delete_own_repositories" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'repositories' AND (storage.foldername(name))[1] = auth.uid()::text);
