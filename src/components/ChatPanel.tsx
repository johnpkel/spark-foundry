'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles, Search, Lightbulb, History, Plus,
  Wand2, Check, Copy, X, FileCheck2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ChatSessionSidebar from './ChatSessionSidebar';
import VectorVisualization from './VectorVisualizationDynamic';
import { useEditorContext } from '@/lib/editor-context';
import type { ChatSession, VectorContextItem } from '@/lib/types';

// ─── Types ────────────────────────────────────────────

interface MessagePart {
  type: 'text' | 'proposal';
  content: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  contextItems?: VectorContextItem[];
  userQuery?: string;
}

interface ChatPanelProps {
  sparkId: string;
  itemCount?: number;
}

// ─── Proposal block parser ────────────────────────────
//
// The AI wraps suggested text replacements in ```proposal fenced blocks.
// We split the message on these and render them as interactive cards.

function parseMessageParts(content: string): MessagePart[] {
  const regex = /```proposal\n([\s\S]*?)\n?```/g;
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) parts.push({ type: 'text', content: text });
    }
    parts.push({ type: 'proposal', content: match[1].trim() });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) parts.push({ type: 'text', content: text });
  }

  return parts.length ? parts : [{ type: 'text', content }];
}

// ─── Sub-components ───────────────────────────────────

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        img: ({ src, alt }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || 'Image'}
            className="rounded-lg max-w-full max-h-64 object-contain my-2"
            loading="lazy"
          />
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-venus-purple underline hover:text-venus-purple-deep"
          >
            {children}
          </a>
        ),
        pre: ({ children }) => (
          <pre className="bg-venus-gray-200 rounded-lg p-3 my-2 overflow-x-auto text-xs">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-venus-gray-200 px-1 py-0.5 rounded text-xs">{children}</code>
          ) : (
            <code className={className}>{children}</code>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-venus-gray-300 bg-venus-gray-200 px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-venus-gray-300 px-2 py-1">{children}</td>
        ),
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
        p: ({ children }) => <p className="my-1">{children}</p>,
        hr: () => <hr className="my-2 border-venus-gray-300" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-venus-purple pl-3 my-2 text-venus-gray-500 italic">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Renders a suggested edit from the AI with an Apply / Copy button.
 * "Apply" replaces the stored selection (or inserts at cursor).
 * "Copy" falls back to clipboard when no editor context is available.
 */
function ProposalCard({
  proposal,
  onApply,
}: {
  proposal: string;
  onApply: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(proposal).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-3 rounded-lg border border-venus-purple/30 bg-venus-purple-light/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-venus-purple/10 border-b border-venus-purple/20">
        <Wand2 size={12} className="text-venus-purple" />
        <span className="text-xs font-semibold text-venus-purple">Suggested Edit</span>
      </div>

      {/* Proposal text */}
      <div className="px-3 py-2.5 text-xs font-mono text-venus-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
        {proposal}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-venus-purple/20 bg-venus-purple/5">
        <button
          onClick={() => onApply(proposal)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-venus-purple hover:bg-venus-purple-deep text-white rounded-md transition-colors"
        >
          <Check size={11} />
          Apply to Document
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100 rounded-md transition-colors"
        >
          {copied ? <Check size={11} className="text-venus-green" /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────

export default function ChatPanel({ sparkId, itemCount = 0 }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [didYouKnow, setDidYouKnow] = useState<string | null>(null);
  const [didYouKnowLoading, setDidYouKnowLoading] = useState(false);

  // ── Editor context ──────────────────────────────────
  const editorCtx = useEditorContext();
  const selectedText = editorCtx?.selectedText ?? null;
  const setSelectedText = editorCtx?.setSelectedText;
  const applyProposal = editorCtx?.applyProposal;
  const getDocumentText = editorCtx?.getDocumentText;

  // When "Ask AI" sets a selection, focus the textarea so the user can type immediately
  useEffect(() => {
    if (selectedText) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [selectedText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusMessage]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?spark_id=${sparkId}`);
      if (res.ok) setSessions(await res.json());
    } catch { /* silently fail */ }
  }, [sparkId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Auto-generate "Did you know" fact on mount when items exist
  useEffect(() => {
    if (itemCount === 0) return;
    let cancelled = false;
    setDidYouKnowLoading(true);

    (async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spark_id: sparkId,
            skip_persist: true,
            message:
              'Generate a single short, surprising "Did you know?" fact based on the items in this Spark. Keep it to 1-2 sentences. Do not use any tools — use only the context already provided. Start your response with "Did you know?"',
          }),
        });
        if (!res.ok || cancelled) return;

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let fact = '';
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'text') fact += data.content;
                } catch { /* skip */ }
              }
            }
          }
          if (!cancelled && fact.trim()) setDidYouKnow(fact.trim());
        }
      } catch { /* silently fail */ }
      finally { if (!cancelled) setDidYouKnowLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [itemCount, sparkId]);

  // ── Submit ─────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');

    // Capture selection context at submit time (it may be cleared after apply)
    const activeSelectedText = selectedText?.text;
    const docText = getDocumentText?.() ?? '';

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);
    setStatusMessage(null);
    setMessages(prev => [...prev, { role: 'assistant', content: '', userQuery: userMessage }]);

    try {
      const body: Record<string, unknown> = {
        spark_id: sparkId,
        message: userMessage,
        session_id: activeSessionId,
      };

      // Include editor document context when there's content
      if (docText.trim().length > 20) {
        body.editor_content = docText.slice(0, 8000);
      }
      // Include the specific selected text when in "Ask AI" mode
      if (activeSelectedText) {
        body.selected_text = activeSelectedText;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'context') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, contextItems: data.items };
                    }
                    return updated;
                  });
                } else if (data.type === 'text') {
                  setStatusMessage(null);
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, content: last.content + data.content };
                    }
                    return updated;
                  });
                } else if (data.type === 'status') {
                  setStatusMessage(data.content);
                } else if (data.type === 'error') {
                  setStatusMessage(null);
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, content: `Error: ${data.content}` };
                    }
                    return updated;
                  });
                } else if (data.type === 'done') {
                  setStatusMessage(null);
                  if (data.session_id && !activeSessionId) setActiveSessionId(data.session_id);
                  fetchSessions();
                }
              } catch { /* skip malformed events */ }
            }
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.' };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      setStatusMessage(null);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveSessionId(sessionId);
      setMessages(
        (data.messages || [])
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
          .map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
      );
    } catch { /* silently fail */ }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleApplyProposal = useCallback((text: string) => {
    applyProposal?.(text);
  }, [applyProposal]);

  const suggestedPrompts = selectedText
    ? [
        `Improve the clarity of this text`,
        `Make this more concise`,
        `Rewrite in a more formal tone`,
        `Expand on this with more detail`,
      ]
    : [
        'Summarize everything in this Spark',
        'What are the key themes across these items?',
        'Generate a CMS entry from this content',
        'Create a campaign brief based on this research',
      ];

  const docText = getDocumentText?.() ?? '';
  const hasDocContent = docText.trim().length > 20;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Session Sidebar */}
      <ChatSessionSidebar
        sparkId={sparkId}
        activeSessionId={activeSessionId}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        sessions={sessions}
      />

      {/* Session toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-venus-gray-200 bg-venus-gray-50 shrink-0">
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-venus-gray-600 hover:text-venus-purple hover:bg-venus-purple-light rounded-md transition-colors"
        >
          <History size={14} />
          History
          {sessions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-venus-purple/10 text-venus-purple rounded-full">
              {sessions.length}
            </span>
          )}
        </button>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-venus-gray-600 hover:text-venus-purple hover:bg-venus-purple-light rounded-md transition-colors"
        >
          <Plus size={14} />
          New Chat
        </button>
        {/* Document context indicator */}
        {hasDocContent && !selectedText && (
          <span
            title="Document content is included in this conversation"
            className="ml-auto text-venus-green"
          >
            <FileCheck2 size={14} strokeWidth={1.75} />
          </span>
        )}
      </div>

      {/* ── Selected text mode indicator (toolbar badge only — no quoted text) ── */}
      {selectedText && (
        <div className="shrink-0 px-4 py-1.5 bg-venus-purple-light border-b border-venus-purple/20 flex items-center gap-2">
          <Sparkles size={11} className="text-venus-purple shrink-0" />
          <span className="text-xs font-semibold text-venus-purple flex-1">Ask Foundry — selection active</span>
          <button
            onClick={() => setSelectedText?.(null)}
            className="shrink-0 p-0.5 rounded text-venus-purple/50 hover:text-venus-purple transition-colors"
            title="Clear selection context"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* "Did you know" fact */}
        {(didYouKnow || didYouKnowLoading) && (
          <div className="bg-gradient-to-r from-venus-purple-light to-surface rounded-xl px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-venus-purple/10 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb size={14} className="text-venus-purple" />
              </div>
              {didYouKnowLoading ? (
                <div className="flex items-center gap-2 text-sm text-venus-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Discovering something interesting...</span>
                </div>
              ) : (
                <div className="text-sm text-venus-gray-600 leading-relaxed flex-1">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => (
                        <strong className="font-semibold text-venus-gray-700">{children}</strong>
                      ),
                    }}
                  >
                    {didYouKnow || ''}
                  </ReactMarkdown>
                </div>
              )}
              {didYouKnow && (
                <button
                  onClick={() => setDidYouKnow(null)}
                  className="text-venus-gray-400 hover:text-venus-gray-600 text-xs shrink-0 mt-0.5"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {selectedText ? (
              <>
                <div className="w-12 h-12 rounded-full bg-venus-purple-light flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-venus-purple" />
                </div>
                <h3 className="text-base font-semibold text-venus-gray-700 mb-2">Ask about your selection</h3>
                <p className="text-sm text-venus-gray-500 max-w-sm mb-6">
                  The assistant will analyze your selected text and suggest improvements. Apply changes directly back to your document.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-venus-purple-light flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-venus-purple" />
                </div>
                <h3 className="text-base font-semibold text-venus-gray-700 mb-2">Spark Assistant</h3>
                <p className="text-sm text-venus-gray-500 max-w-sm mb-6">
                  Ask questions about your collected items, generate insights, or ask me to edit your document.
                  {hasDocContent && ' I can see your current document.'}
                </p>
              </>
            )}
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    textareaRef.current?.focus();
                  }}
                  className="text-left text-sm px-3 py-2.5 rounded-lg border border-venus-gray-200 text-venus-gray-600 hover:border-venus-purple/40 hover:bg-venus-purple-light/50 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => {
          const isStreamingThisMsg = isStreaming && i === messages.length - 1;
          return (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-venus-purple-light flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} className="text-venus-purple" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-venus-purple text-white rounded-br-sm px-4 py-3'
                    : 'bg-venus-gray-100 text-venus-gray-700 rounded-bl-sm overflow-hidden'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    {/* 3D Vector visualization */}
                    {msg.contextItems && msg.contextItems.length > 0 && msg.userQuery && (
                      <div className="border-b border-venus-gray-200">
                        <VectorVisualization
                          items={msg.contextItems}
                          query={msg.userQuery}
                          isProcessing={isStreamingThisMsg}
                        />
                      </div>
                    )}
                    {/* Content */}
                    <div className="px-4 py-3">
                      {!msg.content && isStreamingThisMsg ? (
                        <div className="flex items-center gap-2 text-venus-gray-400">
                          {statusMessage ? (
                            <>
                              <Search size={14} className="animate-pulse text-venus-purple" />
                              <span className="text-venus-purple">{statusMessage}</span>
                            </>
                          ) : (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Thinking...</span>
                            </>
                          )}
                        </div>
                      ) : isStreamingThisMsg ? (
                        // While streaming, render raw markdown (no proposal parsing mid-stream)
                        <div className="chat-content">
                          <MessageContent content={msg.content} />
                        </div>
                      ) : (
                        // After streaming completes, parse and render proposal blocks
                        <div className="chat-content">
                          {parseMessageParts(msg.content).map((part, pi) =>
                            part.type === 'proposal' ? (
                              <ProposalCard
                                key={pi}
                                proposal={part.content}
                                onApply={handleApplyProposal}
                              />
                            ) : (
                              <MessageContent key={pi} content={part.content} />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="chat-content">
                    <MessageContent content={msg.content} />
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-venus-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={14} className="text-venus-gray-600" />
                </div>
              )}
            </div>
          );
        })}

        {/* Inline status during streaming after text has started */}
        {isStreaming && statusMessage && messages[messages.length - 1]?.content && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 shrink-0" />
            <div className="flex items-center gap-2 text-venus-purple text-sm px-4 py-2">
              <Search size={14} className="animate-pulse" />
              <span>{statusMessage}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-venus-gray-200 p-4 shrink-0">
        {selectedText && (
          <p className="text-[10px] text-venus-purple mb-2 font-medium">
            Ask anything about the selected text — or request a rewrite
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedText
                ? 'e.g. "Make this more concise" or "Rewrite in a formal tone"…'
                : 'Ask about your Spark or document…'
            }
            rows={1}
            className="flex-1 px-3 py-2.5 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors resize-none max-h-32"
            style={{ minHeight: '42px' }}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="p-2.5 bg-venus-purple hover:bg-venus-purple-deep text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
