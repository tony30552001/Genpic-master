BEGIN;

-- Tenant-level Azure AI Speech settings (encrypted API key via secretCrypto.js).
ALTER TABLE tenant_video_settings
  ADD COLUMN IF NOT EXISTS speech_region text,
  ADD COLUMN IF NOT EXISTS speech_endpoint text,
  ADD COLUMN IF NOT EXISTS speech_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS speech_default_voice text NOT NULL DEFAULT 'zh-TW-HsiaoChenNeural'
    CHECK (speech_default_voice IN (
      'zh-TW-HsiaoChenNeural',
      'zh-TW-YunJheNeural',
      'zh-TW-HsiaoYuNeural'
    ));

-- Project-level timeline metadata: aspect ratio, audio preference, whether the
-- project requires video_renders composition (multi-segment, static image shots,
-- narration, onScreenText or fade transition), and pre-synthesized narration
-- assets so render retries never re-bill Azure Speech.
ALTER TABLE video_projects
  ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '16:9',
  ADD COLUMN IF NOT EXISTS generate_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_render boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS narration_assets jsonb;

-- Backfill needs_render for existing multi-segment projects.
UPDATE video_projects p
SET needs_render = true
WHERE (SELECT COUNT(*) FROM video_generation_jobs j WHERE j.project_id = p.id) > 1;

-- Rendered subtitle (.srt) output and synthesized narration character count.
ALTER TABLE video_renders
  ADD COLUMN IF NOT EXISTS subtitle_blob_name text,
  ADD COLUMN IF NOT EXISTS subtitle_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS narration_characters integer NOT NULL DEFAULT 0
    CHECK (narration_characters >= 0);

COMMIT;
