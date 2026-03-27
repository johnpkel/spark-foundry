import { useCallback, useMemo, useState } from 'react';
import { searchEmoji, EMOJI_SHORTCODES, MAX_SHORTCODE_LENGTH } from '@/lib/emoji-data';
import type { EmojiEntry } from '@/lib/emoji-data';

interface EmojiInputState {
  /** Whether the emoji dropdown is active */
  active: boolean;
  /** The current search query (text after `:`) */
  query: string;
  /** Filtered emoji results */
  results: EmojiEntry[];
  /** Currently selected index in the dropdown */
  selectedIndex: number;
  /** Set the selected index */
  setSelectedIndex: (i: number) => void;
  /** Call on every input change — detects `:` triggers and shortcodes */
  onChange: (value: string, cursorPos: number) => string;
  /** Insert the selected emoji into the text, returns new text + cursor position */
  insertEmoji: (text: string, cursorPos: number, emoji: string) => { text: string; cursor: number };
  /** Handle keyboard navigation, returns true if handled */
  onKeyDown: (e: React.KeyboardEvent, text: string, cursorPos: number, onInsert: (newText: string, newCursor: number) => void) => boolean;
  /** Reset emoji state */
  reset: () => void;
}

/**
 * Shared hook for emoji input in textarea/input elements.
 * Provides `:` autocomplete detection and emoticon shortcode conversion.
 */
export function useEmojiInput(): EmojiInputState {
  const [query, setQuery] = useState<string | null>(null);
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    if (query === null || query.length < 2) return [];
    return searchEmoji(query, 8);
  }, [query]);

  const active = query !== null && query.length >= 2 && results.length > 0;

  const detectEmoji = useCallback((value: string, cursorPos: number) => {
    const before = value.slice(0, cursorPos);
    const colonIdx = before.lastIndexOf(':');

    if (colonIdx === -1) {
      setQuery(null);
      return;
    }

    // Must be at start or preceded by whitespace
    if (colonIdx > 0 && !/\s/.test(before[colonIdx - 1])) {
      setQuery(null);
      return;
    }

    const q = before.slice(colonIdx + 1);

    // No spaces in query
    if (/\s/.test(q)) {
      setQuery(null);
      return;
    }

    setQuery(q);
    setTriggerIndex(colonIdx);
    if (q.length >= 2) setSelectedIndex(0);
  }, []);

  const checkShortcodes = useCallback((value: string, cursorPos: number): string => {
    // Check if the last few characters before cursor match a shortcode
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);

    for (let len = 2; len <= Math.min(MAX_SHORTCODE_LENGTH, before.length); len++) {
      const candidate = before.slice(-len);
      const emoji = EMOJI_SHORTCODES[candidate];
      if (emoji) {
        // Must be preceded by whitespace or at start
        const precedingIdx = before.length - len - 1;
        if (precedingIdx >= 0 && !/\s/.test(before[precedingIdx])) continue;
        return before.slice(0, -len) + emoji + after;
      }
    }
    return value;
  }, []);

  const onChange = useCallback((value: string, cursorPos: number): string => {
    detectEmoji(value, cursorPos);
    // Check shortcode conversion
    const converted = checkShortcodes(value, cursorPos);
    return converted;
  }, [detectEmoji, checkShortcodes]);

  const insertEmoji = useCallback((text: string, cursorPos: number, emoji: string): { text: string; cursor: number } => {
    // Replace `:query` with the emoji
    const before = text.slice(0, triggerIndex);
    const after = text.slice(cursorPos);
    const newText = before + emoji + after;
    const newCursor = before.length + emoji.length;
    setQuery(null);
    return { text: newText, cursor: newCursor };
  }, [triggerIndex]);

  const onKeyDown = useCallback((
    e: React.KeyboardEvent,
    text: string,
    cursorPos: number,
    onInsert: (newText: string, newCursor: number) => void,
  ): boolean => {
    if (!active) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % results.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + results.length) % results.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) {
        const { text: newText, cursor } = insertEmoji(text, cursorPos, item.emoji);
        onInsert(newText, cursor);
      }
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuery(null);
      return true;
    }
    return false;
  }, [active, results, selectedIndex, insertEmoji]);

  const reset = useCallback(() => {
    setQuery(null);
    setTriggerIndex(-1);
    setSelectedIndex(0);
  }, []);

  return {
    active,
    query: query ?? '',
    results,
    selectedIndex,
    setSelectedIndex,
    onChange,
    insertEmoji,
    onKeyDown,
    reset,
  };
}
