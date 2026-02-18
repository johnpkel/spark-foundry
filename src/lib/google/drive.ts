// ============================================
// Google Drive API v3 wrapper
// ============================================

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const MAX_EXPORT_BYTES = 100 * 1024; // 100KB cap

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string;
  thumbnailLink?: string;
  webViewLink: string;
  modifiedTime: string;
  owners?: { displayName: string; emailAddress: string }[];
}

interface DriveSearchResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

const DRIVE_FIELDS = 'nextPageToken,files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,owners)';

/** Run a single Drive files.list request with the given query filter. */
async function driveList(
  accessToken: string,
  q: string,
  pageSize: number,
  pageToken?: string
): Promise<DriveSearchResponse> {
  const params = new URLSearchParams({
    q,
    fields: DRIVE_FIELDS,
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${err}`);
  }

  return res.json();
}

/**
 * Search the user's Google Drive for files matching a query.
 * Title matches are returned first (sorted by modifiedTime desc),
 * then backfilled with full-text content matches (deduplicated).
 */
export async function searchDriveFiles(
  accessToken: string,
  query: string,
  pageToken?: string
): Promise<DriveSearchResponse> {
  const escaped = query.replace(/'/g, "\\'");

  // Pass 1: title matches
  const titleQuery = `name contains '${escaped}' and trashed = false`;
  const titleResults = await driveList(accessToken, titleQuery, 20, pageToken);

  // Pass 2: full-text matches (backfill), skip if we already have 20 title hits
  const titleIds = new Set(titleResults.files.map((f) => f.id));
  let backfill: DriveFile[] = [];

  if (titleResults.files.length < 20) {
    const fullTextQuery = `fullText contains '${escaped}' and trashed = false`;
    const fullTextResults = await driveList(
      accessToken,
      fullTextQuery,
      20 - titleResults.files.length
    );
    backfill = fullTextResults.files.filter((f) => !titleIds.has(f.id));
  }

  return {
    files: [...titleResults.files, ...backfill],
    nextPageToken: titleResults.nextPageToken,
  };
}

/**
 * Map a Drive MIME type to a human-readable label.
 */
export function getDriveFileLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/pdf': 'PDF',
    'text/plain': 'Text File',
    'text/csv': 'CSV',
    'text/html': 'HTML',
    'application/json': 'JSON',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
    'image/gif': 'GIF Image',
    'image/svg+xml': 'SVG Image',
    'video/mp4': 'MP4 Video',
    'audio/mpeg': 'MP3 Audio',
  };
  return labels[mimeType] || 'File';
}

// Workspace MIME types that need export (not direct download)
const EXPORT_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.drawing': 'image/svg+xml',
};

// MIME types we can download directly and extract text from
const DOWNLOADABLE_TEXT_TYPES = [
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
  'application/pdf',
];

/**
 * Export/download file content as text. Returns null for non-exportable types
 * (video, audio, binary images, etc.).
 */
export async function exportFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Google Workspace files: use export endpoint
  const exportMime = EXPORT_MAP[mimeType];
  if (exportMime) {
    const params = new URLSearchParams({ mimeType: exportMime });
    const res = await fetch(`${DRIVE_FILES_URL}/${fileId}/export?${params}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_EXPORT_BYTES);
  }

  // Downloadable text files: use media download
  if (DOWNLOADABLE_TEXT_TYPES.some((t) => mimeType.startsWith(t))) {
    const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, { headers });
    if (!res.ok) return null;

    // For PDFs, we can't easily extract text without a library —
    // return a placeholder noting it's a PDF
    if (mimeType === 'application/pdf') {
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_EXPORT_BYTES) {
        return '[PDF file — content too large to process inline]';
      }
      // Basic text extraction: look for text streams in the PDF
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      // Filter to printable ASCII/Unicode — crude but serviceable
      const readable = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, ' ').trim();
      return readable.slice(0, MAX_EXPORT_BYTES) || '[PDF file — no extractable text]';
    }

    const text = await res.text();
    return text.slice(0, MAX_EXPORT_BYTES);
  }

  // Non-exportable types (images, video, audio, binary)
  return null;
}
