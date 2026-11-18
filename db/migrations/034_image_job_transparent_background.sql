-- Transparent background: a job can ask the image provider for a real alpha
-- channel instead of a painted checkerboard.

BEGIN;

ALTER TABLE image_generation_jobs
  ADD COLUMN transparent_background boolean NOT NULL DEFAULT false;

COMMIT;
