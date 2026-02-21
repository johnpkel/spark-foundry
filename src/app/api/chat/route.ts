import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from '@/lib/embeddings';
import type { VectorContextItem } from '@/lib/types';

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

  // Search both spark_items and chat_sessions in parallel
  const [itemsResult, sessionsResult] = await Promise.all([
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
  ]);

  const { data, error } = itemsResult;
  const { data: sessionData, error: sessionError } = sessionsResult;

  console.log('[retrieveContext] match_spark_items result:', { error: error?.message || null, count: data?.length || 0 });
  console.log('[retrieveContext] match_chat_sessions result:', { error: sessionError?.message || null, count: sessionData?.length || 0 });

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

  if (error || !data || data.length === 0) {
    console.log('[retrieveContext] Vector search failed/empty — falling back to recent items');
    const { data: recent } = await supabaseAdmin
      .from('spark_items')
      .select('type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recent || recent.length === 0) {
      if (sessionContextText) {
        return { text: sessionContextText, images: [], items: [] };
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
      text: `\n\n## Recent Items in This Spark\n${recentTexts}${sessionContextText}`,
      images: extractImageUrls(recent as Record<string, unknown>[]),
      items: [],
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
    text: `\n\n## Retrieved Context (semantically relevant items)\nThe following items from this Spark are most relevant to the user's question:\n\n${itemTexts}${sessionContextText}`,
    images: extractImageUrls(data),
    items: contextItems,
  };
}

// POST /api/chat - Chat with Claude Opus via RAG pipeline
export async function POST(request: NextRequest) {
  const { spark_id, message, session_id: requestSessionId, skip_persist } = await request.json();

  if (!spark_id || !message) {
    return new Response(
      JSON.stringify({ error: 'spark_id and message are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let sessionId: string | null = requestSessionId || null;
  let userMessageId: string | null = null;

  if (!skip_persist) {
    // Create a new session if none provided
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
      // Append user message to the existing session's user_messages array
      await supabaseAdmin.rpc('append_session_user_message', {
        p_session_id: sessionId,
        p_message: message,
      });
    }

    // Save the user message to chat_messages
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

  // Load conversation history from this session (for multi-turn context)
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
      // Reverse to chronological order (queried desc for limit efficiency)
      historyMessages = priorMessages.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    }
  }

  // Retrieve relevant context via RAG
  const ragContext = await retrieveContext(spark_id, message);
  console.log('[chat] RAG context:', { itemCount: ragContext.items.length, hasText: !!ragContext.text, imageCount: ragContext.images.length });
  const systemPrompt = SYSTEM_PROMPT + ragContext.text;

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
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
