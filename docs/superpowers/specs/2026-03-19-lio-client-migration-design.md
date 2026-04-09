# lio-client Migration — Design Spec

## Overview

Replace Spark Foundry's hand-rolled Lytics API client (`src/lib/lytics/api.ts` — 7 fetch-based methods wrapped in `traceFetch()`) with `@lytics/lio-client`, the official tested TypeScript client for the Lytics API. The client handles response envelope unwrapping, retry logic, type safety, and diagnostic events. Adopting it means upstream fixes and new features flow automatically, maintenance surface shrinks, and behavior stays consistent with other Lytics integrations.

## Goals

1. **Zero hand-rolled fetch calls** — All 7 Lytics API methods delegate to lio-client
2. **Preserve activity logging** — Every Lytics request/response continues to appear in the Activity Log with method, URL, status, duration, and correlationId pairing
3. **Preserve error handling** — Defensive returns (`{}`, `null`, `[]`) stay identical
4. **Zero consumer changes** — `data-service.ts`, all routes, `tools-registry.ts`, and `ScorePanel.tsx` remain untouched
5. **Regression tests** — Unit tests for all 7 methods covering happy path, error handling, logging, and edge cases

## Prerequisites

`@lytics/lio-client` PR #25 adds the 5 missing features needed for full coverage:
- `content.opportunity()` — content opportunity topics
- `segments.groups()` — segment group listing
- `segments.scan()` — generic segment scanning (user-table support)
- `segments.list({ sizes: true })` — sizes query param passthrough
- Transport event enrichment (url, duration, requestId)

## Authentication

**Current:** `Authorization: <token>` header, token resolved dynamically per-request (encrypted cookie → env var fallback, with a "disabled" cookie that prevents env var fallback when user explicitly disconnects via UI).

**After migration:** `?key=<token>` query param via lio-client. Both auth methods are verified working in production. The token resolution logic (`getToken()`) is unchanged — only the transport mechanism changes.

**Risk:** A proxy or CDN could strip query params. **Mitigation:** Both methods are already verified working. If issues arise, lio-client's transport can be extended to support header auth.

## Client Instantiation

**Decision: Per-request factory, no caching.**

lio-client takes `apiKey` at construction time, but Spark Foundry resolves tokens dynamically (cookie state can change between requests). A `createAuthedClient()` helper creates a fresh lio-client per API call.

This is safe because:
- `createLioClient()` is cheap — `new SDK()` + 7 `sdk.use()` calls, no network I/O
- No caching means no invalidation logic, no shared state, no concurrency issues
- `data-service.ts` calls 3 methods in `Promise.all` — each gets its own client instance with its own closure, so no cross-contamination

**`init()` call:** Every client calls `await lio.init()` before use. It's idempotent today and costs nothing, but protects against future sdk-kit versions that might gate `transport.send()` behind initialization state.

## Type Boundary

**Decision: Keep Spark type definitions, use lio-client internally only.**

lio-client types are wider than Spark types:

| Field | Spark type | lio-client type | Issue |
|---|---|---|---|
| `LyticsContentEntity.title` | `string` (required) | `string \| null \| undefined` | Null-safety errors in consumers |
| `LyticsSegment.tags` | `string[]` (required) | `string[] \| null \| undefined` | Same |
| `OpportunityDimension.subject` | `'user' \| 'content'` | `string` | Kills exhaustiveness checking |
| `ContentEnrichResult.input` | (not present) | `string` | Extra field leaks to consumers |

**Approach:** `types.ts` keeps all existing interface definitions unchanged. `api.ts` is the only file that imports from `@lytics/lio-client`. Each method casts lio-client returns to Spark types (`as LyticsSegment[]`, etc.). TypeScript strict mode catches any mismatches at build time.

## Activity Logging

**Decision: Direct `addLogEntry()` calls per method (no event wiring).**

The existing `traceFetch()` wrapper logs:
- Request: service, method, url, summary, requestBody, correlationId
- Response: service, method, url, summary, statusCode, duration, responseBody (on error only), correlationId
- Network error: error message with correlationId

The replacement uses direct `addLogEntry()` calls before and after each lio-client call:

```
correlationId = makeCorrelationId()
addLogEntry({ direction: 'request', ... })
start = Date.now()
try {
  result = await lio.method(...)
  addLogEntry({ direction: 'response', level: 'info', duration: Date.now() - start, ... })
} catch {
  addLogEntry({ direction: 'response', level: 'error', duration: Date.now() - start, ... })
}
```

**What's preserved:** service, method, url, summary, statusCode, duration, correlationId pairing, error-level on failure.

**What's lost:** Response body on error (lio-client unwraps/throws before we can capture it). **Acceptable** — the error message from lio-client includes API error text, and the `requestId` from lio-client events enables server-side log correlation.

**Why not event wiring:** lio-client emits `lytics:request`/`lytics:response` events, but wiring them through a factory with closure-based correlationId adds complexity (event listeners, shared mutable state) for no gain over direct calls. Direct calls are simpler, explicit, and testable.

## Timeout and Retry Behavior

**`scanSegment` — behavioral change acknowledged.**

| | Current | After migration |
|---|---|---|
| Timeout | 5s via AbortController | 5s via `Promise.race` |
| Retries | None | lio-client default: 3 retries (but timeout fires first) |
| Cancellation | AbortController cancels the fetch | In-flight request continues in background |

`Promise.race` with a 5s timeout preserves the caller's experience (returns `[]` after 5s). The in-flight request continues in the background — acceptable for a read-only scan. If resource exhaustion becomes an issue, configure lio-client's transport with `{ timeout: 5000, retries: 0 }` for scan calls.

**All other methods:** No timeout changes. lio-client's default 10s timeout + 3 retries is fine for segments, groups, opportunity, enrich, align, and content entity lookups — these are not time-sensitive like scan.

## `ClassifyResult` Backward Compatibility

`api.ts` re-exports `EnrichResult as ClassifyResult`. Grep confirms no consumers import `ClassifyResult`. The re-export is kept for safety — removing it is a semver-breaking change even if unused.

## Method Mapping

| Spark method | lio-client call | Notes |
|---|---|---|
| `enrichContent(text)` | `lio.content.enrich({ text })` | Truncate to 2000 chars. Pick `{ topics, inferred_topics }`, drop `input`. |
| `alignContent(topics)` | `lio.content.align(topics)` | Direct passthrough |
| `getOpportunity()` | `lio.content.opportunity()` | Direct passthrough |
| `getContentByUrl(url)` | `lio.content.getByUrl(url)` | lio-client normalizes URL (strips protocol). Null guard: `entity?.url ? entity : null` |
| `getSegments(sizes)` | `lio.segments.list({ sizes })` | Direct passthrough |
| `getSegmentGroups()` | `lio.segments.groups()` | Direct passthrough |
| `scanSegment(id, limit)` | `lio.segments.scan(id, { limit })` | `Promise.race` with 5s timeout |
| `isLyticsConfigured()` | (unchanged) | Checks cookie/env, no API call |

## Files Affected

| File | Change |
|---|---|
| `package.json` | Add `@lytics/lio-client`, `vitest` (dev), `"test"` script |
| `vitest.config.ts` | New — vitest config with `@/` path alias |
| `src/lib/lytics/api.ts` | Rewrite 7 methods to delegate to lio-client |
| `src/lib/lytics/__tests__/api.test.ts` | New — regression tests for all 7 methods |

**Unchanged:** `types.ts`, `data-service.ts`, `analyze/route.ts`, `enrich/route.ts`, `data/route.ts`, `tools-registry.ts`, `ScorePanel.tsx`
