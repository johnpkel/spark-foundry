import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setComment: (threadId: string) => ReturnType;
      unsetComment: (threadId: string) => ReturnType;
      resolveComment: (threadId: string) => ReturnType;
    };
  }
}

const CommentMark = Mark.create<CommentMarkOptions>({
  name: 'commentMark',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  // Don't extend mark when typing at boundaries
  inclusive: false,

  // Coexist with bold, italic, etc.
  excludes: '',

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-thread-id'),
        renderHTML: (attrs) => ({ 'data-thread-id': attrs.threadId }),
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => ({ 'data-resolved': String(attrs.resolved) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-thread-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-resolved'] === 'true';
    const cls = resolved ? 'comment-mark comment-mark-resolved' : 'comment-mark';
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: cls }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId, resolved: false }),

      unsetComment:
        (threadId: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          const { doc } = tr;
          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.threadId === threadId) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            });
          });
          return true;
        },

      resolveComment:
        (threadId: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          const markType = tr.doc.type.schema.marks[this.name];
          tr.doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.threadId === threadId) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
                tr.addMark(
                  pos,
                  pos + node.nodeSize,
                  markType.create({ threadId, resolved: true }),
                );
              }
            });
          });
          return true;
        },
    };
  },
});

export default CommentMark;
