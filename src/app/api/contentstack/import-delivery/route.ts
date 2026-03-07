import { NextRequest } from 'next/server';
import { extractTextFromEntry, type CSFieldSchema } from '@/lib/contentstack/api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbeddings, buildItemText } from '@/lib/embeddings';
import { addLogEntry } from '@/lib/activity-logger';

export const dynamic = 'force-dynamic';

const CDN_BASE = 'https://cdn.contentstack.io/v3';
const INSERT_BATCH_SIZE = 25;
const EMBED_BATCH_SIZE = 50;

function getCredentials() {
  const apiKey = process.env.CONTENTSTACK_API_KEY;
  const deliveryToken = process.env.CONTENTSTACK_DELIVERY_TOKEN;
  if (!apiKey || !deliveryToken) return null;
  return { apiKey, deliveryToken };
}

async function cdnGet<T>(path: string, apiKey: string, deliveryToken: string): Promise<T> {
  const url = `${CDN_BASE}${path}`;
  const start = Date.now();
  const correlationId = `cs_cdn_${Date.now()}`;

  addLogEntry({
    service: 'contentstack',
    direction: 'request',
    level: 'info',
    method: 'GET',
    url,
    summary: `CDN ${path}`,
    correlationId,
  });

  const res = await fetch(url, {
    headers: {
      api_key: apiKey,
      access_token: deliveryToken,
      'Content-Type': 'application/json',
    },
  });

  const duration = Date.now() - start;

  if (!res.ok) {
    const text = await res.text();
    addLogEntry({
      service: 'contentstack',
      direction: 'response',
      level: 'error',
      method: 'GET',
      url,
      summary: `CDN ${path} — ${res.status}`,
      statusCode: res.status,
      duration,
      error: text,
      correlationId,
    });
    throw new Error(`CDN API ${path} failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as T;
  addLogEntry({
    service: 'contentstack',
    direction: 'response',
    level: 'info',
    method: 'GET',
    url,
    summary: `CDN ${path} — 200`,
    statusCode: 200,
    duration,
    correlationId,
  });

  return data;
}

// POST /api/contentstack/import-delivery — SSE bulk entry import via Delivery API
export async function POST(request: NextRequest) {
  const { spark_id, content_type_uids } = await request.json();

  if (!spark_id || !Array.isArray(content_type_uids) || content_type_uids.length === 0) {
    return new Response(
      JSON.stringify({ error: 'spark_id and content_type_uids are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const creds = getCredentials();
  if (!creds) {
    return new Response(
      JSON.stringify({ error: 'CONTENTSTACK_API_KEY and CONTENTSTACK_DELIVERY_TOKEN must be set in env' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { apiKey, deliveryToken } = creds;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let totalImported = 0;
      let totalFailed = 0;

      try {
        for (const ctUid of content_type_uids) {
          let ctTitle = ctUid;

          try {
            // 1. Fetch content type schema
            const schemaData = await cdnGet<{
              content_type: { title: string; schema: CSFieldSchema[] };
            }>(`/content_types/${ctUid}`, apiKey, deliveryToken);
            const schema = schemaData.content_type;
            ctTitle = schema.title || ctUid;

            // 2. Paginate all entries
            const allEntries: Record<string, unknown>[] = [];
            let skip = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const result = await cdnGet<{ entries: Record<string, unknown>[]; count: number }>(
                `/content_types/${ctUid}/entries?include_count=true&limit=100&skip=${skip}`,
                apiKey,
                deliveryToken
              );
              allEntries.push(...(result.entries || []));
              send({
                type: 'progress',
                content_type: ctTitle,
                total: result.count,
                fetched: allEntries.length,
                phase: 'fetching',
              });
              if (allEntries.length >= result.count || (result.entries || []).length < 100) break;
              skip += 100;
            }

            // 3. Delete existing items for this CT + spark (idempotent re-import)
            await supabaseAdmin
              .from('spark_items')
              .delete()
              .eq('spark_id', spark_id)
              .eq('type', 'contentstack_entry')
              .filter('metadata->>cs_stack_api_key', 'eq', apiKey)
              .filter('metadata->>cs_content_type_uid', 'eq', ctUid);

            // 4. Batch insert items
            let importedForCt = 0;
            for (let i = 0; i < allEntries.length; i += INSERT_BATCH_SIZE) {
              const batch = allEntries.slice(i, i + INSERT_BATCH_SIZE);
              const rows = batch.map((entry) => {
                const text = extractTextFromEntry(
                  entry as Record<string, unknown>,
                  schema.schema
                );
                const entryTitle = (entry.title as string) || (entry.uid as string);
                return {
                  spark_id,
                  type: 'contentstack_entry',
                  title: entryTitle,
                  content: text || null,
                  summary: text ? text.slice(0, 300) : null,
                  metadata: {
                    cs_stack_api_key: apiKey,
                    cs_content_type_uid: ctUid,
                    cs_content_type_title: ctTitle,
                    cs_entry_uid: entry.uid,
                    cs_entry_locale: entry.locale || null,
                    cs_entry_url: entry.url || null,
                  },
                };
              });

              const { data: inserted, error } = await supabaseAdmin
                .from('spark_items')
                .insert(rows)
                .select('id, title, content, summary, type, metadata');

              if (error) {
                console.error(
                  `[import-delivery] Insert batch error for CT ${ctUid}:`,
                  error.message
                );
                totalFailed += batch.length;
              } else {
                importedForCt += inserted.length;
                totalImported += inserted.length;

                // 5. Fire-and-forget embedding generation
                generateEmbeddingsForItems(inserted).catch((err) =>
                  console.error('[import-delivery] Embedding error:', err)
                );
              }

              send({
                type: 'progress',
                content_type: ctTitle,
                total: allEntries.length,
                imported: importedForCt,
                phase: 'importing',
              });
            }

            send({
              type: 'content_type_done',
              content_type: ctTitle,
              count: importedForCt,
            });
          } catch (err) {
            console.error(`[import-delivery] Error processing CT ${ctUid}:`, err);
            totalFailed++;
            send({
              type: 'error',
              message: `Failed to import ${ctTitle}: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }

        send({ type: 'done', total_imported: totalImported, total_failed: totalFailed });
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
