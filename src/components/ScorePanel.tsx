'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Target,
  Compass,
  Users,
  Lightbulb,
  Loader2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { useEditorContext } from '@/lib/editor-context';
import type { SparkItem, CanvasGroup } from '@/lib/types';
import type { OpportunityTopic } from '@/lib/lytics/api';

/* ── helpers ─────────────────────────────────── */

function scoreColor(pct: number) {
  if (pct >= 80) return 'bg-venus-green';
  if (pct >= 60) return 'bg-venus-yellow';
  return 'bg-venus-red';
}

function badgeColor(pct: number) {
  if (pct >= 80) return 'bg-venus-green-light text-venus-green';
  if (pct >= 60) return 'bg-venus-yellow-light text-venus-yellow';
  return 'bg-venus-gray-100 text-venus-gray-500';
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="w-full h-2 rounded-full bg-venus-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${scoreColor(pct)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-venus-purple" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-venus-gray-500">
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

function SkeletonBar() {
  return <div className="h-2 rounded-full bg-venus-gray-100 animate-pulse" />;
}

function SkeletonLine({ width = '100%' }: { width?: string }) {
  return <div className="h-4 rounded bg-venus-gray-100 animate-pulse" style={{ width }} />;
}

/* ── types ───────────────────────────────────── */

interface AnalyzeResult {
  topics: { name: string; score: number }[];
  audiences: { name: string; alignment: number; size: number }[];
  opportunities: OpportunityTopic[];
  overallRelevance: number;
}

type ScoreState = 'idle' | 'loading' | 'ready' | 'error';

interface ScorePanelProps {
  sparkItems: SparkItem[];
  canvasGroups: CanvasGroup[];
}

/* ── component ───────────────────────────────── */

const DEBOUNCE_MS = 3000;

export default function ScorePanel({ sparkItems, canvasGroups }: ScorePanelProps) {
  const editorCtx = useEditorContext();

  const [state, setState] = useState<ScoreState>('idle');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);

  // Keep refs for latest props so the analyze callback captures current data
  const itemsRef = useRef(sparkItems);
  itemsRef.current = sparkItems;
  const groupsRef = useRef(canvasGroups);
  groupsRef.current = canvasGroups;

  /** Extract text content from SparkItems referenced by GroupBlock nodes in the editor */
  const extractReferencedItemTexts = useCallback((): string[] => {
    const editor = editorCtx?.getEditor();
    if (!editor) return [];

    const doc = editor.getJSON();
    const groupIds = new Set<string>();

    // Walk the document tree to find all groupBlock nodes
    function walk(node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) {
      if (node.type === 'groupBlock' && node.attrs?.groupId) {
        groupIds.add(node.attrs.groupId as string);
      }
      if (Array.isArray(node.content)) {
        node.content.forEach((child) => walk(child as typeof node));
      }
    }
    walk(doc);

    if (groupIds.size === 0) return [];

    // Resolve groupId → itemIds → item content
    const texts: string[] = [];
    for (const gid of groupIds) {
      const group = groupsRef.current.find((g) => g.id === gid);
      if (!group) continue;
      for (const itemId of group.itemIds) {
        const item = itemsRef.current.find((i) => i.id === itemId);
        if (!item) continue;
        const text = item.content || item.summary || item.title;
        if (text) texts.push(text);
      }
    }

    return texts;
  }, [editorCtx]);

  /** Run the analysis */
  const analyze = useCallback(async () => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const plainText = editor.getText().trim();
    const referencedItemTexts = extractReferencedItemTexts();

    if (!plainText && referencedItemTexts.length === 0) {
      setState('idle');
      setResult(null);
      return;
    }

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState('loading');

    try {
      const res = await fetch('/api/lytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText, referencedItemTexts }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data: AnalyzeResult = await res.json();
      setResult(data);
      setState('ready');
      setErrorMsg('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [editorCtx, extractReferencedItemTexts]);

  /** Schedule an analysis after debounce */
  const scheduleAnalysis = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      analyze();
    }, DEBOUNCE_MS);
  }, [analyze]);

  // Listen for editor updates
  useEffect(() => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const handler = () => scheduleAnalysis();
    editor.on('update', handler);

    // Run initial analysis if editor already has content
    const text = editor.getText().trim();
    if (text) scheduleAnalysis();

    return () => {
      editor.off('update', handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [editorCtx, scheduleAnalysis]);

  /* ── Idle state ── */
  if (state === 'idle' && !result) {
    return (
      <div className="p-5">
        <h3 className="text-sm font-semibold text-venus-gray-700 mb-5">Content Scoring</h3>
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-venus-gray-100 flex items-center justify-center mx-auto mb-3">
            <FileText size={20} className="text-venus-gray-400" />
          </div>
          <p className="text-sm text-venus-gray-500">
            Start writing in the editor to see live content scoring from Lytics.
          </p>
          <p className="text-xs text-venus-gray-400 mt-1">
            Scores update automatically as you type.
          </p>
        </div>
      </div>
    );
  }

  /* ── Loading state (overlay on existing results or skeleton) ── */
  const isLoading = state === 'loading';

  /* ── Error state ── */
  if (state === 'error' && !result) {
    return (
      <div className="p-5">
        <h3 className="text-sm font-semibold text-venus-gray-700 mb-5">Content Scoring</h3>
        <div className="text-center py-12">
          <p className="text-sm text-red-500 mb-3">{errorMsg || 'Analysis failed'}</p>
          <button
            onClick={analyze}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-medium rounded-md transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 relative">
      {/* Subtle loading indicator */}
      {isLoading && (
        <div className="absolute top-2 right-3 flex items-center gap-1.5 text-venus-gray-400">
          <Loader2 size={12} className="animate-spin" />
          <span className="text-[10px]">Analyzing…</span>
        </div>
      )}

      <h3 className="text-sm font-semibold text-venus-gray-700 mb-5">Content Scoring</h3>

      {/* Skeleton when loading with no prior results */}
      {isLoading && !result ? (
        <>
          <Section icon={Target} title="Topic Relevance">
            <SkeletonLine width="40%" />
            <div className="mt-2"><SkeletonBar /></div>
            <div className="mt-2"><SkeletonLine width="80%" /></div>
          </Section>
          <Section icon={Compass} title="Detected Topics">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <SkeletonLine width={`${60 + i * 10}%`} />
                  <div className="mt-1"><SkeletonBar /></div>
                </div>
              ))}
            </div>
          </Section>
          <Section icon={Users} title="Audience Alignment">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <SkeletonLine width="60%" />
                  <SkeletonLine width="30px" />
                </div>
              ))}
            </div>
          </Section>
        </>
      ) : result ? (
        <>
          {/* 1. Topic Relevance — overall score */}
          <Section icon={Target} title="Topic Relevance">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-2xl font-bold text-venus-gray-700">
                {result.overallRelevance}
              </span>
              <span className="text-xs text-venus-gray-400">/100</span>
            </div>
            <ScoreBar value={result.overallRelevance} />
            <p className="text-xs text-venus-gray-500 mt-2">
              {result.overallRelevance >= 80
                ? 'Strong topical alignment with audience interests.'
                : result.overallRelevance >= 60
                  ? 'Moderate topic relevance. Consider strengthening key themes.'
                  : result.overallRelevance >= 30
                    ? 'Low topic relevance. Try focusing on specific audience themes.'
                    : 'Very low relevance detected. Add more substantive content.'}
            </p>
          </Section>

          {/* 2. Detected Topics */}
          {result.topics.length > 0 && (
            <Section icon={Compass} title="Detected Topics">
              <div className="space-y-3">
                {result.topics.slice(0, 8).map((t) => (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-venus-gray-600 truncate">{t.name}</span>
                      <span className="text-xs text-venus-gray-400 shrink-0 ml-2">
                        {t.score}%
                      </span>
                    </div>
                    <ScoreBar value={t.score} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 3. Audience Alignment */}
          {result.audiences.length > 0 && (
            <Section icon={Users} title="Audience Alignment">
              <div className="space-y-2">
                {result.audiences.slice(0, 6).map((a) => (
                  <div key={a.name} className="flex items-center justify-between">
                    <span className="text-sm text-venus-gray-600 truncate">{a.name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${badgeColor(a.alignment)}`}
                    >
                      {a.alignment}%
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 4. Opportunity Insights */}
          {result.opportunities.length > 0 && (
            <Section icon={Lightbulb} title="Opportunity Insights">
              <div className="space-y-3">
                {result.opportunities.slice(0, 5).map((opp) => (
                  <div
                    key={opp.topic}
                    className="rounded-lg border border-venus-gray-200 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-venus-gray-600 block mb-1">
                      {opp.topic}
                    </span>
                    {opp.dimensions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {opp.dimensions.slice(0, 3).map((d) => (
                          <span
                            key={d.label}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-venus-gray-100 text-venus-gray-500"
                          >
                            {d.label}: {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {opp.segments.length > 0 && (
                      <p className="text-[10px] text-venus-gray-400 mt-1">
                        Segments: {opp.segments.slice(0, 3).join(', ')}
                        {opp.segments.length > 3 && ` +${opp.segments.length - 3}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Empty state for when classification returned nothing useful */}
          {result.topics.length === 0 && result.audiences.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-venus-gray-500">
                No topics detected. Try adding more content to the editor.
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
