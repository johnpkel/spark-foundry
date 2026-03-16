---
name: update-docs
description: Update the Fumadocs documentation when meaningful changes have been made to the app
user_invocable: true
---

# Update Documentation Skill

When invoked, analyze recent changes to the codebase and update the Fumadocs documentation in `content/docs/` to reflect the current state of the application.

## Process

1. **Identify what changed** by examining:
   - `git diff main` (if on a feature branch) or `git log --oneline -20` for recent commits
   - `git diff HEAD~5` to see recent code changes
   - Any new/modified files in `src/app/api/`, `src/components/`, `src/lib/`

2. **Determine which docs need updates** based on what changed:

   ### For Developers section (`content/docs/for-developers/`)
   | Change Type | Doc to Update |
   |------------|---------------|
   | New/modified API routes | `architecture.mdx` (request flows) |
   | Database schema changes, new types in `types.ts` | `data-model.mdx` |
   | Changes to embedding, vector search, or retrieval | `rag-pipeline.mdx` |
   | New tools, agent changes, chat route changes | `chat-agent.mdx` |
   | New integrations or OAuth flows | `integrations.mdx` |
   | Changes to SSE patterns or real-time features | `sse-streaming.mdx` |
   | Theme changes, CSS custom properties | `theming.mdx` |
   | New directories, significant restructuring | `index.mdx` (directory structure) |

   ### For Business Users section (`content/docs/for-business-users/`)
   | Change Type | Doc to Update |
   |------------|---------------|
   | New item types or collection features | `sparks-and-items.mdx` |
   | Chat features, new tools, prompt changes | `ai-chat.mdx` |
   | New integration connections | `integrations.mdx` |
   | New workflows or UI changes | `getting-started.mdx`, `use-cases.mdx` |
   | Data model changes affecting user mental model | `data-model-thinking.mdx` |
   | New competitor features or market changes | `comparison.mdx` |

3. **Update the relevant docs** by editing only the affected sections:
   - Keep MDX frontmatter (title, description) accurate
   - Update code snippets if the actual code has changed
   - Add new sections for new features
   - Remove sections for removed features
   - Keep tables, diagrams, and formatting consistent with existing style
   - For developer docs: include actual code patterns from the codebase
   - For business docs: explain changes in plain language with practical examples

4. **Update the index page** (`content/docs/index.mdx`) if there are major new capabilities

5. **Update sidebar ordering** in `meta.json` files if new pages are added

6. **Verify the build** — run `npm run build` and check that all doc pages compile without errors

7. **Summarize changes** — after updating, provide a brief summary of what was added/changed/removed in the docs

## Guidelines

- Do NOT rewrite entire documentation pages — only edit sections affected by changes
- Developer docs should include actual code patterns from the codebase, not made-up examples
- Business user docs should be written in plain language without technical jargon
- Keep the existing MDX formatting style: headers, tables, code blocks, Cards components
- If a new major feature is added, consider whether it needs its own page or fits in an existing one
- Maintain accuracy — read the actual source code before documenting how something works
- Do NOT update docs for: bug fixes, minor refactors, style tweaks, dependency bumps
- DO update docs for: new features, new API routes, new integrations, architecture changes, removed features, new UI capabilities
