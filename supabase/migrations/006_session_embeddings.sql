-- ============================================
-- Move embeddings from chat_messages to chat_sessions
-- Store all user messages on the session for embedding
-- ============================================

-- Add user_messages array and embedding to chat_sessions
alter table public.chat_sessions
  add column user_messages text[] not null default '{}';

alter table public.chat_sessions
  add column embedding extensions.vector(1024);

-- HNSW index for vector search on sessions
create index on public.chat_sessions
using hnsw (embedding extensions.vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- ============================================
-- Backfill: Populate user_messages from existing chat_messages
-- ============================================
update public.chat_sessions cs
set user_messages = sub.msgs
from (
  select
    cm.session_id,
    array_agg(cm.content order by cm.created_at) as msgs
  from public.chat_messages cm
  where cm.role = 'user'
    and cm.session_id is not null
  group by cm.session_id
) sub
where cs.id = sub.session_id;

-- ============================================
-- RPC: Append a user message to a session
-- ============================================
create or replace function append_session_user_message(
  p_session_id uuid,
  p_message text
)
returns void
language sql
as $$
  update public.chat_sessions
  set user_messages = array_append(user_messages, p_message)
  where id = p_session_id;
$$;

-- ============================================
-- RPC: Vector search across chat sessions
-- ============================================
create or replace function match_chat_sessions(
  p_spark_id uuid,
  query_embedding extensions.vector(1024),
  match_threshold float default 0.3,
  match_count int default 10
)
returns table (
  id uuid,
  spark_id uuid,
  title text,
  user_messages text[],
  similarity float,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select
    cs.id,
    cs.spark_id,
    cs.title,
    cs.user_messages,
    1 - (cs.embedding <=> query_embedding) as similarity,
    cs.created_at,
    cs.updated_at
  from public.chat_sessions cs
  where cs.spark_id = p_spark_id
    and cs.embedding is not null
    and 1 - (cs.embedding <=> query_embedding) > match_threshold
  order by cs.embedding <=> query_embedding
  limit match_count;
$$;
