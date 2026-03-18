import type { SkillVariable } from '@/lib/types';

interface StarterSkill {
  name: string;
  description: string;
  instructions: string;
  variables: SkillVariable[];
  tool_scope: string[];
}

export const STARTER_SKILLS: StarterSkill[] = [
  {
    name: 'campaign-brief',
    description: 'Create a structured campaign brief. Triggers: "create a campaign brief", "write a brief", "brief for [campaign]".',
    instructions: `# Campaign Brief

## Workflow
1. Search the Spark for relevant context using \`semantic_search\` with queries about the brand, audience, and campaign objective.
2. Ask clarifying questions if {{campaign_objective}} or {{target_audience}} are unclear.
3. Build the brief using this structure:

### Brief Template
- **Campaign Name**: Based on {{brand_name}} and objective
- **Objective**: {{campaign_objective}}
- **Target Audience**: {{target_audience}} — include demographics, psychographics, and behavioral traits
- **Budget Range**: {{budget_range}}
- **Key Messages**: 3-5 core messages that resonate with the audience
- **Channels**: Recommended media channels with rationale
- **Timeline**: Phased rollout with key milestones
- **KPIs**: Measurable success metrics tied to the objective
- **Creative Direction**: Tone, visual style, and reference points

4. Output the completed brief to the editor using \`update_editor\` (append mode).
5. End with 2-3 next steps the user could take.`,
    variables: [
      { key: 'brand_name', label: 'Brand Name', default_value: '', description: 'The brand this campaign is for' },
      { key: 'campaign_objective', label: 'Campaign Objective', default_value: '', description: 'Primary goal of the campaign' },
      { key: 'target_audience', label: 'Target Audience', default_value: '', description: 'Who the campaign targets' },
      { key: 'budget_range', label: 'Budget Range', default_value: 'TBD', description: 'Approximate budget' },
    ],
    tool_scope: ['semantic_search', 'keyword_search', 'list_items', 'update_editor'],
  },
  {
    name: 'content-calendar',
    description: 'Create an editorial content calendar. Triggers: "create a content calendar", "plan content for [month]", "editorial calendar".',
    instructions: `# Content Calendar

## Workflow
1. Search the Spark for existing content themes and assets using \`semantic_search\`.
2. Determine the date range ({{date_range}}) and target channels ({{channels}}).
3. Build a markdown table calendar with columns: Date | Channel | Content Type | Topic/Theme | Status | Notes.
4. Consider:
   - Platform-specific posting cadence (e.g., LinkedIn 3-5x/week, Instagram daily)
   - {{primary_theme}} as the overarching narrative
   - Key dates, holidays, and industry events in the date range
   - Content mix: 60% educational, 20% promotional, 20% engagement
5. Output the calendar to the editor using \`update_editor\` (append mode).
6. Include a summary of themes and a recommended posting frequency per channel.`,
    variables: [
      { key: 'date_range', label: 'Date Range', default_value: 'Next 30 days', description: 'Time period for the calendar' },
      { key: 'channels', label: 'Channels', default_value: 'LinkedIn, Instagram, X', description: 'Target social/content channels' },
      { key: 'primary_theme', label: 'Primary Theme', default_value: '', description: 'Overarching content theme' },
    ],
    tool_scope: ['semantic_search', 'list_items', 'update_editor'],
  },
  {
    name: 'meeting-to-actions',
    description: 'Convert meeting notes into structured action items. Triggers: "convert meeting notes", "extract action items", "meeting notes to tasks".',
    instructions: `# Meeting Notes to Action Items

## Workflow
1. Read the user's pasted meeting notes carefully.
2. Extract every action item, decision, and follow-up mentioned.
3. For each action item, determine:
   - **Owner**: Who is responsible (name if mentioned, "TBD" if not)
   - **Deadline**: When it's due ({{meeting_date}} + reasonable offset if not explicit)
   - **Priority**: High / Medium / Low based on context
   - **Description**: Clear, actionable description
4. Format as a task list:
   \`\`\`
   ## Action Items — {{meeting_date}}
   **Attendees**: {{attendees}}

   ### High Priority
   - [ ] [Owner] Description — Due: [date]

   ### Medium Priority
   - [ ] [Owner] Description — Due: [date]

   ### Decisions Made
   - Decision 1
   - Decision 2

   ### Parking Lot
   - Items deferred to future discussion
   \`\`\`
5. Output to the editor using \`update_editor\` (append mode).`,
    variables: [
      { key: 'meeting_date', label: 'Meeting Date', default_value: 'Today', description: 'When the meeting occurred' },
      { key: 'attendees', label: 'Attendees', default_value: '', description: 'Who attended the meeting' },
    ],
    tool_scope: ['update_editor'],
  },
  {
    name: 'competitive-analysis',
    description: 'Build a competitive analysis framework. Triggers: "competitive analysis", "analyze competitors", "competitor comparison".',
    instructions: `# Competitive Analysis

## Workflow
1. Search the Spark for existing competitor research using \`semantic_search\` and \`keyword_search\`.
2. If web research is needed, use \`web_search\` to gather current competitor data, then \`scrape_url\` for deeper reads. Always call \`save_web_research\` to persist findings.
3. Build the analysis for {{brand_name}} vs {{competitors}}:

### Analysis Framework
- **Market Overview**: Industry context and trends
- **Competitor Profiles**: For each competitor — positioning, strengths, weaknesses, recent moves
- **SWOT Analysis**: For {{brand_name}} relative to the competitive set
- **Feature/Capability Comparison**: Table comparing key dimensions
- **Positioning Map**: Describe where each brand sits on key axes
- **Key Differentiators**: What sets {{brand_name}} apart
- **Opportunities & Threats**: Gaps to exploit and risks to watch
- **Strategic Recommendations**: 3-5 actionable recommendations

4. Output to the editor using \`update_editor\` (append mode).`,
    variables: [
      { key: 'brand_name', label: 'Brand Name', default_value: '', description: 'The brand being analyzed' },
      { key: 'competitors', label: 'Competitors', default_value: '', description: 'Comma-separated list of competitors' },
    ],
    tool_scope: ['semantic_search', 'keyword_search', 'web_search', 'scrape_url', 'save_web_research', 'update_editor'],
  },
  {
    name: 'social-copy',
    description: 'Generate platform-specific social media copy. Triggers: "write social media posts", "social copy", "posts for [platform]".',
    instructions: `# Social Media Copy

## Workflow
1. Search the Spark for relevant content and brand context using \`semantic_search\`.
2. Determine target platforms from {{platforms}}.
3. For each platform, generate copy that respects character limits:
   - **LinkedIn**: Max 3,000 characters. Professional tone. Include a hook in the first 2 lines.
   - **Instagram**: Max 2,200 characters. Visual-first language. Include hashtag suggestions.
   - **X (Twitter)**: Max 280 characters. Punchy and direct. Thread format for longer ideas.
   - **Facebook**: Max 500 characters recommended. Conversational and engaging.

4. Apply {{brand_voice}} to all copy.
5. Include for each post:
   - The copy text
   - Suggested hashtags: {{campaign_hashtags}} plus platform-relevant tags
   - CTA (Call to Action) with 2 variations
   - Best posting time recommendation
6. Output all variations to the editor using \`update_editor\` (append mode).`,
    variables: [
      { key: 'brand_voice', label: 'Brand Voice', default_value: 'Professional yet approachable', description: 'Tone and style for the copy' },
      { key: 'platforms', label: 'Platforms', default_value: 'LinkedIn, Instagram, X', description: 'Target social platforms' },
      { key: 'campaign_hashtags', label: 'Campaign Hashtags', default_value: '', description: 'Required hashtags for the campaign' },
    ],
    tool_scope: ['semantic_search', 'update_editor'],
  },
  {
    name: 'strategic-copy-editing',
    description: 'Review and elevate content for clarity, persuasion, and brand consistency. Triggers: "edit this copy", "improve this writing", "copy edit", "refine this content".',
    instructions: `# Strategic Copy Editing

## Workflow
1. Read the content provided (either selected text or full document).
2. Search the Spark for brand guidelines or style references using \`semantic_search\` if {{brand_voice}} or {{style_guide_notes}} are sparse.
3. Analyze the content across these dimensions:
   - **Clarity**: Is the message immediately understandable?
   - **Persuasion**: Does it motivate the reader to act?
   - **Structure**: Is the flow logical? Does it build?
   - **Tone**: Does it match {{brand_voice}}?
   - **Word Choice**: Are there weak verbs, jargon, or filler?
   - **Consistency**: Does it align with {{style_guide_notes}}?

4. Provide your edits:
   - If the user selected text: Use a \`\`\`proposal\`\`\` block with the improved version.
   - If working on the full document: Use \`update_editor\` in integrate mode with the complete revised version.
5. Explain your key changes and the reasoning behind them.`,
    variables: [
      { key: 'brand_voice', label: 'Brand Voice', default_value: '', description: 'Target tone and style' },
      { key: 'style_guide_notes', label: 'Style Guide Notes', default_value: '', description: 'Specific style rules to follow' },
    ],
    tool_scope: ['semantic_search', 'update_editor'],
  },
  {
    name: 'research-summary',
    description: 'Synthesize Spark items into a structured research summary. Triggers: "summarize my research", "synthesize these findings", "research digest", "what do we know about".',
    instructions: `# Research Summary

## Workflow
1. Use \`list_items\` to see everything in the Spark.
2. Use \`semantic_search\` with queries related to {{focus_area}} to find the most relevant items.
3. Cluster items by theme and analyze:
   - What are the dominant themes?
   - Where do sources agree or conflict?
   - What patterns emerge across different item types?
4. Build the summary:

### Summary Template
- **Focus Area**: {{focus_area}}
- **Items Analyzed**: Count and types
- **Key Findings**: 5-7 bullet points, each citing specific Spark items
- **Themes & Patterns**: Grouped insights with supporting evidence
- **Gaps**: What's missing? What questions remain unanswered?
- **Recommended Next Steps**: 3-5 actions to deepen the research

5. Tailor language for {{audience}}.
6. Output to the editor using \`update_editor\` (append mode).`,
    variables: [
      { key: 'focus_area', label: 'Focus Area', default_value: '', description: 'The topic or question to summarize research around' },
      { key: 'audience', label: 'Audience', default_value: 'Internal team', description: 'Who will read this summary' },
    ],
    tool_scope: ['semantic_search', 'keyword_search', 'list_items', 'update_editor'],
  },
  {
    name: 'project-plan',
    description: 'Create a phased project plan with milestones and tasks. Triggers: "create a project plan", "plan this project", "break this into phases", "project timeline".',
    instructions: `# Project Plan

## Workflow
1. Search the Spark for relevant context, existing research, and assets using \`semantic_search\` and \`list_items\`.
2. Define the project scope based on the user's request and {{project_name}}.
3. Build the plan:

### Plan Template
- **Project**: {{project_name}}
- **Timeline**: {{timeline}}
- **Team Size**: {{team_size}}

#### Phase Breakdown
For each phase:
| Phase | Duration | Milestones | Deliverables | Owner |
|-------|----------|------------|--------------|-------|
| Discovery | Week 1-2 | ... | ... | ... |
| Strategy | Week 3-4 | ... | ... | ... |
| Execution | Week 5-8 | ... | ... | ... |
| Launch | Week 9-10 | ... | ... | ... |

#### Task Checklist
- [ ] Task 1 — Phase 1, Owner TBD
- [ ] Task 2 — Phase 1, Owner TBD
...

#### Dependencies & Risks
- **Dependencies**: What must happen before what
- **Risks**: Potential blockers with mitigation strategies
- **Decision Points**: Where the team needs to align before proceeding

4. Output to the editor using \`update_editor\` (append mode).`,
    variables: [
      { key: 'project_name', label: 'Project Name', default_value: '', description: 'Name of the project' },
      { key: 'timeline', label: 'Timeline', default_value: '8-10 weeks', description: 'Expected project duration' },
      { key: 'team_size', label: 'Team Size', default_value: '3-5 people', description: 'Number of team members' },
    ],
    tool_scope: ['semantic_search', 'list_items', 'update_editor'],
  },
];
