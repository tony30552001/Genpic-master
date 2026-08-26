-- Purpose-driven narrative recipes and the structured brief.
--
-- `recipe_id` deliberately carries no CHECK constraint: the recipe list grows
-- with the product, and `normalizeRecipeId` collapses anything unknown to
-- 'general' before the insert. A schema change per recipe would buy nothing.
--
-- The 'general' default means jobs already queued when this ships take exactly
-- the path they were created for.
ALTER TABLE deck_generation_jobs
  ADD COLUMN IF NOT EXISTS recipe_id text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS brief_purpose text,
  ADD COLUMN IF NOT EXISTS brief_audience text,
  ADD COLUMN IF NOT EXISTS brief_outcome text;
