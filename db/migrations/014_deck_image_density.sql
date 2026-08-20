-- Per-deck illustration density.
-- Deciding whether a slide gets an illustration used to be entirely up to the
-- outline model, which almost always answered "no". The user now chooses the
-- density and the worker applies a deterministic policy on top of it.

ALTER TABLE deck_generation_jobs
  ADD COLUMN IF NOT EXISTS image_density text NOT NULL DEFAULT 'key'
    CHECK (image_density IN ('none', 'key', 'every'));
