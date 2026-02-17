import { NextRequest, NextResponse } from 'next/server';
import { runSparkAgentSync } from '@/lib/agent/agent';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ArtifactType } from '@/lib/types';

const GENERATION_PROMPTS: Record<ArtifactType, string> = {
  cms_entry: `Based on all the items in this Spark, generate a Contentstack CMS webpage content entry.

First, use the list_spark_items tool to get all items in the Spark, then generate the content.

Return your response as a JSON object with this exact structure:
{
  "content_type": "webpage",
  "fields": {
    "title": "Page title",
    "url": "/suggested-url-slug",
    "body": "Full HTML body content using the collected information. Make it well-structured with headings, paragraphs, and lists as appropriate.",
    "seo_title": "SEO-optimized title (50-60 chars)",
    "seo_description": "SEO meta description (150-160 chars)",
    "seo_keywords": ["keyword1", "keyword2", "keyword3"]
  }
}

Make the content professional, engaging, and based on the actual information stored in the Spark. Do not make up information not present in the Spark items.`,

  campaign_brief: `Based on all the items in this Spark, generate a comprehensive Campaign Brief.

First, use the list_spark_items tool to get all items in the Spark, then generate the brief.

Return your response as a JSON object with this exact structure:
{
  "campaign_name": "Campaign name",
  "objective": "Clear campaign objective",
  "target_audience": "Detailed target audience description",
  "key_messages": ["Message 1", "Message 2", "Message 3"],
  "channels": ["Channel 1", "Channel 2"],
  "timeline": "Proposed timeline",
  "budget_notes": "Budget considerations",
  "kpis": ["KPI 1", "KPI 2", "KPI 3"],
  "creative_direction": "Creative direction and tone",
  "brand_guidelines": "Key brand guidelines to follow"
}

Base everything on the actual information stored in the Spark items.`,

  custom: `Based on all the items in this Spark, generate a business document.

First, use the list_spark_items tool to get all items in the Spark, then generate the document based on the user's instructions.

Return your response as a JSON object with relevant fields based on the user's request.`,
};

// POST /api/generate - Generate a business artifact
export async function POST(request: NextRequest) {
  const { spark_id, type, instructions } = await request.json();

  if (!spark_id || !type) {
    return NextResponse.json(
      { error: 'spark_id and type are required' },
      { status: 400 }
    );
  }

  const validTypes: ArtifactType[] = ['cms_entry', 'campaign_brief', 'custom'];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    let prompt = GENERATION_PROMPTS[type as ArtifactType];
    if (instructions) {
      prompt += `\n\nAdditional instructions from the user: ${instructions}`;
    }

    const response = await runSparkAgentSync(spark_id, prompt);

    // Try to parse the JSON from the response
    let artifactContent: Record<string, unknown>;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1]?.trim() || response;
      artifactContent = JSON.parse(jsonStr);
    } catch {
      // If we can't parse JSON, store the raw response
      artifactContent = { raw_content: response };
    }

    // Determine title
    const title =
      (artifactContent.campaign_name as string) ||
      (artifactContent.fields as Record<string, unknown>)?.title as string ||
      `Generated ${type.replace('_', ' ')}`;

    // Save the artifact to the database
    const { data, error } = await supabaseAdmin
      .from('generated_artifacts')
      .insert({
        spark_id,
        type,
        title,
        content: artifactContent,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
