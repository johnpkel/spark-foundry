import { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Sparkles, FolderPlus, X, Check } from 'lucide-react';

interface CanvasFloatingToolbarProps {
  selectedNodeIds: string[];
  onAskFoundry: () => void;
  onCreateGroup: (name: string) => void;
  onClearSelection: () => void;
}

export default function CanvasFloatingToolbar({
  selectedNodeIds,
  onAskFoundry,
  onCreateGroup,
  onClearSelection,
}: CanvasFloatingToolbarProps) {
  const { getNodes } = useReactFlow();
  const [naming, setNaming] = useState(false);
  const [groupName, setGroupName] = useState('');

  // Compute bounding box of selected nodes for positioning
  const selectedNodes = getNodes().filter(n => selectedNodeIds.includes(n.id));
  if (selectedNodes.length < 2) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity;
  for (const n of selectedNodes) {
    const x = n.position.x;
    const y = n.position.y;
    const w = (n.measured?.width ?? n.width ?? 200) as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
  }

  const centerX = (minX + maxX) / 2;
  const topY = minY - 52;

  const handleSubmitGroup = useCallback(() => {
    const name = groupName.trim() || `Group ${Date.now()}`;
    onCreateGroup(name);
    setNaming(false);
    setGroupName('');
  }, [groupName, onCreateGroup]);

  return (
    <div
      className="absolute z-40 pointer-events-auto"
      style={{
        left: centerX,
        top: topY,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-1.5 bg-card-bg border border-venus-gray-200 rounded-lg shadow-lg px-2.5 py-1.5 animate-in fade-in duration-150">
        {naming ? (
          <form
            onSubmit={e => { e.preventDefault(); handleSubmitGroup(); }}
            className="flex items-center gap-1.5"
          >
            <input
              autoFocus
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Group name..."
              className="text-xs px-2 py-1 rounded border border-venus-gray-200 bg-surface text-venus-gray-700 w-32 outline-none focus:border-venus-purple"
            />
            <button
              type="submit"
              className="p-1 rounded hover:bg-venus-gray-100 text-venus-green transition-colors"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setNaming(false); setGroupName(''); }}
              className="p-1 rounded hover:bg-venus-gray-100 text-venus-gray-400 transition-colors"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            {/* Selection count */}
            <span className="text-[10px] font-medium text-venus-gray-500 px-1.5 py-0.5 bg-venus-gray-100 rounded-full">
              {selectedNodeIds.length} items
            </span>

            {/* Ask Foundry */}
            <button
              onClick={onAskFoundry}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-venus-purple text-white text-xs font-medium hover:bg-venus-purple-deep transition-colors"
            >
              <Sparkles size={12} />
              Ask Foundry
            </button>

            {/* Create Group */}
            <button
              onClick={() => setNaming(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-venus-gray-600 hover:bg-venus-gray-100 transition-colors"
            >
              <FolderPlus size={12} />
              Group
            </button>

            {/* Clear selection */}
            <button
              onClick={onClearSelection}
              className="p-1 rounded hover:bg-venus-gray-100 text-venus-gray-400 transition-colors"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
