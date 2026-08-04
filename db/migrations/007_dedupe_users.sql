-- Normalize user emails, merge duplicate identities, and enforce tenant-scoped uniqueness.

BEGIN;

UPDATE users
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

CREATE TEMP TABLE user_canonical_map ON COMMIT DROP AS
SELECT
  id AS user_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY tenant_id, lower(trim(email))
    ORDER BY created_at, id
  ) AS canonical_id
FROM users
WHERE email IS NOT NULL;

CREATE INDEX user_canonical_map_user_idx
  ON user_canonical_map(user_id);

-- Keep the canonical user's LINE configuration when merging would collide
-- with the one-config-per-user-per-tenant unique index.
WITH ranked_line_configs AS (
  SELECT
    line_configs.id,
    ROW_NUMBER() OVER (
      PARTITION BY user_canonical_map.canonical_id, line_configs.tenant_id
      ORDER BY
        CASE WHEN line_configs.user_id = user_canonical_map.canonical_id THEN 0 ELSE 1 END,
        line_configs.created_at,
        line_configs.id
    ) AS row_number
  FROM line_configs
  JOIN user_canonical_map
    ON user_canonical_map.user_id = line_configs.user_id
)
DELETE FROM line_configs
USING ranked_line_configs
WHERE line_configs.id = ranked_line_configs.id
  AND ranked_line_configs.row_number > 1;

UPDATE line_configs
SET user_id = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE line_configs.user_id = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE projects
SET created_by = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE projects.created_by = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE styles
SET created_by = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE styles.created_by = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE scenes
SET created_by = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE scenes.created_by = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE history
SET user_id = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE history.user_id = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE templates
SET created_by = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE templates.created_by = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

UPDATE tenant_model_settings
SET updated_by = user_canonical_map.canonical_id
FROM user_canonical_map
WHERE tenant_model_settings.updated_by = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

DELETE FROM users
USING user_canonical_map
WHERE users.id = user_canonical_map.user_id
  AND user_canonical_map.user_id <> user_canonical_map.canonical_id;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_uidx
  ON users (tenant_id, lower(trim(email)));

COMMIT;
