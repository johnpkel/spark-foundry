/**
 * Slack integration utilities.
 *
 * Handles request signature verification, thread fetching via
 * conversations.replies, message formatting, and posting.
 */

import crypto from 'crypto';
import { addLogEntry } from './activity-logger';
import { supabaseAdmin } from './supabase/admin';
import { generateEmbedding, buildItemText } from './embeddings';
import { logWebhook } from './webhook-logger';

const SLACK_API = 'https://slack.com/api';
const API_TIMEOUT_MS = 5_000;

// ─── Bot token accessor ────────────────────────────────
function getBotToken(): string | null {
  return process.env.SLACK_BOT_TOKEN || null;
}

function getSigningSecret(): string | null {
  return process.env.SLACK_SIGNING_SECRET || null;
}

// ─── Signature verification ────────────────────────────
export async function verifySlackSignature(request: Request): Promise<{ valid: boolean; body: string }> {
  const signingSecret = getSigningSecret();
  if (!signingSecret) {
    console.error('[slack] SLACK_SIGNING_SECRET not configured');
    return { valid: false, body: '' };
  }

  const timestamp = request.headers.get('X-Slack-Request-Timestamp');
  const slackSignature = request.headers.get('X-Slack-Signature');

  if (!timestamp || !slackSignature) {
    return { valid: false, body: '' };
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return { valid: false, body: '' };
  }

  const body = await request.text();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest('hex')}`;

  // timingSafeEqual throws RangeError if lengths differ
  const computed = Buffer.from(computedSignature);
  const received = Buffer.from(slackSignature);
  const valid = computed.length === received.length &&
    crypto.timingSafeEqual(computed, received);

  return { valid, body };
}

// ─── User name cache ───────────────────────────────────
const userNameCache = new Map<string, string>();

async function resolveUserName(userId: string): Promise<string> {
  if (userNameCache.has(userId)) {
    return userNameCache.get(userId)!;
  }

  const token = getBotToken();
  if (!token) return userId;

  try {
    const res = await fetch(`${SLACK_API}/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const data = await res.json();
    const name = data.user?.real_name || data.user?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

// ─── Thread fetching ───────────────────────────────────
export interface SlackMessage {
  user: string;
  userName: string;
  text: string;
  ts: string;
}

export async function fetchThreadMessages(
  channelId: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const token = getBotToken();
  if (!token) throw new Error('SLACK_BOT_TOKEN not configured');

  const params = new URLSearchParams({
    channel: channelId,
    ts: threadTs,
    inclusive: 'true',
    limit: '100',
  });

  const url = `${SLACK_API}/conversations.replies?${params}`;
  const start = Date.now();
  const correlationId = `slack_${Date.now()}`;

  addLogEntry({
    service: 'slack',
    direction: 'request',
    level: 'info',
    method: 'GET',
    url,
    summary: `conversations.replies channel:${channelId}`,
    correlationId,
  });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const data = await res.json();
  const duration = Date.now() - start;

  if (!data.ok) {
    addLogEntry({
      service: 'slack',
      direction: 'response',
      level: 'error',
      method: 'GET',
      url,
      summary: `conversations.replies — error: ${data.error}`,
      statusCode: res.status,
      duration,
      error: data.error,
      correlationId,
    });
    throw new Error(`conversations.replies failed: ${data.error}`);
  }

  addLogEntry({
    service: 'slack',
    direction: 'response',
    level: 'info',
    method: 'GET',
    url,
    summary: `conversations.replies — ${data.messages?.length ?? 0} message${(data.messages?.length ?? 0) !== 1 ? 's' : ''}`,
    statusCode: 200,
    duration,
    correlationId,
  });

  // Filter relevant messages
  const rawMessages = (data.messages || []).filter(
    (msg: { subtype?: string }) => !msg.subtype || msg.subtype === 'thread_broadcast'
  );

  // Resolve user names in parallel
  const userIds = rawMessages.map((m: { user: string }) => m.user) as string[];
  const uniqueUserIds = Array.from(new Set(userIds));
  const names = await Promise.all(uniqueUserIds.map(resolveUserName));
  const nameMap = new Map(uniqueUserIds.map((id, i) => [id, names[i]]));

  return rawMessages.map((msg: { user: string; text?: string; ts: string }) => ({
    user: msg.user,
    userName: nameMap.get(msg.user) || msg.user,
    text: msg.text || '',
    ts: msg.ts,
  }));
}

// ─── Thread formatting ─────────────────────────────────
export function formatThreadContent(messages: SlackMessage[]): string {
  return messages
    .map((msg) => {
      const date = new Date(Number(msg.ts) * 1000);
      const time = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return `[${time}] ${msg.userName}: ${msg.text}`;
    })
    .join('\n\n');
}

// ─── Get channel name ──────────────────────────────────
export async function getChannelName(channelId: string): Promise<string> {
  const token = getBotToken();
  if (!token) return channelId;

  try {
    const res = await fetch(`${SLACK_API}/conversations.info?channel=${channelId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const data = await res.json();
    return data.channel?.name || channelId;
  } catch {
    return channelId;
  }
}

// ─── Get thread permalink ──────────────────────────────
export async function getPermalink(channelId: string, messageTs: string): Promise<string | null> {
  const token = getBotToken();
  if (!token) return null;

  try {
    const params = new URLSearchParams({ channel: channelId, message_ts: messageTs });
    const res = await fetch(`${SLACK_API}/chat.getPermalink?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const data = await res.json();
    return data.ok ? data.permalink : null;
  } catch {
    return null;
  }
}

// ─── Messaging ─────────────────────────────────────────
export async function sendEphemeralMessage(
  channelId: string,
  userId: string,
  blocks: unknown[]
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('SLACK_BOT_TOKEN not configured');

  await fetch(`${SLACK_API}/chat.postEphemeral`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      user: userId,
      blocks,
      text: 'Choose a Spark to save this thread to',
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

export async function postMessage(
  channelId: string,
  threadTs: string,
  text: string
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('SLACK_BOT_TOKEN not configured');

  await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      thread_ts: threadTs,
      text,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

// ─── Join channel ──────────────────────────────────────
/**
 * Have the bot join a public channel. Required so the bot can reply
 * after being @mentioned in a channel it hasn't been added to yet.
 * Requires channels:join scope.
 */
export async function joinChannel(channelId: string): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  try {
    await fetch(`${SLACK_API}/conversations.join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    // Non-fatal — bot may already be in channel or it's private
  }
}

// ─── Modal ─────────────────────────────────────────────
/**
 * Open a Slack modal using views.open.
 * triggerId must be used within 3 seconds of the interactive payload.
 */
export async function openModal(
  triggerId: string,
  view: Record<string, unknown>
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('SLACK_BOT_TOKEN not configured');

  const res = await fetch(`${SLACK_API}/views.open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(`views.open failed: ${data.error || res.status}`);
  }
}

// ─── Worker dispatch ────────────────────────────────────
/**
 * Dispatch a task to the internal worker endpoint.
 * Must be awaited — on serverless platforms the runtime is killed
 * once the response is sent, so unawaited fetches get dropped.
 * The dispatch itself is fast (just a POST), so it won't blow
 * Slack's 3-second response budget.
 */
export async function dispatchToWorker(request: Request, payload: Record<string, unknown>) {
  const origin = new URL(request.url).origin;
  const secret = process.env.SLACK_SIGNING_SECRET;
  try {
    await fetch(`${origin}/api/slack/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slack-Worker-Secret': secret || '',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_000),
    });
  } catch (err) {
    console.error('[slack] worker dispatch failed:', err);
  }
}

// ─── Spark picker modal ─────────────────────────────────

export function buildSparkPickerModal(
  channelId: string,
  threadTs: string,
  sparks: { id: string; name: string }[]
): Record<string, unknown> {
  const privateMetadata = JSON.stringify({ channel: channelId, thread_ts: threadTs });

  return {
    type: 'modal',
    callback_id: 'save_to_spark_modal',
    private_metadata: privateMetadata,
    title: { type: 'plain_text', text: 'Save to Spark', emoji: true },
    submit: { type: 'plain_text', text: 'Save Thread', emoji: true },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':sparkles: The full thread will be captured and embedded for AI retrieval in Spark Foundry.',
        },
      },
      {
        type: 'input',
        block_id: 'spark_select_block',
        label: { type: 'plain_text', text: 'Choose a Spark', emoji: true },
        element: {
          type: 'static_select',
          action_id: 'spark_select',
          placeholder: { type: 'plain_text', text: 'Select a Spark\u2026' },
          options: sparks.map((s) => ({
            text: { type: 'plain_text', text: s.name.slice(0, 75), emoji: true },
            value: s.id,
          })),
        },
      },
    ],
  };
}

// ─── Handle @mention in thread ──────────────────────────

export async function handleAppMention(
  channel: string,
  user: string,
  threadTs: string,
  _messageTs: string,
  correlationId?: string
) {
  await logWebhook({
    correlation_id: correlationId,
    direction: 'outbound',
    route: '/api/slack/worker',
    summary: 'Fetching sparks for picker...',
  });

  const { data: sparks, error } = await supabaseAdmin
    .from('sparks')
    .select('id, name')
    .eq('status', 'active')
    .order('name');

  if (error || !sparks || sparks.length === 0) {
    await logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      level: error ? 'error' : 'info',
      route: '/api/slack/worker',
      summary: error
        ? `Failed to load sparks: ${error.message}`
        : 'No active sparks found',
      error: error?.message,
    });

    await sendEphemeralMessage(channel, user, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: error
            ? ':warning: Failed to load Sparks. Please try again.'
            : ':sparkles: No active Sparks found. Create one in Spark Foundry first!',
        },
      },
    ]);
    return;
  }

  // Build Block Kit message with Spark picker dropdown + send button
  const metadata = JSON.stringify({ channel, thread_ts: threadTs, user });

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':sparkles: *Send this thread to a Spark*\nChoose a Spark and click Send.',
      },
    },
    {
      type: 'actions',
      block_id: 'spark_picker',
      elements: [
        {
          type: 'static_select',
          action_id: 'select_spark',
          placeholder: {
            type: 'plain_text',
            text: 'Choose a Spark...',
          },
          options: sparks.map((s) => ({
            text: { type: 'plain_text', text: s.name.slice(0, 75) },
            value: s.id,
          })),
        },
        {
          type: 'button',
          action_id: 'send_to_spark',
          text: { type: 'plain_text', text: 'Send to Spark' },
          style: 'primary',
          value: metadata,
        },
      ],
    },
  ];

  await sendEphemeralMessage(channel, user, blocks);

  await logWebhook({
    correlation_id: correlationId,
    direction: 'internal',
    route: '/api/slack/worker',
    summary: `Sending ephemeral picker (${sparks.length} sparks)`,
  });
}

// ─── Save thread to Spark ───────────────────────────────

export async function handleSendToSpark(
  channelId: string,
  threadTs: string,
  userId: string,
  sparkId: string,
  correlationId?: string
) {
  await logWebhook({
    correlation_id: correlationId,
    direction: 'internal',
    route: '/api/slack/worker',
    summary: `send_to_spark started: sparkId=${sparkId}`,
  });

  const { data: spark } = await supabaseAdmin
    .from('sparks')
    .select('id, name')
    .eq('id', sparkId)
    .single();

  if (!spark) {
    console.error('[slack] Spark not found:', sparkId);
    await logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      level: 'error',
      route: '/api/slack/worker',
      summary: `Spark not found: ${sparkId}`,
    });
    await sendEphemeralMessage(channelId, userId, [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: ':warning: Spark not found. It may have been deleted.' },
      },
    ]);
    return;
  }

  // Fetch thread, channel name, and permalink concurrently
  const [messages, channelName, permalink] = await Promise.all([
    fetchThreadMessages(channelId, threadTs),
    getChannelName(channelId),
    getPermalink(channelId, threadTs),
  ]);

  await logWebhook({
    correlation_id: correlationId,
    direction: 'outbound',
    route: '/api/slack/worker',
    summary: `Thread fetched: ${messages.length} messages from #${channelName}`,
  });

  if (messages.length === 0) {
    await logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      level: 'error',
      route: '/api/slack/worker',
      summary: 'No messages in thread — missing scopes?',
    });
    await sendEphemeralMessage(channelId, userId, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':warning: Could not fetch thread messages. Check that the bot has `channels:history` (or `groups:history`) scope.',
        },
      },
    ]);
    return;
  }

  const formattedContent = formatThreadContent(messages);
  const senderName = messages[0].userName;
  const title = `Slack thread from #${channelName}`;

  const itemMetadata = {
    slack_channel_id: channelId,
    slack_channel_name: channelName,
    slack_thread_ts: threadTs,
    slack_message_count: messages.length,
    slack_permalink: permalink,
    slack_sender_name: senderName,
    source: 'slack',
  };

  // Check for an existing item with the same thread to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from('spark_items')
    .select('id')
    .eq('spark_id', sparkId)
    .eq('type', 'slack_message')
    .eq("metadata->>'slack_thread_ts'", threadTs)
    .maybeSingle();

  if (existing) {
    await logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      route: '/api/slack/worker',
      summary: `Duplicate detected — thread already in "${spark.name}"`,
    });
    await postMessage(
      channelId,
      threadTs,
      `:information_source: This thread is already in *${spark.name}*.`
    );
    return;
  }

  const { data: item, error } = await supabaseAdmin
    .from('spark_items')
    .insert({
      spark_id: sparkId,
      type: 'slack_message',
      title,
      content: formattedContent,
      metadata: itemMetadata,
    })
    .select()
    .single();

  if (error || !item) {
    console.error('[slack] Insert failed:', error?.message);
    await logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      level: 'error',
      route: '/api/slack/worker',
      summary: 'spark_items insert failed',
      error: error?.message,
    });
    await sendEphemeralMessage(channelId, userId, [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: ':warning: Failed to save thread. Please try again.' },
      },
    ]);
    return;
  }

  await logWebhook({
    correlation_id: correlationId,
    direction: 'internal',
    route: '/api/slack/worker',
    summary: `Item inserted: id=${item.id}`,
  });

  // Generate and save embedding (non-blocking — confirmation is sent first)
  const itemData = {
    title,
    content: formattedContent,
    type: 'slack_message',
    metadata: itemMetadata as Record<string, unknown>,
  };

  await logWebhook({
    correlation_id: correlationId,
    direction: 'outbound',
    route: '/api/slack/worker',
    summary: 'Embedding generation started',
  });

  generateEmbedding(buildItemText(itemData))
    .then(async (embedding) => {
      if (embedding) {
        await supabaseAdmin
          .from('spark_items')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', item.id);
        await logWebhook({
          correlation_id: correlationId,
          direction: 'internal',
          route: '/api/slack/worker',
          summary: `Embedding saved for item ${item.id}`,
        });
      }
    })
    .catch(async (err) => {
      console.error('[slack] Embedding failed:', err);
      await logWebhook({
        correlation_id: correlationId,
        direction: 'internal',
        level: 'error',
        route: '/api/slack/worker',
        summary: 'Embedding generation failed',
        error: err instanceof Error ? err.message : String(err),
      });
    });

  // Public confirmation in the thread so the whole team sees it
  await postMessage(
    channelId,
    threadTs,
    `:sparkles: Thread saved to *${spark.name}* (${messages.length} message${messages.length !== 1 ? 's' : ''})`
  );

  await logWebhook({
    correlation_id: correlationId,
    direction: 'internal',
    route: '/api/slack/worker',
    summary: `Confirmation posted to #${channelName}`,
  });
}
