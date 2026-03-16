-- Skills: reusable instruction packages for the Spark assistant.
-- Follows progressive disclosure: metadata (name + description) is always
-- in the system prompt; full instructions load on-demand via the use_skill tool.

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spark_id UUID REFERENCES sparks(id) ON DELETE CASCADE, -- NULL = global skill
  name TEXT NOT NULL CHECK (char_length(name) <= 64 AND name ~ '^[a-z0-9-]+$'),
  description TEXT NOT NULL CHECK (char_length(description) <= 1024),
  instructions TEXT NOT NULL,
  resources JSONB DEFAULT '[]'::jsonb,  -- [{name: string, content: string}]
  tool_scope TEXT[] DEFAULT NULL,       -- NULL = all tools; else filtered subset
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fetch skills for a specific Spark (includes global skills)
CREATE INDEX idx_skills_spark_id ON skills(spark_id);
CREATE INDEX idx_skills_global ON skills(spark_id) WHERE spark_id IS NULL;
