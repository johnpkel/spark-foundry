'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Loader2, Check, ChevronDown } from 'lucide-react';

interface ContentstackEntriesPanelProps {
  sparkId: string;
  onImported: () => void;
}

interface Stack {
  api_key: string;
  name: string;
  uid: string;
}

interface ContentType {
  uid: string;
  title: string;
  description?: string;
}

type Phase = 'checking' | 'not_connected' | 'pick_stack' | 'pick_types' | 'importing' | 'done';

interface ImportProgress {
  content_type: string;
  total: number;
  imported: number;
  phase: string;
}

export default function ContentstackEntriesPanel({
  sparkId,
  onImported,
}: ContentstackEntriesPanelProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [previouslyImported, setPreviouslyImported] = useState<Set<string>>(new Set());
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [completedTypes, setCompletedTypes] = useState<string[]>([]);
  const [totalImported, setTotalImported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stackDropdownOpen, setStackDropdownOpen] = useState(false);

  // Check connection via session endpoint, then load stacks separately
  const checkConnection = useCallback(async () => {
    setPhase('checking');
    try {
      // First check if the user has a valid CS session (from app login)
      const sessionRes = await fetch('/api/auth/contentstack/session');
      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated) {
        setPhase('not_connected');
        return;
      }

      // Session exists — now load stacks
      const stacksRes = await fetch('/api/contentstack/stacks');
      if (!stacksRes.ok) {
        const errData = await stacksRes.json();
        setError(errData.error || 'Failed to load stacks');
        // Still show stack picker so user can see the error, not "connect" button
        setPhase('pick_stack');
        return;
      }
      const data = await stacksRes.json();
      setStacks(data.stacks || []);
      setPhase('pick_stack');
    } catch {
      setPhase('not_connected');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'contentstack-auth' && event.data.status === 'success') {
        checkConnection();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkConnection]);

  const handleConnect = () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      '/api/auth/contentstack?popup=true',
      'contentstack-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleSelectStack = async (stack: Stack) => {
    setSelectedStack(stack);
    setStackDropdownOpen(false);
    setLoadingTypes(true);
    setError(null);

    try {
      const [ctRes, importedRes] = await Promise.all([
        fetch(`/api/contentstack/content-types?api_key=${stack.api_key}`),
        fetch(
          `/api/contentstack/imported-types?spark_id=${sparkId}&api_key=${stack.api_key}`
        ),
      ]);

      if (ctRes.ok) {
        const ctData = await ctRes.json();
        setContentTypes(ctData.content_types || []);
      }

      if (importedRes.ok) {
        const importedData = await importedRes.json();
        const uids = new Set<string>(importedData.imported_uids || []);
        setPreviouslyImported(uids);
        setSelectedUids(new Set(uids)); // Pre-select imported types
      }

      setPhase('pick_types');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content types');
    } finally {
      setLoadingTypes(false);
    }
  };

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleSync = async () => {
    if (!selectedStack) return;

    setPhase('importing');
    setProgress(null);
    setCompletedTypes([]);
    setTotalImported(0);
    setError(null);

    // Calculate what to prune and what to add
    const toRemove = [...previouslyImported].filter(
      (uid) => !selectedUids.has(uid)
    );
    const toAdd = [...selectedUids].filter(
      (uid) => !previouslyImported.has(uid)
    );

    try {
      // Prune removed types
      if (toRemove.length > 0) {
        await fetch('/api/contentstack/prune-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spark_id: sparkId,
            stack_api_key: selectedStack.api_key,
            content_type_uids_to_remove: toRemove,
          }),
        });
      }

      // Import new types via SSE
      if (toAdd.length > 0) {
        const res = await fetch('/api/contentstack/import-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spark_id: sparkId,
            stack_api_key: selectedStack.api_key,
            stack_name: selectedStack.name,
            content_type_uids: toAdd,
          }),
        });

        if (!res.ok || !res.body) {
          setError('Failed to start import');
          setPhase('pick_types');
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
      }

      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('pick_types');
    }
  };

  // Calculate sync diff for the button label
  const toRemoveCount = [...previouslyImported].filter(
    (uid) => !selectedUids.has(uid)
  ).length;
  const toAddCount = [...selectedUids].filter(
    (uid) => !previouslyImported.has(uid)
  ).length;
  const hasChanges = toRemoveCount > 0 || toAddCount > 0;

  // ─── Render ─────────────────────────────────

  if (phase === 'checking') {
    return (
      <div className="flex items-center justify-center py-8 text-venus-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Checking connection...
      </div>
    );
  }

  if (phase === 'not_connected') {
    return (
      <div className="text-center py-8">
        <Database size={32} className="mx-auto text-venus-gray-300 mb-3" />
        <p className="text-sm text-venus-gray-500 mb-4">
          Connect to Contentstack to import entries
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
        >
          <Database size={16} />
          Connect to Contentstack
        </button>
        {error && (
          <p className="text-xs text-venus-red mt-3">{error}</p>
        )}
      </div>
    );
  }

  if (phase === 'pick_stack') {
    return (
      <div>
        <label className="block text-sm font-medium text-venus-gray-600 mb-2">
          Select Stack
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setStackDropdownOpen(!stackDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 border border-venus-gray-200 rounded-lg text-sm text-venus-gray-700 hover:border-venus-purple/30 transition-colors"
          >
            {selectedStack ? selectedStack.name : 'Choose a stack...'}
            <ChevronDown size={14} className="text-venus-gray-400" />
          </button>
          {stackDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-card-bg border border-venus-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {stacks.map((stack) => (
                <button
                  key={stack.api_key}
                  type="button"
                  onClick={() => handleSelectStack(stack)}
                  className="w-full text-left px-3 py-2 text-sm text-venus-gray-700 hover:bg-venus-gray-50 transition-colors"
                >
                  {stack.name}
                </button>
              ))}
              {stacks.length === 0 && (
                <div className="px-3 py-2 text-sm text-venus-gray-400">
                  No stacks found
                </div>
              )}
            </div>
          )}
        </div>
        {loadingTypes && (
          <div className="flex items-center gap-2 mt-3 text-venus-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" />
            Loading content types...
          </div>
        )}
        {error && (
          <p className="text-xs text-venus-red mt-3">{error}</p>
        )}
      </div>
    );
  }

  if (phase === 'pick_types') {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs text-venus-gray-500">
              Stack: <span className="font-medium text-venus-gray-600">{selectedStack?.name}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedStack(null);
              setPhase('pick_stack');
            }}
            className="text-xs text-venus-gray-400 hover:text-venus-gray-600 transition-colors"
          >
            Change
          </button>
        </div>

        <label className="block text-sm font-medium text-venus-gray-600 mb-2">
          Content Types
        </label>

        <div className="max-h-48 overflow-y-auto border border-venus-gray-200 rounded-lg divide-y divide-venus-gray-100">
          {contentTypes.map((ct) => {
            const isSelected = selectedUids.has(ct.uid);
            const wasImported = previouslyImported.has(ct.uid);
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
                  <span className="text-sm text-venus-gray-700">{ct.title}</span>
                  {wasImported && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-venus-green-light text-venus-green font-medium">
                      imported
                    </span>
                  )}
                </div>
              </label>
            );
          })}
          {contentTypes.length === 0 && (
            <div className="px-3 py-4 text-sm text-venus-gray-400 text-center">
              No content types found in this stack
            </div>
          )}
        </div>

        {toRemoveCount > 0 && (
          <p className="text-xs text-venus-red mt-2">
            {toRemoveCount} type{toRemoveCount !== 1 ? 's' : ''} will be removed
          </p>
        )}

        {error && <p className="text-xs text-venus-red mt-2">{error}</p>}

        <button
          type="button"
          onClick={handleSync}
          disabled={selectedUids.size === 0 || !hasChanges}
          className="w-full mt-4 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {toAddCount > 0 && toRemoveCount > 0
            ? `Sync (add ${toAddCount}, remove ${toRemoveCount})`
            : toAddCount > 0
              ? `Import ${toAddCount} Content Type${toAddCount !== 1 ? 's' : ''}`
              : toRemoveCount > 0
                ? `Remove ${toRemoveCount} Content Type${toRemoveCount !== 1 ? 's' : ''}`
                : 'No Changes'}
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
                {progress.imported}/{progress.total}
              </span>
            </div>
            <div className="w-full h-1.5 bg-venus-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-venus-purple rounded-full transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%`,
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
          {toRemoveCount > 0 && `, removed ${toRemoveCount} type${toRemoveCount !== 1 ? 's' : ''}`}
        </p>
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
