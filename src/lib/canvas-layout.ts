import type { SparkItem, CanvasNodePosition, ItemType } from './types';

// ── Type colors (shared with SparkItemNode) ───────────
export const TYPE_COLORS: Record<string, string> = {
  link: '#6c5ce7',
  image: '#00b9e0',
  text: '#9387ed',
  file: '#007a52',
  note: '#ffae0a',
  google_drive: '#4285f4',
  slack_message: '#e84393',
  contentstack_entry: '#fd79a8',
  contentstack_asset: '#00cec9',
  clarity_insight: '#38bdf8',
  web_research: '#27ae60',
};

export const TYPE_LABELS: Record<string, string> = {
  link: 'Links',
  image: 'Images',
  text: 'Text',
  file: 'Files',
  note: 'Notes',
  google_drive: 'Drive',
  slack_message: 'Slack',
  contentstack_entry: 'Entries',
  contentstack_asset: 'Assets',
  clarity_insight: 'Clarity',
  web_research: 'Research',
};

// Ordered column types for swimlane layout
const COLUMN_ORDER: ItemType[] = [
  'link', 'image', 'text', 'file', 'note', 'google_drive',
  'slack_message', 'contentstack_entry', 'contentstack_asset', 'clarity_insight',
];

export const GROUP_COLORS = [
  '#6c5ce7', '#00b9e0', '#007a52', '#ffae0a', '#d62400',
  '#4285f4', '#9387ed', '#e84393', '#00cec9', '#fd79a8',
];

// Layout constants
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const COL_GAP = 40;
const ROW_GAP = 20;
const HEADER_HEIGHT = 40;

export const LAYOUT = { NODE_WIDTH, NODE_HEIGHT, COL_GAP, ROW_GAP, HEADER_HEIGHT } as const;

/**
 * Compute swimlane layout positions for items.
 * Groups items by type in ordered columns. Preserves existing positions —
 * only computes for new/unpositioned items.
 */
export function computeSwimlaneLayout(
  items: SparkItem[],
  existingPositions: CanvasNodePosition[],
): CanvasNodePosition[] {
  // Prune positions for items that no longer exist
  const itemIds = new Set(items.map(i => i.id));
  const prunedPositions = existingPositions.filter(p => itemIds.has(p.itemId));

  const posMap = new Map(prunedPositions.map(p => [p.itemId, p]));

  // Find items that need positioning
  const needsPosition = items.filter(item => !posMap.has(item.id));
  if (needsPosition.length === 0) return prunedPositions;

  // Group all items by type to know the column structure
  const typeGroups = new Map<string, SparkItem[]>();
  for (const item of items) {
    const group = typeGroups.get(item.type) || [];
    group.push(item);
    typeGroups.set(item.type, group);
  }

  // Build column assignments (only non-empty types)
  const activeColumns = COLUMN_ORDER.filter(type => typeGroups.has(type));

  // For each new item, find the next available slot in its type column
  const result = [...prunedPositions];

  for (const item of needsPosition) {
    const colIndex = activeColumns.indexOf(item.type);
    if (colIndex === -1) continue;

    const x = colIndex * (NODE_WIDTH + COL_GAP);

    // Count how many items of this type already have positions
    const existingInColumn = result.filter(p => {
      const existing = items.find(i => i.id === p.itemId);
      return existing?.type === item.type;
    }).length;

    const y = HEADER_HEIGHT + existingInColumn * (NODE_HEIGHT + ROW_GAP);

    result.push({ itemId: item.id, x, y });
  }

  return result;
}

/**
 * Compute column header positions for swimlane labels.
 */
export function computeColumnHeaders(
  items: SparkItem[],
): { type: string; label: string; x: number; color: string }[] {
  const typeSet = new Set(items.map(i => i.type));
  const activeColumns = COLUMN_ORDER.filter(type => typeSet.has(type));

  return activeColumns.map((type, index) => ({
    type,
    label: TYPE_LABELS[type] || type,
    x: index * (NODE_WIDTH + COL_GAP),
    color: TYPE_COLORS[type] || '#888',
  }));
}

/**
 * Pick the next available group color, skipping already-used ones.
 */
export function nextGroupColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[0];
}
