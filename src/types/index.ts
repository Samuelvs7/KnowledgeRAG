export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  file_type: string;
  file_size: number | null;
  file_url: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[] | null;
  chunk_index: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DocumentCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CollectionDocument {
  collection_id: string;
  document_id: string;
  added_at: string;
}

export interface DocumentIngestion {
  id: string;
  document_id: string;
  status: 'pending' | 'parsing' | 'chunking' | 'embedding' | 'vectorizing' | 'ready' | 'failed';
  chunk_count: number;
  embedding_count: number;
  progress?: number;
  stage_message?: string | null;
  attempt_count?: number;
  job_id?: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  image_url: string | null;
  specifications: Record<string, unknown>;
  popularity_score: number;
  stock_quantity: number;
  reorder_level: number;
  supplier_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryAlert {
  id: string;
  product_id: string;
  alert_type: 'low_stock' | 'out_of_stock' | 'reorder_recommended';
  threshold_value: number | null;
  current_value: number | null;
  message: string | null;
  acknowledged: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface PurchaseOrder {
  id: string;
  user_id: string;
  order_number: string;
  supplier: string | null;
  status: 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  total_value: number | null;
  order_date: string | null;
  expected_delivery: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Repository {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface RepositoryFile {
  id: string;
  repository_id: string;
  file_path: string;
  file_name: string;
  language: string | null;
  line_count: number;
  function_count: number;
  class_count: number;
  is_indexed: boolean;
  created_at: string;
}

export interface CodeChunk {
  id: string;
  repository_id: string;
  file_path: string;
  file_name: string;
  content: string;
  embedding: number[] | null;
  chunk_index: number;
  language: string | null;
  created_at: string;
}

export interface CodeSymbol {
  id: string;
  file_id: string;
  symbol_type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'variable';
  name: string;
  signature: string | null;
  start_line: number | null;
  end_line: number | null;
  documentation: string | null;
  embedding: number[] | null;
  created_at: string;
}

export interface LearningMaterial {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  description: string | null;
  material_type: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningChunk {
  id: string;
  material_id: string;
  content: string;
  embedding: number[] | null;
  chunk_index: number;
  created_at: string;
}

export interface LearningProgress {
  id: string;
  user_id: string;
  material_id: string;
  flashcards_completed: number;
  quiz_score: number | null;
  study_time_minutes: number;
  last_studied_at: string | null;
  created_at: string;
}

export interface LearningStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  product_id: string | null;
  document_id: string | null;
  repository_id: string | null;
  material_id: string | null;
  created_at: string;
}

export interface SearchHistory {
  id: string;
  user_id: string | null;
  query: string;
  search_type: string;
  results_count: number;
  created_at: string;
}

export interface AIQuery {
  id: string;
  user_id: string;
  query_type: 'document' | 'product' | 'codebase' | 'learning';
  query_text: string;
  context_chunks: ContextChunk[];
  tool_calls: ToolCall[];
  embedding_generated: boolean;
  vector_search_performed: boolean;
  reranker_used: boolean;
  llm_prompt: string | null;
  llm_response: string | null;
  response_time_ms: number | null;
  confidence_score: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface ContextChunk {
  id: string;
  content: string;
  similarity: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  execution_time_ms: number;
  status: 'success' | 'failed';
}

export interface AIInfrastructureStatus {
  id: string;
  component: 'embedding_model' | 'vector_database' | 'llm' | 'reranker';
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  last_check_at: string | null;
  latency_ms: number | null;
  error_rate: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AIDiagnostics {
  embeddingGenerated: boolean;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingTimeMs: number | null;
  vectorSearchPerformed: boolean;
  vectorSearchResults: number;
  vectorSearchTimeMs: number | null;
  rerankerUsed: boolean;
  rerankerTimeMs: number | null;
  llmPromptTokens: number | null;
  llmCompletionTokens: number | null;
  llmTimeMs: number | null;
  totalTimeMs: number;
  contextChunks: ContextChunk[];
  toolCalls: ToolCall[];
}

export interface SearchResult<T> {
  id: string;
  content?: T;
  similarity: number;
}

export type SearchType = 'documents' | 'products' | 'codebase' | 'learning';

export type IngestionStatus = 'pending' | 'parsing' | 'chunking' | 'embedding' | 'vectorizing' | 'ready' | 'failed';
