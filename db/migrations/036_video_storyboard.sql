BEGIN;

-- Preview-phase video jobs have no storyboard; they are removed instead of converted.
DELETE FROM history WHERE video_job_id IS NOT NULL;
DELETE FROM video_generation_jobs;

ALTER TABLE video_generation_jobs
  ADD COLUMN storyboard jsonb NOT NULL,
  DROP COLUMN original_prompt;

ALTER TABLE users
  ADD COLUMN video_unlimited boolean NOT NULL DEFAULT false;

COMMIT;
