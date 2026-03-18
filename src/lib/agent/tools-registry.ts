/**
 * Agent tool registry — all tool definitions, risk classification, and execution.
 *
 * Tools are organized by service:
 * - Spark: semantic_search, keyword_search, list_items, get_spark_details, scrape_url, save_web_research
 * - Contentstack: cs_list_content_types, cs_get_content_type_schema, cs_search_entries, cs_get_entry,
 *                 cs_get_entry_references, cs_list_environments, cs_list_languages, cs_list_entries,
 *                 cs_create_entry, cs_update_entry, cs_delete_entry, cs_publish_entry
 * - Lytics: lytics_classify, lytics_get_audiences, lytics_get_opportunities
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding, generateEmbedding } from '@/lib/embeddings';
import { scrapePage } from '@/lib/scraper';
import { addLogEntry } from '@/lib/activity-logger';
import { interpolateVariables } from '@/lib/agent/skill-variables';
import type { SkillVariable } from '@/lib/types';
import {
  listContentTypes, getContentTypeSchema, listEntries,
  getEntry, searchEntries, createEntry, updateEntry, deleteEntry,
  publishEntry, getEntryReferences, listEnvironments, listLanguages,
} from '@/lib/contentstack/management';
import {
  enrichContent, alignContent, getOpportunity,
} from '@/lib/lytics/api';

// ─── Risk classification ────────────────────────

export type ToolRisk = 'read' | 'write' | 'destructive';

export const TOOL_RISK: Record<string, ToolRisk> = {
  // Spark tools
  semantic_search: 'read',
  keyword_search: 'read',
  list_items: 'read',
  get_spark_details: 'read',
  scrape_url: 'read',
  save_web_research: 'read',
  // Contentstack read tools
  cs_list_content_types: 'read',
  cs_get_content_type_schema: 'read',
  cs_search_entries: 'read',
  cs_get_entry: 'read',
  cs_get_entry_references: 'read',
  cs_list_environments: 'read',
  cs_list_languages: 'read',
  cs_list_entries: 'read',
  // Contentstack write tools
  cs_create_entry: 'write',
  cs_update_entry: 'write',
  cs_delete_entry: 'destructive',
  cs_publish_entry: 'write',
  // Lytics tools
  lytics_classify: 'read',
  lytics_get_audiences: 'read',
  lytics_get_opportunities: 'read',
  // Skill tools
  use_skill: 'read',
  get_skill_resource: 'read',
  draft_skill: 'read',
  // Editor tools
  update_editor: 'write',
};

export function getToolRisk(name: string): ToolRisk {
  return TOOL_RISK[name] || 'read';
}

export function isWriteTool(name: string): boolean {
  const risk = getToolRisk(name);
  return risk === 'write' || risk === 'destructive';
}

// ─── Status labels ──────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  semantic_search: 'Searching your Spark...',
  keyword_search: 'Searching by keyword...',
  list_items: 'Loading items...',
  get_spark_details: 'Getting Spark details...',
  scrape_url: 'Reading webpage...',
  save_web_research: 'Saving research...',
  web_search: 'Searching the web...',
  cs_list_content_types: 'Loading content types...',
  cs_get_content_type_schema: 'Reading content type schema...',
  cs_search_entries: 'Searching CMS entries...',
  cs_get_entry: 'Loading CMS entry...',
  cs_get_entry_references: 'Loading entry references...',
  cs_list_environments: 'Loading environments...',
  cs_list_languages: 'Loading languages...',
  cs_list_entries: 'Loading entries...',
  cs_create_entry: 'Creating CMS entry...',
  cs_update_entry: 'Updating CMS entry...',
  cs_delete_entry: 'Deleting CMS entry...',
  cs_publish_entry: 'Publishing CMS entry...',
  lytics_classify: 'Classifying content...',
  lytics_get_audiences: 'Finding audiences...',
  lytics_get_opportunities: 'Loading opportunities...',
  use_skill: 'Loading skill instructions...',
  get_skill_resource: 'Loading skill resource...',
  draft_skill: 'Drafting skill...',
  update_editor: 'Updating document...',
};

// ─── Tool definitions ──────────────────────────

const SPARK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'semantic_search',
    description: 'Search for items in the Spark using semantic similarity. Finds conceptually related items even without exact keyword matches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The natural language search query' },
        spark_id: { type: 'string', description: 'The Spark ID to search in' },
      },
      required: ['query', 'spark_id'],
    },
  },
  {
    name: 'keyword_search',
    description: 'Search for items by exact keyword or phrase match.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The keyword or phrase to search for' },
        spark_id: { type: 'string', description: 'The Spark ID to search in' },
      },
      required: ['query', 'spark_id'],
    },
  },
  {
    name: 'list_items',
    description: 'List all items in the Spark for a complete overview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        spark_id: { type: 'string', description: 'The Spark ID to list items from' },
      },
      required: ['spark_id'],
    },
  },
  {
    name: 'get_spark_details',
    description: 'Get the Spark name, description, and metadata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        spark_id: { type: 'string', description: 'The Spark ID' },
      },
      required: ['spark_id'],
    },
  },
  {
    name: 'scrape_url',
    description: 'Deep-read a specific webpage to extract its full text content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
      },
      required: ['url'],
    },
  },
  {
    name: 'save_web_research',
    description: 'Save web research findings to the Spark. Always call after completing web research.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Descriptive title for the research' },
        query: { type: 'string', description: 'The original research question' },
        content: { type: 'string', description: 'Synthesized markdown research content' },
        summary: { type: 'string', description: 'Short summary (1-2 sentences)' },
        sources: {
          type: 'array',
          description: 'Array of source URLs with titles',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['url', 'title'],
          },
        },
        spark_id: { type: 'string', description: 'The Spark ID to link this research to' },
      },
      required: ['title', 'query', 'content', 'summary', 'sources', 'spark_id'],
    },
  },
];

const CS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'cs_list_content_types',
    description: 'List all content types in a Contentstack stack.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'cs_get_content_type_schema',
    description: 'Get the full field schema for a content type. Always call this before creating or updating entries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
      },
      required: ['api_key', 'content_type_uid'],
    },
  },
  {
    name: 'cs_search_entries',
    description: 'Search entries in a content type with optional query filters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        query: {
          type: 'object',
          description: 'Contentstack query object (e.g. {"title": {"$regex": "blog"}})',
        },
        limit: { type: 'number', description: 'Max results (default 25, max 100)' },
      },
      required: ['api_key', 'content_type_uid'],
    },
  },
  {
    name: 'cs_get_entry',
    description: 'Get a single entry by UID with all its fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_uid: { type: 'string', description: 'The entry UID' },
      },
      required: ['api_key', 'content_type_uid', 'entry_uid'],
    },
  },
  {
    name: 'cs_get_entry_references',
    description: 'Get all references to/from an entry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_uid: { type: 'string', description: 'The entry UID' },
      },
      required: ['api_key', 'content_type_uid', 'entry_uid'],
    },
  },
  {
    name: 'cs_list_entries',
    description: 'List entries in a content type with pagination.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        limit: { type: 'number', description: 'Max results (default 25, max 100)' },
        skip: { type: 'number', description: 'Number of entries to skip' },
      },
      required: ['api_key', 'content_type_uid'],
    },
  },
  {
    name: 'cs_list_environments',
    description: 'List all publishing environments in a Contentstack stack.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'cs_list_languages',
    description: 'List all available languages/locales in a Contentstack stack.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'cs_create_entry',
    description: 'Create a new entry in a content type. Requires user approval before execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_data: {
          type: 'object',
          description: 'The entry field data matching the content type schema',
        },
        locale: { type: 'string', description: 'Locale code (default: en-us)' },
      },
      required: ['api_key', 'content_type_uid', 'entry_data'],
    },
  },
  {
    name: 'cs_update_entry',
    description: 'Update an existing entry. Requires user approval before execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_uid: { type: 'string', description: 'The entry UID to update' },
        entry_data: {
          type: 'object',
          description: 'The updated entry field data',
        },
        locale: { type: 'string', description: 'Locale code (default: en-us)' },
      },
      required: ['api_key', 'content_type_uid', 'entry_uid', 'entry_data'],
    },
  },
  {
    name: 'cs_delete_entry',
    description: 'Delete an entry. Requires user approval. This is destructive and cannot be undone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_uid: { type: 'string', description: 'The entry UID to delete' },
      },
      required: ['api_key', 'content_type_uid', 'entry_uid'],
    },
  },
  {
    name: 'cs_publish_entry',
    description: 'Publish an entry to specified environments and locales. Requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'The stack API key' },
        content_type_uid: { type: 'string', description: 'The content type UID' },
        entry_uid: { type: 'string', description: 'The entry UID to publish' },
        environments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Environment UIDs to publish to',
        },
        locales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Locale codes to publish',
        },
      },
      required: ['api_key', 'content_type_uid', 'entry_uid', 'environments', 'locales'],
    },
  },
];

const LYTICS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lytics_classify',
    description: 'Classify text content into topics using Lytics Content Affinity API.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content to classify' },
      },
      required: ['text'],
    },
  },
  {
    name: 'lytics_get_audiences',
    description: 'Get audience alignment scores for a set of topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topics: {
          type: 'object',
          description: 'Map of topic slugs to confidence scores (0-1)',
        },
      },
      required: ['topics'],
    },
  },
  {
    name: 'lytics_get_opportunities',
    description: 'Get content opportunity data showing gaps and potential across topics.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

const SKILL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'use_skill',
    description: 'Activate a skill to load its full instructions. Call this when a user request matches an available skill. The skill instructions will guide your behavior for the task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_id: { type: 'string', description: 'The skill UUID from the Available Skills list' },
        spark_id: { type: 'string', description: 'The current Spark ID (for variable overrides)' },
      },
      required: ['skill_id'],
    },
  },
  {
    name: 'get_skill_resource',
    description: 'Load a named resource file from an activated skill. Use when skill instructions reference additional files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_id: { type: 'string', description: 'The skill UUID' },
        resource_name: { type: 'string', description: 'The resource file name to load' },
      },
      required: ['skill_id', 'resource_name'],
    },
  },
  {
    name: 'draft_skill',
    description: 'Draft a new reusable skill from the current conversation. Use when the user says "save this as a skill", "make this a skill", or wants to save a workflow for reuse. The draft will be sent to the Skills panel for the user to review and save.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'kebab-case skill name' },
        description: { type: 'string', description: 'What it does + when to trigger (max 1024 chars)' },
        instructions: { type: 'string', description: 'Full step-by-step instructions in markdown' },
        variables: {
          type: 'array',
          description: 'Optional variables that can be customized per-Spark',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              default_value: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['key', 'label', 'default_value'],
          },
        },
      },
      required: ['name', 'description', 'instructions'],
    },
  },
];

const EDITOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_editor',
    description: "Apply content to the user's Spark Editor document. Use this when the user asks you to modify, add to, or rewrite their document.",
    input_schema: {
      type: 'object' as const,
      properties: {
        mode: {
          type: 'string',
          enum: ['append', 'integrate', 'insert_after'],
          description: 'How to apply the content: append (add to end), integrate (full document rewrite), insert_after (insert after a heading)',
        },
        content: { type: 'string', description: 'The markdown content to apply' },
        target_heading: { type: 'string', description: 'For insert_after mode: the heading text to insert after' },
        description: { type: 'string', description: 'Short human-readable summary of the change' },
      },
      required: ['mode', 'content', 'description'],
    },
  },
];

// ─── Combined tool list ─────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  ...SPARK_TOOLS,
  ...CS_TOOLS,
  ...LYTICS_TOOLS,
  ...SKILL_TOOLS,
  ...EDITOR_TOOLS,
];

export const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 10,
};

export const ALL_TOOLS: (Anthropic.Tool | Anthropic.WebSearchTool20250305)[] = [
  ...TOOLS,
  WEB_SEARCH_TOOL,
];

// ─── Image helpers (for tool result building) ───

const MAX_IMAGES_PER_RESULT = 5;

function getItemImageUrl(item: Record<string, unknown>): string | null {
  const metadata = item.metadata as Record<string, unknown> | null;
  if (item.type === 'image') {
    const url = (metadata?.image_url as string) || (item.content as string);
    return url?.startsWith('http') ? url : null;
  }
  if (item.type === 'link' && metadata?.og_image) {
    const url = metadata.og_image as string;
    return url.startsWith('http') ? url : null;
  }
  return null;
}

function buildToolContent(
  items: Record<string, unknown>[],
  prefix: string
): Anthropic.ToolResultBlockParam['content'] {
  const textData = items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: (item.content as string)?.substring(0, 2000),
    summary: item.summary,
    metadata: item.metadata,
    ...(item.similarity !== undefined && { similarity: item.similarity }),
    ...(item.created_at !== undefined && { created_at: item.created_at }),
  }));

  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
    { type: 'text', text: `${prefix}\n${JSON.stringify(textData, null, 2)}` },
  ];

  let imageCount = 0;
  for (const item of items) {
    if (imageCount >= MAX_IMAGES_PER_RESULT) break;
    const imageUrl = getItemImageUrl(item);
    if (imageUrl) {
      content.push(
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: `Above image: "${item.title}"` }
      );
      imageCount++;
    }
  }

  return content;
}

// ─── Tool summary helpers ───────────────────────

export function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'semantic_search':
    case 'keyword_search':
      return `query: "${input.query}"`;
    case 'cs_search_entries':
      return `${input.content_type_uid}${input.query ? ' — ' + JSON.stringify(input.query) : ''}`;
    case 'cs_get_entry':
      return `${input.content_type_uid}/${input.entry_uid}`;
    case 'cs_get_content_type_schema':
      return `schema: ${input.content_type_uid}`;
    case 'cs_create_entry':
      return `Creating ${input.content_type_uid} entry`;
    case 'cs_update_entry':
      return `Updating ${input.content_type_uid}/${input.entry_uid}`;
    case 'cs_delete_entry':
      return `Deleting ${input.content_type_uid}/${input.entry_uid}`;
    case 'cs_publish_entry':
      return `Publishing to ${(input.environments as string[])?.join(', ')}`;
    case 'lytics_classify':
      return `${(input.text as string)?.substring(0, 60)}...`;
    case 'use_skill':
      return `skill: ${input.skill_id}`;
    case 'get_skill_resource':
      return `resource: ${input.resource_name}`;
    case 'draft_skill':
      return `skill: "${input.name}"`;
    case 'update_editor':
      return `${input.mode}: ${input.description || 'Update document'}`;
    default:
      return Object.keys(input).join(', ');
  }
}

export function describeWriteOperation(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'cs_create_entry':
      return `Create a new ${input.content_type_uid} entry in Contentstack`;
    case 'cs_update_entry':
      return `Update entry ${input.entry_uid} in ${input.content_type_uid}`;
    case 'cs_delete_entry':
      return `Delete entry ${input.entry_uid} from ${input.content_type_uid}. This cannot be undone.`;
    case 'cs_publish_entry':
      return `Publish entry ${input.entry_uid} to ${(input.environments as string[])?.join(', ')}`;
    case 'update_editor': {
      const modeLabels: Record<string, string> = { append: 'Append to document', integrate: 'Rewrite document', insert_after: 'Insert after heading' };
      return `${modeLabels[input.mode as string] || 'Update document'}: ${input.description || ''}`;
    }
    default:
      return `Execute ${name}`;
  }
}

export function summarizeToolResult(
  name: string,
  result: Anthropic.ToolResultBlockParam['content']
): string {
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed.success) return parsed.message || 'Success';
      if (parsed.error) return `Error: ${parsed.error}`;
    } catch {
      // Not JSON — return truncated
    }
    return result.substring(0, 120);
  }
  if (Array.isArray(result)) {
    const textBlock = result.find((b) => b.type === 'text');
    if (textBlock && 'text' in textBlock) return (textBlock as Anthropic.TextBlockParam).text.substring(0, 120);
  }
  return 'Completed';
}

// ─── Tool execution ────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<Anthropic.ToolResultBlockParam['content']> {
  switch (name) {
    // ── Spark tools ─────────────────
    case 'semantic_search': {
      const query = input.query as string;
      const sparkId = input.spark_id as string;
      const queryEmbedding = await generateQueryEmbedding(query);
      if (queryEmbedding) {
        const { data, error } = await supabaseAdmin.rpc('match_spark_items', {
          p_spark_id: sparkId,
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: 0.3,
          match_count: 10,
        });
        if (!error && data?.length > 0) {
          return buildToolContent(data, `Found ${data.length} semantically relevant items:`);
        }
      }
      const { data: kwData } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata')
        .eq('spark_id', sparkId)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`)
        .limit(10);
      return buildToolContent(kwData || [], `Found ${kwData?.length || 0} items (keyword match):`);
    }

    case 'keyword_search': {
      const query = input.query as string;
      const sparkId = input.spark_id as string;
      const { data } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata')
        .eq('spark_id', sparkId)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`)
        .limit(20);
      return buildToolContent(data || [], `Found ${data?.length || 0} items:`);
    }

    case 'list_items': {
      const sparkId = input.spark_id as string;
      const { data } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata, created_at')
        .eq('spark_id', sparkId)
        .order('created_at', { ascending: false });
      if (!data?.length) return 'No items in this Spark yet.';
      return buildToolContent(data, `Found ${data.length} items:`);
    }

    case 'get_spark_details': {
      const sparkId = input.spark_id as string;
      const { data } = await supabaseAdmin
        .from('sparks')
        .select('*')
        .eq('id', sparkId)
        .single();
      return JSON.stringify(data, null, 2);
    }

    case 'scrape_url': {
      const url = input.url as string;
      const result = await scrapePage(url);
      if (!result) return JSON.stringify({ error: 'Failed to scrape page', url });
      return JSON.stringify({
        url,
        title: result.og_title || url,
        description: result.og_description || null,
        text: result.text.substring(0, 30_000),
      });
    }

    case 'save_web_research': {
      const title = input.title as string;
      const query = input.query as string;
      const content = input.content as string;
      const summary = input.summary as string;
      const sources = input.sources as Array<{ url: string; title: string; snippet?: string }>;
      const sparkId = input.spark_id as string;

      const { data: researchItem, error: insertError } = await supabaseAdmin
        .from('web_research_items')
        .insert({ title, query, content, summary, sources })
        .select('id')
        .single();

      if (insertError || !researchItem) {
        return JSON.stringify({ error: 'Failed to save research', details: insertError?.message });
      }

      const { error: joinError } = await supabaseAdmin
        .from('spark_web_research')
        .insert({ spark_id: sparkId, web_research_item_id: researchItem.id });

      if (joinError) {
        console.error('[save_web_research] Join insert failed:', joinError.message);
      }

      const embeddingText = `[web_research] ${title}\nQuery: ${query}\n${summary || ''}\n${content}`;
      generateEmbedding(embeddingText)
        .then(async (embedding) => {
          if (embedding) {
            await supabaseAdmin
              .from('web_research_items')
              .update({ embedding: JSON.stringify(embedding) })
              .eq('id', researchItem.id);
          }
        })
        .catch((err) => console.error('[save_web_research] Embedding failed:', err));

      return JSON.stringify({
        success: true,
        id: researchItem.id,
        message: `Research "${title}" saved and linked to Spark.`,
      });
    }

    // ── Contentstack tools ──────────
    // All CS operations route through management.ts which handles auth
    // (env CONTENTSTACK_MANAGEMENT_TOKEN → authtoken header, or OAuth fallback).
    // api_key falls back to CONTENTSTACK_API_KEY env var when not provided.

    case 'cs_list_content_types': {
      const apiKey = input.api_key as string | undefined;
      const types = await listContentTypes(apiKey);
      return JSON.stringify({
        count: types.length,
        content_types: types.map((ct) => ({
          uid: ct.uid,
          title: ct.title,
          description: ct.description,
        })),
      }, null, 2);
    }

    case 'cs_get_content_type_schema': {
      const apiKey = input.api_key as string | undefined;
      const ct = await getContentTypeSchema(input.content_type_uid as string, apiKey);
      return JSON.stringify(ct, null, 2);
    }

    case 'cs_search_entries': {
      const apiKey = input.api_key as string | undefined;
      const result = await searchEntries(
        input.content_type_uid as string,
        input.query as Record<string, unknown> | undefined,
        (input.limit as number) || 25,
        apiKey
      );
      return JSON.stringify(result, null, 2);
    }

    case 'cs_get_entry': {
      const apiKey = input.api_key as string | undefined;
      const entry = await getEntry(
        input.content_type_uid as string,
        input.entry_uid as string,
        apiKey
      );
      return JSON.stringify(entry, null, 2);
    }

    case 'cs_get_entry_references': {
      const apiKey = input.api_key as string | undefined;
      const refs = await getEntryReferences(
        input.content_type_uid as string,
        input.entry_uid as string,
        apiKey
      );
      return JSON.stringify({ references: refs }, null, 2);
    }

    case 'cs_list_entries': {
      const apiKey = input.api_key as string | undefined;
      const result = await listEntries(
        input.content_type_uid as string,
        { limit: (input.limit as number) || 25, skip: (input.skip as number) || 0 },
        apiKey
      );
      return JSON.stringify(result, null, 2);
    }

    case 'cs_list_environments': {
      const apiKey = input.api_key as string | undefined;
      const envs = await listEnvironments(apiKey);
      return JSON.stringify({ environments: envs }, null, 2);
    }

    case 'cs_list_languages': {
      const apiKey = input.api_key as string | undefined;
      const langs = await listLanguages(apiKey);
      return JSON.stringify({ languages: langs }, null, 2);
    }

    case 'cs_create_entry': {
      const apiKey = input.api_key as string | undefined;
      const entry = await createEntry(
        input.content_type_uid as string,
        input.entry_data as Record<string, unknown>,
        (input.locale as string) || 'en-us',
        apiKey
      );
      return JSON.stringify({ success: true, entry }, null, 2);
    }

    case 'cs_update_entry': {
      const apiKey = input.api_key as string | undefined;
      const entry = await updateEntry(
        input.content_type_uid as string,
        input.entry_uid as string,
        input.entry_data as Record<string, unknown>,
        (input.locale as string) || 'en-us',
        apiKey
      );
      return JSON.stringify({ success: true, entry }, null, 2);
    }

    case 'cs_delete_entry': {
      const apiKey = input.api_key as string | undefined;
      await deleteEntry(input.content_type_uid as string, input.entry_uid as string, apiKey);
      return JSON.stringify({ success: true, message: 'Entry deleted.' });
    }

    case 'cs_publish_entry': {
      const apiKey = input.api_key as string | undefined;
      await publishEntry(
        input.content_type_uid as string,
        input.entry_uid as string,
        input.environments as string[],
        input.locales as string[],
        apiKey
      );
      return JSON.stringify({
        success: true,
        message: `Entry published to environments: ${(input.environments as string[]).join(', ')}`,
      });
    }

    // ── Skill tools ────────────────
    case 'use_skill': {
      const skillId = input.skill_id as string;
      const sparkId = input.spark_id as string | undefined;
      const { data: skill, error: skillError } = await supabaseAdmin
        .from('skills')
        .select('name, instructions, resources, variables')
        .eq('id', skillId)
        .single();

      if (skillError || !skill) {
        return JSON.stringify({ error: 'Skill not found' });
      }

      // Interpolate variables with per-Spark overrides
      let finalInstructions = skill.instructions as string;
      const variables = (skill.variables as SkillVariable[]) || [];
      if (variables.length > 0) {
        let overrides: Record<string, string> = {};
        if (sparkId) {
          const { data: overrideRow } = await supabaseAdmin
            .from('skill_variable_overrides')
            .select('overrides')
            .eq('skill_id', skillId)
            .eq('spark_id', sparkId)
            .maybeSingle();
          if (overrideRow?.overrides) {
            overrides = overrideRow.overrides as Record<string, string>;
          }
        }
        finalInstructions = interpolateVariables(finalInstructions, variables, overrides);
      }

      const resourceList = (skill.resources as Array<{ name: string }>) || [];
      const resourceNames = resourceList.map((r) => r.name);

      return JSON.stringify({
        skill: skill.name,
        instructions: finalInstructions,
        available_resources: resourceNames.length > 0 ? resourceNames : undefined,
      }, null, 2);
    }

    case 'get_skill_resource': {
      const skillId = input.skill_id as string;
      const resourceName = input.resource_name as string;
      const { data: skill, error: skillError } = await supabaseAdmin
        .from('skills')
        .select('resources')
        .eq('id', skillId)
        .single();

      if (skillError || !skill) {
        return JSON.stringify({ error: 'Skill not found' });
      }

      const resources = (skill.resources as Array<{ name: string; content: string }>) || [];
      const resource = resources.find((r) => r.name === resourceName);
      if (!resource) {
        return JSON.stringify({ error: `Resource "${resourceName}" not found. Available: ${resources.map(r => r.name).join(', ')}` });
      }

      return resource.content;
    }

    // ── Lytics tools ────────────────
    case 'lytics_classify': {
      const result = await enrichContent(input.text as string);
      return JSON.stringify(result, null, 2);
    }

    case 'lytics_get_audiences': {
      const result = await alignContent(input.topics as Record<string, number>);
      return JSON.stringify({ audiences: result }, null, 2);
    }

    case 'lytics_get_opportunities': {
      const result = await getOpportunity();
      return JSON.stringify({ opportunities: result }, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
