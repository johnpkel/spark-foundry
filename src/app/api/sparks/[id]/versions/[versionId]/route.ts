import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/sparks/[id]/versions/[versionId] — Update label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  const body = await request.json().catch(() => ({}));

  if ('label' in body) {
    const { data, error } = await supabaseAdmin
      .from('spark_versions')
      .update({ label: body.label })
      .eq('id', versionId)
      .eq('spark_id', id)
      .select('id, spark_id, version_number, label, scores, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
}

// DELETE /api/sparks/[id]/versions/[versionId] — Delete version
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  const { error } = await supabaseAdmin
    .from('spark_versions')
    .delete()
    .eq('id', versionId)
    .eq('spark_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
