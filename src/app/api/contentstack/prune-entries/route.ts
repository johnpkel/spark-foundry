import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { removeItemsFromCanvas } from '@/lib/canvas-cleanup';

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
  const allDeletedIds: string[] = [];

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
      const ids = data?.map((d) => d.id) || [];
      allDeletedIds.push(...ids);
      totalPruned += ids.length;
    }
  }

  // Clean stale references from canvas metadata
  if (allDeletedIds.length > 0) {
    removeItemsFromCanvas(spark_id, allDeletedIds).catch((err) =>
      console.error('[contentstack/prune-entries] Canvas cleanup failed:', err)
    );
  }

  return NextResponse.json({ pruned: totalPruned });
}
