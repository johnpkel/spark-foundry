'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type Node,
  type OnSelectionChangeFunc,
  type OnNodesChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import SparkItemNode from './SparkItemNode';
import GroupBoundingBox from './GroupBoundingBox';
import CanvasFloatingToolbar from './CanvasFloatingToolbar';
import CanvasFloatingChat from './CanvasFloatingChat';
import {
  computeSwimlaneLayout,
  computeColumnHeaders,
  nextGroupColor,
  LAYOUT,
} from '@/lib/canvas-layout';
import type { SparkItem, CanvasState, CanvasGroup } from '@/lib/types';

// ── Node types (stable reference — must be outside component) ──
const NODE_TYPES = {
  sparkItem: SparkItemNode,
  columnHeader: ColumnHeaderNode,
  groupBox: GroupBoundingBox,
};

function ColumnHeaderNode({ data }: { data: { label: string; color: string; [key: string]: unknown } }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: data.color }}
      />
      <span className="text-xs font-semibold text-venus-gray-500 uppercase tracking-wide">
        {data.label}
      </span>
    </div>
  );
}

interface SparkCanvasProps {
  sparkId: string;
  items: SparkItem[];
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
}

export default function SparkCanvas({
  sparkId,
  items,
  canvasState,
  onCanvasStateChange,
}: SparkCanvasProps) {
  // ── Selection state ──
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [activeGroupChat, setActiveGroupChat] = useState<{ groupId: string; name: string; itemIds: string[]; sessionId?: string | null } | null>(null);

  // Debounce ref for position updates
  const positionTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;

  // ── Compute layout ──
  const positions = useMemo(
    () => computeSwimlaneLayout(items, canvasState.nodePositions),
    [items, canvasState.nodePositions],
  );

  // Sync new positions back to parent (deferred to avoid setState-during-render)
  const prevPositionCountRef = useRef(canvasState.nodePositions.length);
  useEffect(() => {
    if (positions.length > prevPositionCountRef.current) {
      const timer = setTimeout(() => {
        onCanvasStateChange({ ...canvasStateRef.current, nodePositions: positions });
      }, 0);
      prevPositionCountRef.current = positions.length;
      return () => clearTimeout(timer);
    }
    prevPositionCountRef.current = positions.length;
  }, [positions, onCanvasStateChange]);

  const columnHeaders = useMemo(() => computeColumnHeaders(items), [items]);

  // ── Group rename / delete (declared before initialNodes memo that references them) ──
  const handleGroupRename = useCallback((nodeId: string, newName: string) => {
    const groupId = nodeId.replace('group-', '');
    const updated = canvasStateRef.current.groups.map(g =>
      g.id === groupId ? { ...g, name: newName } : g,
    );
    onCanvasStateChange({ ...canvasStateRef.current, groups: updated });
  }, [onCanvasStateChange]);

  const handleGroupDelete = useCallback((nodeId: string) => {
    const groupId = nodeId.replace('group-', '');
    const updated = canvasStateRef.current.groups.filter(g => g.id !== groupId);
    onCanvasStateChange({ ...canvasStateRef.current, groups: updated });
  }, [onCanvasStateChange]);

  const handleGroupAskFoundry = useCallback((nodeId: string) => {
    const groupId = nodeId.replace('group-', '');
    const group = canvasStateRef.current.groups.find(g => g.id === groupId);
    if (group) {
      setActiveGroupChat({ groupId: group.id, name: group.name, itemIds: group.itemIds, sessionId: group.sessionId });
    }
  }, []);

  // ── Build React Flow nodes ──
  const initialNodes: Node[] = useMemo(() => {
    const posMap = new Map(positions.map(p => [p.itemId, p]));

    // Column headers
    const headers: Node[] = columnHeaders.map(h => ({
      id: `header-${h.type}`,
      type: 'columnHeader',
      position: { x: h.x, y: -8 },
      data: { label: h.label, color: h.color },
      selectable: false,
      draggable: false,
    }));

    // Item nodes
    const itemNodes: Node[] = items.map(item => {
      const pos = posMap.get(item.id);
      return {
        id: item.id,
        type: 'sparkItem',
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        data: { item },
      };
    });

    // Group bounding boxes
    const groupNodes: Node[] = canvasState.groups.map(group => {
      const memberPositions = group.itemIds
        .map(id => posMap.get(id))
        .filter(Boolean) as { x: number; y: number }[];

      if (memberPositions.length === 0) {
        return {
          id: `group-${group.id}`,
          type: 'groupBox',
          position: { x: 0, y: 0 },
          style: { width: 200, height: 100 },
          data: {
            label: group.name,
            color: group.color,
            itemCount: group.itemIds.length,
            onRename: handleGroupRename,
            onDelete: handleGroupDelete,
            onAskFoundry: handleGroupAskFoundry,
          },
        };
      }

      const pad = 24;
      const minX = Math.min(...memberPositions.map(p => p.x)) - pad;
      const minY = Math.min(...memberPositions.map(p => p.y)) - pad - 20;
      const maxX = Math.max(...memberPositions.map(p => p.x)) + LAYOUT.NODE_WIDTH + pad;
      const maxY = Math.max(...memberPositions.map(p => p.y)) + LAYOUT.NODE_HEIGHT + pad;

      return {
        id: `group-${group.id}`,
        type: 'groupBox',
        position: { x: minX, y: minY },
        style: { width: maxX - minX, height: maxY - minY },
        zIndex: -1,
        selectable: false,
        data: {
          label: group.name,
          color: group.color,
          itemCount: group.itemIds.length,
          onRename: handleGroupRename,
          onDelete: handleGroupDelete,
          onAskFoundry: handleGroupAskFoundry,
        },
      };
    });

    return [...groupNodes, ...headers, ...itemNodes];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, positions, columnHeaders, canvasState.groups]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);

  // Sync nodes when initialNodes change
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // ── Position change → debounced persist ──
  // Use a ref to snapshot node positions outside of setNodes updater,
  // avoiding setState-on-parent-during-render issues.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChangeBase(changes);

    // Check if any positions changed (drag ended)
    const positionChanges = changes.filter(
      c => c.type === 'position' && c.position && !c.dragging,
    );
    if (positionChanges.length === 0) return;

    if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
    positionTimerRef.current = setTimeout(() => {
      const currentNodes = nodesRef.current;
      const updated = canvasStateRef.current.nodePositions.map(p => {
        const node = currentNodes.find(n => n.id === p.itemId);
        if (node) return { ...p, x: node.position.x, y: node.position.y };
        return p;
      });
      onCanvasStateChange({ ...canvasStateRef.current, nodePositions: updated });
    }, 300);
  }, [onNodesChangeBase, onCanvasStateChange]);

  // ── Selection handling ──
  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selected }) => {
    const ids = selected
      .filter(n => n.type === 'sparkItem')
      .map(n => n.id);
    setSelectedNodeIds(ids);
  }, []);

  // ── Group CRUD ──
  const handleCreateGroup = useCallback((name: string) => {
    const usedColors = canvasStateRef.current.groups.map(g => g.color);
    const newGroup: CanvasGroup = {
      id: crypto.randomUUID(),
      name,
      itemIds: selectedNodeIds,
      color: nextGroupColor(usedColors),
      createdAt: new Date().toISOString(),
    };
    const updated = [...canvasStateRef.current.groups, newGroup];
    onCanvasStateChange({ ...canvasStateRef.current, groups: updated });
    setSelectedNodeIds([]);

    // Trigger embedding in background
    fetch('/api/canvas/embed-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spark_id: sparkId,
        item_ids: selectedNodeIds,
        group_name: name,
      }),
    }).catch(() => {});
  }, [selectedNodeIds, onCanvasStateChange, sparkId]);

  const handleClearSelection = useCallback(() => {
    setSelectedNodeIds([]);
    setNodes(ns => ns.map(n => ({ ...n, selected: false })));
  }, [setNodes]);

  const handleAskFoundry = useCallback(() => {
    setShowChat(true);
  }, []);

  const selectedItems = useMemo(
    () => items.filter(i => selectedNodeIds.includes(i.id)),
    [items, selectedNodeIds],
  );

  const groupChatItems = useMemo(
    () => activeGroupChat ? items.filter(i => activeGroupChat.itemIds.includes(i.id)) : [],
    [items, activeGroupChat],
  );

  // Persist session ID back to the group when a new conversation starts
  const handleGroupSessionCreated = useCallback((newSessionId: string) => {
    if (!activeGroupChat) return;
    const updated = canvasStateRef.current.groups.map(g =>
      g.id === activeGroupChat.groupId ? { ...g, sessionId: newSessionId } : g,
    );
    onCanvasStateChange({ ...canvasStateRef.current, groups: updated });
    setActiveGroupChat(prev => prev ? { ...prev, sessionId: newSessionId } : prev);
  }, [activeGroupChat, onCanvasStateChange]);

  return (
    <ReactFlowProvider>
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onSelectionChange={onSelectionChange}
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        selectionOnDrag
        panOnDrag={[1, 2]}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-surface !border-venus-gray-200"
        />
        <Controls className="!border-venus-gray-200 !shadow-sm" />
      </ReactFlow>

      {/* Floating toolbar for multi-select */}
      {selectedNodeIds.length >= 2 && (
        <CanvasFloatingToolbar
          selectedNodeIds={selectedNodeIds}
          onAskFoundry={handleAskFoundry}
          onCreateGroup={handleCreateGroup}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Floating chat — ad-hoc selection */}
      {showChat && selectedItems.length > 0 && (
        <CanvasFloatingChat
          sparkId={sparkId}
          selectedItems={selectedItems}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Floating chat — group */}
      {activeGroupChat && groupChatItems.length > 0 && (
        <CanvasFloatingChat
          key={activeGroupChat.groupId}
          sparkId={sparkId}
          selectedItems={groupChatItems}
          groupName={activeGroupChat.name}
          initialSessionId={activeGroupChat.sessionId}
          onSessionCreated={handleGroupSessionCreated}
          onClose={() => setActiveGroupChat(null)}
        />
      )}
    </div>
    </ReactFlowProvider>
  );
}
