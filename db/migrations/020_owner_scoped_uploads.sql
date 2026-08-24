CREATE TABLE uploads (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('document', 'image')),
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  blob_name text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'expired')),
  expires_at timestamptz NOT NULL,
  ready_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0,
  last_cleanup_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uploads_owner
  ON uploads (tenant_id, user_id, id);

CREATE INDEX idx_uploads_pending_expiry
  ON uploads (expires_at, cleanup_claimed_at, id)
  WHERE status = 'pending';

ALTER TABLE deck_generation_jobs
  ADD COLUMN source_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT;

CREATE INDEX idx_deck_generation_jobs_source_upload
  ON deck_generation_jobs (source_upload_id);
