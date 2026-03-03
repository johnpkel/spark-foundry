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

export interface ListStacksResult {
  stacks: CSStack[];
  _debug: string[];
}

export async function listStacks(
  token: string,
  orgUid?: string
): Promise<ListStacksResult> {
  const debug: string[] = [];

  // Strategy 1: Try GET /v3/stacks with organization_uid header
  if (orgUid) {
    try {
      debug.push(`S1: GET /v3/stacks with organization_uid=${orgUid}`);
      const data = await csGet<{ stacks: CSStack[] }>(
        '/stacks',
        token,
        undefined,
        { organization_uid: orgUid }
      );
      debug.push(`S1 result: ${data.stacks?.length ?? 0} stacks`);
      if (data.stacks?.length) return { stacks: data.stacks, _debug: debug };
    } catch (err) {
      debug.push(`S1 error: ${(err as Error).message}`);
    }
  } else {
    debug.push('S1: skipped (no orgUid in session)');
  }

  // Strategy 2: Try GET /v3/stacks without org header
  try {
    debug.push('S2: GET /v3/stacks (no org header)');
    const data = await csGet<{ stacks: CSStack[] }>('/stacks', token);
    debug.push(`S2 result: ${data.stacks?.length ?? 0} stacks`);
    if (data.stacks?.length) return { stacks: data.stacks, _debug: debug };
  } catch (err) {
    debug.push(`S2 error: ${(err as Error).message}`);
  }

  // Strategy 3: List stacks via the organization-specific endpoint
  if (orgUid) {
    try {
      debug.push(`S3: GET /v3/organizations/${orgUid}/stacks`);
      const stacks = await listStacksFromOrg(token, orgUid);
      debug.push(`S3 result: ${stacks.length} stacks`);
      if (stacks.length) return { stacks, _debug: debug };
    } catch (err) {
      debug.push(`S3 error: ${(err as Error).message}`);
    }
  } else {
    debug.push('S3: skipped (no orgUid)');
  }

  // Strategy 4: Extract stacks from GET /v3/user profile (last resort)
  try {
    debug.push('S4: GET /v3/user (profile extraction)');
    const stacks = await listStacksFromUserProfile(token);
    debug.push(`S4 result: ${stacks.length} stacks`);
    return { stacks, _debug: debug };
  } catch (err) {
    debug.push(`S4 error: ${(err as Error).message}`);
    return { stacks: [], _debug: debug };
  }
}

/**
 * List stacks via GET /v3/organizations/{uid}/stacks — the org-scoped endpoint
 * that works reliably with OAuth tokens that have organization:read scope.
 */
async function listStacksFromOrg(token: string, orgUid: string): Promise<CSStack[]> {
  const url = `${CS_API_BASE}/organizations/${orgUid}/stacks`;
  const start = Date.now();
  const correlationId = `cs_${Date.now()}`;

  addLogEntry({
    service: 'contentstack',
    direction: 'request',
    level: 'info',
    method: 'GET',
    url,
    summary: `/organizations/${orgUid}/stacks`,
    correlationId,
  });

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
      summary: `/organizations/${orgUid}/stacks — ${res.status}`,
      statusCode: res.status,
      duration,
      error: text,
      correlationId,
    });
    throw new Error(`CS API /organizations/${orgUid}/stacks failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  addLogEntry({
    service: 'contentstack',
    direction: 'response',
    level: 'info',
    method: 'GET',
    url,
    summary: `/organizations/${orgUid}/stacks — 200`,
    statusCode: 200,
    duration,
    correlationId,
  });

  const rawStacks = data.stacks || [];
  return rawStacks.map((s: Record<string, unknown>) => ({
    api_key: s.api_key as string,
    name: s.name as string,
    uid: s.uid as string,
    org_uid: (s.org_uid as string) || orgUid,
    master_locale: (s.master_locale as string) || 'en-us',
  }));
}

/**
 * Extract stacks from the /v3/user response.
 * Checks multiple locations where Contentstack may nest stack info:
 * org.stacks[], org.roles[].stack, and top-level user.stacks[].
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
  const seen = new Set<string>();
  const stacks: CSStack[] = [];

  function addStack(s: Record<string, unknown>, orgUid: string) {
    const apiKey = s.api_key as string;
    if (!apiKey || seen.has(apiKey)) return;
    seen.add(apiKey);
    stacks.push({
      api_key: apiKey,
      name: (s.name as string) || apiKey,
      uid: (s.uid as string) || '',
      org_uid: orgUid,
      master_locale: (s.master_locale as string) || 'en-us',
    });
  }

  // Check organizations[].stacks[] (direct listing)
  if (Array.isArray(user.organizations)) {
    for (const org of user.organizations) {
      const orgUid = org.uid || '';
      if (Array.isArray(org.stacks)) {
        for (const stack of org.stacks) addStack(stack, orgUid);
      }
      // Check organizations[].roles[].stack (role-based access)
      if (Array.isArray(org.roles)) {
        for (const role of org.roles) {
          if (role.stack && typeof role.stack === 'object') {
            addStack(role.stack, orgUid);
          }
        }
      }
    }
  }

  // Also check top-level stacks array
  if (Array.isArray(user.stacks)) {
    for (const stack of user.stacks) {
      addStack(stack, (stack.org_uid as string) || '');
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
