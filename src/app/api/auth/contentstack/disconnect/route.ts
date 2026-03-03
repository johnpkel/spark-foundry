import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/contentstack/oauth';

// POST /api/auth/contentstack/disconnect — Clear the Contentstack session cookie
export async function POST() {
  await clearSession();
  return NextResponse.json({ disconnected: true });
}
