# Lytics Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Lytics audience intelligence as an ambient data layer into Spark Foundry's Content Scoring panel and chat assistant, with Claude AI providing strategic analysis grounded in real Lytics data.

**Architecture:** Lytics data is cached in a server-side singleton (`LyticsDataService`) that refreshes on page load, editor changes, and explicit Analyze clicks. The ScorePanel renders Lytics data immediately from cache (Layer 1) and triggers full AI analysis on demand (Layer 2). The chat agent gets a `lytics_insights` tool to answer audience/content questions.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Anthropic Claude claude-sonnet-4-6, Lytics REST API (v2 endpoints, `Authorization` header auth)

**Spec:** `docs/superpowers/specs/2026-03-18-lytics-integration-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `src/lib/lytics/types.ts` | All TypeScript types for Lytics data models |
| `src/lib/lytics/data-service.ts` | Singleton cache: holds segments, opportunity, enrichment results; manages refresh lifecycle |
| `src/app/api/lytics/data/route.ts` | `GET` — return cached Lytics state (segments, groups, opportunity) |
| `src/app/api/lytics/enrich/route.ts` | `POST` — debounced editor enrichment (topics + audience alignment) |

### Modified Files

| File | What Changes |
|---|---|
| `src/lib/lytics/api.ts` | Fix 3 broken endpoints to v2, add 5 new API methods, rename existing methods |
| `src/app/api/lytics/analyze/route.ts` | Rewrite: full Lytics refresh + Claude AI with Lytics context injection |
| `src/components/ScorePanel.tsx` | Three-layer UI: always-on Lytics data, full analysis, restructured sections |
| `src/lib/agent/tools-registry.ts` | Replace 3 old Lytics tools with unified `lytics_insights` tool |

---

## Task 1: Lytics Types

**Files:**
- Create: `src/lib/lytics/types.ts`

- [ ] **Step 1: Create the types file**

All Lytics data model types in one place. These are referenced by every other file.

```typescript
// src/lib/lytics/types.ts

// ─── Content Enrichment ─────────────────────────

export interface EnrichResult {
  topics: Record<string, number>;
  inferred_topics: Record<string, number>;
}

// ─── Content Alignment ──────────────────────────

export interface AudienceAlignment {
  segment_id: string;
  segment_name: string;
  segment_size: number;
  alignment: number; // 0-1
  segment_topics?: Record<string, number>;
}

// ─── Content Opportunity ────────────────────────

export interface OpportunityDimension {
  label: string;
  value: number;
  subject: 'user' | 'content';
}

export interface OpportunityTopic {
  topic: string;
  dimensions: OpportunityDimension[];
  segments: string[];
  context_layer: string;
}

// ─── Segments ───────────────────────────────────

export interface LyticsSegment {
  id: string;
  slug_name: string;
  name: string;
  description: string;
  kind: string;
  table: string;
  size?: number; // present when fetched with sizes=true
  tags: string[];
  groups: string[];
  segment_ql: string;
  is_public: boolean;
  public_name: string;
  category: string;
  created: string;
  updated: string;
}

export interface SegmentGroup {
  id: string;
  name: string;
  description?: string;
}

// ─── Content Entity ─────────────────────────────

export interface LyticsContentEntity {
  url: string;
  title: string;
  author: string;
  description: string;
  lytics: Record<string, number>;
  global: Record<string, number>;
  _segments: string[];
  created: string;
  _modified: string;
}

// ─── Aggregate Profile Affinities ───────────────

export interface AggregateAffinity {
  segmentName: string;
  topAffinities: { topic: string; score: number }[];
}

// ─── Formatted types for API responses ──────────

export interface FormattedTopic {
  name: string;
  score: number; // 0-100
}

export interface FormattedAudience {
  name: string;
  alignment: number; // 0-100
  size: number;      // raw profile count
}

// ─── Opportunity helpers ────────────────────────

/** Extract a named dimension value from an OpportunityTopic */
export function getDimension(topic: OpportunityTopic, label: string): number {
  return topic.dimensions.find((d) => d.label === label)?.value ?? 0;
}

/** Compute opportunity score: high users + low docs = high opportunity */
export function computeOpportunityScore(
  topic: OpportunityTopic,
  maxUsers: number,
  maxDocs: number,
): number {
  const users = getDimension(topic, 'User Count');
  const docs = getDimension(topic, 'Document Count');
  if (maxUsers === 0) return 0;
  const userRatio = users / maxUsers;
  const docRatio = maxDocs > 0 ? docs / maxDocs : 0;
  return Math.round(userRatio * (1 - docRatio) * 100);
}

// ─── Data Service Cache Shape ───────────────────

export interface LyticsCache {
  segments: LyticsSegment[];
  segmentGroups: SegmentGroup[];
  opportunity: OpportunityTopic[];
  /** Editor-specific: current content's topics */
  contentTopics: FormattedTopic[];
  contentInferredTopics: FormattedTopic[];
  /** Editor-specific: current content's audience alignment */
  contentAudiences: FormattedAudience[];
  lastRefreshed: string; // ISO timestamp
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/johnkelly/coding/Spark Foundry Sandbox/spark-foundry" && npx tsc --noEmit src/lib/lytics/types.ts 2>&1 | head -20`

Expected: No errors (this file has no imports).

- [ ] **Step 3: Commit**

```bash
git add src/lib/lytics/types.ts
git commit -m "feat(lytics): add TypeScript types for Lytics data models"
```

---

## Task 2: Fix and Expand Lytics API Client

**Files:**
- Modify: `src/lib/lytics/api.ts`

The existing file has 3 methods using broken `/api/` endpoints. Replace them with correct `/v2/` endpoints and add new methods for segments, opportunity, scan, and content entity lookup.

- [ ] **Step 1: Rewrite api.ts with fixed endpoints and new methods**

Replace the entire file. Key changes:
- `classifyContent()` → `enrichContent()` using `POST /v2/content/enrich`
- `getAudienceAlignment()` → `alignContent()` using `POST /v2/content/align`
- `getOpportunities()` → `getOpportunity()` using `GET /v2/content/opportunity`
- Add: `getSegments(sizes)`, `getSegmentGroups()`, `scanSegment()`, `getContentByUrl()`
- Keep existing auth pattern (`Authorization` header)
- Keep `traceFetch` instrumentation
- Import types from `./types.ts` instead of defining inline
- Truncate text to 4,000 chars in `enrichContent()`

```typescript
// src/lib/lytics/api.ts
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
const MAX_ENRICH_CHARS = 4000;

// ─── Helpers ────────────────────────────────────────

function getToken(): string {
  const token = process.env.LYTICS_ACCESS_TOKEN;
  if (!token) throw new Error('LYTICS_ACCESS_TOKEN is not configured');
  return token;
}

function headers(): HeadersInit {
  return { Authorization: getToken(), 'Content-Type': 'application/json' };
}

function headersGet(): HeadersInit {
  return { Authorization: getToken() };
}

// ─── Content: Enrich (classify text → topics) ───────

export async function enrichContent(text: string): Promise<EnrichResult> {
  const truncated = text.slice(0, MAX_ENRICH_CHARS);
  const url = `${LYTICS_BASE}/v2/content/enrich`;

  // NOTE: This endpoint requires form-encoded body, NOT JSON.
  // Sending JSON causes Lytics to classify the JSON structure itself.
  const { data } = await traceFetch<{ data: EnrichResult }>(
    'lytics',
    `enrich content (${truncated.length} chars)`,
    url,
    () => fetch(url, {
      method: 'POST',
      headers: { Authorization: getToken(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `text=${encodeURIComponent(truncated)}`,
    }),
    { method: 'POST' },
  );

  const result = (data as { data?: EnrichResult })?.data;
  return {
    topics: result?.topics ?? {},
    inferred_topics: result?.inferred_topics ?? {},
  };
}

// ─── Content: Align (topics → audience segments) ────

export async function alignContent(
  topics: Record<string, number>,
): Promise<AudienceAlignment[]> {
  const url = `${LYTICS_BASE}/v2/content/align`;
  const body = { topics };

  const { data } = await traceFetch<{ data: AudienceAlignment[] }>(
    'lytics',
    `align content (${Object.keys(topics).length} topics)`,
    url,
    () => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }),
    { method: 'POST', requestBody: body },
  );

  const alignments = (data as { data?: AudienceAlignment[] })?.data;
  return Array.isArray(alignments) ? alignments : [];
}

// ─── Content: Opportunity ───────────────────────────

export async function getOpportunity(): Promise<OpportunityTopic[]> {
  const url = `${LYTICS_BASE}/v2/content/opportunity`;

  const { data } = await traceFetch<{ data: { topics: OpportunityTopic[] } }>(
    'lytics',
    'content opportunity',
    url,
    () => fetch(url, { headers: headersGet() }),
    { method: 'GET' },
  );

  const result = (data as { data?: { topics?: OpportunityTopic[] } })?.data;
  return Array.isArray(result?.topics) ? result.topics : [];
}

// ─── Content: Entity (by URL) ───────────────────────

export async function getContentByUrl(contentUrl: string): Promise<LyticsContentEntity | null> {
  const params = new URLSearchParams({ url: contentUrl });
  const url = `${LYTICS_BASE}/v2/content/entity?${params}`;

  try {
    const { data } = await traceFetch<{ data: LyticsContentEntity }>(
      'lytics',
      `content entity: ${contentUrl.slice(0, 60)}`,
      url,
      () => fetch(url, { headers: headersGet() }),
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

  const { data } = await traceFetch<{ data: LyticsSegment[] }>(
    'lytics',
    'list segments',
    url,
    () => fetch(url, { headers: headersGet() }),
    { method: 'GET' },
  );

  const segments = (data as { data?: LyticsSegment[] })?.data;
  return Array.isArray(segments) ? segments : [];
}

// ─── Segment Groups ─────────────────────────────────

export async function getSegmentGroups(): Promise<SegmentGroup[]> {
  const url = `${LYTICS_BASE}/v2/segment/group`;

  const { data } = await traceFetch<{ data: SegmentGroup[] }>(
    'lytics',
    'list segment groups',
    url,
    () => fetch(url, { headers: headersGet() }),
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const { data } = await traceFetch<{ data: Record<string, unknown>[] }>(
      'lytics',
      `scan segment ${segmentId.slice(0, 8)}… (limit ${limit})`,
      url,
      () => fetch(url, { headers: headersGet(), signal: controller.signal }),
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

export function isLyticsConfigured(): boolean {
  return !!process.env.LYTICS_ACCESS_TOKEN;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/johnkelly/coding/Spark Foundry Sandbox/spark-foundry" && npx tsc --noEmit src/lib/lytics/api.ts 2>&1 | head -20`

Expected: No errors. Live API verification will happen in Task 4 via the `/api/lytics/enrich` route.

- [ ] **Step 3: Commit**

```bash
git add src/lib/lytics/api.ts
git commit -m "feat(lytics): fix broken endpoints to v2, add segment/opportunity/scan methods"
```

---

## Task 3: Lytics Data Service (Singleton Cache)

**Files:**
- Create: `src/lib/lytics/data-service.ts`

This is the core of the ambient data layer. A singleton that holds cached Lytics data and manages refresh.

- [ ] **Step 1: Create the data service**

```typescript
// src/lib/lytics/data-service.ts
/**
 * Lytics Data Service — singleton cache for ambient Lytics data.
 *
 * Cached in-memory per process. Single-tenant (one LYTICS_ACCESS_TOKEN).
 * Follows the same singleton pattern as activity-logger.ts.
 */

import {
  enrichContent,
  alignContent,
  getOpportunity,
  getSegments,
  getSegmentGroups,
  scanSegment,
  isLyticsConfigured,
} from './api';
import type {
  LyticsCache,
  FormattedTopic,
  FormattedAudience,
  AggregateAffinity,
  OpportunityTopic,
  LyticsSegment,
  SegmentGroup,
} from './types';

// ─── Singleton state ────────────────────────────────

let cache: LyticsCache = {
  segments: [],
  segmentGroups: [],
  opportunity: [],
  contentTopics: [],
  contentInferredTopics: [],
  contentAudiences: [],
  lastRefreshed: '',
};

let isRefreshing = false;

// ─── Public API ─────────────────────────────────────

/** Get the current cached data (never calls Lytics API). */
export function getData(): LyticsCache {
  return cache;
}

/** Check if Lytics is available. */
export function isAvailable(): boolean {
  return isLyticsConfigured();
}

/**
 * Refresh global data: segments, segment groups, opportunity.
 * Called on Spark load and on Analyze button click.
 * Safe to call concurrently — deduplicates in-flight requests.
 */
export async function refreshGlobalData(): Promise<void> {
  if (!isLyticsConfigured() || isRefreshing) return;
  isRefreshing = true;

  try {
    const [segments, groups, opportunity] = await Promise.all([
      getSegments(true),
      getSegmentGroups(),
      getOpportunity(),
    ]);

    cache = {
      ...cache,
      segments,
      segmentGroups: groups,
      opportunity,
      lastRefreshed: new Date().toISOString(),
    };
  } finally {
    isRefreshing = false;
  }
}

/**
 * Enrich editor content: classify into topics + align with audiences.
 * Called on debounced editor changes and on Analyze button click.
 * Returns the formatted results (also stored in cache).
 */
export async function enrichEditorContent(
  text: string,
): Promise<{ topics: FormattedTopic[]; inferredTopics: FormattedTopic[]; audiences: FormattedAudience[] }> {
  if (!isLyticsConfigured()) {
    return { topics: [], inferredTopics: [], audiences: [] };
  }

  const enrichResult = await enrichContent(text);

  // Format topics
  const topics = formatTopics(enrichResult.topics);
  const inferredTopics = formatTopics(enrichResult.inferred_topics);

  // Merge for alignment (high-confidence overrides inferred)
  const allTopics = { ...enrichResult.inferred_topics, ...enrichResult.topics };

  // Align with audiences if we got topics
  let audiences: FormattedAudience[] = [];
  if (Object.keys(allTopics).length > 0) {
    const alignments = await alignContent(allTopics);
    audiences = alignments
      .map((a) => ({
        name: a.segment_name,
        alignment: Math.round(a.alignment * 100),
        size: a.segment_size,
      }))
      .sort((a, b) => b.alignment - a.alignment);
  }

  // Update cache
  cache = {
    ...cache,
    contentTopics: topics,
    contentInferredTopics: inferredTopics,
    contentAudiences: audiences,
  };

  return { topics, inferredTopics, audiences };
}

/**
 * Sample aggregate profile affinities for the top N aligned segments.
 * Called on Analyze only (expensive). Returns top topic affinities per segment.
 */
export async function sampleAggregateAffinities(
  topN = 5,
): Promise<AggregateAffinity[]> {
  if (!isLyticsConfigured()) return [];

  // Use the top aligned audiences from the current cache
  const topAudiences = cache.contentAudiences.slice(0, topN);
  if (topAudiences.length === 0) return [];

  // Find segment IDs from cached segments
  const results: AggregateAffinity[] = [];

  for (const audience of topAudiences) {
    const segment = cache.segments.find((s) => s.name === audience.name);
    if (!segment) continue;

    const profiles = await scanSegment(segment.id, 50);
    if (profiles.length === 0) continue;

    // Aggregate topic affinities across sampled profiles
    const topicScores = new Map<string, number[]>();
    for (const profile of profiles) {
      // Lytics stores topic affinities as fields like "lytics_content_*"
      for (const [key, value] of Object.entries(profile)) {
        if (key.startsWith('lytics_content_') && typeof value === 'number') {
          const topic = key.replace('lytics_content_', '').replace(/_/g, ' ');
          if (!topicScores.has(topic)) topicScores.set(topic, []);
          topicScores.get(topic)!.push(value);
        }
      }
    }

    // Average scores, sort by score, take top 10
    const affinities = [...topicScores.entries()]
      .map(([topic, scores]) => ({
        topic: formatTopicName(topic),
        score: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    results.push({ segmentName: audience.name, topAffinities: affinities });
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────

function formatTopics(raw: Record<string, number>): FormattedTopic[] {
  return Object.entries(raw)
    .map(([name, score]) => ({
      name: formatTopicName(name),
      score: Math.round(score * 100),
    }))
    .sort((a, b) => b.score - a.score);
}

function formatTopicName(slug: string): string {
  return slug
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/johnkelly/coding/Spark Foundry Sandbox/spark-foundry" && npx tsc --noEmit src/lib/lytics/data-service.ts 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/lytics/data-service.ts
git commit -m "feat(lytics): add LyticsDataService singleton cache"
```

---

## Task 4: API Routes — Data and Enrich

**Files:**
- Create: `src/app/api/lytics/data/route.ts`
- Create: `src/app/api/lytics/enrich/route.ts`

- [ ] **Step 1: Create the data route**

```typescript
// src/app/api/lytics/data/route.ts
import { NextResponse } from 'next/server';
import { getData, refreshGlobalData, isAvailable } from '@/lib/lytics/data-service';

/**
 * GET /api/lytics/data
 *
 * Returns cached Lytics state. Triggers initial refresh if cache is empty.
 */
export async function GET() {
  if (!isAvailable()) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const data = getData();

  // If cache is empty, do initial refresh
  if (!data.lastRefreshed) {
    await refreshGlobalData();
  }

  const refreshed = getData();
  return NextResponse.json({
    available: true,
    segments: refreshed.segments,
    segmentGroups: refreshed.segmentGroups,
    opportunity: refreshed.opportunity,
    lastRefreshed: refreshed.lastRefreshed,
  });
}
```

- [ ] **Step 2: Create the enrich route**

```typescript
// src/app/api/lytics/enrich/route.ts
import { NextResponse } from 'next/server';
import { enrichEditorContent, isAvailable } from '@/lib/lytics/data-service';

/**
 * POST /api/lytics/enrich
 *
 * Debounced editor enrichment: classify text → topics + audience alignment.
 * Body: { text: string }
 */
export async function POST(req: Request) {
  if (!isAvailable()) {
    return NextResponse.json({ topics: [], inferredTopics: [], audiences: [] });
  }

  try {
    const { text } = (await req.json()) as { text?: string };

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ topics: [], inferredTopics: [], audiences: [] });
    }

    const result = await enrichEditorContent(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[lytics/enrich]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify both routes work**

Start the dev server: `npm run dev`

Test data route:
```bash
curl -s http://localhost:3000/api/lytics/data | python3 -m json.tool | head -30
```
Expected: JSON with `available: true`, `segments` array, `opportunity` array.

Test enrich route:
```bash
curl -s -X POST http://localhost:3000/api/lytics/enrich \
  -H "Content-Type: application/json" \
  -d '{"text":"digital marketing strategies for enterprise content management"}' | python3 -m json.tool
```
Expected: JSON with `topics`, `inferredTopics`, `audiences` arrays.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lytics/data/route.ts src/app/api/lytics/enrich/route.ts
git commit -m "feat(lytics): add /api/lytics/data and /api/lytics/enrich routes"
```

---

## Task 5: Enhanced Analyze Route

**Files:**
- Modify: `src/app/api/lytics/analyze/route.ts`

Rewrite the existing analyze route to: refresh all Lytics data, sample aggregate profiles, pass Lytics context to Claude for AI analysis, and return the combined result. Fall back to AI-only when Lytics is unavailable.

- [ ] **Step 1: Rewrite the analyze route**

Replace the entire file with the following implementation. This is the most complex route — it orchestrates Lytics data refresh, Claude AI analysis with two tools, and aggregate profile sampling.

```typescript
// src/app/api/lytics/analyze/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { addLogEntry } from '@/lib/activity-logger';
import {
  refreshGlobalData,
  enrichEditorContent,
  sampleAggregateAffinities,
  getData,
  isAvailable,
} from '@/lib/lytics/data-service';
import { getContentByUrl } from '@/lib/lytics/api';
import { getDimension, computeOpportunityScore } from '@/lib/lytics/types';
import type { FormattedTopic, FormattedAudience, AggregateAffinity, LyticsContentEntity } from '@/lib/lytics/types';

const anthropic = new Anthropic();
const MAX_TEXT_LENGTH = 4000;

// ─── Claude Tool: Content Quality Analysis ──────

const QUALITY_TOOL: Anthropic.Tool = {
  name: 'submit_content_analysis',
  description: 'Submit structured content quality analysis with scores, topics, audiences, quality metrics, channel fit, and recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      overallScore: { type: 'number', description: 'Overall content quality score 0-100' },
      summary: { type: 'string', description: '1-2 sentence assessment' },
      topics: {
        type: 'array', items: {
          type: 'object', properties: { name: { type: 'string' }, score: { type: 'number' } }, required: ['name', 'score'],
        },
      },
      contentQuality: {
        type: 'object', properties: {
          readability: { type: 'number' }, clarity: { type: 'number' },
          engagement: { type: 'number' }, seoReadiness: { type: 'number' },
        }, required: ['readability', 'clarity', 'engagement', 'seoReadiness'],
      },
      channelFit: {
        type: 'array', items: {
          type: 'object', properties: { channel: { type: 'string' }, score: { type: 'number' } }, required: ['channel', 'score'],
        },
      },
    },
    required: ['overallScore', 'summary', 'topics', 'contentQuality', 'channelFit'],
  },
};

// ─── Claude Tool: Strategic Analysis (Lytics-informed) ──

const STRATEGIC_TOOL: Anthropic.Tool = {
  name: 'submit_strategic_analysis',
  description: 'Submit strategic content analysis based on Lytics audience intelligence data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      contentComparison: { type: 'string', description: 'How the content aligns with Lytics audience data — what aligns, what is missing, what is unexpected' },
      recommendations: {
        type: 'object',
        properties: {
          contentUpdates: { type: 'array', items: { type: 'string' }, description: '3-5 specific content improvements to better align with high-opportunity audiences' },
          campaignIdeas: { type: 'array', items: { type: 'string' }, description: '2-3 campaign concepts leveraging the behavioral data' },
          underservedAudiences: {
            type: 'array', items: {
              type: 'object', properties: {
                name: { type: 'string' }, size: { type: 'number' },
                gap: { type: 'string' }, suggestion: { type: 'string' },
              }, required: ['name', 'size', 'gap', 'suggestion'],
            },
          },
          contentGaps: {
            type: 'array', items: {
              type: 'object', properties: {
                topic: { type: 'string' }, userCount: { type: 'number' },
                docCount: { type: 'number' }, opportunity: { type: 'string' },
              }, required: ['topic', 'userCount', 'docCount', 'opportunity'],
            },
          },
        },
        required: ['contentUpdates', 'campaignIdeas', 'underservedAudiences', 'contentGaps'],
      },
    },
    required: ['contentComparison', 'recommendations'],
  },
};

// ─── Build Lytics context for Claude ────────────────

function buildLyticsContext(
  topics: FormattedTopic[],
  audiences: FormattedAudience[],
  affinities: AggregateAffinity[],
): string {
  const data = getData();

  // Match opportunity data to current topics
  const topicNames = new Set(topics.map((t) => t.name.toLowerCase()));
  const matchedOpportunity = data.opportunity
    .filter((o) => topicNames.has(o.topic.toLowerCase()))
    .slice(0, 10);

  const maxUsers = Math.max(...data.opportunity.map((t) => getDimension(t, 'User Count')), 1);
  const maxDocs = Math.max(...data.opportunity.map((t) => getDimension(t, 'Document Count')), 1);

  let ctx = 'LYTICS AUDIENCE INTELLIGENCE DATA:\n\n';

  ctx += '## Content Topics (from Lytics NLP)\n';
  for (const t of topics.slice(0, 10)) ctx += `- ${t.name}: ${t.score}% confidence\n`;

  ctx += '\n## Aligned Audiences\n';
  for (const a of audiences.slice(0, 10)) ctx += `- ${a.name}: ${a.alignment}% alignment, ${a.size.toLocaleString()} profiles\n`;

  if (matchedOpportunity.length > 0) {
    ctx += '\n## Topic Behavioral Data\n';
    for (const o of matchedOpportunity) {
      const users = getDimension(o, 'User Count');
      const docs = getDimension(o, 'Document Count');
      const engaged = Math.round(getDimension(o, 'deeply_engaged_users') * 100);
      const atRisk = Math.round(getDimension(o, 'at_risk_users') * 100);
      const recency = Math.round(getDimension(o, 'score_recency'));
      const intensity = Math.round(getDimension(o, 'score_intensity'));
      const propensity = Math.round(getDimension(o, 'score_propensity'));
      const oppScore = computeOpportunityScore(o, maxUsers, maxDocs);
      ctx += `- ${o.topic}: ${users} users, ${docs} docs, opportunity=${oppScore}%, deeply_engaged=${engaged}%, at_risk=${atRisk}%, recency=${recency}, intensity=${intensity}, propensity=${propensity}\n`;
    }
  }

  if (affinities.length > 0) {
    ctx += '\n## Aggregate Audience Affinities (what these audiences also care about)\n';
    for (const a of affinities) {
      ctx += `- ${a.segmentName}: ${a.topAffinities.slice(0, 5).map((t) => `${t.topic}(${t.score}%)`).join(', ')}\n`;
    }
  }

  return ctx;
}

// ─── Route handler ──────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, referencedItemTexts, sparkItemUrls } = body as {
      text?: string;
      referencedItemTexts?: string[];
      sparkItemUrls?: string[];
    };

    if (!text && (!referencedItemTexts || referencedItemTexts.length === 0)) {
      return NextResponse.json({ error: 'text or referencedItemTexts is required' }, { status: 400 });
    }

    // Combine text
    const parts = [text ?? '', ...(referencedItemTexts ?? [])].filter(Boolean);
    const combinedText = parts.join('\n\n---\n\n').slice(0, MAX_TEXT_LENGTH);

    // ── Lytics data collection (parallel where possible) ──
    let lyticsTopics: FormattedTopic[] = [];
    let lyticsAudiences: FormattedAudience[] = [];
    let aggregateAffinities: AggregateAffinity[] = [];
    let lyticsContentRecs: LyticsContentEntity[] = [];
    let matchedOpportunity: { topic: string; userCount: number; docCount: number; opportunityScore: number }[] = [];

    if (isAvailable()) {
      // Phase 1: refresh global data + enrich content in parallel
      const [, enrichResult] = await Promise.all([
        refreshGlobalData(),
        enrichEditorContent(combinedText),
      ]);

      lyticsTopics = enrichResult.topics;
      lyticsAudiences = enrichResult.audiences;

      // Phase 2: sample aggregate affinities + fetch content entities in parallel
      const contentEntityPromises = (sparkItemUrls ?? []).slice(0, 5).map((url) => getContentByUrl(url));

      const [affinities, ...contentEntities] = await Promise.all([
        sampleAggregateAffinities(5),
        ...contentEntityPromises,
      ]);

      aggregateAffinities = affinities;
      lyticsContentRecs = contentEntities.filter((e): e is LyticsContentEntity => e !== null);

      // Compute matched opportunity
      const data = getData();
      const topicNames = new Set(lyticsTopics.map((t) => t.name.toLowerCase()));
      const maxUsers = Math.max(...data.opportunity.map((t) => getDimension(t, 'User Count')), 1);
      const maxDocs = Math.max(...data.opportunity.map((t) => getDimension(t, 'Document Count')), 1);
      matchedOpportunity = data.opportunity
        .filter((o) => topicNames.has(o.topic.toLowerCase()) && getDimension(o, 'User Count') > 0)
        .map((o) => ({
          topic: o.topic,
          userCount: getDimension(o, 'User Count'),
          docCount: getDimension(o, 'Document Count'),
          opportunityScore: computeOpportunityScore(o, maxUsers, maxDocs),
        }))
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 20);
    }

    // ── Claude AI Analysis ──────────────────────────
    const hasLyticsData = lyticsTopics.length > 0 || lyticsAudiences.length > 0;
    const lyticsContext = hasLyticsData
      ? buildLyticsContext(lyticsTopics, lyticsAudiences, aggregateAffinities)
      : '';

    const systemPrompt = `You are a senior content strategist and digital marketing analyst. Analyze the provided content and produce a structured quality assessment.

Guidelines:
- Read the actual content carefully. Identify real topics, themes, and audiences — don't fabricate generic ones.
- Be honest with scores. Not everything deserves 85+. Short or thin content should score lower.
- For channel fit: assess how well the content format/style suits each channel (Blog, Email, Social, Web Page, Newsletter).
${hasLyticsData ? `
You also have access to real Lytics audience intelligence data. Use it to provide grounded, data-driven strategic analysis.

${lyticsContext}

You MUST call BOTH tools:
1. submit_content_analysis — quality scoring and channel fit
2. submit_strategic_analysis — Lytics-informed strategic recommendations

For strategic analysis:
- COMPARE: How does this content align with the Lytics audience data? What topics are well-covered? What's missing?
- RECOMMEND: Content updates, campaign concepts leveraging behavioral data, underserved audiences, content gaps where user interest outpaces content.
- Use real audience names and sizes from the data above.
` : `
You MUST call the submit_content_analysis tool with your analysis.`}`;

    const tools = hasLyticsData ? [QUALITY_TOOL, STRATEGIC_TOOL] : [QUALITY_TOOL];

    const start = Date.now();
    addLogEntry({
      service: 'anthropic',
      direction: 'request',
      level: 'info',
      summary: `lytics/analyze — ${combinedText.length} chars, lytics=${hasLyticsData}`,
      requestBody: { model: 'claude-sonnet-4-6', chars: combinedText.length, hasLytics: hasLyticsData },
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: [{ role: 'user', content: `Analyze this content:\n\n${combinedText}` }],
    });

    addLogEntry({
      service: 'anthropic',
      direction: 'response',
      level: 'info',
      summary: `lytics/analyze — done (in:${response.usage.input_tokens} out:${response.usage.output_tokens})`,
      duration: Date.now() - start,
    });

    // Extract tool call results
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const qualityBlock = toolBlocks.find((b) => b.name === 'submit_content_analysis');
    const strategicBlock = toolBlocks.find((b) => b.name === 'submit_strategic_analysis');

    const qualityAnalysis = qualityBlock?.input as Record<string, unknown> ?? {
      overallScore: 0, summary: 'Analysis unavailable', topics: [], contentQuality: { readability: 0, clarity: 0, engagement: 0, seoReadiness: 0 }, channelFit: [],
    };
    const strategicAnalysis = strategicBlock?.input as Record<string, unknown> ?? {
      contentComparison: '', recommendations: { contentUpdates: [], campaignIdeas: [], underservedAudiences: [], contentGaps: [] },
    };

    return NextResponse.json({
      lytics: {
        topics: lyticsTopics,
        audiences: lyticsAudiences,
        opportunity: matchedOpportunity,
        aggregateAffinities,
        lyticsContentRecs: lyticsContentRecs.map((e) => ({ url: e.url, title: e.title, lytics: e.lytics })),
      },
      ai: {
        contentComparison: (strategicAnalysis as any).contentComparison ?? '',
        qualityAnalysis,
        recommendations: (strategicAnalysis as any).recommendations ?? {
          contentUpdates: [], campaignIdeas: [], underservedAudiences: [], contentGaps: [],
        },
      },
      relatedSparkItems: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[lytics/analyze]', message);
    addLogEntry({ service: 'anthropic', direction: 'response', level: 'error', summary: `lytics/analyze — ${message}` });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx tsc --noEmit src/app/api/lytics/analyze/route.ts 2>&1 | head -20`

- [ ] **Step 3: Test the route with curl**

```bash
curl -s -X POST http://localhost:3000/api/lytics/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"How to build a composable digital experience platform","referencedItemTexts":[]}' | python3 -m json.tool | head -50
```

Expected: JSON with `lytics` (populated) and `ai` (populated) keys.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lytics/analyze/route.ts
git commit -m "feat(lytics): enhanced analyze route with Lytics context + Claude AI"
```

---

## Task 6: Update Chat Tools Registry

**Files:**
- Modify: `src/lib/agent/tools-registry.ts`

Remove the three old Lytics tools and their handlers. Add a unified `lytics_insights` tool.

- [ ] **Step 1: Update the tools-registry**

Changes to make in `src/lib/agent/tools-registry.ts`:

**1. Update imports** (around line 24-26): Replace the old imports:
```typescript
// OLD:
import { classifyContent, getAudienceAlignment, getOpportunities } from '@/lib/lytics/api';
// NEW:
import { getData, enrichEditorContent, isAvailable } from '@/lib/lytics/data-service';
import { computeOpportunityScore, getDimension } from '@/lib/lytics/types';
```

**2. Replace `LYTICS_TOOLS` array** (lines 372-407): Replace with:
```typescript
const LYTICS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lytics_insights',
    description: 'Get Lytics audience and content intelligence data. Use to answer questions about audiences, content performance, topic opportunities, and audience behavioral profiles. Returns real data from Lytics CDP.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query_type: {
          type: 'string',
          enum: ['segments', 'opportunity', 'content_alignment', 'profile_affinities'],
          description: 'What data to retrieve: segments (audience list with sizes), opportunity (topic landscape with behavioral scores), content_alignment (classify text and find matching audiences), profile_affinities (cached audience topic interests)',
        },
        topic_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: filter opportunity data by topic names',
        },
        segment_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: filter segments by name',
        },
        text: {
          type: 'string',
          description: 'For content_alignment: the text to classify and align',
        },
      },
      required: ['query_type'],
    },
  },
];
```

**3. Update risk classification** (around lines 54-57): Replace the three entries:
```typescript
// OLD:
lytics_classify: 'read',
lytics_get_audiences: 'read',
lytics_get_opportunities: 'read',
// NEW:
lytics_insights: 'read',
```

**4. Update tool labels** (around lines 97-99): Replace the three entries:
```typescript
// OLD:
lytics_classify: 'Classifying content...',
lytics_get_audiences: 'Finding audiences...',
lytics_get_opportunities: 'Loading opportunities...',
// NEW:
lytics_insights: 'Querying Lytics data...',
```

**5. Update tool call label helper** (around line 578): Replace the `lytics_classify` case:
```typescript
// OLD:
case 'lytics_classify':
  return `${(input.text as string)?.substring(0, 60)}...`;
// NEW:
case 'lytics_insights':
  return `${input.query_type}${input.text ? ': ' + (input.text as string).substring(0, 40) + '...' : ''}`;
```

**6. Replace handler cases** (around lines 941-955): Replace the three `case` blocks:
```typescript
// OLD:
case 'lytics_classify': { ... }
case 'lytics_get_audiences': { ... }
case 'lytics_get_opportunities': { ... }

// NEW:
case 'lytics_insights': {
  if (!isAvailable()) {
    return JSON.stringify({ error: 'Lytics is not configured (LYTICS_ACCESS_TOKEN missing)' });
  }

  const queryType = input.query_type as string;
  const data = getData();

  switch (queryType) {
    case 'segments': {
      let segments = data.segments;
      const filter = input.segment_filter as string[] | undefined;
      if (filter?.length) {
        const lowerFilter = filter.map((f) => f.toLowerCase());
        segments = segments.filter((s) => lowerFilter.some((f) => s.name.toLowerCase().includes(f)));
      }
      return JSON.stringify({
        segments: segments.map((s) => ({ name: s.name, slug: s.slug_name, size: s.size ?? 0, description: s.description, kind: s.kind })),
        total: segments.length,
      }, null, 2);
    }

    case 'opportunity': {
      let topics = data.opportunity.filter((t) => getDimension(t, 'User Count') > 0);
      const filter = input.topic_filter as string[] | undefined;
      if (filter?.length) {
        const lowerFilter = filter.map((f) => f.toLowerCase());
        topics = topics.filter((t) => lowerFilter.some((f) => t.topic.toLowerCase().includes(f)));
      }
      const maxUsers = Math.max(...topics.map((t) => getDimension(t, 'User Count')), 1);
      const maxDocs = Math.max(...topics.map((t) => getDimension(t, 'Document Count')), 1);
      return JSON.stringify({
        topics: topics.slice(0, 50).map((t) => ({
          topic: t.topic,
          userCount: getDimension(t, 'User Count'),
          docCount: getDimension(t, 'Document Count'),
          opportunityScore: computeOpportunityScore(t, maxUsers, maxDocs),
          deeplyEngaged: Math.round(getDimension(t, 'deeply_engaged_users') * 100),
          atRisk: Math.round(getDimension(t, 'at_risk_users') * 100),
          scoreRecency: Math.round(getDimension(t, 'score_recency')),
          scoreIntensity: Math.round(getDimension(t, 'score_intensity')),
        })),
      }, null, 2);
    }

    case 'content_alignment': {
      const text = input.text as string;
      if (!text) return JSON.stringify({ error: 'text is required for content_alignment' });
      const result = await enrichEditorContent(text);
      return JSON.stringify(result, null, 2);
    }

    case 'profile_affinities': {
      // Return cached content topics + audiences
      return JSON.stringify({
        contentTopics: data.contentTopics,
        contentAudiences: data.contentAudiences,
      }, null, 2);
    }

    default:
      return JSON.stringify({ error: `Unknown query_type: ${queryType}` });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/agent/tools-registry.ts 2>&1 | head -20`

- [ ] **Step 3: Test via chat**

In the Spark UI, open a chat and ask: "What audiences are available in Lytics?" — the assistant should use the `lytics_insights` tool and return real segment data.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/tools-registry.ts
git commit -m "feat(lytics): replace 3 old Lytics tools with unified lytics_insights tool"
```

---

## Task 7: ScorePanel — Layer 1 (Always-On Lytics Data)

**Files:**
- Modify: `src/components/ScorePanel.tsx`

Add always-visible Lytics data sections that update as the user types. This is the biggest UI change.

- [ ] **Step 1: Add Lytics state and debounced enrichment**

At the top of the `ScorePanel` component (after the existing state declarations around line 328), add:

```typescript
// Lytics state
const [lyticsAvailable, setLyticsAvailable] = useState(false);
const [lyticsTopics, setLyticsTopics] = useState<{ name: string; score: number }[]>([]);
const [lyticsInferredTopics, setLyticsInferredTopics] = useState<{ name: string; score: number }[]>([]);
const [lyticsAudiences, setLyticsAudiences] = useState<{ name: string; alignment: number; size: number }[]>([]);
const [lyticsOpportunity, setLyticsOpportunity] = useState<{ topic: string; userCount: number; docCount: number; opportunityScore: number }[]>([]);
const [isEnriching, setIsEnriching] = useState(false);

const enrichDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
const lastEnrichedTextRef = useRef('');
```

- [ ] **Step 2: Add Lytics data fetch on mount**

Add a `useEffect` that loads cached Lytics data on mount:

```typescript
// Fetch cached Lytics data on mount
useEffect(() => {
  fetch('/api/lytics/data')
    .then((res) => res.json())
    .then((data) => {
      if (data.available) {
        setLyticsAvailable(true);
        // Process opportunity data for display
        if (data.opportunity?.length) {
          const topics = data.opportunity
            .filter((t: any) => {
              const users = t.dimensions?.find((d: any) => d.label === 'User Count')?.value ?? 0;
              return users > 0;
            })
            .map((t: any) => {
              const users = t.dimensions?.find((d: any) => d.label === 'User Count')?.value ?? 0;
              const docs = t.dimensions?.find((d: any) => d.label === 'Document Count')?.value ?? 0;
              return { topic: t.topic, userCount: users, docCount: docs, opportunityScore: 0 };
            });
          // Compute opportunity scores
          const maxUsers = Math.max(...topics.map((t: any) => t.userCount), 1);
          const maxDocs = Math.max(...topics.map((t: any) => t.docCount), 1);
          for (const t of topics) {
            t.opportunityScore = Math.round((t.userCount / maxUsers) * (1 - t.docCount / maxDocs) * 100);
          }
          topics.sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);
          setLyticsOpportunity(topics.slice(0, 20));
        }
      }
    })
    .catch(() => {}); // silent fail
}, []);
```

- [ ] **Step 3: Add debounced editor enrichment**

Add to the existing `useEffect` that watches editor updates (around line 423), or create a new `useEffect`:

```typescript
// Debounced Lytics enrichment on editor changes
useEffect(() => {
  if (!lyticsAvailable) return;
  const editor = editorCtx?.getEditor();
  if (!editor) return;

  const handler = () => {
    if (enrichDebounceRef.current) clearTimeout(enrichDebounceRef.current);
    enrichDebounceRef.current = setTimeout(() => {
      const text = editor.getText().trim();
      if (text.length < 10) return;
      // Skip if text is identical
      if (text === lastEnrichedTextRef.current) return;
      // Min 50 char change threshold to avoid excessive API calls
      if (Math.abs(text.length - lastEnrichedTextRef.current.length) < 50 && lastEnrichedTextRef.current) return;
      lastEnrichedTextRef.current = text;

      setIsEnriching(true);
      fetch('/api/lytics/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.topics) setLyticsTopics(data.topics);
          if (data.inferredTopics) setLyticsInferredTopics(data.inferredTopics);
          if (data.audiences) setLyticsAudiences(data.audiences);
        })
        .catch(() => {})
        .finally(() => setIsEnriching(false));
    }, 2000);
  };

  editor.on('update', handler);
  // Trigger initial enrichment if content exists
  const initialText = editor.getText().trim();
  if (initialText.length >= 10) handler();

  return () => {
    editor.off('update', handler);
    if (enrichDebounceRef.current) clearTimeout(enrichDebounceRef.current);
  };
}, [editorCtx, lyticsAvailable]);
```

- [ ] **Step 4: Add Lytics UI sections to the JSX**

After the existing "Detected Keywords / Topics" section (around line 544) and before the "Content Quality" section, add the Lytics sections. Replace the existing topic/keyword section with Lytics-powered topics when available:

1. **Lytics Topics section** — Replace the existing `Detected Keywords` section: when Lytics is available and has topics, show Lytics topics with `EnhancedBar`; when not, fall back to existing keyword extraction.

2. **Audience Fit section** — Always visible when Lytics has audiences. Show top 10 with alignment bars. Each row: segment name, alignment %, formatted profile count. Use a helper to format counts: `formatProfileCount(size: number)` → "1.2M" / "45K" / "320".

3. **Content Opportunity section** — Show top 5 matched opportunity topics (filtered to those matching the current Lytics topics). Show user count, doc count, and opportunity score bar.

Add a `formatProfileCount` helper:
```typescript
function formatProfileCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
```

- [ ] **Step 5: Verify in browser**

Open a Spark workspace, navigate to the scoring tab. Type some content in the editor. After ~2s, Lytics topics and audiences should appear without clicking Analyze.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScorePanel.tsx
git commit -m "feat(lytics): ScorePanel Layer 1 — always-on Lytics topics, audiences, opportunity"
```

---

## Task 8: ScorePanel — Layer 2 (Full Analysis with AI)

**Files:**
- Modify: `src/components/ScorePanel.tsx`

Wire the Analyze button to the enhanced `/api/lytics/analyze` route. Display the full results: behavioral profile, model scores, AI gap analysis, recommendations, related content.

- [ ] **Step 1: Update the analyze function**

Replace the existing `analyze` callback (around line 382) to call `/api/lytics/analyze` instead of `/api/scoring/analyze`. Parse the new response shape:

```typescript
const analyze = useCallback(async () => {
  const editor = editorCtx?.getEditor();
  if (!editor) return;

  const plainText = editor.getText().trim();
  const referencedItemTexts = extractReferencedItemTexts();
  // Collect URLs from SparkItems (use ref to avoid stale closure / excess rerenders)
  const sparkItemUrls = itemsRef.current
    .filter((item) => item.metadata?.url || item.type === 'link')
    .map((item) => (item.metadata?.url as string) || item.content)
    .filter(Boolean);

  if (!plainText && referencedItemTexts.length === 0) return;

  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  setIsAnalyzing(true);
  setErrorMsg('');

  try {
    const res = await fetch('/api/lytics/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plainText, referencedItemTexts, sparkItemUrls }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    // Update Lytics data from the refreshed response
    if (data.lytics) {
      if (data.lytics.topics) setLyticsTopics(data.lytics.topics);
      if (data.lytics.audiences) setLyticsAudiences(data.lytics.audiences);
    }

    // Set AI result from the response
    if (data.ai?.qualityAnalysis) {
      setAiResult(data.ai.qualityAnalysis);
    }

    // Store the full analysis result for Layer 2 sections
    setFullAnalysis(data);
    setErrorMsg('');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    setErrorMsg(err instanceof Error ? err.message : String(err));
  } finally {
    setIsAnalyzing(false);
  }
}, [editorCtx, extractReferencedItemTexts, sparkItems]);
```

Add state for the full analysis:
```typescript
interface FullAnalysisResult {
  lytics: {
    topics: { name: string; score: number }[];
    audiences: { name: string; alignment: number; size: number }[];
    opportunity: { topic: string; userCount: number; docCount: number; opportunityScore: number }[];
    aggregateAffinities: { segmentName: string; topAffinities: { topic: string; score: number }[] }[];
    lyticsContentRecs: { url: string; title: string; lytics: Record<string, number> }[];
  };
  ai: {
    contentComparison: string;
    qualityAnalysis: AIAnalysisResult;
    recommendations: {
      contentUpdates: string[];
      campaignIdeas: string[];
      underservedAudiences: { name: string; size: number; gap: string; suggestion: string }[];
      contentGaps: { topic: string; userCount: number; docCount: number; opportunity: string }[];
    };
  };
  relatedSparkItems: { id: string; title: string; similarity: number }[];
}

const [fullAnalysis, setFullAnalysis] = useState<FullAnalysisResult | null>(null);
```

- [ ] **Step 2: Update AIAnalysisResult interface and audience rendering**

The existing `AIAnalysisResult` interface (line 35) defines `audiences.size` as `string`. Update it to `number` and fix the dot-sizing logic (lines 564-568).

Change the interface:
```typescript
// OLD:
audiences: { name: string; alignment: number; size: string }[];
// NEW:
audiences: { name: string; alignment: number; size: number }[];
```

Replace the dot-sizing logic in the audience rendering (around line 566):
```typescript
// OLD:
const dotSize =
  a.size.includes('M') ? 'w-2.5 h-2.5' :
  a.size.includes('K') ? 'w-2 h-2' :
  'w-1.5 h-1.5';
// NEW:
const dotSize =
  a.size >= 1_000_000 ? 'w-2.5 h-2.5' :
  a.size >= 1_000 ? 'w-2 h-2' :
  'w-1.5 h-1.5';
```

Replace the size display (around line 579):
```typescript
// OLD:
<span className="text-[10px] text-venus-gray-400 shrink-0">{a.size}</span>
// NEW:
<span className="text-[10px] text-venus-gray-400 shrink-0">{formatProfileCount(a.size)}</span>
```

- [ ] **Step 3: Add Layer 2 UI sections**

After the existing AI sections, add (only shown when `fullAnalysis` is present):

1. **Gap Analysis** — Display `fullAnalysis.ai.contentComparison` as a text block in the same style as the AI summary (purple-tinted box).

```tsx
{fullAnalysis?.ai?.contentComparison && (
  <Section icon={Target} title="Lytics Gap Analysis">
    <p className="text-xs text-venus-gray-600 leading-relaxed">
      {fullAnalysis.ai.contentComparison}
    </p>
  </Section>
)}
```

2. **Strategic Recommendations** — Display each recommendation type.

```tsx
{fullAnalysis?.ai?.recommendations && (
  <Section icon={Lightbulb} title="Strategic Recommendations">
    {/* Content Updates */}
    {fullAnalysis.ai.recommendations.contentUpdates?.length > 0 && (
      <div className="mb-3">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Content Updates</h5>
        <div className="space-y-1.5">
          {fullAnalysis.ai.recommendations.contentUpdates.map((rec: string, i: number) => (
            <div key={i} className="flex gap-2 text-xs text-venus-gray-600">
              <span className="text-venus-purple font-bold shrink-0">{i + 1}.</span>
              <span className="leading-relaxed">{rec}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* Campaign Ideas */}
    {fullAnalysis.ai.recommendations.campaignIdeas?.length > 0 && (
      <div className="mb-3">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Campaign Ideas</h5>
        <div className="space-y-1.5">
          {fullAnalysis.ai.recommendations.campaignIdeas.map((idea: string, i: number) => (
            <div key={i} className="flex gap-2 text-xs text-venus-gray-600">
              <span className="text-venus-green font-bold shrink-0">→</span>
              <span className="leading-relaxed">{idea}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* Underserved Audiences */}
    {fullAnalysis.ai.recommendations.underservedAudiences?.length > 0 && (
      <div className="mb-3">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Underserved Audiences</h5>
        <div className="space-y-2">
          {fullAnalysis.ai.recommendations.underservedAudiences.map((a: any, i: number) => (
            <div key={i} className="rounded-lg border border-venus-gray-200 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-venus-gray-700">{a.name}</span>
                <span className="text-[10px] text-venus-gray-400">{formatProfileCount(a.size)}</span>
              </div>
              <p className="text-[10px] text-venus-gray-500 mb-0.5">{a.gap}</p>
              <p className="text-[10px] text-venus-purple">{a.suggestion}</p>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* Content Gaps */}
    {fullAnalysis.ai.recommendations.contentGaps?.length > 0 && (
      <div>
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Content Gaps</h5>
        <div className="space-y-1.5">
          {fullAnalysis.ai.recommendations.contentGaps.map((g: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs text-venus-gray-600">
              <span className="text-venus-yellow font-bold shrink-0">!</span>
              <span className="truncate flex-1">{g.topic}</span>
              <span className="text-[10px] text-venus-gray-400 shrink-0">{g.userCount} users / {g.docCount} docs</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </Section>
)}
```

3. **Related Content** — Two subsections for Lytics content recs and Spark items.

```tsx
{fullAnalysis?.lytics?.lyticsContentRecs?.length > 0 && (
  <Section icon={BookOpen} title="Related Content (Lytics)">
    <div className="space-y-1.5">
      {fullAnalysis.lytics.lyticsContentRecs.map((rec: any, i: number) => (
        <a key={i} href={rec.url} target="_blank" rel="noopener noreferrer"
          className="block text-xs text-venus-purple hover:underline truncate">
          {rec.title || rec.url}
        </a>
      ))}
    </div>
  </Section>
)}
```

- [ ] **Step 3: Verify in browser**

Click Analyze. Verify: Lytics data refreshes, AI analysis appears with behavioral data, recommendations include Lytics-grounded suggestions.

- [ ] **Step 4: Commit**

```bash
git add src/components/ScorePanel.tsx
git commit -m "feat(lytics): ScorePanel Layer 2 — full analysis with behavioral data and AI recommendations"
```

---

## Task 9: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: End-to-end test — empty editor**

Open a Spark workspace with no content. Verify:
- ScorePanel shows "Start writing" idle state
- No Lytics API calls in the Activity Log
- No errors in the console

- [ ] **Step 2: End-to-end test — type content**

Type a paragraph about "composable digital experience platforms." Verify:
- After ~2s, Lytics topics appear (e.g., "DXP", "Composable")
- Audiences section populates with alignment scores
- Opportunity section shows matched topics
- Activity Log shows `lytics` entries (enrich + align)

- [ ] **Step 3: End-to-end test — Analyze button**

Click "Analyze with Foundry AI." Verify:
- Lytics data refreshes (topics/audiences may update)
- AI analysis appears: quality scores, gap analysis, recommendations
- Behavioral profile section shows engagement breakdown
- Recommendations reference real Lytics audience names and sizes
- Activity Log shows lytics + anthropic entries

- [ ] **Step 4: End-to-end test — chat integration**

Open chat and ask: "What audiences should I target with this content?" Verify:
- Assistant uses `lytics_insights` tool
- Response includes real segment names and alignment data

- [ ] **Step 5: End-to-end test — graceful degradation**

Temporarily remove `LYTICS_ACCESS_TOKEN` from `.env.local`. Restart dev server. Verify:
- ScorePanel falls back to client-side keyword extraction
- Analyze button still works (AI-only analysis)
- No errors shown to user
- Re-add the token and restart.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(lytics): complete Lytics integration — ambient data layer + AI analysis"
```
