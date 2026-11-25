BEGIN;

-- Joins a multi-segment project into one MP4 on request. A project has at
-- most one render that has not failed; after a failure it can be rendered
-- again.
CREATE TABLE video_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  lock_version bigint NOT NULL DEFAULT 0,
  locked_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  result_blob_name text,
  result_size_bytes bigint,
  result_duration_seconds numeric(8, 3),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_renders_result_check
    CHECK (status <> 'succeeded' OR result_blob_name IS NOT NULL)
);

CREATE UNIQUE INDEX video_renders_project_live_key
  ON video_renders(project_id)
  WHERE status <> 'failed';

CREATE INDEX video_renders_pending_idx
  ON video_renders(created_at)
  WHERE status IN ('queued', 'processing');

-- History saves a project's video: its only segment, or its render.
ALTER TABLE history
  ADD COLUMN video_project_id uuid REFERENCES video_projects(id) ON DELETE CASCADE;

UPDATE history
SET video_project_id = jobs.project_id
FROM video_generation_jobs jobs
WHERE jobs.id = history.video_job_id;

ALTER TABLE history DROP CONSTRAINT history_asset_check;
DROP INDEX history_video_job_idx;
ALTER TABLE history DROP COLUMN video_job_id;

ALTER TABLE history
  ADD CONSTRAINT history_asset_check
  CHECK (
    ((image_url IS NOT NULL AND image_url <> '') AND video_project_id IS NULL)
    OR
    ((image_url IS NULL OR image_url = '') AND video_project_id IS NOT NULL)
  );

CREATE INDEX history_video_project_idx ON history(video_project_id);

COMMIT;
