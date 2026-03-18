import { NextResponse } from 'next/server';
import { getData, refreshGlobalData, isAvailable } from '@/lib/lytics/data-service';

/**
 * GET /api/lytics/data
 *
 * Returns cached Lytics state. Triggers initial refresh if cache is empty.
 */
export async function GET() {
  if (!isAvailable()) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const data = getData();

  // If cache is empty, do initial refresh
  if (!data.lastRefreshed) {
    await refreshGlobalData();
  }

  const refreshed = getData();
  return NextResponse.json({
    available: true,
    segments: refreshed.segments,
    segmentGroups: refreshed.segmentGroups,
    opportunity: refreshed.opportunity,
    lastRefreshed: refreshed.lastRefreshed,
  });
}
