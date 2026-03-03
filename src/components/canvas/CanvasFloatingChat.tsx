import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { SparkItem } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CanvasFloatingChatProps {
  sparkId: string;
  selectedItems: SparkItem[];
  onClose: () => void;
  /** When set, conversation is persisted & embedded for RAG (group chat mode) */
  groupName?: string;
  /** Existing session to resume (group canonical conversation) */
  initialSessionId?: string | null;
  /** Called when a new session is created so the parent can persist the binding */
  onSessionCreated?: (sessionId: string) => void;
}

export default function CanvasFloatingChat({
  sparkId,
  selectedItems,
  onClose,
  groupName,
  initialSessionId,
  onSessionCreated,
}: CanvasFloatingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [embeddingDone, setEmbeddingDone] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [loadingHistory, setLoadingHistory] = useState(!!initialSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load existing conversation history when resuming a session
  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${initialSessionId}`);
        if (!res.ok || cancelled) return;
        const { messages: history } = await res.json();
        if (cancelled) return;

        const loaded: ChatMessage[] = (history || [])
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
          .map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            // Strip preamble from persisted user messages — show only the actual question
            content: m.role === 'user' && m.content.includes('\n\nUser question: ')
              ? m.content.split('\n\nUser question: ').pop()!
              : m.content,
          }));
        setMessages(loaded);
      } catch { /* non-blocking */ }
      finally { if (!cancelled) setLoadingHistory(false); }
    })();

    return () => { cancelled = true; };
  }, [initialSessionId]);

  // Ensure embeddings exist on first interaction
  const ensureEmbeddings = useCallback(async () => {
    if (embeddingDone) return;
    try {
      await fetch('/api/canvas/embed-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          item_ids: selectedItems.map(i => i.id),
        }),
      });
    } catch { /* non-blocking */ }
    setEmbeddingDone(true);
  }, [sparkId, selectedItems, embeddingDone]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setIsStreaming(true);

    // Ensure embeddings on first message
    await ensureEmbeddings();

    // Build context preamble
    const itemList = selectedItems
      .map(i => `- [${i.type}] ${i.title}`)
      .join('\n');
    const preamble = groupName
      ? `The user is asking about the canvas group "${groupName}" which contains these items:\n${itemList}\n\nUser question: `
      : `The user has selected these items on the canvas:\n${itemList}\n\nUser question: `;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    // Group chats persist sessions for RAG; ad-hoc selection chats don't
    const persistChat = !!groupName;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          message: preamble + text,
          skip_persist: !persistChat,
          ...(sessionId && { session_id: sessionId }),
          scoped_item_ids: selectedItems.map(i => i.id),
        }),
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
                if (data.type === 'text') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, content: last.content + data.content };
                    }
                    return updated;
                  });
                } else if (data.type === 'done' && data.session_id) {
                  // If this is a newly created session, notify the parent
                  if (!sessionId && onSessionCreated) {
                    onSessionCreated(data.session_id);
                  }
                  setSessionId(data.session_id);
                } else if (data.type === 'error') {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, content: `Error: ${data.content}` };
                    }
                    return updated;
                  });
                }
              } catch { /* skip malformed */ }
            }
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: 'Something went wrong. Please try again.' };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, sparkId, selectedItems, ensureEmbeddings, groupName, sessionId, onSessionCreated]);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      className="canvas-floating-chat absolute bg-card-bg border border-venus-gray-200 rounded-xl shadow-lg flex flex-col overflow-hidden"
      style={{ right: position.x, bottom: position.y }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-venus-gray-200 bg-surface cursor-move touch-none shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <Sparkles size={14} className="text-venus-purple" />
        <span className="text-xs font-semibold text-venus-gray-700 flex-1 truncate">
          {groupName ? `Ask Foundry — ${groupName}` : 'Ask Foundry'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-venus-purple-light text-venus-purple font-medium shrink-0">
          {selectedItems.length} items
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-venus-gray-100 text-venus-gray-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Context chips */}
      <div className="px-3 py-2 border-b border-venus-gray-200 bg-venus-gray-50 shrink-0">
        <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
          {selectedItems.slice(0, 6).map(item => (
            <span
              key={item.id}
              className="text-[10px] px-1.5 py-0.5 rounded bg-venus-gray-100 text-venus-gray-600 truncate max-w-[140px]"
            >
              {item.title}
            </span>
          ))}
          {selectedItems.length > 6 && (
            <span className="text-[10px] px-1.5 py-0.5 text-venus-gray-400">
              +{selectedItems.length - 6} more
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {loadingHistory && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Loader2 size={20} className="text-venus-gray-300 mb-2 animate-spin" />
            <p className="text-xs text-venus-gray-400">Loading conversation...</p>
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Bot size={24} className="text-venus-gray-300 mb-2" />
            <p className="text-xs text-venus-gray-400">
              {groupName ? `Ask about the "${groupName}" group` : 'Ask about the selected items'}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-5 h-5 rounded-full bg-venus-purple-light flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={11} className="text-venus-purple" />
              </div>
            )}
            <div
              className={`max-w-[85%] text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-venus-purple text-white px-3 py-1.5 rounded-xl rounded-tr-sm'
                  : 'text-venus-gray-700'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="chat-content">
                  <ReactMarkdown>{msg.content || (isStreaming && i === messages.length - 1 ? '...' : '')}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-5 h-5 rounded-full bg-venus-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <User size={11} className="text-venus-gray-500" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-venus-gray-200 shrink-0">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={groupName ? `Ask about "${groupName}"...` : 'Ask about these items...'}
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-venus-gray-200 bg-surface text-venus-gray-700 outline-none focus:border-venus-purple"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="p-1.5 rounded-lg bg-venus-purple text-white disabled:opacity-40 hover:bg-venus-purple-deep transition-colors"
          >
            {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
