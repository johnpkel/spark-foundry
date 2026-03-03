/**
 * Microsoft Clarity Data Export API client.
 *
 * API docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export
 * Constraints: 10 requests/day, 1-3 days of data, max 1000 rows, max 3 dimensions per request.
 */

import { addLogEntry } from '@/lib/activity-logger';

const CLARITY_API_URL =
  'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export interface ClarityMetricData {
  metricName: string;
  information: Record<string, unknown>[];
}

/**
 * Fetch live insights from the Clarity Data Export API.
 */
export async function fetchClarityInsights(
  numOfDays: number,
  dimensions?: string[]
): Promise<ClarityMetricData[]> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    throw new Error('CLARITY_API_TOKEN is not configured');
  }

  const params = new URLSearchParams({ numOfDays: String(numOfDays) });
  if (dimensions) {
    dimensions.forEach((dim, i) => {
      params.set(`dimension${i + 1}`, dim);
    });
  }

  const url = `${CLARITY_API_URL}?${params.toString()}`;
  const start = Date.now();
  const label = dimensions && dimensions.length > 0 ? `${numOfDays}d by ${dimensions.join(', ')}` : `${numOfDays}d overall`;
  const correlationId = `clarity_${Date.now()}`;

  addLogEntry({
    service: 'clarity',
    direction: 'request',
    level: 'info',
    method: 'GET',
    url,
    summary: `Clarity insights — ${label}`,
    requestBody: { numOfDays, dimensions },
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
    const body = await res.text();
    addLogEntry({
      service: 'clarity',
      direction: 'response',
      level: 'error',
      method: 'GET',
      url,
      summary: `Clarity insights — ${res.status}`,
      statusCode: res.status,
      duration,
      error: body,
      correlationId,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Clarity auth failed (${res.status}): check your CLARITY_API_TOKEN`);
    }
    if (res.status === 429) {
      throw new Error('Clarity rate limit exceeded (10 requests/day). Try again tomorrow.');
    }
    throw new Error(`Clarity API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  addLogEntry({
    service: 'clarity',
    direction: 'response',
    level: 'info',
    method: 'GET',
    url,
    summary: `Clarity insights — 200 (${Array.isArray(data) ? data.length : 1} metric${Array.isArray(data) && data.length !== 1 ? 's' : ''})`,
    statusCode: 200,
    duration,
    correlationId,
  });

  return data;
}

/**
 * Format a single Clarity metric into human-readable text for embedding.
 * Uses a generic approach since different metrics have different field shapes.
 */
export function formatMetricAsText(
  metric: ClarityMetricData,
  dimensions: string[]
): string {
  const lines: string[] = [];
  lines.push(`Metric: ${metric.metricName}`);
  if (dimensions.length > 0) {
    lines.push(`Dimensions: ${dimensions.join(', ')}`);
  }
  lines.push('---');

  if (!metric.information || metric.information.length === 0) {
    lines.push('No data available.');
    return lines.join('\n');
  }

  for (const row of metric.information) {
    // Build a label from the dimension values in this row
    const dimLabel = dimensions
      .map((d) => row[d] ?? row[d.toLowerCase()])
      .filter(Boolean)
      .join(' / ');

    const dataFields = Object.entries(row)
      .filter(([key]) => {
        // Exclude dimension keys from the data fields
        const lower = key.toLowerCase();
        return !dimensions.some((d) => d.toLowerCase() === lower);
      })
      .map(([key, value]) => {
        const formatted = typeof value === 'number'
          ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
          : String(value);
        return `${humanizeKey(key)}: ${formatted}`;
      });

    if (dimLabel) {
      lines.push(`${dimLabel}: ${dataFields.join(', ')}`);
    } else {
      lines.push(dataFields.join(', '));
    }
  }

  return lines.join('\n');
}

/** Convert camelCase/PascalCase keys to human-readable labels. */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Predefined dimension strategies for maximizing data coverage
 * within the 10 requests/day limit.
 */
export const IMPORT_CALLS: { label: string; dimensions: string[] }[] = [
  { label: 'Overall', dimensions: [] },
  { label: 'by URL', dimensions: ['URL'] },
  { label: 'by Device, Browser', dimensions: ['Device', 'Browser'] },
  { label: 'by Country/Region, Source', dimensions: ['Country/Region', 'Source'] },
];
