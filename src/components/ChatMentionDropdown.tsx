'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Link2, Image, FileText, StickyNote, File, HardDrive, Database,
  Paperclip, BarChart2, FolderOpen, Search,
} from 'lucide-react';
import { SlackIcon } from '@/components/SlackIcon';
import type { SparkItem, ItemType, CanvasGroup } from '@/lib/types';

// ─── Type config ─────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: typeof Link2; label: string }> = {
  link: { icon: Link2, label: 'Links' },
  image: { icon: Image, label: 'Images' },
  text: { icon: FileText, label: 'Text' },
  file: { icon: File, label: 'Documents' },
  note: { icon: StickyNote, label: 'Notes' },
  google_drive: { icon: HardDrive, label: 'Google Drive' },
  slack_message: { icon: SlackIcon as unknown as typeof Link2, label: 'Slack' },
  contentstack_entry: { icon: Database, label: 'Entries' },
  contentstack_asset: { icon: Paperclip, label: 'Assets' },
  clarity_insight: { icon: BarChart2, label: 'Clarity' },
  group: { icon: FolderOpen, label: 'Groups' },
};

// ─── Types ───────────────────────────────────────────

export interface MentionOption {
  id: string;
  label: string;
  type: ItemType | 'group';
}

interface ChatMentionDropdownProps {
  items: SparkItem[];
  groups: CanvasGroup[];
  query: string;
  onSelect: (option: MentionOption) => void;
  onClose: () => void;
  /** Position relative to parent */
  style?: React.CSSProperties;
}

// ─── Component ───────────────────────────────────────

export default function ChatMentionDropdown({
  items,
  groups,
  query,
  onSelect,
  onClose,
  style,
}: ChatMentionDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Build flat list of options, grouped by type
  const filteredOptions: MentionOption[] = (() => {
    const q = query.toLowerCase();
    const result: MentionOption[] = [];

    // Groups first
    const matchedGroups = groups
      .filter(g => g.name.toLowerCase().includes(q))
      .map(g => ({ id: g.id, label: g.name, type: 'group' as const }));
    result.push(...matchedGroups);

    // Items grouped by type
    const byType = new Map<ItemType, SparkItem[]>();
    for (const item of items) {
      if (!item.title.toLowerCase().includes(q)) continue;
      const existing = byType.get(item.type) || [];
      existing.push(item);
      byType.set(item.type, existing);
    }

    for (const [type, typeItems] of byType) {
      for (const item of typeItems) {
        result.push({ id: item.id, label: item.title, type });
      }
    }

    return result;
  })();

  // Group options by type for rendering with section headers
  const sections: { type: ItemType | 'group'; options: MentionOption[] }[] = (() => {
    const map = new Map<string, MentionOption[]>();
    for (const opt of filteredOptions) {
      const existing = map.get(opt.type) || [];
      existing.push(opt);
      map.set(opt.type, existing);
    }
    return Array.from(map.entries()).map(([type, options]) => ({
      type: type as ItemType | 'group',
      options,
    }));
  })();

  // Reset selection when query changes
  useEffect(() => setSelectedIndex(0), [query]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard handler — attached to document so textarea keeps focus
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + Math.max(filteredOptions.length, 1)) % Math.max(filteredOptions.length, 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % Math.max(filteredOptions.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filteredOptions[selectedIndex];
      if (option) onSelect(option);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filteredOptions, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Track flat index for rendering
  let flatIndex = 0;

  return (
    <div
      ref={listRef}
      style={style}
      className="absolute z-50 bg-card-bg rounded-lg border border-venus-gray-200 shadow-xl min-w-[260px] max-w-[340px] max-h-[320px] overflow-y-auto"
    >
      {/* Search hint */}
      <div className="px-3 py-2 border-b border-venus-gray-100 flex items-center gap-2 text-venus-gray-400">
        <Search size={12} />
        <span className="text-xs">
          {query ? `Searching "${query}"` : 'Type to search items and groups'}
        </span>
      </div>

      {sections.length === 0 ? (
        <div className="px-3 py-4 text-sm text-venus-gray-400 text-center">
          No matches
        </div>
      ) : (
        sections.map(({ type, options }) => {
          const cfg = TYPE_CONFIG[type];
          const SectionIcon = cfg?.icon || FileText;
          return (
            <div key={type}>
              {/* Section header */}
              <div className="px-3 py-1.5 text-[10px] font-semibold text-venus-gray-400 uppercase tracking-wider bg-venus-gray-50 flex items-center gap-1.5 sticky top-0">
                <SectionIcon size={10} />
                {cfg?.label || type}
              </div>
              {/* Options */}
              {options.map((option) => {
                const idx = flatIndex++;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={option.id}
                    ref={isSelected ? selectedRef : undefined}
                    onClick={() => onSelect(option)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'bg-venus-purple-light text-venus-purple'
                        : 'text-venus-gray-700 hover:bg-venus-gray-100'
                    }`}
                  >
                    <span className="text-venus-gray-400 text-xs font-medium">@</span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
