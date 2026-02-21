/**
 * Slack integration utilities.
 *
 * Handles request signature verification, thread fetching via
 * conversations.replies, message formatting, and posting.
 */

import crypto from 'crypto';

const SLACK_API = 'https://slack.com/api';

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

  const res = await fetch(`${SLACK_API}/conversations.replies?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.ok) {
    throw new Error(`conversations.replies failed: ${data.error}`);
  }

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
  });
}
