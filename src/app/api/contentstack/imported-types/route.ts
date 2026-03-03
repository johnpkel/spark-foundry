import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/contentstack/imported-types?spark_id={id}&api_key={key}
// Returns distinct cs_content_type_uid values already imported for this spark + stack
export async function GET(request: NextRequest) {
  const sparkId = request.nextUrl.searchParams.get('spark_id');
  const apiKey = request.nextUrl.searchParams.get('api_key');

  if (!sparkId || !apiKey) {
    return NextResponse.json({ error: 'spark_id and api_key are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .select('metadata')
    .eq('spark_id', sparkId)
    .eq('type', 'contentstack_entry')
    .filter('metadata->>cs_stack_api_key', 'eq', apiKey);

  if (error) {
    console.error('[contentstack/imported-types] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Extract distinct content type UIDs
  const uidSet = new Set<string>();
  for (const row of data || []) {
    const meta = row.metadata as Record<string, unknown>;
    if (meta?.cs_content_type_uid) {
      uidSet.add(meta.cs_content_type_uid as string);
    }
  }

  return NextResponse.json({ imported_uids: Array.from(uidSet) });
}
