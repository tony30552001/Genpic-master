-- Analysis models are Azure OpenAI only.
--
-- Google Gemini support is removed, so llm_models no longer records a provider
-- and every model must have its Azure OpenAI endpoint.
--
-- Apply after deploying code that no longer reads llm_models.provider.

BEGIN;

ALTER TABLE llm_models DROP COLUMN provider;
ALTER TABLE llm_models ALTER COLUMN endpoint SET NOT NULL;

COMMIT;
