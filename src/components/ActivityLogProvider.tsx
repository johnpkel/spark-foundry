'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { LogEntry } from '@/lib/activity-logger';

interface ActivityLogContextValue {
  entries: LogEntry[];
  unreadCount: number;
  clearEntries: () => Promise<void>;
  markAllRead: () => void;
}

const ActivityLogContext = createContext<ActivityLogContextValue | null>(null);

const MAX_CLIENT_ENTRIES = 500;

export function ActivityLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const es = new EventSource('/api/logs');
    sourceRef.current = es;

    es.addEventListener('init', (e: MessageEvent) => {
      const allEntries: LogEntry[] = JSON.parse(e.data);
      setEntries(allEntries.slice(0, MAX_CLIENT_ENTRIES));
      // Don't count pre-existing entries as unread on connect
    });

    es.addEventListener('entry', (e: MessageEvent) => {
      const entry: LogEntry = JSON.parse(e.data);
      setEntries((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, MAX_CLIENT_ENTRIES);
      });
      setUnreadCount((c) => c + 1);
    });

    es.addEventListener('clear', () => {
      setEntries([]);
      setUnreadCount(0);
    });

    es.onerror = () => {
      es.close();
      sourceRef.current = null;
      // Reconnect after 3s on failure
      setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
    };
  }, [connect]);

  const clearEntries = useCallback(async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    setEntries([]);
    setUnreadCount(0);
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <ActivityLogContext.Provider value={{ entries, unreadCount, clearEntries, markAllRead }}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog(): ActivityLogContextValue {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLog must be used inside ActivityLogProvider');
  return ctx;
}
