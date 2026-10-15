-- Record the creation purpose now that image transforms run inside the creation workspace.
-- Rows written by the removed image-transform tab keep their recorded source.

ALTER TABLE IF EXISTS history
  DROP CONSTRAINT IF EXISTS history_source_check;

ALTER TABLE IF EXISTS history
  ADD CONSTRAINT history_source_check
  CHECK (source IS NULL OR source IN (
    'general',
    'document',
    'refine',
    'bg_replace',
    'element_extract',
    'style_transfer',
    'image-transform'
  ));
