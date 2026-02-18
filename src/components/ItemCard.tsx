'use client';

import { formatDistanceToNow } from 'date-fns';
import { Link2, Image, FileText, StickyNote, File, ExternalLink, X, Loader2 } from 'lucide-react';
import type { SparkItem } from '@/lib/types';

interface ItemCardProps {
  item: SparkItem;
  onDelete: (id: string) => void;
}

const typeConfig = {
  link: { icon: Link2, color: 'bg-blue-50 text-blue-600', label: 'Link' },
  image: { icon: Image, color: 'bg-green-50 text-green-600', label: 'Image' },
  text: { icon: FileText, color: 'bg-purple-50 text-purple-600', label: 'Text' },
  file: { icon: File, color: 'bg-orange-50 text-orange-600', label: 'File' },
  note: { icon: StickyNote, color: 'bg-yellow-50 text-yellow-700', label: 'Note' },
};

export default function ItemCard({ item, onDelete }: ItemCardProps) {
  const config = typeConfig[item.type] || typeConfig.note;
  const Icon = config.icon;
  const url = item.metadata?.url || item.metadata?.image_url || item.metadata?.file_url;
  const tags = item.metadata?.tags as string[] | undefined;

  // Link-specific scraped data
  const isLink = item.type === 'link';
  const scrapeStatus = item.metadata?.scrape_status as string | undefined;
  const isScraping = isLink && !scrapeStatus;
  const ogImage = item.metadata?.og_image as string | undefined;
  const scrapedImages = item.metadata?.scraped_images as string[] | undefined;
  const heroImage = ogImage || scrapedImages?.[0];

  // Prefer OG description / summary over raw scraped text for link items
  const displayContent = isLink
    ? (item.metadata?.og_description as string) || item.summary || item.content
    : item.content;

  return (
    <div className="bg-white rounded-lg border border-venus-gray-200 p-4 hover:border-venus-purple/30 transition-colors group">
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

            {/* OG / hero image for link items */}
            {isLink && heroImage && (
              <div className="mb-2 rounded-md overflow-hidden border border-venus-gray-100 max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={item.metadata?.og_title as string || item.title}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {displayContent && (
              <p className="text-sm text-venus-gray-500 line-clamp-2 mb-2">
                {displayContent}
              </p>
            )}

            {/* Image item preview (existing behavior) */}
            {item.type === 'image' && item.metadata?.image_url && (
              <div className="mb-2 rounded-md overflow-hidden border border-venus-gray-100 max-w-xs">
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

            {/* Scraped page images thumbnail row */}
            {isLink && scrapedImages && scrapedImages.length > (ogImage ? 0 : 1) && (
              <div className="flex gap-1.5 overflow-x-auto mb-2 pb-1 scrollbar-thin">
                {scrapedImages
                  .filter((img) => img !== ogImage)
                  .slice(0, 6)
                  .map((imgUrl) => (
                    <div
                      key={imgUrl}
                      className="w-12 h-12 rounded border border-venus-gray-100 overflow-hidden shrink-0"
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
                  Open
                </a>
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
