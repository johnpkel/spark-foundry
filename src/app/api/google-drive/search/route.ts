import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/google/oauth';
import { searchDriveFiles } from '@/lib/google/drive';

// GET /api/google-drive/search?q=...&pageToken=...
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  const pageToken = request.nextUrl.searchParams.get('pageToken') || undefined;

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: 'Not connected to Google Drive' }, { status: 401 });
  }

  try {
    const results = await searchDriveFiles(accessToken, query, pageToken);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[google-drive/search] Error:', err);
    return NextResponse.json({ error: 'Drive search failed' }, { status: 502 });
  }
}
