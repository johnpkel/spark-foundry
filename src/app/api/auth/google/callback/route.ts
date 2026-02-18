import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, fetchUserEmail, storeTokens } from '@/lib/google/oauth';

// GET /api/auth/google/callback — OAuth callback, stores tokens, closes popup
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error || !code) {
    return new NextResponse(popupHtml('error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchUserEmail(tokens.access_token);

    await storeTokens(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      email || undefined
    );

    return new NextResponse(popupHtml('success'), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('[google/callback] Token exchange failed:', err);
    return new NextResponse(popupHtml('error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function popupHtml(status: 'success' | 'error'): string {
  return `<!DOCTYPE html>
<html>
<head><title>Google Drive</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'google-auth', status: '${status}' }, '*');
  }
  window.close();
</script>
<p>${status === 'success' ? 'Connected! This window will close.' : 'Connection failed. Please close this window and try again.'}</p>
</body>
</html>`;
}
