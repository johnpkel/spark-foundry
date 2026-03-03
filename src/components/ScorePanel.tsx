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
  audiences: { name: string; alignment: number; size: string }[];
  contentQuality: {
    readability: number;
    clarity: number;
    engagement: number;
    seoReadiness: number;
  };
  channelFit: { channel: string; score: number }[];
  recommendations: string[];
}

interface ScorePanelProps {
  sparkItems: SparkItem[];
  canvasGroups: CanvasGroup[];
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
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  score: number;
}) {
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
    <div className="rounded-lg border border-venus-gray-200 p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className="text-venus-gray-400" />
        <span className="text-[10px] text-venus-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color} mb-1`}>{score}</div>
      <div className="w-full h-1 rounded-full bg-venus-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
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
        { label: 'Words', value: wordCount.toLocaleString() },
        { label: 'Sentences', value: sentenceCount.toLocaleString() },
        { label: 'Readability', value: `${readability}` },
      ].map((stat) => (
        <div key={stat.label} className="text-center rounded-lg bg-surface-secondary p-2">
          <div className="text-base font-bold text-venus-gray-700">{stat.value}</div>
          <div className="text-[10px] text-venus-gray-400 uppercase tracking-wider">
            {stat.label}
          </div>
        </div>
      ))}
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
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={14} className="text-venus-purple" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-venus-gray-500">
          {title}
        </h4>
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

/* ── Main Component ─────────────────────────── */

const MOCK_DEBOUNCE_MS = 500;

export default function ScorePanel({ sparkItems, canvasGroups }: ScorePanelProps) {
  const editorCtx = useEditorContext();

  const [mockScores, setMockScores] = useState<MockScores | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);

  // Keep refs for latest props
  const itemsRef = useRef(sparkItems);
  itemsRef.current = sparkItems;
  const groupsRef = useRef(canvasGroups);
  groupsRef.current = canvasGroups;

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

  /** Run AI analysis */
  const analyze = useCallback(async () => {
    const editor = editorCtx?.getEditor();
    if (!editor) return;

    const plainText = editor.getText().trim();
    const referencedItemTexts = extractReferencedItemTexts();

    if (!plainText && referencedItemTexts.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/scoring/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText, referencedItemTexts }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data: AIAnalysisResult = await res.json();
      setAiResult(data);
      setErrorMsg('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [editorCtx, extractReferencedItemTexts]);

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

  // Determine display score
  const displayScore = aiResult?.overallScore ?? mockScores?.overallScore ?? 0;
  const hasContent = !!mockScores;

  /* ── Idle state ── */
  if (!hasContent && !aiResult) {
    return (
      <div className="p-5">
        <h3 className="text-sm font-semibold text-venus-gray-700 mb-5">Content Scoring</h3>
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
      <h3 className="text-sm font-semibold text-venus-gray-700 mb-4">Content Scoring</h3>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={isAnalyzing || !hasContent}
        className="w-full mb-5 flex items-center justify-center gap-2 px-4 py-2.5 bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {isAnalyzing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing…
          </>
        ) : (
          <>
            <Wand2 size={16} />
            Analyze with Foundry AI
          </>
        )}
      </button>

      {errorMsg && (
        <div className="mb-4 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* AI Summary */}
      {aiResult?.summary && (
        <div className="mb-5 text-xs text-venus-gray-600 bg-venus-purple/5 border border-venus-purple/10 rounded-lg px-3 py-2.5 leading-relaxed">
          <span className="text-venus-purple font-semibold">AI:</span> {aiResult.summary}
        </div>
      )}

      {/* Ring Chart */}
      <div className="flex justify-center mb-5">
        <RingChart score={displayScore} />
      </div>

      {/* Quick Stats */}
      {mockScores && (
        <div className="mb-5">
          <QuickStats
            wordCount={mockScores.wordCount}
            sentenceCount={mockScores.sentenceCount}
            readability={mockScores.readabilityEstimate}
          />
        </div>
      )}

      {/* Detected Keywords / Topics */}
      <Section icon={Compass} title={aiResult ? 'Detected Topics' : 'Detected Keywords'}>
        {aiResult ? (
          <div className="space-y-2.5">
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

      {/* AI: Content Quality */}
      {aiResult ? (
        <Section icon={Target} title="Content Quality">
          <div className="grid grid-cols-2 gap-2">
            <QualityCard icon={BookOpen} label="Readability" score={aiResult.contentQuality.readability} />
            <QualityCard icon={Eye} label="Clarity" score={aiResult.contentQuality.clarity} />
            <QualityCard icon={Sparkles} label="Engagement" score={aiResult.contentQuality.engagement} />
            <QualityCard icon={Search} label="SEO" score={aiResult.contentQuality.seoReadiness} />
          </div>
        </Section>
      ) : (
        <LockedSection icon={Target} title="Content Quality" />
      )}

      {/* AI: Audience Alignment */}
      {aiResult ? (
        <Section icon={Users} title="Audience Alignment">
          <div className="space-y-2.5">
            {aiResult.audiences.slice(0, 6).map((a) => {
              const dotSize =
                a.size.includes('M') ? 'w-2.5 h-2.5' :
                a.size.includes('K') ? 'w-2 h-2' :
                'w-1.5 h-1.5';

              const alignColor =
                a.alignment >= 80 ? 'bg-venus-green text-venus-green' :
                a.alignment >= 60 ? 'bg-venus-yellow text-venus-yellow' :
                'bg-venus-gray-300 text-venus-gray-500';

              return (
                <div key={a.name} className="flex items-center gap-2">
                  <div className={`${dotSize} rounded-full bg-venus-purple/40 shrink-0`} />
                  <span className="text-xs text-venus-gray-600 truncate flex-1">{a.name}</span>
                  <span className="text-[10px] text-venus-gray-400 shrink-0">{a.size}</span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${alignColor.split(' ')[0]}/15 ${alignColor.split(' ')[1]}`}
                  >
                    {a.alignment}%
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      ) : (
        <LockedSection icon={Users} title="Audience Alignment" />
      )}

      {/* AI: Channel Fit */}
      {aiResult ? (
        <Section icon={BarChart3} title="Channel Fit">
          <div className="space-y-2.5">
            {aiResult.channelFit.map((ch) => (
              <EnhancedBar key={ch.channel} label={ch.channel} value={ch.score} />
            ))}
          </div>
        </Section>
      ) : (
        <LockedSection icon={BarChart3} title="Channel Fit" />
      )}

      {/* AI: Recommendations */}
      {aiResult ? (
        <Section icon={Lightbulb} title="Recommendations">
          <div className="space-y-2">
            {aiResult.recommendations.map((rec, i) => (
              <div key={i} className="flex gap-2 text-xs text-venus-gray-600">
                <span className="text-venus-purple font-bold shrink-0">{i + 1}.</span>
                <span className="leading-relaxed">{rec}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <LockedSection icon={Lightbulb} title="Recommendations" />
      )}
    </div>
  );
}
