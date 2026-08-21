-- Track which identity provider each user signs in with so the admin console can
-- filter Entra ID and Google accounts separately.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IS NULL OR auth_provider IN ('entra', 'google'));

UPDATE users u
SET auth_provider = latest.provider
FROM (
  SELECT DISTINCT ON (user_id) user_id, provider
  FROM auth_sessions
  ORDER BY user_id, created_at DESC
) AS latest
WHERE latest.user_id = u.id
  AND u.auth_provider IS DISTINCT FROM latest.provider;

CREATE INDEX IF NOT EXISTS users_tenant_provider_created_idx
  ON users (tenant_id, auth_provider, created_at DESC);
