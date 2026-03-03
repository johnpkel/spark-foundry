/**
 * Custom CollaborationCursor extension for TipTap v3.
 *
 * The official @tiptap/extension-collaboration-cursor is stuck on v2 internals
 * (it imports yCursorPlugin from y-prosemirror, which uses a different
 * ySyncPluginKey than TipTap v3's @tiptap/y-tiptap). This thin wrapper
 * imports yCursorPlugin from @tiptap/y-tiptap so the cursor decorations
 * can find the sync plugin state.
 */
import { Extension } from '@tiptap/core';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import type { Awareness } from 'y-protocols/awareness';

export interface CollaborationCursorOptions {
  /**
   * The Yjs awareness instance — usually `provider.awareness`.
   */
  awareness: Awareness;
  /**
   * Local user metadata to broadcast.
   */
  user: { name: string; color: string };
  /**
   * Custom cursor element builder (optional).
   */
  render?: (user: { name: string; color: string }, clientId: number) => HTMLElement;
}

const CollaborationCursorExtension = Extension.create<CollaborationCursorOptions>({
  name: 'collaborationCursor',

  addOptions() {
    return {
      awareness: null as unknown as Awareness,
      user: { name: 'Anonymous', color: '#6c5ce7' },
      render: undefined,
    };
  },

  addStorage() {
    return { users: [] as Array<{ clientId: number; [key: string]: unknown }> };
  },

  addProseMirrorPlugins() {
    const { awareness, user, render } = this.options;

    // Set local awareness state
    awareness.setLocalStateField('user', user);

    // Track connected users in storage
    const updateUsers = () => {
      const states = awareness.getStates() as Map<number, { user?: Record<string, unknown> }>;
      this.storage.users = Array.from(states.entries())
        .filter(([, state]) => state.user)
        .map(([clientId, state]) => ({ clientId, ...state.user }));
    };
    awareness.on('update', updateUsers);
    updateUsers();

    return [
      yCursorPlugin(
        awareness,
        render ? { cursorBuilder: render } : {},
      ),
    ];
  },
});

export default CollaborationCursorExtension;
