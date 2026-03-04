import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding, generateEmbedding } from '@/lib/embeddings';
import { scrapePage } from '@/lib/scraper';
import { addLogEntry } from '@/lib/activity-logger';
import type { VectorContextItem } from '@/lib/types';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Spark analyst — a sharp, direct strategic advisor embedded in the Spark Foundry workspace. Your job is to evaluate ideas critically, surface genuine insights from the collected data, and push back when something does not hold up.

## How you operate
- Lead with your assessment. State your position, then support it with evidence from the Spark.
- Be honest about weak ideas. If a campaign concept, content angle, or strategy has problems, say so directly and explain why. Do not soften bad news.
- Keep it concise. Short paragraphs, no filler, no preamble. Get to the point.
- Use the semantic_search tool to find relevant items before answering. Reference specific items by name.
- Format in Markdown. No emojis.

## Generating artifacts
- Contentstack CMS entries: title, body, SEO metadata, and relevant fields.
- Campaign Briefs: objective, target audience, key messages, channels, timeline, KPIs.

## Citations
- When your answer draws on Spark items, include a **Sources** section at the end.
- Format: \`- **[Type] Title** — why it matters\`
- For items with URLs: \`- **[Type] [Title](url)** — key point\`
- Cite every item you relied on. Omit Sources only if the answer is purely from your own knowledge.

## Web research
- Use **web_search** for broad queries, **scrape_url** for deep reads of specific pages.
- After researching, **always call save_web_research** to persist findings for future conversations.
- Write a synthesized summary, not raw scraped text. Include source URLs.

## Ending every response
Always end with a **Next steps** section: 2-3 specific follow-up questions the user could ask to go deeper. Frame them as actionable questions, not vague suggestions.`;

// Tool definitions for the Anthropic API
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'semantic_search',
    description: 'Search for items in the Spark using semantic similarity. Finds conceptually related items even without exact keyword matches. Use this as your primary search tool.',
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
    description: 'Search for items by exact keyword or phrase match. Use when looking for a specific term.',
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
    description: 'List all items in the Spark. Use for a complete overview of everything collected.',
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
    description: 'Deep-read a specific webpage to extract its full text content, title, and description. Use this when you need detailed content from a known URL.',
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
    description: 'Save web research findings to the Spark for future reference. Always call this after completing web research to persist the findings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Descriptive title for the research' },
        query: { type: 'string', description: 'The original research question' },
        content: { type: 'string', description: 'Synthesized markdown research content' },
        summary: { type: 'string', description: 'Short summary (1-2 sentences) for quick reference' },
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

// Combined tools: our custom tools + Anthropic's server-hosted web_search
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 10,
};
const ALL_TOOLS: (Anthropic.Tool | Anthropic.WebSearchTool20250305)[] = [...TOOLS, WEB_SEARCH_TOOL];

const MAX_IMAGES_PER_RESULT = 5;

/** Extract image URL from a Spark item (image items + link items with OG image) */
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

  // Google Drive thumbnail URLs are session-authenticated and cannot be
  // fetched by Claude's API servers, so we skip them here.
  // The text metadata (title, summary) is still sent for context.

  return null;
}

/** Build multimodal tool result: JSON text + actual image blocks for image items */
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

  // Append actual image blocks so Claude can visually inspect them
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

// Execute a tool call and return multimodal content (text + images)
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<Anthropic.ToolResultBlockParam['content']> {
  switch (name) {
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
      // Fall through to keyword search
      const { data: kwData } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata')
        .eq('spark_id', sparkId)
        .or(
          `title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`
        )
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
        .or(
          `title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`
        )
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
      if (!result) {
        return JSON.stringify({ error: 'Failed to scrape page', url });
      }
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

      // Insert the research item
      const { data: researchItem, error: insertError } = await supabaseAdmin
        .from('web_research_items')
        .insert({ title, query, content, summary, sources })
        .select('id')
        .single();

      if (insertError || !researchItem) {
        console.error('[save_web_research] Insert failed:', insertError?.message);
        return JSON.stringify({ error: 'Failed to save research', details: insertError?.message });
      }

      // Link to Spark via join table
      const { error: joinError } = await supabaseAdmin
        .from('spark_web_research')
        .insert({ spark_id: sparkId, web_research_item_id: researchItem.id });

      if (joinError) {
        console.error('[save_web_research] Join insert failed:', joinError.message);
      }

      // Fire-and-forget: generate embedding
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
        .catch((err) => {
          console.error('[save_web_research] Embedding failed:', err);
        });

      return JSON.stringify({
        success: true,
        id: researchItem.id,
        message: `Research "${title}" saved and linked to Spark. Embedding generation in progress.`,
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

interface RetrievedContext {
  text: string;
  images: Array<{ url: string; title: string }>;
  items: VectorContextItem[];
}

/** Collect image URLs from a list of retrieved items */
function extractImageUrls(items: Record<string, unknown>[]): Array<{ url: string; title: string }> {
  return items
    .map((item) => {
      const url = getItemImageUrl(item);
      return url ? { url, title: item.title as string } : null;
    })
    .filter((img): img is { url: string; title: string } => img !== null)
    .slice(0, MAX_IMAGES_PER_RESULT);
}

/**
 * Retrieve the most relevant items from the Spark using vector similarity.
 * This provides automatic RAG context before Claude even starts thinking.
 * Returns both text (for system prompt) and image URLs (for user message).
 */
async function retrieveContext(
  sparkId: string,
  userMessage: string
): Promise<RetrievedContext> {
  const queryEmbedding = await generateQueryEmbedding(userMessage);
  console.log('[retrieveContext] queryEmbedding:', queryEmbedding ? `${queryEmbedding.length}-dim vector` : 'null');

  if (!queryEmbedding) {
    console.log('[retrieveContext] No embedding — falling back to recent items');
    const { data } = await supabaseAdmin
      .from('spark_items')
      .select('type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return { text: '', images: [], items: [] };

    const itemTexts = data
      .map(
        (item, i) =>
          `${i + 1}. [${item.type}] ${item.title}\n${item.content?.substring(0, 500) || ''}\n${item.summary ? `Summary: ${item.summary}` : ''}`
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${itemTexts}`,
      images: extractImageUrls(data as Record<string, unknown>[]),
      items: [],
    };
  }

  // Search spark_items, chat_sessions, and web_research in parallel
  const [itemsResult, sessionsResult, researchResult] = await Promise.all([
    supabaseAdmin.rpc('match_spark_items', {
      p_spark_id: sparkId,
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.25,
      match_count: 8,
    }),
    supabaseAdmin.rpc('match_chat_sessions', {
      p_spark_id: sparkId,
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.25,
      match_count: 5,
    }),
    supabaseAdmin.rpc('match_web_research_items', {
      p_spark_id: sparkId,
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.25,
      match_count: 3,
    }),
  ]);

  const { data, error } = itemsResult;
  const { data: sessionData, error: sessionError } = sessionsResult;
  const { data: researchData, error: researchError } = researchResult;

  console.log('[retrieveContext] match_spark_items result:', { error: error?.message || null, count: data?.length || 0 });
  console.log('[retrieveContext] match_chat_sessions result:', { error: sessionError?.message || null, count: sessionData?.length || 0 });
  console.log('[retrieveContext] match_web_research_items result:', { error: researchError?.message || null, count: researchData?.length || 0 });

  // Build chat session context text
  let sessionContextText = '';
  if (sessionData && sessionData.length > 0) {
    const sessionTexts = sessionData
      .map((session: Record<string, unknown>, i: number) => {
        const similarity = ((session.similarity as number) * 100).toFixed(0);
        const messages = session.user_messages as string[];
        const messageText = messages.map((m, j) => `  Message ${j + 1}: ${m}`).join('\n');
        return `${i + 1}. Chat: "${session.title}" (${similarity}% match)\n${messageText}`;
      })
      .join('\n\n');

    sessionContextText = `\n\n## Relevant Past Conversations\nThe following previous chat sessions in this Spark are relevant:\n\n${sessionTexts}`;
  }

  // Build web research context text
  let webResearchContextText = '';
  const webResearchContextItems: VectorContextItem[] = [];
  if (researchData && researchData.length > 0) {
    const researchTexts = researchData
      .map((r: Record<string, unknown>, i: number) => {
        const similarity = ((r.similarity as number) * 100).toFixed(0);
        const sources = (r.sources as Array<{ url: string; title: string }>) || [];
        const topSources = sources.slice(0, 3).map((s) => `  - ${s.title}: ${s.url}`).join('\n');
        return `${i + 1}. "${r.title}" (${similarity}% match)\n  Query: ${r.query}\n  Summary: ${r.summary || 'N/A'}\n  Sources:\n${topSources}`;
      })
      .join('\n\n');

    webResearchContextText = `\n\n## Relevant Past Web Research\nThe following web research saved in this Spark is relevant:\n\n${researchTexts}`;

    for (const r of researchData) {
      webResearchContextItems.push({
        id: r.id as string,
        type: 'web_research',
        title: r.title as string,
        similarity: r.similarity as number,
        summary: (r.summary as string) || null,
      });
    }
  }

  if (error || !data || data.length === 0) {
    console.log('[retrieveContext] Vector search failed/empty — falling back to recent items');
    const { data: recent } = await supabaseAdmin
      .from('spark_items')
      .select('type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recent || recent.length === 0) {
      if (sessionContextText || webResearchContextText) {
        return { text: sessionContextText + webResearchContextText, images: [], items: webResearchContextItems };
      }
      return { text: '', images: [], items: [] };
    }

    const recentTexts = recent
      .map(
        (item, i) =>
          `${i + 1}. [${item.type}] ${item.title}\n${item.content?.substring(0, 500) || ''}`
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${recentTexts}${sessionContextText}${webResearchContextText}`,
      images: extractImageUrls(recent as Record<string, unknown>[]),
      items: webResearchContextItems,
    };
  }

  const contextItems: VectorContextItem[] = data.map((item: Record<string, unknown>) => ({
    id: item.id as string,
    type: item.type as VectorContextItem['type'],
    title: item.title as string,
    similarity: item.similarity as number,
    summary: (item.summary as string) || null,
  }));

  const itemTexts = data
    .map((item: Record<string, unknown>, i: number) => {
      const similarity = ((item.similarity as number) * 100).toFixed(0);
      return `${i + 1}. [${item.type}] ${item.title} (${similarity}% match)\n${(item.content as string)?.substring(0, 800) || ''}\n${item.summary ? `Summary: ${item.summary}` : ''}`;
    })
    .join('\n\n');

  return {
    text: `\n\n## Retrieved Context (semantically relevant items)\nThe following items from this Spark are most relevant to the user's question:\n\n${itemTexts}${sessionContextText}${webResearchContextText}`,
    images: extractImageUrls(data),
    items: [...contextItems, ...webResearchContextItems],
  };
}

// POST /api/chat - Chat with Claude via RAG pipeline
export async function POST(request: NextRequest) {
  const {
    spark_id,
    message,
    session_id: requestSessionId,
    skip_persist,
    // Optional editor context injected by ChatPanel
    selected_text,
    editor_content,
    // Canvas scoped items — when present, these items ARE the primary context
    scoped_item_ids,
  } = await request.json();

  if (!spark_id || !message) {
    return new Response(
      JSON.stringify({ error: 'spark_id and message are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Return the SSE stream immediately so the first byte is sent before any
  // gateway timeout. All heavy work (DB, embedding, Anthropic) runs inside
  // the stream's start() callback while the connection is already open.
  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Send an SSE comment immediately to flush response headers through
      // the gateway. This prevents Contentstack Launch (or any reverse
      // proxy) from timing out while we do DB + embedding work.
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Periodic keepalive every 15s so long Anthropic calls don't
      // trip idle-connection timeouts.
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* stream closed */ }
      }, 15_000);

      try {
        // ── Session & persistence (runs inside stream) ──────────
        let sessionId: string | null = requestSessionId || null;
        let userMessageId: string | null = null;

        if (!skip_persist) {
          if (!sessionId) {
            const { data: newSession, error: sessionError } = await supabaseAdmin
              .from('chat_sessions')
              .insert({
                spark_id,
                title: message,
                user_messages: [message],
              })
              .select()
              .single();

            if (sessionError) {
              console.error('[chat] Failed to create session:', sessionError.message);
            }
            if (newSession) {
              sessionId = newSession.id;
            }
          } else {
            await supabaseAdmin.rpc('append_session_user_message', {
              p_session_id: sessionId,
              p_message: message,
            });
          }

          const { data: savedMsg } = await supabaseAdmin
            .from('chat_messages')
            .insert({
              spark_id,
              session_id: sessionId,
              role: 'user',
              content: message,
            })
            .select('id')
            .single();

          userMessageId = savedMsg?.id || null;
        }

        // ── Conversation history ────────────────────────────────
        let historyMessages: Anthropic.MessageParam[] = [];
        if (sessionId && !skip_persist && userMessageId) {
          const { data: priorMessages } = await supabaseAdmin
            .from('chat_messages')
            .select('role, content')
            .eq('session_id', sessionId)
            .neq('id', userMessageId)
            .in('role', ['user', 'assistant'])
            .order('created_at', { ascending: false })
            .limit(30);

          if (priorMessages && priorMessages.length > 0) {
            historyMessages = priorMessages.reverse().map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          }
        }

        // ── RAG context retrieval ───────────────────────────────
        send({ type: 'status', content: 'Searching knowledge base...' });

        let ragContext: RetrievedContext;

        if (Array.isArray(scoped_item_ids) && scoped_item_ids.length > 0) {
          const { data: scopedItems, error: scopedError } = await supabaseAdmin
            .from('spark_items')
            .select('id, type, title, content, summary, metadata')
            .in('id', scoped_item_ids);

          if (scopedError) {
            console.error('[chat] scoped item fetch error:', scopedError.message);
          }

          const items = scopedItems || [];
          const itemTexts = items
            .map((item, i) => {
              const meta = item.metadata as Record<string, unknown> | null;
              const parts: string[] = [`${i + 1}. [${item.type}] ${item.title}`];
              if (item.content) parts.push((item.content as string).substring(0, 2000));
              if (item.summary) parts.push(`Summary: ${item.summary}`);
              if (meta) {
                if (meta.url) parts.push(`URL: ${meta.url}`);
                if (meta.og_description) parts.push(`Description: ${meta.og_description}`);
                if (meta.slack_channel_name) parts.push(`Slack channel: #${meta.slack_channel_name}`);
                if (meta.slack_sender_name) parts.push(`Started by: ${meta.slack_sender_name}`);
                if (meta.slack_message_count) parts.push(`Messages: ${meta.slack_message_count}`);
                if (meta.slack_permalink) parts.push(`Permalink: ${meta.slack_permalink}`);
                if (meta.drive_web_view_link) parts.push(`Drive link: ${meta.drive_web_view_link}`);
                if (meta.cs_content_type_title) parts.push(`Content Type: ${meta.cs_content_type_title}`);
                if (meta.cs_stack_name) parts.push(`Stack: ${meta.cs_stack_name}`);
                if (meta.cs_entry_url) parts.push(`Entry URL: ${meta.cs_entry_url}`);
                if (meta.tags && Array.isArray(meta.tags)) parts.push(`Tags: ${(meta.tags as string[]).join(', ')}`);
              }
              return parts.join('\n');
            })
            .join('\n\n');

          ragContext = {
            text: items.length > 0
              ? `\n\n## Focused Items (user-selected on canvas)\nThe user is asking specifically about these ${items.length} items. They deliberately selected each one, so you MUST reference every item in your response — include all of them in your Sources section. If an item seems less relevant, still acknowledge it and explain how it relates (or note what it contains). Do not reference other items unless the user asks you to search more broadly.\n\n${itemTexts}`
              : '',
            images: extractImageUrls(items as Record<string, unknown>[]),
            items: items.map((item) => ({
              id: item.id,
              type: item.type as VectorContextItem['type'],
              title: item.title,
              similarity: 1,
              summary: (item.summary as string) || null,
            })),
          };

          addLogEntry({
            service: 'supabase',
            direction: 'event',
            level: 'info',
            summary: `Scoped context: ${items.length} item${items.length !== 1 ? 's' : ''} fetched directly`,
          });
        } else {
          ragContext = await retrieveContext(spark_id, message);
          addLogEntry({
            service: 'supabase',
            direction: 'event',
            level: 'info',
            summary: `RAG: matched ${ragContext.items.length} item${ragContext.items.length !== 1 ? 's' : ''}, ${ragContext.images.length} image${ragContext.images.length !== 1 ? 's' : ''}`,
          });
        }

        // ── Editor context ──────────────────────────────────────
        let editorContextSection = '';

        if (editor_content && typeof editor_content === 'string' && editor_content.trim().length > 10) {
          const truncated = editor_content.slice(0, 8000);
          editorContextSection += `\n\n---\n## Active Spark Document\nThe user is editing a document in the Spark Editor. The current document content is below. You can reference it, answer questions about it, and suggest edits.\n\n${truncated}`;
          if (editor_content.length > 8000) {
            editorContextSection += '\n\n*(Document truncated — showing first 8,000 characters)*';
          }
        }

        if (selected_text && typeof selected_text === 'string' && selected_text.trim().length > 0) {
          editorContextSection += `\n\n## Selected Text\nThe user has highlighted the following text in the document and is asking about it specifically:\n\n> ${selected_text}\n\nWhen you suggest an improvement, rewrite, or replacement for this text, format your replacement inside a fenced code block with the language identifier \`proposal\` — like this:\n\n\`\`\`proposal\nYour replacement text here\n\`\`\`\n\nProvide exactly one \`proposal\` block per response when suggesting edits. Explain your changes in plain text outside the block. Use the RAG pipeline (semantic_search tool) to support your suggestions with context from the Spark's knowledge base where relevant.`;
        }

        const systemPrompt = SYSTEM_PROMPT + ragContext.text + editorContextSection;

        // Send context items to client for 3D visualization (before any tool use/text)
        if (ragContext.items.length > 0) {
          send({ type: 'context', items: ragContext.items });
        }

        // Build multimodal user message: text + any images from RAG context
        const userContent: Anthropic.ContentBlockParam[] = [
          { type: 'text', text: `[Spark ID: ${spark_id}]\n\n${message}` },
        ];
        for (const img of ragContext.images) {
          userContent.push(
            { type: 'image', source: { type: 'url', url: img.url } },
            { type: 'text', text: `(Contextual image: "${img.title}")` }
          );
        }

        let messages: Anthropic.MessageParam[] = [
          ...historyMessages,
          { role: 'user', content: userContent },
        ];

        let fullResponse = '';

        const TOOL_LABELS: Record<string, string> = {
          semantic_search: 'Searching your Spark...',
          keyword_search: 'Searching by keyword...',
          list_items: 'Loading items...',
          get_spark_details: 'Getting Spark details...',
          scrape_url: 'Reading webpage...',
          save_web_research: 'Saving research...',
          web_search: 'Searching the web...',
        };

        // Phase 1: Tool-use rounds (non-streaming, text is suppressed anyway)
        for (let turn = 0; turn < 10; turn++) {
          const anthropicStart = Date.now();
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: systemPrompt,
            tools: ALL_TOOLS,
            messages,
          });
          addLogEntry({
            service: 'anthropic',
            direction: 'response',
            level: 'info',
            summary: `messages.create — ${response.stop_reason} (in:${response.usage.input_tokens} out:${response.usage.output_tokens})`,
            duration: Date.now() - anthropicStart,
            requestBody: { model: response.model, toolCount: ALL_TOOLS.length, turn },
            responseBody: { stop_reason: response.stop_reason, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
          });

          // Detect custom tool_use blocks (our tools)
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          // Detect server_tool_use blocks (Anthropic-hosted like web_search)
          const serverToolUseBlocks = response.content.filter(
            (b) => b.type === 'server_tool_use'
          );

          // Send status events for server tool calls
          for (const stb of serverToolUseBlocks) {
            const name = (stb as unknown as { name: string }).name;
            send({ type: 'status', content: TOOL_LABELS[name] || 'Processing...' });
          }

          // No custom tool calls — check if this is a final response
          if (toolUseBlocks.length === 0) {
            if (response.stop_reason === 'end_turn') {
              // Re-request with streaming so the user sees tokens arrive
              // incrementally instead of a single text dump.
              send({ type: 'status', content: 'Generating response...' });

              const streamStart = Date.now();
              addLogEntry({
                service: 'anthropic',
                direction: 'request',
                level: 'info',
                summary: 'messages.stream (no tools, re-request for streaming)',
                requestBody: { model: 'claude-sonnet-4-6', stream: true, turn },
              });

              const noToolStream = anthropic.messages.stream({
                model: 'claude-sonnet-4-6',
                max_tokens: 2048,
                system: systemPrompt,
                tools: ALL_TOOLS,
                messages,
              });

              noToolStream.on('text', (text) => {
                fullResponse += text;
                send({ type: 'text', content: text });
              });

              const noToolFinal = await noToolStream.finalMessage();
              addLogEntry({
                service: 'anthropic',
                direction: 'response',
                level: 'info',
                summary: `messages.stream — ${noToolFinal.stop_reason} (in:${noToolFinal.usage.input_tokens} out:${noToolFinal.usage.output_tokens})`,
                duration: Date.now() - streamStart,
                responseBody: { stop_reason: noToolFinal.stop_reason, input_tokens: noToolFinal.usage.input_tokens, output_tokens: noToolFinal.usage.output_tokens },
              });

              break;
            }
            // Server tools were used — their results are auto-included by Anthropic.
            // Continue the loop with the full response content so server_tool_result
            // blocks are passed back correctly.
            messages = [
              ...messages,
              { role: 'assistant', content: response.content },
            ];
            continue;
          }

          // Send status events for custom tool calls
          for (const toolUse of toolUseBlocks) {
            send({ type: 'status', content: TOOL_LABELS[toolUse.name] || 'Processing...' });
          }

          // Execute custom tools
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUse) => {
              addLogEntry({
                service: 'internal',
                direction: 'event',
                level: 'info',
                summary: `Tool: ${toolUse.name}`,
                requestBody: toolUse.input,
              });
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: await executeTool(
                  toolUse.name,
                  toolUse.input as Record<string, unknown>
                ),
              };
            })
          );

          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];

          // Phase 2: After tool execution, stream the response token-by-token
          send({ type: 'status', content: 'Generating response...' });

          const streamStart = Date.now();
          addLogEntry({
            service: 'anthropic',
            direction: 'request',
            level: 'info',
            summary: `messages.stream (after ${toolUseBlocks.length} tool${toolUseBlocks.length !== 1 ? 's' : ''})`,
            requestBody: { model: 'claude-sonnet-4-6', stream: true },
          });

          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: systemPrompt,
            tools: ALL_TOOLS,
            messages,
          });

          // Stream text to client in real-time as tokens arrive
          stream.on('text', (text) => {
            fullResponse += text;
            send({ type: 'text', content: text });
          });

          const finalMessage = await stream.finalMessage();
          addLogEntry({
            service: 'anthropic',
            direction: 'response',
            level: 'info',
            summary: `messages.stream — ${finalMessage.stop_reason} (in:${finalMessage.usage.input_tokens} out:${finalMessage.usage.output_tokens})`,
            duration: Date.now() - streamStart,
            responseBody: { stop_reason: finalMessage.stop_reason, input_tokens: finalMessage.usage.input_tokens, output_tokens: finalMessage.usage.output_tokens },
          });

          const finalToolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          // Also check for server tool uses in the streamed response
          const finalServerToolUses = finalMessage.content.filter(
            (b) => b.type === 'server_tool_use'
          );
          for (const stb of finalServerToolUses) {
            const name = (stb as unknown as { name: string }).name;
            send({ type: 'status', content: TOOL_LABELS[name] || 'Processing...' });
          }

          if (finalToolUses.length === 0) {
            if (finalMessage.stop_reason === 'end_turn') {
              break;
            }
            // Server tools only — continue loop
            messages = [
              ...messages,
              { role: 'assistant', content: finalMessage.content },
            ];
            continue;
          }

          // More custom tool calls — execute tools, continue loop
          for (const toolUse of finalToolUses) {
            send({ type: 'status', content: TOOL_LABELS[toolUse.name] || 'Processing...' });
          }

          messages = [
            ...messages,
            { role: 'assistant', content: finalMessage.content },
            {
              role: 'user',
              content: await Promise.all(
                finalToolUses.map(async (toolUse) => {
                  addLogEntry({
                    service: 'internal',
                    direction: 'event',
                    level: 'info',
                    summary: `Tool: ${toolUse.name}`,
                    requestBody: toolUse.input,
                  });
                  return {
                    type: 'tool_result' as const,
                    tool_use_id: toolUse.id,
                    content: await executeTool(
                      toolUse.name,
                      toolUse.input as Record<string, unknown>
                    ),
                  };
                })
              ),
            },
          ];
        }

        // Save the full response
        let assistantMessageId: string | null = null;
        if (fullResponse && !skip_persist) {
          const { data: savedAssistant } = await supabaseAdmin
            .from('chat_messages')
            .insert({
              spark_id,
              session_id: sessionId,
              role: 'assistant',
              content: fullResponse,
            })
            .select('id')
            .single();

          assistantMessageId = savedAssistant?.id || null;

          // Update session timestamp
          if (sessionId) {
            await supabaseAdmin
              .from('chat_sessions')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', sessionId);
          }

          // Embed the session (all user messages combined)
          if (sessionId) {
            const baseUrl = request.nextUrl.origin;
            await fetch(`${baseUrl}/api/chat/embed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sessionId }),
            }).catch(() => {
              // Embedding is best-effort
            });
          }
        }

        send({ type: 'done', session_id: sessionId });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        send({ type: 'error', content: errorMessage });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
