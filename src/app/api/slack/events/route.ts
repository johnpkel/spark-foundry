import { NextResponse } from 'next/server';
import { verifySlackSignature, sendEphemeralMessage } from '@/lib/slack';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  // Check bot token is configured
  if (!process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'Slack integration not configured — SLACK_BOT_TOKEN missing' },
      { status: 503 }
    );
  }

  // Verify request signature
  const { valid, body } = await verifySlackSignature(request);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Slack URL verification handshake
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Handle event callbacks
  if (payload.type === 'event_callback') {
    const event = payload.event;

    // Deduplicate retries — Slack sends x-slack-retry-num header
    // We respond 200 immediately for all events to prevent retries

    if (event?.type === 'app_mention') {
      const channel: string = event.channel;
      const user: string = event.user;
      const threadTs: string | undefined = event.thread_ts;
      const messageTs: string = event.ts;

      // Must be inside a thread
      if (!threadTs) {
        sendEphemeralMessage(channel, user, [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':thread: Please @mention me *inside a thread* to send it to a Spark.',
            },
          },
        ]).catch((err) => console.error('[slack/events] ephemeral error:', err));

        return NextResponse.json({ ok: true });
      }

      // Fetch active Sparks
      handleAppMention(channel, user, threadTs, messageTs).catch((err) =>
        console.error('[slack/events] handleAppMention error:', err)
      );
    }
  }

  // Always respond 200 within 3 seconds
  return NextResponse.json({ ok: true });
}

async function handleAppMention(
  channel: string,
  user: string,
  threadTs: string,
  _messageTs: string
) {
  const { data: sparks, error } = await supabaseAdmin
    .from('sparks')
    .select('id, name')
    .eq('status', 'active')
    .order('name');

  if (error || !sparks || sparks.length === 0) {
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
}
