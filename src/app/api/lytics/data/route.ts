import { NextResponse } from 'next/server';
import { getData, refreshGlobalData, isAvailable } from '@/lib/lytics/data-service';

/**
 * GET /api/lytics/data
 *
 * Returns cached Lytics state. Triggers initial refresh if cache is empty.
 */
export async function GET() {
  if (!(await isAvailable())) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const data = getData();

  // If cache is empty, do initial refresh
  if (!data.lastRefreshed) {
    await refreshGlobalData();
  }

  const refreshed = getData();
  // Extract account ID from first segment for Lytics UI links
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstSeg = refreshed.segments[0] as any;
  const aid = firstSeg?.aid ?? firstSeg?.account_id ?? '';
  return NextResponse.json({
    available: true,
    aid,
    segments: refreshed.segments,
    segmentGroups: refreshed.segmentGroups,
    opportunity: refreshed.opportunity,
    lastRefreshed: refreshed.lastRefreshed,
  });
}
