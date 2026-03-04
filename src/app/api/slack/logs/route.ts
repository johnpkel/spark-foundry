import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/slack/logs — Query recent webhook logs.
 *
 * Query params:
 *   limit          — max rows (default 50, max 200)
 *   level          — filter by level (e.g. "error")
 *   correlationId  — filter by correlation_id
 *
 * Auth: X-Slack-Worker-Secret must match SLACK_SIGNING_SECRET.
 */
export async function GET(request: Request) {
  const secret = request.headers.get('X-Slack-Worker-Secret');
  if (!secret || secret !== process.env.SLACK_SIGNING_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);
  const level = url.searchParams.get('level');
  const correlationId = url.searchParams.get('correlationId');

  let query = supabaseAdmin
    .from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (level) query = query.eq('level', level);
  if (correlationId) query = query.eq('correlation_id', correlationId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
