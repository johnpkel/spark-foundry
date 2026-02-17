-- Migration: Switch to multimodal embeddings (voyage-multimodal-3, 1024 dimensions)
-- This enables image items to be embedded alongside text in the same vector space.
--
-- After running this migration, call POST /api/embeddings/generate with { "force": true }
-- to regenerate all embeddings with the new multimodal model.

-- Clear existing embeddings (they're from a different model/dimension)
update public.spark_items set embedding = null;

-- Drop the old HNSW index
drop index if exists spark_items_embedding_idx;

-- Alter the column to the new dimension
alter table public.spark_items
  alter column embedding type vector(1024);

-- Recreate the HNSW index
create index on public.spark_items
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- Recreate the RPC functions with the new dimension

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
