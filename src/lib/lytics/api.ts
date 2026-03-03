/**
 * Lytics Content Affinity API client.
 *
 * Provides topic classification, audience alignment, and opportunity insights
 * for editor content scoring. All calls are instrumented with the activity
 * logger so they appear in the Activity Log panel.
 *
 * API reference: https://docs.lytics.com/docs/content-affinity-api
 */

import { traceFetch } from '@/lib/activity-logger';

const LYTICS_BASE = 'https://api.lytics.io';

// ─── Types ──────────────────────────────────────────

export interface ClassifyResult {
  /** topic slug → confidence 0-1 */
  topics: Record<string, number>;
  /** inferred (lower-confidence) topics */
  inferred_topics: Record<string, number>;
}

export interface AudienceAlignment {
  segment_id: string;
  segment_name: string;
  segment_size: number;
  /** 0-1 alignment score */
  alignment: number;
}

export interface OpportunityDimension {
  label: string;
  value: number;
  subject: string;
}

export interface OpportunityTopic {
  topic: string;
  dimensions: OpportunityDimension[];
  segments: string[];
}

// ─── Helpers ────────────────────────────────────────

function getToken(): string {
  const token = process.env.LYTICS_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LYTICS_ACCESS_TOKEN is not configured');
  }
  return token;
}

function headers(): HeadersInit {
  return {
    Authorization: getToken(),
    'Content-Type': 'application/json',
  };
}

// ─── classify ───────────────────────────────────────

/**
 * Classify text content into topics via the Lytics Content Classify API.
 *
 * GET /api/content/classify?text=...
 */
export async function classifyContent(text: string): Promise<ClassifyResult> {
  const params = new URLSearchParams({ text });
  const url = `${LYTICS_BASE}/api/content/classify?${params.toString()}`;

  const { data } = await traceFetch<{ data: ClassifyResult }>(
    'lytics',
    `classify content (${text.length} chars)`,
    url,
    () => fetch(url, { headers: headers() }),
    { method: 'GET' },
  );

  // The API wraps the result in a `data` envelope
  const result = (data as { data?: ClassifyResult })?.data;

  return {
    topics: result?.topics ?? {},
    inferred_topics: result?.inferred_topics ?? {},
  };
}

// ─── align ──────────────────────────────────────────

/**
 * Get audience alignment scores for a set of topics.
 *
 * POST /api/content/topics
 */
export async function getAudienceAlignment(
  topics: Record<string, number>,
): Promise<AudienceAlignment[]> {
  const url = `${LYTICS_BASE}/api/content/topics`;
  const body = { topics };

  const { data } = await traceFetch<{ data: AudienceAlignment[] }>(
    'lytics',
    `audience alignment (${Object.keys(topics).length} topics)`,
    url,
    () => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }),
    { method: 'POST', requestBody: body },
  );

  const alignments = (data as { data?: AudienceAlignment[] })?.data;
  return Array.isArray(alignments) ? alignments : [];
}

// ─── opportunities ──────────────────────────────────

/**
 * Fetch content opportunity data for known topics.
 *
 * GET /api/content/topics
 */
export async function getOpportunities(): Promise<OpportunityTopic[]> {
  const url = `${LYTICS_BASE}/api/content/topics`;

  const { data } = await traceFetch<{ data: OpportunityTopic[] }>(
    'lytics',
    'content opportunities',
    url,
    () => fetch(url, { headers: headers() }),
    { method: 'GET' },
  );

  const topics = (data as { data?: OpportunityTopic[] })?.data;
  return Array.isArray(topics) ? topics : [];
}
