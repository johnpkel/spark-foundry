import { NextResponse } from 'next/server';
import {
  handleAppMention,
  handleSendToSpark,
  sendEphemeralMessage,
} from '@/lib/slack';
import { logWebhook, generateCorrelationId } from '@/lib/webhook-logger';

export async function POST(request: Request) {
  // Validate internal shared secret
  const secret = request.headers.get('X-Slack-Worker-Secret');
  if (!secret || secret !== process.env.SLACK_SIGNING_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const task = payload.task as string;
  const correlationId = (payload.correlationId as string) || generateCorrelationId('wrk');
  const start = Date.now();

  logWebhook({
    correlation_id: correlationId,
    direction: 'internal',
    route: '/api/slack/worker',
    summary: `Worker started: task=${task}`,
    payload: { task, channel: payload.channel || payload.channelId },
  });

  try {
    switch (task) {
      case 'app_mention':
        await handleAppMention(
          payload.channel as string,
          payload.user as string,
          payload.threadTs as string,
          payload.messageTs as string,
          correlationId,
        );
        break;

      case 'send_to_spark':
        await handleSendToSpark(
          payload.channelId as string,
          payload.threadTs as string,
          payload.userId as string,
          payload.sparkId as string,
          correlationId,
        );
        break;

      case 'ephemeral':
        await sendEphemeralMessage(
          payload.channel as string,
          payload.user as string,
          payload.blocks as unknown[],
        );
        break;

      default:
        return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 });
    }

    logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      route: '/api/slack/worker',
      summary: `Worker completed: task=${task}`,
      duration_ms: Date.now() - start,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[slack/worker] task=${task} error:`, err);

    logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      level: 'error',
      route: '/api/slack/worker',
      summary: `Worker failed: task=${task}`,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}
