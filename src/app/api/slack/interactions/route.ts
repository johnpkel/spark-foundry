import { NextResponse } from 'next/server';
import {
  verifySlackSignature,
  sendEphemeralMessage,
  openModal,
  buildSparkPickerModal,
  dispatchToWorker,
} from '@/lib/slack';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logWebhook, generateCorrelationId } from '@/lib/webhook-logger';

export async function POST(request: Request) {
  if (!process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'Slack integration not configured — SLACK_BOT_TOKEN missing' },
      { status: 503 }
    );
  }

  const { valid, body } = await verifySlackSignature(request);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 });
  }

  const payloadType = payload.type as string;
  const correlationId = generateCorrelationId('int');

  logWebhook({
    correlation_id: correlationId,
    direction: 'inbound',
    route: '/api/slack/interactions',
    summary: `Inbound interaction: ${payloadType}`,
    payload: { type: payloadType, callback_id: payload.callback_id },
  });

  // ─── Message action (ellipsis menu shortcut) ────────
  // Triggered when user clicks "..." → "Save to Spark" on any message.
  // We must open the modal within 3s of receiving trigger_id.
  if (payloadType === 'message_action' && payload.callback_id === 'save_to_spark') {
    const triggerId = payload.trigger_id as string;
    const channel = payload.channel as { id: string; name: string };
    const message = payload.message as { ts: string; thread_ts?: string };
    const userId = (payload.user as { id: string }).id;

    // Use the thread root if the message is a reply, otherwise treat the
    // message itself as the root (conversations.replies will return it + any replies)
    const threadTs = message.thread_ts || message.ts;

    // Fetch Sparks and open modal — both must complete within 3s of trigger_id.
    try {
      const { data: sparks } = await supabaseAdmin
        .from('sparks')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .abortSignal(AbortSignal.timeout(2000));

      if (!sparks || sparks.length === 0) {
        dispatchToWorker(request, {
          task: 'ephemeral',
          channel: channel.id,
          user: userId,
          correlationId,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':sparkles: No active Sparks found. Create one in Spark Foundry first!',
              },
            },
          ],
        });
        return new Response('', { status: 200 });
      }

      await openModal(triggerId, buildSparkPickerModal(channel.id, threadTs, sparks));

      logWebhook({
        correlation_id: correlationId,
        direction: 'outbound',
        route: '/api/slack/interactions',
        summary: `Opened modal with ${sparks.length} sparks`,
      });
    } catch (err) {
      console.error('[slack/interactions] message_action error:', err);
      logWebhook({
        correlation_id: correlationId,
        direction: 'internal',
        level: 'error',
        route: '/api/slack/interactions',
        summary: 'message_action failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return new Response('', { status: 200 });
  }

  // ─── Modal submission ───────────────────────────────
  // Fired when user submits the "Save to Spark" modal.
  if (payloadType === 'view_submission') {
    const view = payload.view as {
      callback_id: string;
      private_metadata: string;
      state: { values: Record<string, Record<string, { selected_option?: { value: string } }>> };
    };

    if (view.callback_id === 'save_to_spark_modal') {
      const userId = (payload.user as { id: string }).id;

      let meta: { channel: string; thread_ts: string };
      try {
        meta = JSON.parse(view.private_metadata);
      } catch {
        return NextResponse.json({});
      }

      const sparkId = view.state.values?.spark_select_block?.spark_select?.selected_option?.value;

      if (sparkId && meta.channel && meta.thread_ts) {
        dispatchToWorker(request, {
          task: 'send_to_spark',
          channelId: meta.channel,
          threadTs: meta.thread_ts,
          userId,
          sparkId,
          correlationId,
        });

        logWebhook({
          correlation_id: correlationId,
          direction: 'internal',
          route: '/api/slack/interactions',
          summary: `Dispatched worker: send_to_spark (modal)`,
        });
      }

      // Return empty object → Slack closes the modal
      return NextResponse.json({});
    }
  }

  // ─── Button action (@ mention ephemeral flow) ───────
  // Fired when user clicks "Send to Spark" in the ephemeral picker.
  if (payloadType === 'block_actions') {
    const actions = (payload.actions || []) as { action_id: string; value?: string }[];
    const sendAction = actions.find((a) => a.action_id === 'send_to_spark');

    if (!sendAction) {
      // Dropdown selection update — acknowledge silently
      return new Response('', { status: 200 });
    }

    let meta: { channel: string; thread_ts: string; user: string };
    try {
      meta = JSON.parse(sendAction.value || '');
    } catch {
      return NextResponse.json({ error: 'Invalid action metadata' }, { status: 400 });
    }

    const state = payload.state as {
      values?: Record<string, Record<string, { selected_option?: { value: string } }>>;
    } | undefined;
    const sparkId = state?.values?.spark_picker?.select_spark?.selected_option?.value;

    if (!sparkId) {
      // User clicked Send without picking a Spark — silently ignore
      return new Response('', { status: 200 });
    }

    dispatchToWorker(request, {
      task: 'send_to_spark',
      channelId: meta.channel,
      threadTs: meta.thread_ts,
      userId: meta.user,
      sparkId,
      correlationId,
    });

    logWebhook({
      correlation_id: correlationId,
      direction: 'internal',
      route: '/api/slack/interactions',
      summary: `Dispatched worker: send_to_spark (button)`,
    });

    return new Response('', { status: 200 });
  }

  return new Response('', { status: 200 });
}
