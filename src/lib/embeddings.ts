/**
 * Multimodal embedding generation using Voyage AI.
 *
 * Uses voyage-multimodal-3 for ALL embeddings (text + images) so that
 * everything lives in the same 1024-dim vector space. This means text
 * queries can find relevant images and vice versa.
 *
 * If VOYAGE_API_KEY is not set, embedding functions return null gracefully
 * so the app still works without RAG.
 */

import { addLogEntry } from './activity-logger';

const VOYAGE_MULTIMODAL_URL = 'https://api.voyageai.com/v1/multimodalembeddings';
const VOYAGE_MODEL = 'voyage-multimodal-3';
const EMBEDDING_DIMENSIONS = 1024;

export { EMBEDDING_DIMENSIONS };

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string };

interface MultimodalInput {
  content: ContentPart[];
}

function getApiKey(): string | null {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    console.warn('[embeddings] VOYAGE_API_KEY not set — skipping embedding generation');
  }
  return key || null;
}

/**
 * Call the Voyage AI multimodal embeddings API.
 */
async function callMultimodalAPI(
  inputs: MultimodalInput[],
  inputType: 'document' | 'query'
): Promise<(number[] | null)[]> {
  const apiKey = getApiKey();
  if (!apiKey) return inputs.map(() => null);

  const start = Date.now();
  const correlationId = `voyage_${Date.now()}`;

  addLogEntry({
    service: 'voyage',
    direction: 'request',
    level: 'info',
    method: 'POST',
    url: VOYAGE_MULTIMODAL_URL,
    summary: `embed ${inputType} (${inputs.length} item${inputs.length !== 1 ? 's' : ''})`,
    requestBody: { inputCount: inputs.length, inputType, model: VOYAGE_MODEL },
    correlationId,
  });

  const response = await fetch(VOYAGE_MULTIMODAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      inputs,
      input_type: inputType,
    }),
  });

  const duration = Date.now() - start;

  if (!response.ok) {
    const error = await response.text();
    addLogEntry({
      service: 'voyage',
      direction: 'response',
      level: 'error',
      method: 'POST',
      url: VOYAGE_MULTIMODAL_URL,
      summary: `embed ${inputType} — ${response.status}`,
      statusCode: response.status,
      duration,
      error,
      correlationId,
    });
    console.error('[embeddings] Voyage AI multimodal error:', response.status, error);
    return inputs.map(() => null);
  }

  const result = await response.json();
  const data = result.data as { embedding: number[]; index: number }[];
  data.sort((a, b) => a.index - b.index);

  addLogEntry({
    service: 'voyage',
    direction: 'response',
    level: 'info',
    method: 'POST',
    url: VOYAGE_MULTIMODAL_URL,
    summary: `embed ${inputType} — 200 (${data.length} embedding${data.length !== 1 ? 's' : ''}, ${data[0]?.embedding?.length ?? EMBEDDING_DIMENSIONS}d)`,
    statusCode: 200,
    duration,
    correlationId,
  });

  return data.map((d) => d.embedding);
}

/**
 * Generate an embedding for a text-only item (link, text, note, file).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const truncated = text.slice(0, 16_000);
  const results = await callMultimodalAPI(
    [{ content: [{ type: 'text', text: truncated }] }],
    'document'
  );
  return results[0];
}

/**
 * Generate an embedding for an image item.
 * Combines the image with its title/description text so the embedding
 * captures both visual and textual semantics.
 */
export async function generateImageEmbedding(
  imageUrl: string,
  textContext?: string
): Promise<number[] | null> {
  const content: ContentPart[] = [];

  if (textContext) {
    content.push({ type: 'text', text: textContext.slice(0, 4_000) });
  }
  content.push({ type: 'image_url', image_url: imageUrl });

  const results = await callMultimodalAPI([{ content }], 'document');
  return results[0];
}

/**
 * Generate embeddings for multiple items in a single batch.
 * Handles both text and image items.
 */
export async function generateEmbeddings(
  items: { text: string; imageUrl?: string }[]
): Promise<(number[] | null)[]> {
  const apiKey = getApiKey();
  if (!apiKey) return items.map(() => null);

  const BATCH_SIZE = 50; // smaller batches for multimodal (images are heavier)
  const allResults: (number[] | null)[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const inputs: MultimodalInput[] = batch.map((item) => {
      const content: ContentPart[] = [];
      content.push({ type: 'text', text: item.text.slice(0, 16_000) });
      if (item.imageUrl) {
        content.push({ type: 'image_url', image_url: item.imageUrl });
      }
      return { content };
    });

    const results = await callMultimodalAPI(inputs, 'document');
    allResults.push(...results);
  }

  return allResults;
}

/**
 * Generate an embedding for a search query.
 * Uses 'query' input_type for asymmetric retrieval.
 */
export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const results = await callMultimodalAPI(
    [{ content: [{ type: 'text', text: query.slice(0, 16_000) }] }],
    'query'
  );
  return results[0];
}

/**
 * Build a text string from an item's fields for embedding context.
 */
export function buildItemText(item: {
  title: string;
  content?: string | null;
  summary?: string | null;
  type?: string;
  metadata?: Record<string, unknown>;
}): string {
  const parts: string[] = [];

  if (item.type) parts.push(`[${item.type}]`);
  parts.push(item.title);
  if (item.content) parts.push(item.content);
  if (item.summary) parts.push(item.summary);

  const meta = item.metadata as Record<string, unknown> | undefined;
  if (meta?.tags && Array.isArray(meta.tags)) {
    parts.push(`Tags: ${(meta.tags as string[]).join(', ')}`);
  }
  if (meta?.url) {
    parts.push(`URL: ${meta.url}`);
  }
  if (meta?.cs_content_type_title) {
    parts.push(`Content Type: ${meta.cs_content_type_title}`);
  }
  if (meta?.cs_stack_name) {
    parts.push(`Stack: ${meta.cs_stack_name}`);
  }
  if (meta?.clarity_metric_name) {
    parts.push(`Clarity Metric: ${meta.clarity_metric_name}`);
  }
  if (meta?.clarity_dimensions) {
    parts.push(`Dimensions: ${meta.clarity_dimensions}`);
  }

  return parts.join('\n');
}

/**
 * Extract the image URL from an item's metadata, if present.
 */
export function getImageUrl(item: {
  type?: string;
  content?: string | null;
  metadata?: Record<string, unknown>;
}): string | undefined {
  const meta = item.metadata as Record<string, unknown> | undefined;

  if (item.type === 'image') {
    const url = (meta?.image_url as string) || item.content || undefined;
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      return url;
    }
  }

  // For link items, use OG image for multimodal embedding
  if (item.type === 'link' && meta?.og_image) {
    const url = meta.og_image as string;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
  }

  // For Google Drive items, use thumbnail
  if (item.type === 'google_drive' && meta?.drive_thumbnail_url) {
    const url = meta.drive_thumbnail_url as string;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
  }

  // For Contentstack assets, use asset URL if it's an image
  if (item.type === 'contentstack_asset' && meta?.cs_asset_url) {
    const mimeType = meta.cs_asset_content_type as string | undefined;
    if (mimeType?.startsWith('image/')) {
      const url = meta.cs_asset_url as string;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
    }
  }

  return undefined;
}
