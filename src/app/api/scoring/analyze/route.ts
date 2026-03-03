import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { addLogEntry } from '@/lib/activity-logger';

const anthropic = new Anthropic();

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'submit_content_analysis',
  description:
    'Submit a structured content analysis with scores, topics, audiences, quality metrics, channel fit, and recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      overallScore: {
        type: 'number',
        description: 'Overall content quality score from 0-100',
      },
      summary: {
        type: 'string',
        description: '1-2 sentence assessment of the content',
      },
      topics: {
        type: 'array',
        description: '5-8 detected topics with relevance scores',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            score: { type: 'number', description: '0-100 relevance score' },
          },
          required: ['name', 'score'],
        },
      },
      audiences: {
        type: 'array',
        description: '4-6 audience segments',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            alignment: {
              type: 'number',
              description: '0-100 alignment score',
            },
            size: {
              type: 'string',
              description: 'Estimated audience size label, e.g. "~2.4M"',
            },
          },
          required: ['name', 'alignment', 'size'],
        },
      },
      contentQuality: {
        type: 'object',
        description: 'Quality metrics, each 0-100',
        properties: {
          readability: { type: 'number' },
          clarity: { type: 'number' },
          engagement: { type: 'number' },
          seoReadiness: { type: 'number' },
        },
        required: ['readability', 'clarity', 'engagement', 'seoReadiness'],
      },
      channelFit: {
        type: 'array',
        description: '5 channels with fit scores',
        items: {
          type: 'object',
          properties: {
            channel: { type: 'string' },
            score: { type: 'number', description: '0-100 fit score' },
          },
          required: ['channel', 'score'],
        },
      },
      recommendations: {
        type: 'array',
        description: '3-5 actionable content improvement suggestions',
        items: { type: 'string' },
      },
    },
    required: [
      'overallScore',
      'summary',
      'topics',
      'audiences',
      'contentQuality',
      'channelFit',
      'recommendations',
    ],
  },
};

const SYSTEM_PROMPT = `You are a senior content strategist and digital marketing analyst. Analyze the provided content and produce a structured quality assessment.

Guidelines:
- Read the actual content carefully. Identify real topics, themes, and audiences — don't fabricate generic ones.
- Be honest with scores. Not everything deserves 85+. Short or thin content should score lower. Excellent, well-structured long-form content can score high.
- For topics: extract the actual subjects discussed, not generic marketing terms.
- For audiences: identify who would genuinely find this content relevant based on what it says.
- For channel fit: assess how well the content format/style suits each channel (Blog, Email, Social, Web Page, Newsletter).
- For recommendations: give specific, actionable suggestions based on what the content is actually missing or could improve.

You MUST call the submit_content_analysis tool with your analysis.`;

export async function POST(request: NextRequest) {
  try {
    const { text, referencedItemTexts } = (await request.json()) as {
      text?: string;
      referencedItemTexts?: string[];
    };

    if (!text && (!referencedItemTexts || referencedItemTexts.length === 0)) {
      return NextResponse.json(
        { error: 'text or referencedItemTexts required' },
        { status: 400 }
      );
    }

    // Combine and truncate to 6000 chars
    let combined = text || '';
    if (referencedItemTexts && referencedItemTexts.length > 0) {
      combined +=
        '\n\n--- Referenced Items ---\n' + referencedItemTexts.join('\n\n');
    }
    combined = combined.slice(0, 6000);

    const start = Date.now();
    addLogEntry({
      service: 'anthropic',
      direction: 'request',
      level: 'info',
      summary: `scoring/analyze — ${combined.length} chars`,
      requestBody: { model: 'claude-sonnet-4-6', chars: combined.length },
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_content_analysis' },
      messages: [
        {
          role: 'user',
          content: `Analyze this content:\n\n${combined}`,
        },
      ],
    });

    addLogEntry({
      service: 'anthropic',
      direction: 'response',
      level: 'info',
      summary: `scoring/analyze — done (in:${response.usage.input_tokens} out:${response.usage.output_tokens})`,
      duration: Date.now() - start,
      responseBody: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });

    // Extract the tool call input — guaranteed because of tool_choice
    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (!toolBlock) {
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 500 }
      );
    }

    return NextResponse.json(toolBlock.input);
  } catch (err) {
    console.error('[scoring/analyze] Error:', err);
    addLogEntry({
      service: 'anthropic',
      direction: 'response',
      level: 'error',
      summary: `scoring/analyze — ${err instanceof Error ? err.message : 'unknown error'}`,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
