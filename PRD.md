# Spark Foundry — Product Requirements Document

> **Last updated:** 2026-03-10
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
| Generate | Artifact creation (CMS Entry, Campaign Brief, Custom) |

**Center View (switchable):**
- **Editor** — Tiptap rich text editor with real-time collaboration, comments, drawing, group blocks
- **Canvas** — React Flow node graph with swimlane layout, draggable groups, floating chat

**Right Drawer Tabs:**
- **Discussions** — Comment threads on selected editor text
- **Scoring** — Content quality analysis (topics, audiences, readability, SEO, channel fit)

**Header:**
- Spark name, integration status menu, theme toggle, activity log button, presence avatars

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

| Tool | Description |
|---|---|
| `semantic_search` | Vector similarity search across spark items (primary retrieval) |
| `keyword_search` | SQL ilike fallback for exact matches |
| `list_items` | Return all items in the spark |
| `get_spark_details` | Spark metadata and settings |
| `scrape_url` | Deep-read a specific URL for detailed content |
| `web_search` | Internet search via Anthropic hosted tool (max 10/session) |
| `save_web_research` | Persist web research as a new spark item with embedding |

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

## 7. Integrations

### 7.1 Contentstack (CMS)

- **Auth:** OAuth 2.0 (Management API tokens stored in Supabase)
- **Capabilities:**
  - Browse stacks, content types, entries, assets
  - Bulk import entries with recursive text extraction from nested schema fields
  - Bulk import assets with metadata
  - Prune previously imported entries
  - Upload generated assets back to Contentstack
- **Import method:** SSE streaming with real-time progress

### 7.2 Google Drive

- **Auth:** OAuth 2.0 with refresh token
- **Capabilities:**
  - Two-pass search (title match → full-text backfill)
  - Export Docs/Sheets as text (100KB cap for binary)
  - Create items from search results

### 7.3 Slack

- **Auth:** Bot token (Events API)
- **Capabilities:**
  - Respond to @mentions in threads
  - Fetch full thread messages with user resolution
  - Save threads as spark items with embeddings
  - "Save to Spark" via message context menu
- **Architecture:** Webhook → async worker pattern for heavy processing

### 7.4 Microsoft Clarity (Analytics)

- **Auth:** API token
- **Capabilities:**
  - Import metrics across strategic dimension combinations
  - Format analytics data as embeddable text items
  - Idempotent re-import (deletes old items first)
- **Rate limits:** 10 requests/day, 1-3 day windows

### 7.5 Web Search

- **Auth:** Built-in Anthropic tool (no separate auth)
- **Capability:** Internet search during chat (max 10 uses per session)

### 7.6 Integration Status

All integrations expose a unified status endpoint (`GET /api/integrations/status`) returning `connected`, `active`, or `not_configured` per service.

---

## 8. Collaborative Editing

### 8.1 Rich Text Editor (Tiptap)

**Formatting:**
Bold, italic, strikethrough, code, headings (1-3), bullet/ordered lists, blockquotes, tables, task lists, horizontal rules

**Custom Extensions:**
- **Group Block** — Select and organize items into labeled groups
- **Drawing** — Freehand sketching canvas
- **Slash Commands** — Quick insertion (/, typing triggers menu)
- **Mentions** — @ user mentions

### 8.2 Real-Time Collaboration

- **Protocol:** Yjs CRDT via TipTap Pro cloud provider
- **Presence:** Live cursor positions with user colors
- **Awareness:** Active user avatars in header
- **Auth:** JWT tokens generated per session (`/api/collab-token`)
- **Persistence:** Auto-save to Spark metadata every 2 seconds (debounced)

### 8.3 Comment Threading

- Inline comment anchors (custom Tiptap marks)
- Popover UI for creating/replying to comments
- Discussions panel with resolve/filter capabilities

---

## 9. Canvas Visualization

### 9.1 React Flow Canvas

- **Nodes:** Item cards colored by type, draggable
- **Groups:** Selection bounding boxes with custom colors and dedicated chat sessions
- **Layout:** Swimlane algorithm (items grouped by type into vertical columns)
- **Toolbar:** Floating bar for Add Item, Create Group, Reset Layout
- **Navigation:** Mini-map, zoom controls, background grid

### 9.2 3D Vector Space (Three.js)

- Scatter plot of items in reduced vector space
- Fly-in animation on load
- Similarity edges between related items
- Hover tooltips with item previews
- Type-based color coding

---

## 10. Content Scoring & Analysis

- **Endpoint:** `POST /api/scoring/analyze`
- **Engine:** Claude Vision with tool use
- **Metrics:**
  - Overall quality score (0-100)
  - Topic extraction
  - Audience identification
  - Quality dimensions: readability, clarity, engagement, SEO
  - Channel fit assessment
- **UI:** Score Panel in right drawer with visual indicators

---

## 11. Activity Log System

### Server-Side

- **Singleton:** `addLogEntry()` with 500-entry circular buffer
- **Broadcasting:** EventEmitter → SSE to all connected clients
- **Instrumentation:** `traceFetch()` wrapper auto-logs all external API calls
- **Services tracked:** Anthropic, Voyage AI, Supabase, Contentstack, Google, Slack, Clarity, Internal

### Client-Side

- **Provider:** React Context with SSE subscription
- **Panel:** 480px right drawer with:
  - Service filter chips (color-coded)
  - Errors-only toggle
  - Text search
  - Sort by time
  - Expandable entry rows with request/response details

---

## 12. Technical Architecture

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

## 13. Theming

- **Mechanism:** CSS custom properties via Tailwind
- **Toggle:** Dark/light/system via localStorage (`spark-theme`)
- **Activation:** `.dark` class on `<html>` element
- **Palette:** Venus design system (`--venus-purple`, `--venus-gray-*`, `bg-surface`, etc.)

---

## 14. Deployment

- **Platform:** Contentstack Launch (Nginx reverse proxy)
- **SSE compatibility:** Headers configured for Nginx buffering bypass
- **Environment variables:** API keys for Anthropic, Voyage AI, Supabase, Contentstack, Google, Slack, Clarity
