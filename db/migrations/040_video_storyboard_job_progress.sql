BEGIN;

-- What a running storyboard job is doing, so the browser can show its steps,
-- the analysis model's reasoning summary and the shots written so far.
-- Shape: { steps, step, reasoning, shots: [{ title, duration, text }], expectedShots }.
ALTER TABLE video_storyboard_jobs ADD COLUMN progress jsonb;

COMMIT;
