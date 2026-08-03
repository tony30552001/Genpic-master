-- Administrator mode: tenant model policy and auditable generation model

ALTER TABLE history
  ADD COLUMN IF NOT EXISTS model text;

CREATE TABLE IF NOT EXISTS tenant_model_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  allowed_models text[] NOT NULL DEFAULT ARRAY['gemini-imagen']::text[],
  default_model text NOT NULL DEFAULT 'gemini-imagen',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenant_model_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS history_tenant_model_idx
  ON history(tenant_id, model, created_at DESC);
