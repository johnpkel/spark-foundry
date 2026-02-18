import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from '@/lib/embeddings';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Spark Assistant, an AI helper for the Spark Foundry workspace — a platform built for Contentstack DXP users to collect, organize, and transform information into business artifacts.

## Your Capabilities
- Search and retrieve items stored in the Spark (links, images, text, files, notes)
- Answer questions about the collected information
- Identify patterns, connections, and insights across items
- Help generate business artifacts like Contentstack CMS entries and Campaign Briefs
- Summarize content and provide recommendations

## Guidelines
- Use the semantic_search tool when you need to find items related to a specific topic
- Be specific and reference actual items from the Spark when answering
- When generating content for Contentstack CMS, structure it with appropriate fields (title, body, SEO metadata, etc.)
- For Campaign Briefs, include: objective, target audience, key messages, channels, timeline, KPIs
- Keep responses concise but thorough
- Format responses in Markdown for readability
- If you're unsure about something, say so rather than making assumptions`;

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
];

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

  if (item.type === 'google_drive' && metadata?.drive_thumbnail_url) {
    const url = metadata.drive_thumbnail_url as string;
    return url.startsWith('http') ? url : null;
  }

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
  input: Record<string, string>
): Promise<Anthropic.ToolResultBlockParam['content']> {
  switch (name) {
    case 'semantic_search': {
      const queryEmbedding = await generateQueryEmbedding(input.query);
      if (queryEmbedding) {
        const { data, error } = await supabaseAdmin.rpc('match_spark_items', {
          p_spark_id: input.spark_id,
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
        .eq('spark_id', input.spark_id)
        .or(
          `title.ilike.%${input.query}%,content.ilike.%${input.query}%,summary.ilike.%${input.query}%`
        )
        .limit(10);
      return buildToolContent(kwData || [], `Found ${kwData?.length || 0} items (keyword match):`);
    }

    case 'keyword_search': {
      const { data } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata')
        .eq('spark_id', input.spark_id)
        .or(
          `title.ilike.%${input.query}%,content.ilike.%${input.query}%,summary.ilike.%${input.query}%`
        )
        .limit(20);
      return buildToolContent(data || [], `Found ${data?.length || 0} items:`);
    }

    case 'list_items': {
      const { data } = await supabaseAdmin
        .from('spark_items')
        .select('id, type, title, content, summary, metadata, created_at')
        .eq('spark_id', input.spark_id)
        .order('created_at', { ascending: false });
      if (!data?.length) return 'No items in this Spark yet.';
      return buildToolContent(data, `Found ${data.length} items:`);
    }

    case 'get_spark_details': {
      const { data } = await supabaseAdmin
        .from('sparks')
        .select('*')
        .eq('id', input.spark_id)
        .single();
      return JSON.stringify(data, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

interface RetrievedContext {
  text: string;
  images: Array<{ url: string; title: string }>;
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

  if (!queryEmbedding) {
    const { data } = await supabaseAdmin
      .from('spark_items')
      .select('type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return { text: '', images: [] };

    const items = data
      .map(
        (item, i) =>
          `${i + 1}. [${item.type}] ${item.title}\n${item.content?.substring(0, 500) || ''}\n${item.summary ? `Summary: ${item.summary}` : ''}`
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${items}`,
      images: extractImageUrls(data as Record<string, unknown>[]),
    };
  }

  const { data, error } = await supabaseAdmin.rpc('match_spark_items', {
    p_spark_id: sparkId,
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.25,
    match_count: 8,
  });

  if (error || !data || data.length === 0) {
    const { data: recent } = await supabaseAdmin
      .from('spark_items')
      .select('type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recent || recent.length === 0) return { text: '', images: [] };

    const items = recent
      .map(
        (item, i) =>
          `${i + 1}. [${item.type}] ${item.title}\n${item.content?.substring(0, 500) || ''}`
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${items}`,
      images: extractImageUrls(recent as Record<string, unknown>[]),
    };
  }

  const items = data
    .map((item: Record<string, unknown>, i: number) => {
      const similarity = ((item.similarity as number) * 100).toFixed(0);
      return `${i + 1}. [${item.type}] ${item.title} (${similarity}% match)\n${(item.content as string)?.substring(0, 800) || ''}\n${item.summary ? `Summary: ${item.summary}` : ''}`;
    })
    .join('\n\n');

  return {
    text: `\n\n## Retrieved Context (semantically relevant items)\nThe following items from this Spark are most relevant to the user's question:\n\n${items}`,
    images: extractImageUrls(data),
  };
}

// POST /api/chat - Chat with Claude Opus via RAG pipeline
export async function POST(request: NextRequest) {
  const { spark_id, message } = await request.json();

  if (!spark_id || !message) {
    return new Response(
      JSON.stringify({ error: 'spark_id and message are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Save the user message
  await supabaseAdmin.from('chat_messages').insert({
    spark_id,
    role: 'user',
    content: message,
  });

  // Retrieve relevant context via RAG
  const ragContext = await retrieveContext(spark_id, message);
  const systemPrompt = SYSTEM_PROMPT + ragContext.text;

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
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
          { role: 'user', content: userContent },
        ];

        let fullResponse = '';

        const TOOL_LABELS: Record<string, string> = {
          semantic_search: 'Searching your Spark...',
          keyword_search: 'Searching by keyword...',
          list_items: 'Loading items...',
          get_spark_details: 'Getting Spark details...',
        };

        // Phase 1: Tool-use rounds (non-streaming, text is suppressed anyway)
        for (let turn = 0; turn < 10; turn++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          });

          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          // No tool calls — time to stream the final response
          if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
            // Extract any text from this non-streamed response and send it
            for (const block of response.content) {
              if (block.type === 'text' && block.text) {
                fullResponse += block.text;
                send({ type: 'text', content: block.text });
              }
            }
            break;
          }

          // Send status events for tool calls
          for (const toolUse of toolUseBlocks) {
            send({ type: 'status', content: TOOL_LABELS[toolUse.name] || 'Processing...' });
          }

          // Execute tools
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUse) => ({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: await executeTool(
                toolUse.name,
                toolUse.input as Record<string, string>
              ),
            }))
          );

          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];

          // Phase 2: After tool execution, stream the response token-by-token
          send({ type: 'status', content: 'Generating response...' });

          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          });

          // Buffer text during streaming in case there are more tool calls
          const textBuffer: string[] = [];
          stream.on('text', (text) => {
            textBuffer.push(text);
          });

          const finalMessage = await stream.finalMessage();

          const finalToolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          if (finalMessage.stop_reason === 'end_turn' || finalToolUses.length === 0) {
            // Final turn — flush buffered text as streamed chunks
            for (const chunk of textBuffer) {
              fullResponse += chunk;
              send({ type: 'text', content: chunk });
            }
            break;
          }

          // More tool calls — discard text, execute tools, continue loop
          for (const toolUse of finalToolUses) {
            send({ type: 'status', content: TOOL_LABELS[toolUse.name] || 'Processing...' });
          }

          messages = [
            ...messages,
            { role: 'assistant', content: finalMessage.content },
            {
              role: 'user',
              content: await Promise.all(
                finalToolUses.map(async (toolUse) => ({
                  type: 'tool_result' as const,
                  tool_use_id: toolUse.id,
                  content: await executeTool(
                    toolUse.name,
                    toolUse.input as Record<string, string>
                  ),
                }))
              ),
            },
          ];
        }

        // Save the full response
        if (fullResponse) {
          await supabaseAdmin.from('chat_messages').insert({
            spark_id,
            role: 'assistant',
            content: fullResponse,
          });
        }

        send({ type: 'done' });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        send({ type: 'error', content: errorMessage });
      } finally {
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
