BEGIN;

-- A video creation session: the storyboard conversation, the board being
-- edited, the composer settings and the video turns, saved by the browser as
-- one snapshot so a creation can be resumed later (for example after the daily
-- quota resets). Deleting a session keeps the videos already saved to history.
CREATE TABLE video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  state jsonb NOT NULL,
  state_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_sessions_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX video_sessions_owner_updated_idx
  ON video_sessions (tenant_id, user_id, updated_at DESC, id DESC);

COMMIT;
