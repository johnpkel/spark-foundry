import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/embeddings';

// POST /api/chat/embed — Embed chat messages that don't have embeddings yet
export async function POST(request: NextRequest) {
  const { message_ids } = await request.json();

  if (!Array.isArray(message_ids) || message_ids.length === 0) {
    return NextResponse.json(
      { error: 'message_ids array is required' },
      { status: 400 }
    );
  }

  // Fetch messages that still need embedding
  const { data: messages, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content')
    .in('id', message_ids)
    .is('embedding', null);

  if (error || !messages || messages.length === 0) {
    return NextResponse.json({ embedded: 0 });
  }

  let embedded = 0;

  for (const msg of messages) {
    const embedding = await generateEmbedding(msg.content);
    if (embedding) {
      const { error: updateError } = await supabaseAdmin
        .from('chat_messages')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', msg.id);

      if (!updateError) embedded++;
    }
  }

  return NextResponse.json({ embedded });
}
