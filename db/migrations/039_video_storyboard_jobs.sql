BEGIN;

-- Storyboard agent calls (draft, revise, fromScript) run in a worker because
-- one call can outlast the SWA linked backend's 45-second request limit.
-- Finished jobs are deleted by the worker a day after they complete.
CREATE TABLE video_storyboard_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('draft', 'revise', 'fromScript')),
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  lock_version bigint NOT NULL DEFAULT 0,
  locked_at timestamptz,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_storyboard_jobs_result_check
    CHECK (status <> 'succeeded' OR result IS NOT NULL)
);

CREATE INDEX video_storyboard_jobs_pending_idx
  ON video_storyboard_jobs(created_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX video_storyboard_jobs_completed_idx
  ON video_storyboard_jobs(completed_at)
  WHERE status IN ('succeeded', 'failed');

COMMIT;
