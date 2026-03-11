import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { analyzeImage } from '@/lib/image-analysis';
import {
  generateImageEmbedding,
  buildItemText,
  getImageUrl,
} from '@/lib/embeddings';

/**
 * POST /api/embeddings/analyze-images
 *
 * Batch re-analysis for existing image items that lack image_analysis metadata.
 * Optionally scoped to a single spark via { spark_id }.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const sparkId = body.spark_id as string | undefined;

  // Query image items missing analysis
  let query = supabaseAdmin
    .from('spark_items')
    .select('id, title, content, summary, type, metadata')
    .in('type', ['image', 'contentstack_asset'])
    .is('metadata->>image_analysis', null);

  if (sparkId) {
    query = query.eq('spark_id', sparkId);
  }

  const { data: items, error } = await query.limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No items need analysis' });
  }

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    const imageUrl = getImageUrl(item);
    if (!imageUrl) continue;

    try {
      const analysis = await analyzeImage(imageUrl);
      if (!analysis) {
        failed++;
        continue;
      }

      const updatedMeta = {
        ...(item.metadata as Record<string, unknown>),
        image_analysis: { ...analysis, analyzed_at: new Date().toISOString() },
      };

      // Update metadata
      await supabaseAdmin
        .from('spark_items')
        .update({ metadata: updatedMeta })
        .eq('id', item.id);

      // Regenerate embedding with enriched text
      const text = buildItemText({ ...item, metadata: updatedMeta });
      const embedding = await generateImageEmbedding(imageUrl, text);
      if (embedding) {
        await supabaseAdmin
          .from('spark_items')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', item.id);
      }

      processed++;
    } catch (err) {
      console.error(`[analyze-images] Failed for item ${item.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    processed,
    failed,
    total_candidates: items.length,
  });
}
