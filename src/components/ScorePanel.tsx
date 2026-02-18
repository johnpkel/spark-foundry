'use client';

import {
  Target,
  Compass,
  Users,
  Shield,
  FileStack,
  Image,
  Check,
  AlertTriangle,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────── */

function scoreColor(pct: number) {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function badgeColor(pct: number) {
  if (pct >= 80) return 'bg-green-100 text-green-700';
  if (pct >= 60) return 'bg-yellow-100 text-yellow-700';
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
  icon: React.ElementType;
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

/* ── mock data ───────────────────────────────── */

const audiences = [
  { name: 'Enterprise Buyers', match: 92 },
  { name: 'Marketing Leaders', match: 84 },
  { name: 'Developer Advocates', match: 67 },
  { name: 'Small Business Owners', match: 45 },
];

const brandChecks = [
  { label: 'Tone of voice', pass: true },
  { label: 'Visual guidelines', pass: true },
  { label: 'Terminology glossary', pass: false },
  { label: 'Accessibility standards', pass: true },
];

const similarEntries = [
  { title: 'Q3 Campaign Brief', match: 88 },
  { title: 'Product Launch One-Pager', match: 74 },
  { title: 'Partner Co-Marketing Plan', match: 61 },
];

const recommendedAssets = [
  { title: 'Hero Banner v2', uses: 34 },
  { title: 'Product Screenshot Set', uses: 21 },
  { title: 'Customer Testimonial Clip', uses: 18 },
];

/* ── component ───────────────────────────────── */

export default function ScorePanel() {
  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold text-venus-gray-700 mb-5">Content Scoring</h3>

      {/* 1. Resonance */}
      <Section icon={Target} title="Resonance">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xl font-bold text-venus-gray-700">78</span>
          <span className="text-xs text-venus-gray-400">/100</span>
        </div>
        <ScoreBar value={78} />
        <p className="text-xs text-venus-gray-500 mt-2">
          Good emotional engagement. Strengthen the opening hook for higher impact.
        </p>
      </Section>

      {/* 2. Relevance */}
      <Section icon={Compass} title="Relevance">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xl font-bold text-venus-gray-700">85</span>
          <span className="text-xs text-venus-gray-400">/100</span>
        </div>
        <ScoreBar value={85} />
        <p className="text-xs text-venus-gray-500 mt-2">
          Strong topic alignment with current market trends and audience interests.
        </p>
      </Section>

      {/* 3. Recommended Audiences */}
      <Section icon={Users} title="Recommended Audiences">
        <div className="space-y-2">
          {audiences.map((a) => (
            <div key={a.name} className="flex items-center justify-between">
              <span className="text-sm text-venus-gray-600">{a.name}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor(a.match)}`}>
                {a.match}%
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Brand Kit Alignment */}
      <Section icon={Shield} title="Brand Kit Alignment">
        <div className="space-y-2">
          {brandChecks.map((c) => (
            <div key={c.label} className="flex items-center gap-2">
              {c.pass ? (
                <Check size={14} className="text-green-500 shrink-0" />
              ) : (
                <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
              )}
              <span className="text-sm text-venus-gray-600">{c.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. Similar Entries */}
      <Section icon={FileStack} title="Similar Entries">
        <div className="space-y-2">
          {similarEntries.map((e) => (
            <div
              key={e.title}
              className="flex items-center justify-between rounded-lg border border-venus-gray-200 px-3 py-2"
            >
              <span className="text-sm text-venus-gray-600 truncate">{e.title}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${badgeColor(e.match)}`}>
                {e.match}%
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 6. Recommended Assets */}
      <Section icon={Image} title="Recommended Assets">
        <div className="space-y-2">
          {recommendedAssets.map((a) => (
            <div
              key={a.title}
              className="flex items-center justify-between rounded-lg border border-venus-gray-200 px-3 py-2"
            >
              <span className="text-sm text-venus-gray-600 truncate">{a.title}</span>
              <span className="text-xs text-venus-gray-400 shrink-0 ml-2">
                {a.uses} uses
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
