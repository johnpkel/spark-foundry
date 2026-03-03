import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Pencil, Trash2, Sparkles } from 'lucide-react';

interface GroupNodeData {
  label: string;
  color: string;
  itemCount: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAskFoundry: (id: string) => void;
  [key: string]: unknown;
}

function GroupBoundingBox({ id, data }: NodeProps & { data: GroupNodeData }) {
  const { label, color, itemCount, onRename, onDelete, onAskFoundry } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label) {
      onRename(id, trimmed);
    }
    setIsEditing(false);
  }, [editValue, label, id, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      setEditValue(label);
      setIsEditing(false);
    }
  }, [commitRename, label]);

  return (
    <div
      className="canvas-group-box w-full h-full"
      style={{ borderColor: color, backgroundColor: `${color}14` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        color={color}
        isVisible={false}
        minWidth={120}
        minHeight={80}
      />

      {/* Label pill */}
      <div
        className="absolute -top-0 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-b-md text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="bg-transparent text-white text-xs font-medium outline-none w-24 placeholder:text-white/60"
            placeholder="Group name"
          />
        ) : (
          <span className="truncate max-w-[120px]">{label}</span>
        )}
        <span className="text-[10px] opacity-80">{itemCount}</span>

        {hovered && !isEditing && (
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAskFoundry(id); }}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
              title="Ask Foundry about this group"
            >
              <Sparkles size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(id); }}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(GroupBoundingBox);
