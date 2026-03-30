import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from '@/lib/embeddings';
import { addLogEntry } from '@/lib/activity-logger';
import type { VectorContextItem } from '@/lib/types';
import {
  ALL_TOOLS, TOOL_LABELS, executeTool,
  isWriteTool, summarizeToolInput, describeWriteOperation, summarizeToolResult,
} from '@/lib/agent/tools-registry';
import {
  computeTurnBudget, ThoughtStreamParser,
  AGENTIC_SYSTEM_PROMPT, CMS_SYSTEM_PROMPT,
} from '@/lib/agent/react-loop';
import { requestApproval } from '@/lib/agent/approval';

export const dynamic = 'force-dynamic';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Spark analyst — a sharp, direct strategic advisor embedded in the Spark Foundry workspace. Your job is to evaluate ideas critically, surface genuine insights from the collected data, and push back when something does not hold up.

## How you operate
- Lead with your assessment. State your position, then support it with evidence from the Spark.
- Be honest about weak ideas. If a campaign concept, content angle, or strategy has problems, say so directly and explain why. Do not soften bad news.
- Keep it concise. Short paragraphs, no filler, no preamble. Get to the point.
- When a user's message contains multiple options or alternatives (e.g. "X or Y", "either A or B"), ask the user which one they'd like before proceeding. If the user explicitly confirms they want all options (e.g. "do all of them", "try everything", "both"), proceed with all of them.
- Use the semantic_search tool to find relevant items before answering. Reference specific items by name.
- When image items appear in context, you can see them and should describe or reason about their visual content. Image descriptions, OCR text, and detected objects from image analysis are included in the context when available.
- Format in Markdown. No emojis.

## Groups
Users organize Spark items into named groups. When groups are @-mentioned:
- Treat each group as a distinct, cohesive unit. The items in a group represent a curated collection with a shared purpose.
- When asked to compare groups, analyze each group's aggregate data separately, then compare across groups. Do not mix items across group boundaries.
- Reference the group name when discussing its items (e.g. "In the DACH Campaign group...").

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

## Length
Aim for 100-200 words. Only exceed this for full artifacts (campaign briefs, CMS entries). No bullet lists longer than 5 items. No introductory sentences — start with the substance.

## Ending every response
End with **Next steps** — 2-3 specific follow-up questions the user could ask next. These become clickable chips in the UI, so:
- Each item must be about ONE action. Never combine alternatives with "or" in a single item — split them into separate items instead.
- Keep them short.

## Creating Skills
When a user asks to "save this as a skill", "turn this into a skill", or wants to save a workflow for reuse, use the draft_skill tool. Distill the conversation into clean, reusable instructions with clear trigger phrases in the description. Extract context-dependent values as {{variables}} with sensible defaults.${CMS_SYSTEM_PROMPT}`;

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
 * Extract image analysis text from item metadata for use in context formatting.
 * This ensures Claude has access to Vision-generated descriptions of images.
 */
function formatImageAnalysis(meta: Record<string, unknown> | null): string[] {
  if (!meta?.image_analysis) return [];
  const ia = meta.image_analysis as {
    full_description?: string;
    ocr_text?: string;
    objects?: string[];
    scene_description?: string;
    short_summary?: string;
  };
  const parts: string[] = [];
  if (ia.full_description) parts.push(`Image description: ${ia.full_description}`);
  if (ia.ocr_text) parts.push(`Text in image: ${ia.ocr_text}`);
  if (ia.objects?.length) parts.push(`Objects: ${ia.objects.join(', ')}`);
  if (ia.scene_description) parts.push(`Scene: ${ia.scene_description}`);
  return parts;
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
      .select('id, type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return { text: '', images: [], items: [] };

    const itemTexts = data
      .map(
        (item, i) => {
          const meta = item.metadata as Record<string, unknown> | null;
          const parts = [`${i + 1}. [${item.type}] ${item.title}`];
          if (item.content) parts.push(item.content.substring(0, 500));
          if (item.summary) parts.push(`Summary: ${item.summary}`);
          parts.push(...formatImageAnalysis(meta));
          return parts.join('\n');
        }
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${itemTexts}`,
      images: extractImageUrls(data as Record<string, unknown>[]),
      items: data.map((item, i) => ({
        id: item.id as string,
        type: item.type as VectorContextItem['type'],
        title: item.title as string,
        similarity: 0.5 - i * 0.05,
        summary: (item.summary as string) || null,
      })),
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
      .select('id, type, title, content, summary, metadata')
      .eq('spark_id', sparkId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recent || recent.length === 0) {
      if (sessionContextText || webResearchContextText) {
        return { text: sessionContextText + webResearchContextText, images: [], items: webResearchContextItems };
      }
      return { text: '', images: [], items: [] };
    }

    const recentItems: VectorContextItem[] = recent.map((item, i) => ({
      id: item.id as string,
      type: item.type as VectorContextItem['type'],
      title: item.title as string,
      similarity: 0.5 - i * 0.05,
      summary: (item.summary as string) || null,
    }));

    const recentTexts = recent
      .map(
        (item, i) => {
          const meta = item.metadata as Record<string, unknown> | null;
          const parts = [`${i + 1}. [${item.type}] ${item.title}`];
          if (item.content) parts.push(item.content.substring(0, 500));
          if (item.summary) parts.push(`Summary: ${item.summary}`);
          parts.push(...formatImageAnalysis(meta));
          return parts.join('\n');
        }
      )
      .join('\n\n');

    return {
      text: `\n\n## Recent Items in This Spark\n${recentTexts}${sessionContextText}${webResearchContextText}`,
      images: extractImageUrls(recent as Record<string, unknown>[]),
      items: [...recentItems, ...webResearchContextItems],
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
      const meta = item.metadata as Record<string, unknown> | null;
      const parts = [`${i + 1}. [${item.type}] ${item.title} (${similarity}% match)`];
      if (item.content) parts.push((item.content as string).substring(0, 800));
      if (item.summary) parts.push(`Summary: ${item.summary}`);
      parts.push(...formatImageAnalysis(meta));
      return parts.join('\n');
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
    // @ mentioned items — these supplement RAG with extra weight
    mentioned_item_ids,
    // @ mentioned groups — preserves group boundaries for structured context
    mentioned_groups,
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
                parts.push(...formatImageAnalysis(meta));
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

        // ── @ Mentioned items — supplement RAG with extra weight ──
        if (Array.isArray(mentioned_item_ids) && mentioned_item_ids.length > 0) {
          const { data: mentionedItems, error: mentionError } = await supabaseAdmin
            .from('spark_items')
            .select('id, type, title, content, summary, metadata')
            .in('id', mentioned_item_ids);

          if (mentionError) {
            console.error('[chat] mentioned item fetch error:', mentionError.message);
          }

          const mItems = mentionedItems || [];
          if (mItems.length > 0) {
            // Filter out items already in RAG context to avoid duplication
            const existingIds = new Set(ragContext.items.map(i => i.id));
            const newItems = mItems.filter(i => !existingIds.has(i.id));

            if (newItems.length > 0) {
              const formatItem = (item: typeof newItems[number], idx: number) => {
                const meta = item.metadata as Record<string, unknown> | null;
                const parts: string[] = [`${idx + 1}. [${item.type}] ${item.title}`];
                if (item.content) parts.push((item.content as string).substring(0, 2000));
                if (item.summary) parts.push(`Summary: ${item.summary}`);
                if (meta?.url) parts.push(`URL: ${meta.url}`);
                parts.push(...formatImageAnalysis(meta));
                return parts.join('\n');
              };

              const typedGroups = Array.isArray(mentioned_groups)
                ? (mentioned_groups as { id: string; name: string; itemIds: string[] }[])
                : [];
              const hasGroups = typedGroups.length > 0;

              if (hasGroups) {
                // Build group-aware context that preserves boundaries
                const groupItemIdSets = typedGroups.map(g => new Set(g.itemIds));
                const allGroupItemIds = new Set(typedGroups.flatMap(g => g.itemIds));

                // Items not belonging to any group
                const ungroupedItems = newItems.filter(i => !allGroupItemIds.has(i.id));

                let mentionText = '';

                for (const [gi, group] of typedGroups.entries()) {
                  const groupItems = newItems.filter(i => groupItemIdSets[gi].has(i.id));
                  if (groupItems.length === 0) continue;
                  mentionText += `\n### Group: "${group.name}" (${groupItems.length} items)\nThe following items belong to the "${group.name}" group. Treat them as a cohesive unit.\n\n`;
                  mentionText += groupItems.map((item, i) => formatItem(item, i)).join('\n\n');
                  mentionText += '\n';
                }

                if (ungroupedItems.length > 0) {
                  mentionText += `\n### Individually Mentioned Items\n\n`;
                  mentionText += ungroupedItems.map((item, i) => formatItem(item, i)).join('\n\n');
                }

                ragContext.text += `\n\n## Mentioned Items & Groups (explicitly referenced by the user with @)\nThe user mentioned specific groups and/or items. Each group is a curated collection — respect group boundaries when comparing or analyzing. If the user asks about differences between groups, compare the aggregate data of each group separately.\n${mentionText}`;
              } else {
                // No groups — flat list as before
                const mentionTexts = newItems.map((item, i) => formatItem(item, i)).join('\n\n');
                ragContext.text += `\n\n## Mentioned Items (explicitly referenced by the user with @)\nThe user specifically mentioned these items in their message. Give them extra attention and be sure to reference them in your response.\n\n${mentionTexts}`;
              }

              // Add mentioned items to the context items list
              for (const item of newItems) {
                ragContext.items.push({
                  id: item.id,
                  type: item.type as VectorContextItem['type'],
                  title: item.title,
                  similarity: 1, // Max relevance for explicitly mentioned items
                  summary: (item.summary as string) || null,
                });
              }

              // Add any images from mentioned items
              ragContext.images.push(...extractImageUrls(newItems as Record<string, unknown>[]));
            }

            addLogEntry({
              service: 'supabase',
              direction: 'event',
              level: 'info',
              summary: `@ Mentions: ${mItems.length} item${mItems.length !== 1 ? 's' : ''} in ${Array.isArray(mentioned_groups) ? mentioned_groups.length : 0} group(s) injected into context`,
            });
          }
        }

        // ── Editor context ──────────────────────────────────────
        let editorContextSection = '';

        if (editor_content && typeof editor_content === 'string' && editor_content.trim().length > 10) {
          const truncated = editor_content.slice(0, 8000);
          editorContextSection += `\n\n---\n## Active Spark Document\nThe user is editing a document in the Spark Editor. The current document content is shown below **in Markdown format** — headings, bold, italics, task lists (\`- [x]\` / \`- [ ]\`), bullet lists, and other formatting are preserved. When producing content for the editor, reproduce this formatting accurately (e.g. use \`- [x]\` for checked tasks, not plain bullets). Lines like \`<!-- group: ... -->\` and \`<!-- drawing -->\` are special embedded blocks — preserve them in place and do not modify them.\n\n${truncated}`;
          if (editor_content.length > 8000) {
            editorContextSection += '\n\n*(Document truncated — showing first 8,000 characters)*';
          }
        }

        if (selected_text && typeof selected_text === 'string' && selected_text.trim().length > 0) {
          editorContextSection += `\n\n## Selected Text\nThe user has highlighted the following text in the document and is asking about it specifically:\n\n> ${selected_text}\n\nWhen you suggest an improvement, rewrite, or replacement for this text, format your replacement inside a fenced code block with the language identifier \`proposal\` — like this:\n\n\`\`\`proposal\nYour replacement text here\n\`\`\`\n\nProvide exactly one \`proposal\` block per response when suggesting edits. Explain your changes in plain text outside the block. Use the RAG pipeline (semantic_search tool) to support your suggestions with context from the Spark's knowledge base where relevant.`;
        }

        // Editor tool instructions — only when editor content exists and no text is selected
        if (editor_content && typeof editor_content === 'string' && editor_content.trim().length > 10
            && !(selected_text && typeof selected_text === 'string' && selected_text.trim().length > 0)) {
          editorContextSection += `\n\n## Editor Tool
When the user asks you to modify their document, use the \`update_editor\` tool.

Mode selection:
- **append**: "add a section", "add to the bottom", "write a conclusion". Preserves existing content.
- **integrate**: "integrate this into the document", "rewrite to include", "merge into". You MUST produce the COMPLETE final document. Read existing content carefully and produce an elevated, cohesive result.
- **insert_after**: "add after the introduction", "insert after [heading]". Set target_heading to the heading text.

Content format: Well-formatted Markdown. Preserve formatting from the existing document — use \`- [x]\` / \`- [ ]\` for task lists, \`#\` for headings, \`**bold**\`, etc. Keep \`<!-- group: ... -->\` and \`<!-- drawing -->\` markers in place when using integrate mode. Do NOT use this tool when the user just asks a question about the document or when they have selected text (use \`\`\`proposal\`\`\` blocks for selected text edits).`;
        }

        // ── Skills metadata (progressive disclosure: Level 1) ───
        let skillsPromptSection = '';
        const { data: activeSkills } = await supabaseAdmin
          .from('skills')
          .select('id, name, description')
          .or(`spark_id.eq.${spark_id},spark_id.is.null`)
          .eq('is_active', true);

        if (activeSkills && activeSkills.length > 0) {
          const skillList = activeSkills
            .map((s: { id: string; name: string; description: string }) =>
              `- **${s.name}** (id: ${s.id}): ${s.description}`)
            .join('\n');
          skillsPromptSection = `\n\n## Available Skills\nThe following skills are available. When a user request matches a skill, call the \`use_skill\` tool with the skill's id to load its full instructions before proceeding.\n\n${skillList}`;
        }

        // ── Build prompts ───────────────────────────────────────
        const turnBudget = computeTurnBudget(message);
        const isAgentic = turnBudget > 4;
        const systemPrompt = SYSTEM_PROMPT + ragContext.text + editorContextSection
          + skillsPromptSection
          + (isAgentic ? AGENTIC_SYSTEM_PROMPT : '');
        const maxTokens = isAgentic ? 4096 : 1024;

        // Send context items to client for 3D visualization (before any tool use/text)
        send({ type: 'context', items: ragContext.items });

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
        const agentSteps: { type: string; content: string; tool?: string; summary?: string; success?: boolean; turn?: number }[] = [];
        const cumulativeTokens = { input: 0, output: 0 };

        // ── ReAct streaming loop ────────────────────────────────
        for (let turn = 0; turn < turnBudget; turn++) {
          send({ type: 'status', content: turn === 0 ? 'Generating response...' : 'Thinking...' });
          send({ type: 'budget', used: turn, total: turnBudget, tokens_used: cumulativeTokens.input + cumulativeTokens.output });

          const streamStart = Date.now();
          addLogEntry({
            service: 'anthropic',
            direction: 'request',
            level: 'info',
            summary: `messages.stream (turn ${turn}/${turnBudget})`,
            requestBody: { model: 'claude-sonnet-4-6', stream: true, turn, turnBudget },
          });

          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system: systemPrompt,
            tools: ALL_TOOLS,
            messages,
          });

          // Route streaming text through ThoughtStreamParser when agentic
          let currentThought = '';
          const parser = new ThoughtStreamParser();
          parser.onThought = (text) => {
            currentThought += text;
            send({ type: 'thought', content: text, turn });
          };
          parser.onText = (text) => {
            // Finalize accumulated thought before switching to text
            if (currentThought) {
              agentSteps.push({ type: 'thought', content: currentThought, turn });
              currentThought = '';
            }
            fullResponse += text;
            send({ type: 'text', content: text });
          };

          stream.on('text', (text) => {
            if (isAgentic) {
              parser.feed(text);
            } else {
              fullResponse += text;
              send({ type: 'text', content: text });
            }
          });

          const response = await stream.finalMessage();
          if (isAgentic) {
            parser.flush();
            if (currentThought) {
              agentSteps.push({ type: 'thought', content: currentThought, turn });
              currentThought = '';
            }
          }

          // Track token usage
          cumulativeTokens.input += response.usage.input_tokens;
          cumulativeTokens.output += response.usage.output_tokens;

          addLogEntry({
            service: 'anthropic',
            direction: 'response',
            level: 'info',
            summary: `messages.stream — ${response.stop_reason} (in:${response.usage.input_tokens} out:${response.usage.output_tokens})`,
            duration: Date.now() - streamStart,
            responseBody: { stop_reason: response.stop_reason, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
          });

          // Detect tool calls
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );
          const serverToolUseBlocks = response.content.filter(
            (b) => b.type === 'server_tool_use'
          );

          for (const stb of serverToolUseBlocks) {
            const name = (stb as unknown as { name: string }).name;
            send({ type: 'status', content: TOOL_LABELS[name] || 'Processing...' });
          }

          // No custom tool calls — done or server-tools-only
          if (toolUseBlocks.length === 0) {
            if (response.stop_reason === 'end_turn') break;
            // Only append assistant message if no unpaired server_tool_use blocks
            // (Anthropic's infrastructure pairs server tool calls transparently)
            const hasServerTools = response.content.some(b => b.type === 'server_tool_use');
            if (!hasServerTools) {
              messages = [
                ...messages,
                { role: 'assistant', content: response.content },
              ];
            }
            continue;
          }

          // Execute custom tools (sequential with approval gates for writes)
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            const toolName = toolUse.name;
            const toolInput = toolUse.input as Record<string, unknown>;

            const actionSummary = summarizeToolInput(toolName, toolInput);
            send({
              type: 'action',
              tool: toolName,
              input: actionSummary,
              skill_name: toolName === 'use_skill'
                ? activeSkills?.find((s: { id: string; name: string }) => s.id === toolInput.skill_id)?.name
                : undefined,
              turn,
            });
            agentSteps.push({ type: 'action', content: actionSummary, tool: toolName, turn });
            send({ type: 'status', content: TOOL_LABELS[toolName] || 'Processing...' });

            addLogEntry({
              service: 'internal',
              direction: 'event',
              level: 'info',
              summary: `Tool: ${toolName}`,
              requestBody: toolInput,
            });

            // Approval gate for write/destructive tools
            if (isWriteTool(toolName, toolInput)) {
              const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              send({
                type: 'approval_request',
                id: approvalId,
                tool: toolName,
                description: describeWriteOperation(toolName, toolInput),
                preview: toolInput,
                turn,
              });

              const approved = await requestApproval(approvalId);

              if (!approved) {
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: JSON.stringify({ rejected: true, message: 'User declined this operation.' }),
                });
                send({
                  type: 'observation',
                  tool: toolName,
                  summary: 'User declined this operation.',
                  success: false,
                  turn,
                });
                agentSteps.push({ type: 'observation', content: 'User declined this operation.', tool: toolName, summary: 'User declined this operation.', success: false, turn });
                continue;
              }
            }

            // ── Client-side draft_skill tool: send SSE event instead of executing ──
            if (toolName === 'draft_skill') {
              send({
                type: 'skill_draft',
                name: toolInput.name,
                description: toolInput.description,
                instructions: toolInput.instructions,
                variables: toolInput.variables || [],
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ success: true, message: 'Skill draft sent to Skills panel for review. The user can edit and save it.' }),
              });
              send({ type: 'observation', tool: toolName, summary: 'Skill draft sent to panel', success: true, turn });
              agentSteps.push({ type: 'observation', content: 'Skill draft sent to panel', tool: toolName, summary: 'Skill draft sent to panel', success: true, turn });
              continue;
            }

            // ── Client-side editor tool: send SSE event instead of executing ──
            if (toolName === 'update_editor') {
              send({
                type: 'editor_update',
                mode: toolInput.mode,
                content: toolInput.content,
                target_heading: toolInput.target_heading || null,
                description: toolInput.description || 'Update document',
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ success: true, message: `Document updated (${toolInput.mode})` }),
              });
              send({ type: 'observation', tool: toolName, summary: `Applied to editor (${toolInput.mode})`, success: true, turn });
              agentSteps.push({ type: 'observation', content: `Applied to editor (${toolInput.mode})`, tool: toolName, summary: `Applied to editor (${toolInput.mode})`, success: true, turn });
              continue;
            }

            try {
              const result = await executeTool(toolName, toolInput);
              const obsSummary = summarizeToolResult(toolName, result);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result,
              });
              send({
                type: 'observation',
                tool: toolName,
                summary: obsSummary,
                success: true,
                turn,
              });
              agentSteps.push({ type: 'observation', content: obsSummary, tool: toolName, summary: obsSummary, success: true, turn });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: errorMsg }),
                is_error: true,
              });
              send({
                type: 'observation',
                tool: toolName,
                summary: `Error: ${errorMsg}`,
                success: false,
                turn,
              });
              agentSteps.push({ type: 'observation', content: `Error: ${errorMsg}`, tool: toolName, summary: `Error: ${errorMsg}`, success: false, turn });
            }
          }

          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];

          // Token budget check
          if (cumulativeTokens.input + cumulativeTokens.output > 100_000) {
            send({ type: 'text', content: '\n\n---\n*Token budget reached. Please continue in a follow-up message.*' });
            fullResponse += '\n\n---\n*Token budget reached.*';
            break;
          }
        }

        // If budget exhausted mid-tool-use with no final text, notify user
        if (!fullResponse) {
          const notice = '*Turn budget exhausted before a final response could be generated. Please continue in a follow-up message.*';
          send({ type: 'text', content: notice });
          fullResponse = notice;
        }

        // Save the full response
        if (fullResponse && !skip_persist) {
          await supabaseAdmin
            .from('chat_messages')
            .insert({
              spark_id,
              session_id: sessionId,
              role: 'assistant',
              content: fullResponse,
              metadata: agentSteps.length > 0 ? { agentSteps } : {},
            })
            .select('id')
            .single();

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
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
