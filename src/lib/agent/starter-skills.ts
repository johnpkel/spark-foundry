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
  {
    name: 'content-scoring-analytics',
    description: 'Understand and discuss Content Scoring & Analytics data. Triggers: "what does my score mean", "explain my content scores", "analyze my scoring data", "how is my content performing", "content opportunity", "audience alignment", "content quality scores", questions about topics/audiences/opportunity/channel fit/readability/SEO scores.',
    instructions: `# Content Scoring & Analytics

You have access to the same scoring and analytics data the user sees in the Content Scoring panel. This skill gives you full context on every metric, score, and data source so you can discuss, interpret, and advise on scoring data with complete fidelity.

## Data Access

Use the \`lytics_insights\` tool to retrieve live data. There are four query types:

### 1. \`segments\` — Audience List
Returns all Lytics audience segments with their sizes.
- **name**: Segment display name
- **slug**: URL-safe identifier
- **size**: Number of real user profiles in the segment
- **description**: What defines this audience
- **kind**: Segment type (e.g., "audience", "behavioral")

### 2. \`opportunity\` — Topic Landscape
Returns topics with behavioral engagement scores. This is the richest dataset.
- **topic**: The content topic name
- **userCount**: Number of unique users with behavioral affinity for this topic
- **docCount**: Number of published content pieces covering this topic
- **opportunityScore**: Computed score (0-100) — see formula below
- **deeplyEngaged**: Percentage of users deeply engaged with this topic (0-100)
- **atRisk**: Percentage of users at risk of disengaging from this topic (0-100)
- **scoreRecency**: How recently users engaged with this topic (0-100, higher = more recent)
- **scoreIntensity**: How intensely users engage with this topic (0-100, higher = more intense)

### 3. \`content_alignment\` — Classify Text
Pass \`text\` to classify content through Lytics NLP and find matching audiences.
Returns:
- **topics**: Content topics with confidence scores (0-100). Extracted by Lytics NLP pipeline (Diffbot + Google NLP + TextRazor + sentiment analysis).
- **inferredTopics**: Secondary topic classifications with lower certainty. May represent tangential themes.
- **audiences**: Segments whose behavioral topic profile matches the content.
  - **name**: Segment name
  - **alignment**: Topic overlap percentage (0-100). Computed via cosine similarity between the content's topic vector and the segment's aggregate topic affinities.
  - **size**: Real profile count in the segment

### 4. \`profile_affinities\` — Cached Audience Topic Interests
Returns the current content's cached topic and audience data from the most recent enrichment.

## Score Definitions & Formulas

### Opportunity Score (from Lytics)
\`\`\`
opportunityScore = (userCount / maxUserCount) × (1 - docCount / maxDocCount) × 100
\`\`\`
- **What it means**: High user interest + low content coverage = high opportunity. Topics where many users are interested but few published docs exist represent content gaps worth filling.
- **Interpretation**: 80-100% = major untapped opportunity; 50-79% = moderate opportunity; <50% = already well-covered or low interest.

### Behavioral Dimensions (from Lytics)
These come from Lytics' behavioral scoring engine applied to each topic:
- **scoreRecency** (0-100): How recently users engaged with this topic. Higher = engagement is current and active. Low recency on a high-user topic suggests fading interest.
- **scoreIntensity** (0-100): Depth of engagement — frequency and duration of interactions. Higher = users spend significant time with this topic, not just passing interest.
- **scorePropensity** (0-100): Likelihood of future engagement based on behavioral patterns. High propensity = users are trending toward more engagement.
- **deeplyEngaged** (0-100%): Proportion of the topic's audience that shows sustained, high-frequency engagement. These are your core readers.
- **atRisk** (0-100%): Proportion showing declining engagement signals. High at-risk on a large audience = urgent content refresh needed.

### Topic Confidence (from Lytics NLP)
- Score 0-100 representing classification confidence from Lytics' content enrichment pipeline.
- **80-100%**: Content strongly signals this topic — it will drive audience alignment.
- **50-79%**: Moderate signal — topic is present but not dominant.
- **<50%**: Weak signal — tangential mention or inferred association.
- Inferred topics are secondary classifications with lower certainty.

### Audience Alignment (from Lytics)
\`\`\`
alignment = cosineSimilarity(contentTopicVector, segmentTopicAffinities) × 100
\`\`\`
- **What it means**: How much the content's detected topics overlap with what this audience segment actually engages with behaviorally.
- **80-100%**: Strong match — this audience actively consumes content on these topics.
- **60-79%**: Moderate match — partial topic overlap.
- **<60%**: Weak match — the audience's interests diverge from this content.

### Content Quality Scores (from AI Analysis)
These are generated by Claude analyzing the editor content. Each is 0-100:
- **Readability**: Sentence length, vocabulary complexity, paragraph structure, plain language usage. Scores above 70 = accessible to general business audience. Below 50 = overly complex or jargon-heavy.
- **Clarity**: Logical flow between paragraphs, specificity of claims, absence of ambiguity, ability to extract the main point quickly.
- **Engagement**: Opening hooks, narrative structure, actionable takeaways, formatting variety (lists, headers, examples), whether content rewards the reader's time.
- **SEO Readiness**: Keyword presence and density, heading hierarchy (H1→H2→H3), meta-description-friendly opening, internal/external linking opportunities, content depth.
- **Overall Score**: Weighted composite of all quality dimensions.

### Channel Fit (from AI Analysis)
How well the content's format and style suits each distribution channel (0-100):
- **Blog**: Favors 800-2000 word long-form with headers, images, and depth.
- **Email**: Favors concise, scannable content with a clear CTA.
- **Social**: Favors punchy, shareable snippets with hooks.
- **Web Page**: Favors structured, scannable content with navigation and CTAs.
- **Newsletter**: Favors curated, multi-topic formats with brief summaries.

### Quick Stats (client-side, always available)
- **Word Count**: Total words in the editor.
- **Sentence Count**: Number of sentences detected.
- **Readability Estimate**: Based on average words per sentence. ~12 words/sentence = 100. Shorter = more readable.
- **Structure Score**: Rewards length, paragraphs, headings, lists. 100 = well-structured long-form.

## Full Analysis Pipeline

When the user clicks "Run full analysis" in the ScorePanel, this pipeline executes:

1. **Lytics Refresh**: Fetch segments + opportunity data from Lytics CDP
2. **Content Enrichment**: Classify editor text through Lytics NLP → topics + audience alignment
3. **Profile Sampling**: Sample aggregate topic affinities from top aligned audiences
4. **Content Entity Lookup**: Find matching published content on primary domains indexed by Lytics
5. **Opportunity Computation**: Match content topics against opportunity landscape, compute scores
6. **AI Quality Analysis**: Claude analyzes content → overall score, readability, clarity, engagement, SEO, channel fit
7. **AI Strategic Analysis**: Claude compares content against Lytics audience data → gap analysis, content recommendations, campaign ideas, underserved audiences, content gaps

The result includes:
- **lytics.topics**: Detected content topics with confidence
- **lytics.audiences**: Aligned audience segments with sizes
- **lytics.opportunity**: Matched opportunity topics with scores
- **lytics.aggregateAffinities**: What each top audience also cares about
- **lytics.lyticsContentRecs**: Published pages from the user's domain that Lytics matched to similar topics
- **ai.qualityAnalysis**: Content quality scores (readability, clarity, engagement, SEO, overall, channel fit, summary)
- **ai.contentComparison**: Gap analysis — how content aligns with audience data, what's missing, what's unexpected
- **ai.recommendations.contentUpdates**: 3-5 specific content improvements
- **ai.recommendations.campaignIdeas**: 2-3 campaign concepts leveraging behavioral data
- **ai.recommendations.underservedAudiences**: Audiences the content could be adapted for (name, size, gap, suggestion)
- **ai.recommendations.contentGaps**: Topics where user interest outpaces available content (topic, userCount, docCount, opportunity description)

## Color Scale (used in UI)
Scores map to these quality tiers:
- **80-100**: Green — strong/excellent
- **60-79**: Yellow — good/moderate
- **40-59**: Purple — needs improvement
- **0-39**: Red — weak/poor

## How to Use This Data

When discussing scoring data:
1. Always pull live data with \`lytics_insights\` rather than guessing. Use \`content_alignment\` with the editor text to get current topic/audience data.
2. Interpret scores in context — a 65% opportunity score means something different for a niche topic vs. a broad one.
3. Cross-reference: topics × opportunity × audiences tells the full story. A high-confidence topic with high opportunity and large aligned audience = priority content.
4. When Lytics is not connected, you can still discuss the AI quality scores (readability, clarity, engagement, SEO, channel fit) and quick stats. Note this limitation to the user.
5. Reference the formulas when explaining scores so the user understands the underlying mechanics.
6. When asked about "what to write about" or "content gaps", use the opportunity data — topics with high userCount but low docCount.
7. When asked about "who is this for" or "audience", use content_alignment to show which segments match and why.`,
    variables: [],
    tool_scope: ['lytics_insights', 'semantic_search'],
  },
];
