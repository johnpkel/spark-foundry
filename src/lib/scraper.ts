/**
 * Lightweight webpage scraper using cheerio.
 *
 * Extracts Open Graph metadata, page text, and image URLs from a given URL.
 * Designed to run in a serverless context — no browser engine required.
 */

import * as cheerio from 'cheerio';

export interface ScrapeResult {
  og_title?: string;
  og_description?: string;
  og_image?: string;
  favicon?: string;
  text: string;
  images: string[];
}

const TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 50_000;
const MAX_IMAGES = 10;

/**
 * Scrape a webpage and extract structured content.
 * Returns null on any failure (timeout, invalid URL, network error, etc.)
 */
export async function scrapePage(url: string): Promise<ScrapeResult | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SparkFoundry/1.0; +https://sparkfoundry.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Open Graph & meta extraction ---
    const og_title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      undefined;

    const og_description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined;

    const og_image = resolveUrl(
      url,
      $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content')
    );

    const favicon = resolveUrl(
      url,
      $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href')
    ) || new URL('/favicon.ico', url).href;

    // --- Text extraction ---
    // Remove non-content elements before extracting text
    $('script, style, nav, header, footer, noscript, iframe, svg').remove();
    const rawText = $('body').text().replace(/\s+/g, ' ').trim();
    const text = rawText.slice(0, MAX_TEXT_LENGTH);

    // --- Image extraction ---
    const images: string[] = [];
    const seen = new Set<string>();

    $('img').each((_, el) => {
      if (images.length >= MAX_IMAGES) return false;

      const src = $(el).attr('src');
      if (!src) return;

      // Skip data URIs and tracking pixels
      if (src.startsWith('data:')) return;
      if (src.includes('pixel') || src.includes('tracking') || src.includes('beacon')) return;

      // Skip tiny images (likely icons/spacers)
      const width = parseInt($(el).attr('width') || '0', 10);
      const height = parseInt($(el).attr('height') || '0', 10);
      if ((width > 0 && width < 100) || (height > 0 && height < 100)) return;

      const resolved = resolveUrl(url, src);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    });

    return { og_title, og_description, og_image, favicon, text, images };
  } catch (err) {
    console.error('[scraper] Failed to scrape:', url, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Resolve a potentially relative URL against a base URL. */
function resolveUrl(base: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return new URL(path, base).href;
  } catch {
    return undefined;
  }
}
