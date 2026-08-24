-- Durable jobs keep document analysis outside the 45-second Static Web Apps
-- API proxy window. The source upload remains owner-scoped and is rechecked by
-- the worker before any Blob read.

CREATE TABLE IF NOT EXISTS document_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source_upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  scene_count text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_analysis_jobs_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_analysis_jobs_queue_idx
  ON document_analysis_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS document_analysis_jobs_user_idx
  ON document_analysis_jobs(tenant_id, user_id, created_at DESC);
