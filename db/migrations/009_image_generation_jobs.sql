-- Durable asynchronous image generation jobs for long-running providers

CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model text NOT NULL,
  prompt text NOT NULL,
  aspect_ratio text,
  image_size text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result_blob_name text,
  result_mime_type text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS image_jobs_queue_idx
  ON image_generation_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS image_jobs_user_idx
  ON image_generation_jobs(tenant_id, user_id, created_at DESC);
