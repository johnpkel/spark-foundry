import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { STARTER_SKILLS } from '@/lib/agent/starter-skills';

// POST /api/skills/seed — idempotent: inserts only missing starter skills
export async function POST() {
  // Check which starter skills already exist (global skills, spark_id IS NULL)
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('skills')
    .select('name')
    .is('spark_id', null)
    .in('name', STARTER_SKILLS.map(s => s.name));

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingNames = new Set((existing || []).map(s => s.name));
  const toCreate = STARTER_SKILLS.filter(s => !existingNames.has(s.name));

  if (toCreate.length === 0) {
    return NextResponse.json({
      created: [],
      skipped: STARTER_SKILLS.map(s => s.name),
    });
  }

  const rows = toCreate.map(s => ({
    spark_id: null,
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    variables: s.variables,
    tool_scope: s.tool_scope,
    resources: [],
    is_active: true,
  }));

  const { error: insertError } = await supabaseAdmin
    .from('skills')
    .insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    created: toCreate.map(s => s.name),
    skipped: STARTER_SKILLS.filter(s => existingNames.has(s.name)).map(s => s.name),
  });
}
