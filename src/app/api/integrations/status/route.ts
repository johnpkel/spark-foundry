import { NextResponse } from 'next/server';
import { getSession } from '@/lib/contentstack/oauth';
import { getTokens } from '@/lib/google/oauth';
import type { IntegrationStatusMap, IntegrationStatusResult } from '@/lib/integrations';

export async function GET() {
  const [contentstackStatus, googleDriveStatus, slackStatus] = await Promise.all([
    checkContentstack(),
    checkGoogleDrive(),
    checkSlack(),
  ]);

  const result: IntegrationStatusMap = {
    contentstack: contentstackStatus,
    google_drive: googleDriveStatus,
    slack: slackStatus,
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
