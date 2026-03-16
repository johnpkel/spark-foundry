import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/skills/:id
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/skills/:id
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'instructions', 'resources', 'tool_scope', 'is_active']) {
    if (key in body) allowed[key] = body[key];
  }

  if (allowed.name && (typeof allowed.name !== 'string' || !/^[a-z0-9-]+$/.test(allowed.name))) {
    return NextResponse.json(
      { error: 'name must be lowercase letters, numbers, and hyphens only' },
      { status: 400 },
    );
  }

  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('skills')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Skill not found' }, { status: error ? 500 : 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/skills/:id
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const { error } = await supabaseAdmin
    .from('skills')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
