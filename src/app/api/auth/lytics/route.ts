import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'lytics_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Simple AES-GCM encryption using a stable secret
function getSecret(): string {
  // Reuse an existing cookie secret, or fall back to a default for dev
  return (
    process.env.CONTENTSTACK_OAUTH_COOKIE_SECRET ||
    process.env.GOOGLE_DRIVE_COOKIE_SECRET ||
    'spark-foundry-lytics-default-secret-key!'
  );
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32));
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getSecret());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Buffer.from(combined).toString('base64');
}

async function decrypt(encrypted: string): Promise<string> {
  const key = await deriveKey(getSecret());
  const combined = Buffer.from(encrypted, 'base64');
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * POST /api/auth/lytics — Connect: validate token and store in encrypted cookie
 * Body: { token: string }
 */
export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };

    if (!token || !token.trim()) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Validate the token against the Lytics API
    const res = await fetch('https://api.lytics.io/v2/segment?limit=1&sizes=true', {
      headers: { Authorization: token.trim() },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Invalid token — Lytics API returned ${res.status}` },
        { status: 401 },
      );
    }

    const data = await res.json();
    const firstSeg = data.data?.[0] as Record<string, unknown> | undefined;
    const aid = firstSeg?.aid ?? '';

    // Store encrypted token in cookie
    const encrypted = await encrypt(token.trim());
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });

    return NextResponse.json({ success: true, aid });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Connection failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/auth/lytics — Disconnect: clear the cookie
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ success: true });
}

/**
 * GET /api/auth/lytics — Get stored token (server-side only helper)
 * Returns the decrypted token or null.
 */
export async function GET() {
  const token = await getLyticsToken();
  return NextResponse.json({ configured: !!token });
}

/** Read the Lytics token from cookie, falling back to env var */
export async function getLyticsToken(): Promise<string | null> {
  // Try cookie first (user-configured)
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (cookie?.value) {
      return await decrypt(cookie.value);
    }
  } catch {
    // Cookie decryption failed — fall through
  }

  // Fall back to env var
  return process.env.LYTICS_ACCESS_TOKEN || null;
}
