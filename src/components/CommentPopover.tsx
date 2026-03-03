'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

export interface CommentSubmitData {
  threadId: string;
  selectedText: string;
  commentText: string;
  authorId: string;
  authorName: string;
  from: number;
  to: number;
}

interface MentionItem {
  id: string;
  label: string;
}

const MENTION_ITEMS: MentionItem[] = [
  { id: '1', label: 'Alice Johnson' },
  { id: '2', label: 'Bob Smith' },
  { id: '3', label: 'Carol White' },
  { id: '4', label: 'David Lee' },
  { id: '5', label: 'Eva Martinez' },
];

interface CommentPopoverProps {
  anchorRect: DOMRect;
  containerRect: DOMRect;
  selectedText: string;
  from: number;
  to: number;
  onSubmit: (data: CommentSubmitData) => void;
  onCancel: () => void;
}

export default function CommentPopover({
  anchorRect,
  containerRect,
  selectedText,
  from,
  to,
  onSubmit,
  onCancel,
}: CommentPopoverProps) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  // Mention detection: look for @ before cursor
  const detectMention = useCallback((value: string, cursorPos: number) => {
    const before = value.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) { setMentionQuery(null); return; }
    // Must be at start or preceded by whitespace
    if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) { setMentionQuery(null); return; }
    const query = before.slice(atIdx + 1);
    // No spaces except inside a partial name
    if (/\n/.test(query)) { setMentionQuery(null); return; }
    setMentionQuery(query);
    setMentionIdx(0);
  }, []);

  const filteredMentions = mentionQuery !== null
    ? MENTION_ITEMS.filter(m => m.label.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const insertMention = useCallback((item: MentionItem) => {
    const ta = textareaRef.current;
    if (!ta || mentionQuery === null) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    const after = text.slice(cursor);
    const newText = before.slice(0, atIdx) + `@${item.label}` + after;
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      const newPos = atIdx + item.label.length + 1;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    }, 0);
  }, [text, mentionQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mention dropdown navigation
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentions[mentionIdx]); return; }
    }

    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); return; }
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    const threadId = crypto.randomUUID();
    onSubmit({
      threadId,
      selectedText,
      commentText: text.trim(),
      authorId: 'current-user',
      authorName: 'You',
      from,
      to,
    });
  };

  // Position: right of selection anchor, within container bounds
  const top = anchorRect.top - containerRect.top + anchorRect.height + 8;
  const left = Math.min(
    anchorRect.right - containerRect.left + 8,
    containerRect.width - 320,
  );

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 w-[300px] bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg"
      style={{ top: Math.max(top, 8), left: Math.max(left, 8) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-venus-gray-200">
        <span className="text-xs font-semibold text-venus-gray-700">Add comment</span>
        <button onClick={onCancel} className="p-0.5 rounded hover:bg-venus-gray-100 text-venus-gray-400">
          <X size={14} />
        </button>
      </div>

      {/* Quoted text */}
      <div className="px-3 pt-2">
        <div className="text-xs text-venus-gray-500 italic border-l-2 border-venus-purple-medium pl-2 line-clamp-2">
          &ldquo;{selectedText}&rdquo;
        </div>
      </div>

      {/* Textarea */}
      <div className="px-3 py-2 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            detectMention(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => detectMention(text, (e.target as HTMLTextAreaElement).selectionStart)}
          placeholder="Add a comment… (@ to mention)"
          rows={3}
          className="w-full text-sm bg-venus-gray-50 border border-venus-gray-200 rounded-md px-2.5 py-2 outline-none focus:border-venus-purple resize-none"
        />
        {/* Mention dropdown */}
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div className="absolute bottom-0 left-3 right-3 translate-y-full z-10 bg-card-bg border border-venus-gray-200 rounded-md shadow-md py-1 max-h-36 overflow-y-auto">
            {filteredMentions.map((item, i) => (
              <button
                key={item.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  i === mentionIdx
                    ? 'bg-venus-purple-light text-venus-purple'
                    : 'text-venus-gray-700 hover:bg-venus-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-venus-gray-200">
        <span className="text-[10px] text-venus-gray-400">
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="text-xs text-venus-gray-500 px-2.5 py-1 hover:bg-venus-gray-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="text-xs bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded transition-colors font-medium"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
