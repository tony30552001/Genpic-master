BEGIN;

-- A project generated from an edited storyboard copies the segments that did
-- not change from the project it was edited from. The copy points at the job
-- that produced the video and does not count against the daily quota.
ALTER TABLE video_generation_jobs
  ADD COLUMN reused_from_job_id uuid REFERENCES video_generation_jobs(id) ON DELETE SET NULL;

COMMIT;
