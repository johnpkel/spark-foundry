-- 014_spark_versions.sql
-- Adds spark_versions table for explicit editor version snapshots

CREATE TABLE spark_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spark_id uuid NOT NULL REFERENCES sparks(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  label text,
  content jsonb NOT NULL,
  scores jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_spark_versions_number ON spark_versions(spark_id, version_number);
CREATE INDEX idx_spark_versions_latest ON spark_versions(spark_id, created_at DESC);
