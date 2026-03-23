# Editor Versioning Design

## Overview

Add explicit version snapshots to the Spark editor. Users click "Save Version" to create a numbered, permanent milestone. Auto-save remains unchanged. Restoring a version replaces the editor content and triggers fresh Lytics enrichment and full AI analysis. Items are unaffected.

## Requirements

- **Save Version**: User-initiated action that snapshots the current editor content as a permanent, numbered version with an optional label.
- **Auto-save**: No changes. Continues as a 1.5s debounced PATCH to `sparks.metadata.editor_content`.
- **Save status indicator**: Always-visible status in the editor header bar showing "Saving...", "Saved Xs ago", or "Save failed".
- **Version history dropdown**: Compact dropdown from the editor header showing all saved versions. Click to restore.
- **Restore**: Clicking a version loads its content into the editor as the new draft. Triggers Lytics enrichment + full AI analysis against the restored content.
- **Scoring on restore**: Both `POST /api/lytics/enrich` (ambient enrichment) and `POST /api/lytics/analyze` (full SSE analysis) run automatically when a version is loaded.
- **Items unaffected**: `spark_items` are not versioned.

## Data Model

### New table: `spark_versions`

```sql
CREATE TABLE spark_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spark_id uuid NOT NULL REFERENCES sparks(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  label text,
  content jsonb NOT NULL,
  scores jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_spark_versions_number ON spark_versions(spark_id, version_number);
CREATE INDEX idx_spark_versions_latest ON spark_versions(spark_id, created_at DESC);
```

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `spark_id` | uuid | FK to `sparks(id)`, cascading delete |
| `version_number` | integer | Auto-incremented per spark (1, 2, 3...) |
| `label` | text | Optional user-provided label |
| `content` | jsonb | Full TipTap JSON snapshot |
| `scores` | jsonb | Snapshot of `metadata.lyticsCache` at save time (historical reference only — scores are re-run on restore) |
| `created_at` | timestamptz | When the version was saved |

Constraints:
- Unique on `(spark_id, version_number)` — one version number per spark.
- No pruning — all versions are permanent.
- `ON DELETE CASCADE` — deleting a spark removes its versions.

## API

### `POST /api/sparks/[id]/versions` — Save Version

**Request body:**
```json
{ "label": "Final draft for review" }
```
`label` is optional.

**Behavior:**
1. Read current `sparks.metadata.editor_content` for the given spark.
2. Determine next version number: `MAX(version_number) + 1` for this spark, or `1` if none exist.
3. Snapshot current `sparks.metadata.lyticsCache` as the `scores` value.
4. Insert row into `spark_versions`.
5. Return the new version object.

**Response:**
```json
{
  "id": "uuid",
  "spark_id": "uuid",
  "version_number": 3,
  "label": "Final draft for review",
  "scores": { ... },
  "created_at": "2026-03-23T12:00:00Z"
}
```

### `GET /api/sparks/[id]/versions` — List Versions

**Behavior:**
- Return all versions for the spark, ordered by `version_number DESC`.
- Exclude `content` from the response to keep the payload lightweight.

**Response:**
```json
[
  {
    "id": "uuid",
    "version_number": 3,
    "label": "Final draft for review",
    "scores": { ... },
    "created_at": "2026-03-23T12:00:00Z"
  },
  {
    "id": "uuid",
    "version_number": 2,
    "label": null,
    "scores": { ... },
    "created_at": "2026-03-23T11:00:00Z"
  }
]
```

### `PATCH /api/sparks/[id]/versions/[versionId]` — Update / Delete Version

**Request body (update label):**
```json
{ "label": "Updated label" }
```

**Request body (delete):**
```json
{ "deleted": true }
```

**Behavior:**
- If `label` is provided: update the version's label. Pass `null` to clear it.
- If `deleted` is true: delete the version row.
- Returns the updated version object, or `{ "deleted": true }` on delete.

### `POST /api/sparks/[id]/versions/[versionId]/restore` — Restore Version

**Behavior:**
1. Read the version's `content` from `spark_versions`.
2. Write it to `sparks.metadata.editor_content` using the existing metadata merge pattern (PATCH).
3. Return the `content` so the client can update the editor.

**Response:**
```json
{
  "content": { ... },
  "version_number": 2,
  "label": "Some label"
}
```

**Client-side after restore:**
1. Call `editor.commands.setContent(content)` to update the TipTap editor directly with the JSON content. (Note: `replaceDocument()` in `editor-context.tsx` accepts markdown, not JSON — so use `setContent()` directly or add a new `replaceDocumentJSON()` method to the editor context.)
2. Trigger `POST /api/lytics/enrich` with the restored content.
3. Trigger `POST /api/lytics/analyze` SSE stream for full AI analysis.
4. ScorePanel updates as results stream in — same UX as a manual "Analyze" click.

## UI Components

### Save Status Indicator

**Location:** Editor header bar (view toggle bar), right-aligned before the version buttons.

**States:**
| State | Display | Color |
|-------|---------|-------|
| Saving | `● Saving…` | Gray (`text-venus-gray-500`) |
| Saved | `✓ Saved Xs ago` | Green (`text-green-500`) |
| Error | `✗ Save failed` | Red (`text-red-500`) |

**Behavior:**
- Always visible (replaces the current bottom-right pill that only appears during saves).
- Relative timestamp updates periodically (~10s interval).
- Tracks `lastSavedAt` timestamp in state, computed from successful auto-save responses.

### Save Version Button

**Location:** Editor header bar, after the save status indicator.

**Appearance:** Small purple button labeled "Save Version".

**Behavior:**
1. Click opens a popover below the button.
2. Popover shows:
   - Auto-filled heading: "Save as Version N" (next version number).
   - Text input for optional label, placeholder: "Optional label (e.g., 'Final draft')".
   - Cancel and Save buttons.
3. Save calls `POST /api/sparks/[id]/versions`, closes popover, shows brief success state.
4. Updates the version dropdown trigger to show the new version number.

### Version History Dropdown

**Location:** Editor header bar, after the Save Version button.

**Trigger:** Compact button showing current latest version number: `v3 ▾`. Shows "Versions" if no versions exist yet.

**Dropdown contents:**
- Header: "Version History".
- List of versions, each showing:
  - Version number (bold).
  - Optional label (secondary text).
  - Relative timestamp.
  - Overall score from cached `scores` (if available).
- Current/latest version highlighted with accent border.

**Interaction:**
- Click a version → immediately restores it (no confirmation dialog).
- Previous editor state is safe because auto-save has already persisted the current draft.
- After restore, version dropdown trigger updates to show which version was loaded.

## Restore + Scoring Flow

```
User clicks version in dropdown
  → POST /api/sparks/[id]/versions/[versionId]/restore
  → Server writes content to spark.metadata.editor_content
  → Client receives content
  → editor.commands.setContent(json) updates TipTap editor (note: replaceDocument() accepts markdown — use setContent() directly for JSON)
  → Auto-save picks up new content on next debounce (no special handling)
  → Client triggers POST /api/lytics/enrich (ambient enrichment)
  → Client triggers POST /api/lytics/analyze (full SSE analysis)
  → ScorePanel updates as results stream in
  → Scores cached to metadata.lyticsCache as normal
```

The ScorePanel does not need to know about versions. It reacts to content changes as it does today. The version dropdown shows historical cached scores; the ScorePanel always shows live scores for the current editor content.

## What Does NOT Change

- **Auto-save mechanism**: Same 1.5s debounced PATCH to metadata.
- **Items (`spark_items`)**: Not versioned, completely unaffected.
- **ScorePanel behavior during editing**: Mock scores, ambient enrichment, and manual analysis all work as today.
- **Canvas state**: Not versioned.
- **Discussions**: Not versioned.
- **Editor component (`SparkEditor.tsx`)**: No changes to the editor itself — versioning is handled at the page level.

## File Impact Summary

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration: create `spark_versions` table |
| `src/app/api/sparks/[id]/versions/route.ts` | New: POST (save), GET (list) |
| `src/app/api/sparks/[id]/versions/[versionId]/route.ts` | New: PATCH (update label / delete) |
| `src/app/api/sparks/[id]/versions/[versionId]/restore/route.ts` | New: POST (restore) |
| `src/app/spark/[id]/page.tsx` | Add save status indicator, Save Version button, version dropdown, restore handler, scoring trigger |
| `src/lib/editor-context.tsx` | Add `replaceDocumentJSON()` method for restoring JSON content |
| `src/lib/types.ts` | Add `SparkVersion` type |
