-- Add 'clarity_insight' to the spark_items type CHECK constraint
ALTER TABLE public.spark_items
  DROP CONSTRAINT IF EXISTS spark_items_type_check;

ALTER TABLE public.spark_items
  ADD CONSTRAINT spark_items_type_check
  CHECK (type IN ('link', 'image', 'text', 'file', 'note', 'google_drive', 'slack_message', 'contentstack_entry', 'contentstack_asset', 'clarity_insight'));
