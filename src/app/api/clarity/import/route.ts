import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbeddings, buildItemText } from '@/lib/embeddings';
import {
  fetchClarityInsights,
  formatMetricAsText,
  IMPORT_CALLS,
  type ClarityMetricData,
} from '@/lib/clarity/api';

const INSERT_BATCH_SIZE = 25;
const EMBED_BATCH_SIZE = 50;

// POST /api/clarity/import — SSE bulk Clarity insight import
export async function POST(request: NextRequest) {
  const { spark_id, num_days } = await request.json();

  if (!spark_id) {
    return new Response(
      JSON.stringify({ error: 'spark_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!process.env.CLARITY_API_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'CLARITY_API_TOKEN is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const numDays = Math.min(Math.max(num_days || 3, 1), 3);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let totalImported = 0;

      try {
        // Delete existing clarity items for this spark (idempotent re-import)
        await supabaseAdmin
          .from('spark_items')
          .delete()
          .eq('spark_id', spark_id)
          .eq('type', 'clarity_insight');

        // Make strategic API calls with different dimension combinations
        for (let callIdx = 0; callIdx < IMPORT_CALLS.length; callIdx++) {
          const { label, dimensions } = IMPORT_CALLS[callIdx];

          send({
            type: 'progress',
            phase: 'fetching',
            call: callIdx + 1,
            total_calls: IMPORT_CALLS.length,
            label,
          });

          let metrics: ClarityMetricData[];
          try {
            metrics = await fetchClarityInsights(
              numDays,
              dimensions.length > 0 ? dimensions : undefined
            );
          } catch (err) {
            send({
              type: 'error',
              message: `Failed to fetch ${label}: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
            continue;
          }

          // Filter out metrics with no data
          const validMetrics = metrics.filter(
            (m) => m.information && m.information.length > 0
          );

          send({
            type: 'progress',
            phase: 'importing',
            call: callIdx + 1,
            total_calls: IMPORT_CALLS.length,
            metrics_count: validMetrics.length,
            label,
          });

          // Convert each metric into a spark item
          const rows = validMetrics.map((metric) => {
            const content = formatMetricAsText(metric, dimensions);
            const dimSuffix = dimensions.length > 0 ? ` (${label})` : ' (Overall)';
            return {
              spark_id,
              type: 'clarity_insight' as const,
              title: `${metric.metricName}${dimSuffix}`,
              content,
              summary: content.length > 300 ? content.slice(0, 297) + '...' : content,
              metadata: {
                clarity_metric_name: metric.metricName,
                clarity_dimensions: dimensions.join(', ') || 'none',
                clarity_num_days: numDays,
                clarity_imported_at: new Date().toISOString(),
              },
            };
          });

          // Batch insert
          for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
            const batch = rows.slice(i, i + INSERT_BATCH_SIZE);

            const { data: inserted, error } = await supabaseAdmin
              .from('spark_items')
              .insert(batch)
              .select('id, title, content, summary, type, metadata');

            if (error) {
              console.error(`[clarity-import] Insert batch error:`, error.message);
            } else {
              totalImported += inserted.length;

              // Fire-and-forget embedding generation
              generateEmbeddingsForItems(inserted).catch((err) =>
                console.error('[clarity-import] Embedding error:', err)
              );
            }
          }

          send({
            type: 'call_done',
            dimensions: dimensions.join(', ') || 'none',
            label,
            metrics_count: validMetrics.length,
          });
        }

        send({ type: 'done', total_imported: totalImported });
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/** Generate embeddings for inserted items in batches */
async function generateEmbeddingsForItems(
  items: Array<{
    id: string;
    title: string;
    content: string | null;
    summary: string | null;
    type: string;
    metadata: Record<string, unknown>;
  }>
): Promise<void> {
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((item) => ({
      text: buildItemText(item),
    }));

    const embeddings = await generateEmbeddings(texts);

    const updates = batch
      .map((item, idx) => ({
        id: item.id,
        embedding: embeddings[idx],
      }))
      .filter((u) => u.embedding !== null);

    for (const update of updates) {
      await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(update.embedding) })
        .eq('id', update.id);
    }
  }
}
