-- Add templates table for reusable prompt+style snapshots

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  user_script text,
  style_prompt text,
  style_id uuid REFERENCES styles(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  preview_url text,
  category text DEFAULT 'general',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_tenant_idx ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS templates_category_idx ON templates(tenant_id, category);
