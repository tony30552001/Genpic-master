-- Carry the requested GPT Image rendering quality through the async job worker.

ALTER TABLE IF EXISTS image_generation_jobs
  ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'medium';

ALTER TABLE IF EXISTS image_generation_jobs
  DROP CONSTRAINT IF EXISTS image_generation_jobs_quality_check;

ALTER TABLE IF EXISTS image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_quality_check
  CHECK (quality IN ('low', 'medium', 'high'));
