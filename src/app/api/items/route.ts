import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  generateEmbedding,
  generateImageEmbedding,
  buildItemText,
  getImageUrl,
} from '@/lib/embeddings';

// POST /api/items - Create a new item in a spark
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { spark_id, type, title, content, metadata } = body;

  if (!spark_id || !type || !title) {
    return NextResponse.json(
      { error: 'spark_id, type, and title are required' },
      { status: 400 }
    );
  }

  // For link items, try to extract metadata from URL
  let enrichedMetadata = metadata || {};
  if (type === 'link' && content) {
    enrichedMetadata = { ...enrichedMetadata, url: content };
  }

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .insert({
      spark_id,
      type,
      title,
      content: content || null,
      metadata: enrichedMetadata,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate embedding asynchronously (don't block the response)
  const itemData = { title, content, type, metadata: enrichedMetadata };
  const imageUrl = getImageUrl(itemData);

  const embeddingPromise = imageUrl
    ? generateImageEmbedding(imageUrl, buildItemText(itemData))
    : generateEmbedding(buildItemText(itemData));

  embeddingPromise
    .then(async (embedding) => {
      if (embedding && data) {
        const { error: updateError } = await supabaseAdmin
          .from('spark_items')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', data.id);
        if (updateError) {
          console.error('[items] Failed to save embedding:', updateError.message);
        }
      }
    })
    .catch((err) => {
      console.error('[items] Embedding generation failed:', err);
    });

  return NextResponse.json(data, { status: 201 });
}
