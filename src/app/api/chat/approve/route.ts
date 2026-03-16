import { NextRequest, NextResponse } from 'next/server';
import { resolveApproval } from '@/lib/agent/approval';

export async function POST(request: NextRequest) {
  const { approval_id, approved } = await request.json();

  if (!approval_id || typeof approved !== 'boolean') {
    return NextResponse.json(
      { error: 'approval_id and approved (boolean) are required' },
      { status: 400 }
    );
  }

  const resolved = resolveApproval(approval_id, approved);

  if (!resolved) {
    return NextResponse.json(
      { error: 'No pending approval found (may have timed out)' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
