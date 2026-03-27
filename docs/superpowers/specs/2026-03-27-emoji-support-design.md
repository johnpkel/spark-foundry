# Emoji Support — Design Spec

**Issue:** CON-53
**Date:** 2026-03-27

## Overview

Add emoji support to the TipTap editor and comment/discussion inputs. Three input methods: colon-autocomplete (`:wave`), emoticon shortcodes (`:)` → 😊), and a toolbar emoji picker with search and category browsing.

## Scope

- **In scope:** Editor (TipTap), Comments (CommentPopover), Discussions (DiscussionsPanel replies)
- **Out of scope:** Chat panel (ChatPanel.tsx)

## 1. Emoji Data Module

**File:** `src/lib/emoji-data.ts`

Static TypeScript module containing ~1,800 standard Unicode emojis.

```typescript
interface EmojiEntry {
  emoji: string;       // "👋"
  name: string;        // "waving hand"
  keywords: string[];  // ["wave", "hello", "hi"]
  category: EmojiCategory;
}

type EmojiCategory = 'people' | 'nature' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags';
```

**Functions:**
- `searchEmoji(query: string, limit?: number): EmojiEntry[]` — prefix match on name + keywords, returns top N (default 8)
- `getEmojiByCategory(): Record<EmojiCategory, EmojiEntry[]>` — grouped for picker grid
- `EMOJI_SHORTCODES: Record<string, string>` — emoticon → emoji map

**Shortcode map:**
```
:)  → 😊    :(  → 😞    ;)  → 😉    :D  → 😁
:P  → 😛    :O  → 😮    <3  → ❤️    :/  → 😕
:'( → 😢    XD  → 😆    :*  → 😘    B)  → 😎
```

## 2. Colon Autocomplete (`:` trigger)

### Editor (TipTap)

**New file:** `src/components/editor/EmojiSuggestion.ts`

TipTap suggestion extension following the SlashCommand pattern:
- Trigger character: `:`
- Minimum query length: 2 characters (avoids false triggers on regular colons like `Note:`)
- Uses `@tiptap/suggestion` plugin with `ReactRenderer`
- On select: replaces `:query` range with the emoji character

**New file:** `src/components/editor/EmojiList.tsx`

Dropdown component (follows MentionList.tsx / SlashCommandList.tsx pattern):
- Filtered list showing emoji + name per row
- Max 8 results
- Keyboard navigation: arrow up/down, enter to select, escape to close
- Positioned absolutely near cursor via suggestion plugin

**Integration:** Register in `SparkEditor.tsx` extensions array alongside existing Mention and SlashCommand.

### Comments (CommentPopover.tsx) & Discussion Replies (DiscussionsPanel.tsx)

Add `:` detection in the textarea's onChange handler, mirroring the existing `@` mention detection:
- Track `emojiState: { active: boolean; query: string; triggerIndex: number }`
- Show dropdown when `active && query.length >= 2`
- On select: splice emoji into textarea value replacing `:query`
- Reuse the same `EmojiList.tsx` presentational component (or a simplified version positioned relative to the textarea)

## 3. Emoticon Shortcode Conversion

### Editor (TipTap)

**Added to:** `src/components/editor/EmojiSuggestion.ts` (or as input rules in the extension)

Use TipTap/ProseMirror `InputRule` API to auto-convert emoticon sequences on typing. Each shortcode gets an input rule that triggers when the sequence is followed by a space or punctuation.

Example rule: `/:\)\s$/` → replace with `😊 `

### Comments & Discussion Replies (textarea)

On each keystroke in the textarea, check if the last N characters (up to max shortcode length) match a shortcode. If so, replace inline immediately. This gives the same instant conversion feel as the editor input rules.

## 4. Toolbar Emoji Picker

**New file:** `src/components/editor/EmojiPicker.tsx`

Compact dropdown component:
- **Search input** at top (search-as-you-type filters the grid using `searchEmoji()`)
- **Category headers** (People, Nature, Food, etc.) with emoji grid below each
- **Grid layout:** ~8 emojis per row, scrollable container
- **Click to insert:** inserts emoji at editor cursor position
- **Dismiss:** closes on selection, outside click, or escape

### Header Toolbar

Add a smile icon button (`Smile` from lucide-react) to the toolbar row in `SparkEditor.tsx`. Click toggles the `EmojiPicker` dropdown positioned below the button.

### Floating Toolbar (Bubble Menu)

Add the same smile icon button to the bubble menu. Click opens `EmojiPicker` as a popover. Inserting an emoji replaces the current selection (if any) or inserts at cursor.

## 5. Files to Create

| File | Purpose |
|------|---------|
| `src/lib/emoji-data.ts` | Emoji dataset, search function, shortcode map |
| `src/components/editor/EmojiSuggestion.ts` | TipTap suggestion extension + input rules |
| `src/components/editor/EmojiList.tsx` | Autocomplete dropdown (shared) |
| `src/components/editor/EmojiPicker.tsx` | Toolbar grid picker with search + categories |

## 6. Files to Modify

| File | Change |
|------|--------|
| `src/components/SparkEditor.tsx` | Register EmojiSuggestion extension, add picker button to header toolbar and bubble menu |
| `src/components/CommentPopover.tsx` | Add `:` detection + emoji dropdown + shortcode conversion |
| `src/components/DiscussionsPanel.tsx` | Add `:` detection + emoji dropdown + shortcode conversion in reply inputs |

## 7. No New Dependencies

All emoji data is bundled statically. No external emoji picker or data libraries needed.
