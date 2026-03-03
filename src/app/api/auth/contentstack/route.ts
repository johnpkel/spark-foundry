import { NextRequest, NextResponse } from 'next/server';
import { buildCSAuthUrl } from '@/lib/contentstack/oauth';

// GET /api/auth/contentstack — Redirect to Contentstack consent screen
export async function GET(request: NextRequest) {
  const redirect = request.nextUrl.searchParams.get('redirect') || '/';
  const popup = request.nextUrl.searchParams.get('popup') === 'true';
  const state = Buffer.from(
    JSON.stringify({ nonce: crypto.randomUUID(), redirect, popup })
  ).toString('base64url');
  const url = buildCSAuthUrl(state);
  return NextResponse.redirect(url);
}
