import { NextRequest, NextResponse, after } from 'next/server';
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

  // For link and Drive items, run scraping/export synchronously so the
  // enriched item is returned in the response. This avoids reliance on
  // after() which may not execute on all hosting platforms (e.g.
  // Contentstack App Framework). Embedding generation is deferred to
  // after() since it's not needed for display.
  if (type === 'link' && content) {
    const enriched = await scrapeAndEnrichSync(data.id, title, content, enrichedMetadata);
    // Defer embedding to after()
    after(async () => {
      try {
        await generateAndSaveEmbedding(data.id, {
          title,
          content: enriched?.content || content,
          summary: enriched?.summary || null,
          type: 'link',
          metadata: enriched?.metadata || enrichedMetadata,
        });
      } catch (err) {
        console.error('[items] Embedding generation failed:', err);
      }
    });
    // Return the enriched item so the client has scraped data immediately
    if (enriched) {
      return NextResponse.json({ ...data, ...enriched }, { status: 201 });
    }
  } else if (type === 'google_drive' && enrichedMetadata.drive_file_id) {
    const enriched = await exportDriveSync(
      data.id,
      title,
      enrichedMetadata.drive_file_id as string,
      enrichedMetadata.drive_mime_type as string,
      enrichedMetadata
    );
    after(async () => {
      try {
        await generateAndSaveEmbedding(data.id, {
          title,
          content: enriched?.content || null,
          summary: enriched?.summary || null,
          type: 'google_drive',
          metadata: enriched?.metadata || enrichedMetadata,
        });
      } catch (err) {
        console.error('[items] Embedding generation failed:', err);
      }
    });
    if (enriched) {
      return NextResponse.json({ ...data, ...enriched }, { status: 201 });
    }
  } else {
    after(async () => {
      try {
        await generateAndSaveEmbedding(data.id, {
          title, content, type, metadata: enrichedMetadata,
        });
      } catch (err) {
        console.error('[items] Embedding generation failed:', err);
      }
    });
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * Scrape a link URL and update the item with rich content synchronously.
 * Returns the enriched fields so the POST handler can include them in the response.
 */
async function scrapeAndEnrichSync(
  itemId: string,
  title: string,
  url: string,
  existingMetadata: Record<string, unknown>
): Promise<{ content: string; summary: string | null; metadata: Record<string, unknown> } | null> {
  const result = await scrapePage(url);

  if (result) {
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

    const { error: updateError } = await supabaseAdmin
      .from('spark_items')
      .update({ content: scrapedContent, summary, metadata: updatedMetadata })
      .eq('id', itemId);

    if (updateError) {
      console.error('[items] Failed to update scraped content:', updateError.message);
    }

    return { content: scrapedContent, summary, metadata: updatedMetadata };
  }

  // Scrape failed — mark status
  const failedMetadata = {
    ...existingMetadata,
    scrape_status: 'failed' as const,
    scraped_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('spark_items')
    .update({ metadata: failedMetadata })
    .eq('id', itemId);

  return null;
}

/**
 * Export Google Drive file content and update item synchronously.
 * Returns enriched fields for the response.
 */
async function exportDriveSync(
  itemId: string,
  title: string,
  driveFileId: string,
  driveMimeType: string,
  existingMetadata: Record<string, unknown>
): Promise<{ content: string; summary: string | null; metadata: Record<string, unknown> } | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.error('[items] No valid Google access token for Drive export');
    const failedMetadata = {
      ...existingMetadata,
      drive_export_status: 'failed',
      drive_exported_at: new Date().toISOString(),
    };
    await supabaseAdmin
      .from('spark_items')
      .update({ metadata: failedMetadata })
      .eq('id', itemId);
    return null;
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
      .update({ content: exportedText, summary, metadata: updatedMetadata })
      .eq('id', itemId);

    if (updateError) {
      console.error('[items] Failed to update Drive content:', updateError.message);
    }

    return { content: exportedText, summary, metadata: updatedMetadata };
  }

  // Export not possible (binary file) or failed
  const updatedMetadata = {
    ...existingMetadata,
    drive_export_status: exportedText === null ? 'success' : 'failed',
    drive_exported_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('spark_items')
    .update({ metadata: updatedMetadata })
    .eq('id', itemId);

  return null;
}

/**
 * Generate and save an embedding for an item. Used in after() callbacks.
 */
async function generateAndSaveEmbedding(
  itemId: string,
  itemData: { title: string; content: string | null; summary?: string | null; type: string; metadata: Record<string, unknown> }
) {
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
}
