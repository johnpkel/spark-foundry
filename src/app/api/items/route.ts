import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  generateEmbedding,
  generateImageEmbedding,
  buildItemText,
  getImageUrl,
} from '@/lib/embeddings';
import { scrapePage } from '@/lib/scraper';
import { getValidAccessToken } from '@/lib/google/oauth';
import { exportFileContent } from '@/lib/google/drive';

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
    console.error('[items] Insert failed:', error.message, error.details, error.code);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (type === 'link' && content) {
    // For link items: scrape first, then embed the rich content
    scrapeAndEnrich(data.id, title, content, enrichedMetadata).catch((err) => {
      console.error('[items] scrapeAndEnrich failed:', err);
    });
  } else if (type === 'google_drive' && enrichedMetadata.drive_file_id) {
    // For Drive items: export content in background, then embed
    exportDriveAndEnrich(
      data.id,
      title,
      enrichedMetadata.drive_file_id as string,
      enrichedMetadata.drive_mime_type as string,
      enrichedMetadata
    ).catch((err) => {
      console.error('[items] exportDriveAndEnrich failed:', err);
    });
  } else {
    // For non-link items: embed immediately (existing behavior)
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
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * Background: scrape a link URL, update the item with rich content, then embed.
 */
async function scrapeAndEnrich(
  itemId: string,
  title: string,
  url: string,
  existingMetadata: Record<string, unknown>
) {
  const result = await scrapePage(url);

  if (result) {
    // Build enriched fields from scrape
    const updatedMetadata = {
      ...existingMetadata,
      og_title: result.og_title,
      og_description: result.og_description,
      og_image: result.og_image,
      favicon: result.favicon,
      scraped_images: result.images,
      scrape_status: 'success' as const,
      scraped_at: new Date().toISOString(),
    };

    const scrapedContent = result.text || url;
    const summary = result.og_description || result.text?.slice(0, 300) || null;

    // Update item with scraped content
    const { error: updateError } = await supabaseAdmin
      .from('spark_items')
      .update({
        content: scrapedContent,
        summary,
        metadata: updatedMetadata,
      })
      .eq('id', itemId);

    if (updateError) {
      console.error('[items] Failed to update scraped content:', updateError.message);
    }

    // Generate embedding from rich content
    const itemData = {
      title,
      content: scrapedContent,
      summary,
      type: 'link',
      metadata: updatedMetadata,
    };
    const imageUrl = getImageUrl(itemData);

    const embedding = imageUrl
      ? await generateImageEmbedding(imageUrl, buildItemText(itemData))
      : await generateEmbedding(buildItemText(itemData));

    if (embedding) {
      const { error: embError } = await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', itemId);
      if (embError) {
        console.error('[items] Failed to save embedding:', embError.message);
      }
    }
  } else {
    // Scrape failed — mark status, embed with URL only
    const failedMetadata = {
      ...existingMetadata,
      scrape_status: 'failed' as const,
      scraped_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('spark_items')
      .update({ metadata: failedMetadata })
      .eq('id', itemId);

    const itemData = { title, content: url, type: 'link', metadata: failedMetadata };
    const embedding = await generateEmbedding(buildItemText(itemData));

    if (embedding) {
      await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', itemId);
    }
  }
}

/**
 * Background: export Google Drive file content, update item, then embed.
 * Mirrors the scrapeAndEnrich pattern.
 */
async function exportDriveAndEnrich(
  itemId: string,
  title: string,
  driveFileId: string,
  driveMimeType: string,
  existingMetadata: Record<string, unknown>
) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.error('[items] No valid Google access token for Drive export');
    await supabaseAdmin
      .from('spark_items')
      .update({
        metadata: {
          ...existingMetadata,
          drive_export_status: 'failed',
          drive_exported_at: new Date().toISOString(),
        },
      })
      .eq('id', itemId);
    // Embed with title only
    const embedding = await generateEmbedding(title);
    if (embedding) {
      await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', itemId);
    }
    return;
  }

  const exportedText = await exportFileContent(accessToken, driveFileId, driveMimeType);

  if (exportedText) {
    const summary = exportedText.slice(0, 300);
    const updatedMetadata = {
      ...existingMetadata,
      drive_export_status: 'success' as const,
      drive_exported_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('spark_items')
      .update({
        content: exportedText,
        summary,
        metadata: updatedMetadata,
      })
      .eq('id', itemId);

    if (updateError) {
      console.error('[items] Failed to update Drive content:', updateError.message);
    }

    const itemData = {
      title,
      content: exportedText,
      summary,
      type: 'google_drive',
      metadata: updatedMetadata,
    };
    const embedding = await generateEmbedding(buildItemText(itemData));

    if (embedding) {
      const { error: embError } = await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', itemId);
      if (embError) {
        console.error('[items] Failed to save Drive embedding:', embError.message);
      }
    }
  } else {
    // Export not possible (binary file) or failed — embed title only
    const updatedMetadata = {
      ...existingMetadata,
      drive_export_status: exportedText === null ? 'success' : 'failed',
      drive_exported_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('spark_items')
      .update({ metadata: updatedMetadata })
      .eq('id', itemId);

    const embedding = await generateEmbedding(title);
    if (embedding) {
      await supabaseAdmin
        .from('spark_items')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', itemId);
    }
  }
}
