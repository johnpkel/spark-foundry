-- Persistent webhook log table for debugging Slack bot flows.
-- Each row represents one step in a request lifecycle, linked by correlation_id.

CREATE TABLE public.webhook_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  correlation_id text,
  service text NOT NULL DEFAULT 'slack',
  direction text NOT NULL,            -- 'inbound', 'outbound', 'internal'
  level text NOT NULL DEFAULT 'info',  -- 'info', 'error', 'warn'
  route text,                          -- '/api/slack/events', '/api/slack/worker', etc.
  summary text NOT NULL,
  duration_ms integer,
  status_code integer,
  payload jsonb,
  error text
);

CREATE INDEX idx_webhook_logs_correlation ON webhook_logs(correlation_id);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_level ON webhook_logs(level) WHERE level = 'error';
