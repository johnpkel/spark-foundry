/**
 * Persistent webhook logger — fire-and-forget inserts to the
 * `webhook_logs` Supabase table for tracing Slack bot flows.
 */

import { supabaseAdmin } from './supabase/admin';

const MAX_PAYLOAD_BYTES = 10_000;

export interface WebhookLogEntry {
  correlation_id?: string;
  service?: string;       // default 'slack'
  direction: 'inbound' | 'outbound' | 'internal';
  level?: 'info' | 'error' | 'warn';
  route?: string;
  summary: string;
  duration_ms?: number;
  status_code?: number;
  payload?: unknown;
  error?: string;
}

/**
 * Generate a short correlation ID: `{prefix}_{timestamp}_{random5}`.
 */
export function generateCorrelationId(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * Fire-and-forget insert into `webhook_logs`.
 * Never throws — errors are logged to console.
 */
export function logWebhook(entry: WebhookLogEntry): void {
  // Truncate payload to prevent bloat
  let payload = entry.payload;
  if (payload !== undefined) {
    try {
      const json = JSON.stringify(payload);
      if (json.length > MAX_PAYLOAD_BYTES) {
        payload = JSON.parse(json.slice(0, MAX_PAYLOAD_BYTES) + '..."}}');
      }
    } catch {
      payload = { _truncated: true };
    }
  }

  const row = {
    correlation_id: entry.correlation_id ?? null,
    service: entry.service ?? 'slack',
    direction: entry.direction,
    level: entry.level ?? 'info',
    route: entry.route ?? null,
    summary: entry.summary,
    duration_ms: entry.duration_ms ?? null,
    status_code: entry.status_code ?? null,
    payload: payload ?? null,
    error: entry.error ?? null,
  };

  Promise.resolve(
    supabaseAdmin
      .from('webhook_logs')
      .insert(row)
      .then(({ error }) => {
        if (error) console.error('[webhook-logger] insert failed:', error.message);
      })
  ).catch((err: Error) => {
    console.error('[webhook-logger] insert exception:', err.message);
  });
}
