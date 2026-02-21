'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Link2, Image, FileText, StickyNote, File, ExternalLink, X, Loader2, Globe, HardDrive, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { SparkItem } from '@/lib/types';

interface ItemCardProps {
  item: SparkItem;
  onDelete: (id: string) => void;
  onItemUpdated?: (updated: SparkItem) => void;
  onImageClick?: (src: string, alt?: string) => void;
}

const typeConfig = {
  link: { icon: Link2, color: 'bg-venus-blue-light text-venus-blue', label: 'Link' },
  image: { icon: Image, color: 'bg-venus-green-light text-venus-green', label: 'Image' },
  text: { icon: FileText, color: 'bg-venus-purple-light text-venus-purple', label: 'Text' },
  file: { icon: File, color: 'bg-venus-yellow-light text-venus-yellow', label: 'File' },
  note: { icon: StickyNote, color: 'bg-venus-yellow-light text-venus-yellow', label: 'Note' },
  google_drive: { icon: HardDrive, color: 'bg-venus-green-light text-venus-green', label: 'Drive' },
  slack_message: { icon: MessageSquare, color: 'bg-venus-blue-light text-venus-blue', label: 'Slack' },
};

function getDriveLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/pdf': 'PDF',
  };
  return labels[mimeType] || 'Drive File';
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 15; // stop after 30s

export default function ItemCard({ item, onDelete, onItemUpdated, onImageClick }: ItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[item.type] || typeConfig.note;
  const Icon = config.icon;
  const url = item.metadata?.url || item.metadata?.image_url || item.metadata?.file_url || item.metadata?.drive_web_view_link || item.metadata?.slack_permalink;
  const tags = item.metadata?.tags as string[] | undefined;

  // Slack-specific data
  const isSlack = item.type === 'slack_message';
  const slackChannelName = item.metadata?.slack_channel_name as string | undefined;
  const slackMessageCount = item.metadata?.slack_message_count as number | undefined;

  // Link-specific scraped data
  const isLink = item.type === 'link';
  const scrapeStatus = item.metadata?.scrape_status as string | undefined;
  const isScraping = isLink && !scrapeStatus;

  // Drive-specific export data
  const isDrive = item.type === 'google_drive';
  const driveExportStatus = item.metadata?.drive_export_status as string | undefined;
  const isDriveExporting = isDrive && driveExportStatus === 'pending';

  // Poll for scraped/exported content
  const needsPolling = isScraping || isDriveExporting;
  const pollCount = useRef(0);
  useEffect(() => {
    if (!needsPolling || !onItemUpdated) return;
    pollCount.current = 0;

    const interval = setInterval(async () => {
      pollCount.current++;
      if (pollCount.current > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`/api/items/${item.id}`);
        if (!res.ok) return;
        const updated: SparkItem = await res.json();
        const done = isScraping
          ? !!updated.metadata?.scrape_status
          : updated.metadata?.drive_export_status !== 'pending';
        if (done) {
          clearInterval(interval);
          onItemUpdated(updated);
        }
      } catch {
        // Network error — will retry on next interval
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [needsPolling, isScraping, item.id, onItemUpdated]);
  const ogTitle = item.metadata?.og_title as string | undefined;
  const ogDescription = item.metadata?.og_description as string | undefined;
  const ogImage = item.metadata?.og_image as string | undefined;
  const favicon = item.metadata?.favicon as string | undefined;
  const scrapedImages = item.metadata?.scraped_images as string[] | undefined;
  const heroImage = ogImage || scrapedImages?.[0];

  // For link items, show OG description as primary, then scraped content excerpt separately
  // For non-link items, show content as before
  const displayContent = isLink ? null : item.content;
  // Scraped body text excerpt (different from OG description)
  const scrapedExcerpt = isLink && item.content && item.content !== item.metadata?.url
    ? item.content.slice(0, 300)
    : null;

  // Show expand button when there's content that gets truncated
  const hasExpandableContent = !!(
    (item.content && item.content.length > 100) ||
    (ogDescription && ogDescription.length > 150) ||
    scrapedExcerpt
  );

  return (
    <div className="bg-card-bg rounded-lg border border-venus-gray-200 p-4 hover:border-venus-purple/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${config.color}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm text-venus-gray-700 truncate">{item.title}</h4>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-venus-gray-100 text-venus-gray-500 uppercase tracking-wider font-medium shrink-0">
                {config.label}
              </span>
            </div>

            {/* Scraping in progress indicator */}
            {isScraping && (
              <div className="flex items-center gap-1.5 text-xs text-venus-gray-400 mb-2">
                <Loader2 size={12} className="animate-spin" />
                Fetching page details...
              </div>
            )}

            {/* Link item: OG title (when different from item title) + favicon */}
            {isLink && ogTitle && ogTitle !== item.title && (
              <div className="flex items-center gap-1.5 mb-1">
                {favicon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favicon}
                    alt=""
                    className="w-3.5 h-3.5 shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="text-xs text-venus-gray-500 truncate">{ogTitle}</span>
              </div>
            )}

            {/* Link item: favicon without OG title */}
            {isLink && favicon && (!ogTitle || ogTitle === item.title) && (
              <div className="flex items-center gap-1.5 mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={favicon}
                  alt=""
                  className="w-3.5 h-3.5 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-xs text-venus-gray-400 truncate">{item.metadata?.url as string}</span>
              </div>
            )}

            {/* OG / hero image for link items */}
            {isLink && heroImage && (
              <div
                className="mb-2 rounded-md overflow-hidden border border-venus-gray-100 max-w-sm cursor-pointer"
                onClick={() => onImageClick?.(heroImage, ogTitle || item.title)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={ogTitle || item.title}
                  className="w-full h-36 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* Link item: OG description */}
            {isLink && ogDescription && (
              <p className={`text-sm text-venus-gray-600 mb-1.5 ${expanded ? '' : 'line-clamp-3'}`}>
                {ogDescription}
              </p>
            )}

            {/* Link item: scraped body text (excerpt in collapsed, full in expanded) */}
            {isLink && item.content && item.content !== item.metadata?.url && (
              expanded ? (
                <p className="text-xs text-venus-gray-400 mb-2 whitespace-pre-wrap">
                  {item.content}
                </p>
              ) : (
                scrapedExcerpt && scrapedExcerpt !== ogDescription && (
                  <p className="text-xs text-venus-gray-400 line-clamp-2 mb-2">
                    {scrapedExcerpt}
                  </p>
                )
              )
            )}

            {/* Non-link item content */}
            {displayContent && (
              <p className={`text-sm text-venus-gray-500 mb-2 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                {expanded ? displayContent : displayContent}
              </p>
            )}

            {/* Image item preview (existing behavior) */}
            {item.type === 'image' && item.metadata?.image_url && (
              <div
                className="mb-2 rounded-md overflow-hidden border border-venus-gray-100 max-w-xs cursor-pointer"
                onClick={() => onImageClick?.(item.metadata.image_url as string, item.title)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.metadata.image_url as string}
                  alt={item.title}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* Drive item: thumbnail + icon label + export indicator */}
            {isDrive && item.metadata?.drive_thumbnail_url && (
              <div
                className="mb-2 rounded-md overflow-hidden border border-venus-gray-100 max-w-xs cursor-pointer"
                onClick={() => onImageClick?.(item.metadata.drive_thumbnail_url as string, item.title)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.metadata.drive_thumbnail_url as string}
                  alt={item.title}
                  className="w-full h-32 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            {isDrive && item.metadata?.drive_icon_url && (
              <div className="flex items-center gap-1.5 mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.metadata.drive_icon_url as string}
                  alt=""
                  className="w-4 h-4 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-xs text-venus-gray-500">{item.metadata.drive_mime_type ? getDriveLabel(item.metadata.drive_mime_type as string) : 'Drive File'}</span>
              </div>
            )}

            {isDriveExporting && (
              <div className="flex items-center gap-1.5 text-xs text-venus-gray-400 mb-2">
                <Loader2 size={12} className="animate-spin" />
                Importing content...
              </div>
            )}

            {/* Slack item: channel name + message count */}
            {isSlack && (
              <div className="flex items-center gap-2 mb-1">
                {slackChannelName && (
                  <span className="text-xs text-venus-gray-500">#{slackChannelName}</span>
                )}
                {slackMessageCount && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-venus-blue-light text-venus-blue font-medium">
                    {slackMessageCount} message{slackMessageCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Scraped page images thumbnail row */}
            {isLink && scrapedImages && scrapedImages.length > (ogImage ? 0 : 1) && (
              <div className="flex gap-2 overflow-x-auto mb-2 pb-1 scrollbar-thin">
                {scrapedImages
                  .filter((img) => img !== heroImage)
                  .slice(0, 6)
                  .map((imgUrl) => (
                    <div
                      key={imgUrl}
                      className="w-20 h-20 rounded-md border border-venus-gray-100 overflow-hidden shrink-0 cursor-pointer"
                      onClick={() => onImageClick?.(imgUrl)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
              </div>
            )}

            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-venus-purple-light text-venus-purple font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-venus-gray-400">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </span>
              {url && (
                <a
                  href={url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-venus-purple hover:text-venus-purple-deep flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                  {isDrive ? 'Open in Drive' : isSlack ? 'Open in Slack' : 'Open'}
                </a>
              )}
              {hasExpandableContent && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-venus-gray-400 hover:text-venus-gray-600 flex items-center gap-0.5 transition-colors"
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1 rounded-md hover:bg-venus-red-light text-venus-gray-400 hover:text-venus-red opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Delete item"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
