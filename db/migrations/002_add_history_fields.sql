-- Add missing history fields for userScript/stylePrompt

ALTER TABLE IF EXISTS history
  ADD COLUMN IF NOT EXISTS user_script text,
  ADD COLUMN IF NOT EXISTS style_prompt text;
