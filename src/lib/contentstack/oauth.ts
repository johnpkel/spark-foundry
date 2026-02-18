import { cookies } from 'next/headers';

// ============================================
// Contentstack OAuth 2.0 + encrypted cookie session
// ============================================

const CS_AUTH_BASE = 'https://app.contentstack.com';
const CS_API_BASE = 'https://api.contentstack.io';

const SCOPES = 'user:read cm.stacks.management:read cm.content-types.management:read';

const COOKIE_NAME = 'spark_cs_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getAppUid(): string {
  const uid = process.env.CONTENTSTACK_APP_UID;
  if (!uid) throw new Error('CONTENTSTACK_APP_UID is not set');
  return uid;
}

function getClientId(): string {
  const id = process.env.CONTENTSTACK_OAUTH_CLIENT_ID;
  if (!id) throw new Error('CONTENTSTACK_OAUTH_CLIENT_ID is not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.CONTENTSTACK_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error('CONTENTSTACK_OAUTH_CLIENT_SECRET is not set');
  return secret;
}

function getCookieSecret(): string {
  const secret = process.env.CONTENTSTACK_OAUTH_COOKIE_SECRET;
  if (!secret) throw new Error('CONTENTSTACK_OAUTH_COOKIE_SECRET is not set');
  return secret;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/auth/contentstack/callback`;
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

export interface SessionData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in ms
  email: string;
  display_name: string;
  organization_uid?: string;
}

/** Build the Contentstack OAuth consent screen URL */
export function buildCSAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state,
  });
  return `${CS_AUTH_BASE}/apps/${getAppUid()}/authorize?${params}`;
}

/** Exchange an authorization code for tokens */
export async function exchangeCodeForTokens(
  code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${CS_API_BASE}/apps-api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CS token exchange failed: ${err}`);
  }

  return res.json();
}

/** Refresh an expired access token */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`${CS_API_BASE}/apps-api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CS token refresh failed: ${err}`);
  }

  return res.json();
}

/** Fetch user info from Contentstack management API */
export async function fetchUserInfo(
  accessToken: string
): Promise<{ email: string; display_name: string; organization_uid?: string }> {
  const res = await fetch(`${CS_API_BASE}/v3/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch CS user info: ${res.status}`);
  }

  const data = await res.json();
  const user = data.user;
  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  const display_name = `${firstName} ${lastName}`.trim() || user.email;

  // Extract first org UID if available
  const organization_uid = user.organizations?.length
    ? user.organizations[0].uid
    : undefined;

  return {
    email: user.email,
    display_name,
    organization_uid,
  };
}

// ============================================
// Cookie / session operations
// ============================================

/** Store encrypted session in an HTTP-only cookie */
export async function storeSession(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  userInfo: { email: string; display_name: string; organization_uid?: string }
): Promise<void> {
  const sessionData: SessionData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    email: userInfo.email,
    display_name: userInfo.display_name,
    organization_uid: userInfo.organization_uid,
  };

  const encrypted = await encrypt(JSON.stringify(sessionData));
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/** Read and decrypt session from the cookie. Auto-refreshes if token is near expiry. */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    const sessionData: SessionData = JSON.parse(await decrypt(cookie.value));

    // If token expires within 5 minutes, refresh it
    if (sessionData.expires_at < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshAccessToken(sessionData.refresh_token);
        sessionData.access_token = refreshed.access_token;
        sessionData.expires_at = Date.now() + refreshed.expires_in * 1000;

        // Update cookie with refreshed tokens
        const encrypted = await encrypt(JSON.stringify(sessionData));
        cookieStore.set(COOKIE_NAME, encrypted, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
          path: '/',
        });
      } catch {
        // Refresh failed — session is invalid
        return null;
      }
    }

    return sessionData;
  } catch {
    return null;
  }
}

/** Get a valid access token, or null if not authenticated */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token || null;
}

/** Clear the session cookie */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Decrypt session from a raw cookie value — for use in middleware
 * where cookies() from next/headers is not available.
 */
export async function decryptSessionFromValue(cookieValue: string): Promise<SessionData | null> {
  try {
    return JSON.parse(await decrypt(cookieValue));
  } catch {
    return null;
  }
}
