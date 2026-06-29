-- Collections for document organization
CREATE TABLE document_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collection membership
CREATE TABLE collection_documents (
  collection_id UUID REFERENCES document_collections(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, document_id)
);

-- Document ingestion status tracking
CREATE TABLE document_ingestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'chunking', 'embedding', 'vectorizing', 'ready', 'failed')),
  chunk_count INTEGER DEFAULT 0,
  embedding_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Query logs with diagnostics
CREATE TABLE ai_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  query_type TEXT NOT NULL CHECK (query_type IN ('document', 'product', 'codebase', 'learning')),
  query_text TEXT NOT NULL,
  context_chunks JSONB DEFAULT '[]',
  tool_calls JSONB DEFAULT '[]',
  embedding_generated BOOLEAN DEFAULT false,
  vector_search_performed BOOLEAN DEFAULT false,
  reranker_used BOOLEAN DEFAULT false,
  llm_prompt TEXT,
  llm_response TEXT,
  response_time_ms INTEGER,
  confidence_score DECIMAL(3,2),
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product inventory enhancements
CREATE TABLE inventory_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock', 'reorder_recommended')),
  threshold_value INTEGER,
  current_value INTEGER,
  message TEXT,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Purchase orders
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_number TEXT NOT NULL,
  supplier TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'received', 'cancelled')),
  total_value DECIMAL(12,2),
  order_date DATE,
  expected_delivery DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order line items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier management
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product supplier relationship
CREATE TABLE product_suppliers (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE NOT NULL,
  cost_price DECIMAL(10,2),
  lead_time_days INTEGER,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (product_id, supplier_id)
);

-- Learning progress tracking
CREATE TABLE learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  material_id UUID REFERENCES learning_materials(id) ON DELETE CASCADE NOT NULL,
  flashcards_completed INTEGER DEFAULT 0,
  quiz_score DECIMAL(5,2),
  study_time_minutes INTEGER DEFAULT 0,
  last_studied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, material_id)
);

-- Learning streaks
CREATE TABLE learning_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Infrastructure status
CREATE TABLE ai_infrastructure_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL UNIQUE CHECK (component IN ('embedding_model', 'vector_database', 'llm', 'reranker')),
  status TEXT DEFAULT 'unknown' CHECK (status IN ('online', 'degraded', 'offline', 'unknown')),
  last_check_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_rate DECIMAL(5,4),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repository file index
CREATE TABLE repository_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  language TEXT,
  line_count INTEGER DEFAULT 0,
  function_count INTEGER DEFAULT 0,
  class_count INTEGER DEFAULT 0,
  is_indexed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repository_id, file_path)
);

-- Code symbols (functions, classes, etc.)
CREATE TABLE code_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES repository_files(id) ON DELETE CASCADE NOT NULL,
  symbol_type TEXT NOT NULL CHECK (symbol_type IN ('function', 'class', 'interface', 'type', 'constant', 'variable')),
  name TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER,
  end_line INTEGER,
  documentation TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for new tables
ALTER TABLE document_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ingestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_infrastructure_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE repository_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_symbols ENABLE ROW LEVEL SECURITY;

-- Document collections policies
CREATE POLICY "select_own_collections" ON document_collections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_collections" ON document_collections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_collections" ON document_collections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_collections" ON document_collections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Collection documents policies
CREATE POLICY "select_collection_documents" ON collection_documents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM document_collections WHERE document_collections.id = collection_documents.collection_id AND document_collections.user_id = auth.uid())
  );
CREATE POLICY "insert_collection_documents" ON collection_documents FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM document_collections WHERE document_collections.id = collection_documents.collection_id AND document_collections.user_id = auth.uid())
  );

-- Document ingestion policies
CREATE POLICY "select_document_ingestion" ON document_ingestion FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM documents WHERE documents.id = document_ingestion.document_id AND documents.user_id = auth.uid())
  );

-- AI queries policies
CREATE POLICY "select_own_ai_queries" ON ai_queries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_ai_queries" ON ai_queries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Inventory alerts policies (read-only for authenticated)
CREATE POLICY "select_inventory_alerts" ON inventory_alerts FOR SELECT
  TO authenticated USING (true);

-- Purchase orders policies
CREATE POLICY "select_own_orders" ON purchase_orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_orders" ON purchase_orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_orders" ON purchase_orders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Order items policies
CREATE POLICY "select_order_items" ON order_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM purchase_orders WHERE purchase_orders.id = order_items.order_id AND purchase_orders.user_id = auth.uid())
  );
CREATE POLICY "insert_order_items" ON order_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM purchase_orders WHERE purchase_orders.id = order_items.order_id AND purchase_orders.user_id = auth.uid())
  );

-- Suppliers policies (public read)
CREATE POLICY "select_suppliers" ON suppliers FOR SELECT TO authenticated USING (true);

-- Learning progress policies
CREATE POLICY "select_own_progress" ON learning_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_progress" ON learning_progress FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_progress" ON learning_progress FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Learning streaks policies
CREATE POLICY "select_own_streaks" ON learning_streaks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_streaks" ON learning_streaks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_streaks" ON learning_streaks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI infrastructure status (public read)
CREATE POLICY "select_ai_status" ON ai_infrastructure_status FOR SELECT
  TO authenticated USING (true);

-- Repository files policies
CREATE POLICY "select_repo_files" ON repository_files FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM repositories WHERE repositories.id = repository_files.repository_id AND repositories.user_id = auth.uid())
  );
CREATE POLICY "insert_repo_files" ON repository_files FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM repositories WHERE repositories.id = repository_files.repository_id AND repositories.user_id = auth.uid())
  );

-- Code symbols policies
CREATE POLICY "select_code_symbols" ON code_symbols FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM repository_files rf
      JOIN repositories r ON r.id = rf.repository_id
      WHERE rf.id = code_symbols.file_id AND r.user_id = auth.uid()
    )
  );

-- Add stock tracking columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- Insert initial AI infrastructure status
INSERT INTO ai_infrastructure_status (component, status, last_check_at) VALUES
  ('embedding_model', 'unknown', NOW()),
  ('vector_database', 'unknown', NOW()),
  ('llm', 'unknown', NOW()),
  ('reranker', 'unknown', NOW())
ON CONFLICT (component) DO NOTHING;

-- Insert sample suppliers
INSERT INTO suppliers (id, name, contact_email, contact_phone) VALUES
  ('11111111-2222-1111-1111-111111111111'::uuid, 'TechSupplier Inc.', 'orders@techsupplier.com', '+1-555-0101'),
  ('22222222-3333-2222-2222-222222222222'::uuid, 'Global Electronics', 'supply@globalelectronics.com', '+1-555-0102'),
  ('33333333-4444-3333-3333-333333333333'::uuid, 'Book Distributors Ltd.', 'orders@bookdist.com', '+1-555-0103')
ON CONFLICT DO NOTHING;

-- Update products with stock and supplier info
UPDATE products SET stock_quantity = 50, reorder_level = 10, supplier_id = '11111111-2222-1111-1111-111111111111'::uuid WHERE category = 'Laptops';
UPDATE products SET stock_quantity = 100, reorder_level = 20, supplier_id = '11111111-2222-1111-1111-111111111111'::uuid WHERE category = 'Phones';
UPDATE products SET stock_quantity = 200, reorder_level = 30, supplier_id = '33333333-4444-3333-3333-333333333333'::uuid WHERE category = 'Books';
UPDATE products SET stock_quantity = 500, reorder_level = 50, supplier_id = '33333333-4444-3333-3333-333333333333'::uuid WHERE category = 'Courses';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_queries_user_created ON ai_queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product ON inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_code_symbols_embedding ON code_symbols USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
