-- Ensure pgvector types are visible without schema qualification
set search_path to public, extensions;

-- ============================================
-- Web Research Items: Global research results linked to Sparks via join table
-- ============================================

create table public.web_research_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  query text not null,
  content text not null,
  summary text,
  sources jsonb not null default '[]'::jsonb,   -- Array of { url, title, snippet? }
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1024),             -- Voyage AI voyage-multimodal-3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Join table: Sparks ↔ Web Research Items (many-to-many)
-- ============================================

create table public.spark_web_research (
  spark_id uuid not null references public.sparks(id) on delete cascade,
  web_research_item_id uuid not null references public.web_research_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (spark_id, web_research_item_id)
);

-- ============================================
-- Indexes
-- ============================================

-- HNSW index for fast vector similarity search
create index idx_web_research_items_embedding
on public.web_research_items
using hnsw (embedding extensions.vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- GIN index for JSONB metadata queries
create index idx_web_research_items_metadata
on public.web_research_items using gin (metadata jsonb_path_ops);

-- Full text search index
create index idx_web_research_items_fts
on public.web_research_items
using gin (to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(query, '') || ' ' ||
  coalesce(content, '') || ' ' ||
  coalesce(summary, '')
));

-- B-tree indexes on join table FKs for faster lookups
create index idx_spark_web_research_spark_id
on public.spark_web_research(spark_id);

create index idx_spark_web_research_item_id
on public.spark_web_research(web_research_item_id);

-- ============================================
-- RPC: Semantic search scoped to a Spark via join table
-- ============================================

create or replace function match_web_research_items(
  p_spark_id uuid,
  query_embedding extensions.vector(1024),
  match_threshold float default 0.25,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  query text,
  content text,
  summary text,
  sources jsonb,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    wri.id,
    wri.title,
    wri.query,
    wri.content,
    wri.summary,
    wri.sources,
    wri.metadata,
    1 - (wri.embedding <=> query_embedding) as similarity
  from public.web_research_items wri
  inner join public.spark_web_research swr on swr.web_research_item_id = wri.id
  where swr.spark_id = p_spark_id
    and wri.embedding is not null
    and 1 - (wri.embedding <=> query_embedding) > match_threshold
  order by wri.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================
-- Trigger: auto-update updated_at (reuses existing function)
-- ============================================

create trigger web_research_items_updated_at
  before update on public.web_research_items
  for each row execute function update_updated_at();
