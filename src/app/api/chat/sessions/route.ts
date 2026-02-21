import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/chat/sessions?spark_id=<uuid> — List sessions for a spark
export async function GET(request: NextRequest) {
  const sparkId = request.nextUrl.searchParams.get('spark_id');

  if (!sparkId) {
    return NextResponse.json(
      { error: 'spark_id query parameter is required' },
      { status: 400 }
    );
  }

  // Fetch sessions ordered by most recently active
  const { data: sessions, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('*')
    .eq('spark_id', sparkId)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json([]);
  }

  const sessionIds = sessions.map((s) => s.id);

  // Fetch recent messages to compute counts and previews (capped for performance)
  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('id, session_id, content, role, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
    .limit(500);

  // Build counts and previews
  const countMap = new Map<string, number>();
  const previewMap = new Map<string, string>();

  for (const msg of messages || []) {
    const sid = msg.session_id as string;
    countMap.set(sid, (countMap.get(sid) || 0) + 1);
    if (!previewMap.has(sid)) {
      // First message we encounter is the latest (ordered desc)
      const preview = msg.content.length > 100
        ? msg.content.slice(0, 100) + '...'
        : msg.content;
      previewMap.set(sid, preview);
    }
  }

  const enriched = sessions.map((s) => ({
    ...s,
    message_count: countMap.get(s.id) || 0,
    last_message_preview: previewMap.get(s.id) || null,
  }));

  return NextResponse.json(enriched);
}

// POST /api/chat/sessions — Create a new session
export async function POST(request: NextRequest) {
  const { spark_id, title } = await request.json();

  if (!spark_id) {
    return NextResponse.json(
      { error: 'spark_id is required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert({
      spark_id,
      title: title || 'New Chat',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
