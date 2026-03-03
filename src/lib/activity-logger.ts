/**
 * Server-side activity logger for debugging.
 *
 * Maintains a circular in-memory buffer of log entries and broadcasts
 * new entries to SSE subscribers via an EventEmitter.
 *
 * Only one instance exists per Node.js process (module-level singleton),
 * which works fine in Next.js dev mode (single process).
 */

import { EventEmitter } from 'events';

export type LogService =
  | 'anthropic'
  | 'voyage'
  | 'supabase'
  | 'contentstack'
  | 'google'
  | 'slack'
  | 'clarity'
  | 'lytics'
  | 'internal';

export type LogDirection = 'request' | 'response' | 'event';
export type LogLevel = 'info' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  service: LogService;
  direction: LogDirection;
  level: LogLevel;
  method?: string;
  url?: string;
  summary: string;
  statusCode?: number;
  duration?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
  correlationId?: string;
}

// ─── Circular buffer ────────────────────────────────────

const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];
let entryCounter = 0;

// ─── EventEmitter for SSE subscribers ──────────────────

export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50); // allow many SSE connections

// ─── Core API ───────────────────────────────────────────

export function addLogEntry(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const fullEntry: LogEntry = {
    ...entry,
    id: `log_${Date.now()}_${entryCounter++}`,
    timestamp: Date.now(),
  };

  if (entries.length >= MAX_ENTRIES) {
    entries.shift(); // drop oldest
  }
  entries.push(fullEntry);
  logEmitter.emit('entry', fullEntry);
  return fullEntry;
}

export function getRecentEntries(limit = MAX_ENTRIES): LogEntry[] {
  return entries.slice(-limit).reverse(); // newest first
}

export function clearEntries(): void {
  entries.length = 0;
  logEmitter.emit('clear');
}

// ─── traceFetch helper ──────────────────────────────────

/**
 * Wraps a fetch call with automatic request/response logging.
 *
 * Usage:
 *   const result = await traceFetch('voyage', 'embed query', url, () => fetch(url, opts));
 */
export async function traceFetch<T>(
  service: LogService,
  label: string,
  url: string,
  fetchFn: () => Promise<Response>,
  options?: {
    method?: string;
    requestBody?: unknown;
    correlationId?: string;
  }
): Promise<{ response: Response; data: T }> {
  const correlationId = options?.correlationId ?? `corr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const start = Date.now();

  addLogEntry({
    service,
    direction: 'request',
    level: 'info',
    method: options?.method ?? 'GET',
    url,
    summary: label,
    requestBody: options?.requestBody,
    correlationId,
  });

  let response: Response;
  try {
    response = await fetchFn();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    addLogEntry({
      service,
      direction: 'response',
      level: 'error',
      method: options?.method ?? 'GET',
      url,
      summary: `${label} — network error`,
      error,
      duration: Date.now() - start,
      correlationId,
    });
    throw err;
  }

  const duration = Date.now() - start;
  const level: LogLevel = response.ok ? 'info' : 'error';

  // Clone so caller can still read the body
  const cloned = response.clone();
  let responseBody: unknown;
  try {
    responseBody = await cloned.json();
  } catch {
    // Binary or non-JSON response — skip body logging
  }

  addLogEntry({
    service,
    direction: 'response',
    level,
    method: options?.method ?? 'GET',
    url,
    summary: `${label} — ${response.status}`,
    statusCode: response.status,
    duration,
    responseBody: level === 'error' ? responseBody : undefined,
    correlationId,
  });

  return { response, data: responseBody as T };
}
