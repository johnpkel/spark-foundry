'use client';

import { MessageSquare, Plus, X, Clock } from 'lucide-react';
import type { ChatSession } from '@/lib/types';

interface ChatSessionSidebarProps {
  sparkId: string;
  activeSessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  sessions: ChatSession[];
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function ChatSessionSidebar({
  activeSessionId,
  isOpen,
  onClose,
  onSelectSession,
  onNewChat,
  sessions,
}: ChatSessionSidebarProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/20 z-10"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`absolute top-0 left-0 h-full w-[280px] bg-surface border-r border-venus-gray-200 z-20 transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-venus-gray-200">
          <h3 className="text-sm font-semibold text-venus-gray-700">Chat History</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-venus-gray-100 text-venus-gray-400 hover:text-venus-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* New Chat button */}
        <div className="px-3 py-2">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {sessions.length === 0 ? (
            <div className="text-center text-venus-gray-400 text-xs mt-8 px-4">
              No previous conversations
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      onSelectSession(session.id);
                      onClose();
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-venus-purple-light border-l-2 border-venus-purple'
                        : 'hover:bg-venus-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        size={14}
                        className={`shrink-0 mt-0.5 ${
                          isActive ? 'text-venus-purple' : 'text-venus-gray-400'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium truncate ${
                            isActive ? 'text-venus-purple-deep' : 'text-venus-gray-700'
                          }`}
                        >
                          {session.title}
                        </div>
                        {session.last_message_preview && (
                          <div className="text-xs text-venus-gray-400 truncate mt-0.5">
                            {session.last_message_preview}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-venus-gray-400 mt-1">
                          <Clock size={10} />
                          <span>{formatRelativeTime(session.updated_at)}</span>
                          {session.message_count !== undefined && (
                            <span className="ml-auto">{session.message_count} msgs</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
