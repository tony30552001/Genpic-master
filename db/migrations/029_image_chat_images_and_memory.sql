-- A chat reply can queue several images, and each user keeps one preference
-- memory the chat assistant follows in every chat.

-- Images move off the message row: one row per queued job, in reply order.
CREATE TABLE image_chat_images (
  job_id uuid PRIMARY KEY REFERENCES image_generation_jobs(id),
  message_id uuid NOT NULL REFERENCES image_chat_messages(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  action text NOT NULL CHECK (action IN ('generate', 'refine')),
  source_job_id uuid REFERENCES image_generation_jobs(id),
  prompt text NOT NULL,
  CONSTRAINT image_chat_images_message_position_key UNIQUE (message_id, position)
);

INSERT INTO image_chat_images (job_id, message_id, position, action, source_job_id, prompt)
SELECT image_job_id, id, 0, action, source_job_id, COALESCE(input->>'prompt', '')
FROM image_chat_messages
WHERE image_job_id IS NOT NULL;

UPDATE image_chat_messages SET input = '{}'::jsonb WHERE role = 'assistant';

ALTER TABLE image_chat_messages
  DROP CONSTRAINT image_chat_messages_job_check,
  DROP COLUMN action,
  DROP COLUMN image_job_id,
  DROP COLUMN source_job_id;

-- Markdown text the user can read and edit; the assistant appends to it.
CREATE TABLE image_chat_memories (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT image_chat_memories_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE CASCADE
);
