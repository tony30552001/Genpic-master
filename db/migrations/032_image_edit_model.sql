-- Separate tenant image models for generation and editing.
--
-- default_model drives generate jobs; default_edit_model drives edit jobs
-- (refine, precise edit, transforms). Both must be in allowed_models once set.
-- Existing tenants start with the edit model equal to their generation model.

BEGIN;

ALTER TABLE tenant_model_settings ADD COLUMN default_edit_model text;

UPDATE tenant_model_settings SET default_edit_model = default_model;

COMMIT;
