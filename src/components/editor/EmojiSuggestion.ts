import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { InputRule } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { EMOJI_SHORTCODES } from '@/lib/emoji-data';

export const emojiSuggestionPluginKey = new PluginKey('emojiSuggestion');

/**
 * TipTap extension for emoji input:
 * 1. Colon-autocomplete (`:wave` → 👋) via suggestion plugin
 * 2. Emoticon shortcodes (`:)` → 😊) via input rules
 */
const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: ':',
        startOfLine: false,
        pluginKey: emojiSuggestionPluginKey,
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },

  addInputRules() {
    // Build input rules for emoticon shortcodes
    // Each rule matches the shortcode followed by a space at end of input
    return Object.entries(EMOJI_SHORTCODES).map(([shortcode, emoji]) => {
      // Escape regex special characters in the shortcode
      const escaped = shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match shortcode preceded by start-of-line or whitespace, followed by a space
      const regex = new RegExp(`(?:^|\\s)${escaped}\\s$`);

      return new InputRule({
        find: regex,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          // Preserve any leading whitespace/start-of-line character
          const fullMatch = match[0];
          const leadingSpace = fullMatch.startsWith(' ') || fullMatch.startsWith('\n') ? 1 : 0;
          const start = range.from + leadingSpace;
          tr.replaceWith(start, range.to, state.schema.text(emoji + ' '));
        },
      });
    });
  },
});

export default EmojiSuggestion;
