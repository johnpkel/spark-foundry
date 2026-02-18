import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, fetchUserInfo, storeSession } from '@/lib/contentstack/oauth';

// GET /api/auth/contentstack/callback — OAuth callback
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  const baseUrl = request.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const userInfo = await fetchUserInfo(tokens.access_token);

    await storeSession(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      userInfo
    );

    return NextResponse.redirect(baseUrl);
  } catch (err) {
    console.error('[contentstack/callback] OAuth failed:', err);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }
}
