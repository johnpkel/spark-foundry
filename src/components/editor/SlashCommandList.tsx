'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { LucideIcon } from 'lucide-react';
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Code2, Minus,
  ImageIcon, Table2, Pencil,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: string;
  action: (editor: Editor) => void | Promise<void>;
}

export interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

// ─── Command definitions ────────────────────────

export const SLASH_COMMANDS: SlashCommandItem[] = [
  // Text
  { id: 'h1', label: 'Heading 1', description: 'Large heading', icon: Heading1, category: 'Text',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', description: 'Medium heading', icon: Heading2, category: 'Text',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', description: 'Small heading', icon: Heading3, category: 'Text',
    action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },

  // Lists
  { id: 'bullet', label: 'Bullet List', description: 'Unordered list', icon: List, category: 'Lists',
    action: (ed) => ed.chain().focus().toggleBulletList().run() },
  { id: 'ordered', label: 'Numbered List', description: 'Ordered list', icon: ListOrdered, category: 'Lists',
    action: (ed) => ed.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: 'Task List', description: 'Checklist', icon: CheckSquare, category: 'Lists',
    action: (ed) => ed.chain().focus().toggleTaskList().run() },

  // Blocks
  { id: 'quote', label: 'Blockquote', description: 'Quote block', icon: Quote, category: 'Blocks',
    action: (ed) => ed.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code Block', description: 'Fenced code', icon: Code2, category: 'Blocks',
    action: (ed) => ed.chain().focus().toggleCodeBlock().run() },
  { id: 'divider', label: 'Divider', description: 'Horizontal rule', icon: Minus, category: 'Blocks',
    action: (ed) => ed.chain().focus().setHorizontalRule().run() },

  // Insert
  { id: 'image', label: 'Image', description: 'Insert image', icon: ImageIcon, category: 'Insert',
    action: (ed) => {
      const url = window.prompt('Image URL');
      if (url) ed.chain().focus().setImage({ src: url }).run();
    } },
  { id: 'table', label: 'Table', description: '3×3 table', icon: Table2, category: 'Insert',
    action: (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'drawing', label: 'Drawing', description: 'Freehand sketch', icon: Pencil, category: 'Insert',
    action: (ed) => ed.chain().focus().insertDrawing().run() },
];

// ─── Fuzzy filter ───────────────────────────────

export function filterSlashCommands(query: string): SlashCommandItem[] {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q),
  );
}

// ─── Component ──────────────────────────────────

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Reset selection when items change
    useEffect(() => setSelectedIndex(0), [items]);

    // Keep selected item in view
    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
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
        <div className="slash-command-list bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-2 px-3 text-sm text-venus-gray-400 min-w-[220px]">
          No matching commands
        </div>
      );
    }

    // Group items by category (preserving order)
    const groups: { category: string; items: SlashCommandItem[] }[] = [];
    let flatIndex = 0;
    const indexMap = new Map<string, number>(); // item id → flat index

    for (const item of items) {
      indexMap.set(item.id, flatIndex++);
      const last = groups[groups.length - 1];
      if (last && last.category === item.category) {
        last.items.push(item);
      } else {
        groups.push({ category: item.category, items: [item] });
      }
    }

    return (
      <div
        ref={scrollRef}
        className="slash-command-list bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg py-1 min-w-[220px] max-h-[320px] overflow-y-auto"
      >
        {groups.map((group) => (
          <div key={group.category}>
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400">
              {group.category}
            </div>
            {group.items.map((item) => {
              const idx = indexMap.get(item.id)!;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-index={idx}
                  onClick={() => command(item)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2.5 ${
                    idx === selectedIndex
                      ? 'bg-venus-purple-light text-venus-purple'
                      : 'text-venus-gray-700 hover:bg-venus-gray-100'
                  }`}
                >
                  <Icon size={15} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="flex flex-col leading-tight">
                    <span className="font-medium">{item.label}</span>
                    <span className={`text-xs ${
                      idx === selectedIndex ? 'text-venus-purple/70' : 'text-venus-gray-400'
                    }`}>
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';
export default SlashCommandList;
