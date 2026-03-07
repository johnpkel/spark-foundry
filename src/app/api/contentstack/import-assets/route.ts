import { NextRequest } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { listAssets } from '@/lib/contentstack/api';
import type { CSAsset } from '@/lib/contentstack/api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  generateEmbedding,
  generateImageEmbedding,
  buildItemText,
} from '@/lib/embeddings';
import { analyzeImage } from '@/lib/image-analysis';

export const dynamic = 'force-dynamic';

// POST /api/contentstack/import-assets — SSE asset import
export async function POST(request: NextRequest) {
  const { spark_id, stack_api_key, stack_name, asset_uids, folder_uid } =
    await request.json();

  if (!spark_id || !stack_api_key) {
    return new Response(
      JSON.stringify({ error: 'spark_id and stack_api_key are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!Array.isArray(asset_uids) && !folder_uid) {
    return new Response(
      JSON.stringify({ error: 'asset_uids or folder_uid is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = await getSession();
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let totalImported = 0;
      let totalFailed = 0;

      try {
        // If folder_uid is provided, fetch all assets in that folder
        let assetsToImport: CSAsset[] = [];

        if (folder_uid) {
          let skip = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const result = await listAssets(
              session.access_token,
              stack_api_key,
              { skip, folder: folder_uid }
            );
            assetsToImport.push(...result.assets);
            if (
              assetsToImport.length >= result.count ||
              result.assets.length < 100
            )
              break;
            skip += 100;
          }
        } else if (asset_uids && asset_uids.length > 0) {
          // Fetch all assets and filter by UIDs
          // (CS API doesn't support fetching by multiple UIDs in one call)
          let skip = 0;
          const uidSet = new Set(asset_uids as string[]);
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const result = await listAssets(
              session.access_token,
              stack_api_key,
              { skip }
            );
            for (const asset of result.assets) {
              if (uidSet.has(asset.uid)) {
                assetsToImport.push(asset);
              }
            }
            if (
              assetsToImport.length >= uidSet.size ||
              result.assets.length < 100
            )
              break;
            skip += 100;
          }
        }

        const total = assetsToImport.length;
        send({ type: 'progress', total, imported: 0, phase: 'importing' });

        for (let i = 0; i < assetsToImport.length; i++) {
          const asset = assetsToImport[i];
          try {
            // Check if already imported (by asset UID + spark)
            const { data: existing } = await supabaseAdmin
              .from('spark_items')
              .select('id')
              .eq('spark_id', spark_id)
              .eq('type', 'contentstack_asset')
              .filter('metadata->>cs_asset_uid', 'eq', asset.uid)
              .limit(1);

            if (existing && existing.length > 0) {
              // Already imported — skip
              totalImported++;
              send({ type: 'progress', total, imported: totalImported, phase: 'importing' });
              continue;
            }

            const isImage = asset.content_type?.startsWith('image/');

            const { data: inserted, error } = await supabaseAdmin
              .from('spark_items')
              .insert({
                spark_id,
                type: 'contentstack_asset',
                title: asset.title || asset.filename,
                content: asset.description || null,
                summary: `${asset.filename} (${formatBytes(asset.file_size)})`,
                metadata: {
                  cs_stack_api_key: stack_api_key,
                  cs_stack_name: stack_name || null,
                  cs_asset_uid: asset.uid,
                  cs_asset_url: asset.url,
                  cs_asset_content_type: asset.content_type,
                  cs_asset_file_size: asset.file_size,
                  cs_asset_filename: asset.filename,
                  ...(isImage ? { image_url: asset.url } : {}),
                },
              })
              .select('id, title, content, summary, type, metadata')
              .single();

            if (error) {
              console.error(`[import-assets] Insert error for ${asset.uid}:`, error.message);
              totalFailed++;
            } else {
              totalImported++;

              // Fire-and-forget embedding (with image analysis for images)
              if (isImage && asset.url) {
                (async () => {
                  try {
                    // Run Claude Vision analysis first
                    const analysis = await analyzeImage(asset.url);
                    let enrichedItem = inserted;
                    if (analysis) {
                      const updatedMeta = {
                        ...inserted.metadata,
                        image_analysis: { ...analysis, analyzed_at: new Date().toISOString() },
                      };
                      await supabaseAdmin
                        .from('spark_items')
                        .update({ metadata: updatedMeta })
                        .eq('id', inserted.id);
                      enrichedItem = { ...inserted, metadata: updatedMeta };
                    }

                    const text = buildItemText(enrichedItem);
                    const embedding = await generateImageEmbedding(asset.url, text);
                    if (embedding) {
                      await supabaseAdmin
                        .from('spark_items')
                        .update({ embedding: JSON.stringify(embedding) })
                        .eq('id', inserted.id);
                    }
                  } catch (err) {
                    console.error('[import-assets] Image analysis/embedding error:', err);
                  }
                })();
              } else {
                const text = buildItemText(inserted);
                generateEmbedding(text)
                  .then(async (embedding) => {
                    if (embedding) {
                      await supabaseAdmin
                        .from('spark_items')
                        .update({ embedding: JSON.stringify(embedding) })
                        .eq('id', inserted.id);
                    }
                  })
                  .catch((err) =>
                    console.error('[import-assets] Embedding error:', err)
                  );
              }
            }

            send({ type: 'progress', total, imported: totalImported, phase: 'importing' });
          } catch (err) {
            console.error(`[import-assets] Error for asset ${asset.uid}:`, err);
            totalFailed++;
          }
        }

        send({
          type: 'done',
          total_imported: totalImported,
          total_failed: totalFailed,
        });
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
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
