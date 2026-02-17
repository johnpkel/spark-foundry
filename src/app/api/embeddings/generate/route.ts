import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbeddings, buildItemText, getImageUrl } from '@/lib/embeddings';

/**
 * POST /api/embeddings/generate
 * Backfill embeddings for items that don't have them yet.
 * Handles both text and image items using the multimodal embedding model.
 *
 * Body: { spark_id?: string, force?: boolean }
 * - force: true to regenerate ALL embeddings (needed after model/dimension change)
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const sparkId = body.spark_id;
  const force = body.force === true;

  // Fetch items without embeddings (or all items if force=true)
  let query = supabaseAdmin
    .from('spark_items')
    .select('id, type, title, content, summary, metadata')
    .limit(200);

  if (!force) {
    query = query.is('embedding', null);
  }

  if (sparkId) {
    query = query.eq('spark_id', sparkId);
  }

  const { data: items, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({
      message: force
        ? 'No items found to regenerate'
        : 'All items already have embeddings',
      processed: 0,
    });
  }

  // Build inputs for batch embedding — include image URLs for image items
  const inputs = items.map((item) => {
    const text = buildItemText({
      title: item.title,
      content: item.content,
      summary: item.summary,
      type: item.type,
      metadata: item.metadata as Record<string, unknown>,
    });
    const imageUrl = getImageUrl({
      type: item.type,
      content: item.content,
      metadata: item.metadata as Record<string, unknown>,
    });
    return { text, imageUrl };
  });

  // Generate embeddings in batch (handles both text and image items)
  const embeddings = await generateEmbeddings(inputs);

  // Update each item with its embedding
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) {
      failCount++;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from('spark_items')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', items[i].id);

    if (updateError) {
      console.error(`[embeddings] Failed to update item ${items[i].id}:`, updateError.message);
      failCount++;
    } else {
      successCount++;
    }
  }

  return NextResponse.json({
    message: 'Embedding generation complete',
    total: items.length,
    success: successCount,
    failed: failCount,
    model: 'voyage-multimodal-3',
    dimensions: 1024,
  });
}
