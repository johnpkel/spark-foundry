---
name: update-prd
description: Update the PRD (Product Requirements Document) when meaningful changes have been made to the app
user_invocable: true
---

# Update PRD Skill

When invoked, analyze recent changes to the codebase and update `PRD.md` in the project root to reflect the current state of the application.

## Process

1. **Read the current PRD** at the project root (`PRD.md`)

2. **Identify what changed** by examining:
   - `git diff main` (if on a feature branch) or `git log --oneline -20` for recent commits
   - `git diff HEAD~5` to see recent code changes
   - Any new/modified files in `src/app/api/`, `src/components/`, `src/lib/`

3. **Determine if changes are meaningful** — only update the PRD for:
   - New features or capabilities
   - New API routes or endpoints
   - New integrations or services
   - Significant changes to the RAG pipeline
   - New UI views, panels, or components
   - Architecture changes (new libraries, data model changes)
   - Removed features
   - Do NOT update for: bug fixes, minor refactors, style tweaks, dependency bumps

4. **Update the PRD** by editing the relevant sections:
   - Update the "Last updated" date at the top
   - Add/modify/remove entries in the appropriate section
   - Keep the RAG pipeline diagram accurate
   - Maintain the existing document structure and formatting
   - Be concise — the PRD should describe WHAT the app does, not implementation details

5. **Summarize changes** — after updating, provide a brief summary of what was added/changed/removed in the PRD

## Guidelines

- Do NOT rewrite the entire PRD — only edit sections affected by changes
- Preserve the ASCII diagram format for the RAG pipeline
- Keep table formats consistent
- If a new integration is added, add it to both Section 7 (Integrations) and the Technical Architecture table
- If a new item type is added, add it to Section 3 (Content Item Types)
- If a new chat tool is added, add it to Section 5.2 (Available Tools)
