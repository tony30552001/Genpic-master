-- Add tenant-shared style library fields

ALTER TABLE styles
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copy_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_curated boolean NOT NULL DEFAULT false;

UPDATE styles
SET category = 'general'
WHERE category IS NULL
   OR category NOT IN (
    'social',
    'presentation',
    'poster',
    'ecommerce',
    'education',
    'document',
    'brand',
    'general'
  );

UPDATE styles
SET visibility = 'private'
WHERE visibility IS NULL
   OR visibility NOT IN ('private', 'shared');

UPDATE styles
SET updated_at = COALESCE(updated_at, created_at, now()),
    usage_count = COALESCE(usage_count, 0),
    copy_count = COALESCE(copy_count, 0),
    is_curated = COALESCE(is_curated, false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'styles_visibility_check'
  ) THEN
    ALTER TABLE styles
      ADD CONSTRAINT styles_visibility_check
      CHECK (visibility IN ('private', 'shared'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'styles_category_check'
  ) THEN
    ALTER TABLE styles
      ADD CONSTRAINT styles_category_check
      CHECK (category IN (
        'social',
        'presentation',
        'poster',
        'ecommerce',
        'education',
        'document',
        'brand',
        'general'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS styles_owner_visibility_idx
  ON styles(tenant_id, created_by, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS styles_shared_category_idx
  ON styles(tenant_id, visibility, category, published_at DESC);

CREATE INDEX IF NOT EXISTS styles_shared_popularity_idx
  ON styles(tenant_id, visibility, is_curated, usage_count DESC, copy_count DESC);
