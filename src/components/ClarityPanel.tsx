'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Loader2, Check, AlertCircle } from 'lucide-react';

interface ClarityPanelProps {
  sparkId: string;
  onImported: () => void;
}

type Phase = 'checking' | 'not_configured' | 'ready' | 'importing' | 'done' | 'error';

interface ImportProgress {
  call: number;
  total_calls: number;
  label: string;
  phase: string;
  metrics_count?: number;
}

export default function ClarityPanel({ sparkId, onImported }: ClarityPanelProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [completedCalls, setCompletedCalls] = useState<string[]>([]);
  const [totalImported, setTotalImported] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setPhase('checking');
    try {
      const res = await fetch('/api/clarity/status');
      const data = await res.json();
      setPhase(data.configured ? 'ready' : 'not_configured');
    } catch {
      setPhase('not_configured');
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleImport = async () => {
    setPhase('importing');
    setProgress(null);
    setCompletedCalls([]);
    setTotalImported(0);
    setError(null);

    try {
      const res = await fetch('/api/clarity/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spark_id: sparkId, num_days: 3 }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({ error: 'Import failed' }));
        setError(errData.error || 'Failed to start import');
        setPhase('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hadError = false;

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
                call: event.call,
                total_calls: event.total_calls,
                label: event.label,
                phase: event.phase,
                metrics_count: event.metrics_count,
              });
            } else if (event.type === 'call_done') {
              setCompletedCalls((prev) => [
                ...prev,
                `${event.label} (${event.metrics_count} metrics)`,
              ]);
            } else if (event.type === 'done') {
              setTotalImported(event.total_imported);
            } else if (event.type === 'error') {
              setError(event.message);
              hadError = true;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      setPhase(hadError ? 'error' : 'done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('error');
    }
  };

  // ─── Render ─────────────────────────────────

  if (phase === 'checking') {
    return (
      <div className="flex items-center justify-center py-8 text-venus-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Checking Clarity configuration...
      </div>
    );
  }

  if (phase === 'not_configured') {
    return (
      <div className="text-center py-8">
        <AlertCircle size={32} className="mx-auto text-venus-gray-300 mb-3" />
        <p className="text-sm text-venus-gray-500 mb-2">
          Clarity API token not configured.
        </p>
        <p className="text-xs text-venus-gray-400">
          Add <code className="px-1 py-0.5 bg-venus-gray-100 rounded text-venus-gray-600">CLARITY_API_TOKEN</code> to your environment variables.
        </p>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="text-center py-8">
        <BarChart2 size={32} className="mx-auto text-venus-blue mb-3" />
        <p className="text-sm text-venus-gray-600 mb-1 font-medium">
          Microsoft Clarity
        </p>
        <p className="text-sm text-venus-gray-500 mb-4">
          Import the last 3 days of analytics data including traffic, rage clicks, dead clicks, scroll depth, and more.
        </p>
        <button
          type="button"
          onClick={handleImport}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
        >
          <BarChart2 size={16} />
          Import Clarity Data
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
            Importing Clarity insights...
          </span>
        </div>

        {/* Completed calls */}
        {completedCalls.map((call, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 mb-2 text-sm text-venus-green"
          >
            <Check size={14} />
            {call}
          </div>
        ))}

        {/* Current progress */}
        {progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-venus-gray-600">
                {progress.phase === 'fetching'
                  ? `Fetching ${progress.label}...`
                  : `Importing ${progress.label}`}
              </span>
              <span className="text-xs text-venus-gray-400">
                {progress.call}/{progress.total_calls}
              </span>
            </div>
            <div className="w-full h-1.5 bg-venus-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-venus-purple rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.call / progress.total_calls) * 100}%`,
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
          Successfully imported {totalImported} Clarity {totalImported === 1 ? 'insight' : 'insights'}
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

  if (phase === 'error') {
    return (
      <div className="text-center py-6">
        <AlertCircle size={32} className="mx-auto text-venus-red mb-3" />
        <p className="text-sm text-venus-red mb-4">
          {error || 'An error occurred during import.'}
        </p>
        <button
          type="button"
          onClick={() => setPhase('ready')}
          className="px-4 py-2 text-sm font-medium text-venus-gray-600 hover:bg-venus-gray-100 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
