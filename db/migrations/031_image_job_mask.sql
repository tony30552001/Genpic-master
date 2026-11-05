-- Precise edit: an edit job may carry a brush mask.
--
-- The mask is an owner-scoped upload (PNG, transparent where the image should
-- change) that the worker sends to images/edits with the source image.

BEGIN;

ALTER TABLE image_generation_jobs
  ADD COLUMN mask_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT;

ALTER TABLE image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_mask_requires_edit
  CHECK (mask_upload_id IS NULL OR operation = 'edit');

COMMIT;
