import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  generateEmbedding,
  generateImageEmbedding,
  buildItemText,
  getImageUrl,
} from '@/lib/embeddings';
import { removeItemsFromCanvas } from '@/lib/canvas-cleanup';

// GET /api/items/[id] - Fetch a single item
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .select('id, type, title, content, summary, metadata, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/items/[id] - Update an item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Regenerate embedding if content-related fields changed
  if (body.title || body.content || body.summary || body.metadata) {
    const itemData = {
      title: data.title,
      content: data.content,
      summary: data.summary,
      type: data.type,
      metadata: data.metadata as Record<string, unknown>,
    };
    const imageUrl = getImageUrl(itemData);

    const embeddingPromise = imageUrl
      ? generateImageEmbedding(imageUrl, buildItemText(itemData))
      : generateEmbedding(buildItemText(itemData));

    embeddingPromise
      .then(async (embedding) => {
        if (embedding) {
          const { error: updateError } = await supabaseAdmin
            .from('spark_items')
            .update({ embedding: JSON.stringify(embedding) })
            .eq('id', id);
          if (updateError) {
            console.error('[items] Failed to update embedding:', updateError.message);
          }
        }
      })
      .catch((err) => {
        console.error('[items] Embedding regeneration failed:', err);
      });
  }

  return NextResponse.json(data);
}

// DELETE /api/items/[id] - Delete an item
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Look up spark_id before deleting so we can clean up canvas metadata
  const { data: item } = await supabaseAdmin
    .from('spark_items')
    .select('spark_id')
    .eq('id', id)
    .single();

  const { error } = await supabaseAdmin
    .from('spark_items')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clean stale references from canvas metadata
  if (item?.spark_id) {
    removeItemsFromCanvas(item.spark_id, [id]).catch((err) =>
      console.error('[items] Canvas cleanup failed:', err)
    );
  }

  return NextResponse.json({ success: true });
}
