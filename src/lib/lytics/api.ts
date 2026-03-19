/**
 * Lytics v2 API client.
 *
 * All calls are instrumented with the activity logger.
 * Auth: LYTICS_ACCESS_TOKEN via Authorization header.
 */

import { traceFetch } from '@/lib/activity-logger';
import type {
  EnrichResult,
  AudienceAlignment,
  OpportunityTopic,
  LyticsSegment,
  SegmentGroup,
  LyticsContentEntity,
} from './types';

// Re-export types (EnrichResult replaces the old ClassifyResult — same shape)
export type { EnrichResult, EnrichResult as ClassifyResult, AudienceAlignment, OpportunityTopic };

const LYTICS_BASE = 'https://api.lytics.io';
const MAX_ENRICH_CHARS = 2000;

// ─── Helpers ────────────────────────────────────────

async function getToken(): Promise<string> {
  // Try cookie-stored token first (user-configured via UI), fall back to env var
  try {
    const { getLyticsToken } = await import('@/app/api/auth/lytics/route');
    const token = await getLyticsToken();
    if (token) return token;
  } catch {
    // cookies() not available outside request context — fall back to env var
  }
  const token = process.env.LYTICS_ACCESS_TOKEN;
  if (!token) throw new Error('LYTICS_ACCESS_TOKEN is not configured');
  return token;
}

async function authHeaders(): Promise<HeadersInit> {
  return { Authorization: await getToken(), 'Content-Type': 'application/json' };
}

async function authHeadersGet(): Promise<HeadersInit> {
  return { Authorization: await getToken() };
}

// ─── Content: Enrich (classify text → topics) ───────

export async function enrichContent(text: string): Promise<EnrichResult> {
  const truncated = text.slice(0, MAX_ENRICH_CHARS);
  const url = `${LYTICS_BASE}/v2/content/enrich`;
  const token = await getToken();

  // NOTE: This endpoint requires form-encoded body, NOT JSON.
  // Sending JSON causes Lytics to classify the JSON structure itself.
  try {
    const { data } = await traceFetch<{ data: EnrichResult }>(
      'lytics',
      `enrich content (${truncated.length} chars)`,
      url,
      () => fetch(url, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(truncated)}`,
      }),
      { method: 'POST' },
    );

    const result = (data as { data?: EnrichResult })?.data;
    return {
      topics: result?.topics ?? {},
      inferred_topics: result?.inferred_topics ?? {},
    };
  } catch {
    // Lytics may return 500 "Could not classify content" for some inputs
    return { topics: {}, inferred_topics: {} };
  }
}

// ─── Content: Align (topics → audience segments) ────

export async function alignContent(
  topics: Record<string, number>,
): Promise<AudienceAlignment[]> {
  const url = `${LYTICS_BASE}/v2/content/align`;
  const body = { topics };
  const hdrs = await authHeaders();

  const { data } = await traceFetch<{ data: AudienceAlignment[] }>(
    'lytics',
    `align content (${Object.keys(topics).length} topics)`,
    url,
    () => fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) }),
    { method: 'POST', requestBody: body },
  );

  const alignments = (data as { data?: AudienceAlignment[] })?.data;
  return Array.isArray(alignments) ? alignments : [];
}

// ─── Content: Opportunity ───────────────────────────

export async function getOpportunity(): Promise<OpportunityTopic[]> {
  const url = `${LYTICS_BASE}/v2/content/opportunity`;
  const hdrs = await authHeadersGet();

  const { data } = await traceFetch<{ data: { topics: OpportunityTopic[] } }>(
    'lytics',
    'content opportunity',
    url,
    () => fetch(url, { headers: hdrs }),
    { method: 'GET' },
  );

  const result = (data as { data?: { topics?: OpportunityTopic[] } })?.data;
  return Array.isArray(result?.topics) ? result.topics : [];
}

// ─── Content: Entity (by URL) ───────────────────────

export async function getContentByUrl(contentUrl: string): Promise<LyticsContentEntity | null> {
  const params = new URLSearchParams({ url: contentUrl });
  const url = `${LYTICS_BASE}/v2/content/entity?${params}`;
  const hdrs = await authHeadersGet();

  try {
    const { data } = await traceFetch<{ data: LyticsContentEntity }>(
      'lytics',
      `content entity: ${contentUrl.slice(0, 60)}`,
      url,
      () => fetch(url, { headers: hdrs }),
      { method: 'GET' },
    );

    const entity = (data as { data?: LyticsContentEntity })?.data;
    return entity?.url ? entity : null;
  } catch {
    return null;
  }
}

// ─── Segments ───────────────────────────────────────

export async function getSegments(sizes = true): Promise<LyticsSegment[]> {
  const params = new URLSearchParams();
  if (sizes) params.set('sizes', 'true');
  const url = `${LYTICS_BASE}/v2/segment?${params}`;
  const hdrs = await authHeadersGet();

  const { data } = await traceFetch<{ data: LyticsSegment[] }>(
    'lytics',
    'list segments',
    url,
    () => fetch(url, { headers: hdrs }),
    { method: 'GET' },
  );

  const segments = (data as { data?: LyticsSegment[] })?.data;
  return Array.isArray(segments) ? segments : [];
}

// ─── Segment Groups ─────────────────────────────────

export async function getSegmentGroups(): Promise<SegmentGroup[]> {
  const url = `${LYTICS_BASE}/v2/segment/group`;
  const hdrs = await authHeadersGet();

  const { data } = await traceFetch<{ data: SegmentGroup[] }>(
    'lytics',
    'list segment groups',
    url,
    () => fetch(url, { headers: hdrs }),
    { method: 'GET' },
  );

  const groups = (data as { data?: SegmentGroup[] })?.data;
  return Array.isArray(groups) ? groups : [];
}

// ─── Segment Scan (v1 only — no v2 equivalent) ─────

export async function scanSegment(
  segmentId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${LYTICS_BASE}/api/segment/${segmentId}/scan?${params}`;
  const hdrs = await authHeadersGet();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const { data } = await traceFetch<{ data: Record<string, unknown>[] }>(
      'lytics',
      `scan segment ${segmentId.slice(0, 8)}… (limit ${limit})`,
      url,
      () => fetch(url, { headers: hdrs, signal: controller.signal }),
      { method: 'GET' },
    );

    const profiles = (data as { data?: Record<string, unknown>[] })?.data;
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return []; // graceful timeout/failure
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Utility: check if Lytics is configured ────────

export async function isLyticsConfigured(): Promise<boolean> {
  try {
    const { getLyticsToken } = await import('@/app/api/auth/lytics/route');
    const token = await getLyticsToken();
    if (token) return true;
  } catch {
    // Fall back to env var check
  }
  return !!process.env.LYTICS_ACCESS_TOKEN;
}
