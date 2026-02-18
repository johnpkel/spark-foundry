import { NextResponse } from 'next/server';
import { buildCSAuthUrl } from '@/lib/contentstack/oauth';

// GET /api/auth/contentstack — Redirect to Contentstack consent screen
export async function GET() {
  const state = crypto.randomUUID();
  const url = buildCSAuthUrl(state);
  return NextResponse.redirect(url);
}
