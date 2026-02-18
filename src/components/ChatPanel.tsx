'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Search, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  sparkId: string;
  itemCount?: number;
}

/**
 * Render markdown content with inline image support.
 */
function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        // Render images inline with styling
        img: ({ src, alt }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || 'Image'}
            className="rounded-lg max-w-full max-h-64 object-contain my-2"
            loading="lazy"
          />
        ),
        // Style links
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
        // Style code blocks
        pre: ({ children }) => (
          <pre className="bg-venus-gray-200 rounded-lg p-3 my-2 overflow-x-auto text-xs">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-venus-gray-200 px-1 py-0.5 rounded text-xs">
              {children}
            </code>
          ) : (
            <code className={className}>{children}</code>
          );
        },
        // Style tables
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
        // Style headings
        h1: ({ children }) => (
          <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>
        ),
        // Style lists
        ul: ({ children }) => (
          <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>
        ),
        // Style paragraphs
        p: ({ children }) => <p className="my-1">{children}</p>,
        // Style horizontal rules
        hr: () => <hr className="my-2 border-venus-gray-300" />,
        // Style blockquotes
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

export default function ChatPanel({ sparkId, itemCount = 0 }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Did you know" fact state
  const [didYouKnow, setDidYouKnow] = useState<string | null>(null);
  const [didYouKnowLoading, setDidYouKnowLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusMessage]);

  // Auto-generate "Did you know" fact when entering a Spark with items
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
                  if (data.type === 'text') {
                    fact += data.content;
                  }
                } catch {
                  // skip
                }
              }
            }
          }

          if (!cancelled && fact.trim()) {
            setDidYouKnow(fact.trim());
          }
        }
      } catch {
        // silently fail — fact is optional
      } finally {
        if (!cancelled) setDidYouKnowLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemCount, sparkId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);
    setStatusMessage(null);

    // Add placeholder for assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spark_id: sparkId, message: userMessage }),
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
                }
              } catch {
                // Skip malformed events
              }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const suggestedPrompts = [
    'Summarize everything in this Spark',
    'What are the key themes across these items?',
    'Generate a CMS entry from this content',
    'Create a campaign brief based on this research',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* "Did you know" fact */}
        {(didYouKnow || didYouKnowLoading) && (
          <div className="bg-gradient-to-r from-venus-purple-light to-white rounded-xl px-4 py-3">
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

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-venus-purple-light flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-venus-purple" />
            </div>
            <h3 className="text-base font-semibold text-venus-gray-700 mb-2">Spark Assistant</h3>
            <p className="text-sm text-venus-gray-500 max-w-sm mb-6">
              Ask questions about your collected items, generate insights, or create business artifacts.
            </p>
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

        {messages.map((msg, i) => (
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
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-venus-purple text-white rounded-br-sm'
                  : 'bg-venus-gray-100 text-venus-gray-700 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' && !msg.content && isStreaming ? (
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
        ))}

        {/* Status indicator during tool processing when text already started */}
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
      <div className="border-t border-venus-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your Spark..."
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
