-- Durable asynchronous PPT Master deck generation jobs.
-- A deck takes minutes to author, so generation runs on the App Service worker
-- and the browser polls for progress.

CREATE TABLE IF NOT EXISTS deck_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_kind text NOT NULL CHECK (input_kind IN ('topic', 'document')),
  topic text,
  source_document_url text,
  source_file_name text,
  slide_count integer NOT NULL DEFAULT 8,
  style_id text,
  layout_id text,
  brand_id text,
  deck_title text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  phase text,
  progress_current integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result_blob_name text,
  result_file_name text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deck_jobs_queue_idx
  ON deck_generation_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS deck_jobs_user_idx
  ON deck_generation_jobs(tenant_id, user_id, created_at DESC);
