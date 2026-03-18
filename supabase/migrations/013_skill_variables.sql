-- Add variables column to skills table
ALTER TABLE skills ADD COLUMN variables JSONB DEFAULT '[]'::jsonb;

-- Per-Spark variable overrides (each Spark can fill in its own values)
CREATE TABLE skill_variable_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  spark_id UUID NOT NULL REFERENCES sparks(id) ON DELETE CASCADE,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(skill_id, spark_id)
);
