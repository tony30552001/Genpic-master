BEGIN;

ALTER TABLE video_generation_jobs
  DROP CONSTRAINT IF EXISTS video_generation_jobs_status_check,
  DROP CONSTRAINT IF EXISTS video_jobs_cancelled_check,
  ADD CONSTRAINT video_generation_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  ADD CONSTRAINT video_jobs_cancelled_check
    CHECK (status <> 'cancelled' OR (phase = 'completed' AND provider_request_id IS NULL));

-- A bounded rolling window per deployment. Even a rejected or ambiguous POST
-- consumes a slot; retries and worker restarts cannot erase earlier attempts.
ALTER TABLE video_models
  ADD COLUMN IF NOT EXISTS recent_submit_times timestamptz[] NOT NULL DEFAULT '{}';

COMMIT;
