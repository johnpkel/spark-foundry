'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles, Search, Lightbulb, History, Plus,
  Wand2, Check, Copy, X, FileCheck2, Brain, Zap, Eye, ShieldCheck, ChevronDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ChatSessionSidebar from './ChatSessionSidebar';
import SkillsPanel from './SkillsPanel';
import VectorVisualization from './VectorVisualizationDynamic';
import ChatMentionDropdown from './ChatMentionDropdown';
import type { MentionOption } from './ChatMentionDropdown';
import DropOverlay from './DropOverlay';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useEditorContext } from '@/lib/editor-context';
import type { ChatSession, VectorContextItem, SparkItem, CanvasGroup, SkillDraft } from '@/lib/types';

// ─── Types ────────────────────────────────────────────

interface MessagePart {
  type: 'text' | 'proposal';
  content: string;
}

interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'approval';
  content: string;
  tool?: string;
  skillName?: string;
  turn: number;
  approvalId?: string;
  approved?: boolean;
  preview?: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  contextItems?: VectorContextItem[];
  userQuery?: string;
  agentSteps?: AgentStep[];
  turnBudget?: { used: number; total: number; tokensUsed: number };
}

interface MentionState {
  active: boolean;
  query: string;
  triggerIndex: number; // position of '@' in the input string
}

interface MentionedRef {
  id: string;
  label: string;
  type: MentionOption['type'];
}

interface ChatPanelProps {
  sparkId: string;
  itemCount?: number;
  items?: SparkItem[];
  groups?: CanvasGroup[];
  onItemAdded?: () => void;
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

// ─── Next Steps extractor ─────────────────────────────
//
// Detects a trailing "Next steps" section (## or **bold** heading followed
// by a bullet list) and splits it off so the items can render as chips.

function extractNextSteps(content: string): { body: string; steps: string[] } {
  // Match "## Next steps", "**Next steps**", or "**Next steps:**" heading
  // followed by bullet items, at the end of the message
  const pattern = /\n+(?:#{1,3}\s+Next\s+steps|(?:\*\*|__)Next\s+steps:?(?:\*\*|__))[ \t]*\n((?:[ \t]*[-*][ \t]+.+\n?)+)$/i;
  const match = content.match(pattern);
  if (!match) return { body: content, steps: [] };

  const body = content.slice(0, match.index!).trimEnd();
  const steps = match[1]
    .split('\n')
    .map(line => line.replace(/^[ \t]*[-*][ \t]+/, '').trim())
    .filter(Boolean);

  return { body, steps };
}

/**
 * Convert a question-style next-step into a directive-style prompt.
 * "Want me to narrow the goals to DACH only?" → "Narrow the goals to DACH only"
 * "Should I add goal owners alongside each KPI?" → "Add goal owners alongside each KPI"
 */
function toDirective(step: string): string {
  let s = step;
  // Strip trailing question mark
  s = s.replace(/\?+$/, '');
  // "Want me to X" / "Want to X" → "X"
  s = s.replace(/^(?:Do you )?want (?:me )?to\s+/i, '');
  // "Would you like me to X" / "Would you like to X" → "X"
  s = s.replace(/^Would you like (?:me )?to\s+/i, '');
  // "Should I X" → "X"
  s = s.replace(/^Should I\s+/i, '');
  // "Shall I X" → "X"
  s = s.replace(/^Shall I\s+/i, '');
  // "Can I X" / "Could I X" → "X"
  s = s.replace(/^(?:Can|Could) I\s+/i, '');
  // "Do you want X" → "X"
  s = s.replace(/^Do you want\s+/i, '');
  // "Would you prefer X" → "X"
  s = s.replace(/^Would you prefer\s+/i, '');
  // Capitalize first letter
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
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

// ─── Agent step sub-components ────────────────────────

function ThoughtBubble({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 120;

  return (
    <div className="my-1.5 rounded-lg bg-venus-purple-light/30 border border-venus-purple/15">
      <button
        onClick={() => isLong && setExpanded(!expanded)}
        className="flex items-start gap-2 px-3 py-2 w-full text-left"
      >
        <Brain size={12} className="text-venus-purple/60 mt-0.5 shrink-0" />
        <span className={`text-xs text-venus-gray-500 font-mono leading-relaxed ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
          {content}
        </span>
        {isLong && (
          <ChevronDown
            size={12}
            className={`text-venus-gray-400 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>
    </div>
  );
}

function ActionCard({ tool, input, isActive }: { tool: string; input: string; isActive?: boolean }) {
  return (
    <div className="my-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200/50 text-xs">
      {isActive ? (
        <Loader2 size={12} className="text-blue-500 animate-spin shrink-0" />
      ) : (
        <Zap size={12} className="text-blue-500 shrink-0" />
      )}
      <span className="font-semibold text-blue-700">{tool}</span>
      <span className="text-blue-500 truncate">{input}</span>
    </div>
  );
}

function SkillActivationCard({ skillName }: { skillName: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-venus-purple/10 border border-venus-purple/30 text-xs ring-1 ring-venus-purple/20">
      <Zap size={12} className="text-venus-purple shrink-0" />
      <span className="font-semibold text-venus-purple">{skillName}</span>
      <span className="text-venus-purple/60 ml-auto text-[10px]">Skill activated</span>
    </div>
  );
}

function ObservationCard({ tool, summary, success }: { tool: string; summary: string; success: boolean }) {
  return (
    <div className={`my-1.5 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
      success ? 'bg-green-50 border border-green-200/50' : 'bg-red-50 border border-red-200/50'
    }`}>
      <Eye size={12} className={`mt-0.5 shrink-0 ${success ? 'text-green-500' : 'text-red-500'}`} />
      <div className="min-w-0">
        <span className={`font-semibold ${success ? 'text-green-700' : 'text-red-700'}`}>{tool}</span>
        <span className={`ml-1.5 ${success ? 'text-green-600' : 'text-red-600'}`}>{summary}</span>
      </div>
    </div>
  );
}

function ApprovalCard({
  tool,
  description,
  preview,
  approvalId,
  approved,
  onApprove,
}: {
  tool: string;
  description: string;
  preview?: Record<string, unknown>;
  approvalId: string;
  approved?: boolean;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const isPending = approved === undefined;

  return (
    <div className="my-2 rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/60 border-b border-amber-200">
        <ShieldCheck size={12} className="text-amber-600" />
        <span className="text-xs font-semibold text-amber-700">Approval Required</span>
        <span className="text-xs text-amber-600 ml-auto">{tool}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-amber-800 mb-2">{description}</p>
        {preview?.entry_data !== undefined && (
          <details className="mb-2">
            <summary className="text-xs text-amber-600 cursor-pointer hover:text-amber-700">
              Preview entry data
            </summary>
            <pre className="mt-1 text-[10px] text-amber-700 bg-amber-100/50 rounded p-2 overflow-x-auto max-h-40">
              {JSON.stringify(preview.entry_data, null, 2)}
            </pre>
          </details>
        )}
        {tool === 'update_editor' && typeof preview?.content === 'string' && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileCheck2 size={11} className="text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-700">
                {preview.mode === 'append' ? 'Append to document' : preview.mode === 'integrate' ? 'Rewrite document' : `Insert after "${String(preview.target_heading)}"`}
              </span>
            </div>
            <details className="mb-2">
              <summary className="text-xs text-amber-600 cursor-pointer hover:text-amber-700">
                Preview content
              </summary>
              <pre className="mt-1 text-[10px] text-amber-700 bg-amber-100/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                {preview.content.substring(0, 500)}{preview.content.length > 500 ? '...' : ''}
              </pre>
            </details>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-amber-200 bg-amber-50">
        {isPending ? (
          <>
            <button
              onClick={() => onApprove(approvalId, true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              <Check size={11} />
              Approve
            </button>
            <button
              onClick={() => onApprove(approvalId, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
            >
              <X size={11} />
              Reject
            </button>
            <span className="text-[10px] text-amber-500 ml-auto">Enter to approve, Esc to reject</span>
          </>
        ) : (
          <span className={`text-xs font-semibold ${approved ? 'text-green-600' : 'text-red-600'}`}>
            {approved ? 'Approved' : 'Rejected'}
          </span>
        )}
      </div>
    </div>
  );
}

function TurnBudgetIndicator({ used, total, tokensUsed }: { used: number; total: number; tokensUsed: number }) {
  if (total <= 4) return null; // Don't show for simple Q&A
  const pct = Math.min((used / total) * 100, 100);
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-venus-gray-400">
      <div className="flex-1 h-1 bg-venus-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-venus-purple/40 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span>Turn {used + 1}/{total}</span>
      {tokensUsed > 0 && <span>{(tokensUsed / 1000).toFixed(1)}k tokens</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────

export default function ChatPanel({ sparkId, itemCount = 0, items = [], groups = [], onItemAdded }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const { isDragOver, isUploading, dragHandlers } = useFileDrop({ sparkId, onItemAdded });

  // ── @ Mention state ──────────────────────────────
  const [mentionState, setMentionState] = useState<MentionState>({ active: false, query: '', triggerIndex: -1 });
  const [mentionedRefs, setMentionedRefs] = useState<MentionedRef[]>([]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);

  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [didYouKnow, setDidYouKnow] = useState<string | null>(null);
  const [didYouKnowLoading, setDidYouKnowLoading] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);

  // ── Editor context ──────────────────────────────────
  const editorCtx = useEditorContext();
  const editorCtxRef = useRef(editorCtx);
  editorCtxRef.current = editorCtx;
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

  const initialLoadDone = useRef(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?spark_id=${sparkId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        return data as ChatSession[];
      }
    } catch { /* silently fail */ }
    return [];
  }, [sparkId]);

  // On mount, fetch sessions and auto-open the most recent one
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    (async () => {
      const loaded = await fetchSessions();
      if (loaded.length > 0) {
        handleSelectSession(loaded[0].id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isStreaming) return;

    const userMessage = messageText.trim();
    setInput('');
    setMentionedRefs([]);
    setMentionState({ active: false, query: '', triggerIndex: -1 });

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

      // Include mentioned item/group IDs for contextual weighting
      if (mentionedRefs.length > 0) {
        body.mentioned_item_ids = mentionedRefs
          .filter(r => r.type !== 'group')
          .map(r => r.id);
        // For groups, send structured group metadata so the API preserves boundaries
        const groupRefs = mentionedRefs.filter(r => r.type === 'group');
        if (groupRefs.length > 0) {
          const mentionedGroups = groupRefs
            .map(ref => {
              const group = groups.find(g => g.id === ref.id);
              return group ? { id: group.id, name: group.name, itemIds: group.itemIds } : null;
            })
            .filter((g): g is { id: string; name: string; itemIds: string[] } => g !== null);
          body.mentioned_groups = mentionedGroups;
          // Also include group item IDs in the flat list for RAG retrieval
          const groupItemIds = mentionedGroups.flatMap(g => g.itemIds);
          const existing = (body.mentioned_item_ids as string[]) || [];
          body.mentioned_item_ids = [...new Set([...existing, ...groupItemIds])];
        }
      }

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
                } else if (data.type === 'thought') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant') {
                      const steps = [...(last.agentSteps || [])];
                      // Append to existing thought step or create new one
                      const lastStep = steps[steps.length - 1];
                      if (lastStep?.type === 'thought') {
                        steps[steps.length - 1] = { ...lastStep, content: lastStep.content + data.content };
                      } else {
                        steps.push({ type: 'thought', content: data.content, turn: data.turn });
                      }
                      updated[updated.length - 1] = { ...last, agentSteps: steps };
                    }
                    return updated;
                  });
                } else if (data.type === 'action') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant') {
                      const steps = [...(last.agentSteps || [])];
                      steps.push({ type: 'action', content: data.input, tool: data.tool, skillName: data.skill_name, turn: data.turn });
                      updated[updated.length - 1] = { ...last, agentSteps: steps };
                    }
                    return updated;
                  });
                } else if (data.type === 'observation') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant') {
                      const steps = [...(last.agentSteps || [])];
                      steps.push({
                        type: 'observation',
                        content: data.summary,
                        tool: data.tool,
                        turn: data.turn,
                        approved: data.success,
                      });
                      updated[updated.length - 1] = { ...last, agentSteps: steps };
                    }
                    return updated;
                  });
                } else if (data.type === 'approval_request') {
                  setPendingApprovalId(data.id);
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant') {
                      const steps = [...(last.agentSteps || [])];
                      steps.push({
                        type: 'approval',
                        content: data.description,
                        tool: data.tool,
                        turn: data.turn ?? 0,
                        approvalId: data.id,
                        preview: data.preview,
                      });
                      updated[updated.length - 1] = { ...last, agentSteps: steps };
                    }
                    return updated;
                  });
                } else if (data.type === 'editor_update') {
                  const ctx = editorCtxRef.current;
                  if (ctx) {
                    switch (data.mode) {
                      case 'append':
                        ctx.appendContent(data.content);
                        break;
                      case 'integrate':
                        ctx.replaceDocument(data.content);
                        break;
                      case 'insert_after':
                        ctx.insertAfterHeading(data.content, data.target_heading || '');
                        break;
                    }
                  }
                } else if (data.type === 'skill_draft') {
                  setSkillDraft({
                    name: data.name,
                    description: data.description,
                    instructions: data.instructions,
                    variables: data.variables,
                  });
                  setIsSkillsOpen(true);
                } else if (data.type === 'budget') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        turnBudget: { used: data.used, total: data.total, tokensUsed: data.tokens_used },
                      };
                    }
                    return updated;
                  });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sparkId, activeSessionId, isStreaming, selectedText, getDocumentText, mentionedRefs, groups]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSelectSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveSessionId(sessionId);
      setMessages(
        (data.messages || [])
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
          .map((m: { role: string; content: string; metadata?: { agentSteps?: AgentStep[] } }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            ...(m.metadata?.agentSteps?.length ? { agentSteps: m.metadata.agentSteps } : {}),
          }))
      );
    } catch { /* silently fail */ }
  }, []);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  // ── Mention helpers ─────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart ?? value.length;
    setInput(value);

    // Detect @ trigger: look backwards from cursor for an unescaped '@'
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      // '@' must be at start or preceded by a space/newline
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // No spaces after @ means still typing a mention query
        if (!query.includes(' ') || query.length <= 30) {
          setMentionState({ active: true, query, triggerIndex: atIndex });
          return;
        }
      }
    }

    // Close mention if active and no valid trigger found
    if (mentionState.active) {
      setMentionState({ active: false, query: '', triggerIndex: -1 });
    }
  };

  const handleMentionSelect = useCallback((option: MentionOption) => {
    // Replace @query with @Label in the input text
    const before = input.slice(0, mentionState.triggerIndex);
    const afterCursor = input.slice(mentionState.triggerIndex + 1 + mentionState.query.length);
    const newInput = `${before}@${option.label}${afterCursor ? afterCursor : ' '}`;
    setInput(newInput);
    setMentionState({ active: false, query: '', triggerIndex: -1 });

    // Add to mentioned refs (dedup)
    setMentionedRefs(prev => {
      if (prev.some(r => r.id === option.id)) return prev;
      return [...prev, { id: option.id, label: option.label, type: option.type }];
    });

    // Re-focus textarea
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input, mentionState]);

  const handleRemoveMention = useCallback((id: string) => {
    setMentionedRefs(prev => prev.filter(r => r.id !== id));
  }, []);

  const openMentionDropdown = useCallback(() => {
    // Insert '@' at cursor position and open the dropdown
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart ?? input.length;
    const before = input.slice(0, cursorPos);
    const after = input.slice(cursorPos);
    const needsSpace = before.length > 0 && before[before.length - 1] !== ' ';
    const newInput = `${before}${needsSpace ? ' ' : ''}@${after}`;
    const atPos = before.length + (needsSpace ? 1 : 0);
    setInput(newInput);
    setMentionState({ active: true, query: '', triggerIndex: atPos });
    setTimeout(() => textarea.focus(), 0);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // When mention dropdown is open, let it handle arrow/enter/escape
    if (mentionState.active) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
        // The dropdown's document-level keydown handler will handle these
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleApplyProposal = useCallback((text: string) => {
    applyProposal?.(text);
  }, [applyProposal]);

  // ── Approval handler ─────────────────────────────
  const handleApproval = useCallback(async (approvalId: string, approved: boolean) => {
    try {
      await fetch('/api/chat/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_id: approvalId, approved }),
      });
      // Update the step's approved status in the message
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && last.agentSteps) {
          const steps = [...last.agentSteps];
          const stepIdx = steps.findIndex(s => s.approvalId === approvalId);
          if (stepIdx !== -1) {
            steps[stepIdx] = { ...steps[stepIdx], approved };
            updated[updated.length - 1] = { ...last, agentSteps: steps };
          }
        }
        return updated;
      });
      setPendingApprovalId(null);
    } catch { /* silently fail */ }
  }, []);

  // Keyboard shortcuts for approval (Enter = approve, Esc = reject)
  useEffect(() => {
    if (!pendingApprovalId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleApproval(pendingApprovalId, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleApproval(pendingApprovalId, false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pendingApprovalId, handleApproval]);

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
    <div className="flex flex-col h-full relative overflow-hidden" {...dragHandlers}>
      <DropOverlay isDragOver={isDragOver} isUploading={isUploading} />
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

      {/* Skills Panel */}
      <SkillsPanel
        sparkId={sparkId}
        isOpen={isSkillsOpen}
        onClose={() => setIsSkillsOpen(false)}
        skillDraft={skillDraft}
        onDraftConsumed={() => setSkillDraft(null)}
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
        <button
          onClick={() => setIsSkillsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-venus-gray-600 hover:text-venus-purple hover:bg-venus-purple-light rounded-md transition-colors"
        >
          <Zap size={14} />
          Skills
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
                    {/* Agent steps */}
                    {msg.agentSteps && msg.agentSteps.length > 0 && (
                      <div className="px-4 pt-3 pb-1 border-b border-venus-gray-200">
                        {msg.agentSteps.map((step, si) => {
                          switch (step.type) {
                            case 'thought':
                              return <ThoughtBubble key={si} content={step.content} />;
                            case 'action':
                              if (step.tool === 'use_skill') {
                                return <SkillActivationCard key={si} skillName={step.skillName || step.content} />;
                              }
                              return <ActionCard key={si} tool={step.tool || ''} input={step.content} />;
                            case 'observation':
                              if (step.tool === 'use_skill') return null;
                              return <ObservationCard key={si} tool={step.tool || ''} summary={step.content} success={step.approved !== false} />;
                            case 'approval':
                              return (
                                <ApprovalCard
                                  key={si}
                                  tool={step.tool || ''}
                                  description={step.content}
                                  preview={step.preview}
                                  approvalId={step.approvalId || ''}
                                  approved={step.approved}
                                  onApprove={handleApproval}
                                />
                              );
                            default:
                              return null;
                          }
                        })}
                        {msg.turnBudget && isStreamingThisMsg && (
                          <TurnBudgetIndicator
                            used={msg.turnBudget.used}
                            total={msg.turnBudget.total}
                            tokensUsed={msg.turnBudget.tokensUsed}
                          />
                        )}
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
                      ) : (() => {
                        const { body, steps } = extractNextSteps(msg.content);
                        return (
                          <>
                            <div className="chat-content">
                              {parseMessageParts(body).map((part, pi) =>
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
                            {steps.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 px-4 pb-3 -mt-1">
                                {steps.map((step, si) => (
                                  <button
                                    key={si}
                                    onClick={() => sendMessage(toDirective(step))}
                                    disabled={isStreaming}
                                    className="text-[11px] px-2.5 py-1 rounded-full border border-venus-purple/25 text-venus-purple hover:bg-venus-purple-light/50 hover:border-venus-purple/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {step}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
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

        {/* Mentioned items chips */}
        {mentionedRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {mentionedRefs.map(ref => (
              <span
                key={ref.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-venus-purple-light text-venus-purple text-xs font-medium rounded-full"
              >
                @{ref.label}
                <button
                  onClick={() => handleRemoveMention(ref.id)}
                  className="hover:text-venus-purple-deep transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Plus button — open mention dropdown */}
          <button
            type="button"
            onClick={openMentionDropdown}
            disabled={isStreaming}
            title="Reference an item or group"
            className="p-2.5 text-venus-gray-400 hover:text-venus-purple hover:bg-venus-purple-light rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus size={16} />
          </button>

          <div ref={inputWrapperRef} className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedText
                  ? 'e.g. "Make this more concise" or "Rewrite in a formal tone"…'
                  : 'Ask about your Spark… (type @ to mention items)'
              }
              rows={1}
              className="w-full px-3 py-2.5 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors resize-none max-h-32"
              style={{ minHeight: '42px' }}
              disabled={isStreaming}
            />

            {/* Mention dropdown */}
            {mentionState.active && (items.length > 0 || groups.length > 0) && (
              <ChatMentionDropdown
                items={items}
                groups={groups}
                query={mentionState.query}
                onSelect={handleMentionSelect}
                onClose={() => setMentionState({ active: false, query: '', triggerIndex: -1 })}
                style={{ bottom: '100%', left: 0, marginBottom: '4px' }}
              />
            )}
          </div>

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
