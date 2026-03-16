import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/skills?spark_id=<uuid> — list skills for a Spark (+ global skills)
export async function GET(request: NextRequest) {
  const sparkId = request.nextUrl.searchParams.get('spark_id');
  if (!sparkId) {
    return NextResponse.json({ error: 'spark_id is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('*')
    .or(`spark_id.eq.${sparkId},spark_id.is.null`)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/skills — create a new skill
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { spark_id, name, description, instructions, resources, tool_scope } = body;

  if (!name || !description || !instructions) {
    return NextResponse.json(
      { error: 'name, description, and instructions are required' },
      { status: 400 },
    );
  }

  // Validate name format
  if (!/^[a-z0-9-]+$/.test(name) || name.length > 64) {
    return NextResponse.json(
      { error: 'name must be lowercase letters, numbers, and hyphens only (max 64 chars)' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('skills')
    .insert({
      spark_id: spark_id || null,
      name,
      description,
      instructions,
      resources: resources || [],
      tool_scope: tool_scope || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
