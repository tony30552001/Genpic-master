BEGIN;

ALTER TABLE video_models
  ADD COLUMN IF NOT EXISTS price_per_second_usd numeric(12, 6)
  CHECK (price_per_second_usd BETWEEN 0 AND 999999.999999);

-- Captured from the submitted provider payload; older jobs have no observation.
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS used_elements boolean;

CREATE INDEX IF NOT EXISTS video_jobs_usage_idx
  ON video_generation_jobs (tenant_id, completed_at)
  WHERE status = 'succeeded' AND reused_from_job_id IS NULL AND provider_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS video_renders_usage_idx
  ON video_renders (tenant_id, completed_at)
  WHERE status = 'succeeded';

COMMIT;
