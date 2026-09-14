BEGIN;

CREATE TABLE image_models (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  label text NOT NULL,
  api_type text NOT NULL CHECK (api_type = 'azure-openai-images-v1'),
  deployment_name text NOT NULL,
  endpoint text NOT NULL,
  api_key_encrypted text NOT NULL,
  supported_qualities text[] NOT NULL,
  default_quality text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, model_key),
  CHECK (model_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  CHECK (
    cardinality(supported_qualities) > 0
    AND array_position(supported_qualities, NULL) IS NULL
    AND supported_qualities <@ ARRAY['low', 'medium', 'high', 'xhigh', 'max', 'auto']::text[]
    AND default_quality = ANY(supported_qualities)
  )
);

CREATE UNIQUE INDEX image_models_tenant_label_uidx
  ON image_models (tenant_id, lower(trim(label)));

ALTER TABLE tenant_model_settings
  ALTER COLUMN allowed_models SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN default_model DROP NOT NULL,
  ALTER COLUMN default_model DROP DEFAULT;

ALTER TABLE image_generation_jobs
  DROP CONSTRAINT image_generation_jobs_quality_check;
ALTER TABLE image_generation_jobs
  ADD CONSTRAINT image_generation_jobs_quality_check
  CHECK (quality IN ('low', 'medium', 'high', 'xhigh', 'max', 'auto'));

ALTER TABLE history
  ADD COLUMN image_job_id uuid REFERENCES image_generation_jobs(id) ON DELETE RESTRICT;
CREATE INDEX history_image_job_idx ON history(image_job_id);

ALTER TABLE deck_generation_jobs ADD COLUMN image_model_key text;
CREATE INDEX deck_jobs_active_image_model_idx
  ON deck_generation_jobs(tenant_id, image_model_key)
  WHERE status IN ('queued', 'processing');
CREATE INDEX image_jobs_active_model_idx
  ON image_generation_jobs(tenant_id, model)
  WHERE status IN ('queued', 'processing');

COMMIT;
