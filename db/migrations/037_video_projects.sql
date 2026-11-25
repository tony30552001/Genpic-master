BEGIN;

-- Every video job now belongs to a project. Jobs created before projects have
-- no project and are removed with their history entries.
DELETE FROM history WHERE video_job_id IS NOT NULL;
DELETE FROM video_generation_jobs;

CREATE TABLE video_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  storyboard jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX video_projects_user_idx
  ON video_projects(tenant_id, user_id, created_at DESC);

-- A segment continues from the previous segment's last frame when
-- previous_job_id is set; that frame is its image-to-video source.
ALTER TABLE video_generation_jobs
  ADD COLUMN project_id uuid NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  ADD COLUMN segment_index integer NOT NULL CHECK (segment_index >= 0),
  ADD COLUMN previous_job_id uuid REFERENCES video_generation_jobs(id) ON DELETE CASCADE,
  ADD COLUMN last_frame_blob_name text,
  ADD CONSTRAINT video_jobs_project_segment_key UNIQUE (project_id, segment_index),
  DROP CONSTRAINT video_generation_jobs_check,
  ADD CONSTRAINT video_generation_jobs_source_check CHECK (
    (mode = 't2v' AND source_upload_id IS NULL AND source_image_job_id IS NULL
      AND previous_job_id IS NULL)
    OR
    (mode = 'i2v' AND
      ((source_upload_id IS NOT NULL)::integer
       + (source_image_job_id IS NOT NULL)::integer
       + (previous_job_id IS NOT NULL)::integer) = 1)
  );

CREATE INDEX video_jobs_previous_idx
  ON video_generation_jobs(previous_job_id)
  WHERE previous_job_id IS NOT NULL;

COMMIT;
