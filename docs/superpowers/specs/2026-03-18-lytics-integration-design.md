# Lytics Integration for Spark Foundry — Design Spec

## Overview

Integrate Lytics audience intelligence, content opportunity analysis, and behavioral scoring into Spark Foundry's Content Scoring panel and chat assistant. Lytics serves as an **ambient data layer** — always warm, refreshed in the background — while Claude operates as the **intelligence layer** that consumes Lytics data for content comparison, quality analysis, and strategic recommendations.

## Goals

1. **Audience fitment** — Show which Lytics segments/audiences align with the content being written, ranked by alignment score with profile counts
2. **Content opportunity** — Surface topic-level behavioral data (engagement segments, behavioral scores, look-alike models) and identify content gaps (high user interest, low document count)
3. **Content recommendations** — Lytics content recs ("what your audience reads") + Spark vector search ("related items in this workspace")
4. **Topical analysis** — Lytics NLP topic classification of editor content, replacing client-side keyword extraction with real topic modeling
5. **AI-powered strategic insights** — Claude compares editor content against Lytics data and generates recommendations for content updates, campaigns, and underserved audiences

## Authentication

- **Lytics:** Static API key via `LYTICS_ACCESS_TOKEN` in `.env.local`. Used server-side only. Both auth mechanisms work (verified): `Authorization: <token>` header and `?key=<token>` query param. Keep the existing header-based approach since it's already in place.
- **Contentstack:** OAuth flow (existing, unchanged).
- No new OAuth flows required.

## Architecture

### Lytics Data Service (Ambient Data Layer)

A server-side singleton (`LyticsDataService`) that caches Lytics data in memory, scoped to a single `LYTICS_ACCESS_TOKEN`. This is a single-tenant deployment (one Lytics account per Spark instance), so a process-level singleton is appropriate. Follows the same pattern as `activity-logger.ts`.

**Cached data slices:**

| Slice | Lytics Endpoint | Refresh Strategy | Purpose |
|---|---|---|---|
| Segments | `GET /v2/segment?sizes=true` | On load + Analyze | All audience definitions with profile counts (sizes=true includes `size` field on each segment) |
| Segment groups | `GET /v2/segment/group` | On load | Categories for organizing audiences |
| Content opportunity | `GET /v2/content/opportunity` | On load + Analyze | ~800 topics with behavioral scores, engagement segments, look-alike models, content prevalence |
| Content topics (editor-specific) | `POST /v2/content/enrich` | On editor change (debounced 2s, min 50-char change threshold) + Analyze | Topic classification of current draft. Text truncated to 4,000 chars (reduced from existing 5,000 to match Lytics API limit). |
| Audience alignment (editor-specific) | `POST /v2/content/align` | On editor change (debounced) + Analyze | Which segments the current content fits |
| Aggregate profile affinities | `GET /api/segment/{id}/scan` (sampled, top 5 aligned, limit=50 per segment) | On Analyze only (5s timeout per scan, skip on timeout) | Topic affinities of people in aligned audiences. If scan is slow or fails, this section is omitted gracefully — it's supplementary data, not critical. |
| Lytics content index | `GET /v2/content/entity?url=...` | On Analyze (URL-bearing Spark items) | Pre-enriched content data from Lytics |

**Cache invalidation:** Session-scoped in-memory. Full refresh on page load and on "Analyze" button click. Editor-specific slices refresh on debounced content change.

### Existing Code Migration

The existing `src/lib/lytics/api.ts` has three methods that use **broken endpoints** (verified: all return 405 Method Not Allowed):

| Existing Method | Broken Endpoint | Correct Endpoint |
|---|---|---|
| `classifyContent()` | `GET /api/content/classify` | `POST /v2/content/enrich` |
| `getAudienceAlignment()` | `POST /api/content/topics` | `POST /v2/content/align` |
| `getOpportunities()` | `GET /api/content/topics` | `GET /v2/content/opportunity` |

**Migration plan:** Replace all three methods with corrected versions using v2 endpoints. The `ClassifyResult` type changes: `POST /v2/content/enrich` returns `{ topics: Record<string, number>, inferred_topics: Record<string, number> }` — same shape as the existing `ClassifyResult` type, so consumers are unaffected. The `AudienceAlignment` type is also compatible with `/v2/content/align` response shape.

The existing `src/app/api/lytics/analyze/route.ts` orchestrates these three methods. Its response shape (`{ topics, audiences, opportunities, overallRelevance }`) will be replaced by the enhanced response described below.

**Existing chat tools in `src/lib/agent/tools-registry.ts`:** Three separate tools exist: `lytics_classify`, `lytics_get_audiences`, `lytics_get_opportunities`. These will be replaced by a single `lytics_insights` tool that reads from the `LyticsDataService` cache and supports richer queries. The three old tools and their handler cases will be removed.

**Existing scoring route:** `POST /api/scoring/analyze` (called by `ScorePanel.tsx` at line 399) provides Claude-only AI analysis. This route is **kept as-is** — it handles the AI quality analysis portion. The enhanced `/api/lytics/analyze` route orchestrates both: it fetches Lytics data, then calls the AI analysis with Lytics context injected. The ScorePanel will switch from calling `/api/scoring/analyze` directly to calling `/api/lytics/analyze`, which internally handles both Lytics + AI. When `LYTICS_ACCESS_TOKEN` is not configured, `/api/lytics/analyze` falls back to AI-only analysis (equivalent to the current `/api/scoring/analyze` behavior).

### API Routes

#### `GET /api/lytics/data` (new)

Returns the current cached Lytics state for immediate ScorePanel rendering. No Lytics API calls — reads from cache.

```typescript
// Response
{
  segments: Segment[],
  segmentGroups: SegmentGroup[],
  opportunity: OpportunityTopic[],
  lastRefreshed: string // ISO timestamp
}
```

#### `POST /api/lytics/enrich` (new)

Called on debounced editor changes. Runs `content/enrich` + `content/align` and updates cache.

```typescript
// Request
{ text: string }  // truncated to 4,000 chars server-side

// Response
{
  topics: { name: string, score: number }[],        // high-confidence topics
  inferredTopics: { name: string, score: number }[], // lower-confidence inferred topics
  audiences: { name: string, alignment: number, size: number }[]
}
```

The enrich endpoint merges `topics` and `inferred_topics` from the Lytics response, with high-confidence topics taking precedence. Both are returned so the UI can distinguish confidence levels (e.g., solid vs. faded bars).

#### `POST /api/lytics/analyze` (existing, enhanced)

Full "Analyze" button flow. Refreshes all Lytics data, samples aggregate profiles, passes everything to Claude.

```typescript
// Request
{
  text: string,
  referencedItemTexts: string[],
  sparkItemUrls?: string[]
}

// Response
{
  lytics: {
    topics: { name: string, score: number }[],
    audiences: { name: string, alignment: number, size: number }[],
    opportunity: OpportunityTopic[],
    aggregateAffinities: { segmentName: string, topAffinities: { topic: string, score: number }[] }[],
    lyticsContentRecs: ContentEntity[]
  },
  ai: {
    contentComparison: string,
    qualityAnalysis: {
      overallScore: number,
      summary: string,
      topics: { name: string, score: number }[],
      contentQuality: { readability: number, clarity: number, engagement: number, seoReadiness: number },
      channelFit: { channel: string, score: number }[]
    },
    recommendations: {
      contentUpdates: string[],
      campaignIdeas: string[],
      underservedAudiences: { name: string, size: number, gap: string, suggestion: string }[],
      contentGaps: { topic: string, userCount: number, docCount: number, opportunity: string }[]
    }
  },
  relatedSparkItems: { id: string, title: string, similarity: number }[]
}
```

### ScorePanel UI (Three Layers)

#### Layer 1 — Always visible (cached data, no button click)

- **Lytics Topic Alignment** — As the user types, debounced `enrich` calls show which Lytics topics the content maps to with confidence bars. Replaces client-side keyword extraction with real Lytics NLP when available (falls back to client-side when Lytics is unconfigured).
- **Audience Fit** — Top 10 audiences ranked by alignment score. Each row shows segment name, alignment %, and profile count (formatted as "1.2M", "45K", etc. for display — stored as `number` from the API, formatted in the UI). Expandable "Show all" reveals the full list. Optionally grouped by segment groups. Note: the existing `AIAnalysisResult.audiences.size` is typed as `string` with display formatting ("1.2M"); the Lytics data uses `number`. The ScorePanel will use `number` internally and format for display, updating the existing dot-sizing logic.
- **Content Opportunity Snapshot** — For matched topics, pull from cached opportunity data. Show user count, document count, and a computed "opportunity score" (high users + low docs = high opportunity). Visual indicator for content gaps.

#### Layer 2 — On "Analyze" click (full refresh + AI)

- **Behavioral Profile** — For top aligned audiences, show aggregate behavioral breakdown: deeply engaged vs. frequent vs. at-risk vs. casual vs. binge vs. perusers (proportions from opportunity data).
- **Behavioral Scores** — Radar or bar chart of: recency, frequency, intensity, momentum, quantity, volatility, consistency, maturity, propensity.
- **Look-alike Model Scores** — Surface `model_*` dimensions for matched topics (e.g., "Exploration to Immersion: 92%", conversion propensity).
- **Content Quality** — Existing AI quality cards (readability, clarity, engagement, SEO) — kept as-is.
- **Lytics vs. Editor Gap Analysis** — Claude's comparison of what the content covers vs. what aligned audiences care about.
- **Recommendations** — Claude's strategic output: content updates, campaign ideas, underserved audiences, content gaps with actionable suggestions.
- **Related Content** — Two sections: "From your site" (Lytics content recs via content entity lookup) and "In this Spark" (pgvector similarity search).

#### Layer 3 — Chat integration (no ScorePanel changes)

Lytics data available to the chat agent via a new tool definition. No UI changes to ScorePanel — this surfaces through chat responses.

### Chat Tool Definition

```typescript
// New tool added to /api/chat/route.ts
lytics_insights: {
  description: "Get Lytics audience and content intelligence data. Use this to answer questions about audiences, content performance, topic opportunities, and audience behavioral profiles.",
  parameters: {
    query_type: "segments" | "opportunity" | "content_alignment" | "profile_affinities",
    topic_filter?: string[],
    segment_filter?: string[],
    text?: string
  }
}
```

Example user questions this enables:
- "What audiences would care about this?" → `content_alignment` + editor text
- "What topics are underserved?" → `opportunity`, sorted by high users / low docs
- "Tell me about the Commerce audience" → `segments` + `profile_affinities`
- "What campaign could I run for at-risk users?" → `opportunity` behavioral data

### Claude AI Prompt Design

For the Analyze flow, Claude receives a structured system prompt injection:

```
You have access to real Lytics audience intelligence data for this content. Use it to provide grounded, data-driven analysis.

LYTICS CONTEXT:
- Content Topics: [topic classifications with scores]
- Aligned Audiences: [segment names, alignment %, profile counts]
- Behavioral Profile: [engagement segments, behavioral scores per audience]
- Look-alike Models: [model scores for matched topics]
- Content Opportunity: [user counts, doc counts, gap indicators]
- Aggregate Affinities: [what aligned audience members also care about]

YOUR THREE TASKS:
1. COMPARE: Analyze how this content aligns with the Lytics audience data. What topics are well-covered? What's missing? What audiences are strongly aligned vs. weakly?
2. ASSESS: Score content quality (readability, clarity, engagement, SEO readiness). Provide channel fit analysis.
3. RECOMMEND: Provide strategic recommendations:
   - Content updates to improve audience alignment
   - Campaign concepts leveraging behavioral data
   - Underserved audiences the content could be adapted for
   - Content gaps where user interest outpaces available content
```

## Lytics API Surface (Full Inventory)

### Content APIs

| Method | Endpoint | Used For |
|---|---|---|
| `POST /v2/content/enrich` | Classify text into topics (NLP pipeline: Diffbot, Google NLP, TextRazor, sentiment, embeddings). Input capped at 4,000 chars. |
| `POST /v2/content/align` | Map topics to audience segments. Params: `method` (embed/jaccard/cosine), `limit`. Returns segment_id, name, size, alignment, segment_topics. |
| `GET /v2/content/entity?url=` | Look up pre-enriched content by URL. Returns full topic classification, segment mappings. |
| `GET /v2/content/opportunity` | **Undocumented.** Returns ~800 topics, each with 19 dimensions: behavioral segments (deeply_engaged, frequent, at_risk, casual, binge, perusers), behavioral scores (recency, frequency, intensity, momentum, quantity, volatility, consistency, maturity, propensity), look-alike models, User Count, Document Count. |

### Segment APIs

| Method | Endpoint | Used For |
|---|---|---|
| `GET /v2/segment` | List all segments with metadata (name, slug, description, kind, tags, groups, SegmentQL). Params: `table`, `valid`, `kind`, `sizes=true` (includes profile count on each segment). |
| `GET /v2/segment/{slugOrId}` | Get single segment. Param: `sizes=true` for profile count. |
| `GET /v2/segment/group` | List segment groups for categorization/filtering. |
| `GET /api/segment/{id}/scan` | **(v1 only — no v2 equivalent exists.)** Enumerate profiles in a segment (paginated). Returns profile fields including topic affinities. Used for aggregate profile insights sampling. Params: `limit`, `start` (cursor). |

### Supporting APIs

| Method | Endpoint | Used For |
|---|---|---|
| `GET /v2/schema/{table}` | Table schema introspection. Auto-discover table names. |
| `GET /v2/ai/prompt/segment/{id}` | LLM-ready context for a segment. Could supplement Claude's prompt. |

## Data Models

### OpportunityTopic (from /v2/content/opportunity)

```typescript
interface OpportunityTopic {
  topic: string;
  dimensions: OpportunityDimension[];
  segments: string[];
  context_layer: string; // "default"
}

interface OpportunityDimension {
  label: string;   // e.g. "deeply_engaged_users", "score_recency", "User Count"
  value: number;   // proportion (0-1) for segments, 0-100 for scores, raw count for counts
  subject: "user" | "content";
}
```

### Dimension Labels (19 total)

**Behavioral segments (proportions 0-1):**
- `deeply_engaged_users`, `frequent_users`, `binge_users`, `at_risk_users`, `casual_visitors`, `perusers`

**Behavioral scores (0-100):**
- `score_recency`, `score_frequency`, `score_intensity`, `score_momentum`, `score_quantity`, `score_volatility`, `score_consistency`, `score_maturity`, `score_propensity`

**Look-alike models (0-1):**
- `model_Exploration to Immersion`
- `model_all::nb_enter_closed_won_within_last_year`

**Counts:**
- `User Count` (subject: user)
- `Document Count` (subject: content)

### Segment

```typescript
interface LyticsSegment {
  id: string;
  slug_name: string;
  name: string;
  description: string;
  kind: string;
  table: string;
  size: number;
  tags: string[];
  groups: string[];
  segment_ql: string;
  is_public: boolean;
  public_name: string;
  category: string;
  created: string;
  updated: string;
}
```

### ContentEntity (from /v2/content/entity)

```typescript
interface LyticsContentEntity {
  url: string;
  title: string;
  author: string;
  description: string;
  lytics: Record<string, number>;   // Lytics-extracted topics
  global: Record<string, number>;   // Global topics
  _segments: string[];              // Mapped segments
  created: string;
  _modified: string;
}
```

## File Inventory

### New Files

| File | Purpose |
|---|---|
| `src/lib/lytics/data-service.ts` | Singleton cache + Lytics API orchestration. Manages refresh lifecycle, exposes `getData()`, `refreshAll()`, `enrichContent()`. |
| `src/lib/lytics/types.ts` | TypeScript types for all Lytics data models |
| `src/app/api/lytics/data/route.ts` | GET — return cached Lytics state |
| `src/app/api/lytics/enrich/route.ts` | POST — debounced editor enrichment |

### Modified Files

| File | Changes |
|---|---|
| `src/lib/lytics/api.ts` | Fix broken endpoints (`/api/content/classify` → `/v2/content/enrich`, `/api/content/topics` → `/v2/content/align`, `/api/content/topics` → `/v2/content/opportunity`). Add new methods: `getSegments(sizes?: boolean)`, `getSegmentGroups()`, `getOpportunity()`, `scanSegment()`, `getContentByUrl()`. Rename existing `classifyContent()` → `enrichContent()`, `getAudienceAlignment()` → `alignContent()`. Keep `Authorization` header auth (verified working). |
| `src/app/api/lytics/analyze/route.ts` | Enhanced: full Lytics refresh + Claude AI analysis with Lytics context injection + Spark vector search. New response shape replaces the current flat `{ topics, audiences, opportunities, overallRelevance }`. Falls back to AI-only when `LYTICS_ACCESS_TOKEN` is missing. |
| `src/components/ScorePanel.tsx` | Three-layer UI: always-on Lytics data (Layer 1), full analysis results (Layer 2). Switch from calling `/api/scoring/analyze` to `/api/lytics/analyze`. Audience `size` changes from `string` to `number` (format for display in UI). New sections for behavioral profile, opportunity, recommendations. |
| `src/lib/agent/tools-registry.ts` | Remove `lytics_classify`, `lytics_get_audiences`, `lytics_get_opportunities` tools and their handlers. Add `lytics_insights` tool with `query_type` discriminator that reads from `LyticsDataService`. |
| `src/app/api/scoring/analyze/route.ts` | Unchanged — still exists, but ScorePanel no longer calls it directly. May be invoked internally by the enhanced `/api/lytics/analyze` route. |

### Unchanged

- Database schema — Lytics data is session-cached, not persisted
- Embedding pipeline — Spark vector search already works
- Contentstack integration — remains on OAuth, unaffected
- Activity logger — `lytics` service color already exists

## API Call Budget

| Trigger | Calls | Notes |
|---|---|---|
| Spark load | ~4 | segments, sizes, groups, opportunity |
| Editor change (debounced) | 2 | enrich + align |
| Analyze button | ~4 base + ~5 scans | Full refresh + profile sampling for top 5 aligned segments |
| Chat tool use | 0-2 | Reads from cache; may trigger enrich/align if text provided |

## Error Handling

- **Missing `LYTICS_ACCESS_TOKEN`:** ScorePanel renders without Lytics sections; falls back to existing client-side keyword extraction + Claude-only analysis. No errors shown.
- **Lytics API failure:** Cache retains last-good data. Error badge on the Lytics section with retry option. AI analysis proceeds without Lytics context.
- **Rate limiting:** Not publicly documented. Implement exponential backoff (3 retries) matching the lio-client pattern.
- **Empty data:** Graceful empty states for accounts with few segments/topics. Opportunity data may have topics with 0 users/0 docs — filter these from display.

## Resolved Questions

1. **Auth mechanism:** Both `Authorization: <token>` header and `?key=<token>` query param work (tested). Keep existing header-based approach.
2. **API endpoints:** Existing code uses broken `/api/` endpoints (all return 405). Correct endpoints are `/v2/` versions. Migration plan documented above.
3. **Segment scan sampling:** `limit=50` per segment, top 5 aligned segments, 5s timeout per scan. Omit gracefully on timeout.

## Open Questions

1. **Opportunity score formula:** Proposed: `opportunity = (userCount / maxUserCount) * (1 - docCount / maxDocCount)` — surfaces topics with high interest and low content coverage. Tunable.
2. **`context_layer` field:** The opportunity endpoint returns `context_layer: "default"` on every topic. Unclear if other values exist. Store but don't display until understood.
