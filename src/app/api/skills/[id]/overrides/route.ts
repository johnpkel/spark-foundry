import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/skills/:id/overrides?spark_id=<uuid>
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const sparkId = request.nextUrl.searchParams.get('spark_id');
  if (!sparkId) {
    return NextResponse.json({ error: 'spark_id is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('skill_variable_overrides')
    .select('overrides')
    .eq('skill_id', id)
    .eq('spark_id', sparkId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ overrides: data?.overrides || {} });
}

// PUT /api/skills/:id/overrides — upsert per-Spark variable overrides
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const { spark_id, overrides } = await request.json();

  if (!spark_id || typeof overrides !== 'object') {
    return NextResponse.json(
      { error: 'spark_id and overrides object are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('skill_variable_overrides')
    .upsert(
      {
        skill_id: id,
        spark_id: spark_id,
        overrides,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'skill_id,spark_id' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
