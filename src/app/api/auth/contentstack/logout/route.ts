import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/contentstack/oauth';

// POST /api/auth/contentstack/logout — Clear session cookie
export async function POST() {
  await clearSession();
  return NextResponse.json({ loggedOut: true });
}
