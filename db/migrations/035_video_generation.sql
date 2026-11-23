BEGIN;

CREATE TABLE video_models (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  label text NOT NULL,
  family text NOT NULL CHECK (family IN ('minimax-h3-max', 'kling-v3-pro')),
  endpoint text NOT NULL,
  deployment_name text NOT NULL,
  api_key_encrypted text NOT NULL,
  max_duration_seconds integer NOT NULL CHECK (max_duration_seconds BETWEEN 1 AND 15),
  max_resolution text CHECK (max_resolution IN ('480P', '768P', '1080P')),
  allow_audio boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, model_key),
  CHECK (model_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$')
);

CREATE UNIQUE INDEX video_models_tenant_label_uidx
  ON video_models (tenant_id, lower(trim(label)));

CREATE TABLE tenant_video_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  allowed_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  daily_quota_per_user integer NOT NULL DEFAULT 5 CHECK (daily_quota_per_user > 0),
  submits_per_minute integer NOT NULL DEFAULT 2 CHECK (submits_per_minute > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN video_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE video_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('t2v', 'i2v')),
  prompt text NOT NULL,
  original_prompt text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  phase text NOT NULL DEFAULT 'queued'
    CHECK (phase IN ('queued', 'submitting', 'polling', 'storing', 'completed')),
  provider_request_id text,
  submitted_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  lock_version bigint NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  next_poll_at timestamptz,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 1 AND 15),
  resolution text,
  aspect_ratio text,
  generate_audio boolean NOT NULL DEFAULT false,
  source_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT,
  source_image_job_id uuid REFERENCES image_generation_jobs(id) ON DELETE RESTRICT,
  end_source_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT,
  end_source_image_job_id uuid REFERENCES image_generation_jobs(id) ON DELETE RESTRICT,
  result_blob_name text,
  result_mime_type text,
  result_size_bytes bigint,
  result_duration_seconds numeric,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (mode = 't2v' AND source_upload_id IS NULL AND source_image_job_id IS NULL)
    OR
    (mode = 'i2v' AND
      ((source_upload_id IS NOT NULL)::integer
       + (source_image_job_id IS NOT NULL)::integer) = 1)
  ),
  CHECK ((end_source_upload_id IS NULL AND end_source_image_job_id IS NULL)
    OR mode = 'i2v'),
  CHECK (((end_source_upload_id IS NOT NULL)::integer
       + (end_source_image_job_id IS NOT NULL)::integer) <= 1)
);

CREATE INDEX video_jobs_queue_idx
  ON video_generation_jobs(status, phase, available_at, next_poll_at, created_at);
CREATE INDEX video_jobs_user_idx
  ON video_generation_jobs(tenant_id, user_id, created_at DESC);
CREATE INDEX video_jobs_active_model_idx
  ON video_generation_jobs(tenant_id, model_key)
  WHERE status IN ('queued', 'processing');

ALTER TABLE history
  ADD COLUMN video_job_id uuid REFERENCES video_generation_jobs(id) ON DELETE RESTRICT;

ALTER TABLE history
  ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE history
  DROP CONSTRAINT IF EXISTS history_asset_check;
ALTER TABLE history
  ADD CONSTRAINT history_asset_check
  CHECK (
    ((image_url IS NOT NULL AND image_url <> '') AND video_job_id IS NULL)
    OR
    ((image_url IS NULL OR image_url = '') AND video_job_id IS NOT NULL)
  );

ALTER TABLE history
  DROP CONSTRAINT IF EXISTS history_source_check;
ALTER TABLE history
  ADD CONSTRAINT history_source_check
  CHECK (source IS NULL OR source IN (
    'general', 'document', 'chat', 'refine', 'bg_replace',
    'element_extract', 'style_transfer', 'image-transform', 'video'
  ));

CREATE INDEX history_video_job_idx ON history(video_job_id);

COMMIT;
