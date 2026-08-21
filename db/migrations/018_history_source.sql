-- Record which creation workflow produced each generated image.

ALTER TABLE IF EXISTS history
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE IF EXISTS history
  DROP CONSTRAINT IF EXISTS history_source_check;

ALTER TABLE IF EXISTS history
  ADD CONSTRAINT history_source_check
  CHECK (source IS NULL OR source IN ('general', 'document', 'image-transform'));

CREATE INDEX IF NOT EXISTS history_tenant_source_created_idx
  ON history (tenant_id, source, created_at DESC);
