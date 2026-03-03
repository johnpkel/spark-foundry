'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface MentionItem {
  id: string;
  label: string;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when items change
  useEffect(() => setSelectedIndex(0), [items]);

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
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-2 px-3 text-sm text-venus-gray-400 min-w-[160px]">
        No matches
      </div>
    );
  }

  return (
    <div className="bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-1 min-w-[160px] overflow-hidden">
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => command(item)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            i === selectedIndex
              ? 'bg-venus-purple-light text-venus-purple'
              : 'text-venus-gray-700 hover:bg-venus-gray-100'
          }`}
        >
          <span className="text-venus-gray-400 text-xs font-medium">@</span>
          {item.label}
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
export default MentionList;
