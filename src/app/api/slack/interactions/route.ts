import { NextResponse } from 'next/server';
import { verifySlackSignature, fetchThreadMessages, formatThreadContent, getChannelName, getPermalink, postMessage, sendEphemeralMessage } from '@/lib/slack';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding, buildItemText } from '@/lib/embeddings';

export async function POST(request: Request) {
  if (!process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'Slack integration not configured — SLACK_BOT_TOKEN missing' },
      { status: 503 }
    );
  }

  // Verify signature
  const { valid, body } = await verifySlackSignature(request);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the url-encoded payload
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

  // Find the button action (send_to_spark)
  const actions = (payload.actions || []) as { action_id: string; value?: string }[];
  const sendAction = actions.find((a) => a.action_id === 'send_to_spark');

  if (!sendAction) {
    // Could be a dropdown selection event — acknowledge it
    return new Response('', { status: 200 });
  }

  // Extract metadata from button value
  let metadataParsed: { channel: string; thread_ts: string; user: string };
  try {
    metadataParsed = JSON.parse(sendAction.value || '');
  } catch {
    return NextResponse.json({ error: 'Invalid action metadata' }, { status: 400 });
  }

  const { channel, thread_ts: threadTs, user } = metadataParsed;

  // Get selected Spark from Block Kit state
  const state = payload.state as { values?: Record<string, Record<string, { selected_option?: { value: string } }>> } | undefined;
  const sparkId = state?.values?.spark_picker?.select_spark?.selected_option?.value;

  if (!sparkId) {
    // User clicked Send without selecting a Spark
    return new Response('', { status: 200 });
  }

  // Do heavy work asynchronously so we respond within 3 seconds
  handleSendToSpark(channel, threadTs, user, sparkId).catch((err) =>
    console.error('[slack/interactions] handleSendToSpark error:', err)
  );

  return new Response('', { status: 200 });
}

async function handleSendToSpark(
  channelId: string,
  threadTs: string,
  userId: string,
  sparkId: string
) {
  // Look up Spark name
  const { data: spark } = await supabaseAdmin
    .from('sparks')
    .select('id, name')
    .eq('id', sparkId)
    .single();

  if (!spark) {
    console.error('[slack/interactions] Spark not found:', sparkId);
    await sendEphemeralMessage(channelId, userId, [
      { type: 'section', text: { type: 'mrkdwn', text: ':warning: Spark not found. It may have been deleted.' } },
    ]);
    return;
  }

  // Fetch thread messages + channel info + permalink in parallel
  const [messages, channelName, permalink] = await Promise.all([
    fetchThreadMessages(channelId, threadTs),
    getChannelName(channelId),
    getPermalink(channelId, threadTs),
  ]);

  if (messages.length === 0) {
    await sendEphemeralMessage(channelId, userId, [
      { type: 'section', text: { type: 'mrkdwn', text: ':warning: Could not fetch thread messages. Check bot permissions.' } },
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

  // Insert item
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
      { type: 'section', text: { type: 'mrkdwn', text: ':warning: Failed to save thread. Please try again.' } },
    ]);
    return;
  }

  // Generate and save embedding
  const itemData = {
    title,
    content: formattedContent,
    type: 'slack_message',
    metadata: itemMetadata as Record<string, unknown>,
  };
  const embedding = await generateEmbedding(buildItemText(itemData));

  if (embedding) {
    const { error: embError } = await supabaseAdmin
      .from('spark_items')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', item.id);

    if (embError) {
      console.error('[slack/interactions] Embedding save failed:', embError.message);
    }
  }

  // Confirm in thread (public reply so the team sees it was captured)
  await postMessage(
    channelId,
    threadTs,
    `:sparkles: Thread saved to Spark *${spark.name}* (${messages.length} messages)`
  );
}
