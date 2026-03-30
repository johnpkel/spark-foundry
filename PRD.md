# Spark Foundry — Product Requirements Document

> **Last updated:** 2026-03-27
> **Version:** 1.0
> **Status:** Living document — updated via `/update-prd` skill

---

## 1. Product Overview

**Spark Foundry** is an AI-powered content workspace that enables teams to collect, organize, analyze, and generate strategic content. It combines multimodal RAG (Retrieval-Augmented Generation) with real-time collaborative editing, visual canvas organization, and multi-source content ingestion to serve as a "second brain" for content strategy.

### Core Value Proposition

- **Collect** content from any source — URLs, images, documents, Slack threads, CMS entries, analytics data
- **Organize** visually on a canvas or in a collaborative editor with real-time presence
- **Ask** an AI assistant that understands all collected content via semantic search
- **Generate** strategic artifacts (CMS entries, campaign briefs) grounded in real content

---

## 2. User Experience

### 2.1 Dashboard (`/`)

The landing page displays all Sparks (workspaces) as cards with name, description, item count, and quick actions. Users can search existing Sparks or create new ones via a modal.

### 2.2 Spark Workspace (`/spark/[id]`)

The primary workspace is organized into:

**Left Sidebar Tabs:**
| Tab | Purpose |
|---|---|
| Items | Card grid of all collected items, filterable by type |
| Graph | 3D vector space visualization of items (Three.js) |
| Chat | AI conversation interface with session history |
| Skills | Browse, create, and manage AI agent skills with per-Spark variable overrides |
| Generate | Artifact creation (CMS Entry, Campaign Brief, Custom) |

**Center View (switchable):**
- **Editor** — Tiptap rich text editor with real-time collaboration, comments, drawing, group blocks
- **Canvas** — React Flow node graph with swimlane layout, draggable groups, floating chat

**Right Drawer Tabs:**

| Tab | Description |
|---|---|
| Discussions | Comment threads on selected editor text |
| Scoring | Lytics-powered content scoring with audience fit, topic analysis, content opportunity, AI quality assessment, and strategic recommendations |

**Header:**
- Spark name, presence avatars, integration status, primary domains config, generate button, activity log button

---

## 3. Content Item Types

Items are the atomic units of content in a Spark. Each type has specific ingestion behavior:

| Type | Source | Enrichment |
|---|---|---|
| `link` | Pasted URL | Scrapes OG metadata, full text, images via Cheerio |
| `image` | Upload or URL | Claude Vision analysis (OCR, objects, scene, type) |
| `text` | Manual input | Direct text storage |
| `note` | Manual input | Direct text storage |
| `file` | Upload | Content extraction |
| `google_drive` | Drive search | File content export (Docs/Sheets as text, 100KB cap) |
| `slack_message` | Slack bot | Thread messages formatted with usernames |
| `contentstack_entry` | CMS import | Recursive text extraction from nested schema fields |
| `contentstack_asset` | CMS import | Asset metadata and content |
| `clarity_insight` | Analytics import | Formatted metric text by dimension |
| `web_research` | Chat tool | Saved research with sources and tags |

---

## 4. RAG Pipeline

At the heart of Spark Foundry lies a **multimodal Retrieval-Augmented Generation pipeline** — a three-phase architecture that ingests heterogeneous content from disparate sources, projects it into a unified 1024-dimensional semantic manifold via Voyage AI's multimodal encoder, and orchestrates agentic retrieval at inference time through Claude's autonomous tool-use loop.

The pipeline achieves **cross-modal semantic unification**: text documents, visual assets, conversational threads, CMS entries, and analytics telemetry all coexist as neighbors in a shared vector space, enabling the retrieval layer to surface contextually relevant content regardless of its original modality. Ingestion is non-blocking — embeddings are generated asynchronously via fire-and-forget callbacks, ensuring that content acquisition never blocks the user's workflow. At query time, the LLM acts as an autonomous retrieval orchestrator, dynamically selecting between vector similarity search (cosine distance over pgvector indices), lexical keyword matching, live web retrieval, and deep URL scraping — composing multi-hop retrieval strategies without explicit user instruction.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INGESTION PHASE                                  │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Link   │  │  Image   │  │  Slack   │  │Contentstack│ │ Clarity  │ │
│  │  Scrape  │  │ Analysis │  │  Thread  │  │  Import   │  │  Import  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │              │              │              │      │
│       ▼              ▼              ▼              ▼              ▼      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    buildItemText()                                │   │
│  │   Combines: title + content + summary + metadata +               │   │
│  │             image_analysis + tags → unified text                  │   │
│  └──────────────────────────┬───────────────────────────────────────┘   │
│                             │                                           │
│                    ┌────────┴────────┐                                  │
│                    │  Has image URL? │                                  │
│                    └───┬─────────┬───┘                                  │
│                   Yes  │         │  No                                  │
│                        ▼         ▼                                      │
│            ┌───────────────┐  ┌───────────────┐                        │
│            │ Voyage AI     │  │ Voyage AI     │                        │
│            │ Multimodal    │  │ Text          │                        │
│            │ (image+text)  │  │ Embedding     │                        │
│            └───────┬───────┘  └───────┬───────┘                        │
│                    │                  │                                  │
│                    ▼                  ▼                                  │
│            ┌────────────────────────────────┐                           │
│            │  1024-dim embedding vector     │                           │
│            │  → spark_items.embedding       │                           │
│            │  (pgvector in Supabase)        │                           │
│            └────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        RETRIEVAL PHASE                                  │
│                                                                         │
│  ┌──────────────┐                                                       │
│  │  User Query  │                                                       │
│  │  (chat msg)  │                                                       │
│  └──────┬───────┘                                                       │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐       │
│  │ generateQueryEmbed  │    │  Claude selects tool:            │       │
│  │ (Voyage AI,         │    │  • semantic_search (vector)      │       │
│  │  input_type=query)  │    │  • keyword_search (SQL ilike)    │       │
│  └──────┬──────────────┘    │  • list_items (all items)        │       │
│         │                   │  • scrape_url (deep read)        │       │
│         ▼                   │  • web_search (internet)         │       │
│  ┌─────────────────────┐    │  • save_web_research (persist)   │       │
│  │ match_spark_items   │    │  • get_spark_details             │       │
│  │ (Supabase RPC)      │    └──────────────────────────────────┘       │
│  │                     │                                                │
│  │ Cosine similarity   │                                                │
│  │ threshold: 0.3      │                                                │
│  │ top_k: 10           │                                                │
│  └──────┬──────────────┘                                                │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────┐                                                │
│  │ Results + Images    │  (multimodal context with similarity scores)   │
│  └──────┬──────────────┘                                                │
│         │                                                               │
└─────────┼───────────────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────────────┐
│         ▼              GENERATION PHASE                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   Anthropic Claude Sonnet 4.6                    │   │
│  │                                                                  │   │
│  │  System prompt: Strategic advisor persona                        │   │
│  │  Context: Retrieved items + images + tool results                │   │
│  │  Capabilities: Markdown, proposals, multimodal responses         │   │
│  │  Streaming: SSE token-by-token                                   │   │
│  └──────────────────────────┬───────────────────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Response streamed to UI                                         │   │
│  │  • Markdown with syntax highlighting                             │   │
│  │  • Inline images from search results                             │   │
│  │  • Proposal blocks (suggested text edits)                        │   │
│  │  • Vector context visualization                                  │   │
│  │  • Message + context saved to chat_messages                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Specifications

| Parameter | Value |
|---|---|
| **Encoder** | Voyage AI `voyage-multimodal-3` — a joint text-image embedding model |
| **Dimensionality** | 1024-dim dense vectors (shared cross-modal latent space) |
| **Index** | Supabase pgvector with cosine distance (`match_spark_items` RPC) |
| **Retrieval threshold** | Cosine similarity ≥ 0.3, top-k = 10 |
| **Batch cardinality** | 50 items per embedding request (bulk import pipeline) |
| **Latency strategy** | Non-blocking `after()` callbacks — ingestion returns immediately; embedding generation proceeds asynchronously |
| **Query encoding** | Asymmetric — queries use `input_type: "query"` for optimized retrieval alignment against `input_type: "document"` corpus vectors |
| **Text assembly** | `buildItemText()` concatenates title, body, summary, structured metadata, image analysis transcriptions, and tags into a single embedding-ready document |
| **Multimodal fusion** | Items with visual assets pass both the image tensor and assembled text to the multimodal encoder, producing a single vector that captures both visual semantics and textual context |

---

## 5. AI Chat System

### 5.1 Architecture

The chat uses **SSE streaming** with **Anthropic Claude Sonnet 4.6** and a tool-use loop:

1. User sends message → `POST /api/chat` (SSE)
2. System prompt sets strategic advisor persona
3. Claude receives tools and conversation history
4. Claude calls tools as needed (may loop multiple times)
5. Response streamed token-by-token to client
6. Message + retrieved context items saved to database

### 5.2 Available Tools

| Tool | Risk | Description |
|---|---|---|
| `semantic_search` | Read | Vector similarity search across spark items (primary retrieval) |
| `keyword_search` | Read | SQL ilike fallback for exact matches |
| `list_items` | Read | Return all items in the spark |
| `get_spark_details` | Read | Spark metadata and settings |
| `scrape_url` | Read | Deep-read a specific URL for detailed content |
| `web_search` | Read | Internet search via Anthropic hosted tool (max 10/session) |
| `save_web_research` | Read | Persist web research as a new spark item with embedding |
| `lytics_insights` | Read | Query Lytics CDP data — segments, opportunity landscape, content alignment, profile affinities |
| `lytics_api` | Dynamic | General-purpose Lytics REST API proxy — calls any endpoint with auth from the Integrations tab. Risk is `read` for GET, `write` for POST/PUT, `destructive` for DELETE. |
| `use_skill` | Read | Load a skill's full instructions to guide the agent's behavior for a specific task |
| `get_skill_resource` | Read | Load a named reference document from an activated skill |
| `draft_skill` | Read | Draft a new reusable skill from the current conversation |
| `update_editor` | Read | Apply content to the user's Spark Editor document (append, integrate, insert_after modes) |
| CMS tools | Write | 12 Contentstack tools: list/get content types, search/get/create/update/delete/publish entries, list environments/languages |

### 5.3 Session Management

- Multiple chat sessions per spark
- Session history with preview text
- Rename and delete sessions
- Context items tracked per message for transparency

---

## 6. Content Generation

### 6.1 Artifact Types

| Type | Output |
|---|---|
| CMS Entry | Structured JSON matching Contentstack schema |
| Campaign Brief | Strategic campaign document with objectives, audiences, channels |
| Custom | Freeform generation with user instructions |

### 6.2 Generation Flow

1. User selects artifact type and provides optional instructions
2. `POST /api/generate` launches agent with full spark content
3. Agent uses `list_spark_items` tool to fetch all content
4. Claude generates structured JSON artifact
5. Artifact saved to `generated_artifacts` table

---

## 7. AI Agent Skills

Skills are reusable instruction sets that teach the AI agent how to perform specific tasks. They provide the "what to do" layer while the Integrations tab provides the "auth to do it with."

### 7.1 Architecture

Skills are stored in the `skills` table in Supabase with the following structure:

| Field | Type | Purpose |
|---|---|---|
| `name` | string | kebab-case identifier (max 64 chars) |
| `description` | string | What the skill does + trigger phrases (shown to the agent) |
| `instructions` | string | Full step-by-step instructions in Markdown |
| `variables` | array | Optional `{{variable}}` placeholders customizable per-Spark |
| `tool_scope` | array | Which tools the skill is allowed to use |
| `resources` | array | Named reference documents loadable via `get_skill_resource` |
| `spark_id` | uuid | `null` for global skills, set for Spark-specific skills |
| `is_active` | bool | Whether the skill appears in the agent's Available Skills list |

### 7.2 Progressive Disclosure

Skills load in two stages:

1. **Level 1 (system prompt):** All active skills are listed by name and description in the agent's system prompt as "Available Skills." The agent sees trigger phrases and can decide when to activate a skill.
2. **Level 2 (on demand):** When the agent calls `use_skill`, the full instructions are loaded and returned as a tool result, guiding the agent's behavior for the rest of the task.

### 7.3 Skill Categories

**Starter Skills** (seeded globally via `src/lib/agent/starter-skills.ts`):
- `campaign-brief` — Create structured campaign briefs
- `content-calendar` — Plan editorial content calendars
- `meeting-to-actions` — Extract action items from meeting notes
- `competitive-analysis` — Build competitive analysis frameworks
- `social-copy` — Generate platform-specific social media copy
- `strategic-copy-editing` — Review and elevate content quality
- `research-summary` — Synthesize Spark items into research digests
- `project-plan` — Create phased project plans
- `content-scoring-analytics` — Interpret Content Scoring & Analytics data with full metric context

**Lytics CDP Skills** (imported from `drewlanenga/agent-skills`, adapted for Spark):
| Skill | Purpose |
|---|---|
| `lytics-agent` | Top-level router — classifies user intent and routes to the right specialized skill |
| `lytics-audience-advisor` | Strategic audience guidance — evidence-based targeting recommendations |
| `lytics-audience-builder` | End-to-end segment creation from natural language |
| `lytics-audience-snapshot` | Demographic breakdowns, field distributions, coverage analysis |
| `lytics-segment-manager` | Segment CRUD, FilterQL validation, and sizing |
| `lytics-profile-explorer` | Interactive profile lookup with segment memberships |
| `lytics-profile-investigator` | Diagnose why a user is/isn't in a segment |
| `lytics-schema-discovery` | Find schema fields matching natural language descriptions |
| `lytics-schema-manager` | Browse and modify schema fields, mappings, identity config |
| `lytics-schema-optimizer` | Analyze schema health — unused fields, coverage, merge ops |
| `lytics-integration-advisor` | Strategic guidance for data integrations |
| `lytics-integration-setup` | Guided setup for connections, auth, and jobs |
| `lytics-connection-manager` | Browse and manage connections and auth providers |
| `lytics-job-manager` | Job lifecycle — create, pause, resume, bounce, kill |
| `lytics-campaign-flow-builder` | Multi-step campaign journeys with delays, conditionals, A/B tests |
| `lytics-flow-manager` | Flow CRUD and step management |
| `lytics-export-debugger` | Trace why a user was/wasn't exported to an external platform |
| `lytics-data-health-monitor` | Single-command data health check across streams, jobs, schema |
| `lytics-filterql-builder` | Translate natural language to FilterQL expressions |
| `lytics-stream-inspector` | Inspect data streams, view stats, browse recent events |
| `lytics-entity-lookup` | Look up user profiles by identity field |

The Lytics skills use the `lytics_api` tool for general-purpose API access and include 5 reference documents (API conventions, response format, confirmation gate pattern, field types, FilterQL grammar) attached as resources to the `lytics-agent` router skill.

### 7.4 Data Access Model

The AI agent accesses data through three primary channels:

1. **Items & Groups** — The user's curated knowledge base in the Spark (Supabase). Accessed via `semantic_search`, `keyword_search`, `list_items`, `get_spark_details`.
2. **Skills + Integration APIs** — Skills provide structured instructions; the Integrations tab provides auth. The agent calls `use_skill` to load how-to instructions, then uses integration-specific tools (`lytics_api`, `lytics_insights`, CMS tools) to execute.
3. **Web Search** — Internet research via the `web_search` and `scrape_url` tools.
4. **Content Scoring Data** — The `content-scoring-analytics` skill gives the agent interpretive context for all scoring metrics (opportunity scores, behavioral dimensions, AI quality scores, channel fit).

### 7.5 User-Created Skills

Users can create custom skills:
- **From chat:** Ask the agent to "save this as a skill" — the `draft_skill` tool produces a draft sent to the Skills panel for review
- **From UI:** The Skills panel (tab in the left sidebar) allows creating, editing, and managing skills
- **Variables:** Skills support `{{variable}}` placeholders with per-Spark overrides (e.g., `{{brand_name}}`, `{{target_audience}}`)

---

## 8. Integrations

### 8.1 Contentstack (CMS)

- **Auth:** OAuth 2.0 (Management API tokens stored in Supabase)
- **Capabilities:**
  - Browse stacks, content types, entries, assets
  - Bulk import entries with recursive text extraction from nested schema fields
  - Bulk import assets with metadata
  - Prune previously imported entries
  - Upload generated assets back to Contentstack
- **Import method:** SSE streaming with real-time progress

### 8.2 Google Drive

- **Auth:** OAuth 2.0 with refresh token
- **Capabilities:**
  - Two-pass search (title match → full-text backfill)
  - Export Docs/Sheets as text (100KB cap for binary)
  - Create items from search results

### 8.3 Slack

- **Auth:** Bot token (Events API)
- **Capabilities:**
  - Respond to @mentions in threads
  - Fetch full thread messages with user resolution
  - Save threads as spark items with embeddings
  - "Save to Spark" via message context menu
- **Architecture:** Webhook → async worker pattern for heavy processing

### 8.4 Microsoft Clarity (Analytics)

- **Auth:** API token
- **Capabilities:**
  - Import metrics across strategic dimension combinations
  - Format analytics data as embeddable text items
  - Idempotent re-import (deletes old items first)
- **Rate limits:** 10 requests/day, 1-3 day windows

### 8.5 Web Search

- **Auth:** Built-in Anthropic tool (no separate auth)
- **Capability:** Internet search during chat (max 10 uses per session)

### 8.6 Lytics (Audience Intelligence)

- **Auth:** API token entered by the user via the Integrations tab. Stored as an AES-GCM encrypted `httpOnly` cookie (`lytics_token`, 1-year expiry). Falls back to `LYTICS_ACCESS_TOKEN` env var. The `lytics_disabled` cookie prevents env var fallback after explicit disconnect.
- **Capabilities:**
  - Real-time content topic classification via NLP enrichment pipeline
  - Audience alignment scoring (cosine similarity against behavioral segments)
  - Content opportunity analysis (800+ topics with behavioral scores)
  - Aggregate profile affinity sampling
  - Content entity lookup for primary domain URLs
- **Architecture:** Ambient data layer — cached in-memory singleton, refreshed on load and editor changes
- **API Endpoints Used:**
  - `POST /v2/content/enrich` — classify text into topics
  - `POST /v2/content/align` — match topics to audience segments
  - `GET /v2/content/opportunity` — behavioral scores across topic landscape
  - `GET /v2/segment?sizes=true` — audience segments with profile counts
  - `GET /v2/segment/group` — segment categorization
  - `GET /api/segment/{id}/scan` — profile sampling (v1 only)
  - `GET /v2/content/entity` — indexed content lookup

### 8.7 Integration Status

All integrations expose a unified status endpoint (`GET /api/integrations/status`) returning `connected`, `active`, or `not_configured` per service.

---

## 9. Collaborative Editing

### 9.1 Rich Text Editor (Tiptap)

**Formatting:**
Bold, italic, strikethrough, code, headings (1-3), bullet/ordered lists, blockquotes, tables, task lists, horizontal rules

**Custom Extensions:**
- **Group Block** — Select and organize items into labeled groups
- **Drawing** — Freehand sketching canvas
- **Slash Commands** — Quick insertion (/, typing triggers menu)
- **Mentions** — @ user mentions

### 9.2 Real-Time Collaboration

- **Protocol:** Yjs CRDT via TipTap Pro cloud provider
- **Presence:** Live cursor positions with user colors
- **Awareness:** Active user avatars in header
- **Auth:** JWT tokens generated per session (`/api/collab-token`)
- **Persistence:** Auto-save to Spark metadata every 2 seconds (debounced)

### 9.3 Comment Threading

- Inline comment anchors (custom Tiptap marks)
- Popover UI for creating/replying to comments
- Discussions panel with resolve/filter capabilities

---

## 10. Canvas Visualization

### 11.1 React Flow Canvas

- **Nodes:** Item cards colored by type, draggable
- **Groups:** Selection bounding boxes with custom colors and dedicated chat sessions
- **Layout:** Swimlane algorithm (items grouped by type into vertical columns)
- **Toolbar:** Floating bar for Add Item, Create Group, Reset Layout
- **Navigation:** Mini-map, zoom controls, background grid

### 11.2 3D Vector Space (Three.js)

- Scatter plot of items in reduced vector space
- Fly-in animation on load
- Similarity edges between related items
- Hover tooltips with item previews
- Type-based color coding

---

## 11. Content Scoring & Lytics Data Service

Content Scoring is a three-layer system combining real-time Lytics audience intelligence with AI-powered quality analysis.

### 11.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     LYTICS DATA SERVICE (Ambient Layer)                  │
│                     Singleton cache · Refreshes on load + edit + analyze │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Segments     │  │ Seg. Groups  │  │ Opportunity   │  │  Content   │  │
│  │  /v2/segment  │  │ /v2/segment/ │  │ /v2/content/  │  │  Topics    │  │
│  │  ?sizes=true  │  │ group        │  │ opportunity   │  │  (editor)  │  │
│  │              │  │              │  │              │  │            │  │
│  │  Audience     │  │  Category    │  │  ~800 topics  │  │  Enrich +  │  │
│  │  definitions  │  │  groupings   │  │  × 19 dims:   │  │  Align     │  │
│  │  + profile    │  │  for filter  │  │  behavioral   │  │  results   │  │
│  │  counts       │  │              │  │  scores,      │  │            │  │
│  │              │  │              │  │  engagement,   │  │            │  │
│  │              │  │              │  │  models,       │  │            │  │
│  │              │  │              │  │  prevalence    │  │            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
│         └─────────────────┴────────┬────────┴─────────────────┘         │
│                                    │                                    │
│                          ┌─────────▼─────────┐                         │
│                          │   In-Memory Cache  │                         │
│                          │   (LyticsCache)    │                         │
│                          │                    │                         │
│                          │   Persisted to     │                         │
│                          │   sparks.metadata  │                         │
│                          │   .lyticsCache     │                         │
│                          └─────────┬─────────┘                         │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
         ┌──────────▼──┐   ┌────────▼───────┐  ┌────▼────────────┐
         │  Layer 1     │   │   Layer 2       │  │   Layer 3       │
         │  Always-On   │   │   Full Analysis │  │   Chat Tools    │
         │              │   │                 │  │                 │
         │ ScorePanel   │   │ POST /api/      │  │ lytics_insights │
         │ renders from │   │ lytics/analyze  │  │ tool in chat    │
         │ cache on     │   │                 │  │ agent           │
         │ every edit   │   │ SSE streaming   │  │                 │
         └──────────────┘   └────────┬────────┘  └─────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼──────────┐
              │  Lytics    │  │  Claude AI   │  │  Profile       │
              │  Refresh   │  │  Analysis    │  │  Sampling      │
              │            │  │              │  │                │
              │  Segments  │  │  Two tools:  │  │  /api/segment/ │
              │  Opportunity│  │  quality +   │  │  {id}/scan     │
              │  Enrich    │  │  strategic   │  │  (top 5        │
              │  Align     │  │              │  │  audiences)    │
              └────────────┘  └──────────────┘  └────────────────┘
```

### 11.2 Three Layers

**Layer 1 — Always-On (no button click required):**
- Lytics Topics: NLP topic classification via `/v2/content/enrich`, debounced 2s on editor changes
- Audience Fit: Cosine similarity alignment via `/v2/content/align`, ranked by alignment %
- Content Opportunity: Topic landscape from `/v2/content/opportunity`, scored by `(userCount/maxUsers) × (1 - docCount/maxDocs)`

**Layer 2 — Full Analysis (on "Run full analysis" click):**
- Refreshes all Lytics data + editor enrichment in parallel
- Samples aggregate profile affinities from top 5 aligned segments
- Passes full Lytics context to Claude via structured system prompt injection
- Claude calls two tools:
  - `submit_content_analysis` → quality scores (readability, clarity, engagement, SEO), channel fit
  - `submit_strategic_analysis` → gap analysis, content updates, campaign ideas, underserved audiences, content gaps
- Results streamed via SSE with real-time step progress

**Layer 3 — Chat Integration:**
- `lytics_insights` tool available to chat agent for cached data queries (segments, opportunity, content_alignment, profile_affinities)
- `lytics_api` tool provides general-purpose Lytics REST API access for any endpoint (profile lookups, segment CRUD, schema, jobs, flows, streams, etc.)
- `content-scoring-analytics` skill gives the agent full interpretive context for all scoring metrics — formulas, what each score means, quality tiers, and how to advise on the data
- 21 Lytics CDP skills (audience building, profile investigation, schema management, etc.) provide structured workflows for complex operations

### 11.3 Primary Domains

Each Spark has a configurable `primaryDomains` list (stored in `sparks.metadata.primaryDomains`). This anchors the Spark to specific websites:
- Scopes Lytics content entity lookups to indexed domains
- Prevents 404s on non-indexed URLs (Google Docs, Slack, etc.)
- Configurable via globe icon in workspace header

### 11.4 Persistence

Scoring data persists across sessions in `sparks.metadata.lyticsCache`:
- Topics, audiences, opportunity data, full analysis results
- Hydrated instantly on Spark load (no loading state)
- Replaced as fresh data arrives
- Uses `metadata_merge` PATCH to avoid overwriting concurrent writes

### 11.5 UI Features

- **Expandable explanations** on every metric (click chevron to see data source, formula, and significance)
- **Raw Data toggle** shows underlying JSON, API endpoints, tool schemas, and formulas
- **Expand All / Collapse All** toggle for all explanations
- **Source links** to Lytics UI (`app.lytics.com/a/{aid}/...`)
- **Tooltips** on section headers explaining each metric category
- **Analysis progress steps** shown via SSE during full analysis (replaces spinner)
- **Collapsible AI summary**
- **Content score ring** (bottom of panel, only after full analysis)
- **Editor stats bar** (word count, sentences, readability below toolbar)

---

## 12. Activity Log System

### Server-Side

- **Singleton:** `addLogEntry()` with 500-entry circular buffer
- **Broadcasting:** EventEmitter → SSE to all connected clients
- **Instrumentation:** `traceFetch()` wrapper auto-logs all external API calls
- **Services tracked:** Anthropic, Voyage AI, Supabase, Contentstack, Google, Slack, Clarity, Lytics, Internal

### Client-Side

- **Provider:** React Context with SSE subscription
- **Panel:** 480px right drawer with:
  - Service filter chips (color-coded)
  - Errors-only toggle
  - Text search
  - Sort by time
  - Expandable entry rows with request/response details

---

## 13. Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| Editor | Tiptap + TipTap Pro (Yjs CRDT) |
| Canvas | React Flow |
| 3D Viz | Three.js + react-three-fiber |
| Database | Supabase (PostgreSQL + pgvector) |
| Embeddings | Voyage AI (voyage-multimodal-3) |
| LLM | Anthropic Claude Sonnet 4.6 |
| Scraping | Cheerio |
| Auth | Supabase Auth + per-integration OAuth |

### SSE Pattern (used throughout)

```ts
return new Response(new ReadableStream({
  start(controller) {
    // Emit events via controller.enqueue()
  }
}), {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
})
```

Used for: Chat streaming, Contentstack import, Clarity import, Activity log

### Data Model

```
sparks
├── spark_items (with pgvector embeddings)
├── chat_sessions
│   └── chat_messages
│       └── chat_message_context
├── generated_artifacts
└── spark_web_research
    └── web_research_items
```

### Key Architectural Patterns

1. **Fire-and-forget embeddings** — `after()` callback for non-blocking embedding generation
2. **Multimodal vector unification** — Text and images in same 1024-dim space
3. **Tool-use agent loop** — Claude autonomously selects and calls tools during chat
4. **Idempotent bulk imports** — Delete-then-reinsert for Contentstack/Clarity
5. **SSE everywhere** — Long-running operations stream progress to client
6. **Service-instrumented logging** — All external calls auto-logged with timing

---

## 14. Theming

- **Mechanism:** CSS custom properties via Tailwind
- **Toggle:** Dark/light/system via localStorage (`spark-theme`)
- **Activation:** `.dark` class on `<html>` element
- **Palette:** Venus design system (`--venus-purple`, `--venus-gray-*`, `bg-surface`, etc.)

---

## 15. Deployment

- **Platform:** Contentstack Launch (Nginx reverse proxy)
- **SSE compatibility:** Headers configured for Nginx buffering bypass
- **Environment variables:** API keys for Anthropic, Voyage AI, Supabase, Contentstack, Google, Slack, Clarity, Lytics
