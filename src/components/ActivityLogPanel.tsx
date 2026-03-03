'use client';

import { useState, useMemo, useEffect } from 'react';
import { useActivityLog } from './ActivityLogProvider';
import type { LogEntry, LogService } from '@/lib/activity-logger';

// ─── Service color scheme ───────────────────────────────
// Note: venus-gray-* CSS vars auto-adapt to dark mode — no dark: prefix needed.
// Scale tops out at venus-gray-700 (#222 light / #e4e4e8 dark).

const SERVICE_COLORS: Record<LogService, { bg: string; text: string; dot: string }> = {
  anthropic:    { bg: 'bg-purple-100 dark:bg-purple-900/40',   text: 'text-purple-800 dark:text-purple-200',   dot: 'bg-purple-500' },
  voyage:       { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-800 dark:text-blue-200',       dot: 'bg-blue-500' },
  supabase:     { bg: 'bg-green-100 dark:bg-green-900/40',     text: 'text-green-800 dark:text-green-200',     dot: 'bg-green-500' },
  contentstack: { bg: 'bg-orange-100 dark:bg-orange-900/40',   text: 'text-orange-800 dark:text-orange-200',   dot: 'bg-orange-500' },
  google:       { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-800 dark:text-red-200',         dot: 'bg-red-500' },
  slack:        { bg: 'bg-yellow-100 dark:bg-yellow-900/40',   text: 'text-yellow-800 dark:text-yellow-200',   dot: 'bg-yellow-500' },
  clarity:      { bg: 'bg-teal-100 dark:bg-teal-900/40',       text: 'text-teal-800 dark:text-teal-200',       dot: 'bg-teal-500' },
  lytics:       { bg: 'bg-cyan-100 dark:bg-cyan-900/40',       text: 'text-cyan-800 dark:text-cyan-200',       dot: 'bg-cyan-500' },
  internal:     { bg: 'bg-gray-200 dark:bg-gray-700',          text: 'text-gray-800 dark:text-gray-200',       dot: 'bg-gray-500' },
};

const ALL_SERVICES: LogService[] = ['anthropic', 'voyage', 'supabase', 'contentstack', 'google', 'slack', 'clarity', 'lytics', 'internal'];

// ─── Helpers ────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function directionIcon(dir: string): string {
  if (dir === 'request') return '→';
  if (dir === 'response') return '←';
  return '⚡';
}

function statusColor(code?: number): string {
  if (!code) return '';
  if (code >= 500) return 'text-red-600 dark:text-red-400';
  if (code >= 400) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

// ─── Entry row ──────────────────────────────────────────

function EntryRow({ entry, isExpanded, onToggle }: {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colors = SERVICE_COLORS[entry.service];
  const hasDetail = !!(entry.requestBody || entry.responseBody || entry.error);
  const isError = entry.level === 'error';

  return (
    <div className={`border-b border-venus-gray-200 ${isError ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
      <button
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-venus-gray-100 transition-colors"
        onClick={hasDetail ? onToggle : undefined}
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        {/* Timestamp — muted */}
        <span className="text-[10px] text-venus-gray-500 w-14 shrink-0 tabular-nums">
          {relativeTime(entry.timestamp)}
        </span>

        {/* Service badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${colors.bg} ${colors.text}`}>
          {entry.service}
        </span>

        {/* Direction arrow */}
        <span className={`text-xs shrink-0 font-mono font-bold ${isError ? 'text-red-500' : 'text-venus-gray-600'}`}>
          {directionIcon(entry.direction)}
        </span>

        {/* Summary — primary text, full contrast */}
        <span className={`text-xs flex-1 min-w-0 truncate font-medium ${isError ? 'text-red-700 dark:text-red-400' : 'text-venus-gray-700'}`}>
          {entry.summary}
        </span>

        {/* Duration */}
        {entry.duration !== undefined && (
          <span className="text-[10px] text-venus-gray-500 shrink-0 tabular-nums">
            {entry.duration}ms
          </span>
        )}

        {/* Status badge */}
        {entry.statusCode !== undefined && (
          <span className={`text-[10px] font-bold shrink-0 tabular-nums ${statusColor(entry.statusCode)}`}>
            {entry.statusCode}
          </span>
        )}

        {/* Expand indicator */}
        {hasDetail && (
          <span className="text-[10px] text-venus-gray-500 shrink-0 ml-1">
            {isExpanded ? '▲' : '▼'}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && hasDetail && (
        <div className="px-3 pb-3 bg-venus-gray-50">
          {entry.error && (
            <div className="mb-2">
              <div className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1 uppercase tracking-wide">Error</div>
              <pre className="text-[10px] text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-all">{entry.error}</pre>
            </div>
          )}
          {!!entry.requestBody && (
            <div className="mb-2">
              <div className="text-[10px] font-bold text-venus-gray-600 mb-1 uppercase tracking-wide">Request</div>
              <pre className="text-[10px] text-venus-gray-700 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-venus-gray-100 rounded p-2 border border-venus-gray-200">
                {JSON.stringify(entry.requestBody, null, 2)}
              </pre>
            </div>
          )}
          {!!entry.responseBody && (
            <div>
              <div className="text-[10px] font-bold text-venus-gray-600 mb-1 uppercase tracking-wide">Response</div>
              <pre className="text-[10px] text-venus-gray-700 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-venus-gray-100 rounded p-2 border border-venus-gray-200">
                {JSON.stringify(entry.responseBody, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Header button ──────────────────────────────────────

export function ActivityLogButton() {
  const { unreadCount } = useActivityLog();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-venus-gray-100 transition-colors"
        title="Activity Log"
        aria-label="Open activity log"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-venus-gray-600">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && <ActivityLogPanel onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Panel ──────────────────────────────────────────────

function ActivityLogPanel({ onClose }: { onClose: () => void }) {
  const { entries, clearEntries, markAllRead } = useActivityLog();

  const [serviceFilter, setServiceFilter] = useState<LogService | 'all'>('all');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { markAllRead(); }, [markAllRead]);

  const filtered = useMemo(() => {
    let result = entries;
    if (serviceFilter !== 'all') result = result.filter((e) => e.service === serviceFilter);
    if (errorsOnly) result = result.filter((e) => e.level === 'error');
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => e.summary.toLowerCase().includes(q) || (e.url?.toLowerCase().includes(q) ?? false)
      );
    }
    if (!newestFirst) result = [...result].reverse();
    return result;
  }, [entries, serviceFilter, errorsOnly, search, newestFirst]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-surface border-l border-venus-gray-200 z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-venus-gray-200 shrink-0 gap-3">
          <span className="text-sm font-bold text-venus-gray-700 flex-1">Activity Log</span>
          <span className="text-xs text-venus-gray-500">{filtered.length} entries</span>
          <button
            onClick={() => clearEntries()}
            className="text-xs text-venus-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-venus-gray-100"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-venus-gray-100 text-venus-gray-600 transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-venus-gray-200 shrink-0 space-y-2">
          {/* Service chips */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setServiceFilter('all')}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                serviceFilter === 'all'
                  ? 'bg-venus-gray-700 text-background border-transparent'
                  : 'border-venus-gray-300 text-venus-gray-600 hover:border-venus-gray-500 hover:text-venus-gray-700'
              }`}
            >
              All
            </button>
            {ALL_SERVICES.map((svc) => {
              const c = SERVICE_COLORS[svc];
              const active = serviceFilter === svc;
              return (
                <button
                  key={svc}
                  onClick={() => setServiceFilter(active ? 'all' : svc)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    active
                      ? `${c.bg} ${c.text} border-transparent`
                      : 'border-venus-gray-300 text-venus-gray-600 hover:border-venus-gray-500 hover:text-venus-gray-700'
                  }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.dot} mr-1`} />
                  {svc}
                </button>
              );
            })}
          </div>

          {/* Search + toggles */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by summary or URL…"
              className="flex-1 text-xs bg-venus-gray-100 border border-venus-gray-200 focus:border-venus-gray-400 rounded px-2 py-1 outline-none text-venus-gray-700 placeholder:text-venus-gray-500"
            />
            <button
              onClick={() => setErrorsOnly((v) => !v)}
              className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors shrink-0 ${
                errorsOnly
                  ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
                  : 'border-venus-gray-300 text-venus-gray-600 hover:border-venus-gray-500'
              }`}
            >
              Errors only
            </button>
            <button
              onClick={() => setNewestFirst((v) => !v)}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-venus-gray-300 text-venus-gray-600 hover:border-venus-gray-500 transition-colors shrink-0"
            >
              {newestFirst ? 'Newest ↓' : 'Oldest ↑'}
            </button>
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-venus-gray-500">
              No entries
            </div>
          ) : (
            filtered.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
