import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { listAssets, listAssetFolders } from '@/lib/contentstack/api';

// GET /api/contentstack/assets?api_key={key}&skip={n}&folder={uid}
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const apiKey = request.nextUrl.searchParams.get('api_key');
  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
  }

  const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0', 10);
  const folder = request.nextUrl.searchParams.get('folder') || undefined;
  const includeFolders = request.nextUrl.searchParams.get('include_folders') === 'true';

  try {
    const result = await listAssets(session.access_token, apiKey, { skip, folder });

    let folders;
    if (includeFolders) {
      folders = await listAssetFolders(session.access_token, apiKey);
    }

    return NextResponse.json({
      assets: result.assets,
      count: result.count,
      ...(folders ? { folders } : {}),
    });
  } catch (err) {
    console.error('[contentstack/assets] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('403') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
