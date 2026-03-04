import { NextResponse, after } from 'next/server';
import {
  verifySlackSignature,
  fetchThreadMessages,
  formatThreadContent,
  getChannelName,
  getPermalink,
  postMessage,
  sendEphemeralMessage,
  openModal,
} from '@/lib/slack';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding, buildItemText } from '@/lib/embeddings';

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
    // Use Promise.allSettled to avoid one failure blocking the other.
    try {
      const { data: sparks } = await supabaseAdmin
        .from('sparks')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .abortSignal(AbortSignal.timeout(2000));

      if (!sparks || sparks.length === 0) {
        // Use after() — we need to return 200 fast, ephemeral can arrive slightly later
        after(async () => {
          await sendEphemeralMessage(channel.id, userId, [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':sparkles: No active Sparks found. Create one in Spark Foundry first!',
              },
            },
          ]).catch((err) => console.error('[slack/interactions] ephemeral error:', err));
        });
        return new Response('', { status: 200 });
      }

      await openModal(triggerId, buildSparkPickerModal(channel.id, threadTs, sparks));
    } catch (err) {
      console.error('[slack/interactions] message_action error:', err);
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
        // Use after() so the runtime stays alive for the heavy work.
        // Raw fire-and-forget promises get killed on hosted platforms.
        after(async () => {
          try {
            await handleSendToSpark(meta.channel, meta.thread_ts, userId, sparkId);
          } catch (err) {
            console.error('[slack/interactions] modal save error:', err);
          }
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

    // Use after() so the runtime stays alive for the heavy work.
    after(async () => {
      try {
        await handleSendToSpark(meta.channel, meta.thread_ts, meta.user, sparkId);
      } catch (err) {
        console.error('[slack/interactions] button save error:', err);
      }
    });

    return new Response('', { status: 200 });
  }

  return new Response('', { status: 200 });
}

// ─── Build Spark picker modal ───────────────────────────

function buildSparkPickerModal(
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
          placeholder: { type: 'plain_text', text: 'Select a Spark…' },
          options: sparks.map((s) => ({
            text: { type: 'plain_text', text: s.name.slice(0, 75), emoji: true },
            value: s.id,
          })),
        },
      },
    ],
  };
}

// ─── Save thread to Spark ───────────────────────────────

async function handleSendToSpark(
  channelId: string,
  threadTs: string,
  userId: string,
  sparkId: string
) {
  const { data: spark } = await supabaseAdmin
    .from('sparks')
    .select('id, name')
    .eq('id', sparkId)
    .single();

  if (!spark) {
    console.error('[slack/interactions] Spark not found:', sparkId);
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

  if (messages.length === 0) {
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
    console.error('[slack/interactions] Insert failed:', error?.message);
    await sendEphemeralMessage(channelId, userId, [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: ':warning: Failed to save thread. Please try again.' },
      },
    ]);
    return;
  }

  // Generate and save embedding (non-blocking — confirmation is sent first)
  const itemData = {
    title,
    content: formattedContent,
    type: 'slack_message',
    metadata: itemMetadata as Record<string, unknown>,
  };

  generateEmbedding(buildItemText(itemData))
    .then(async (embedding) => {
      if (embedding) {
        await supabaseAdmin
          .from('spark_items')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', item.id);
      }
    })
    .catch((err) => console.error('[slack/interactions] Embedding failed:', err));

  // Public confirmation in the thread so the whole team sees it
  await postMessage(
    channelId,
    threadTs,
    `:sparkles: Thread saved to *${spark.name}* (${messages.length} message${messages.length !== 1 ? 's' : ''})`
  );
}
