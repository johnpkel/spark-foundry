import { cookies } from 'next/headers';

// ============================================
// Google OAuth 2.0 + encrypted cookie tokens
// ============================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const COOKIE_NAME = 'spark_google_tokens';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID is not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET is not set');
  return secret;
}

function getCookieSecret(): string {
  const secret = process.env.GOOGLE_DRIVE_COOKIE_SECRET;
  if (!secret) throw new Error('GOOGLE_DRIVE_COOKIE_SECRET is not set');
  return secret;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/auth/google/callback`;
}

// ============================================
// AES-256-GCM encryption via Web Crypto API
// ============================================

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getCookieSecret());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Prepend IV to ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Buffer.from(combined).toString('base64');
}

async function decrypt(encrypted: string): Promise<string> {
  const key = await deriveKey(getCookieSecret());
  const combined = Buffer.from(encrypted, 'base64');
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

// ============================================
// OAuth flow helpers
// ============================================

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in ms
  email?: string;
}

/** Build the Google consent screen URL */
export function buildGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/** Exchange an authorization code for tokens */
export async function exchangeCodeForTokens(
  code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

/** Refresh an expired access token */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return res.json();
}

/** Fetch user email from Google */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

// ============================================
// Cookie operations
// ============================================

/** Store encrypted tokens in an HTTP-only cookie */
export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  email?: string
): Promise<void> {
  const tokenData: TokenData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    email,
  };

  const encrypted = await encrypt(JSON.stringify(tokenData));
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/** Read and decrypt tokens from the cookie. Auto-refreshes if expired. */
export async function getTokens(): Promise<TokenData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    const tokenData: TokenData = JSON.parse(await decrypt(cookie.value));

    // If token expires within 5 minutes, refresh it
    if (tokenData.expires_at < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshAccessToken(tokenData.refresh_token);
        tokenData.access_token = refreshed.access_token;
        tokenData.expires_at = Date.now() + refreshed.expires_in * 1000;

        // Update cookie with refreshed tokens
        const encrypted = await encrypt(JSON.stringify(tokenData));
        cookieStore.set(COOKIE_NAME, encrypted, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
          path: '/',
        });
      } catch {
        // Refresh failed — token is invalid
        return null;
      }
    }

    return tokenData;
  } catch {
    return null;
  }
}

/** Get a valid access token, or null if not connected */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  return tokens?.access_token || null;
}

/** Clear the token cookie */
export async function clearTokens(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Revoke the token at Google (fire-and-forget) and clear the cookie */
export async function revokeAndClear(): Promise<void> {
  const tokens = await getTokens();
  if (tokens?.access_token) {
    // Fire-and-forget revocation
    fetch(`${GOOGLE_REVOKE_URL}?token=${tokens.access_token}`, { method: 'POST' }).catch(
      () => {}
    );
  }
  await clearTokens();
}
