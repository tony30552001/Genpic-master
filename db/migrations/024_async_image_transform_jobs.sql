-- Route long-running GPT image edits through the durable image worker.

ALTER TABLE image_generation_jobs
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'generate';

ALTER TABLE image_generation_jobs
  ADD COLUMN IF NOT EXISTS source_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT;

ALTER TABLE image_generation_jobs
  DROP CONSTRAINT IF EXISTS image_generation_jobs_operation_check;

ALTER TABLE image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_operation_check
  CHECK (operation IN ('generate', 'edit'));

ALTER TABLE image_generation_jobs
  DROP CONSTRAINT IF EXISTS image_generation_jobs_source_check;

ALTER TABLE image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_source_check
  CHECK (
    (operation = 'generate' AND source_upload_id IS NULL)
    OR
    (operation = 'edit' AND source_upload_id IS NOT NULL)
  );
