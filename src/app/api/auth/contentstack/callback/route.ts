import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, fetchUserInfo, storeSession } from '@/lib/contentstack/oauth';

// GET /api/auth/contentstack/callback — OAuth callback
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  const baseUrl = request.nextUrl.origin;

  // Decode state to check for popup mode
  const stateParam = request.nextUrl.searchParams.get('state');
  let redirectPath = '/';
  let isPopup = false;
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      if (decoded.redirect && decoded.redirect.startsWith('/')) {
        redirectPath = decoded.redirect;
      }
      isPopup = !!decoded.popup;
    } catch {
      // Invalid state — fall back to defaults
    }
  }

  if (error || !code) {
    if (isPopup) {
      return new NextResponse(popupHtml('error'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }

  try {
    console.log('[contentstack/callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    console.log('[contentstack/callback] Token exchange succeeded, fetching user info...');
    const userInfo = await fetchUserInfo(tokens.access_token);
    console.log('[contentstack/callback] User info fetched:', userInfo.email);

    await storeSession(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      userInfo
    );
    console.log('[contentstack/callback] Session stored');

    if (isPopup) {
      return new NextResponse(popupHtml('success'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return NextResponse.redirect(`${baseUrl}${redirectPath}`);
  } catch (err) {
    console.error('[contentstack/callback] OAuth failed:', err);
    if (isPopup) {
      return new NextResponse(popupHtml('error'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_failed`);
  }
}

function popupHtml(status: 'success' | 'error'): string {
  return `<!DOCTYPE html>
<html>
<head><title>Contentstack</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'contentstack-auth', status: '${status}' }, '*');
  }
  window.close();
</script>
<p>${status === 'success' ? 'Connected! This window will close.' : 'Connection failed. Please close this window and try again.'}</p>
</body>
</html>`;
}
