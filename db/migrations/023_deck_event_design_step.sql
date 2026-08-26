-- The `design` step generates the deck's design system between outline and
-- images. Without it in the CHECK constraint every deck job would fail at that
-- step, so this migration must land with the worker change, not after it.

ALTER TABLE deck_job_events
  DROP CONSTRAINT IF EXISTS deck_job_events_step_check;

ALTER TABLE deck_job_events
  ADD CONSTRAINT deck_job_events_step_check
  CHECK (step IN ('source', 'outline', 'design', 'images', 'slides', 'quality', 'export'));
