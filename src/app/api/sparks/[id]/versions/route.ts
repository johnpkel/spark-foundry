import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/sparks/[id]/versions — Save a new version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const label: string | null = body.label ?? null;

  // Read current spark to get editor_content and lyticsCache
  const { data: spark, error: sparkError } = await supabaseAdmin
    .from('sparks')
    .select('metadata')
    .eq('id', id)
    .single();

  if (sparkError || !spark) {
    return NextResponse.json({ error: 'Spark not found' }, { status: 404 });
  }

  const metadata = spark.metadata as Record<string, unknown> | null;
  const editorContent = metadata?.editor_content ?? {};
  const lyticsCache = metadata?.lyticsCache ?? null;

  // Determine next version number
  const { data: maxRow } = await supabaseAdmin
    .from('spark_versions')
    .select('version_number')
    .eq('spark_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (maxRow?.version_number ?? 0) + 1;

  // Insert the version
  const { data: version, error: insertError } = await supabaseAdmin
    .from('spark_versions')
    .insert({
      spark_id: id,
      version_number: nextVersion,
      label,
      content: editorContent,
      scores: lyticsCache,
    })
    .select('id, spark_id, version_number, label, scores, created_at')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(version, { status: 201 });
}

// GET /api/sparks/[id]/versions — List all versions (without content)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('spark_versions')
    .select('id, spark_id, version_number, label, scores, created_at')
    .eq('spark_id', id)
    .order('version_number', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
