import { NextResponse } from 'next/server';
import {
  handleAppMention,
  handleSendToSpark,
  sendEphemeralMessage,
} from '@/lib/slack';

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

  try {
    switch (task) {
      case 'app_mention':
        await handleAppMention(
          payload.channel as string,
          payload.user as string,
          payload.threadTs as string,
          payload.messageTs as string,
        );
        break;

      case 'send_to_spark':
        await handleSendToSpark(
          payload.channelId as string,
          payload.threadTs as string,
          payload.userId as string,
          payload.sparkId as string,
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[slack/worker] task=${task} error:`, err);
    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}
