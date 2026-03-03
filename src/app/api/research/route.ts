import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/research?spark_id=<uuid> — List research items linked to a Spark
export async function GET(request: NextRequest) {
  const sparkId = request.nextUrl.searchParams.get('spark_id');

  if (!sparkId) {
    return NextResponse.json({ error: 'spark_id query parameter is required' }, { status: 400 });
  }

  // Get research item IDs linked to this Spark
  const { data: joinRows, error: joinError } = await supabaseAdmin
    .from('spark_web_research')
    .select('web_research_item_id')
    .eq('spark_id', sparkId);

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 });
  }

  if (!joinRows || joinRows.length === 0) {
    return NextResponse.json([]);
  }

  const ids = joinRows.map((r) => r.web_research_item_id);

  const { data, error } = await supabaseAdmin
    .from('web_research_items')
    .select('id, title, query, content, summary, sources, metadata, created_at, updated_at')
    .in('id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
