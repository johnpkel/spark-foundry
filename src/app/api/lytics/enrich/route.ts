import { NextResponse } from 'next/server';
import { enrichEditorContent, isAvailable } from '@/lib/lytics/data-service';

/**
 * POST /api/lytics/enrich
 *
 * Debounced editor enrichment: classify text → topics + audience alignment.
 * Body: { text: string }
 */
export async function POST(req: Request) {
  if (!isAvailable()) {
    return NextResponse.json({ topics: [], inferredTopics: [], audiences: [] });
  }

  try {
    const { text } = (await req.json()) as { text?: string };

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ topics: [], inferredTopics: [], audiences: [] });
    }

    const result = await enrichEditorContent(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[lytics/enrich]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
