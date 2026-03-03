// ============================================
// Database types matching our Supabase schema
// ============================================

export type SparkStatus = 'active' | 'archived';
export type ItemType = 'link' | 'image' | 'text' | 'file' | 'note' | 'google_drive' | 'slack_message' | 'contentstack_entry' | 'contentstack_asset' | 'clarity_insight';
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
  scraped_images?: string[];
  scrape_status?: 'success' | 'failed';
  scraped_at?: string;
  // Google Drive fields
  drive_file_id?: string;
  drive_mime_type?: string;
  drive_icon_url?: string;
  drive_thumbnail_url?: string;
  drive_web_view_link?: string;
  drive_modified_time?: string;
  drive_export_status?: 'pending' | 'success' | 'failed';
  drive_exported_at?: string;
  // Slack fields
  slack_channel_id?: string;
  slack_channel_name?: string;
  slack_thread_ts?: string;
  slack_message_count?: number;
  slack_permalink?: string;
  slack_sender_name?: string;
  // Contentstack fields
  cs_stack_api_key?: string;
  cs_stack_name?: string;
  cs_content_type_uid?: string;
  cs_content_type_title?: string;
  cs_entry_uid?: string;
  cs_entry_locale?: string;
  cs_entry_url?: string;
  cs_asset_uid?: string;
  cs_asset_url?: string;
  cs_asset_content_type?: string; // MIME type
  cs_asset_file_size?: number;
  cs_asset_filename?: string;
  // Microsoft Clarity fields
  clarity_metric_name?: string;
  clarity_dimensions?: string;
  clarity_num_days?: number;
  clarity_imported_at?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  spark_id: string;
  session_id: string | null;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatSession {
  id: string;
  spark_id: string;
  title: string;
  user_messages: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message_preview?: string;
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
// Web Research types
// ============================================

export interface WebResearchSource {
  url: string;
  title: string;
  snippet?: string;
}

export interface WebResearchItem {
  id: string;
  title: string;
  query: string;
  content: string;
  summary: string | null;
  sources: WebResearchSource[];
  metadata: Record<string, unknown>;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Vector visualization types
// ============================================

export interface VectorContextItem {
  id: string;
  type: ItemType | 'web_research';
  title: string;
  similarity: number;
  summary: string | null;
}

// ============================================
// Editor commenting / discussions
// ============================================

export interface ThreadComment {
  id: string;
  authorId: string;
  authorName: string;
  content: string; // plain text with @Name mentions
  createdAt: string;
}

export interface CommentThread {
  id: string;
  selectedText: string; // quoted text snapshot
  resolved: boolean;
  createdAt: string;
  comments: ThreadComment[]; // first = original, rest = replies
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
  session_id?: string;
  skip_persist?: boolean;
}

export interface GenerateRequest {
  spark_id: string;
  type: ArtifactType;
  instructions?: string;
}
