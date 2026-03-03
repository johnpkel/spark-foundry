'use client';

import { useState, useCallback, Fragment } from 'react';
import { MessageSquareText, Check, ChevronDown, ChevronRight, Reply, MessageCircle } from 'lucide-react';
import { useEditorContext } from '@/lib/editor-context';
import type { CommentThread, ThreadComment } from '@/lib/types';

// ─── Helpers ────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Renders comment content, styling @mentions as purple spans */
function renderCommentContent(content: string) {
  const parts = content.split(/(@\w[\w\s]*?\w(?=\s|$|@)|@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-venus-purple font-medium text-xs bg-venus-purple-light rounded px-0.5">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// ─── Single comment display ─────────────────────────

function CommentBubble({ comment, isReply }: { comment: ThreadComment; isReply?: boolean }) {
  return (
    <div className={isReply ? 'ml-3 pl-3 border-l-2 border-venus-gray-200' : ''}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-xs font-semibold text-venus-gray-700">{comment.authorName}</span>
        <span className="text-[10px] text-venus-gray-400">{formatTimeAgo(comment.createdAt)}</span>
      </div>
      <p className="text-sm text-venus-gray-600 leading-relaxed whitespace-pre-wrap">
        {renderCommentContent(comment.content)}
      </p>
    </div>
  );
}

// ─── Thread card ────────────────────────────────────

function ThreadCard({
  thread,
  isActive,
  onActivate,
  onResolve,
  onReply,
}: {
  thread: CommentThread;
  isActive: boolean;
  onActivate: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
}) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleReplySubmit = () => {
    if (!replyText.trim()) return;
    onReply(replyText.trim());
    setReplyText('');
    setShowReplyInput(false);
  };

  const original = thread.comments[0];
  const replies = thread.comments.slice(1);

  return (
    <div
      onClick={onActivate}
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        isActive
          ? 'border-venus-purple bg-venus-purple-light/30'
          : 'border-venus-gray-200 bg-card-bg hover:border-venus-gray-300'
      } ${thread.resolved ? 'opacity-60' : ''}`}
    >
      {/* Quoted text */}
      <div className="text-xs text-venus-gray-500 italic border-l-2 border-venus-purple-medium pl-2 mb-2 line-clamp-2">
        &ldquo;{thread.selectedText}&rdquo;
      </div>

      {/* Original comment */}
      {original && <CommentBubble comment={original} />}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {replies.map((reply) => (
            <CommentBubble key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}

      {/* Actions */}
      {!thread.resolved && (
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-venus-gray-100">
          <button
            onClick={(ev) => { ev.stopPropagation(); setShowReplyInput(v => !v); }}
            className="flex items-center gap-1 text-[11px] text-venus-gray-500 hover:text-venus-gray-700 transition-colors"
          >
            <Reply size={12} />
            Reply
          </button>
          <button
            onClick={(ev) => { ev.stopPropagation(); onResolve(); }}
            className="flex items-center gap-1 text-[11px] text-venus-green hover:text-venus-green/80 transition-colors ml-auto"
          >
            <Check size={12} />
            Resolve
          </button>
        </div>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <div className="mt-2" onClick={(ev) => ev.stopPropagation()}>
          <input
            autoFocus
            value={replyText}
            onChange={(ev) => setReplyText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); handleReplySubmit(); }
              if (ev.key === 'Escape') { setShowReplyInput(false); setReplyText(''); }
            }}
            placeholder="Reply…"
            className="w-full text-sm bg-venus-gray-50 border border-venus-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-venus-purple"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────

interface DiscussionsPanelProps {
  discussions: CommentThread[];
  activeThreadId: string | null;
  onActivateThread: (threadId: string) => void;
  onResolveThread: (threadId: string) => void;
  onAddReply: (threadId: string, text: string) => void;
}

export default function DiscussionsPanel({
  discussions,
  activeThreadId,
  onActivateThread,
  onResolveThread,
  onAddReply,
}: DiscussionsPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const editorCtx = useEditorContext();

  const openThreads = discussions.filter(t => !t.resolved);
  const resolvedThreads = discussions.filter(t => t.resolved);

  const scrollToMark = useCallback((threadId: string) => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;
    let targetPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (targetPos !== null) return false;
      for (const mark of node.marks) {
        if (mark.type.name === 'commentMark' && mark.attrs.threadId === threadId) {
          targetPos = pos;
          return false;
        }
      }
    });
    if (targetPos !== null) {
      editor.commands.setTextSelection(targetPos);
      editor.commands.scrollIntoView();
    }
  }, [editorCtx]);

  const handleActivate = useCallback((threadId: string) => {
    onActivateThread(threadId);
    scrollToMark(threadId);
  }, [onActivateThread, scrollToMark]);

  // Empty state
  if (discussions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-venus-gray-100 flex items-center justify-center mb-3">
          <MessageCircle size={18} className="text-venus-gray-400" />
        </div>
        <h3 className="text-sm font-semibold text-venus-gray-700 mb-1">No discussions yet</h3>
        <p className="text-xs text-venus-gray-500 leading-relaxed">
          Select text in the editor and click <strong>Comment</strong> in the bubble menu to start a discussion.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-venus-gray-200">
        <div className="flex items-center gap-1.5">
          <MessageSquareText size={13} className="text-venus-purple" />
          <span className="text-xs font-semibold text-venus-gray-700">Discussions</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-venus-purple/10 text-venus-purple">
            {openThreads.length}
          </span>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {/* Open threads */}
        {openThreads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            isActive={activeThreadId === thread.id}
            onActivate={() => handleActivate(thread.id)}
            onResolve={() => onResolveThread(thread.id)}
            onReply={(text) => onAddReply(thread.id, text)}
          />
        ))}

        {/* Resolved threads */}
        {resolvedThreads.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowResolved(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-venus-gray-500 hover:text-venus-gray-700 transition-colors w-full"
            >
              {showResolved ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Resolved ({resolvedThreads.length})
            </button>
            {showResolved && (
              <div className="mt-2 space-y-2">
                {resolvedThreads.map((thread) => (
                  <ThreadCard
                    key={thread.id}
                    thread={thread}
                    isActive={activeThreadId === thread.id}
                    onActivate={() => handleActivate(thread.id)}
                    onResolve={() => {}}
                    onReply={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
