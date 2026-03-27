'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchEmoji, getEmojiByCategory, type EmojiCategory } from '@/lib/emoji-data';

const CATEGORY_LABELS: Record<EmojiCategory, string> = {
  people: 'People',
  nature: 'Nature',
  food: 'Food & Drink',
  activity: 'Activity',
  travel: 'Travel',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    // Use setTimeout to avoid stealing focus from editor in bubble menu
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid closing immediately from the toggle click
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const handleSelect = useCallback((emoji: string) => {
    onSelect(emoji);
    onClose();
  }, [onSelect, onClose]);

  const searchResults = query.trim() ? searchEmoji(query.trim(), 50) : null;
  const categories = !searchResults ? getEmojiByCategory() : null;

  return (
    <div
      ref={ref}
      className="w-[340px] bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg p-2"
      onMouseDown={(e) => e.preventDefault()} // Prevent editor blur
    >
      {/* Search */}
      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-venus-gray-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji..."
          className="w-full text-sm bg-venus-gray-50 border border-venus-gray-200 focus:border-venus-purple rounded pl-7 pr-2.5 py-1.5 outline-none"
          onMouseDown={(e) => {
            e.stopPropagation(); // Allow focus in search input
          }}
          onFocus={(e) => e.target.removeAttribute('readonly')} // Mobile fix
        />
      </div>

      {/* Grid */}
      <div className="max-h-[280px] overflow-y-auto">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="text-xs text-venus-gray-400 text-center py-4">No emoji found</p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {searchResults.map((entry) => (
                <button
                  key={entry.name}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(entry.emoji); }}
                  title={entry.name}
                  className="w-full aspect-square flex items-center justify-center text-lg rounded hover:bg-venus-gray-100 transition-colors cursor-pointer"
                >
                  {entry.emoji}
                </button>
              ))}
            </div>
          )
        ) : categories ? (
          Object.entries(categories).map(([cat, emojis]) =>
            emojis.length > 0 ? (
              <div key={cat} className="mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 px-1 pt-1 pb-1">
                  {CATEGORY_LABELS[cat as EmojiCategory]}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {emojis.map((entry) => (
                    <button
                      key={entry.name}
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(entry.emoji); }}
                      title={entry.name}
                      className="w-full aspect-square flex items-center justify-center text-lg rounded hover:bg-venus-gray-100 transition-colors cursor-pointer"
                    >
                      {entry.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          )
        ) : null}
      </div>
    </div>
  );
}
