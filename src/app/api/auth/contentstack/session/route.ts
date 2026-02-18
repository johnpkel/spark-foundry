import { NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';

// GET /api/auth/contentstack/session — Return current session info
export async function GET() {
  const session = await getSession();

  if (session) {
    return NextResponse.json({
      authenticated: true,
      email: session.email,
      display_name: session.display_name,
      organization_uid: session.organization_uid,
    });
  }

  return NextResponse.json({ authenticated: false });
}
