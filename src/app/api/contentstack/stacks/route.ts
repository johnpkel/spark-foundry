import { NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { listStacks } from '@/lib/contentstack/api';

// GET /api/contentstack/stacks — List user's Contentstack stacks
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // listStacks will try org-level listing first, then fall back to user-level
    const stacks = await listStacks(session.access_token, session.organization_uid);
    return NextResponse.json({ stacks });
  } catch (err) {
    console.error('[contentstack/stacks] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
