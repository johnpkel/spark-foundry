'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Target,
  Compass,
  Users,
  Lightbulb,
  Loader2,
  FileText,
  Wand2,
  BarChart3,
  Radio,
  Lock,
  BookOpen,
  Eye,
  Sparkles,
  Search,
  Info,
  ExternalLink,
  ChevronDown,
  Code,
} from 'lucide-react';
import { useEditorContext } from '@/lib/editor-context';
import type { SparkItem, CanvasGroup } from '@/lib/types';

/* ── Types ──────────────────────────────────── */

interface MockScores {
  overallScore: number;
  wordCount: number;
  sentenceCount: number;
  readabilityEstimate: number;
  structureScore: number;
  topicKeywords: { name: string; score: number }[];
}

interface AIAnalysisResult {
  overallScore: number;
  summary: string;
  topics: { name: string; score: number }[];
  audiences?: { name: string; alignment: number; size: number }[];
  contentQuality: {
    readability: number;
    clarity: number;
    engagement: number;
    seoReadiness: number;
  };
  channelFit: { channel: string; score: number }[];
  recommendations?: string[];
}

interface FullAnalysisResult {
  lytics: {
    topics: { name: string; score: number }[];
    audiences: { name: string; alignment: number; size: number }[];
    opportunity: { topic: string; userCount: number; docCount: number; opportunityScore: number }[];
    aggregateAffinities: { segmentName: string; topAffinities: { topic: string; score: number }[] }[];
    lyticsContentRecs: { url: string; title: string; lytics: Record<string, number> }[];
  };
  ai: {
    contentComparison: string;
    qualityAnalysis: AIAnalysisResult;
    recommendations: {
      contentUpdates: string[];
      campaignIdeas: string[];
      underservedAudiences: { name: string; size: number; gap: string; suggestion: string }[];
      contentGaps: { topic: string; userCount: number; docCount: number; opportunity: string }[];
    };
  };
  relatedSparkItems: { id: string; title: string; similarity: number }[];
}

interface LyticsCacheData {
  topics?: { name: string; score: number }[];
  inferredTopics?: { name: string; score: number }[];
  audiences?: { name: string; alignment: number; size: number }[];
  opportunity?: { topic: string; userCount: number; docCount: number; opportunityScore: number }[];
  aid?: string;
  fullAnalysis?: FullAnalysisResult | null;
  aiResult?: AIAnalysisResult | null;
  lastUpdated?: string;
}

interface ScorePanelProps {
  sparkItems: SparkItem[];
  canvasGroups: CanvasGroup[];
  primaryDomains?: string[];
  sparkId?: string;
  initialLyticsCache?: LyticsCacheData;
}

/* ── Stop words for keyword extraction ──────── */

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been',
  'has', 'had', 'did', 'does', 'am', 'being', 'more', 'very', 'should', 'much',
]);

/* ── Mock scoring (client-side) ─────────────── */

function computeMockScores(text: string): MockScores | null {
  if (!text || text.trim().length < 10) return null;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Readability: based on avg words per sentence (shorter = more readable)
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : wordCount;
  const readabilityEstimate = Math.min(
    100,
    Math.max(10, Math.round(100 - (avgWordsPerSentence - 12) * 3))
  );

  // Structure score: rewards length, paragraphs, headings, lists
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const hasHeadings = /^#{1,3}\s/m.test(text) || /<h[1-6]/i.test(text);
  const hasLists = /^[-*]\s/m.test(text) || /^\d+\.\s/m.test(text);
  let structureScore = Math.min(100, Math.round(
    (wordCount >= 50 ? 30 : (wordCount / 50) * 30) +
    (paragraphs >= 3 ? 30 : (paragraphs / 3) * 30) +
    (hasHeadings ? 20 : 0) +
    (hasLists ? 20 : 0)
  ));
  structureScore = Math.max(10, structureScore);

  // Keyword extraction: most frequent non-stop-words
  const freq = new Map<string, number>();
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.length < 3 || STOP_WORDS.has(lower)) continue;
    freq.set(lower, (freq.get(lower) || 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxFreq = sorted[0]?.[1] || 1;
  const topicKeywords = sorted.map(([name, count]) => ({
    name,
    score: Math.round((count / maxFreq) * 100),
  }));

  // Content substance score
  const substanceScore = Math.min(100, Math.max(10, Math.round(
    (wordCount >= 200 ? 40 : (wordCount / 200) * 40) +
    (topicKeywords.length >= 4 ? 30 : (topicKeywords.length / 4) * 30) +
    (sentenceCount >= 5 ? 30 : (sentenceCount / 5) * 30)
  )));

  const overallScore = Math.round(
    readabilityEstimate * 0.3 + structureScore * 0.3 + substanceScore * 0.4
  );

  return {
    overallScore,
    wordCount,
    sentenceCount,
    readabilityEstimate,
    structureScore,
    topicKeywords,
  };
}

/* ── Visualization Components ───────────────── */

function RingChart({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  const color =
    score >= 80 ? 'stroke-venus-green' :
    score >= 60 ? 'stroke-venus-yellow' :
    score >= 40 ? 'stroke-venus-purple' :
    'stroke-venus-red';

  const bgColor =
    score >= 80 ? 'text-venus-green' :
    score >= 60 ? 'text-venus-yellow' :
    score >= 40 ? 'text-venus-purple' :
    'text-venus-red';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={5}
          className="stroke-venus-gray-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-2xl font-bold ${bgColor}`}>{score}</span>
      </div>
    </div>
  );
}

function EnhancedBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  const color =
    pct >= 80 ? 'bg-venus-green' :
    pct >= 60 ? 'bg-venus-yellow' :
    pct >= 40 ? 'bg-venus-purple' :
    'bg-venus-red';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-venus-gray-600 truncate">{label}</span>
        <span className="text-xs font-medium text-venus-gray-500 ml-2 shrink-0">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-venus-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QualityCard({
  icon: Icon,
  label,
  score,
  tooltip,
  explanation,
  globalExpand,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  score: number;
  tooltip?: string;
  explanation?: string;
  globalExpand?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = globalExpand || localOpen;
  const color =
    score >= 80 ? 'text-venus-green' :
    score >= 60 ? 'text-venus-yellow' :
    score >= 40 ? 'text-venus-purple' :
    'text-venus-red';

  const barColor =
    score >= 80 ? 'bg-venus-green' :
    score >= 60 ? 'bg-venus-yellow' :
    score >= 40 ? 'bg-venus-purple' :
    'bg-venus-red';

  return (
    <div>
      <div
        className={`rounded-lg border border-venus-gray-200 p-2.5 ${explanation ? 'cursor-pointer' : ''}`}
        title={tooltip}
        onClick={explanation ? () => setLocalOpen(!localOpen) : undefined}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon size={12} className="text-venus-gray-400" />
          <span className="text-[10px] text-venus-gray-500 uppercase tracking-wider">{label}</span>
          {explanation && <ChevronDown size={10} className={`ml-auto shrink-0 text-venus-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />}
        </div>
        <div className={`text-lg font-bold ${color} mb-1`}>{score}</div>
        <div className="w-full h-1 rounded-full bg-venus-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      {open && explanation && (
        <div className="mt-1 mx-1 px-2.5 py-2 rounded bg-venus-gray-50 dark:bg-venus-gray-800/30 text-[10px] text-venus-gray-500 leading-relaxed border-l-2 border-venus-purple/30">
          {explanation}
        </div>
      )}
    </div>
  );
}

function QuickStats({
  wordCount,
  sentenceCount,
  readability,
}: {
  wordCount: number;
  sentenceCount: number;
  readability: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Words', value: wordCount.toLocaleString(), tip: 'Total word count in the editor' },
        { label: 'Sentences', value: sentenceCount.toLocaleString(), tip: 'Number of sentences detected' },
        { label: 'Readability', value: `${readability}`, tip: 'Readability score (0\u2013100) based on average words per sentence. Shorter sentences score higher. ~12 words/sentence = 100. Helps gauge if content is accessible to your target audience.' },
      ].map((stat) => (
        <div key={stat.label} className="text-center rounded-lg bg-surface-secondary p-2" title={stat.tip}>
          <div className="text-base font-bold text-venus-gray-700">{stat.value}</div>
          <div className="text-[10px] text-venus-gray-400 uppercase tracking-wider">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 6, right: window.innerWidth - rect.right });
    }
    setShow(true);
  };

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); if (!show) handleEnter(); else setShow(false); }}
        className="p-0.5 rounded hover:bg-venus-gray-100 text-venus-gray-400 hover:text-venus-gray-600 transition-colors"
        aria-label="Info"
      >
        <Info size={10} />
      </button>
      {show && pos && (
        <div
          className="fixed w-56 px-2.5 py-2 rounded-lg bg-venus-gray-700 text-[10px] text-white leading-relaxed shadow-lg pointer-events-none"
          style={{ top: pos.top, right: pos.right, transform: 'translateY(-100%)', zIndex: 9999 }}
        >
          {text}
          <div className="absolute right-3 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-venus-gray-700" />
        </div>
      )}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  tooltip,
  sourceUrl,
  sourceLabel,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  tooltip?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={14} className="text-venus-purple" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-venus-gray-500">
          {title}
        </h4>
        {tooltip && <Tooltip text={tooltip} />}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-0.5 text-[9px] text-venus-gray-400 hover:text-venus-purple transition-colors"
            title={sourceLabel || 'View in Lytics'}
          >
            <ExternalLink size={9} />
            <span>{sourceLabel || 'Source'}</span>
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

function LockedSection({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-5 last:mb-0 opacity-40">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={14} className="text-venus-gray-400" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-venus-gray-400">
          {title}
        </h4>
      </div>
      <div className="flex items-center gap-1.5 text-venus-gray-400">
        <Lock size={11} />
        <span className="text-[10px]">Analyze to unlock</span>
      </div>
    </div>
  );
}

function ExplainableItem({ children, explanation, globalExpand }: { children: React.ReactNode; explanation: string; globalExpand?: boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = globalExpand || localOpen;
  return (
    <div>
      <div
        className="cursor-pointer group"
        onClick={() => setLocalOpen(!localOpen)}
      >
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">{children}</div>
          <ChevronDown size={10} className={`shrink-0 text-venus-gray-500 group-hover:text-venus-gray-700 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {open && (
        <div className="mt-1 ml-4 mr-1 px-2.5 py-2 rounded bg-venus-gray-50 dark:bg-venus-gray-800/30 text-[10px] text-venus-gray-500 leading-relaxed border-l-2 border-venus-purple/30">
          {explanation}
        </div>
      )}
    </div>
  );
}

function RawDataBlock({ title, data, formula }: { title: string; data: Record<string, unknown>; formula?: string }) {
  return (
    <div className="mb-4">
      <h5 className="text-[10px] font-semibold text-venus-gray-500 uppercase tracking-wider mb-1">{title}</h5>
      {formula && (
        <div className="mb-1.5 px-2 py-1 rounded bg-venus-purple/5 border border-venus-purple/10">
          <code className="text-[9px] text-venus-purple font-mono break-words">{formula}</code>
        </div>
      )}
      <pre className="text-[9px] text-venus-gray-600 font-mono bg-venus-gray-50 dark:bg-venus-gray-800/30 rounded p-2 max-h-48 overflow-y-auto border border-venus-gray-100 whitespace-pre-wrap break-words">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function lyticsUrl(aid: string, path: string): string | undefined {
  if (!aid) return undefined;
  return `https://app.lytics.com/a/${aid}/${path}`;
}

function CollapsibleSummary({ summary }: { summary: string }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-5 bg-venus-purple/5 border border-venus-purple/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-venus-purple/10 transition-colors"
      >
        <Sparkles size={11} className="text-venus-purple shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-venus-purple">Summary</span>
        <span className="ml-auto text-venus-gray-400 text-[9px]">{collapsed ? '▼' : '▲'}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2.5 text-xs text-venus-gray-600 leading-relaxed">
          {summary}
        </div>
      )}
    </div>
  );
}

function ExpandableSteps({ steps }: { steps: { id: string; label: string; status: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 mb-3 rounded-lg border border-venus-green/20 bg-venus-green/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-venus-green font-medium hover:bg-venus-green/10 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" className="shrink-0">
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-left">Analysis complete — {steps.length} steps</span>
        <span className="text-venus-gray-400 text-[9px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-venus-green/10">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-venus-green/5 last:border-b-0">
              <svg width="8" height="8" viewBox="0 0 16 16" className="text-venus-green shrink-0">
                <circle cx="8" cy="8" r="8" fill="currentColor" />
                <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] text-venus-gray-500 leading-tight">{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatProfileCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/* ── Main Component ─────────────────────────── */

const MOCK_DEBOUNCE_MS = 500;

export default function ScorePanel({ sparkItems, canvasGroups, primaryDomains = [], sparkId, initialLyticsCache }: ScorePanelProps) {
  const editorCtx = useEditorContext();

  const [mockScores, setMockScores] = useState<MockScores | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(initialLyticsCache?.aiResult ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeSteps, setAnalyzeSteps] = useState<{ id: string; label: string; status: 'active' | 'done' }[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [fullAnalysis, setFullAnalysis] = useState<FullAnalysisResult | null>(initialLyticsCache?.fullAnalysis ?? null);

  // Lytics ambient data state — hydrate from persisted cache
  const [lyticsAvailable, setLyticsAvailable] = useState(
    !!(initialLyticsCache?.topics?.length || initialLyticsCache?.audiences?.length)
  );
  const [lyticsTopics, setLyticsTopics] = useState<{ name: string; score: number }[]>(initialLyticsCache?.topics ?? []);
  const [lyticsInferredTopics, setLyticsInferredTopics] = useState<{ name: string; score: number }[]>(initialLyticsCache?.inferredTopics ?? []);
  const [lyticsAudiences, setLyticsAudiences] = useState<{ name: string; alignment: number; size: number }[]>(initialLyticsCache?.audiences ?? []);
  const [lyticsOpportunity, setLyticsOpportunity] = useState<{ topic: string; userCount: number; docCount: number; opportunityScore: number }[]>(initialLyticsCache?.opportunity ?? []);
  const [isEnriching, setIsEnriching] = useState(false);
  const [lyticsAid, setLyticsAid] = useState(initialLyticsCache?.aid ?? '');
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(
    initialLyticsCache?.lastUpdated ? new Date(initialLyticsCache.lastUpdated).getTime() : 0
  );
  const [, setTick] = useState(0); // force re-render for relative time

  const enrichDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastEnrichedTextRef = useRef('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);

  // Keep refs for latest props
  const itemsRef = useRef(sparkItems);
  itemsRef.current = sparkItems;
  const groupsRef = useRef(canvasGroups);
  groupsRef.current = canvasGroups;

  // ── Persist Lytics cache to Spark metadata ──────────
  const cacheSaveRef = useRef<ReturnType<typeof setTimeout>>(null);

  const persistLyticsCache = useCallback((data: LyticsCacheData) => {
    if (!sparkId) return;
    if (cacheSaveRef.current) clearTimeout(cacheSaveRef.current);
    cacheSaveRef.current = setTimeout(() => {
      fetch(`/api/sparks/${sparkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata_merge: { lyticsCache: { ...data, lastUpdated: new Date().toISOString() } } }),
      }).catch(() => {});
    }, 1000);
  }, [sparkId]);

  /** Extract text content from SparkItems referenced by GroupBlock nodes */
  const extractReferencedItemTexts = useCallback((): string[] => {
    const editor = editorCtx?.getEditor();
    if (!editor) return [];

    const doc = editor.getJSON();
    const groupIds = new Set<string>();

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

  /** Update mock scores from current editor text */
  const updateMockScores = useCallback(() => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;
    const text = editor.getText().trim();
    setMockScores(computeMockScores(text));
  }, [editorCtx]);

  /** Run AI analysis via SSE stream */
  const analyze = useCallback(async () => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const plainText = editor.getText().trim();
    const referencedItemTexts = extractReferencedItemTexts();
    const sparkItemUrls = itemsRef.current
      .filter((item) => item.metadata?.url || item.type === 'link')
      .map((item) => (item.metadata?.url as string) || item.content)
      .filter(Boolean);

    if (!plainText && referencedItemTexts.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setAnalyzeSteps([]);
    setErrorMsg('');

    try {
      const res = await fetch('/api/lytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText, referencedItemTexts, sparkItemUrls, primaryDomains }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        try { throw new Error(JSON.parse(text).error || `HTTP ${res.status}`); }
        catch { throw new Error(`HTTP ${res.status}`); }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            const payload = JSON.parse(line.slice(6));

            if (currentEvent === 'step') {
              setAnalyzeSteps((prev) => {
                const existing = prev.findIndex((s) => s.id === payload.id);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = payload;
                  return updated;
                }
                return [...prev, payload];
              });
            } else if (currentEvent === 'result') {
              const data = payload;
              if (data.lytics) {
                if (data.lytics.topics) setLyticsTopics(data.lytics.topics);
                if (data.lytics.audiences) setLyticsAudiences(data.lytics.audiences);
              }
              if (data.ai?.qualityAnalysis) setAiResult(data.ai.qualityAnalysis);
              setFullAnalysis(data);
              setErrorMsg('');
              setLastFetchedAt(Date.now());
              persistLyticsCache({
                topics: data.lytics?.topics ?? lyticsTopics,
                inferredTopics: lyticsInferredTopics,
                audiences: data.lytics?.audiences ?? lyticsAudiences,
                opportunity: lyticsOpportunity,
                aid: lyticsAid,
                fullAnalysis: data,
                aiResult: data.ai?.qualityAnalysis ?? null,
              });
            } else if (currentEvent === 'error') {
              throw new Error(payload.error || 'Analysis failed');
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [editorCtx, extractReferencedItemTexts, persistLyticsCache, lyticsTopics, lyticsInferredTopics, lyticsAudiences, lyticsOpportunity, lyticsAid, primaryDomains]);

  // Listen for editor updates — debounced mock scoring
  useEffect(() => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateMockScores, MOCK_DEBOUNCE_MS);
    };

    editor.on('update', handler);

    // Initial computation
    const text = editor.getText().trim();
    if (text) updateMockScores();

    return () => {
      editor.off('update', handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [editorCtx, updateMockScores]);

  // Tick every 30s to keep relative timestamp fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch cached Lytics data on mount
  useEffect(() => {
    fetch('/api/lytics/data')
      .then((res) => res.json())
      .then((data) => {
        if (data.available) {
          setLyticsAvailable(true);
          if (data.aid) setLyticsAid(String(data.aid));
          setLastFetchedAt(Date.now());
          if (data.opportunity?.length) {
            const topics = data.opportunity
              .filter((t: Record<string, unknown>) => {
                const users = (t.dimensions as { label: string; value: number }[])?.find((d) => d.label === 'User Count')?.value ?? 0;
                return users > 0;
              })
              .map((t: Record<string, unknown>) => {
                const dims = t.dimensions as { label: string; value: number }[];
                const users = dims?.find((d) => d.label === 'User Count')?.value ?? 0;
                const docs = dims?.find((d) => d.label === 'Document Count')?.value ?? 0;
                return { topic: t.topic as string, userCount: users, docCount: docs, opportunityScore: 0 };
              });
            const maxUsers = Math.max(...topics.map((t: { userCount: number }) => t.userCount), 1);
            const maxDocs = Math.max(...topics.map((t: { docCount: number }) => t.docCount), 1);
            for (const t of topics) {
              t.opportunityScore = Math.round((t.userCount / maxUsers) * (1 - t.docCount / maxDocs) * 100);
            }
            topics.sort((a: { opportunityScore: number }, b: { opportunityScore: number }) => b.opportunityScore - a.opportunityScore);
            const sliced = topics.slice(0, 20);
            setLyticsOpportunity(sliced);
            persistLyticsCache({ opportunity: sliced, aid: String(data.aid || '') });
          }
        }
      })
      .catch(() => {});
  }, []);

  // Debounced Lytics enrichment on editor changes
  useEffect(() => {
    if (!lyticsAvailable) return;
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const handler = () => {
      if (enrichDebounceRef.current) clearTimeout(enrichDebounceRef.current);
      enrichDebounceRef.current = setTimeout(() => {
        const text = editor.getText().trim();
        if (text.length < 10) return;
        if (text === lastEnrichedTextRef.current) return;
        if (Math.abs(text.length - lastEnrichedTextRef.current.length) < 50 && lastEnrichedTextRef.current) return;
        lastEnrichedTextRef.current = text;

        setIsEnriching(true);
        fetch('/api/lytics/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.topics) setLyticsTopics(data.topics);
            if (data.inferredTopics) setLyticsInferredTopics(data.inferredTopics);
            if (data.audiences) setLyticsAudiences(data.audiences);
            // Persist to Spark metadata
            setLastFetchedAt(Date.now());
            persistLyticsCache({
              topics: data.topics, inferredTopics: data.inferredTopics,
              audiences: data.audiences, aid: lyticsAid,
            });
          })
          .catch(() => {})
          .finally(() => setIsEnriching(false));
      }, 2000);
    };

    editor.on('update', handler);
    const initialText = editor.getText().trim();
    if (initialText.length >= 10) handler();

    return () => {
      editor.off('update', handler);
      if (enrichDebounceRef.current) clearTimeout(enrichDebounceRef.current);
    };
  }, [editorCtx, lyticsAvailable]);

  const [showRawData, setShowRawData] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  const hasContent = !!mockScores;

  /* ── Idle state ── */
  if (!hasContent && !aiResult) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-sm font-semibold text-venus-gray-700">Content Scoring</h3>
          {lastFetchedAt > 0 && <span className="text-[10px] text-venus-gray-400">Updated {timeAgo(lastFetchedAt)}</span>}
        </div>
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-venus-gray-100 flex items-center justify-center mx-auto mb-3">
            <FileText size={20} className="text-venus-gray-400" />
          </div>
          <p className="text-sm text-venus-gray-500">
            Start writing in the editor to see live content scoring.
          </p>
          <p className="text-xs text-venus-gray-400 mt-1">
            Scores update automatically as you type.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-venus-gray-700">Content Scoring</h3>
        {lastFetchedAt > 0 && <span className="text-[10px] text-venus-gray-400">Updated {timeAgo(lastFetchedAt)}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {!showRawData && (
            <button
              onClick={() => setExpandAll(!expandAll)}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                expandAll
                  ? 'bg-venus-purple/10 text-venus-purple border-venus-purple/30'
                  : 'text-venus-gray-400 border-venus-gray-200 hover:border-venus-gray-400'
              }`}
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        <button
          onClick={() => setShowRawData(!showRawData)}
          className={`ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
            showRawData
              ? 'bg-venus-purple/10 text-venus-purple border-venus-purple/30'
              : 'text-venus-gray-400 border-venus-gray-200 hover:border-venus-gray-400'
          }`}
        >
          <Code size={9} />
          {showRawData ? 'Visualizations' : 'Raw Data'}
        </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* AI Summary (collapsible) */}
      {aiResult?.summary && (
        <CollapsibleSummary summary={aiResult.summary} />
      )}



      {/* Quick Stats moved to editor toolbar — see SparkEditor.tsx EditorStatsBar */}

      {/* Detected Keywords / Topics */}
      <Section
        icon={Compass}
        title={lyticsTopics.length > 0 ? 'Lytics Topics' : aiResult ? 'Detected Topics' : 'Detected Keywords'}
        tooltip={lyticsTopics.length > 0
          ? 'Topics extracted by Lytics NLP from your editor content. Scores show classification confidence. Higher scores mean the content strongly signals this topic to Lytics\u2019 audience engine.'
          : undefined}
        sourceUrl={lyticsTopics.length > 0 ? lyticsUrl(lyticsAid, 'content/topics') : undefined}
        sourceLabel="Lytics"
      >
        {showRawData ? (
          <RawDataBlock
            title="Topics"
            data={{ topics: lyticsTopics, inferredTopics: lyticsInferredTopics } as unknown as Record<string, unknown>}
            formula="POST /v2/content/enrich → topics{name: confidence 0-1} × 100"
          />
        ) : lyticsTopics.length > 0 ? (
          <div className="space-y-3.5">
            {lyticsTopics.slice(0, 8).map((t) => (
              <ExplainableItem key={t.name} globalExpand={expandAll} explanation={`"${t.name}" was identified by Lytics NLP with ${t.score}% confidence. This topic is extracted by running your editor text through Lytics' content enrichment pipeline (Diffbot + Google NLP + TextRazor + sentiment analysis). Higher confidence means your content strongly signals this subject, which affects which audience segments it aligns with.`}>
                <EnhancedBar label={t.name} value={t.score} />
              </ExplainableItem>
            ))}
            {lyticsInferredTopics.length > 0 && (
              <div className="mt-4 pt-3 border-t border-venus-gray-100">
                <p className="text-[10px] text-venus-gray-400 uppercase tracking-wider mb-3">Inferred</p>
                <div className="space-y-3.5">
                  {lyticsInferredTopics.slice(0, 4).map((t) => (
                    <ExplainableItem key={t.name} globalExpand={expandAll} explanation={`"${t.name}" is an inferred topic (${t.score}% confidence). Inferred topics are secondary classifications that Lytics' NLP detected with lower certainty. They may represent tangential themes in your content and can still influence audience alignment.`}>
                      <div className="opacity-60">
                        <EnhancedBar label={t.name} value={t.score} />
                      </div>
                    </ExplainableItem>
                  ))}
                </div>
              </div>
            )}
            {isEnriching && (
              <div className="flex items-center gap-1.5 text-[10px] text-venus-gray-400">
                <Loader2 size={10} className="animate-spin" />
                Updating…
              </div>
            )}
          </div>
        ) : aiResult ? (
          <div className="space-y-3.5">
            {aiResult.topics.slice(0, 8).map((t) => (
              <EnhancedBar key={t.name} label={t.name} value={t.score} />
            ))}
          </div>
        ) : mockScores && mockScores.topicKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {mockScores.topicKeywords.map((kw) => (
              <span
                key={kw.name}
                className="text-xs px-2 py-1 rounded-full bg-venus-gray-100 text-venus-gray-600"
                style={{ opacity: 0.4 + (kw.score / 100) * 0.6 }}
              >
                {kw.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-venus-gray-400">No keywords detected yet.</p>
        )}
      </Section>

      {/* Lytics: Audience Fit (always visible when available) */}
      {lyticsAudiences.length > 0 && (
        <Section
          icon={Users}
          title="Audience Fit"
          tooltip="Lytics audience segments whose behavioral topic profile matches your content. Alignment % measures topic overlap between your content and each segment. Profile count shows real audience size from your CDP."
          sourceUrl={lyticsUrl(lyticsAid, 'segments')}
          sourceLabel="Lytics"
        >
          {showRawData ? (
            <RawDataBlock
              title="Audiences"
              data={{ audiences: lyticsAudiences } as unknown as Record<string, unknown>}
              formula="POST /v2/content/align(topics) → cosine similarity → alignment × 100"
            />
          ) : (
            <div className="space-y-3.5">
              {lyticsAudiences.slice(0, 10).map((a) => {
                const dotSize =
                  a.size >= 1_000_000 ? 'w-2.5 h-2.5' :
                  a.size >= 1_000 ? 'w-2 h-2' :
                  'w-1.5 h-1.5';

                const alignColor =
                  a.alignment >= 80 ? 'bg-venus-green text-venus-green' :
                  a.alignment >= 60 ? 'bg-venus-yellow text-venus-yellow' :
                  'bg-venus-gray-300 text-venus-gray-500';

                return (
                  <ExplainableItem key={a.name} globalExpand={expandAll} explanation={`"${a.name}" has ${a.size.toLocaleString()} profiles and ${a.alignment}% alignment with your content. Alignment is computed by Lytics' content/align API using cosine similarity between your content's topic vector and the aggregate topic affinities of users in this segment. Higher alignment = this audience behaviorally engages with topics similar to what you're writing about.`}>
                    <div className="flex items-center gap-2">
                      <div className={`${dotSize} rounded-full bg-venus-purple/40 shrink-0`} title="Relative audience size" />
                      <span className="text-xs text-venus-gray-600 truncate flex-1">{a.name}</span>
                      <span className="text-[10px] text-venus-gray-400 shrink-0" title={`${a.size.toLocaleString()} profiles in this segment`}>{formatProfileCount(a.size)}</span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${alignColor.split(' ')[0]}/15 ${alignColor.split(' ')[1]}`}
                        title={`${a.alignment}% topic overlap between your content and this audience's interests`}
                      >
                        {a.alignment}%
                      </span>
                    </div>
                  </ExplainableItem>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* Lytics: Content Opportunity (always visible when available) */}
      {lyticsOpportunity.length > 0 && lyticsTopics.length > 0 && (
        <Section
          icon={BarChart3}
          title="Content Opportunity"
          tooltip="Opportunity score = high user interest + low content coverage. Topics with many interested users but few published docs represent content gaps you can fill. Users and docs are real counts from Lytics."
          sourceUrl={lyticsUrl(lyticsAid, 'content/topics')}
          sourceLabel="Lytics"
        >
          {showRawData ? (
            <RawDataBlock
              title="Opportunity"
              data={{ opportunity: lyticsOpportunity.filter((o) => lyticsTopics.some((t) => t.name.toLowerCase() === o.topic.toLowerCase())) } as unknown as Record<string, unknown>}
              formula="score = (userCount / maxUsers) × (1 - docCount / maxDocs) × 100"
            />
          ) : (
            <div className="space-y-3.5">
              {lyticsOpportunity
                .filter((o) => lyticsTopics.some((t) => t.name.toLowerCase() === o.topic.toLowerCase()))
                .slice(0, 5)
                .map((o) => (
                  <ExplainableItem key={o.topic} globalExpand={expandAll} explanation={`"${o.topic}" has ${o.userCount.toLocaleString()} interested users but only ${o.docCount} published docs. Opportunity score (${o.opportunityScore}%) = (userCount / maxUserCount) × (1 - docCount / maxDocCount). High score = many users interested, few docs available — a content gap worth filling.`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-venus-gray-600 truncate">{o.topic}</span>
                          <span className="text-[10px] text-venus-gray-400 shrink-0 ml-1" title="Opportunity score: higher = more users interested, fewer docs available">{o.opportunityScore}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-venus-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-venus-purple transition-all duration-500"
                            style={{ width: `${o.opportunityScore}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-[9px] text-venus-gray-400 shrink-0 text-right leading-tight">
                        <div title="Number of unique users with behavioral affinity for this topic">{o.userCount.toLocaleString()} users</div>
                        <div title="Number of published content pieces covering this topic">{o.docCount} docs</div>
                      </div>
                    </div>
                  </ExplainableItem>
                ))}
            </div>
          )}
        </Section>
      )}

      {/* Analyze button */}
      <div className="mb-5">
        <button
          onClick={analyze}
          disabled={isAnalyzing || !hasContent}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Wand2 size={12} />
              Run full analysis
            </>
          )}
        </button>

        {/* Analysis progress steps */}
        {isAnalyzing && analyzeSteps.length > 0 && (
          <div className="mt-2 rounded-lg border border-venus-gray-200 bg-surface-secondary overflow-hidden">
            {analyzeSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-venus-gray-100 last:border-b-0">
                {step.status === 'active' ? (
                  <Loader2 size={10} className="animate-spin text-venus-purple shrink-0" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 16 16" className="text-venus-green shrink-0">
                    <circle cx="8" cy="8" r="8" fill="currentColor" />
                    <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className={`text-[10px] leading-tight ${step.status === 'active' ? 'text-venus-gray-600' : 'text-venus-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Completed steps (expandable) */}
        {!isAnalyzing && analyzeSteps.length > 0 && (
          <ExpandableSteps steps={analyzeSteps} />
        )}
      </div>

      {/* AI: Content Quality */}
      {aiResult ? (
        <Section icon={Target} title="Content Quality" tooltip="AI-assessed quality metrics. Each score (0-100) evaluates a different dimension of your content's effectiveness. Run full analysis to generate these scores.">
          {showRawData ? (
            <RawDataBlock
              title="submit_content_analysis"
              data={{
                _tool: 'submit_content_analysis',
                _model: 'claude-sonnet-4-6',
                _method: 'Anthropic Messages API → tool_use',
                _description: 'Claude analyzes editor content and returns structured quality scores via a forced tool call. The tool schema defines the response shape — Claude cannot deviate from it.',
                _schema: {
                  overallScore: 'number (0-100) — weighted composite of all quality dimensions',
                  contentQuality: {
                    readability: 'number (0-100) — sentence length, vocabulary complexity, paragraph structure, plain language usage',
                    clarity: 'number (0-100) — logical flow, specificity of claims, absence of ambiguity',
                    engagement: 'number (0-100) — hooks, narrative structure, actionable takeaways, formatting variety',
                    seoReadiness: 'number (0-100) — keyword density, heading hierarchy, meta-friendliness, content depth',
                  },
                  channelFit: '[{channel, score}] — fit assessment per distribution channel',
                },
                result: aiResult.contentQuality,
                overallScore: aiResult.overallScore,
              } as unknown as Record<string, unknown>}
              formula="anthropic.messages.create({ model: 'claude-sonnet-4-6', tools: [submit_content_analysis], max_tokens: 4096 }) → response.content.find(b => b.name === 'submit_content_analysis').input"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <QualityCard icon={BookOpen} label="Readability" globalExpand={expandAll} score={aiResult.contentQuality.readability} tooltip="How easy the content is to read. Considers sentence length, vocabulary complexity, and structure. Higher = more accessible to broader audiences." explanation={`Score: ${aiResult.contentQuality.readability}/100. AI-assessed using Claude's analysis of sentence length, vocabulary complexity, paragraph structure, and use of plain language. Scores above 70 indicate content accessible to a general business audience. Below 50 suggests overly complex or jargon-heavy writing.`} />
              <QualityCard icon={Eye} label="Clarity" globalExpand={expandAll} score={aiResult.contentQuality.clarity} tooltip="How clearly the content communicates its message. Considers logical flow, specificity, and absence of ambiguity." explanation={`Score: ${aiResult.contentQuality.clarity}/100. Measures how clearly the content communicates its core message. Claude evaluates logical flow between paragraphs, specificity of claims, absence of ambiguity, and whether the reader can extract the main point quickly.`} />
              <QualityCard icon={Sparkles} label="Engagement" globalExpand={expandAll} score={aiResult.contentQuality.engagement} tooltip="How likely the content is to hold a reader's attention. Considers hooks, storytelling, actionable takeaways, and formatting variety." explanation={`Score: ${aiResult.contentQuality.engagement}/100. Predicts how well the content holds reader attention. Claude considers opening hooks, narrative structure, actionable takeaways, varied formatting (lists, headers, examples), and whether the content rewards the reader's time.`} />
              <QualityCard icon={Search} label="SEO" globalExpand={expandAll} score={aiResult.contentQuality.seoReadiness} tooltip="How well-optimized the content is for search engines. Considers keyword presence, heading structure, meta-friendliness, and content depth." explanation={`Score: ${aiResult.contentQuality.seoReadiness}/100. Evaluates search engine optimization readiness. Claude checks for keyword presence and density, heading hierarchy (H1→H2→H3), meta-description-friendly opening paragraph, internal/external linking opportunities, and content depth relative to the topic.`} />
            </div>
          )}
        </Section>
      ) : (
        <LockedSection icon={Target} title="Content Quality" />
      )}


      {/* AI: Channel Fit */}
      {aiResult ? (
        <Section icon={Radio} title="Channel Fit" tooltip="How well your content's format and style suits each distribution channel. Higher scores indicate a better natural fit. Use this to decide where to publish or how to adapt the content.">
          {showRawData ? (
            <RawDataBlock
              title="submit_content_analysis.channelFit"
              data={{
                _tool: 'submit_content_analysis',
                _field: 'channelFit',
                _description: 'Claude evaluates how well the content format, length, tone, and structure suit each distribution channel. Returned as part of the same tool call as Content Quality.',
                _schema: '[{ channel: string, score: number (0-100) }]',
                _channels: {
                  Blog: 'Favors 800-2000 word long-form with headers, images, and depth',
                  Email: 'Favors concise, scannable content with a clear CTA',
                  Social: 'Favors punchy, shareable snippets with hooks',
                  'Web Page': 'Favors structured, scannable content with navigation and CTAs',
                  Newsletter: 'Favors curated, multi-topic formats with brief summaries',
                },
                result: [...aiResult.channelFit].sort((a, b) => b.score - a.score),
              } as unknown as Record<string, unknown>}
              formula="Same tool call as Content Quality → submit_content_analysis.input.channelFit"
            />
          ) : (
            <div className="space-y-3.5">
              {[...aiResult.channelFit].sort((a, b) => b.score - a.score).map((ch) => (
                <ExplainableItem key={ch.channel} globalExpand={expandAll} explanation={`"${ch.channel}" fit: ${ch.score}%. AI-assessed by Claude based on content length, format, tone, and structure. ${ch.channel === 'Blog' ? 'Blogs favor 800-2000 word long-form with headers and images.' : ch.channel === 'Email' ? 'Email favors concise, scannable content with a clear CTA.' : ch.channel === 'Social' ? 'Social favors punchy, shareable snippets under 280 chars with hooks.' : ch.channel === 'Web Page' ? 'Web pages favor structured, scannable content with clear navigation and CTAs.' : 'Newsletters favor curated, multi-topic formats with brief summaries and links.'}`}>
                  <EnhancedBar label={ch.channel} value={ch.score} />
                </ExplainableItem>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <LockedSection icon={BarChart3} title="Channel Fit" />
      )}

      {/* ── Layer 2: Full Analysis (Lytics + AI) ── */}

      {/* Gap Analysis */}
      {fullAnalysis?.ai?.contentComparison && (
        <Section
          icon={Compass}
          title="Lytics Gap Analysis"
          tooltip="AI comparison of your content against real Lytics audience data. Identifies what your content covers well, what\u2019s missing, and which audience interests aren\u2019t addressed."
        >
          {showRawData ? (
            <RawDataBlock
              title="submit_strategic_analysis.contentComparison"
              data={{
                _tool: 'submit_strategic_analysis',
                _field: 'contentComparison',
                _model: 'claude-sonnet-4-6',
                _description: 'Claude compares editor content against real Lytics audience intelligence data (topics, segments, behavioral scores, aggregate affinities). Only available when Lytics data is present — Claude receives the full Lytics context in its system prompt.',
                _context_provided: 'Lytics topics with confidence, aligned audiences with sizes, topic behavioral data (recency/intensity/propensity/opportunity), aggregate audience affinities',
                result: fullAnalysis.ai.contentComparison,
              } as unknown as Record<string, unknown>}
              formula="anthropic.messages.create({ system: lyticsContext, tools: [submit_strategic_analysis] }) → .input.contentComparison"
            />
          ) : (
            <p className="text-xs text-venus-gray-600 leading-relaxed">
              {fullAnalysis.ai.contentComparison}
            </p>
          )}
        </Section>
      )}

      {/* Strategic Recommendations */}
      {fullAnalysis?.ai?.recommendations && (
        fullAnalysis.ai.recommendations.contentUpdates?.length > 0 ||
        fullAnalysis.ai.recommendations.campaignIdeas?.length > 0 ||
        fullAnalysis.ai.recommendations.underservedAudiences?.length > 0 ||
        fullAnalysis.ai.recommendations.contentGaps?.length > 0
      ) && (
        <Section
          icon={Lightbulb}
          title="Strategic Recommendations"
          tooltip="AI-generated recommendations grounded in Lytics behavioral data. Content updates improve audience alignment. Campaign ideas leverage engagement patterns. Underserved audiences and content gaps are data-driven opportunities."
        >
          {showRawData ? (
            <RawDataBlock
              title="submit_strategic_analysis.recommendations"
              data={{
                _tool: 'submit_strategic_analysis',
                _field: 'recommendations',
                _model: 'claude-sonnet-4-6',
                _description: 'Claude generates strategic recommendations grounded in Lytics behavioral data. Each sub-section is a required field in the tool schema — Claude must provide all four.',
                _schema: {
                  contentUpdates: 'string[] — 3-5 specific content improvements to better align with high-opportunity audiences',
                  campaignIdeas: 'string[] — 2-3 campaign concepts leveraging behavioral engagement data',
                  underservedAudiences: '[{name, size, gap, suggestion}] — audiences the content could be adapted for',
                  contentGaps: '[{topic, userCount, docCount, opportunity}] — topics where user interest outpaces available content',
                },
                result: fullAnalysis.ai.recommendations,
              } as unknown as Record<string, unknown>}
              formula="Same tool call as Gap Analysis → submit_strategic_analysis.input.recommendations"
            />
          ) : (
            <>
              {fullAnalysis.ai.recommendations.contentUpdates?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Content Updates</h5>
                  <div className="space-y-1.5">
                    {fullAnalysis.ai.recommendations.contentUpdates.map((rec: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-venus-gray-600">
                        <span className="text-venus-purple font-bold shrink-0">{i + 1}.</span>
                        <span className="leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fullAnalysis.ai.recommendations.campaignIdeas?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Campaign Ideas</h5>
                  <div className="space-y-1.5">
                    {fullAnalysis.ai.recommendations.campaignIdeas.map((idea: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-venus-gray-600">
                        <span className="text-venus-green font-bold shrink-0">→</span>
                        <span className="leading-relaxed">{idea}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fullAnalysis.ai.recommendations.underservedAudiences?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Underserved Audiences</h5>
                  <div className="space-y-3.5">
                    {fullAnalysis.ai.recommendations.underservedAudiences.map((a: { name: string; size: number; gap: string; suggestion: string }, i: number) => (
                      <div key={i} className="rounded-lg border border-venus-gray-200 p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-venus-gray-700">{a.name}</span>
                          <span className="text-[10px] text-venus-gray-400">{formatProfileCount(a.size)}</span>
                        </div>
                        <p className="text-[10px] text-venus-gray-500 mb-0.5">{a.gap}</p>
                        <p className="text-[10px] text-venus-purple">{a.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fullAnalysis.ai.recommendations.contentGaps?.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-venus-gray-400 mb-1.5">Content Gaps</h5>
                  <div className="space-y-1.5">
                    {fullAnalysis.ai.recommendations.contentGaps.map((g: { topic: string; userCount: number; docCount: number; opportunity: string }, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-venus-gray-600">
                        <span className="text-venus-yellow font-bold shrink-0">!</span>
                        <span className="truncate flex-1">{g.topic}</span>
                        <span className="text-[10px] text-venus-gray-400 shrink-0">{g.userCount.toLocaleString()} users / {g.docCount} docs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* Related Content from Lytics */}
      {(fullAnalysis?.lytics?.lyticsContentRecs?.length ?? 0) > 0 && fullAnalysis && (
        <Section
          icon={BookOpen}
          title="Related Content (Lytics)"
          tooltip="Published pages from your primary domain that Lytics has indexed and matched to similar topics. These are what your audience is already reading."
          sourceUrl={lyticsUrl(lyticsAid, 'content')}
          sourceLabel="Lytics"
        >
          <div className="space-y-1.5">
            {fullAnalysis.lytics.lyticsContentRecs.map((rec: { url: string; title: string }, i: number) => (
              <a key={i} href={rec.url} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-venus-purple hover:underline truncate">
                {rec.title || rec.url}
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Content Score ring — bottom of panel, only after AI analysis */}
      {aiResult?.overallScore != null && (
        <div className="flex items-center justify-center gap-2 pt-2 mt-2 border-t border-venus-gray-100">
          <RingChart score={aiResult.overallScore} />
          <Tooltip text="AI-assessed content quality score (0-100) combining readability, clarity, engagement, and SEO readiness. Updated when you run full analysis." />
        </div>
      )}
    </div>
  );
}
