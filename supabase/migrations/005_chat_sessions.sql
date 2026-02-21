-- ============================================
-- Chat Sessions: Group chat messages into conversations
-- ============================================

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  spark_id uuid not null references public.sparks(id) on delete cascade,
  title text not null default 'New Chat',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for chat_sessions
create index idx_chat_sessions_spark_id_updated on public.chat_sessions(spark_id, updated_at desc);

-- Trigger for updated_at (reuse existing function)
create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function update_updated_at();

-- ============================================
-- Add session_id and embedding to chat_messages
-- ============================================

alter table public.chat_messages
  add column session_id uuid references public.chat_sessions(id) on delete cascade;

alter table public.chat_messages
  add column embedding vector(1024);

-- Indexes for new columns
create index idx_chat_messages_session_id on public.chat_messages(session_id);

create index on public.chat_messages
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- ============================================
-- Backfill: Create one "Previous Chat" session per spark
-- for any orphaned messages (those without a session_id)
-- ============================================

do $$
declare
  r record;
  new_session_id uuid;
begin
  for r in
    select distinct spark_id
    from public.chat_messages
    where session_id is null
  loop
    insert into public.chat_sessions (spark_id, title)
    values (r.spark_id, 'Previous Chat')
    returning id into new_session_id;

    update public.chat_messages
    set session_id = new_session_id
    where spark_id = r.spark_id
      and session_id is null;
  end loop;
end;
$$;

-- ============================================
-- RPC: Vector search across chat messages
-- ============================================

create or replace function match_chat_messages(
  p_spark_id uuid,
  query_embedding vector(1024),
  match_threshold float default 0.3,
  match_count int default 10,
  p_session_id uuid default null
)
returns table (
  id uuid,
  session_id uuid,
  role text,
  content text,
  similarity float,
  created_at timestamptz
)
language sql stable
as $$
  select
    cm.id,
    cm.session_id,
    cm.role,
    cm.content,
    1 - (cm.embedding <=> query_embedding) as similarity,
    cm.created_at
  from public.chat_messages cm
  where cm.spark_id = p_spark_id
    and cm.embedding is not null
    and 1 - (cm.embedding <=> query_embedding) > match_threshold
    and (p_session_id is null or cm.session_id = p_session_id)
  order by cm.embedding <=> query_embedding
  limit match_count;
$$;
