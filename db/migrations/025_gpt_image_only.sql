-- GPT Image 2 becomes the only supported image generation model.
-- Tenants still pinned to the removed Gemini renderer would otherwise resolve
-- to a model the API can no longer render.

ALTER TABLE tenant_model_settings
  ALTER COLUMN allowed_models SET DEFAULT ARRAY['gpt-image-2']::text[];

ALTER TABLE tenant_model_settings
  ALTER COLUMN default_model SET DEFAULT 'gpt-image-2';

UPDATE tenant_model_settings
SET allowed_models = ARRAY['gpt-image-2']::text[],
    default_model = 'gpt-image-2',
    updated_at = now()
WHERE default_model <> 'gpt-image-2'
   OR allowed_models <> ARRAY['gpt-image-2']::text[];
