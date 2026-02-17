# Spark Foundry

Collect, organize, and transform information into business artifacts for Contentstack DXP — powered by Claude Opus and Retrieval-Augmented Generation.

Spark Foundry is an open workspace app where users create **Sparks** — collections of links, images, text, files, and notes from various sources. A RAG-powered AI assistant (Claude Opus) semantically searches, analyzes, and reasons over the collected data, and generates business-ready artifacts like Contentstack CMS entries and Campaign Briefs.

## Architecture

```
spark-foundry/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard – list/create Sparks
│   │   ├── spark/[id]/page.tsx         # Spark workspace (Items | Chat | Generate tabs)
│   │   ├── api/
│   │   │   ├── sparks/route.ts         # GET/POST sparks
│   │   │   ├── sparks/[id]/route.ts    # GET/PATCH/DELETE single spark
│   │   │   ├── items/route.ts          # POST items (+ async embedding generation)
│   │   │   ├── items/[id]/route.ts     # PATCH/DELETE items (+ embedding regeneration)
│   │   │   ├── chat/route.ts           # SSE streaming chat with RAG context retrieval
│   │   │   ├── generate/route.ts       # Generate CMS entries & campaign briefs
│   │   │   └── embeddings/generate/route.ts  # Bulk backfill embeddings for existing items
│   ├── components/
│   │   ├── SparkCard.tsx               # Dashboard spark card
│   │   ├── CreateSparkModal.tsx        # New spark dialog
│   │   ├── ItemCard.tsx                # Item display with type icons
│   │   ├── AddItemModal.tsx            # Add link/text/note/image/file
│   │   ├── ChatPanel.tsx               # AI chat with streaming & suggestions
│   │   └── ArtifactGenerator.tsx       # Generate & view business artifacts
│   ├── lib/
│   │   ├── embeddings.ts              # Voyage AI embedding generation (single, batch, query)
│   │   ├── agent/tools.ts             # MCP tools (semantic search, keyword search, list, details)
│   │   ├── agent/agent.ts             # Agent config & sync query runner (Claude Opus)
│   │   ├── supabase/client.ts         # Browser Supabase client
│   │   ├── supabase/server.ts         # Server Component Supabase client
│   │   ├── supabase/admin.ts          # Service-role Supabase client
│   │   └── types.ts                   # Full TypeScript types
├── supabase/migrations/
│   ├── 001_initial.sql                # Complete schema + pgvector + RPC functions
│   └── 002_update_vector_dimension.sql # Migrate vector(1536) → vector(512) if needed
└── .env.local.example                 # Required environment variables
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| AI Agent | Claude Opus via Agent SDK (`@anthropic-ai/claude-agent-sdk`) with MCP tools |
| Embeddings | Voyage AI (`voyage-3-lite`, 512-dim vectors) |
| Database | Supabase (PostgreSQL + pgvector + JSONB) |
| Design System | Contentstack Venus (`@contentstack/venus-components`) design tokens |
| Styling | Tailwind CSS with Venus color palette |
| Icons | Lucide React |

## Features

- **Spark Dashboard** — Create, search, and manage workspace collections
- **Multi-type Items** — Add links, text, notes, images, and file references with tags
- **RAG-Powered Chat** — Every message automatically retrieves semantically relevant items from your Spark before Claude responds, plus Claude can perform on-demand semantic searches via MCP tools
- **Artifact Generation** — One-click generation of Contentstack CMS entries and Campaign Briefs from collected materials
- **Automatic Embeddings** — Items are embedded via Voyage AI on creation/update; a bulk backfill endpoint handles existing items
- **Venus Design System** — Styled with Contentstack's brand tokens (purple `#6c5ce7` primary, consistent spacing/shadows)
- **Hybrid Search** — Combines vector similarity (pgvector HNSW) with full-text PostgreSQL search using Reciprocal Rank Fusion

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)
- A [Voyage AI API key](https://dash.voyageai.com) (free tier available)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (required by the Agent SDK)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in your keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic (for Claude Agent SDK)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Voyage AI (for RAG embeddings)
VOYAGE_API_KEY=your-voyage-api-key

# Contentstack (optional – for publishing CMS entries)
CONTENTSTACK_API_KEY=your-api-key
CONTENTSTACK_MANAGEMENT_TOKEN=your-management-token
CONTENTSTACK_API_HOST=https://api.contentstack.io
```

### 3. Set up the database

Run the migration SQL in the Supabase SQL Editor:

```bash
# Copy the contents of supabase/migrations/001_initial.sql
# and execute it in your Supabase project's SQL Editor
```

This creates:
- `sparks` — Main workspace containers
- `spark_items` — Items with JSONB metadata and vector(512) embeddings
- `chat_messages` — Conversation history
- `generated_artifacts` — Generated CMS entries and campaign briefs
- HNSW vector index, GIN metadata indexes, full-text search index
- `match_spark_items()` and `hybrid_search_spark_items()` RPC functions

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start using Spark Foundry.

### 5. Backfill embeddings (if you have existing items)

```bash
curl -X POST http://localhost:3000/api/embeddings/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

## How It Works

### RAG Pipeline

Spark Foundry uses a dual-layer Retrieval-Augmented Generation system:

**1. Indexing (automatic)**
When a user adds or updates an item, the app asynchronously sends the item's text (title, content, summary, tags) to Voyage AI's `voyage-3-lite` model, which returns a 512-dimensional embedding vector. This vector is stored alongside the item in the `embedding` column of `spark_items`. The API response returns immediately — embedding generation never blocks the user.

**2. Automatic retrieval (every chat message)**
When a user sends a message in the Chat tab, the chat route:
1. Embeds the user's question using Voyage AI with `input_type: 'query'` (asymmetric retrieval)
2. Calls the `match_spark_items` RPC function to find the top 8 most semantically similar items via cosine similarity
3. Injects the retrieved items into Claude's system prompt as grounding context
4. Falls back to listing the 5 most recent items if embeddings are unavailable

**3. Agentic retrieval (on-demand)**
Claude Opus also has access to MCP tools and can call `semantic_search_spark_items` at any time for targeted deep searches. This lets the agent perform follow-up retrieval when the automatic context isn't sufficient.

### Agent SDK + MCP Tools

The chat feature uses Claude's Agent SDK with custom MCP tools that run in-process via `createSdkMcpServer()`. The agent has access to five tools:

| Tool | Description |
|------|-------------|
| `semantic_search_spark_items` | Vector similarity search using Voyage AI embeddings (primary search tool) |
| `search_spark_items` | Keyword search for exact phrase matching |
| `list_spark_items` | List all items in a Spark |
| `get_spark_details` | Get Spark name, description, and metadata |
| `list_generated_artifacts` | List previously generated artifacts |

When a user asks a question, Claude receives pre-retrieved context via RAG, then autonomously decides if it needs to call additional tools for deeper searches.

### Artifact Generation

The `/api/generate` endpoint uses the Agent SDK to:
1. Load all items from the Spark via MCP tools
2. Apply a generation template (CMS Entry or Campaign Brief)
3. Return structured JSON matching the target format
4. Save the artifact to the database for future reference

### Database Design

- **JSONB metadata** on `spark_items` allows flexible per-type fields (URLs for links, image URLs for images, tags, etc.) without rigid schema changes
- **pgvector embeddings** (vector(512)) enable semantic similarity search via the `match_spark_items` RPC function with HNSW indexing for fast approximate nearest neighbor lookup
- **Hybrid search** combines full-text PostgreSQL search with vector similarity using Reciprocal Rank Fusion (RRF) via the `hybrid_search_spark_items` RPC function

### Embedding Model

Spark Foundry uses [Voyage AI](https://voyageai.com)'s `voyage-3-lite` model for embeddings — Anthropic's recommended embedding partner. Key characteristics:
- **512 dimensions** — compact vectors that balance quality and storage
- **Asymmetric retrieval** — documents and queries are embedded differently for better search relevance
- **Batch support** — up to 128 texts per API call for efficient backfilling

## Deployment

The app can be deployed to any platform that supports Next.js:

- **Vercel** — `vercel deploy`
- **Docker** — Standard Next.js Dockerfile
- **Self-hosted** — `npm run build && npm start`

Note: The Agent SDK requires Claude Code CLI on the server. For production deployments, ensure Claude Code is installed in the server environment.
