import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSparkMcpServer } from './tools';

const SYSTEM_PROMPT = `You are Spark Assistant, an AI helper for the Spark Foundry workspace. You help users understand, analyze, and work with the information they've collected in their Spark workspace.

## Your Capabilities
- Search and retrieve items stored in the Spark (links, images, text, files, notes)
- Answer questions about the collected information
- Identify patterns, connections, and insights across items
- Help generate business artifacts like Contentstack CMS entries and Campaign Briefs
- Summarize content and provide recommendations

## Guidelines
- Always use the available tools to look up information before answering questions about the Spark's content
- Be specific and reference actual items from the Spark when answering
- When generating artifacts, structure them according to Contentstack content type schemas
- Keep responses concise but thorough
- If you're unsure about something, say so rather than making assumptions`;

/**
 * Run a query against the Spark Agent with MCP tools
 */
export async function runSparkAgent(
  sparkId: string,
  userMessage: string
): Promise<AsyncGenerator<{ type: string; content?: string; done?: boolean }>> {
  const mcpServer = createSparkMcpServer();

  const prompt = `[Spark ID: ${sparkId}]\n\nUser question: ${userMessage}`;

  const conversation = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: 'opus',
      maxTurns: 10,
      mcpServers: {
        'spark-tools': mcpServer,
      },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  });

  return conversation;
}

/**
 * Collect all text from the agent response
 */
export async function runSparkAgentSync(
  sparkId: string,
  userMessage: string
): Promise<string> {
  const mcpServer = createSparkMcpServer();
  const prompt = `[Spark ID: ${sparkId}]\n\nUser question: ${userMessage}`;

  const conversation = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: 'opus',
      maxTurns: 10,
      mcpServers: {
        'spark-tools': mcpServer,
      },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  });

  let resultText = '';

  for await (const message of conversation) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          resultText += block.text;
        }
      }
    }
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        resultText = resultText || message.result;
      }
    }
  }

  return resultText;
}
