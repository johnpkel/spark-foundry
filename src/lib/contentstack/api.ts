/**
 * Typed wrapper around the Contentstack Management API (v3).
 * All calls use Authorization: Bearer {token} + api_key header.
 */

import { addLogEntry } from '@/lib/activity-logger';

const CS_API_BASE = 'https://api.contentstack.io/v3';

// ─── Interfaces ────────────────────────────────

export interface CSStack {
  api_key: string;
  name: string;
  uid: string;
  org_uid: string;
  master_locale: string;
}

export interface CSContentType {
  uid: string;
  title: string;
  description?: string;
  schema: CSFieldSchema[];
}

export interface CSFieldSchema {
  uid: string;
  display_name: string;
  data_type: string;
  field_metadata?: Record<string, unknown>;
  schema?: CSFieldSchema[]; // for groups/blocks
  blocks?: Array<{ uid: string; title: string; schema: CSFieldSchema[] }>;
}

export interface CSEntry {
  uid: string;
  title: string;
  url?: string;
  locale: string;
  [key: string]: unknown;
}

export interface CSAsset {
  uid: string;
  title: string;
  filename: string;
  url: string;
  content_type: string; // MIME
  file_size: number;
  description?: string;
}

export interface CSAssetFolder {
  uid: string;
  name: string;
  is_dir: boolean;
  parent_uid?: string;
}

// ─── Helper ────────────────────────────────────

function headers(token: string, apiKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (apiKey) h['api_key'] = apiKey;
  return h;
}

async function csGet<T>(
  path: string,
  token: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = `${CS_API_BASE}${path}`;
  const start = Date.now();
  const correlationId = `cs_${Date.now()}`;

  addLogEntry({
    service: 'contentstack',
    direction: 'request',
    level: 'info',
    method: 'GET',
    url,
    summary: path,
    correlationId,
  });

  const res = await fetch(url, {
    headers: { ...headers(token, apiKey), ...extraHeaders },
  });

  const duration = Date.now() - start;

  if (!res.ok) {
    const text = await res.text();
    addLogEntry({
      service: 'contentstack',
      direction: 'response',
      level: 'error',
      method: 'GET',
      url,
      summary: `${path} — ${res.status}`,
      statusCode: res.status,
      duration,
      error: text,
      correlationId,
    });
    throw new Error(`CS API ${path} failed (${res.status}): ${text}`);
  }

  const data = await res.json() as T;
  addLogEntry({
    service: 'contentstack',
    direction: 'response',
    level: 'info',
    method: 'GET',
    url,
    summary: `${path} — 200`,
    statusCode: 200,
    duration,
    correlationId,
  });

  return data;
}

// ─── API Functions ─────────────────────────────

export async function listStacks(
  token: string,
  orgUid?: string
): Promise<CSStack[]> {
  // Strategy 1: Try GET /v3/stacks with organization_uid header
  if (orgUid) {
    try {
      const data = await csGet<{ stacks: CSStack[] }>(
        '/stacks',
        token,
        undefined,
        { organization_uid: orgUid }
      );
      return data.stacks || [];
    } catch (err) {
      console.log('[listStacks] Org-level /v3/stacks failed:', (err as Error).message);
    }
  }

  // Strategy 2: Try GET /v3/stacks without org header
  try {
    const data = await csGet<{ stacks: CSStack[] }>('/stacks', token);
    return data.stacks || [];
  } catch (err) {
    console.log('[listStacks] User-level /v3/stacks failed:', (err as Error).message);
  }

  // Strategy 3: Extract stacks from GET /v3/user (always works with OAuth)
  console.log('[listStacks] Falling back to /v3/user stacks extraction');
  return listStacksFromUserProfile(token);
}

/**
 * Extract stacks from the /v3/user response.
 * The user endpoint returns "details of the stacks owned by and shared with"
 * the user — a reliable fallback when /v3/stacks is forbidden.
 */
async function listStacksFromUserProfile(token: string): Promise<CSStack[]> {
  const res = await fetch(`${CS_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`);
  }

  const data = await res.json();
  const user = data.user;

  // The user response nests stacks under each organization
  const stacks: CSStack[] = [];
  if (Array.isArray(user.organizations)) {
    for (const org of user.organizations) {
      if (Array.isArray(org.stacks)) {
        for (const stack of org.stacks) {
          stacks.push({
            api_key: stack.api_key,
            name: stack.name,
            uid: stack.uid,
            org_uid: org.uid,
            master_locale: stack.master_locale || 'en-us',
          });
        }
      }
    }
  }

  // Also check top-level stacks array (some responses include it)
  if (stacks.length === 0 && Array.isArray(user.stacks)) {
    for (const stack of user.stacks) {
      stacks.push({
        api_key: stack.api_key,
        name: stack.name,
        uid: stack.uid,
        org_uid: stack.org_uid || '',
        master_locale: stack.master_locale || 'en-us',
      });
    }
  }

  return stacks;
}

export async function listContentTypes(
  token: string,
  apiKey: string
): Promise<CSContentType[]> {
  const allTypes: CSContentType[] = [];
  let skip = 0;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await csGet<{ content_types: CSContentType[]; count: number }>(
      `/content_types?include_count=true&limit=${limit}&skip=${skip}`,
      token,
      apiKey
    );
    allTypes.push(...(data.content_types || []));
    if (allTypes.length >= data.count || data.content_types.length < limit) break;
    skip += limit;
  }

  return allTypes;
}

export async function getContentTypeSchema(
  token: string,
  apiKey: string,
  ctUid: string
): Promise<CSContentType> {
  const data = await csGet<{ content_type: CSContentType }>(
    `/content_types/${ctUid}`,
    token,
    apiKey
  );
  return data.content_type;
}

export async function listEntries(
  token: string,
  apiKey: string,
  ctUid: string,
  options: { skip?: number; limit?: number } = {}
): Promise<{ entries: CSEntry[]; count: number }> {
  const skip = options.skip || 0;
  const limit = Math.min(options.limit || 100, 100);
  const data = await csGet<{ entries: CSEntry[]; count: number }>(
    `/content_types/${ctUid}/entries?include_count=true&limit=${limit}&skip=${skip}`,
    token,
    apiKey
  );
  return { entries: data.entries || [], count: data.count || 0 };
}

export async function listAssets(
  token: string,
  apiKey: string,
  options: { skip?: number; limit?: number; folder?: string } = {}
): Promise<{ assets: CSAsset[]; count: number }> {
  const skip = options.skip || 0;
  const limit = Math.min(options.limit || 100, 100);
  let path = `/assets?include_count=true&limit=${limit}&skip=${skip}`;
  if (options.folder) {
    path += `&folder=${options.folder}`;
  }
  const data = await csGet<{ assets: CSAsset[]; count: number }>(
    path,
    token,
    apiKey
  );
  return { assets: data.assets || [], count: data.count || 0 };
}

export async function listAssetFolders(
  token: string,
  apiKey: string
): Promise<CSAssetFolder[]> {
  const data = await csGet<{ asset_folders: CSAssetFolder[] }>(
    '/asset_folders',
    token,
    apiKey
  );
  return data.asset_folders || [];
}

// ─── Entry Text Extraction ────────────────────

const TEXT_CAP = 16_000;

/**
 * Walk a content type schema to extract meaningful text from an entry.
 * Produces "Field Label: value\n" per field, concatenated.
 */
export function extractTextFromEntry(
  entry: Record<string, unknown>,
  schema: CSFieldSchema[]
): string {
  const parts: string[] = [];

  for (const field of schema) {
    const value = entry[field.uid];
    if (value === undefined || value === null) continue;

    const extracted = extractFieldValue(value, field);
    if (extracted) {
      parts.push(`${field.display_name}: ${extracted}`);
    }
  }

  return parts.join('\n').slice(0, TEXT_CAP);
}

function extractFieldValue(
  value: unknown,
  field: CSFieldSchema
): string | null {
  const dt = field.data_type;

  // Skip non-textual types
  if (['number', 'boolean', 'isodate', 'reference', 'file', 'link'].includes(dt)) {
    return null;
  }

  // Plain text
  if (dt === 'text') {
    if (typeof value === 'string') return value;
    return null;
  }

  // JSON RTE (Rich Text Editor) — walk tree for .text nodes
  if (dt === 'json_rte' || dt === 'json') {
    return extractJsonRteText(value);
  }

  // Markdown
  if (field.field_metadata?.markdown && typeof value === 'string') {
    return value;
  }

  // Group — recurse into nested schema
  if (dt === 'group' && field.schema && typeof value === 'object' && value !== null) {
    return extractTextFromEntry(value as Record<string, unknown>, field.schema);
  }

  // Modular Blocks — iterate blocks, recurse each
  if (dt === 'blocks' && field.blocks && Array.isArray(value)) {
    const blockTexts: string[] = [];
    for (const blockEntry of value as Record<string, unknown>[]) {
      for (const blockDef of field.blocks) {
        const blockData = blockEntry[blockDef.uid];
        if (blockData && typeof blockData === 'object') {
          const text = extractTextFromEntry(
            blockData as Record<string, unknown>,
            blockDef.schema
          );
          if (text) blockTexts.push(text);
        }
      }
    }
    return blockTexts.length > 0 ? blockTexts.join('\n') : null;
  }

  // Global field — try string coercion
  if (dt === 'global_field' && field.schema && typeof value === 'object' && value !== null) {
    return extractTextFromEntry(value as Record<string, unknown>, field.schema);
  }

  // Fallback for unknown text-like types
  if (typeof value === 'string') return value;

  return null;
}

/** Walk a JSON RTE tree and extract all text nodes. */
function extractJsonRteText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;

  const n = node as Record<string, unknown>;

  // Leaf text node
  if (typeof n.text === 'string') {
    return n.text;
  }

  // Children array
  if (Array.isArray(n.children)) {
    const texts = n.children
      .map((child: unknown) => extractJsonRteText(child))
      .filter(Boolean);
    return texts.length > 0 ? texts.join(' ') : null;
  }

  // Top-level with content array (common RTE wrapper)
  if (Array.isArray(n.content)) {
    const texts = n.content
      .map((child: unknown) => extractJsonRteText(child))
      .filter(Boolean);
    return texts.length > 0 ? texts.join(' ') : null;
  }

  return null;
}
