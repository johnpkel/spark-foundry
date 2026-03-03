'use client';

import { useState } from 'react';
import { Database, Loader2, Check } from 'lucide-react';

interface ContentstackEntriesPanelProps {
  sparkId: string;
  onImported: () => void;
}

const CONTENT_TYPES = [
  { uid: 'blog_post', label: 'Blog Post' },
  { uid: 'platform_overview', label: 'Platform Overview' },
  { uid: 'case_studies_detail', label: 'Case Studies Detail' },
];

type Phase = 'ready' | 'importing' | 'done';

interface ImportProgress {
  content_type: string;
  total: number;
  fetched: number;
  imported: number;
  phase: string;
}

export default function ContentstackEntriesPanel({
  sparkId,
  onImported,
}: ContentstackEntriesPanelProps) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(
    new Set(CONTENT_TYPES.map((ct) => ct.uid))
  );
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [completedTypes, setCompletedTypes] = useState<string[]>([]);
  const [totalImported, setTotalImported] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedUids.size === 0) return;

    setPhase('importing');
    setProgress(null);
    setCompletedTypes([]);
    setTotalImported(0);
    setError(null);

    try {
      const res = await fetch('/api/contentstack/import-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          content_type_uids: [...selectedUids],
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || 'Failed to start import');
        setPhase('ready');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setProgress({
                content_type: event.content_type,
                total: event.total,
                fetched: event.fetched || 0,
                imported: event.imported || 0,
                phase: event.phase,
              });
            } else if (event.type === 'content_type_done') {
              setCompletedTypes((prev) => [...prev, event.content_type]);
            } else if (event.type === 'done') {
              setTotalImported(event.total_imported);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('ready');
    }
  };

  // ─── Render ─────────────────────────────────

  if (phase === 'ready') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-venus-purple" />
          <span className="text-sm font-medium text-venus-gray-700">
            Contentstack Entries
          </span>
        </div>

        <p className="text-xs text-venus-gray-500 mb-3">
          Import published entries from your Contentstack stack via the Delivery API.
        </p>

        <div className="border border-venus-gray-200 rounded-lg divide-y divide-venus-gray-100">
          {CONTENT_TYPES.map((ct) => {
            const isSelected = selectedUids.has(ct.uid);
            return (
              <label
                key={ct.uid}
                className="flex items-center gap-3 px-3 py-2 hover:bg-venus-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleUid(ct.uid)}
                  className="rounded border-venus-gray-300 text-venus-purple focus:ring-venus-purple/30"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-venus-gray-700">{ct.label}</span>
                  <span className="ml-2 text-[10px] text-venus-gray-400 font-mono">{ct.uid}</span>
                </div>
              </label>
            );
          })}
        </div>

        {error && <p className="text-xs text-venus-red mt-2">{error}</p>}

        <button
          type="button"
          onClick={handleImport}
          disabled={selectedUids.size === 0}
          className="w-full mt-4 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Import {selectedUids.size} Content Type{selectedUids.size !== 1 ? 's' : ''}
        </button>
      </div>
    );
  }

  if (phase === 'importing') {
    return (
      <div className="py-4">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={16} className="animate-spin text-venus-purple" />
          <span className="text-sm font-medium text-venus-gray-700">
            Importing entries...
          </span>
        </div>

        {/* Completed types */}
        {completedTypes.map((ct) => (
          <div
            key={ct}
            className="flex items-center gap-2 mb-2 text-sm text-venus-green"
          >
            <Check size={14} />
            {ct}
          </div>
        ))}

        {/* Current progress */}
        {progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-venus-gray-600">
                {progress.phase === 'fetching'
                  ? `Fetching ${progress.content_type}...`
                  : `Importing ${progress.content_type}`}
              </span>
              <span className="text-xs text-venus-gray-400">
                {progress.phase === 'fetching'
                  ? `${progress.fetched}/${progress.total}`
                  : `${progress.imported}/${progress.total}`}
              </span>
            </div>
            <div className="w-full h-1.5 bg-venus-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-venus-purple rounded-full transition-all duration-300"
                style={{
                  width: `${
                    progress.total > 0
                      ? ((progress.phase === 'fetching' ? progress.fetched : progress.imported) /
                          progress.total) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-venus-red mt-3">{error}</p>}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="text-center py-6">
        <div className="w-10 h-10 rounded-full bg-venus-green-light flex items-center justify-center mx-auto mb-3">
          <Check size={20} className="text-venus-green" />
        </div>
        <p className="text-sm font-medium text-venus-gray-700 mb-1">
          Import Complete
        </p>
        <p className="text-sm text-venus-gray-500 mb-4">
          Successfully imported {totalImported} {totalImported === 1 ? 'entry' : 'entries'}
        </p>
        {error && <p className="text-xs text-venus-red mb-3">{error}</p>}
        <button
          type="button"
          onClick={onImported}
          className="px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  return null;
}
