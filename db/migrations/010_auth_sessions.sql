-- Opaque server-side auth sessions for Pixora BFF

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('entra', 'google')),
  provider_subject text NOT NULL,
  session_token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_active_user_idx
  ON auth_sessions (tenant_id, user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_provider_subject_idx
  ON auth_sessions (provider, provider_subject, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
  ON auth_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL;
