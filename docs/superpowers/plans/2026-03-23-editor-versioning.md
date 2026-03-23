# Editor Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit version snapshots to the Spark editor with save, list, restore, delete, and automatic scoring refresh on restore.

**Architecture:** New `spark_versions` Supabase table stores TipTap JSON snapshots. Three new API route files handle CRUD + restore. The Spark workspace page gets a save status indicator, Save Version button with popover, and a version history dropdown in the editor header bar. ScorePanel gains a ref-based `triggerAnalysis()` so the page can programmatically trigger scoring after a version restore.

**Tech Stack:** Next.js 14 App Router, Supabase (admin client), TipTap, React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-23-editor-versioning-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/014_spark_versions.sql` | Create | DB migration for `spark_versions` table |
| `src/lib/types.ts` | Modify | Add `SparkVersion` type |
| `src/app/api/sparks/[id]/versions/route.ts` | Create | POST (save version), GET (list versions) |
| `src/app/api/sparks/[id]/versions/[versionId]/route.ts` | Create | PATCH (update label / delete version) |
| `src/app/api/sparks/[id]/versions/[versionId]/restore/route.ts` | Create | POST (restore version content) |
| `src/components/ScorePanel.tsx` | Modify | Add `forwardRef` + `useImperativeHandle` to expose `triggerAnalysis()` |
| `src/app/spark/[id]/page.tsx` | Modify | Add save status indicator, Save Version button, version dropdown, restore + scoring flow |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/014_spark_versions.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 014_spark_versions.sql
-- Adds spark_versions table for explicit editor version snapshots

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

- [ ] **Step 2: Apply the migration to the local Supabase instance**

Run: `cd "/Users/johnkelly/coding/Spark Foundry Sandbox/spark-foundry" && npx supabase db push`

If the project uses a remote Supabase instance (no local), apply via the Supabase dashboard SQL editor instead.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_spark_versions.sql
git commit -m "feat: add spark_versions table migration"
```

---

### Task 2: Add SparkVersion Type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the SparkVersion interface**

Add after the `Spark` interface (around line 56):

```typescript
export interface SparkVersion {
  id: string;
  spark_id: string;
  version_number: number;
  label: string | null;
  content: Record<string, unknown>; // TipTap JSONContent
  scores: Record<string, unknown> | null;
  created_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add SparkVersion type"
```

---

### Task 3: Versions API — Save & List

**Files:**
- Create: `src/app/api/sparks/[id]/versions/route.ts`

This route handles two operations:
- `POST` — Save a new version (reads current editor content + lytics cache from the spark, determines next version number, inserts into `spark_versions`)
- `GET` — List all versions for a spark (ordered by version_number DESC, excludes `content` to keep payload small)

Follow the pattern in `src/app/api/sparks/[id]/route.ts` for request/response structure and Supabase admin client usage.

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/sparks/[id]/versions — Save a new version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const label: string | null = body.label ?? null;

  // Read current spark to get editor_content and lyticsCache
  const { data: spark, error: sparkError } = await supabaseAdmin
    .from('sparks')
    .select('metadata')
    .eq('id', id)
    .single();

  if (sparkError || !spark) {
    return NextResponse.json({ error: 'Spark not found' }, { status: 404 });
  }

  const metadata = spark.metadata as Record<string, unknown> | null;
  const editorContent = metadata?.editor_content ?? {};
  const lyticsCache = metadata?.lyticsCache ?? null;

  // Determine next version number
  const { data: maxRow } = await supabaseAdmin
    .from('spark_versions')
    .select('version_number')
    .eq('spark_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (maxRow?.version_number ?? 0) + 1;

  // Insert the version
  const { data: version, error: insertError } = await supabaseAdmin
    .from('spark_versions')
    .insert({
      spark_id: id,
      version_number: nextVersion,
      label,
      content: editorContent,
      scores: lyticsCache,
    })
    .select('id, spark_id, version_number, label, scores, created_at')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(version, { status: 201 });
}

// GET /api/sparks/[id]/versions — List all versions (without content)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('spark_versions')
    .select('id, spark_id, version_number, label, scores, created_at')
    .eq('spark_id', id)
    .order('version_number', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verify the endpoints work**

Start the dev server if not running: `npm run dev`

Test save version:
```bash
# Replace SPARK_ID with a real spark ID from your database
curl -X POST http://localhost:3000/api/sparks/SPARK_ID/versions \
  -H "Content-Type: application/json" \
  -d '{"label": "Test version"}'
```
Expected: 201 response with version object including `version_number: 1`.

Test list versions:
```bash
curl http://localhost:3000/api/sparks/SPARK_ID/versions
```
Expected: Array with the version just created (no `content` field).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sparks/\[id\]/versions/route.ts
git commit -m "feat: add save and list versions API endpoints"
```

---

### Task 4: Versions API — Update/Delete

**Files:**
- Create: `src/app/api/sparks/[id]/versions/[versionId]/route.ts`

This route handles `PATCH` for updating a version's label or deleting it entirely.

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/sparks/[id]/versions/[versionId] — Update label or delete
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  const body = await request.json();

  // Delete
  if (body.deleted === true) {
    const { error } = await supabaseAdmin
      .from('spark_versions')
      .delete()
      .eq('id', versionId)
      .eq('spark_id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  }

  // Update label
  if ('label' in body) {
    const { data, error } = await supabaseAdmin
      .from('spark_versions')
      .update({ label: body.label })
      .eq('id', versionId)
      .eq('spark_id', id)
      .select('id, spark_id, version_number, label, scores, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
}
```

- [ ] **Step 2: Verify the endpoint works**

Test update label:
```bash
curl -X PATCH http://localhost:3000/api/sparks/SPARK_ID/versions/VERSION_ID \
  -H "Content-Type: application/json" \
  -d '{"label": "Updated label"}'
```
Expected: Updated version object with new label.

Test delete:
```bash
curl -X PATCH http://localhost:3000/api/sparks/SPARK_ID/versions/VERSION_ID \
  -H "Content-Type: application/json" \
  -d '{"deleted": true}'
```
Expected: `{ "deleted": true }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sparks/\[id\]/versions/\[versionId\]/route.ts
git commit -m "feat: add version update/delete API endpoint"
```

---

### Task 5: Versions API — Restore

**Files:**
- Create: `src/app/api/sparks/[id]/versions/[versionId]/restore/route.ts`

This route reads a version's content and writes it to the spark's `metadata.editor_content` using the existing metadata merge pattern.

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/sparks/[id]/versions/[versionId]/restore — Restore version content
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  // Read the version content
  const { data: version, error: versionError } = await supabaseAdmin
    .from('spark_versions')
    .select('content, version_number, label')
    .eq('id', versionId)
    .eq('spark_id', id)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Merge into spark metadata (same pattern as PATCH /api/sparks/[id])
  const { data: spark } = await supabaseAdmin
    .from('sparks')
    .select('metadata')
    .eq('id', id)
    .single();

  const existingMetadata = (spark?.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = { ...existingMetadata, editor_content: version.content };

  const { error: updateError } = await supabaseAdmin
    .from('sparks')
    .update({ metadata: updatedMetadata })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    content: version.content,
    version_number: version.version_number,
    label: version.label,
  });
}
```

- [ ] **Step 2: Verify the endpoint works**

First create a version, then restore it:
```bash
# Save a version
curl -X POST http://localhost:3000/api/sparks/SPARK_ID/versions \
  -H "Content-Type: application/json" \
  -d '{"label": "Before restore test"}'

# Restore it (use the version ID from the response above)
curl -X POST http://localhost:3000/api/sparks/SPARK_ID/versions/VERSION_ID/restore
```
Expected: Response with `content`, `version_number`, and `label` fields.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sparks/\[id\]/versions/\[versionId\]/restore/route.ts
git commit -m "feat: add version restore API endpoint"
```

---

### Task 6: Expose ScorePanel Analysis via Ref

**Files:**
- Modify: `src/components/ScorePanel.tsx`

The page needs to programmatically trigger analysis after restoring a version. ScorePanel currently keeps `analyze()` internal. Add `forwardRef` + `useImperativeHandle` to expose a `triggerAnalysis()` handle.

**Important:** The ScorePanel reads editor text directly from the TipTap editor via `useEditorContext()`. After a restore updates the editor content, calling `triggerAnalysis()` will pick up the new content automatically.

- [ ] **Step 1: Add the ref handle type and modify the component signature**

At the top of the file (near the existing interfaces around line 85), add:

```typescript
export interface ScorePanelHandle {
  triggerAnalysis: () => void;
}
```

Change the component from:
```typescript
export default function ScorePanel({ sparkItems, canvasGroups, primaryDomains = [], sparkId, initialLyticsCache }: ScorePanelProps) {
```

To:
```typescript
import { forwardRef, useImperativeHandle } from 'react';
// (merge with existing react imports at top of file)

const ScorePanel = forwardRef<ScorePanelHandle, ScorePanelProps>(function ScorePanel(
  { sparkItems, canvasGroups, primaryDomains = [], sparkId, initialLyticsCache },
  ref
) {
```

- [ ] **Step 2: Add useImperativeHandle inside the component body**

Add AFTER the `analyze` callback definition (which is around line 645 — search for `const analyze = useCallback`). Place it right after `analyze` is defined:

```typescript
  useImperativeHandle(ref, () => ({
    triggerAnalysis: () => {
      analyze();
    },
  }), [analyze]);
```

- [ ] **Step 3: Update the default export**

Change the bottom of the file from:
```typescript
export default function ScorePanel(...)
```

Since we used `forwardRef` wrapping the named function, add at the very end of the file:
```typescript
export default ScorePanel;
```

Remove the `export default` from the `forwardRef` line if it was added there — the pattern should be:
```typescript
const ScorePanel = forwardRef<ScorePanelHandle, ScorePanelProps>(function ScorePanel(...) {
  // ... component body
});

export default ScorePanel;
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`

Or just check for TypeScript errors: `npx tsc --noEmit 2>&1 | head -20`

Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ScorePanel.tsx
git commit -m "feat: expose ScorePanel triggerAnalysis via ref"
```

---

### Task 7: Save Status Indicator + Version UI in Page

**Files:**
- Modify: `src/app/spark/[id]/page.tsx`

This is the largest task. It adds:
1. **Save status indicator** — always-visible in the editor header bar
2. **Save Version button + popover** — creates versions via the API
3. **Version history dropdown** — lists versions, click to restore
4. **Restore handler** — loads content into editor, triggers scoring

**Important context about the existing file:**
- `saveStatus` state already exists at line 64: `useState<'idle' | 'saving' | 'error'>('idle')`
- The auto-save handler (`handleEditorChange`) already sets `setSaveStatus('saving')` and `setSaveStatus('idle')` — this remains unchanged
- The current save status pill is at lines 714-723 (absolute-positioned bottom-right) — this will be replaced
- The editor header bar (view toggle) is at lines 660-678
- ScorePanel is rendered at line 788

- [ ] **Step 1: Add imports and new state**

At the top of the file, add to the existing lucide-react import:
```typescript
import { Save, History, X, Pencil, Trash2, ChevronDown } from 'lucide-react';
```

Add to the existing React import (ensure `useRef` is already imported — it is):
```typescript
// No new React imports needed — useState, useEffect, useCallback, useRef are already imported
```

Add the type import:
```typescript
import type { SparkVersion } from '@/lib/types';
import type { ScorePanelHandle } from '@/components/ScorePanel';
```

Inside `SparkWorkspacePage`, add new state after the existing state declarations (around line 72):

```typescript
  // ── Version state ──────────────────────────────
  const [versions, setVersions] = useState<SparkVersion[]>([]);
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const scorePanelRef = useRef<ScorePanelHandle>(null);
```

- [ ] **Step 2: Update the auto-save handler to track lastSavedAt**

In the existing `handleEditorChange` callback (around line 101 where `setSaveStatus('idle')` is), add `setLastSavedAt(new Date())` right after `setSaveStatus('idle')`:

Change:
```typescript
        if (!res.ok) throw new Error('save failed');
        setSaveStatus('idle');
```

To:
```typescript
        if (!res.ok) throw new Error('save failed');
        setSaveStatus('idle');
        setLastSavedAt(new Date());
```

- [ ] **Step 3: Add version CRUD functions**

Add after the existing `updatePrimaryDomains` callback (around line 200):

```typescript
  // ── Version management ─────────────────────────
  const loadVersions = useCallback(async () => {
    const res = await fetch(`/api/sparks/${sparkId}/versions`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data);
    }
  }, [sparkId]);

  const saveVersion = useCallback(async () => {
    setSavingVersion(true);
    try {
      const res = await fetch(`/api/sparks/${sparkId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: versionLabel || null }),
      });
      if (!res.ok) throw new Error('Failed to save version');
      setShowSavePopover(false);
      setVersionLabel('');
      await loadVersions();
    } finally {
      setSavingVersion(false);
    }
  }, [sparkId, versionLabel, loadVersions]);

  const restoreVersion = useCallback(async (versionId: string) => {
    const res = await fetch(`/api/sparks/${sparkId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
    if (!res.ok) return;
    const { content } = await res.json();

    // Update editor with restored content
    const editor = editorCtx?.getEditor();
    if (editor) {
      editor.commands.setContent(content);
    }

    // Update local spark state so auto-save merges correctly
    setSpark(prev => prev ? {
      ...prev,
      metadata: { ...(prev.metadata ?? {}), editor_content: content },
    } : prev);

    setShowVersionDropdown(false);

    // Trigger Lytics enrichment first, then full analysis after editor settles
    const plainText = editor?.getText().trim() ?? '';
    if (plainText) {
      fetch('/api/lytics/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText }),
      }).catch(() => {}); // fire-and-forget; ScorePanel will pick up results
    }

    // Trigger full AI analysis after a short delay for editor to settle
    setTimeout(() => {
      scorePanelRef.current?.triggerAnalysis();
    }, 500);
  }, [sparkId, editorCtx]);

  const deleteVersion = useCallback(async (versionId: string) => {
    await fetch(`/api/sparks/${sparkId}/versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleted: true }),
    });
    await loadVersions();
  }, [sparkId, loadVersions]);

  const updateVersionLabel = useCallback(async (versionId: string, label: string | null) => {
    await fetch(`/api/sparks/${sparkId}/versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    await loadVersions();
  }, [sparkId, loadVersions]);
```

- [ ] **Step 4: Add editorCtx reference and load versions on mount**

Add near the top of the component (after state declarations):

```typescript
  const editorCtx = useEditorContext();
```

Note: `useEditorContext` is already imported at line 31. Check if `editorCtx` is already used in the component — if not, this is the first usage.

Add to the existing `loadSparkData` effect or create a new effect to load versions on mount:

```typescript
  // Load versions on mount
  useEffect(() => {
    if (sparkId) loadVersions();
  }, [sparkId, loadVersions]);
```

- [ ] **Step 5: Add the relative time helper**

Add as a utility function inside the component (or above it):

```typescript
  function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
```

- [ ] **Step 6: Add a tick state for relative timestamps**

```typescript
  // Tick every 10s to update relative timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);
```

- [ ] **Step 7: Replace the save status pill with the new header bar UI**

Remove the existing save status pill (lines 714-723):

```tsx
          {/* Save status indicator */}
          {saveStatus !== 'idle' && (
            <div className={`absolute bottom-3 right-3 text-xs px-2.5 py-1 rounded-full pointer-events-none ${
              saveStatus === 'saving'
                ? 'bg-venus-gray-100 text-venus-gray-500'
                : 'bg-red-50 text-red-500'
            }`}>
              {saveStatus === 'saving' ? 'Saving…' : 'Save failed'}
            </div>
          )}
```

In the view toggle bar (around line 661), add the versioning UI after the existing view toggle buttons, before the closing `</div>`:

Change the view toggle bar from:
```tsx
          <div className="flex items-center gap-0.5 px-3 pt-2 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            {([
              { id: 'editor' as MiddleView, icon: PenLine, label: 'Editor' },
              { id: 'canvas' as MiddleView, icon: LayoutDashboard, label: 'Canvas' },
            ]).map(({ id, icon: Icon, label }) => (
              ...
            ))}
          </div>
```

To:
```tsx
          <div className="flex items-center gap-0.5 px-3 pt-2 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            {([
              { id: 'editor' as MiddleView, icon: PenLine, label: 'Editor' },
              { id: 'canvas' as MiddleView, icon: LayoutDashboard, label: 'Canvas' },
            ]).map(({ id, icon: Icon, label }) => (
              ...existing code unchanged...
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Save status indicator */}
            <span className={`text-[11px] mr-2 ${
              saveStatus === 'saving'
                ? 'text-venus-gray-500'
                : saveStatus === 'error'
                  ? 'text-red-500'
                  : 'text-green-500'
            }`}>
              {saveStatus === 'saving'
                ? '● Saving…'
                : saveStatus === 'error'
                  ? '✗ Save failed'
                  : lastSavedAt
                    ? `✓ Saved ${timeAgo(lastSavedAt)}`
                    : ''}
            </span>

            {/* Save Version button */}
            <div className="relative" data-version-popover>
              <button
                onClick={() => setShowSavePopover(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-venus-purple rounded-md hover:bg-venus-purple/90 transition-colors -mb-px"
              >
                <Save size={12} />
                Save Version
              </button>

              {/* Save Version popover */}
              {showSavePopover && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface border border-venus-gray-200 rounded-lg shadow-lg p-4 z-50">
                  <div className="text-sm font-semibold text-venus-gray-800 mb-3">
                    Save as Version {(versions[0]?.version_number ?? 0) + 1}
                  </div>
                  <input
                    type="text"
                    value={versionLabel}
                    onChange={e => setVersionLabel(e.target.value)}
                    placeholder="Optional label (e.g., 'Final draft')"
                    className="w-full px-3 py-1.5 text-xs border border-venus-gray-200 rounded-md bg-surface text-venus-gray-800 placeholder-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple mb-3"
                    onKeyDown={e => { if (e.key === 'Enter') saveVersion(); }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowSavePopover(false); setVersionLabel(''); }}
                      className="px-3 py-1.5 text-xs text-venus-gray-500 hover:text-venus-gray-700 bg-venus-gray-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveVersion}
                      disabled={savingVersion}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-venus-purple rounded-md hover:bg-venus-purple/90 disabled:opacity-50 transition-colors"
                    >
                      {savingVersion ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Version history dropdown */}
            <div className="relative" data-version-popover>
              <button
                onClick={() => setShowVersionDropdown(v => !v)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-venus-gray-600 border border-venus-gray-200 rounded-md hover:bg-venus-gray-100 transition-colors -mb-px"
              >
                <History size={12} />
                {versions.length > 0 ? `v${versions[0].version_number}` : 'Versions'}
                <ChevronDown size={10} />
              </button>

              {showVersionDropdown && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-venus-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  <div className="text-xs font-semibold text-venus-gray-600 px-4 pt-3 pb-2 border-b border-venus-gray-100">
                    Version History
                  </div>
                  {versions.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-venus-gray-400 text-center">
                      No versions saved yet
                    </div>
                  ) : (
                    versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-venus-gray-50 cursor-pointer border-b border-venus-gray-100 last:border-b-0 group"
                        onClick={() => restoreVersion(v.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-venus-gray-800">
                              Version {v.version_number}
                            </span>
                            <span className="text-[10px] text-venus-gray-400">
                              {timeAgo(new Date(v.created_at))}
                            </span>
                          </div>
                          {v.label && (
                            <div className="text-[11px] text-venus-gray-500 mt-0.5 truncate">
                              {v.label}
                            </div>
                          )}
                          {v.scores && (v.scores as Record<string, unknown>).aiResult && (
                            <div className="text-[10px] text-green-500 mt-0.5">
                              Score: {((v.scores as Record<string, unknown>).aiResult as Record<string, unknown>)?.overallScore ?? '—'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newLabel = prompt('Edit label:', v.label || '');
                              if (newLabel !== null) updateVersionLabel(v.id, newLabel || null);
                            }}
                            className="p-1 text-venus-gray-400 hover:text-venus-gray-600 rounded"
                            title="Edit label"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete Version ${v.version_number}?`)) deleteVersion(v.id);
                            }}
                            className="p-1 text-venus-gray-400 hover:text-red-500 rounded"
                            title="Delete version"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
```

- [ ] **Step 8: Add ref to ScorePanel**

Change the ScorePanel render (around line 788) from:
```tsx
                <ScorePanel
                  sparkItems={items}
                  canvasGroups={canvasState.groups}
                  ...
```

To:
```tsx
                <ScorePanel
                  ref={scorePanelRef}
                  sparkItems={items}
                  canvasGroups={canvasState.groups}
                  ...
```

- [ ] **Step 9: Add click-outside handler to close popovers**

Add an effect to close popovers when clicking outside:

```typescript
  // Close popovers on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-version-popover]')) {
        setShowSavePopover(false);
        setShowVersionDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
```

Add `data-version-popover` attribute to both the Save Version wrapper `<div>` and the Version History wrapper `<div>`:
```tsx
<div className="relative" data-version-popover>
```

- [ ] **Step 10: Verify the full UI works**

Run: `npm run dev`

1. Open a spark in the browser
2. Verify the save status shows "Saved Xs ago" in the header bar after typing
3. Click "Save Version" → popover appears with version number and label input
4. Save a version → dropdown updates to show "v1"
5. Make edits, save another version
6. Click the version dropdown → see version list
7. Click a version → content restores, scoring triggers
8. Hover a version → edit/delete icons appear
9. Verify the old bottom-right save pill is gone

- [ ] **Step 11: Commit**

```bash
git add src/app/spark/\[id\]/page.tsx
git commit -m "feat: add save status indicator, version save/restore/delete UI"
```

---

### Task 8: Final Verification

- [ ] **Step 1: End-to-end test**

1. Open a spark with content in the editor
2. Verify save status shows in header bar
3. Save Version 1 with label "Initial draft"
4. Edit content significantly
5. Save Version 2 with no label
6. Click v2 dropdown → see both versions
7. Click Version 1 → editor content restores to the initial draft
8. Verify ScorePanel re-analyzes (check for analysis steps appearing)
9. Edit the label on Version 1 via the pencil icon
10. Delete Version 2 via the trash icon
11. Verify the version list updates correctly

- [ ] **Step 2: Verify auto-save is unaffected**

1. Type in the editor
2. Wait 2 seconds
3. Verify "Saved Xs ago" appears
4. Confirm no changes to auto-save behavior

- [ ] **Step 3: Commit all remaining changes (if any)**

```bash
git status
# If there are unstaged changes, stage and commit them
```
