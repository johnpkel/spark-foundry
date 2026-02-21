import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/chat/sessions/[id] — Get session with all messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [sessionResult, messagesResult] = await Promise.all([
    supabaseAdmin.from('chat_sessions').select('*').eq('id', id).single(),
    supabaseAdmin
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (sessionResult.error) {
    return NextResponse.json(
      { error: sessionResult.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    session: sessionResult.data,
    messages: messagesResult.data || [],
  });
}

// PATCH /api/chat/sessions/[id] — Update session title
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = await request.json();

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json(
      { error: 'title must be a non-empty string' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .update({ title })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/chat/sessions/[id] — Delete session (messages cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('chat_sessions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
