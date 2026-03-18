// src/lib/lytics/types.ts

// ─── Content Enrichment ─────────────────────────

export interface EnrichResult {
  topics: Record<string, number>;
  inferred_topics: Record<string, number>;
}

// ─── Content Alignment ──────────────────────────

export interface AudienceAlignment {
  segment_id: string;
  segment_name: string;
  segment_size: number;
  alignment: number; // 0-1
  segment_topics?: Record<string, number>;
}

// ─── Content Opportunity ────────────────────────

export interface OpportunityDimension {
  label: string;
  value: number;
  subject: 'user' | 'content';
}

export interface OpportunityTopic {
  topic: string;
  dimensions: OpportunityDimension[];
  segments: string[];
  context_layer: string;
}

// ─── Segments ───────────────────────────────────

export interface LyticsSegment {
  id: string;
  slug_name: string;
  name: string;
  description: string;
  kind: string;
  table: string;
  size?: number; // present when fetched with sizes=true
  tags: string[];
  groups: string[];
  segment_ql: string;
  is_public: boolean;
  public_name: string;
  category: string;
  created: string;
  updated: string;
}

export interface SegmentGroup {
  id: string;
  name: string;
  description?: string;
}

// ─── Content Entity ─────────────────────────────

export interface LyticsContentEntity {
  url: string;
  title: string;
  author: string;
  description: string;
  lytics: Record<string, number>;
  global: Record<string, number>;
  _segments: string[];
  created: string;
  _modified: string;
}

// ─── Aggregate Profile Affinities ───────────────

export interface AggregateAffinity {
  segmentName: string;
  topAffinities: { topic: string; score: number }[];
}

// ─── Formatted types for API responses ──────────

export interface FormattedTopic {
  name: string;
  score: number; // 0-100
}

export interface FormattedAudience {
  name: string;
  alignment: number; // 0-100
  size: number;      // raw profile count
}

// ─── Opportunity helpers ────────────────────────

/** Extract a named dimension value from an OpportunityTopic */
export function getDimension(topic: OpportunityTopic, label: string): number {
  return topic.dimensions.find((d) => d.label === label)?.value ?? 0;
}

/** Compute opportunity score: high users + low docs = high opportunity */
export function computeOpportunityScore(
  topic: OpportunityTopic,
  maxUsers: number,
  maxDocs: number,
): number {
  const users = getDimension(topic, 'User Count');
  const docs = getDimension(topic, 'Document Count');
  if (maxUsers === 0) return 0;
  const userRatio = users / maxUsers;
  const docRatio = maxDocs > 0 ? docs / maxDocs : 0;
  return Math.round(userRatio * (1 - docRatio) * 100);
}

// ─── Data Service Cache Shape ───────────────────

export interface LyticsCache {
  segments: LyticsSegment[];
  segmentGroups: SegmentGroup[];
  opportunity: OpportunityTopic[];
  /** Editor-specific: current content's topics */
  contentTopics: FormattedTopic[];
  contentInferredTopics: FormattedTopic[];
  /** Editor-specific: current content's audience alignment */
  contentAudiences: FormattedAudience[];
  lastRefreshed: string; // ISO timestamp
}
