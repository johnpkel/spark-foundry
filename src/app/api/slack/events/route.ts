import { NextResponse } from 'next/server';
import { verifySlackSignature, dispatchToWorker, joinChannel } from '@/lib/slack';
import { logWebhook, generateCorrelationId } from '@/lib/webhook-logger';

export async function POST(request: Request) {
  // Slack retries if it doesn't get a 200 within 3 seconds.
  // Acknowledge retries immediately to stop the retry chain.
  const retryNum = request.headers.get('X-Slack-Retry-Num');
  if (retryNum) {
    logWebhook({
      direction: 'inbound',
      route: '/api/slack/events',
      summary: `Retry dedup: X-Slack-Retry-Num=${retryNum}`,
    });
    return NextResponse.json({ ok: true });
  }

  // Verify request signature (uses SLACK_SIGNING_SECRET, not bot token)
  const { valid, body } = await verifySlackSignature(request);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Slack URL verification handshake — must respond before bot token check
  // so the Events URL can be saved even before the bot token is configured.
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // All other events require the bot token to respond
  if (!process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'Slack integration not configured — SLACK_BOT_TOKEN missing' },
      { status: 503 }
    );
  }

  // Handle event callbacks
  if (payload.type === 'event_callback') {
    const event = payload.event;
    const correlationId = generateCorrelationId('evt');

    logWebhook({
      correlation_id: correlationId,
      direction: 'inbound',
      route: '/api/slack/events',
      summary: `Inbound event: ${event?.type ?? 'unknown'}`,
      payload: { event_type: event?.type, channel: event?.channel, user: event?.user },
    });

    if (event?.type === 'app_mention') {
      const channel: string = event.channel;
      const user: string = event.user;
      const threadTs: string | undefined = event.thread_ts;
      const messageTs: string = event.ts;

      // Auto-join the channel so the bot can reply
      joinChannel(channel).catch(() => {});

      if (!threadTs) {
        // Not in a thread — send help message via worker
        dispatchToWorker(request, {
          task: 'ephemeral',
          channel,
          user,
          correlationId,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:wave: Hi! I'm *Spark Test*.\n\nTo save a thread to a Spark, @mention me *inside a thread reply*.\n\nYou can also right-click any message \u2192 *More message shortcuts* \u2192 *Save to Spark*.`,
              },
            },
          ],
        });
      } else {
        // In a thread — dispatch the heavy work to the worker endpoint
        dispatchToWorker(request, {
          task: 'app_mention',
          channel,
          user,
          threadTs,
          messageTs,
          correlationId,
        });
      }

      logWebhook({
        correlation_id: correlationId,
        direction: 'internal',
        route: '/api/slack/events',
        summary: `Dispatched worker: ${threadTs ? 'app_mention' : 'ephemeral'}`,
      });
    }
  }

  // Always respond 200 within 3 seconds
  return NextResponse.json({ ok: true });
}
