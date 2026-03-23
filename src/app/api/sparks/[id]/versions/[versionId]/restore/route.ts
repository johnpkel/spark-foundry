import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/sparks/[id]/versions/[versionId]/restore — Restore version content
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  // Read the version content
  const { data: version, error: versionError } = await supabaseAdmin
    .from('spark_versions')
    .select('content, version_number, label')
    .eq('id', versionId)
    .eq('spark_id', id)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Merge into spark metadata (same pattern as PATCH /api/sparks/[id])
  const { data: spark } = await supabaseAdmin
    .from('sparks')
    .select('metadata')
    .eq('id', id)
    .single();

  const existingMetadata = (spark?.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = { ...existingMetadata, editor_content: version.content };

  const { error: updateError } = await supabaseAdmin
    .from('sparks')
    .update({ metadata: updatedMetadata })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    content: version.content,
    version_number: version.version_number,
    label: version.label,
  });
}
