-- Add line_configs table for storing user's LINE Official Account binding
-- Track A: Bot Push Message via user's own Channel Access Token

CREATE TABLE IF NOT EXISTS line_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_name text,
  -- Encrypted via AES-256-GCM at application layer
  channel_access_token_enc text NOT NULL,
  channel_secret_enc text,
  -- Default send target
  target_id text,
  target_type text CHECK (target_type IN ('group', 'user', 'room')) DEFAULT 'group',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each user can only have one LINE config per tenant
CREATE UNIQUE INDEX IF NOT EXISTS line_configs_user_tenant_uidx ON line_configs(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS line_configs_tenant_idx ON line_configs(tenant_id);
