'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';
import { useCallback, useRef, useState } from 'react';
import { Pencil, Trash2, Check } from 'lucide-react';

// ─── Types ──────────────────────────────────────────

interface DrawingPath {
  d: string;
  color: string;
  width: number;
}

interface DrawingAttrs {
  paths: DrawingPath[];
  height: number;
}

// ─── Palette / stroke options ────────────────────────

const COLORS = [
  { value: '#222222', label: 'Black' },
  { value: '#6c5ce7', label: 'Purple' },
  { value: '#d62400', label: 'Red' },
  { value: '#007a52', label: 'Green' },
  { value: '#00b9e0', label: 'Blue' },
];

const WIDTHS = [1, 2, 4];

// ─── NodeView component ──────────────────────────────

function DrawingNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const attrs = node.attrs as DrawingAttrs;
  const svgRef = useRef<SVGSVGElement>(null);
  const [editing, setEditing] = useState(attrs.paths.length === 0);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState('');
  const [color, setColor] = useState('#222222');
  const [strokeWidth, setStrokeWidth] = useState(2);

  const getPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = attrs.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!editing) return;
    e.preventDefault();
    const pt = getPoint(e);
    if (!pt) return;
    setDrawing(true);
    setCurrent(`M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
  }, [editing, attrs.height]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing || !editing) return;
    const pt = getPoint(e);
    if (!pt) return;
    setCurrent(prev => `${prev} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
  }, [drawing, editing, attrs.height]);

  const onMouseUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    if (current.length > 8) {
      updateAttributes({ paths: [...attrs.paths, { d: current, color, width: strokeWidth }] });
    }
    setCurrent('');
  }, [drawing, current, attrs.paths, color, strokeWidth, updateAttributes]);

  const clearPaths = useCallback(() => {
    updateAttributes({ paths: [] });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper>
      <div
        className={`my-3 rounded-lg border overflow-hidden transition-colors ${
          selected ? 'border-venus-purple' : 'border-venus-gray-200'
        }`}
        data-drag-handle
      >
        {/* Editing toolbar */}
        {editing && (
          <div className="flex items-center gap-2 px-3 py-2 bg-venus-gray-50 border-b border-venus-gray-200">
            {COLORS.map(c => (
              <button
                key={c.value}
                onMouseDown={e => { e.preventDefault(); setColor(c.value); }}
                title={c.label}
                className={`w-4 h-4 rounded-full border-2 transition-transform ${
                  color === c.value ? 'border-venus-gray-600 scale-125' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
            <div className="w-px h-4 bg-venus-gray-300 mx-0.5" />
            {WIDTHS.map(w => (
              <button
                key={w}
                onMouseDown={e => { e.preventDefault(); setStrokeWidth(w); }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  strokeWidth === w
                    ? 'bg-venus-purple-light text-venus-purple'
                    : 'text-venus-gray-500 hover:bg-venus-gray-100'
                }`}
              >
                {w}px
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button
                onMouseDown={e => { e.preventDefault(); clearPaths(); }}
                className="p-1 rounded hover:bg-venus-red-light text-venus-gray-400 hover:text-venus-red transition-colors"
                title="Clear drawing"
              >
                <Trash2 size={13} />
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); setEditing(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-venus-purple-light text-venus-purple text-xs font-medium hover:bg-venus-purple/20 transition-colors"
              >
                <Check size={12} /> Done
              </button>
            </div>
          </div>
        )}

        {/* SVG canvas */}
        <div className="relative" style={{ background: editing ? '#fafbfe' : 'transparent' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 800 ${attrs.height}`}
            width="100%"
            height={attrs.height}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ display: 'block', cursor: editing ? 'crosshair' : 'default' }}
          >
            {attrs.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                stroke={p.color}
                strokeWidth={p.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {current && (
              <path
                d={current}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {/* Empty state */}
          {!editing && attrs.paths.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onMouseDown={e => { e.preventDefault(); setEditing(true); }}
                className="flex items-center gap-1.5 text-sm text-venus-gray-400 hover:text-venus-gray-600 transition-colors"
              >
                <Pencil size={14} />
                Click to draw
              </button>
            </div>
          )}

          {/* Edit button (view mode) */}
          {!editing && attrs.paths.length > 0 && (
            <button
              contentEditable={false}
              onMouseDown={e => { e.preventDefault(); setEditing(true); }}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 border border-venus-gray-200 text-venus-gray-500 hover:text-venus-gray-700 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
              title="Edit drawing"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extension ──────────────────────────────────────

export const DrawingExtension = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      paths: {
        default: [],
        parseHTML: el => JSON.parse(el.getAttribute('data-paths') || '[]'),
        renderHTML: attrs => ({ 'data-paths': JSON.stringify(attrs.paths) }),
      },
      height: { default: 200 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'drawing' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },

  addCommands() {
    return {
      insertDrawing: () => ({ commands }) => {
        return commands.insertContent({ type: 'drawing', attrs: { paths: [], height: 200 } });
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawing: { insertDrawing: () => ReturnType };
  }
}
