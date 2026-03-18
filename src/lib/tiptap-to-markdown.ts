import type { JSONContent } from '@tiptap/core';

/**
 * Serialize a TipTap JSON document to GFM-compatible Markdown.
 *
 * Handles standard block nodes, marks, nested lists, tables,
 * and Spark-specific atom nodes (groupBlock, drawing, mention).
 */
export function tiptapJsonToMarkdown(doc: JSONContent): string {
  if (!doc || doc.type !== 'doc' || !doc.content) return '';
  return serializeNodes(doc.content, 0).trimEnd() + '\n';
}

// ── Block-level serialization ───────────────────────────────────

function serializeNodes(nodes: JSONContent[], depth: number): string {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    out += serializeNode(nodes[i], depth);
  }
  return out;
}

function serializeNode(node: JSONContent, depth: number): string {
  switch (node.type) {
    case 'heading':
      return serializeHeading(node);
    case 'paragraph':
      return serializeParagraph(node);
    case 'bulletList':
      return serializeList(node, 'bullet', depth);
    case 'orderedList':
      return serializeList(node, 'ordered', depth);
    case 'taskList':
      return serializeList(node, 'task', depth);
    case 'listItem':
      return serializeListItem(node, 'bullet', depth);
    case 'taskItem':
      return serializeTaskItem(node, depth);
    case 'blockquote':
      return serializeBlockquote(node);
    case 'codeBlock':
      return serializeCodeBlock(node);
    case 'horizontalRule':
      return '---\n\n';
    case 'image':
      return serializeImage(node);
    case 'table':
      return serializeTable(node);
    case 'hardBreak':
      return '\n';

    // Spark custom atom nodes
    case 'groupBlock':
      return serializeGroupBlock(node);
    case 'drawing':
      return '<!-- drawing -->\n\n';
    case 'mention':
      return `@${node.attrs?.label || node.attrs?.id || ''}`;

    default:
      // Unknown node — serialize children if any, or output text content
      if (node.content) return serializeNodes(node.content, depth);
      if (node.text) return serializeInline(node);
      return '';
  }
}

// ── Inline / mark serialization ─────────────────────────────────

function serializeInline(node: JSONContent): string {
  let text = node.text || '';
  if (!node.marks || node.marks.length === 0) return text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case 'bold':
        text = `**${text}**`;
        break;
      case 'italic':
        text = `*${text}*`;
        break;
      case 'strike':
        text = `~~${text}~~`;
        break;
      case 'code':
        text = `\`${text}\``;
        break;
      case 'link':
        text = `[${text}](${mark.attrs?.href || ''})`;
        break;
      // Skip unknown marks (e.g. commentMark) — just keep the text
    }
  }
  return text;
}

function inlineContent(nodes?: JSONContent[]): string {
  if (!nodes) return '';
  return nodes.map((n) => {
    if (n.type === 'text') return serializeInline(n);
    if (n.type === 'hardBreak') return '\n';
    if (n.type === 'mention') return `@${n.attrs?.label || n.attrs?.id || ''}`;
    if (n.type === 'image') return `![${n.attrs?.alt || ''}](${n.attrs?.src || ''})`;
    // Recurse for any other inline nodes
    if (n.content) return inlineContent(n.content);
    return '';
  }).join('');
}

// ── Block node helpers ──────────────────────────────────────────

function serializeHeading(node: JSONContent): string {
  const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6);
  const prefix = '#'.repeat(level);
  return `${prefix} ${inlineContent(node.content)}\n\n`;
}

function serializeParagraph(node: JSONContent): string {
  const text = inlineContent(node.content);
  return `${text}\n\n`;
}

function serializeList(
  node: JSONContent,
  kind: 'bullet' | 'ordered' | 'task',
  depth: number,
): string {
  if (!node.content) return '';
  let out = '';
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    if (kind === 'task') {
      out += serializeTaskItem(child, depth);
    } else if (kind === 'ordered') {
      out += serializeListItem(child, 'ordered', depth, i + 1);
    } else {
      out += serializeListItem(child, 'bullet', depth);
    }
  }
  // Only add trailing newline at top-level lists
  if (depth === 0) out += '\n';
  return out;
}

function serializeListItem(
  node: JSONContent,
  kind: 'bullet' | 'ordered',
  depth: number,
  index?: number,
): string {
  const indent = '  '.repeat(depth);
  const marker = kind === 'ordered' ? `${index || 1}.` : '-';

  if (!node.content) return `${indent}${marker} \n`;

  let out = '';
  let firstLine = true;

  for (const child of node.content) {
    if (child.type === 'paragraph') {
      const text = inlineContent(child.content);
      if (firstLine) {
        out += `${indent}${marker} ${text}\n`;
        firstLine = false;
      } else {
        // Continuation paragraphs in the same list item
        out += `${indent}  ${text}\n`;
      }
    } else if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
      // Nested list
      out += serializeList(child, child.type === 'orderedList' ? 'ordered' : child.type === 'taskList' ? 'task' : 'bullet', depth + 1);
    } else {
      // Other block content inside a list item
      out += serializeNode(child, depth + 1);
    }
  }

  return out;
}

function serializeTaskItem(node: JSONContent, depth: number): string {
  const indent = '  '.repeat(depth);
  const checked = node.attrs?.checked ? 'x' : ' ';

  if (!node.content) return `${indent}- [${checked}] \n`;

  let out = '';
  let firstLine = true;

  for (const child of node.content) {
    if (child.type === 'paragraph') {
      const text = inlineContent(child.content);
      if (firstLine) {
        out += `${indent}- [${checked}] ${text}\n`;
        firstLine = false;
      } else {
        out += `${indent}  ${text}\n`;
      }
    } else if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
      out += serializeList(child, child.type === 'orderedList' ? 'ordered' : child.type === 'taskList' ? 'task' : 'bullet', depth + 1);
    } else {
      out += serializeNode(child, depth + 1);
    }
  }

  return out;
}

function serializeBlockquote(node: JSONContent): string {
  if (!node.content) return '> \n\n';
  const inner = serializeNodes(node.content, 0);
  // Prefix each line with >
  const quoted = inner
    .trimEnd()
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
  return `${quoted}\n\n`;
}

function serializeCodeBlock(node: JSONContent): string {
  const lang = node.attrs?.language || '';
  const code = inlineContent(node.content);
  return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
}

function serializeImage(node: JSONContent): string {
  const alt = node.attrs?.alt || '';
  const src = node.attrs?.src || '';
  return `![${alt}](${src})\n\n`;
}

// ── Table serialization (GFM) ───────────────────────────────────

function serializeTable(node: JSONContent): string {
  if (!node.content) return '';

  const rows: string[][] = [];
  let isHeader = false;

  for (const row of node.content) {
    if (row.type !== 'tableRow' || !row.content) continue;
    const cells: string[] = [];
    let rowIsHeader = false;

    for (const cell of row.content) {
      if (cell.type === 'tableHeader') rowIsHeader = true;
      const text = cell.content
        ? cell.content.map((p) => inlineContent(p.content)).join(' ')
        : '';
      cells.push(text.replace(/\|/g, '\\|'));
    }

    if (rowIsHeader && !isHeader) isHeader = true;
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  // Determine column count from widest row
  const colCount = Math.max(...rows.map((r) => r.length));

  let out = '';
  for (let i = 0; i < rows.length; i++) {
    const padded = rows[i].concat(Array(colCount - rows[i].length).fill(''));
    out += `| ${padded.join(' | ')} |\n`;

    // Insert separator after header row (first row)
    if (i === 0) {
      out += `| ${Array(colCount).fill('---').join(' | ')} |\n`;
    }
  }

  return out + '\n';
}

// ── Spark custom nodes ──────────────────────────────────────────

function serializeGroupBlock(node: JSONContent): string {
  const name = node.attrs?.groupName || 'Untitled Group';
  const items = node.attrs?.items;
  const count = Array.isArray(items) ? items.length : 0;
  return `<!-- group: ${name} (${count} items) -->\n\n`;
}
