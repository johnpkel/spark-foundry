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
    const result = await listStacks(session.access_token, session.organization_uid);
    return NextResponse.json({
      stacks: result.stacks,
      _debug: {
        email: session.email,
        org_uid: session.organization_uid || null,
        token_expired: session.expires_at < Date.now(),
        strategies: result._debug,
      },
    });
  } catch (err) {
    console.error('[contentstack/stacks] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
