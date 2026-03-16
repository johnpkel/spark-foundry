/**
 * ReAct loop engine — structured Thought → Action → Observation cycle.
 *
 * Provides:
 * - computeTurnBudget: adaptive turn budget based on message complexity
 * - ThoughtStreamParser: state machine for routing <thought> tags to SSE events
 * - AGENTIC_SYSTEM_PROMPT: appended for multi-step workflows
 */

// ─── Turn Budget ──────────────────────────────────

const QA_KEYWORDS = [
  'what', 'who', 'when', 'where', 'which', 'how many',
  'is it', 'does it', 'define', 'explain',
];
const MULTI_STEP_KEYWORDS = [
  'create and publish', 'find and', 'then', 'step by step', 'after that',
  'compare', 'classify then', 'take the', 'workflow', 'pipeline',
  'draft and', 'search and create', 'multi-step',
];

export function computeTurnBudget(message: string): number {
  const lower = message.toLowerCase();

  // Multi-step workflows
  if (MULTI_STEP_KEYWORDS.some(kw => lower.includes(kw))) return 20;

  // Simple Q&A
  if (lower.length < 80 && QA_KEYWORDS.some(kw => lower.startsWith(kw))) return 4;

  // Single agentic task (create, update, publish, search+analyze, etc.)
  return 12;
}

// ─── Thought Stream Parser ──────────────────────

const OPEN_TAG = '<thought>';
const CLOSE_TAG = '</thought>';

/**
 * State machine that splits streaming text into thought and text segments.
 * Routes <thought>...</thought> content to onThought, everything else to onText.
 * Handles partial tags split across streaming chunks.
 */
export class ThoughtStreamParser {
  private buffer = '';
  private inThought = false;

  onThought: (text: string) => void = () => {};
  onText: (text: string) => void = () => {};

  feed(chunk: string): void {
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (this.inThought) {
        const closeIdx = this.buffer.indexOf(CLOSE_TAG);
        if (closeIdx === -1) {
          // Check for partial closing tag at the end
          for (let i = 1; i < CLOSE_TAG.length; i++) {
            if (this.buffer.endsWith(CLOSE_TAG.slice(0, i))) return; // hold buffer
          }
          this.onThought(this.buffer);
          this.buffer = '';
          return;
        }
        if (closeIdx > 0) this.onThought(this.buffer.slice(0, closeIdx));
        this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length);
        this.inThought = false;
      } else {
        const openIdx = this.buffer.indexOf(OPEN_TAG);
        if (openIdx === -1) {
          // Check for partial opening tag at the end
          for (let i = 1; i < OPEN_TAG.length; i++) {
            if (this.buffer.endsWith(OPEN_TAG.slice(0, i))) return; // hold buffer
          }
          this.onText(this.buffer);
          this.buffer = '';
          return;
        }
        if (openIdx > 0) this.onText(this.buffer.slice(0, openIdx));
        this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length);
        this.inThought = true;
      }
    }
  }

  /** Flush any remaining buffer content. */
  flush(): void {
    if (this.buffer.length > 0) {
      if (this.inThought) {
        this.onThought(this.buffer);
      } else {
        this.onText(this.buffer);
      }
      this.buffer = '';
    }
  }
}

// ─── Agentic System Prompt ───────────────────────

export const AGENTIC_SYSTEM_PROMPT = `

## Agentic Mode
When performing multi-step tasks:
1. Wrap reasoning in <thought>...</thought> before acting
2. Act deliberately — prefer sequential precision over parallel guessing
3. Reflect in <thought> after each tool result
4. For write operations (creating/updating CMS entries), present a complete preview first
5. Always get the content type schema before creating entries — never guess field structures
6. Summarize what was accomplished when done, with links to created/modified items
Do NOT use <thought> for simple Q&A.

## Anti-Placeholder Rule
DO NOT create placeholder or minimal entries. Populate all required fields with real, meaningful content derived from Spark items and context. Every field must contain substantive content.
`;

export const CMS_SYSTEM_PROMPT = `

## Contentstack Management
When working with Contentstack:
- Always use cs_get_content_type_schema first to understand the field structure
- Use the schema to construct properly-formed entry_data objects
- Never guess field UIDs — always derive them from the schema
- For JSON RTE fields, use the proper children/type/uid structure
- Include all required fields; populate optional fields when you have relevant content
`;
