'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Globe, ExternalLink, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { WebResearchItem } from '@/lib/types';

interface WebResearchCardProps {
  item: WebResearchItem;
  onDelete: (id: string) => void;
}

export default function WebResearchCard({ item, onDelete }: WebResearchCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasExpandableContent = item.content.length > 200;

  return (
    <div className="bg-card-bg rounded-lg border border-venus-gray-200 p-4 hover:border-emerald-400/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
            <Globe size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm text-venus-gray-700 truncate">{item.title}</h4>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 uppercase tracking-wider font-medium shrink-0">
                Research
              </span>
            </div>

            {/* Original query */}
            <div className="flex items-center gap-1.5 mb-2">
              <Search size={11} className="text-venus-gray-400 shrink-0" />
              <span className="text-xs text-venus-gray-500 truncate">{item.query}</span>
            </div>

            {/* Summary */}
            {item.summary && (
              <p className="text-sm text-venus-gray-600 mb-2 line-clamp-2">
                {item.summary}
              </p>
            )}

            {/* Expandable content */}
            {expanded && (
              <div className="text-sm text-venus-gray-500 mb-3 whitespace-pre-wrap prose prose-sm max-w-none">
                {item.content}
              </div>
            )}

            {/* Source pills */}
            {item.sources && item.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {item.sources.slice(0, expanded ? undefined : 3).map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-venus-gray-100 text-venus-gray-600 text-[11px] hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={9} />
                    <span className="truncate max-w-[160px]">{source.title}</span>
                  </a>
                ))}
                {!expanded && item.sources.length > 3 && (
                  <span className="text-[11px] text-venus-gray-400 px-1.5 py-0.5">
                    +{item.sources.length - 3} more
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-venus-gray-400">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </span>
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
          className="p-1 rounded-md hover:bg-red-50 text-venus-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Delete research"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
