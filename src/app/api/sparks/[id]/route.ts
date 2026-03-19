import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/sparks/[id] - Get a single spark with its items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [sparkResult, itemsResult, artifactsResult] = await Promise.all([
    supabaseAdmin.from('sparks').select('*').eq('id', id).single(),
    supabaseAdmin
      .from('spark_items')
      .select('id, type, title, content, summary, metadata, created_at, updated_at')
      .eq('spark_id', id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('generated_artifacts')
      .select('*')
      .eq('spark_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (sparkResult.error) {
    return NextResponse.json({ error: sparkResult.error.message }, { status: 404 });
  }

  return NextResponse.json({
    spark: sparkResult.data,
    items: itemsResult.data || [],
    artifacts: artifactsResult.data || [],
  });
}

// PATCH /api/sparks/[id] - Update a spark
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Support metadata_merge: merges keys into existing metadata without replacing it.
  // This avoids race conditions where concurrent saves overwrite each other's keys.
  let updatePayload = body;
  if (body.metadata_merge) {
    const { data: current } = await supabaseAdmin
      .from('sparks')
      .select('metadata')
      .eq('id', id)
      .single();
    const existingMetadata = (current?.metadata as Record<string, unknown>) ?? {};
    const { metadata_merge, ...rest } = body;
    updatePayload = {
      ...rest,
      metadata: { ...existingMetadata, ...metadata_merge },
    };
  }

  const { data, error } = await supabaseAdmin
    .from('sparks')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/sparks/[id] - Delete a spark
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('sparks')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
