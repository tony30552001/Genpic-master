-- Chat-to-image conversations.
-- A chat can refine any earlier result, so an edit job's source is either an
-- owned upload or an owned succeeded job, never both.

ALTER TABLE image_generation_jobs
  ADD COLUMN source_job_id uuid REFERENCES image_generation_jobs(id);

ALTER TABLE image_generation_jobs
  DROP CONSTRAINT image_generation_jobs_source_check;

ALTER TABLE image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_source_check
  CHECK (
    (operation = 'generate' AND source_upload_id IS NULL AND source_job_id IS NULL)
    OR
    (operation = 'edit' AND num_nonnulls(source_upload_id, source_job_id) = 1)
  );

CREATE TABLE image_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  draft text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_job_id uuid REFERENCES image_generation_jobs(id) ON DELETE SET NULL,
  state_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT image_chats_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX image_chats_owner_updated_idx
  ON image_chats (tenant_id, user_id, updated_at DESC, id DESC);

-- One row per role per turn. turn_id is the browser-generated clientMessageId,
-- so a resent request finds the accepted turn instead of creating another.
CREATE TABLE image_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES image_chats(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text NOT NULL DEFAULT 'none' CHECK (action IN ('none', 'generate', 'refine')),
  image_job_id uuid REFERENCES image_generation_jobs(id),
  source_job_id uuid REFERENCES image_generation_jobs(id),
  status text NOT NULL
    CHECK (status IN ('responding', 'image_pending', 'completed', 'failed', 'interrupted')),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT image_chat_messages_turn_role_key UNIQUE (chat_id, turn_id, role),
  CONSTRAINT image_chat_messages_job_check
    CHECK ((action = 'none') = (image_job_id IS NULL))
);

CREATE INDEX image_chat_messages_chat_seq_idx
  ON image_chat_messages (chat_id, seq);

-- A chat answers one turn at a time, whichever browser tab sent it.
CREATE UNIQUE INDEX image_chat_messages_one_responding_idx
  ON image_chat_messages (chat_id)
  WHERE status = 'responding';

CREATE INDEX image_chat_messages_open_idx
  ON image_chat_messages (status, updated_at)
  WHERE status IN ('responding', 'image_pending');

ALTER TABLE history
  DROP CONSTRAINT history_source_check;

ALTER TABLE history
  ADD CONSTRAINT history_source_check
  CHECK (source IS NULL OR source IN (
    'general',
    'document',
    'chat',
    'refine',
    'bg_replace',
    'element_extract',
    'style_transfer',
    'image-transform'
  ));

-- The worker records each chat result once, however often settlement retries.
CREATE UNIQUE INDEX history_chat_job_key
  ON history (image_job_id)
  WHERE source = 'chat';
