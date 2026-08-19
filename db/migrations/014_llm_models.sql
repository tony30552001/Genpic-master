-- Tenant-managed analysis models (LLM).
--
-- Model names, endpoints and API keys used by document analysis, prompt
-- optimization, deck authoring, style analysis, filename generation and scene
-- optimization move out of App Service settings and into the admin center.
-- API keys are stored AES-256-GCM encrypted by api/_shared/secretCrypto.js.
--
-- Image generation models keep using tenant_model_settings, and embeddings keep
-- using EMBEDDING_MODEL, because the vector dimension is bound to the schema.

BEGIN;

CREATE TABLE IF NOT EXISTS llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('azure-openai', 'google-gemini')),
  model_name text NOT NULL,
  endpoint text,
  api_key_encrypted text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS llm_models_tenant_label_uidx
  ON llm_models (tenant_id, lower(trim(label)));

-- One assignment per role. The fallback is used when the primary model rejects
-- the request under load, so it must be a different model.
CREATE TABLE IF NOT EXISTS llm_role_assignments (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL,
  model_id uuid NOT NULL REFERENCES llm_models(id) ON DELETE RESTRICT,
  fallback_model_id uuid REFERENCES llm_models(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role),
  CONSTRAINT llm_role_assignments_fallback_differs
    CHECK (fallback_model_id IS NULL OR fallback_model_id <> model_id)
);

COMMIT;
