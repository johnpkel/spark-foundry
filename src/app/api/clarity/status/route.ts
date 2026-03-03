import { NextResponse } from 'next/server';

// GET /api/clarity/status — check if Clarity API token is configured
export async function GET() {
  return NextResponse.json({
    configured: !!process.env.CLARITY_API_TOKEN,
  });
}
