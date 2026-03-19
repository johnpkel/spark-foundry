import Anthropic from '@anthropic-ai/sdk';
import { addLogEntry } from '@/lib/activity-logger';
import {
  refreshGlobalData,
  enrichEditorContent,
  sampleAggregateAffinities,
  getData,
  isAvailable,
} from '@/lib/lytics/data-service';
import { getContentByUrl } from '@/lib/lytics/api';
import { getDimension, computeOpportunityScore } from '@/lib/lytics/types';
import type { FormattedTopic, FormattedAudience, AggregateAffinity, LyticsContentEntity } from '@/lib/lytics/types';

const anthropic = new Anthropic();
const MAX_TEXT_LENGTH = 4000;

// Only look up content entities for URLs on the Spark's primary domains.
function isIndexedUrl(url: string, primaryDomains: string[]): boolean {
  if (primaryDomains.length === 0) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return primaryDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`) || hostname === `www.${d}`);
  } catch {
    return false;
  }
}

// ─── Claude Tool: Content Quality Analysis ──────

const QUALITY_TOOL: Anthropic.Tool = {
  name: 'submit_content_analysis',
  description: 'Submit structured content quality analysis with scores, topics, quality metrics, channel fit.',
  input_schema: {
    type: 'object' as const,
    properties: {
      overallScore: { type: 'number', description: 'Overall content quality score 0-100' },
      summary: { type: 'string', description: '1-2 sentence assessment' },
      topics: {
        type: 'array', items: {
          type: 'object', properties: { name: { type: 'string' }, score: { type: 'number' } }, required: ['name', 'score'],
        },
      },
      contentQuality: {
        type: 'object', properties: {
          readability: { type: 'number' }, clarity: { type: 'number' },
          engagement: { type: 'number' }, seoReadiness: { type: 'number' },
        }, required: ['readability', 'clarity', 'engagement', 'seoReadiness'],
      },
      channelFit: {
        type: 'array', items: {
          type: 'object', properties: { channel: { type: 'string' }, score: { type: 'number' } }, required: ['channel', 'score'],
        },
      },
    },
    required: ['overallScore', 'summary', 'topics', 'contentQuality', 'channelFit'],
  },
};

// ─── Claude Tool: Strategic Analysis (Lytics-informed) ──

const STRATEGIC_TOOL: Anthropic.Tool = {
  name: 'submit_strategic_analysis',
  description: 'Submit strategic content analysis based on Lytics audience intelligence data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      contentComparison: { type: 'string', description: 'How the content aligns with Lytics audience data — what aligns, what is missing, what is unexpected' },
      recommendations: {
        type: 'object',
        properties: {
          contentUpdates: { type: 'array', items: { type: 'string' }, description: '3-5 specific content improvements' },
          campaignIdeas: { type: 'array', items: { type: 'string' }, description: '2-3 campaign concepts' },
          underservedAudiences: {
            type: 'array', items: {
              type: 'object', properties: {
                name: { type: 'string' }, size: { type: 'number' },
                gap: { type: 'string' }, suggestion: { type: 'string' },
              }, required: ['name', 'size', 'gap', 'suggestion'],
            },
          },
          contentGaps: {
            type: 'array', items: {
              type: 'object', properties: {
                topic: { type: 'string' }, userCount: { type: 'number' },
                docCount: { type: 'number' }, opportunity: { type: 'string' },
              }, required: ['topic', 'userCount', 'docCount', 'opportunity'],
            },
          },
        },
        required: ['contentUpdates', 'campaignIdeas', 'underservedAudiences', 'contentGaps'],
      },
    },
    required: ['contentComparison', 'recommendations'],
  },
};

// ─── Build Lytics context for Claude ────────────────

function buildLyticsContext(
  topics: FormattedTopic[],
  audiences: FormattedAudience[],
  affinities: AggregateAffinity[],
): string {
  const data = getData();

  const topicNames = new Set(topics.map((t) => t.name.toLowerCase()));
  const matchedOpportunity = data.opportunity
    .filter((o) => topicNames.has(o.topic.toLowerCase()))
    .slice(0, 10);

  const maxUsers = Math.max(...data.opportunity.map((t) => getDimension(t, 'User Count')), 1);
  const maxDocs = Math.max(...data.opportunity.map((t) => getDimension(t, 'Document Count')), 1);

  let ctx = 'LYTICS AUDIENCE INTELLIGENCE DATA:\n\n';

  ctx += '## Content Topics (from Lytics NLP)\n';
  for (const t of topics.slice(0, 10)) ctx += `- ${t.name}: ${t.score}% confidence\n`;

  ctx += '\n## Aligned Audiences\n';
  for (const a of audiences.slice(0, 10)) ctx += `- ${a.name}: ${a.alignment}% alignment, ${a.size.toLocaleString()} profiles\n`;

  if (matchedOpportunity.length > 0) {
    ctx += '\n## Topic Behavioral Data\n';
    for (const o of matchedOpportunity) {
      const users = getDimension(o, 'User Count');
      const docs = getDimension(o, 'Document Count');
      const engaged = Math.round(getDimension(o, 'deeply_engaged_users') * 100);
      const atRisk = Math.round(getDimension(o, 'at_risk_users') * 100);
      const recency = Math.round(getDimension(o, 'score_recency'));
      const intensity = Math.round(getDimension(o, 'score_intensity'));
      const propensity = Math.round(getDimension(o, 'score_propensity'));
      const oppScore = computeOpportunityScore(o, maxUsers, maxDocs);
      ctx += `- ${o.topic}: ${users} users, ${docs} docs, opportunity=${oppScore}%, deeply_engaged=${engaged}%, at_risk=${atRisk}%, recency=${recency}, intensity=${intensity}, propensity=${propensity}\n`;
    }
  }

  if (affinities.length > 0) {
    ctx += '\n## Aggregate Audience Affinities (what these audiences also care about)\n';
    for (const a of affinities) {
      ctx += `- ${a.segmentName}: ${a.topAffinities.slice(0, 5).map((t) => `${t.topic}(${t.score}%)`).join(', ')}\n`;
    }
  }

  return ctx;
}

// ─── SSE Route handler ──────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const { text, referencedItemTexts, sparkItemUrls, primaryDomains: rawDomains } = body as {
    text?: string;
    referencedItemTexts?: string[];
    sparkItemUrls?: string[];
    primaryDomains?: string[];
  };
  const primaryDomains = (rawDomains ?? []).map((d) => d.toLowerCase());

  if (!text && (!referencedItemTexts || referencedItemTexts.length === 0)) {
    return new Response(JSON.stringify({ error: 'text or referencedItemTexts is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parts = [text ?? '', ...(referencedItemTexts ?? [])].filter(Boolean);
  const combinedText = parts.join('\n\n---\n\n').slice(0, MAX_TEXT_LENGTH);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send initial event immediately to prevent Nginx proxy timeout
      send('step', { id: 'init', label: 'Starting analysis', status: 'active' });

      // Keepalive: send a comment every 15s to prevent proxy idle timeout
      const keepalive = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(': keepalive\n\n')); } catch { /* stream closed */ }
      }, 15000);

      try {
        let lyticsTopics: FormattedTopic[] = [];
        let lyticsAudiences: FormattedAudience[] = [];
        let aggregateAffinities: AggregateAffinity[] = [];
        let lyticsContentRecs: LyticsContentEntity[] = [];
        let matchedOpportunity: { topic: string; userCount: number; docCount: number; opportunityScore: number }[] = [];

        send('step', { id: 'init', label: 'Starting analysis', status: 'done' });

        if (await isAvailable()) {
          // ── Step 1: Refresh Lytics data + classify content ──
          send('step', { id: 'lytics-refresh', label: 'Refreshing Lytics segments & opportunity data', status: 'active' });
          send('step', { id: 'lytics-enrich', label: 'Classifying content topics via Lytics NLP', status: 'active' });

          const [, enrichResult] = await Promise.all([
            refreshGlobalData(),
            enrichEditorContent(combinedText),
          ]);

          lyticsTopics = enrichResult.topics;
          lyticsAudiences = enrichResult.audiences;

          send('step', { id: 'lytics-refresh', label: `Loaded ${getData().segments.length} segments, ${getData().opportunity.length} topics`, status: 'done' });
          send('step', { id: 'lytics-enrich', label: `Found ${lyticsTopics.length} topics, ${lyticsAudiences.length} audiences`, status: 'done' });

          // ── Step 2: Sample profiles + fetch content entities ──
          send('step', { id: 'lytics-profiles', label: 'Sampling audience profile affinities', status: 'active' });

          const indexedUrls = (sparkItemUrls ?? []).filter((url) => isIndexedUrl(url, primaryDomains)).slice(0, 5);
          if (indexedUrls.length > 0) {
            send('step', { id: 'lytics-content', label: `Looking up ${indexedUrls.length} content entities`, status: 'active' });
          }

          const contentEntityPromises = indexedUrls.map((url) => getContentByUrl(url));
          const [affinities, ...contentEntities] = await Promise.all([
            sampleAggregateAffinities(5),
            ...contentEntityPromises,
          ]);

          aggregateAffinities = affinities;
          lyticsContentRecs = contentEntities.filter((e): e is LyticsContentEntity => e !== null);

          send('step', { id: 'lytics-profiles', label: `Sampled ${affinities.length} audience profiles`, status: 'done' });
          if (indexedUrls.length > 0) {
            send('step', { id: 'lytics-content', label: `Found ${lyticsContentRecs.length} indexed content matches`, status: 'done' });
          }

          // ── Step 3: Compute opportunity ──
          send('step', { id: 'opportunity', label: 'Computing content opportunity scores', status: 'active' });

          const data = getData();
          const topicNames = new Set(lyticsTopics.map((t) => t.name.toLowerCase()));
          const maxUsers = Math.max(...data.opportunity.map((t) => getDimension(t, 'User Count')), 1);
          const maxDocs = Math.max(...data.opportunity.map((t) => getDimension(t, 'Document Count')), 1);
          matchedOpportunity = data.opportunity
            .filter((o) => topicNames.has(o.topic.toLowerCase()) && getDimension(o, 'User Count') > 0)
            .map((o) => ({
              topic: o.topic,
              userCount: getDimension(o, 'User Count'),
              docCount: getDimension(o, 'Document Count'),
              opportunityScore: computeOpportunityScore(o, maxUsers, maxDocs),
            }))
            .sort((a, b) => b.opportunityScore - a.opportunityScore)
            .slice(0, 20);

          send('step', { id: 'opportunity', label: `Matched ${matchedOpportunity.length} opportunity topics`, status: 'done' });
        }

        // ── Step 4: Claude AI Analysis ──
        const hasLyticsData = lyticsTopics.length > 0 || lyticsAudiences.length > 0;
        send('step', {
          id: 'ai-analysis',
          label: hasLyticsData
            ? 'Running AI analysis with Lytics audience context'
            : 'Running AI content quality analysis',
          status: 'active',
        });

        const lyticsContext = hasLyticsData
          ? buildLyticsContext(lyticsTopics, lyticsAudiences, aggregateAffinities)
          : '';

        const systemPrompt = `You are a senior content strategist and digital marketing analyst. Analyze the provided content and produce a structured quality assessment.

Guidelines:
- Read the actual content carefully. Identify real topics, themes, and audiences — don't fabricate generic ones.
- Be honest with scores. Not everything deserves 85+. Short or thin content should score lower.
- For channel fit: assess how well the content format/style suits each channel (Blog, Email, Social, Web Page, Newsletter).
${hasLyticsData ? `
You also have access to real Lytics audience intelligence data. Use it to provide grounded, data-driven strategic analysis.

${lyticsContext}

You MUST call BOTH tools:
1. submit_content_analysis — quality scoring and channel fit
2. submit_strategic_analysis — Lytics-informed strategic recommendations

For strategic analysis:
- COMPARE: How does this content align with the Lytics audience data? What topics are well-covered? What's missing?
- RECOMMEND: Content updates, campaign concepts leveraging behavioral data, underserved audiences, content gaps where user interest outpaces content.
- Use real audience names and sizes from the data above.
` : `
You MUST call the submit_content_analysis tool with your analysis.`}`;

        const tools = hasLyticsData ? [QUALITY_TOOL, STRATEGIC_TOOL] : [QUALITY_TOOL];

        const start = Date.now();
        addLogEntry({
          service: 'anthropic',
          direction: 'request',
          level: 'info',
          summary: `lytics/analyze — ${combinedText.length} chars, lytics=${hasLyticsData}`,
          requestBody: { model: 'claude-sonnet-4-6', chars: combinedText.length, hasLytics: hasLyticsData },
        });

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages: [{ role: 'user', content: `Analyze this content:\n\n${combinedText}` }],
        });

        addLogEntry({
          service: 'anthropic',
          direction: 'response',
          level: 'info',
          summary: `lytics/analyze — done (in:${response.usage.input_tokens} out:${response.usage.output_tokens})`,
          duration: Date.now() - start,
        });

        send('step', {
          id: 'ai-analysis',
          label: `AI analysis complete (${Math.round((Date.now() - start) / 1000)}s)`,
          status: 'done',
        });

        // Extract tool call results
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        const qualityBlock = toolBlocks.find((b) => b.name === 'submit_content_analysis');
        const strategicBlock = toolBlocks.find((b) => b.name === 'submit_strategic_analysis');

        const qualityAnalysis = (qualityBlock?.input as Record<string, unknown>) ?? {
          overallScore: 0, summary: 'Analysis unavailable', topics: [], contentQuality: { readability: 0, clarity: 0, engagement: 0, seoReadiness: 0 }, channelFit: [],
        };
        const strategicAnalysis = (strategicBlock?.input as Record<string, unknown>) ?? {
          contentComparison: '', recommendations: { contentUpdates: [], campaignIdeas: [], underservedAudiences: [], contentGaps: [] },
        };

        // ── Final result ──
        send('result', {
          lytics: {
            topics: lyticsTopics,
            audiences: lyticsAudiences,
            opportunity: matchedOpportunity,
            aggregateAffinities,
            lyticsContentRecs: lyticsContentRecs.map((e) => ({ url: e.url, title: e.title, lytics: e.lytics })),
          },
          ai: {
            contentComparison: (strategicAnalysis as Record<string, unknown>).contentComparison ?? '',
            qualityAnalysis,
            recommendations: (strategicAnalysis as Record<string, unknown>).recommendations ?? {
              contentUpdates: [], campaignIdeas: [], underservedAudiences: [], contentGaps: [],
            },
          },
          relatedSparkItems: [],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[lytics/analyze]', message);
        addLogEntry({ service: 'anthropic', direction: 'response', level: 'error', summary: `lytics/analyze — ${message}` });
        send('error', { error: message });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
