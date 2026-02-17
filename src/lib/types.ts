// ============================================
// Database types matching our Supabase schema
// ============================================

export type SparkStatus = 'active' | 'archived';
export type ItemType = 'link' | 'image' | 'text' | 'file' | 'note';
export type ChatRole = 'user' | 'assistant' | 'system';
export type ArtifactType = 'cms_entry' | 'campaign_brief' | 'custom';
export type ArtifactStatus = 'draft' | 'published' | 'archived';

export interface Spark {
  id: string;
  name: string;
  description: string | null;
  status: SparkStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SparkItem {
  id: string;
  spark_id: string;
  type: ItemType;
  title: string;
  content: string | null;
  summary: string | null;
  metadata: SparkItemMetadata;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface SparkItemMetadata {
  url?: string;
  image_url?: string;
  file_url?: string;
  file_type?: string;
  source?: string;
  tags?: string[];
  og_title?: string;
  og_description?: string;
  og_image?: string;
  favicon?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  spark_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GeneratedArtifact {
  id: string;
  spark_id: string;
  type: ArtifactType;
  title: string;
  content: CmsEntryContent | CampaignBriefContent | Record<string, unknown>;
  status: ArtifactStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// Artifact content types
// ============================================

export interface CmsEntryContent {
  content_type: string;
  fields: {
    title: string;
    url: string;
    body: string;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string[];
    featured_image?: string;
    [key: string]: unknown;
  };
}

export interface CampaignBriefContent {
  campaign_name: string;
  objective: string;
  target_audience: string;
  key_messages: string[];
  channels: string[];
  timeline: string;
  budget_notes?: string;
  kpis: string[];
  creative_direction: string;
  brand_guidelines?: string;
  [key: string]: unknown;
}

// ============================================
// API request/response types
// ============================================

export interface CreateSparkRequest {
  name: string;
  description?: string;
}

export interface CreateItemRequest {
  spark_id: string;
  type: ItemType;
  title: string;
  content?: string;
  metadata?: SparkItemMetadata;
}

export interface ChatRequest {
  spark_id: string;
  message: string;
}

export interface GenerateRequest {
  spark_id: string;
  type: ArtifactType;
  instructions?: string;
}
