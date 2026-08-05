-- User administration: persisted active status for account suspension

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS users_tenant_active_created_idx
  ON users (tenant_id, is_active, created_at DESC);
