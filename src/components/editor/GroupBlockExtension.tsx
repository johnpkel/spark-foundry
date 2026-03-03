'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';
import { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

// ─── Types ──────────────────────────────────────────

export interface GroupBlockItem {
  title: string;
  type: string;
  summary: string | null;
  thumbnailUrl: string | null;
}

interface GroupBlockAttrs {
  groupId: string;
  groupName: string;
  color: string;
  items: GroupBlockItem[];
  conversation: string | null;
  sessionId: string | null;
}

// ─── NodeView component ─────────────────────────────

const PREVIEW_LIMIT = 3;

function GroupBlockNodeView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as GroupBlockAttrs;
  const [expanded, setExpanded] = useState(false);

  const items = attrs.items ?? [];
  const hasMore = items.length > PREVIEW_LIMIT;
  const previewItems = expanded ? items : items.slice(0, PREVIEW_LIMIT);
  const thumbnail = items.find(i => i.thumbnailUrl)?.thumbnailUrl ?? null;
  const hasConversation = !!attrs.conversation;
  const isLoadingConversation = !!attrs.sessionId && !attrs.conversation;

  return (
    <NodeViewWrapper>
      <div
        className={`group-block ${selected ? 'group-block--selected' : ''}`}
        style={{ '--group-color': attrs.color || 'var(--venus-purple)' } as React.CSSProperties}
        data-drag-handle
      >
        {/* Header */}
        <div className="group-block__header">
          <Layers size={14} strokeWidth={2} style={{ color: attrs.color || 'var(--venus-purple)' }} />
          <span className="group-block__name">{attrs.groupName}</span>
          <span className="group-block__badge">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="group-block__body">
          {/* Thumbnail floated right if available */}
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              className="group-block__thumbnail"
            />
          )}

          {/* Item list */}
          {items.length === 0 ? (
            <p className="group-block__empty">No items</p>
          ) : (
            <ul className="group-block__items">
              {previewItems.map((item, i) => (
                <li key={i} className="group-block__item">
                  <span className="group-block__item-title">{item.title}</span>
                  <span className="group-block__item-type">{item.type}</span>
                  {item.summary && (
                    <span className="group-block__item-summary">
                      {item.summary.length > 120 ? item.summary.slice(0, 120) + '…' : item.summary}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* "+N more" indicator */}
          {!expanded && hasMore && (
            <p className="group-block__more">+{items.length - PREVIEW_LIMIT} more item{items.length - PREVIEW_LIMIT !== 1 ? 's' : ''}</p>
          )}

          {/* Clear float */}
          {thumbnail && <div style={{ clear: 'both' }} />}
        </div>

        {/* Expand toggle — show when there's more items or a conversation */}
        {(hasMore || hasConversation || isLoadingConversation) && (
          <div className="group-block__footer">
            <button
              type="button"
              className="group-block__toggle"
              onMouseDown={e => { e.preventDefault(); setExpanded(v => !v); }}
            >
              {expanded ? (
                <><ChevronUp size={13} /> Collapse</>
              ) : (
                <><ChevronDown size={13} /> Expand</>
              )}
            </button>
          </div>
        )}

        {/* Expanded conversation section */}
        {expanded && (hasConversation || isLoadingConversation) && (
          <div className="group-block__conversation">
            <p className="group-block__conversation-label">Conversation</p>
            {isLoadingConversation && !hasConversation ? (
              <div className="group-block__loading">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading conversation…</span>
              </div>
            ) : (
              <blockquote className="group-block__quote">
                {attrs.conversation}
              </blockquote>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extension ──────────────────────────────────────

export const GroupBlockExtension = Node.create({
  name: 'groupBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      groupId: { default: '' },
      groupName: { default: '' },
      color: { default: '#6c5ce7' },
      items: {
        default: [],
        parseHTML: el => JSON.parse(el.getAttribute('data-items') || '[]'),
        renderHTML: attrs => ({ 'data-items': JSON.stringify(attrs.items) }),
      },
      conversation: { default: null },
      sessionId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="groupBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'groupBlock' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GroupBlockNodeView);
  },

  addCommands() {
    return {
      insertGroupBlock:
        (attrs: Partial<GroupBlockAttrs>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'groupBlock',
            attrs,
          });
        },
    };
  },
});

// ─── TypeScript declaration merging ─────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    groupBlock: {
      insertGroupBlock: (attrs: Partial<GroupBlockAttrs>) => ReturnType;
    };
  }
}
