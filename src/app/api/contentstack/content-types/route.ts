import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { listContentTypes } from '@/lib/contentstack/api';

// GET /api/contentstack/content-types?api_key={stack_api_key}
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const apiKey = request.nextUrl.searchParams.get('api_key');
  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
  }

  try {
    const contentTypes = await listContentTypes(session.access_token, apiKey);
    return NextResponse.json({ content_types: contentTypes });
  } catch (err) {
    console.error('[contentstack/content-types] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('403') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
