import { NextResponse } from 'next/server';
import { getTokens } from '@/lib/google/oauth';

// GET /api/auth/google/status — Check if Google Drive is connected
export async function GET() {
  const tokens = await getTokens();

  if (tokens) {
    return NextResponse.json({ connected: true, email: tokens.email || undefined });
  }

  return NextResponse.json({ connected: false });
}
