import { supabaseAdmin } from '@/lib/supabase/admin';
import type { CanvasState } from '@/lib/types';

/**
 * Remove deleted item references from a spark's canvas metadata.
 * Filters nodePositions and group itemIds, removing groups that become empty.
 */
export async function removeItemsFromCanvas(
  sparkId: string,
  deletedItemIds: string[]
): Promise<void> {
  if (deletedItemIds.length === 0) return;

  const { data, error } = await supabaseAdmin
    .from('sparks')
    .select('metadata')
    .eq('id', sparkId)
    .single();

  if (error || !data?.metadata) return;

  const metadata = data.metadata as Record<string, unknown>;
  const canvas = metadata.canvas as CanvasState | undefined;
  if (!canvas) return;

  const deleted = new Set(deletedItemIds);

  const newPositions = canvas.nodePositions.filter(
    (p) => !deleted.has(p.itemId)
  );
  const newGroups = canvas.groups
    .map((g) => ({ ...g, itemIds: g.itemIds.filter((id) => !deleted.has(id)) }))
    .filter((g) => g.itemIds.length > 0);

  // Skip write if nothing changed
  if (
    newPositions.length === canvas.nodePositions.length &&
    newGroups.length === canvas.groups.length
  ) {
    return;
  }

  await supabaseAdmin
    .from('sparks')
    .update({
      metadata: { ...metadata, canvas: { ...canvas, nodePositions: newPositions, groups: newGroups } },
    })
    .eq('id', sparkId);
}
