import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { addLogEntry } from '@/lib/activity-logger';
import {
  generateEmbedding,
  generateImageEmbedding,
  buildItemText,
  getImageUrl,
} from '@/lib/embeddings';

const CS_API_BASE = 'https://api.contentstack.io/v3';

export async function POST(request: NextRequest) {
  const apiKey = process.env.CONTENTSTACK_ASSET_UPLOAD_API_KEY;
  const managementToken = process.env.CONTENTSTACK_ASSET_UPLOAD_MANAGEMENT_TOKEN;

  if (!apiKey || !managementToken) {
    return NextResponse.json(
      { error: 'Contentstack asset upload credentials not configured' },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const sparkId = formData.get('spark_id') as string | null;

  if (!file || !sparkId) {
    return NextResponse.json(
      { error: 'file and spark_id are required' },
      { status: 400 },
    );
  }

  // ── Upload to Contentstack ──
  const csForm = new FormData();
  csForm.append('asset[upload]', file, file.name);

  const csUrl = `${CS_API_BASE}/assets`;
  const correlationId = `cs_upload_${Date.now()}`;
  const start = Date.now();

  addLogEntry({
    service: 'contentstack',
    direction: 'request',
    level: 'info',
    method: 'POST',
    url: csUrl,
    summary: `Upload asset: ${file.name}`,
    correlationId,
  });

  const csRes = await fetch(csUrl, {
    method: 'POST',
    headers: {
      api_key: apiKey,
      authorization: managementToken,
    },
    body: csForm,
  });

  const duration = Date.now() - start;

  if (!csRes.ok) {
    const errorText = await csRes.text();
    addLogEntry({
      service: 'contentstack',
      direction: 'response',
      level: 'error',
      method: 'POST',
      url: csUrl,
      summary: `Upload asset — ${csRes.status}`,
      statusCode: csRes.status,
      duration,
      error: errorText,
      correlationId,
    });
    return NextResponse.json(
      { error: `Contentstack upload failed: ${csRes.status}` },
      { status: 502 },
    );
  }

  const csData = await csRes.json();
  const asset = csData.asset;

  addLogEntry({
    service: 'contentstack',
    direction: 'response',
    level: 'info',
    method: 'POST',
    url: csUrl,
    summary: `Upload asset — 200 (uid: ${asset.uid})`,
    statusCode: 200,
    duration,
    correlationId,
  });

  // ── Create SparkItem ──
  const metadata = {
    contentstack_uid: asset.uid,
    contentstack_url: asset.url,
    content_type: asset.content_type,
    file_size: asset.file_size,
  };

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .insert({
      spark_id: sparkId,
      type: 'contentstack_asset',
      title: asset.filename || file.name,
      content: asset.url,
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error('[upload-asset] Insert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Generate embedding in background ──
  after(async () => {
    try {
      const itemData = {
        title: data.title,
        content: data.content,
        type: 'contentstack_asset',
        metadata,
      };
      const imageUrl = getImageUrl(itemData);

      const embedding = imageUrl
        ? await generateImageEmbedding(imageUrl, buildItemText(itemData))
        : await generateEmbedding(buildItemText(itemData));

      if (embedding) {
        const { error: updateError } = await supabaseAdmin
          .from('spark_items')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', data.id);
        if (updateError) {
          console.error('[upload-asset] Failed to save embedding:', updateError.message);
        }
      }
    } catch (err) {
      console.error('[upload-asset] Embedding generation failed:', err);
    }
  });

  return NextResponse.json(data, { status: 201 });
}
