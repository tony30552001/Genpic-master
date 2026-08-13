-- Step-level trace for PPT Master deck generation.
-- A deck takes 5-15 minutes, so a single phase string cannot tell the user what
-- the worker is actually doing. Every stage appends events here, and the browser
-- renders them as a timeline.

CREATE TABLE IF NOT EXISTS deck_job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES deck_generation_jobs(id) ON DELETE CASCADE,
  step text NOT NULL
    CHECK (step IN ('source', 'outline', 'images', 'slides', 'quality', 'export')),
  status text NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  slide_number integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deck_job_events_job_idx
  ON deck_job_events(job_id, id);
