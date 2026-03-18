/**
 * Lytics Data Service — singleton cache for ambient Lytics data.
 *
 * Cached in-memory per process. Single-tenant (one LYTICS_ACCESS_TOKEN).
 * Follows the same singleton pattern as activity-logger.ts.
 */

import {
  enrichContent,
  alignContent,
  getOpportunity,
  getSegments,
  getSegmentGroups,
  scanSegment,
  isLyticsConfigured,
} from './api';
import type {
  LyticsCache,
  FormattedTopic,
  FormattedAudience,
  AggregateAffinity,
} from './types';

// ─── Singleton state ────────────────────────────────

let cache: LyticsCache = {
  segments: [],
  segmentGroups: [],
  opportunity: [],
  contentTopics: [],
  contentInferredTopics: [],
  contentAudiences: [],
  lastRefreshed: '',
};

let isRefreshing = false;

// ─── Public API ─────────────────────────────────────

/** Get the current cached data (never calls Lytics API). */
export function getData(): LyticsCache {
  return cache;
}

/** Check if Lytics is available. */
export function isAvailable(): boolean {
  return isLyticsConfigured();
}

/**
 * Refresh global data: segments, segment groups, opportunity.
 * Called on Spark load and on Analyze button click.
 * Safe to call concurrently — deduplicates in-flight requests.
 */
export async function refreshGlobalData(): Promise<void> {
  if (!isLyticsConfigured() || isRefreshing) return;
  isRefreshing = true;

  try {
    const [segments, groups, opportunity] = await Promise.all([
      getSegments(true),
      getSegmentGroups(),
      getOpportunity(),
    ]);

    cache = {
      ...cache,
      segments,
      segmentGroups: groups,
      opportunity,
      lastRefreshed: new Date().toISOString(),
    };
  } finally {
    isRefreshing = false;
  }
}

/**
 * Enrich editor content: classify into topics + align with audiences.
 * Called on debounced editor changes and on Analyze button click.
 * Returns the formatted results (also stored in cache).
 */
export async function enrichEditorContent(
  text: string,
): Promise<{ topics: FormattedTopic[]; inferredTopics: FormattedTopic[]; audiences: FormattedAudience[] }> {
  if (!isLyticsConfigured()) {
    return { topics: [], inferredTopics: [], audiences: [] };
  }

  const enrichResult = await enrichContent(text);

  // Format topics
  const topics = formatTopics(enrichResult.topics);
  const inferredTopics = formatTopics(enrichResult.inferred_topics);

  // Merge for alignment (high-confidence overrides inferred)
  const allTopics = { ...enrichResult.inferred_topics, ...enrichResult.topics };

  // Align with audiences if we got topics
  let audiences: FormattedAudience[] = [];
  if (Object.keys(allTopics).length > 0) {
    const alignments = await alignContent(allTopics);
    audiences = alignments
      .map((a) => ({
        name: a.segment_name,
        alignment: Math.round(a.alignment * 100),
        size: a.segment_size,
      }))
      .sort((a, b) => b.alignment - a.alignment);
  }

  // Update cache
  cache = {
    ...cache,
    contentTopics: topics,
    contentInferredTopics: inferredTopics,
    contentAudiences: audiences,
  };

  return { topics, inferredTopics, audiences };
}

/**
 * Sample aggregate profile affinities for the top N aligned segments.
 * Called on Analyze only (expensive). Returns top topic affinities per segment.
 */
export async function sampleAggregateAffinities(
  topN = 5,
): Promise<AggregateAffinity[]> {
  if (!isLyticsConfigured()) return [];

  // Use the top aligned audiences from the current cache
  const topAudiences = cache.contentAudiences.slice(0, topN);
  if (topAudiences.length === 0) return [];

  // Find segment IDs from cached segments
  const results: AggregateAffinity[] = [];

  for (const audience of topAudiences) {
    const segment = cache.segments.find((s) => s.name === audience.name);
    if (!segment) continue;

    const profiles = await scanSegment(segment.id, 50);
    if (profiles.length === 0) continue;

    // Aggregate topic affinities across sampled profiles
    const topicScores = new Map<string, number[]>();
    for (const profile of profiles) {
      // Lytics stores topic affinities as fields like "lytics_content_*"
      for (const [key, value] of Object.entries(profile)) {
        if (key.startsWith('lytics_content_') && typeof value === 'number') {
          const topic = key.replace('lytics_content_', '').replace(/_/g, ' ');
          if (!topicScores.has(topic)) topicScores.set(topic, []);
          topicScores.get(topic)!.push(value);
        }
      }
    }

    // Average scores, sort by score, take top 10
    const affinities = [...topicScores.entries()]
      .map(([topic, scores]) => ({
        topic: formatTopicName(topic),
        score: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    results.push({ segmentName: audience.name, topAffinities: affinities });
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────

function formatTopics(raw: Record<string, number>): FormattedTopic[] {
  return Object.entries(raw)
    .map(([name, score]) => ({
      name: formatTopicName(name),
      score: Math.round(score * 100),
    }))
    .sort((a, b) => b.score - a.score);
}

function formatTopicName(slug: string): string {
  return slug
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
