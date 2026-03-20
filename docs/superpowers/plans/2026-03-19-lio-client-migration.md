# lio-client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Spark Foundry's hand-rolled Lytics API client (`src/lib/lytics/api.ts`) with `@lytics/lio-client`, the official tested TypeScript client — reducing maintenance surface while preserving all activity logging and error handling.

**Architecture:** `api.ts` keeps its function signatures and error handling but delegates to lio-client internally. A `createAuthedClient()` helper creates a fresh lio-client per call (cheap, no network I/O) with the dynamically-resolved token. Each method logs to the activity logger directly (before/after lio-client call), preserving the same request/response entries `traceFetch` produces today. Types stay in `types.ts` unchanged — Spark types are stricter than lio-client types, so no aliasing.

**Tech Stack:** Next.js (App Router), TypeScript, `@lytics/lio-client`, Vitest

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config with `@/` path alias matching tsconfig |
| `src/lib/lytics/__tests__/api.test.ts` | Unit tests for all 7 API methods |

### Modified Files

| File | What Changes |
|---|---|
| `package.json` | Add `@lytics/lio-client` dep, `vitest` devDep, `"test"` script |
| `src/lib/lytics/api.ts` | Replace `traceFetch`/`fetch` internals with lio-client delegation; keep all signatures, error handling, type re-exports |

### Unchanged Files

`src/lib/lytics/types.ts`, `src/lib/lytics/data-service.ts`, `src/app/api/lytics/analyze/route.ts`, `src/app/api/lytics/enrich/route.ts`, `src/app/api/lytics/data/route.ts`, `src/lib/agent/tools-registry.ts`, `src/components/ScorePanel.tsx`

---

## Task 1: Install Dependencies and Test Setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install lio-client and vitest**

```bash
pnpm add @lytics/lio-client
pnpm add -D vitest
```

If lio-client PR #25 is not yet published: `pnpm add @lytics/lio-client@file:../lio-client/packages/core`

- [ ] **Step 2: Add test script to package.json**

Add `"test": "vitest run"` to the `"scripts"` section.

- [ ] **Step 3: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 4: Verify setup**

Run: `pnpm test`
Expected: 0 tests found (passes).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add @lytics/lio-client and vitest"
```

---

## Task 2: Write All Tests (Red Phase)

**Files:**
- Create: `src/lib/lytics/__tests__/api.test.ts`

All tests written before any implementation changes. They should all FAIL initially — confirming they actually test the lio-client delegation.

- [ ] **Step 1: Write test file with mocks and all test cases**

The full test file is in the collapsed block below. It mocks `@lytics/lio-client`, `@/lib/activity-logger`, and `@/app/api/auth/lytics/route`. Each describe block covers one method.

Key test scenarios per method:

| Method | Happy path | Error handling | Activity logging | Edge case |
|---|---|---|---|---|
| `enrichContent` | Returns `{ topics, inferred_topics }` (no `input` field) | Returns `{ topics: {}, inferred_topics: {} }` on throw | Request + response entries with matching correlationId | Truncates to 2000 chars |
| `alignContent` | Returns alignments array | — | Request + response entries | — |
| `getOpportunity` | Returns topics array | Returns `[]` when empty | — | — |
| `getContentByUrl` | Returns entity | Returns `null` on throw; returns `null` when entity has no url | — | — |
| `getSegments` | Returns segments; passes `{ sizes: true }` | — | — | — |
| `getSegmentGroups` | Returns groups array | — | — | — |
| `scanSegment` | Returns profiles; passes `{ limit }` | Returns `[]` on throw; returns `[]` after 5s timeout | — | Uses `Promise.race` timeout |
| `isLyticsConfigured` | Returns `true` when token available | — | — | Unchanged, no lio-client |

**Risk mitigation — `enrichContent` type widening:** Test explicitly asserts `result` does NOT have `input` property. lio-client's `ContentEnrichResult` includes `input: string` but Spark's `EnrichResult` does not. The test catches any regression where the `input` field leaks through.

**Risk mitigation — `scanSegment` timeout:** Test uses `vi.useFakeTimers()` to verify the 5s timeout returns `[]`. This catches regressions if the timeout is accidentally removed or changed.

**Risk mitigation — Activity log fidelity:** Tests verify `addLogEntry` is called with `service: 'lytics'` for both request and response, with matching `correlationId`. This catches regressions where logging is accidentally dropped during migration.

- [ ] **Step 2: Run tests to verify they all fail**

Run: `pnpm test`
Expected: ALL FAIL — api.ts hasn't been migrated yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/lytics/__tests__/api.test.ts
git commit -m "test: add api.ts regression tests (red phase, pre-migration)"
```

---

## Task 3: Migrate `api.ts` — Helpers and `enrichContent`

**Files:**
- Modify: `src/lib/lytics/api.ts`

**Risk mitigation — Auth regression:** Switching from `Authorization` header to `?key=` query param. Both are verified working in production. The `getToken()` function is unchanged — only how the token reaches the API changes (header → query param via lio-client). If a proxy strips query params, lio-client's transport can be extended to support header auth.

**Risk mitigation — `init()` safety:** Call `await lio.init()` in the factory. It's idempotent today and costs nothing, but protects against future sdk-kit versions that might gate `transport.send()` behind initialization state.

- [ ] **Step 1: Replace imports and add `createAuthedClient` helper**

Replace lines 1–46 of `api.ts` (imports, `LYTICS_BASE`, `authHeaders`, `authHeadersGet`) with:

```typescript
/**
 * Lytics v2 API client.
 *
 * Delegates to @lytics/lio-client for all API calls.
 * Each method logs to the activity logger and handles errors defensively.
 */

import { createLioClient } from '@lytics/lio-client';
import { addLogEntry } from '@/lib/activity-logger';
import type {
  EnrichResult, AudienceAlignment, OpportunityTopic,
  LyticsSegment, SegmentGroup, LyticsContentEntity,
} from './types';

export type { EnrichResult, EnrichResult as ClassifyResult, AudienceAlignment, OpportunityTopic };

const MAX_ENRICH_CHARS = 2000;

async function getToken(): Promise<string> {
  try {
    const { getLyticsToken } = await import('@/app/api/auth/lytics/route');
    const token = await getLyticsToken();
    if (token) return token;
  } catch { /* cookies() not available outside request context */ }
  const token = process.env.LYTICS_ACCESS_TOKEN;
  if (!token) throw new Error('LYTICS_ACCESS_TOKEN is not configured');
  return token;
}

/**
 * Creates a fresh lio-client with the current token.
 * One instance per API call — no caching, no shared state, no concurrency issues.
 */
async function createAuthedClient() {
  const lio = createLioClient({ apiKey: await getToken() });
  await lio.init();
  return lio;
}

function makeCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
```

- [ ] **Step 2: Replace `enrichContent`**

**Risk mitigation — Type mismatch:** lio-client returns `ContentEnrichResult` with an `input` field. Destructure to pick only `{ topics, inferred_topics }`, matching Spark's `EnrichResult`. Test in Task 2 catches this.

```typescript
export async function enrichContent(text: string): Promise<EnrichResult> {
  const truncated = text.slice(0, MAX_ENRICH_CHARS);
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'POST', url: '/v2/content/enrich',
    summary: `enrich content (${truncated.length} chars)`, correlationId,
  });
  const start = Date.now();
  try {
    const lio = await createAuthedClient();
    const result = await lio.content.enrich({ text: truncated });
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'info',
      method: 'POST', url: '/v2/content/enrich',
      summary: `enrich content → 200 (${Date.now() - start}ms)`,
      statusCode: 200, duration: Date.now() - start, correlationId,
    });
    return { topics: result.topics ?? {}, inferred_topics: result.inferred_topics ?? {} };
  } catch {
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'error',
      method: 'POST', url: '/v2/content/enrich',
      summary: 'enrich content — failed', duration: Date.now() - start, correlationId,
    });
    return { topics: {}, inferred_topics: {} };
  }
}
```

- [ ] **Step 3: Run enrichContent tests**

Run: `pnpm test -- --grep "enrichContent"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/lytics/api.ts
git commit -m "feat: migrate enrichContent to lio-client"
```

---

## Task 4: Migrate `api.ts` — `alignContent` and `getOpportunity`

**Files:**
- Modify: `src/lib/lytics/api.ts`

- [ ] **Step 1: Replace `alignContent`**

```typescript
export async function alignContent(topics: Record<string, number>): Promise<AudienceAlignment[]> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'POST', url: '/v2/content/align',
    summary: `align content (${Object.keys(topics).length} topics)`,
    requestBody: { topics }, correlationId,
  });
  const start = Date.now();
  const lio = await createAuthedClient();
  const alignments = await lio.content.align(topics);
  addLogEntry({
    service: 'lytics', direction: 'response', level: 'info',
    method: 'POST', url: '/v2/content/align',
    summary: `align content → 200 (${Date.now() - start}ms)`,
    statusCode: 200, duration: Date.now() - start, correlationId,
  });
  return Array.isArray(alignments) ? alignments : [];
}
```

- [ ] **Step 2: Replace `getOpportunity`**

```typescript
export async function getOpportunity(): Promise<OpportunityTopic[]> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'GET', url: '/v2/content/opportunity',
    summary: 'content opportunity', correlationId,
  });
  const start = Date.now();
  const lio = await createAuthedClient();
  const topics = await lio.content.opportunity();
  addLogEntry({
    service: 'lytics', direction: 'response', level: 'info',
    method: 'GET', url: '/v2/content/opportunity',
    summary: `content opportunity → 200 (${Date.now() - start}ms)`,
    statusCode: 200, duration: Date.now() - start, correlationId,
  });
  return Array.isArray(topics) ? topics : [];
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- --grep "alignContent|getOpportunity"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/lytics/api.ts
git commit -m "feat: migrate alignContent and getOpportunity to lio-client"
```

---

## Task 5: Migrate `api.ts` — `getContentByUrl`, `getSegments`, `getSegmentGroups`

**Files:**
- Modify: `src/lib/lytics/api.ts`

**Risk mitigation — `getContentByUrl` unwrapping:** lio-client's content plugin returns `response.entity` after the transport unwraps the `{ data, status, request_id }` envelope. The null guard `entity?.url ? entity : null` matches current behavior and catches any unwrapping mismatch. Test in Task 2 covers both the happy path and the null-entity case.

**Risk mitigation — Type widening (`LyticsSegment`, `SegmentGroup`):** lio-client types have nullable/optional fields where Spark types require them. Cast lio-client returns `as LyticsSegment[]` / `as SegmentGroup[]` — TypeScript strict mode will flag mismatches at build time. Types stay in `types.ts` unchanged.

- [ ] **Step 1: Replace `getContentByUrl`**

```typescript
export async function getContentByUrl(contentUrl: string): Promise<LyticsContentEntity | null> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'GET', url: '/v2/content/entity',
    summary: `content entity: ${contentUrl.slice(0, 60)}`, correlationId,
  });
  const start = Date.now();
  try {
    const lio = await createAuthedClient();
    const entity = await lio.content.getByUrl(contentUrl);
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'info',
      method: 'GET', url: '/v2/content/entity',
      summary: `content entity → 200 (${Date.now() - start}ms)`,
      statusCode: 200, duration: Date.now() - start, correlationId,
    });
    return entity?.url ? (entity as LyticsContentEntity) : null;
  } catch {
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'error',
      method: 'GET', url: '/v2/content/entity',
      summary: 'content entity — failed', duration: Date.now() - start, correlationId,
    });
    return null;
  }
}
```

- [ ] **Step 2: Replace `getSegments`**

```typescript
export async function getSegments(sizes = true): Promise<LyticsSegment[]> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'GET', url: '/v2/segment',
    summary: 'list segments', correlationId,
  });
  const start = Date.now();
  const lio = await createAuthedClient();
  const segments = await lio.segments.list({ sizes });
  addLogEntry({
    service: 'lytics', direction: 'response', level: 'info',
    method: 'GET', url: '/v2/segment',
    summary: `list segments → 200 (${Date.now() - start}ms)`,
    statusCode: 200, duration: Date.now() - start, correlationId,
  });
  return Array.isArray(segments) ? (segments as LyticsSegment[]) : [];
}
```

- [ ] **Step 3: Replace `getSegmentGroups`**

```typescript
export async function getSegmentGroups(): Promise<SegmentGroup[]> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'GET', url: '/v2/segment/group',
    summary: 'list segment groups', correlationId,
  });
  const start = Date.now();
  const lio = await createAuthedClient();
  const groups = await lio.segments.groups();
  addLogEntry({
    service: 'lytics', direction: 'response', level: 'info',
    method: 'GET', url: '/v2/segment/group',
    summary: `list segment groups → 200 (${Date.now() - start}ms)`,
    statusCode: 200, duration: Date.now() - start, correlationId,
  });
  return Array.isArray(groups) ? (groups as SegmentGroup[]) : [];
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- --grep "getContentByUrl|getSegments|getSegmentGroups"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/lytics/api.ts
git commit -m "feat: migrate getContentByUrl, getSegments, getSegmentGroups to lio-client"
```

---

## Task 6: Migrate `api.ts` — `scanSegment` (Complete Migration)

**Files:**
- Modify: `src/lib/lytics/api.ts`

**Risk mitigation — Timeout behavioral change:** lio-client defaults to 10s timeout + 3 retries (current: 5s/no-retry via AbortController). `Promise.race` with 5s timeout preserves the current behavior. Unlike AbortController, the in-flight request continues in the background after timeout — acceptable for a read-only scan. If resource exhaustion becomes an issue, configure lio-client transport with `{ timeout: 5000, retries: 0 }`. Test in Task 2 verifies the 5s timeout with fake timers.

**Risk mitigation — `segments.scan()` vs `content.scanSegment()`:** lio-client has both. We use `lio.segments.scan()` which returns `Record<string, unknown>[]` — matching the current return type. NOT `lio.content.scanSegment()` which returns an async generator of `ContentEntity[]`.

- [ ] **Step 1: Replace `scanSegment`**

```typescript
export async function scanSegment(
  segmentId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const correlationId = makeCorrelationId();
  addLogEntry({
    service: 'lytics', direction: 'request', level: 'info',
    method: 'GET', url: `/api/segment/${segmentId}/scan`,
    summary: `scan segment ${segmentId.slice(0, 8)}… (limit ${limit})`, correlationId,
  });
  const start = Date.now();
  try {
    const lio = await createAuthedClient();
    // 5s timeout via Promise.race — matches original AbortController behavior.
    // Unlike AbortController, the in-flight request continues after timeout.
    // Acceptable for a read-only scan.
    const profiles = await Promise.race([
      lio.segments.scan(segmentId, { limit }),
      new Promise<Record<string, unknown>[]>((_, reject) =>
        setTimeout(() => reject(new Error('Scan timeout')), 5000)
      ),
    ]);
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'info',
      method: 'GET', url: `/api/segment/${segmentId}/scan`,
      summary: `scan segment → 200 (${Date.now() - start}ms)`,
      statusCode: 200, duration: Date.now() - start, correlationId,
    });
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    addLogEntry({
      service: 'lytics', direction: 'response', level: 'error',
      method: 'GET', url: `/api/segment/${segmentId}/scan`,
      summary: `scan segment — failed (${Date.now() - start}ms)`,
      duration: Date.now() - start, correlationId,
    });
    return [];
  }
}
```

- [ ] **Step 2: Keep `isLyticsConfigured` unchanged** (it doesn't use fetch/traceFetch)

- [ ] **Step 3: Run ALL tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/lytics/api.ts
git commit -m "feat: migrate scanSegment to lio-client (completes migration)"
```

---

## Task 7: Build Verification and Cleanup

**Files:**
- Verify: `src/lib/lytics/api.ts`

- [ ] **Step 1: Verify no dead code remains**

```bash
grep -n "traceFetch\|LYTICS_BASE\|authHeaders\|authHeadersGet" src/lib/lytics/api.ts
```

Expected: No matches.

- [ ] **Step 2: Build the project**

Run: `pnpm build`
Expected: Succeeds with no type errors. TypeScript strict mode catches any type mismatches between lio-client returns and Spark's stricter type definitions.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify build and tests pass after lio-client migration"
```

---

## Manual Verification Checklist

After all tasks complete, verify end-to-end:

- [ ] Open a Spark with Lytics connected → ScorePanel loads segments + opportunity
- [ ] Type in editor → debounced enrich shows topics + audiences
- [ ] Click Analyze → full SSE flow completes with Lytics + AI data
- [ ] Check Activity Log → Lytics requests/responses appear with method, URL, status, duration, correlationId pairing
- [ ] Disconnect Lytics via UI → verify fallback to AI-only analysis
- [ ] Reconnect → verify data flows again
