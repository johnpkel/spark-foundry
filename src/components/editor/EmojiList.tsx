'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EmojiEntry } from '@/lib/emoji-data';

export interface EmojiListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface EmojiListProps {
  items: EmojiEntry[];
  command: (item: EmojiEntry) => void;
}

const EmojiList = forwardRef<EmojiListRef, EmojiListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelectedIndex(0), [items]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-2 px-3 text-sm text-venus-gray-400 min-w-[200px]">
        No matching emoji
      </div>
    );
  }

  return (
    <div ref={listRef} className="bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
      {items.map((item, i) => (
        <button
          key={item.name}
          data-idx={i}
          onClick={() => command(item)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2.5 ${
            i === selectedIndex
              ? 'bg-venus-purple-light text-venus-purple'
              : 'text-venus-gray-700 hover:bg-venus-gray-100'
          }`}
        >
          <span className="text-base leading-none">{item.emoji}</span>
          <span className="truncate">{item.name}</span>
        </button>
      ))}
    </div>
  );
});

EmojiList.displayName = 'EmojiList';
export default EmojiList;
