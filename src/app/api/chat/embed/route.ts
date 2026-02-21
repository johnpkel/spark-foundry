import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/embeddings';

// POST /api/chat/embed — Embed a chat session from its accumulated user messages
export async function POST(request: NextRequest) {
  const { session_id } = await request.json();

  if (!session_id) {
    return NextResponse.json(
      { error: 'session_id is required' },
      { status: 400 }
    );
  }

  // Fetch the session's user_messages
  const { data: session, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('id, user_messages')
    .eq('id', session_id)
    .single();

  if (error || !session) {
    return NextResponse.json({ embedded: false, error: 'Session not found' });
  }

  const messages = session.user_messages as string[];
  if (!messages || messages.length === 0) {
    return NextResponse.json({ embedded: false });
  }

  // Concatenate all user messages for a single session embedding
  const combined = messages.join('\n\n');
  const embedding = await generateEmbedding(combined);

  if (!embedding) {
    return NextResponse.json({ embedded: false });
  }

  const { error: updateError } = await supabaseAdmin
    .from('chat_sessions')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', session_id);

  if (updateError) {
    return NextResponse.json({ embedded: false, error: updateError.message });
  }

  return NextResponse.json({ embedded: true });
}
