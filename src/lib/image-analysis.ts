/**
 * Image analysis using Claude Vision.
 *
 * Sends an image to Claude and uses forced tool_choice to extract
 * structured data: OCR text, objects, scene description, image type,
 * and a natural-language description. The result is stored as item
 * metadata and fed into the RAG pipeline via buildItemText().
 */

import Anthropic from '@anthropic-ai/sdk';
import { addLogEntry } from './activity-logger';

const anthropic = new Anthropic();

export interface ImageAnalysisResult {
  ocr_text: string;
  objects: string[];
  scene_description: string;
  image_type: string;
  short_summary: string;
  full_description: string;
}

const IMAGE_ANALYSIS_TOOL: Anthropic.Messages.Tool = {
  name: 'image_analysis',
  description: 'Structured image analysis output',
  input_schema: {
    type: 'object' as const,
    properties: {
      ocr_text: {
        type: 'string',
        description: 'All visible text in the image (OCR). Empty string if none.',
      },
      objects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Notable objects, logos, icons, UI elements',
      },
      scene_description: {
        type: 'string',
        description: 'What the image depicts — layout, composition, context',
      },
      image_type: {
        type: 'string',
        enum: ['photo', 'screenshot', 'chart', 'diagram', 'illustration', 'document', 'logo', 'other'],
      },
      short_summary: {
        type: 'string',
        description: 'One-sentence summary of the image',
      },
      full_description: {
        type: 'string',
        description: 'Detailed 2-3 sentence description covering all visual content',
      },
    },
    required: ['ocr_text', 'objects', 'scene_description', 'image_type', 'short_summary', 'full_description'],
  },
};

/**
 * Analyze an image using Claude Vision and return structured metadata.
 * Returns null on any error — never blocks item creation.
 */
export async function analyzeImage(imageUrl: string): Promise<ImageAnalysisResult | null> {
  const correlationId = `img_analysis_${Date.now()}`;
  const start = Date.now();

  addLogEntry({
    service: 'anthropic',
    direction: 'request',
    level: 'info',
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    summary: `image analysis — ${imageUrl.split('/').pop()?.slice(0, 40) || 'image'}`,
    requestBody: { imageUrl: imageUrl.slice(0, 200) },
    correlationId,
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [IMAGE_ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: 'image_analysis' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            {
              type: 'text',
              text: 'Analyze this image. Extract all visible text (OCR), identify notable objects, describe the scene, classify the image type, and provide a summary.',
            },
          ],
        },
      ],
    });

    const duration = Date.now() - start;
    const toolBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolBlock) {
      addLogEntry({
        service: 'anthropic',
        direction: 'response',
        level: 'error',
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        summary: 'image analysis — no tool_use block returned',
        duration,
        correlationId,
      });
      return null;
    }

    const result = toolBlock.input as ImageAnalysisResult;

    addLogEntry({
      service: 'anthropic',
      direction: 'response',
      level: 'info',
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      summary: `image analysis — ${result.image_type}: ${result.short_summary.slice(0, 60)}`,
      statusCode: 200,
      duration,
      correlationId,
    });

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);

    addLogEntry({
      service: 'anthropic',
      direction: 'response',
      level: 'error',
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      summary: `image analysis — error`,
      error,
      duration,
      correlationId,
    });

    console.error('[image-analysis] Failed:', error);
    return null;
  }
}
