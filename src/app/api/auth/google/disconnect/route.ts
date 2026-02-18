import { NextResponse } from 'next/server';
import { revokeAndClear } from '@/lib/google/oauth';

// POST /api/auth/google/disconnect — Revoke token and clear cookie
export async function POST() {
  await revokeAndClear();
  return NextResponse.json({ disconnected: true });
}
