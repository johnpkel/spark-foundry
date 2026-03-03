'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer, type JSONContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorContext } from '@/lib/editor-context';
import type { EditorSelection } from '@/lib/editor-context';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Mention from '@tiptap/extension-mention';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursorExtension from './editor/CollaborationCursorExtension';
import { TiptapCollabProvider } from '@tiptap-pro/provider';
import * as Y from 'yjs';
import type { CollabUser } from './PresenceAvatars';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, CheckSquare,
  ImageIcon, Table2, Pencil, Sparkles, MessageSquareText, Layers,
} from 'lucide-react';
import type { CanvasGroup, SparkItem } from '@/lib/types';
import { DrawingExtension } from './editor/DrawingExtension';
import { GroupBlockExtension } from './editor/GroupBlockExtension';
import type { GroupBlockItem } from './editor/GroupBlockExtension';
import CommentMark from './editor/CommentMark';
import CommentPopover from './CommentPopover';
import type { CommentSubmitData } from './CommentPopover';
import MentionList from './editor/MentionList';
import type { MentionListRef, MentionItem } from './editor/MentionList';
import SlashCommand from './editor/SlashCommand';
import SlashCommandList, { filterSlashCommands } from './editor/SlashCommandList';
import type { SlashCommandListRef, SlashCommandItem } from './editor/SlashCommandList';

// ─── Collaboration color palette ──────────────────────────
const COLLAB_COLORS = [
  '#e06c75', // soft red
  '#61afef', // sky blue
  '#e5c07b', // amber
  '#56b6c2', // teal
  '#c678dd', // violet
  '#98c379', // green
  '#d19a66', // orange
  '#be5046', // rust
];

function getCollabColor(index: number) {
  return COLLAB_COLORS[index % COLLAB_COLORS.length];
}

function getStoredName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('spark-collab-name');
}

function setStoredName(name: string) {
  if (typeof window !== 'undefined') localStorage.setItem('spark-collab-name', name);
}

// ─── Module-level mutable store for slash command groups ──
// TipTap's Suggestion plugin captures `items` once at init. These
// module-level variables let the callback read fresh data on each
// keystroke without reinitializing the editor.
let _canvasGroups: CanvasGroup[] = [];
let _sparkItems: SparkItem[] = [];

// ─── Mention data ────────────────────────────────────
// Replace / extend with real user data as needed.
const MENTION_ITEMS: MentionItem[] = [
  { id: '1', label: 'Alice Johnson' },
  { id: '2', label: 'Bob Smith' },
  { id: '3', label: 'Carol White' },
  { id: '4', label: 'David Lee' },
  { id: '5', label: 'Eva Martinez' },
];

// ─── Mention suggestion config ───────────────────────
const mentionSuggestion = {
  items: ({ query }: { query: string }) =>
    MENTION_ITEMS.filter(m =>
      m.label.toLowerCase().startsWith(query.toLowerCase())
    ).slice(0, 6),

  render: () => {
    let component: ReactRenderer<MentionListRef> | null = null;
    let popup: HTMLDivElement | null = null;

    const position = (props: SuggestionProps) => {
      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
      }
    };

    return {
      onStart(props: SuggestionProps) {
        popup = document.createElement('div');
        popup.style.position = 'absolute';
        popup.style.zIndex = '9999';
        document.body.appendChild(popup);

        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });
        popup.appendChild(component.element);
        position(props);
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps(props);
        position(props);
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === 'Escape') {
          popup?.remove();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        component?.destroy();
        popup?.remove();
        popup = null;
        component = null;
      },
    };
  },
};

// ─── Slash command suggestion config ─────────────────
const slashCommandSuggestion = {
  items: ({ query }: { query: string }): SlashCommandItem[] => {
    const commands = filterSlashCommands(query);
    const q = query.toLowerCase();
    const groupItems: SlashCommandItem[] = _canvasGroups
      .filter(g => !q || g.name.toLowerCase().includes(q))
      .map(g => ({
        id: `group-${g.id}`,
        label: g.name,
        description: `${g.itemIds.length} item${g.itemIds.length !== 1 ? 's' : ''}${g.sessionId ? ' · has conversation' : ''}`,
        icon: Layers,
        category: 'Groups',
        action: async (editor: Editor) => {
          // Resolve item data for the group block attrs
          const memberItems = _sparkItems.filter(i => g.itemIds.includes(i.id));

          const items: GroupBlockItem[] = memberItems.map(i => {
            const m = i.metadata ?? {};
            const thumbnailUrl =
              m.image_url ?? m.og_image ?? m.drive_thumbnail_url ?? m.cs_asset_url ?? null;
            return {
              title: i.title,
              type: i.type,
              summary: i.summary,
              thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : null,
            };
          });

          // Insert the group block node
          editor.chain().focus()
            .insertGroupBlock({
              groupId: g.id,
              groupName: g.name,
              color: g.color,
              items,
              conversation: null,
              sessionId: g.sessionId ?? null,
            })
            .run();

          // Async: fetch conversation and update the node attrs
          if (g.sessionId) {
            try {
              const res = await fetch(`/api/chat/sessions/${g.sessionId}`);
              if (res.ok) {
                const { messages } = await res.json();
                const convo = messages
                  .filter((m: { role: string }) => m.role === 'assistant')
                  .map((m: { content: string }) => m.content)
                  .join('\n\n');
                if (convo) {
                  // Find the node by groupId and update its conversation attr
                  const { tr } = editor.state;
                  let updated = false;
                  editor.state.doc.descendants((node, pos) => {
                    if (updated) return false;
                    if (node.type.name === 'groupBlock' && node.attrs.groupId === g.id) {
                      tr.setNodeMarkup(pos, undefined, { ...node.attrs, conversation: convo });
                      updated = true;
                      return false;
                    }
                  });
                  if (updated) editor.view.dispatch(tr);
                }
              }
            } catch {
              // Non-blocking — the block is already rendered with items
            }
          }
        },
      }));
    return [...commands, ...groupItems];
  },

  render: () => {
    let component: ReactRenderer<SlashCommandListRef> | null = null;
    let popup: HTMLDivElement | null = null;

    const position = (props: SuggestionProps) => {
      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
      }
    };

    return {
      onStart(props: SuggestionProps) {
        popup = document.createElement('div');
        popup.style.position = 'absolute';
        popup.style.zIndex = '9999';
        document.body.appendChild(popup);

        component = new ReactRenderer(SlashCommandList, {
          props,
          editor: props.editor,
        });
        popup.appendChild(component.element);
        position(props);
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps(props);
        position(props);
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === 'Escape') {
          popup?.remove();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        component?.destroy();
        popup?.remove();
        popup = null;
        component = null;
      },
    };
  },

  command: ({ editor, range, props: item }: { editor: Editor; range: { from: number; to: number }; props: SlashCommandItem }) => {
    editor.chain().focus().deleteRange(range).run();
    item.action(editor);
  },
};

// ─── Toolbar helpers ─────────────────────────────────

function ToolbarBtn({
  icon: Icon, label, onClick, active, disabled,
}: {
  icon: typeof Bold;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-venus-purple-light text-venus-purple'
          : disabled
            ? 'text-venus-gray-300 cursor-not-allowed'
            : 'text-venus-gray-500 hover:bg-venus-gray-100 hover:text-venus-gray-700'
      }`}
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-venus-gray-200 mx-0.5 shrink-0" />;
}

// ─── Editor ─────────────────────────────────────────

interface CommentPopoverState {
  anchorRect: DOMRect;
  selectedText: string;
  from: number;
  to: number;
}

interface SparkEditorProps {
  /** Spark ID — used as the collaborative document name */
  sparkId: string;
  /** Called when the user clicks "Ask AI" on a selection in the bubble menu */
  onAskAI?: (sel: EditorSelection) => void;
  /** Initial TipTap JSON document to restore on mount */
  initialContent?: JSONContent;
  /** Fires on every document change with the current JSON */
  onContentChange?: (content: JSONContent) => void;
  /** Called when a new comment thread is created via the popover */
  onCommentCreate?: (data: CommentSubmitData) => void;
  /** Called when user clicks a comment mark in the editor */
  onCommentMarkClick?: (threadId: string) => void;
  /** The currently active thread (highlighted in editor) */
  activeThreadId?: string | null;
  /** Canvas groups for slash command insertion */
  canvasGroups?: CanvasGroup[];
  /** All spark items (used to resolve group member details) */
  sparkItems?: SparkItem[];
  /** Fires when the set of connected collaborators changes */
  onPresenceChange?: (users: CollabUser[], localClientId: number) => void;
  /** Called to update the local user's display name (from parent) */
  collabNameOverride?: string;
}

export default function SparkEditor({
  sparkId, onAskAI, initialContent, onContentChange,
  onCommentCreate, onCommentMarkClick, activeThreadId,
  canvasGroups, sparkItems, onPresenceChange, collabNameOverride,
}: SparkEditorProps) {
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [commentPopover, setCommentPopover] = useState<CommentPopoverState | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const ctx = useEditorContext();

  // Keep a ref so the onUpdate closure always sees the latest callback
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Sync canvas groups + items into module-level store for slash commands
  useEffect(() => {
    _canvasGroups = canvasGroups ?? [];
    _sparkItems = sparkItems ?? [];
  }, [canvasGroups, sparkItems]);

  // ── Yjs document + TipTap Cloud provider ───────────
  // Y.Doc is created synchronously via useState so it's available on the
  // very first render when useEditor reads the extensions array.
  const [ydoc] = useState(() => new Y.Doc());
  const initialContentRef = useRef(initialContent);
  const editorInstanceRef = useRef<Editor | null>(null);
  const [provider, setProvider] = useState<TiptapCollabProvider | null>(null);

  // Keep a ref to the latest onPresenceChange callback
  const onPresenceChangeRef = useRef(onPresenceChange);
  onPresenceChangeRef.current = onPresenceChange;

  useEffect(() => {
    const docName = `spark-${sparkId}`;

    const p = new TiptapCollabProvider({
      appId: process.env.NEXT_PUBLIC_TIPTAP_APP_ID!,
      name: docName,
      document: ydoc,
      token: async () => {
        const res = await fetch(`/api/collab-token?docName=${encodeURIComponent(docName)}`);
        const data = await res.json();
        return data.token as string;
      },
      onSynced() {
        // If the Yjs doc came back empty (first ever open), seed it with
        // the initialContent stored in Supabase metadata.
        const yXmlFragment = ydoc.getXmlFragment('default');
        if (yXmlFragment.length === 0 && initialContentRef.current) {
          setTimeout(() => {
            const ed = editorInstanceRef.current;
            if (ed && !ed.isDestroyed) {
              ed.commands.setContent(initialContentRef.current!);
            }
          }, 50);
        }
      },
    });

    setProvider(p);

    // Set local user awareness state once connected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awareness = (p as any).awareness! as import('y-protocols/awareness').Awareness;
    const localIndex = awareness.clientID % COLLAB_COLORS.length;
    const defaultName = getStoredName() || `User ${(localIndex % 99) + 1}`;
    const color = getCollabColor(localIndex);
    awareness.setLocalStateField('user', { name: defaultName, color });

    // Broadcast presence changes to parent
    const handleAwarenessChange = () => {
      const states = awareness.getStates() as Map<number, { user?: { name: string; color: string } }>;
      const users: CollabUser[] = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          users.push({ clientId, name: state.user.name, color: state.user.color });
        }
      });
      onPresenceChangeRef.current?.(users, awareness.clientID);
    };
    awareness.on('change', handleAwarenessChange);
    // Fire once immediately to pick up existing peers
    handleAwarenessChange();

    return () => {
      awareness.off('change', handleAwarenessChange);
      p.destroy();
      setProvider(null);
    };
  }, [sparkId, ydoc]);

  // Update local awareness name when parent sends a name override
  useEffect(() => {
    if (!provider || !collabNameOverride) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awareness = (provider as any).awareness! as import('y-protocols/awareness').Awareness;
    const current = (awareness.getLocalState() as { user?: { name: string; color: string } })?.user;
    if (current && current.name !== collabNameOverride) {
      awareness.setLocalStateField('user', { ...current, name: collabNameOverride });
      setStoredName(collabNameOverride);
    }
  }, [provider, collabNameOverride]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable built-in undo/redo — Yjs provides its own undo manager
        undoRedo: false,
      }),
      Placeholder.configure({ placeholder: 'Start writing…' }),

      // Images
      Image.configure({ allowBase64: true }),

      // Tables — all four nodes must be registered
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,

      // Task lists
      TaskList,
      TaskItem.configure({ nested: true }),

      // Drawing (custom SVG NodeView)
      DrawingExtension,

      // Group block (canvas group card NodeView)
      GroupBlockExtension,

      // Mentions
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: mentionSuggestion,
      }),

      // Comment marks
      CommentMark,

      // Slash commands
      SlashCommand.configure({
        suggestion: slashCommandSuggestion,
      }),

      // Real-time collaboration via Yjs CRDT
      Collaboration.configure({ document: ydoc }),

      // Remote cursors + selections via Yjs awareness
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(provider ? [CollaborationCursorExtension.configure({
        awareness: (provider as any).awareness! as import('y-protocols/awareness').Awareness,
        user: ((provider as any).awareness!.getLocalState() as { user?: { name: string; color: string } })?.user ?? {
          name: 'Anonymous',
          color: COLLAB_COLORS[0],
        },
        render(user: { name: string; color: string }) {
          const cursor = document.createElement('span');
          cursor.classList.add('collaboration-cursor__caret');
          cursor.style.setProperty('--cursor-color', user.color);
          cursor.style.borderColor = user.color;

          const label = document.createElement('span');
          label.classList.add('collaboration-cursor__label');
          label.style.setProperty('--cursor-color', user.color);
          label.style.backgroundColor = user.color;
          label.textContent = user.name;
          cursor.appendChild(label);

          return cursor;
        },
      })] : []),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'spark-editor-content focus:outline-none' },
    },
    onUpdate({ editor: ed }) {
      onContentChangeRef.current?.(ed.getJSON());
    },
    onCreate({ editor: ed }) {
      editorInstanceRef.current = ed;
    },
    onDestroy() {
      editorInstanceRef.current = null;
    },
  }, [provider]);

  const insertImage = useCallback(() => {
    const url = imageUrl.trim();
    if (!url || !editor) return;
    editor.chain().focus().setImage({ src: url }).run();
    setImageUrl('');
    setImageOpen(false);
  }, [editor, imageUrl]);

  const openImageInput = useCallback(() => {
    setImageOpen(v => !v);
    setTimeout(() => imageInputRef.current?.focus(), 50);
  }, []);

  // Register the editor instance in the shared context so ChatPanel can
  // read document text and apply proposals back to the document.
  useEffect(() => {
    if (!editor) return;
    ctx?.setEditor(editor);
    return () => ctx?.setEditor(null);
  }, [editor, ctx]);

  // Toggle .active class on comment marks when activeThreadId changes.
  // Guard: editor.view may not be available yet if the editor was just
  // recreated (e.g. when provider changes) and EditorContent hasn't mounted.
  useEffect(() => {
    if (!editor) return;
    let el: HTMLElement;
    try { el = editor.view.dom; } catch { return; }
    el.querySelectorAll('.comment-mark.active').forEach(node => node.classList.remove('active'));
    if (activeThreadId) {
      el.querySelectorAll(`[data-thread-id="${activeThreadId}"]`).forEach(node => node.classList.add('active'));
    }
  }, [editor, activeThreadId]);

  // Handle click on comment marks
  const handleEditorClick = useCallback((ev: React.MouseEvent) => {
    const target = (ev.target as HTMLElement).closest('[data-thread-id]') as HTMLElement | null;
    if (target) {
      const threadId = target.getAttribute('data-thread-id');
      if (threadId) onCommentMarkClick?.(threadId);
    }
  }, [onCommentMarkClick]);

  // Handle comment popover submit
  const handleCommentSubmit = useCallback((data: CommentSubmitData) => {
    if (!editor) return;

    // Check if the selection covers an atom node (e.g. groupBlock).
    // Marks can't be applied to atom nodes, so skip the mark but still
    // create the discussion thread.
    const node = editor.state.doc.nodeAt(data.from);
    const isAtom = node?.type.spec.atom === true;

    if (!isAtom) {
      editor.chain()
        .setTextSelection({ from: data.from, to: data.to })
        .setComment(data.threadId)
        .run();
    }

    setCommentPopover(null);
    onCommentCreate?.(data);
  }, [editor, onCommentCreate]);

  if (!editor) return null;
  const e = editor;

  return (
    <div className="flex flex-col h-full bg-surface">

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center flex-wrap gap-0.5 px-3 py-2 border-b border-venus-gray-200 bg-surface">

        {/* Inline format */}
        <ToolbarBtn icon={Bold}          label="Bold"          onClick={() => e.chain().focus().toggleBold().run()}          active={e.isActive('bold')} />
        <ToolbarBtn icon={Italic}        label="Italic"        onClick={() => e.chain().focus().toggleItalic().run()}        active={e.isActive('italic')} />
        <ToolbarBtn icon={Strikethrough} label="Strikethrough" onClick={() => e.chain().focus().toggleStrike().run()}        active={e.isActive('strike')} />
        <ToolbarBtn icon={Code}          label="Inline code"   onClick={() => e.chain().focus().toggleCode().run()}          active={e.isActive('code')} />

        <Sep />

        {/* Headings */}
        <ToolbarBtn icon={Heading1} label="Heading 1" onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} active={e.isActive('heading', { level: 1 })} />
        <ToolbarBtn icon={Heading2} label="Heading 2" onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} />
        <ToolbarBtn icon={Heading3} label="Heading 3" onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive('heading', { level: 3 })} />

        <Sep />

        {/* Lists */}
        <ToolbarBtn icon={List}        label="Bullet list"   onClick={() => e.chain().focus().toggleBulletList().run()}   active={e.isActive('bulletList')} />
        <ToolbarBtn icon={ListOrdered} label="Ordered list"  onClick={() => e.chain().focus().toggleOrderedList().run()}  active={e.isActive('orderedList')} />
        <ToolbarBtn icon={CheckSquare} label="Task list"     onClick={() => e.chain().focus().toggleTaskList().run()}     active={e.isActive('taskList')} />
        <ToolbarBtn icon={Quote}       label="Blockquote"    onClick={() => e.chain().focus().toggleBlockquote().run()}   active={e.isActive('blockquote')} />

        <Sep />

        {/* Insert */}

        {/* Image */}
        <div className="relative">
          <ToolbarBtn icon={ImageIcon} label="Insert image" onClick={openImageInput} active={imageOpen} />
          {imageOpen && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-card-bg rounded-lg border border-venus-gray-200 shadow-lg p-3 w-72">
              <p className="text-xs font-medium text-venus-gray-600 mb-2">Image URL</p>
              <input
                ref={imageInputRef}
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full text-sm bg-venus-gray-50 border border-venus-gray-200 focus:border-venus-purple rounded px-2.5 py-1.5 outline-none mb-2"
                onKeyDown={ev => {
                  if (ev.key === 'Enter') insertImage();
                  if (ev.key === 'Escape') { setImageOpen(false); setImageUrl(''); }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onMouseDown={ev => { ev.preventDefault(); setImageOpen(false); setImageUrl(''); }}
                  className="text-xs text-venus-gray-500 px-2.5 py-1 hover:bg-venus-gray-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onMouseDown={ev => { ev.preventDefault(); insertImage(); }}
                  className="text-xs bg-venus-purple hover:bg-venus-purple-deep text-white px-2.5 py-1 rounded transition-colors"
                >
                  Insert
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <ToolbarBtn
          icon={Table2}
          label="Insert table"
          onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          active={e.isActive('table')}
        />

        {/* Drawing */}
        <ToolbarBtn
          icon={Pencil}
          label="Insert drawing"
          onClick={() => e.chain().focus().insertDrawing().run()}
        />

        <Sep />

        {/* Rule */}
        <ToolbarBtn icon={Minus} label="Horizontal rule" onClick={() => e.chain().focus().setHorizontalRule().run()} />
      </div>

      {/* ── Bubble menu (appears on text selection) ── */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: ed, from, to }) =>
          from !== to && !ed.isActive('code') && !ed.isActive('codeBlock')
        }
        options={{ placement: 'top', offset: 8 }}
        className="tiptap-bubble-menu"
      >
        <ToolbarBtn icon={Bold}          label="Bold"          onClick={() => e.chain().focus().toggleBold().run()}          active={e.isActive('bold')} />
        <ToolbarBtn icon={Italic}        label="Italic"        onClick={() => e.chain().focus().toggleItalic().run()}        active={e.isActive('italic')} />
        <ToolbarBtn icon={Strikethrough} label="Strikethrough" onClick={() => e.chain().focus().toggleStrike().run()}        active={e.isActive('strike')} />
        <ToolbarBtn icon={Code}          label="Inline code"   onClick={() => e.chain().focus().toggleCode().run()}          active={e.isActive('code')} />
        <div className="w-px h-4 bg-venus-gray-200 mx-0.5" />
        <ToolbarBtn icon={Heading1}      label="Heading 1"     onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} active={e.isActive('heading', { level: 1 })} />
        <ToolbarBtn icon={Heading2}      label="Heading 2"     onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} />
        <ToolbarBtn icon={Quote}         label="Blockquote"    onClick={() => e.chain().focus().toggleBlockquote().run()}    active={e.isActive('blockquote')} />
        {onAskAI && (
          <>
            <div className="w-px h-4 bg-venus-gray-200 mx-0.5" />
            <button
              onMouseDown={(ev) => {
                ev.preventDefault();
                const { from, to } = e.state.selection;
                const text = e.state.doc.textBetween(from, to, ' ');
                if (text.trim()) onAskAI({ text, from, to });
              }}
              title="Ask Foundry about this text"
              aria-label="Ask Foundry"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-venus-purple text-white hover:bg-venus-purple-deep transition-colors"
            >
              <Sparkles size={11} strokeWidth={2} />
              Ask Foundry
            </button>
          </>
        )}
        {onCommentCreate && (
          <>
            <div className="w-px h-4 bg-venus-gray-200 mx-0.5" />
            <button
              onMouseDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const sel = e.state.selection;
                const { from, to } = sel;

                // For atom nodes (e.g. groupBlock), extract a label
                // from node attrs since textBetween returns empty.
                let text: string;
                if (sel instanceof NodeSelection && sel.node.type.spec.atom) {
                  const node = sel.node;
                  text = node.attrs.groupName || node.attrs.title || node.type.name;
                } else {
                  text = e.state.doc.textBetween(from, to, ' ');
                }
                if (!text.trim()) return;

                const startCoords = e.view.coordsAtPos(from);
                const endCoords = e.view.coordsAtPos(to);
                const rect = new DOMRect(
                  startCoords.left,
                  startCoords.top,
                  endCoords.right - startCoords.left,
                  endCoords.bottom - startCoords.top,
                );
                setCommentPopover({ anchorRect: rect, selectedText: text, from, to });
              }}
              title="Comment on this text"
              aria-label="Comment"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-venus-gray-600 hover:bg-venus-gray-100 transition-colors"
            >
              <MessageSquareText size={11} strokeWidth={2} />
              Comment
            </button>
          </>
        )}
      </BubbleMenu>

      {/* ── Editor content ── */}
      <div
        ref={editorContainerRef}
        className="relative flex-1 overflow-y-auto"
        onClick={(ev) => {
          handleEditorClick(ev);
          // Only focus editor if not clicking inside popover
          if (!(ev.target as HTMLElement).closest('.comment-popover-container')) {
            e.commands.focus();
          }
        }}
      >
        <EditorContent editor={editor} className="h-full" />

        {/* Comment popover */}
        {commentPopover && editorContainerRef.current && (
          <div className="comment-popover-container">
            <CommentPopover
              anchorRect={commentPopover.anchorRect}
              containerRect={editorContainerRef.current.getBoundingClientRect()}
              selectedText={commentPopover.selectedText}
              from={commentPopover.from}
              to={commentPopover.to}
              onSubmit={handleCommentSubmit}
              onCancel={() => setCommentPopover(null)}
            />
          </div>
        )}
      </div>

    </div>
  );
}
