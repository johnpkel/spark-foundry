/**
 * Contentstack Management API — read/write operations.
 *
 * Auth priority:
 * 1. CONTENTSTACK_MANAGEMENT_TOKEN env var → uses `authtoken` header
 * 2. OAuth session from oauth.ts → uses `Authorization: Bearer` header
 *
 * API key priority:
 * 1. Explicit `apiKey` parameter
 * 2. CONTENTSTACK_API_KEY env var
 */

import { addLogEntry } from '@/lib/activity-logger';
import { getSession } from './oauth';
import type { CSContentType, CSEntry } from './api';

const CS_API_BASE = 'https://api.contentstack.io/v3';

// ─── Helper ────────────────────────────────────

async function csRequest<T>(
  method: string,
  path: string,
  apiKey?: string,
  body?: unknown
): Promise<T> {
  const envApiKey = process.env.CONTENTSTACK_API_KEY;
  const mgmtToken = process.env.CONTENTSTACK_MANAGEMENT_TOKEN;
  // Always prefer env vars — ignore any api_key passed by the LLM
  const effectiveApiKey = envApiKey || apiKey;

  if (!effectiveApiKey) {
    throw new Error(
      'No Contentstack API key available. Provide api_key or set CONTENTSTACK_API_KEY env var.'
    );
  }

  const url = `${CS_API_BASE}${path}`;
  const start = Date.now();
  const correlationId = `cs_${Date.now()}`;

  addLogEntry({
    service: 'contentstack',
    direction: 'request',
    level: 'info',
    method,
    url,
    summary: `${method} ${path}`,
    correlationId,
  });

  // Build auth headers: management token (env) takes priority over OAuth
  let authHeaders: Record<string, string>;

  if (mgmtToken) {
    authHeaders = {
      authorization: mgmtToken,
      api_key: effectiveApiKey,
      'Content-Type': 'application/json',
    };
  } else {
    const session = await getSession();
    if (!session) {
      throw new Error(
        'Contentstack session not found. Set CONTENTSTACK_MANAGEMENT_TOKEN env var ' +
        'or authenticate via the Contentstack integration.'
      );
    }
    authHeaders = {
      Authorization: `Bearer ${session.access_token}`,
      api_key: effectiveApiKey,
      'Content-Type': 'application/json',
    };
  }

  const res = await fetch(url, {
    method,
    headers: authHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const duration = Date.now() - start;

  if (!res.ok) {
    const text = await res.text();
    addLogEntry({
      service: 'contentstack',
      direction: 'response',
      level: 'error',
      method,
      url,
      summary: `${method} ${path} — ${res.status}`,
      statusCode: res.status,
      duration,
      error: text,
      correlationId,
    });

    if (res.status === 403) {
      throw new Error(
        'Contentstack permission denied (403). Check your management token or re-authenticate via OAuth.'
      );
    }

    throw new Error(`CS API ${method} ${path} failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as T;
  addLogEntry({
    service: 'contentstack',
    direction: 'response',
    level: 'info',
    method,
    url,
    summary: `${method} ${path} — ${res.status}`,
    statusCode: res.status,
    duration,
    correlationId,
  });

  return data;
}

// ─── Content type operations ───────────────────

export async function listContentTypes(
  apiKey?: string
): Promise<CSContentType[]> {
  const allTypes: CSContentType[] = [];
  let skip = 0;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await csRequest<{ content_types: CSContentType[]; count: number }>(
      'GET',
      `/content_types?include_count=true&limit=${limit}&skip=${skip}`,
      apiKey
    );
    allTypes.push(...(data.content_types || []));
    if (allTypes.length >= data.count || data.content_types.length < limit) break;
    skip += limit;
  }

  return allTypes;
}

export async function getContentTypeSchema(
  contentTypeUid: string,
  apiKey?: string
): Promise<CSContentType> {
  const data = await csRequest<{ content_type: CSContentType }>(
    'GET',
    `/content_types/${contentTypeUid}`,
    apiKey
  );
  return data.content_type;
}

// ─── Entry operations ──────────────────────────

export async function listEntries(
  contentTypeUid: string,
  options?: { skip?: number; limit?: number },
  apiKey?: string
): Promise<{ entries: CSEntry[]; count: number }> {
  const skip = options?.skip || 0;
  const limit = Math.min(options?.limit || 100, 100);
  const data = await csRequest<{ entries: CSEntry[]; count: number }>(
    'GET',
    `/content_types/${contentTypeUid}/entries?include_count=true&limit=${limit}&skip=${skip}`,
    apiKey
  );
  return { entries: data.entries || [], count: data.count || 0 };
}

export async function getEntry(
  contentTypeUid: string,
  entryUid: string,
  apiKey?: string
): Promise<Record<string, unknown>> {
  const data = await csRequest<{ entry: Record<string, unknown> }>(
    'GET',
    `/content_types/${contentTypeUid}/entries/${entryUid}`,
    apiKey
  );
  return data.entry;
}

export async function searchEntries(
  contentTypeUid: string,
  query?: Record<string, unknown>,
  limit = 25,
  apiKey?: string
): Promise<{ entries: Record<string, unknown>[]; count: number }> {
  let path = `/content_types/${contentTypeUid}/entries?include_count=true&limit=${Math.min(limit, 100)}`;
  if (query) {
    path += `&query=${encodeURIComponent(JSON.stringify(query))}`;
  }
  return csRequest<{ entries: Record<string, unknown>[]; count: number }>('GET', path, apiKey);
}

export async function createEntry(
  contentTypeUid: string,
  entryData: Record<string, unknown>,
  locale = 'en-us',
  apiKey?: string
): Promise<Record<string, unknown>> {
  const data = await csRequest<{ entry: Record<string, unknown> }>(
    'POST',
    `/content_types/${contentTypeUid}/entries?locale=${locale}`,
    apiKey,
    { entry: entryData }
  );
  return data.entry;
}

export async function updateEntry(
  contentTypeUid: string,
  entryUid: string,
  entryData: Record<string, unknown>,
  locale = 'en-us',
  apiKey?: string
): Promise<Record<string, unknown>> {
  const data = await csRequest<{ entry: Record<string, unknown> }>(
    'PUT',
    `/content_types/${contentTypeUid}/entries/${entryUid}?locale=${locale}`,
    apiKey,
    { entry: entryData }
  );
  return data.entry;
}

export async function deleteEntry(
  contentTypeUid: string,
  entryUid: string,
  apiKey?: string
): Promise<void> {
  await csRequest<{ notice: string }>(
    'DELETE',
    `/content_types/${contentTypeUid}/entries/${entryUid}`,
    apiKey
  );
}

export async function publishEntry(
  contentTypeUid: string,
  entryUid: string,
  environments: string[],
  locales: string[],
  apiKey?: string
): Promise<void> {
  await csRequest<{ notice: string }>(
    'POST',
    `/content_types/${contentTypeUid}/entries/${entryUid}/publish`,
    apiKey,
    {
      entry: { environments, locales },
      locale: locales[0] ?? 'en-us',
      version: 1,
    }
  );
}

export async function unpublishEntry(
  contentTypeUid: string,
  entryUid: string,
  environments: string[],
  locales: string[],
  apiKey?: string
): Promise<void> {
  await csRequest<{ notice: string }>(
    'POST',
    `/content_types/${contentTypeUid}/entries/${entryUid}/unpublish`,
    apiKey,
    {
      entry: { environments, locales },
      locale: locales[0] ?? 'en-us',
    }
  );
}

export async function getEntryReferences(
  contentTypeUid: string,
  entryUid: string,
  apiKey?: string
): Promise<Record<string, unknown>[]> {
  const data = await csRequest<{ references: Record<string, unknown>[] }>(
    'GET',
    `/content_types/${contentTypeUid}/entries/${entryUid}/references`,
    apiKey
  );
  return data.references || [];
}

export async function getEntryLanguages(
  contentTypeUid: string,
  entryUid: string,
  apiKey?: string
): Promise<Record<string, unknown>[]> {
  const data = await csRequest<{ locales: Record<string, unknown>[] }>(
    'GET',
    `/content_types/${contentTypeUid}/entries/${entryUid}/locales`,
    apiKey
  );
  return data.locales || [];
}

// ─── Environment & Language operations ──────────

export async function listEnvironments(
  apiKey?: string
): Promise<{ name: string; uid: string; urls: Record<string, unknown>[] }[]> {
  const data = await csRequest<{
    environments: { name: string; uid: string; urls: Record<string, unknown>[] }[];
  }>('GET', '/environments', apiKey);
  return data.environments || [];
}

export async function listLanguages(
  apiKey?: string
): Promise<{ code: string; name: string; uid: string }[]> {
  const data = await csRequest<{
    locales: { code: string; name: string; uid: string }[];
  }>('GET', '/locales', apiKey);
  return data.locales || [];
}
