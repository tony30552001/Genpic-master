-- Per-slide preview for PPT Master deck generation.
-- Authoring already produces one 1280x720 SVG per slide, and that SVG is the
-- only source the exporter compiles from. Keeping it lets the browser show the
-- deck page by page while the job is still running.
--
-- One row per slide (not append-only): a quality repair rewrites the same page,
-- and `revision` is what the browser uses as its cache key.

CREATE TABLE IF NOT EXISTS deck_slide_previews (
  job_id uuid NOT NULL REFERENCES deck_generation_jobs(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  title text,
  svg text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, slide_number)
);
