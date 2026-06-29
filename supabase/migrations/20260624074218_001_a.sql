-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (extends Supabase auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents for RAG
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document chunks with embeddings
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products for recommendation system
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  specifications JSONB DEFAULT '{}',
  embedding vector(768),
  popularity_score DECIMAL(3,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repositories for codebase RAG
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Code chunks with embeddings
CREATE TABLE code_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  chunk_index INTEGER NOT NULL,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning materials
CREATE TABLE learning_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  material_type TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning material chunks with embeddings
CREATE TABLE learning_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES learning_materials(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User ratings for collaborative filtering
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- User favorites
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  material_id UUID REFERENCES learning_materials(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (product_id IS NOT NULL)::integer +
    (document_id IS NOT NULL)::integer +
    (repository_id IS NOT NULL)::integer +
    (material_id IS NOT NULL)::integer = 1
  )
);

-- Search history for analytics
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create product similarity search function
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
  AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create code similarity search function
CREATE OR REPLACE FUNCTION match_code(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  file_path TEXT,
  file_name TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.content,
    cc.file_path,
    cc.file_name,
    1 - (cc.embedding <=> query_embedding) as similarity
  FROM code_chunks cc
  WHERE 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create indexes for vector search
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON code_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON learning_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- RLS Policies for documents
CREATE POLICY "select_own_documents" ON documents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for document_chunks
CREATE POLICY "select_document_chunks_through_documents" ON document_chunks FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM documents WHERE documents.id = document_chunks.document_id AND documents.user_id = auth.uid()
    )
  );
CREATE POLICY "insert_document_chunks" ON document_chunks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents WHERE documents.id = document_chunks.document_id AND documents.user_id = auth.uid()
    )
  );
CREATE POLICY "delete_document_chunks" ON document_chunks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM documents WHERE documents.id = document_chunks.document_id AND documents.user_id = auth.uid()
    )
  );

-- RLS Policies for products (publicly readable)
CREATE POLICY "select_products_public" ON products FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_products_admin" ON products FOR INSERT
  TO authenticated WITH CHECK (true);

-- RLS Policies for repositories
CREATE POLICY "select_own_repositories" ON repositories FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_repositories" ON repositories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_repositories" ON repositories FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_repositories" ON repositories FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for code_chunks
CREATE POLICY "select_code_chunks_through_repositories" ON code_chunks FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM repositories WHERE repositories.id = code_chunks.repository_id AND repositories.user_id = auth.uid()
    )
  );
CREATE POLICY "insert_code_chunks" ON code_chunks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM repositories WHERE repositories.id = code_chunks.repository_id AND repositories.user_id = auth.uid()
    )
  );
CREATE POLICY "delete_code_chunks" ON code_chunks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM repositories WHERE repositories.id = code_chunks.repository_id AND repositories.user_id = auth.uid()
    )
  );

-- RLS Policies for learning_materials
CREATE POLICY "select_own_learning_materials" ON learning_materials FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_learning_materials" ON learning_materials FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_learning_materials" ON learning_materials FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_learning_materials" ON learning_materials FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for learning_chunks
CREATE POLICY "select_learning_chunks_through_materials" ON learning_chunks FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM learning_materials WHERE learning_materials.id = learning_chunks.material_id AND learning_materials.user_id = auth.uid()
    )
  );
CREATE POLICY "insert_learning_chunks" ON learning_chunks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM learning_materials WHERE learning_materials.id = learning_chunks.material_id AND learning_materials.user_id = auth.uid()
    )
  );
CREATE POLICY "delete_learning_chunks" ON learning_chunks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM learning_materials WHERE learning_materials.id = learning_chunks.material_id AND learning_materials.user_id = auth.uid()
    )
  );

-- RLS Policies for ratings
CREATE POLICY "select_own_ratings" ON ratings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_ratings" ON ratings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_ratings" ON ratings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_ratings" ON ratings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for favorites
CREATE POLICY "select_own_favorites" ON favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_favorites" ON favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_favorites" ON favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for search_history
CREATE POLICY "select_own_search_history" ON search_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_search_history" ON search_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_search_history" ON search_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Insert sample products for demonstration
INSERT INTO products (id, name, description, category, price, image_url, specifications, popularity_score) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'MacBook Pro 16"', 'Apple MacBook Pro with M3 Pro chip, 18GB RAM, 512GB SSD. Perfect for AI/ML development with exceptional performance.', 'Laptops', 2499.00, 'https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=800', '{"ram": "18GB", "storage": "512GB SSD", "processor": "M3 Pro", "screen": "16 inch Liquid Retina XDR", "weight": "2.14 kg"}', 0.92),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Dell XPS 15', 'Dell XPS 15 with Intel Core i9, 32GB RAM, 1TB SSD. Powerful Windows laptop for professional work.', 'Laptops', 1899.00, 'https://images.pexels.com/photos/205339/pexels-photo-205339.jpeg?auto=compress&cs=tinysrgb&w=800', '{"ram": "32GB", "storage": "1TB SSD", "processor": "Intel Core i9", "screen": "15.6 inch OLED", "weight": "1.86 kg"}', 0.87),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'iPhone 15 Pro', 'Apple iPhone 15 Pro with A17 Pro chip, 256GB storage, titanium design, and pro camera system.', 'Phones', 1199.00, 'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=800', '{"storage": "256GB", "processor": "A17 Pro", "camera": "48MP Pro", "display": "6.1 inch Super Retina XDR", "battery": "Up to 23 hours video playback"}', 0.95),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24 Ultra with Snapdragon 8 Gen 3, 512GB storage, S Pen, and 200MP camera.', 'Phones', 1299.00, 'https://images.pexels.com/photos/2860811/pexels-photo-2860811.jpeg?auto=compress&cs=tinysrgb&w=800', '{"storage": "512GB", "processor": "Snapdragon 8 Gen 3", "camera": "200MP", "display": "6.8 inch Dynamic AMOLED", "s_pen": "Included"}', 0.89),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'Designing Data-Intensive Applications', 'The big ideas behind reliable, scalable, and maintainable data systems. Essential reading for building robust distributed systems.', 'Books', 45.00, 'https://images.pexels.com/photos/159711/books-book-paper-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800', '{"pages": 624, "author": "Martin Kleppmann", "publisher": "O''Reilly Media", "year": 2017, "topics": ["Distributed Systems", "Data Engineering", "Architecture"]}', 0.98),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'Hands-On Machine Learning', 'Practical guide to machine learning with Scikit-Learn, Keras, and TensorFlow. From beginner to advanced techniques.', 'Books', 49.00, 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=800', '{"pages": 856, "author": "Aurélien Géron", "publisher": "O''Reilly Media", "year": 2022, "topics": ["Machine Learning", "Deep Learning", "TensorFlow"]}', 0.96),
  ('77777777-7777-7777-7777-777777777777'::uuid, 'Complete Machine Learning & AI Course', 'Comprehensive course covering ML, deep learning, NLP, computer vision, and deployment. From basics to production.', 'Courses', 199.00, 'https://images.pexels.com/photos/5428006/pexels-photo-5428006.jpeg?auto=compress&cs=tinysrgb&w=800', '{"duration": "60+ hours", "level": "All Levels", "platform": "Udemy", "topics": ["Python", "TensorFlow", "Computer Vision", "NLP", "MLOps"]}', 0.91),
  ('88888888-8888-8888-8888-888888888888'::uuid, 'System Design Interview Course', 'Master system design interviews with real-world case studies. Learn to design complex distributed systems.', 'Courses', 149.00, 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=800', '{"duration": "25+ hours", "level": "Intermediate", "platform": "Educative", "topics": ["System Design", "Distributed Systems", "Scalability", "Interview Prep"]}', 0.88);
