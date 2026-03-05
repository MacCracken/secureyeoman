-- Phase 132: Inference Optimization
-- Batch inference, semantic cache

-- 1. ai.batch_inference_jobs
CREATE TABLE IF NOT EXISTS ai.batch_inference_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  prompts jsonb NOT NULL,
  concurrency integer DEFAULT 5,
  status text DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  results jsonb DEFAULT '[]',
  total_prompts integer NOT NULL,
  completed_prompts integer DEFAULT 0,
  failed_prompts integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_by text
);

-- 2. ai.semantic_cache
CREATE TABLE IF NOT EXISTS ai.semantic_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding vector(384) NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  hit_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx
  ON ai.semantic_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS semantic_cache_expires_idx ON ai.semantic_cache(expires_at);
CREATE INDEX IF NOT EXISTS batch_inference_status_idx ON ai.batch_inference_jobs(status);
