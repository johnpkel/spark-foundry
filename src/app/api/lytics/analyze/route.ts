import { NextResponse } from 'next/server';
import {
  classifyContent,
  getAudienceAlignment,
  getOpportunities,
} from '@/lib/lytics/api';
import type { OpportunityTopic } from '@/lib/lytics/api';

/**
 * POST /api/lytics/analyze
 *
 * Orchestrates Lytics classify → align → opportunities and returns
 * a combined scoring result for the editor ScorePanel.
 *
 * Body: { text: string, referencedItemTexts: string[] }
 */

const MAX_TEXT_LENGTH = 5000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, referencedItemTexts } = body as {
      text?: string;
      referencedItemTexts?: string[];
    };

    if (!text && (!referencedItemTexts || referencedItemTexts.length === 0)) {
      return NextResponse.json(
        { error: 'text or referencedItemTexts is required' },
        { status: 400 },
      );
    }

    // 1. Combine text + referenced items
    const parts = [text ?? '', ...(referencedItemTexts ?? [])].filter(Boolean);
    let combinedText = parts.join('\n\n---\n\n');

    // Truncate if needed — Lytics classify has input limits
    if (combinedText.length > MAX_TEXT_LENGTH) {
      combinedText = combinedText.slice(0, MAX_TEXT_LENGTH);
    }

    // 2. Classify the combined text → topics
    const classification = await classifyContent(combinedText);
    const allTopics = {
      ...classification.inferred_topics,
      ...classification.topics, // higher-confidence topics override inferred
    };

    // 3. If we got topics, fetch alignment + opportunities in parallel
    let audiences: { name: string; alignment: number; size: number }[] = [];
    let opportunities: OpportunityTopic[] = [];

    const topicEntries = Object.entries(allTopics).sort(([, a], [, b]) => b - a);

    if (topicEntries.length > 0) {
      const [alignments, opps] = await Promise.all([
        getAudienceAlignment(allTopics),
        getOpportunities(),
      ]);

      audiences = alignments
        .map((a) => ({
          name: a.segment_name,
          alignment: Math.round(a.alignment * 100),
          size: a.segment_size,
        }))
        .sort((a, b) => b.alignment - a.alignment);

      opportunities = opps;
    }

    // 4. Build topics array (sorted by score, descending)
    const topics = topicEntries.map(([name, score]) => ({
      name: formatTopicName(name),
      score: Math.round(score * 100),
    }));

    // 5. Compute overall relevance: avg of top-5 topic confidences × 100
    const top5 = topicEntries.slice(0, 5).map(([, s]) => s);
    const overallRelevance =
      top5.length > 0
        ? Math.round((top5.reduce((sum, s) => sum + s, 0) / top5.length) * 100)
        : 0;

    return NextResponse.json({
      topics,
      audiences,
      opportunities,
      overallRelevance,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[lytics/analyze]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Convert topic slugs like "digital_marketing" → "Digital Marketing" */
function formatTopicName(slug: string): string {
  return slug
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
