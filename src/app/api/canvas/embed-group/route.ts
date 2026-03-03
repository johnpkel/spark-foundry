import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbeddings, generateEmbedding, buildItemText, getImageUrl } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const { spark_id, item_ids, group_name } = await request.json();

    if (!spark_id || !item_ids?.length) {
      return NextResponse.json({ error: 'spark_id and item_ids required' }, { status: 400 });
    }

    // Fetch items
    const { data: items, error } = await supabaseAdmin
      .from('spark_items')
      .select('*')
      .eq('spark_id', spark_id)
      .in('id', item_ids);

    if (error) throw error;
    if (!items?.length) {
      return NextResponse.json({ error: 'No items found' }, { status: 404 });
    }

    // Find items missing embeddings
    const needsEmbedding = items.filter(item => !item.embedding);
    let embeddedCount = 0;

    if (needsEmbedding.length > 0) {
      const embeddingInputs = needsEmbedding.map(item => ({
        text: buildItemText(item),
        imageUrl: getImageUrl(item),
      }));

      const embeddings = await generateEmbeddings(embeddingInputs);

      // Update each item with its embedding
      for (let i = 0; i < needsEmbedding.length; i++) {
        if (embeddings[i]) {
          await supabaseAdmin
            .from('spark_items')
            .update({ embedding: JSON.stringify(embeddings[i]) })
            .eq('id', needsEmbedding[i].id);
          embeddedCount++;
        }
      }
    }

    // Generate composite group embedding if group_name provided
    let groupEmbedding: number[] | null = null;
    if (group_name) {
      const compositeText = items
        .map(item => buildItemText(item))
        .join('\n\n---\n\n');

      groupEmbedding = await generateEmbedding(
        `[Group: ${group_name}]\n\n${compositeText}`,
      );
    }

    return NextResponse.json({
      success: true,
      embedded_count: embeddedCount,
      group_embedding: groupEmbedding,
    });
  } catch (err) {
    console.error('[canvas/embed-group]', err);
    return NextResponse.json(
      { error: 'Failed to embed group' },
      { status: 500 },
    );
  }
}
