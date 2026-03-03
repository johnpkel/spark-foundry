import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/contentstack/prune-entries
// Deletes contentstack_entry items for given CT UIDs + spark + stack
export async function POST(request: NextRequest) {
  const { spark_id, stack_api_key, content_type_uids_to_remove } = await request.json();

  if (!spark_id || !stack_api_key || !Array.isArray(content_type_uids_to_remove)) {
    return NextResponse.json(
      { error: 'spark_id, stack_api_key, and content_type_uids_to_remove are required' },
      { status: 400 }
    );
  }

  if (content_type_uids_to_remove.length === 0) {
    return NextResponse.json({ pruned: 0 });
  }

  let totalPruned = 0;

  for (const ctUid of content_type_uids_to_remove) {
    const { data, error } = await supabaseAdmin
      .from('spark_items')
      .delete()
      .eq('spark_id', spark_id)
      .eq('type', 'contentstack_entry')
      .filter('metadata->>cs_stack_api_key', 'eq', stack_api_key)
      .filter('metadata->>cs_content_type_uid', 'eq', ctUid)
      .select('id');

    if (error) {
      console.error(`[contentstack/prune-entries] Error pruning CT ${ctUid}:`, error.message);
    } else {
      totalPruned += data?.length || 0;
    }
  }

  return NextResponse.json({ pruned: totalPruned });
}
