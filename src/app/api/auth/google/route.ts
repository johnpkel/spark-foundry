import { NextResponse } from 'next/server';
import { buildGoogleAuthUrl } from '@/lib/google/oauth';

// GET /api/auth/google — Redirect to Google consent screen
export async function GET() {
  const url = buildGoogleAuthUrl();
  return NextResponse.redirect(url);
}
