import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from '@/lib/embeddings';

/**
 * MCP tool: Semantic search items in a Spark using vector similarity.
 * Embeds the query, then uses the match_spark_items RPC function for cosine similarity search.
 * Falls back to keyword search if embeddings are unavailable.
 */
const semanticSearchSparkItems = tool(
  'semantic_search_spark_items',
  'Search for items in the Spark using semantic similarity. This finds conceptually related items even if they don\'t contain the exact keywords. Use this as your primary search tool when the user asks questions about their collected content.',
  {
    query: z.string().describe('The natural language search query'),
    spark_id: z.string().uuid().describe('The ID of the Spark to search in'),
    match_count: z.number().optional().describe('Max results to return (default 10)'),
  },
  async (args) => {
    const count = args.match_count ?? 10;

    // Try vector search first
    const queryEmbedding = await generateQueryEmbedding(args.query);

    if (queryEmbedding) {
      const { data, error } = await supabaseAdmin.rpc('match_spark_items', {
        p_spark_id: args.spark_id,
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.3,
        match_count: count,
      });

      if (!error && data && data.length > 0) {
        const results = data.map((item: Record<string, unknown>) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          content: (item.content as string)?.substring(0, 2000),
          summary: item.summary,
          metadata: item.metadata,
          similarity: item.similarity,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: `Found ${results.length} semantically relevant items:\n${JSON.stringify(results, null, 2)}`,
          }],
        };
      }

      if (error) {
        console.error('[semantic_search] RPC error:', error.message);
      }
    }

    // Fallback to keyword search if vector search is unavailable
    const { data, error } = await supabaseAdmin
      .from('spark_items')
      .select('id, type, title, content, summary, metadata, created_at')
      .eq('spark_id', args.spark_id)
      .or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%,summary.ilike.%${args.query}%`)
      .limit(count);

    if (error) {
      return {
        content: [{ type: 'text' as const, text: `Error searching items: ${error.message}` }],
        isError: true,
      };
    }

    if (!data || data.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No items found matching the search query.' }],
      };
    }

    const results = data.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content?.substring(0, 2000),
      summary: item.summary,
      metadata: item.metadata,
      created_at: item.created_at,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} items (keyword match):\n${JSON.stringify(results, null, 2)}`,
      }],
    };
  }
);

/**
 * MCP tool: Keyword search items in a Spark (kept for exact-match needs)
 */
const searchSparkItems = tool(
  'search_spark_items',
  'Search for items by exact keyword match. Use semantic_search_spark_items instead for most queries. This is useful when you need to find items containing a specific word or phrase.',
  {
    query: z.string().describe('The exact keyword or phrase to search for'),
    spark_id: z.string().uuid().describe('The ID of the Spark to search in'),
  },
  async (args) => {
    const { data, error } = await supabaseAdmin
      .from('spark_items')
      .select('id, type, title, content, summary, metadata, created_at')
      .eq('spark_id', args.spark_id)
      .or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%,summary.ilike.%${args.query}%`)
      .limit(20);

    if (error) {
      return {
        content: [{ type: 'text' as const, text: `Error searching items: ${error.message}` }],
        isError: true,
      };
    }

    if (!data || data.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No items found matching the search query.' }],
      };
    }

    const results = data.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content?.substring(0, 2000),
      summary: item.summary,
      metadata: item.metadata,
      created_at: item.created_at,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

/**
 * MCP tool: List all items in a Spark
 */
const listSparkItems = tool(
  'list_spark_items',
  'List all items in the current Spark workspace. Returns all items with their content and metadata. Use this to get a complete overview of everything stored in the Spark.',
  {
    spark_id: z.string().uuid().describe('The ID of the Spark to list items from'),
  },
  async (args) => {
    const { data, error } = await supabaseAdmin
      .from('spark_items')
      .select('id, type, title, content, summary, metadata, created_at')
      .eq('spark_id', args.spark_id)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        content: [{ type: 'text' as const, text: `Error listing items: ${error.message}` }],
        isError: true,
      };
    }

    if (!data || data.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No items in this Spark yet.' }],
      };
    }

    const results = data.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content?.substring(0, 2000),
      summary: item.summary,
      metadata: item.metadata,
      created_at: item.created_at,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} items:\n${JSON.stringify(results, null, 2)}`,
      }],
    };
  }
);

/**
 * MCP tool: Get Spark details
 */
const getSparkDetails = tool(
  'get_spark_details',
  'Get the name, description, and metadata for the current Spark workspace.',
  {
    spark_id: z.string().uuid().describe('The ID of the Spark'),
  },
  async (args) => {
    const { data, error } = await supabaseAdmin
      .from('sparks')
      .select('*')
      .eq('id', args.spark_id)
      .single();

    if (error) {
      return {
        content: [{ type: 'text' as const, text: `Error getting spark: ${error.message}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    };
  }
);

/**
 * MCP tool: Get previously generated artifacts
 */
const listArtifacts = tool(
  'list_generated_artifacts',
  'List all previously generated business artifacts (CMS entries, campaign briefs) for this Spark.',
  {
    spark_id: z.string().uuid().describe('The ID of the Spark'),
  },
  async (args) => {
    const { data, error } = await supabaseAdmin
      .from('generated_artifacts')
      .select('*')
      .eq('spark_id', args.spark_id)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        content: [{ type: 'text' as const, text: `Error listing artifacts: ${error.message}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: data.length > 0
          ? JSON.stringify(data, null, 2)
          : 'No artifacts generated yet.',
      }],
    };
  }
);

/**
 * Create the MCP server with all Spark tools
 */
export function createSparkMcpServer() {
  return createSdkMcpServer({
    name: 'spark-tools',
    version: '1.0.0',
    tools: [semanticSearchSparkItems, searchSparkItems, listSparkItems, getSparkDetails, listArtifacts],
  });
}
