-- Enable pgvector extension for vector similarity search
create extension if not exists vector with schema extensions;

-- ============================================
-- Sparks: The main workspace containers
-- ============================================
create table public.sparks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Spark Items: Individual pieces of content
-- Types: link, image, text, file, note
-- ============================================
create table public.spark_items (
  id uuid primary key default gen_random_uuid(),
  spark_id uuid not null references public.sparks(id) on delete cascade,
  type text not null check (type in ('link', 'image', 'text', 'file', 'note')),
  title text not null,
  content text, -- main text content or URL
  summary text, -- AI-generated summary for LLM context
  metadata jsonb not null default '{}'::jsonb,
  -- metadata can contain: { url, image_url, file_url, file_type, source, tags, ... }
  embedding vector(1024), -- for semantic search (Voyage AI voyage-3-lite)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Chat Messages: Conversation history per Spark
-- ============================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  spark_id uuid not null references public.sparks(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- Generated Artifacts: Business documents generated from Sparks
-- ============================================
create table public.generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  spark_id uuid not null references public.sparks(id) on delete cascade,
  type text not null check (type in ('cms_entry', 'campaign_brief', 'custom')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  -- For cms_entry: { content_type, fields: { title, body, seo, ... } }
  -- For campaign_brief: { objective, audience, channels, messaging, ... }
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Indexes
-- ============================================

-- HNSW index for fast vector similarity search
create index on public.spark_items
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- GIN index for JSONB metadata queries
create index idx_spark_items_metadata on public.spark_items using gin (metadata jsonb_path_ops);
create index idx_sparks_metadata on public.sparks using gin (metadata jsonb_path_ops);

-- Foreign key indexes for faster joins
create index idx_spark_items_spark_id on public.spark_items(spark_id);
create index idx_chat_messages_spark_id on public.chat_messages(spark_id);
create index idx_generated_artifacts_spark_id on public.generated_artifacts(spark_id);

-- Full text search index on spark items content
create index idx_spark_items_content_fts on public.spark_items
using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(summary, '')));

-- ============================================
-- RPC Functions for Vector Similarity Search
-- ============================================

-- Basic semantic search within a Spark
create or replace function match_spark_items(
  p_spark_id uuid,
  query_embedding vector(1024),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id uuid,
  spark_id uuid,
  type text,
  title text,
  content text,
  summary text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    si.id,
    si.spark_id,
    si.type,
    si.title,
    si.content,
    si.summary,
    si.metadata,
    1 - (si.embedding <=> query_embedding) as similarity
  from public.spark_items si
  where si.spark_id = p_spark_id
    and si.embedding is not null
    and 1 - (si.embedding <=> query_embedding) > match_threshold
  order by si.embedding <=> query_embedding
  limit match_count;
$$;

-- Hybrid search: keyword + semantic within a Spark
create or replace function hybrid_search_spark_items(
  p_spark_id uuid,
  query_text text,
  query_embedding vector(1024),
  match_count int default 10,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (
  id uuid,
  type text,
  title text,
  content text,
  summary text,
  metadata jsonb,
  score float
)
language sql stable
as $$
with full_text as (
  select
    si.id,
    row_number() over (
      order by ts_rank_cd(
        to_tsvector('english', coalesce(si.title, '') || ' ' || coalesce(si.content, '') || ' ' || coalesce(si.summary, '')),
        websearch_to_tsquery(query_text)
      ) desc
    ) as rank_ix
  from public.spark_items si
  where si.spark_id = p_spark_id
    and to_tsvector('english', coalesce(si.title, '') || ' ' || coalesce(si.content, '') || ' ' || coalesce(si.summary, ''))
    @@ websearch_to_tsquery(query_text)
  limit least(match_count, 30) * 2
),
semantic as (
  select
    si.id,
    row_number() over (order by si.embedding <=> query_embedding) as rank_ix
  from public.spark_items si
  where si.spark_id = p_spark_id
    and si.embedding is not null
  order by si.embedding <=> query_embedding
  limit least(match_count, 30) * 2
)
select
  si.id,
  si.type,
  si.title,
  si.content,
  si.summary,
  si.metadata,
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight as score
from full_text
full outer join semantic on full_text.id = semantic.id
join public.spark_items si on coalesce(full_text.id, semantic.id) = si.id
order by score desc
limit match_count;
$$;

-- ============================================
-- Updated_at trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sparks_updated_at
  before update on public.sparks
  for each row execute function update_updated_at();

create trigger spark_items_updated_at
  before update on public.spark_items
  for each row execute function update_updated_at();

create trigger generated_artifacts_updated_at
  before update on public.generated_artifacts
  for each row execute function update_updated_at();
