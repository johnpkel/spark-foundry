import { NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { getTokens } from '@/lib/google/oauth';
import type { IntegrationStatusMap, IntegrationStatusResult } from '@/lib/integrations';

export async function GET() {
  const [contentstackStatus, googleDriveStatus, slackStatus, lyticsStatus] = await Promise.all([
    checkContentstack(),
    checkGoogleDrive(),
    checkSlack(),
    checkLytics(),
  ]);

  const result: IntegrationStatusMap = {
    contentstack: contentstackStatus,
    google_drive: googleDriveStatus,
    slack: slackStatus,
    lytics: lyticsStatus,
    web_search: { status: 'active' },
  };

  return NextResponse.json(result);
}

async function checkContentstack(): Promise<IntegrationStatusResult> {
  try {
    const session = await getSession();
    if (session) {
      return { status: 'active', detail: session.display_name };
    }
    return { status: 'not_configured' };
  } catch {
    return { status: 'not_configured' };
  }
}

async function checkGoogleDrive(): Promise<IntegrationStatusResult> {
  try {
    const tokens = await getTokens();
    if (tokens) {
      return { status: 'connected', detail: tokens.email || undefined };
    }
    return { status: 'not_configured' };
  } catch {
    return { status: 'not_configured' };
  }
}

async function checkSlack(): Promise<IntegrationStatusResult> {
  if (process.env.SLACK_BOT_TOKEN) {
    return { status: 'connected' };
  }
  return { status: 'not_configured' };
}

async function checkLytics(): Promise<IntegrationStatusResult> {
  const token = process.env.LYTICS_ACCESS_TOKEN;
  if (!token) return { status: 'not_configured' };

  try {
    // Validate token by fetching account segments (lightweight call)
    const res = await fetch('https://api.lytics.io/v2/segment?limit=1', {
      headers: { Authorization: token },
    });
    if (!res.ok) return { status: 'not_configured', detail: `API returned ${res.status}` };

    const data = await res.json();
    const segCount = data.data?.length ?? 0;
    const aid = (data.data?.[0] as Record<string, unknown>)?.aid;
    return {
      status: 'active',
      detail: aid ? `Account ${aid}` : `${segCount} segments`,
    };
  } catch {
    return { status: 'not_configured', detail: 'Connection failed' };
  }
}
