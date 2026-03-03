'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Wand2, LayoutGrid, Loader2, Link2, Image, FileText,
  StickyNote, File, HardDrive, Box, Globe, Database, Paperclip, BarChart2,
  MessageSquare, MessageSquareText, Target,
} from 'lucide-react';
import { SlackIcon } from '@/components/SlackIcon';
import IntegrationsStatus from '@/components/IntegrationsStatus';
import ItemCard from '@/components/ItemCard';
import WebResearchCard from '@/components/WebResearchCard';
import AddItemModal from '@/components/AddItemModal';
import ChatPanel from '@/components/ChatPanel';
import ArtifactGenerator from '@/components/ArtifactGenerator';
import ScorePanel from '@/components/ScorePanel';
import DiscussionsPanel from '@/components/DiscussionsPanel';
import ImageLightbox from '@/components/ImageLightbox';
import ItemsVectorSpace from '@/components/ItemsVectorSpaceDynamic';
import SparkEditor from '@/components/SparkEditor';
import SparkCanvasDynamic from '@/components/canvas/SparkCanvasDynamic';
import type { CommentSubmitData } from '@/components/CommentPopover';
import { EditorContextProvider, useEditorContext } from '@/lib/editor-context';
import type { EditorSelection } from '@/lib/editor-context';
import type { JSONContent } from '@tiptap/react';
import type { Spark, SparkItem, GeneratedArtifact, ItemType, WebResearchItem, CommentThread, CanvasState } from '@/lib/types';
import { PenLine, LayoutDashboard } from 'lucide-react';

type LeftTab = 'items' | 'graph' | 'chat' | 'generate';
type RightTab = 'discussions' | 'scoring';
type MiddleView = 'editor' | 'canvas';

/** Thin wrapper — provides the editor context that SparkEditor and ChatPanel share */
export default function SparkWorkspace() {
  return (
    <EditorContextProvider>
      <SparkWorkspacePage />
    </EditorContextProvider>
  );
}

function SparkWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const sparkId = params.id as string;

  const [spark, setSpark] = useState<Spark | null>(null);
  const [items, setItems] = useState<SparkItem[]>([]);
  const [researchItems, setResearchItems] = useState<WebResearchItem[]>([]);
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('items');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ItemType | 'web_research' | 'all'>('all');
  const [lightbox, setLightbox] = useState<{ src: string; alt?: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [rightTab, setRightTab] = useState<RightTab>('discussions');
  const [discussions, setDiscussions] = useState<CommentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [middleView, setMiddleView] = useState<MiddleView>('editor');
  const [canvasState, setCanvasState] = useState<CanvasState>({ nodePositions: [], groups: [] });

  // ── Debounced editor auto-save ─────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);
  const sparkRef = useRef(spark);
  sparkRef.current = spark;

  const handleEditorChange = useCallback((content: JSONContent) => {
    // Clear any pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Abort any in-flight save
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSaveStatus('saving');
      try {
        const currentSpark = sparkRef.current;
        const merged = { ...(currentSpark?.metadata ?? {}), editor_content: content };
        const res = await fetch(`/api/sparks/${sparkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: merged }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('save failed');
        setSaveStatus('idle');
        // Keep local spark metadata in sync so next merge is correct
        if (currentSpark) {
          setSpark(prev => prev ? { ...prev, metadata: merged } : prev);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSaveStatus('error');
      }
    }, 1500);
  }, [sparkId]);

  // ── Debounced canvas auto-save ──────────────────
  const canvasSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const canvasAbortRef = useRef<AbortController>(null);

  const handleCanvasStateChange = useCallback((updated: CanvasState) => {
    setCanvasState(updated);
    if (canvasSaveTimerRef.current) clearTimeout(canvasSaveTimerRef.current);
    canvasSaveTimerRef.current = setTimeout(async () => {
      canvasAbortRef.current?.abort();
      const controller = new AbortController();
      canvasAbortRef.current = controller;
      try {
        const currentSpark = sparkRef.current;
        const merged = { ...(currentSpark?.metadata ?? {}), canvas: updated };
        const res = await fetch(`/api/sparks/${sparkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: merged }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('save failed');
        if (currentSpark) {
          setSpark(prev => prev ? { ...prev, metadata: merged } : prev);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }, 1000);
  }, [sparkId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      abortRef.current?.abort();
      if (discSaveTimerRef.current) clearTimeout(discSaveTimerRef.current);
      discAbortRef.current?.abort();
      if (canvasSaveTimerRef.current) clearTimeout(canvasSaveTimerRef.current);
      canvasAbortRef.current?.abort();
    };
  }, []);

  // ── Debounced discussion auto-save ──────────────────
  const discSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const discAbortRef = useRef<AbortController>(null);
  const discussionsRef = useRef(discussions);
  discussionsRef.current = discussions;

  const saveDiscussions = useCallback((updated: CommentThread[]) => {
    setDiscussions(updated);
    if (discSaveTimerRef.current) clearTimeout(discSaveTimerRef.current);
    discSaveTimerRef.current = setTimeout(async () => {
      discAbortRef.current?.abort();
      const controller = new AbortController();
      discAbortRef.current = controller;
      try {
        const currentSpark = sparkRef.current;
        const merged = { ...(currentSpark?.metadata ?? {}), discussions: updated };
        const res = await fetch(`/api/sparks/${sparkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: merged }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('save failed');
        if (currentSpark) {
          setSpark(prev => prev ? { ...prev, metadata: merged } : prev);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // silently fail for discussion save
      }
    }, 500);
  }, [sparkId]);

  // Resizable three-column layout
  const [leftWidth, setLeftWidth] = useState(420);
  const [rightWidth, setRightWidth] = useState(280);
  const draggingHandle = useRef<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (handle: 'left' | 'right') => (e: React.PointerEvent) => {
      draggingHandle.current = handle;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingHandle.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const minMiddle = 320;

    if (draggingHandle.current === 'left') {
      const raw = e.clientX - rect.left;
      const max = Math.min(rect.width * 0.4, rect.width - rightWidth - minMiddle);
      setLeftWidth(Math.min(Math.max(raw, 240), max));
    } else {
      const raw = rect.right - e.clientX;
      const max = Math.min(rect.width * 0.35, rect.width - leftWidth - minMiddle);
      setRightWidth(Math.min(Math.max(raw, 200), max));
    }
  }, [leftWidth, rightWidth]);

  const handlePointerUp = useCallback(() => {
    draggingHandle.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const loadSparkData = useCallback(async () => {
    try {
      const [sparkRes, researchRes] = await Promise.all([
        fetch(`/api/sparks/${sparkId}`),
        fetch(`/api/research?spark_id=${sparkId}`),
      ]);
      if (sparkRes.ok) {
        const data = await sparkRes.json();
        setSpark(data.spark);
        setItems(data.items);
        setArtifacts(data.artifacts);
        // Load persisted discussions from metadata
        const savedDiscussions = (data.spark.metadata?.discussions ?? []) as CommentThread[];
        // Load canvas state from metadata
        const savedCanvas = (data.spark.metadata?.canvas ?? { nodePositions: [], groups: [] }) as CanvasState;
        setCanvasState(savedCanvas);
        setDiscussions(savedDiscussions);
      } else {
        router.push('/');
      }
      if (researchRes.ok) {
        const researchData = await researchRes.json();
        setResearchItems(researchData);
      }
    } finally {
      setLoading(false);
    }
  }, [sparkId, router]);

  useEffect(() => {
    loadSparkData();
  }, [loadSparkData]);

  const handleDeleteItem = async (itemId: string) => {
    const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== itemId));
    }
  };

  const handleItemUpdated = useCallback((updated: SparkItem) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }, []);

  const handleDeleteResearch = async (researchId: string) => {
    const res = await fetch(`/api/research/${researchId}`, { method: 'DELETE' });
    if (res.ok) {
      setResearchItems(prev => prev.filter(r => r.id !== researchId));
    }
  };

  const typeFilterConfig: Record<string, { icon: typeof Link2; label: string }> = {
    link: { icon: Link2, label: 'Links' },
    image: { icon: Image, label: 'Images' },
    text: { icon: FileText, label: 'Text' },
    file: { icon: File, label: 'Files' },
    note: { icon: StickyNote, label: 'Notes' },
    google_drive: { icon: HardDrive, label: 'Drive' },
    web_research: { icon: Globe, label: 'Research' },
    slack_message: { icon: SlackIcon as unknown as typeof Link2, label: 'Slack' },
    contentstack_entry: { icon: Database, label: 'Entries' },
    contentstack_asset: { icon: Paperclip, label: 'Assets' },
    clarity_insight: { icon: BarChart2, label: 'Clarity' },
  };

  const availableTypes: string[] = [
    ...new Set(items.map((i) => i.type)),
    ...(researchItems.length > 0 ? ['web_research'] : []),
  ];
  const filteredItems = typeFilter === 'all' || typeFilter === 'web_research'
    ? items
    : items.filter((i) => i.type === typeFilter);

  const handleImageClick = useCallback((src: string, alt?: string) => {
    setLightbox({ src, alt });
  }, []);

  // ── Editor "Ask AI" handler ─────────────────────────
  const editorCtx = useEditorContext();
  const handleAskAI = useCallback((sel: EditorSelection) => {
    editorCtx?.setSelectedText(sel);
    setLeftTab('chat');
  }, [editorCtx]);

  // ── Discussion handlers ────────────────────────────
  const handleCommentCreate = useCallback((data: CommentSubmitData) => {
    const thread: CommentThread = {
      id: data.threadId,
      selectedText: data.selectedText,
      resolved: false,
      createdAt: new Date().toISOString(),
      comments: [{
        id: crypto.randomUUID(),
        authorId: data.authorId,
        authorName: data.authorName,
        content: data.commentText,
        createdAt: new Date().toISOString(),
      }],
    };
    const updated = [...discussionsRef.current, thread];
    saveDiscussions(updated);
    setActiveThreadId(thread.id);
    setRightTab('discussions');
  }, [saveDiscussions]);

  const handleResolveThread = useCallback((threadId: string) => {
    const updated = discussionsRef.current.map(t =>
      t.id === threadId ? { ...t, resolved: true } : t,
    );
    saveDiscussions(updated);
    // Also update the editor mark to reflect resolved state
    editorCtx?.getEditor()?.commands.resolveComment(threadId);
    setActiveThreadId(null);
  }, [saveDiscussions, editorCtx]);

  const handleAddReply = useCallback((threadId: string, text: string) => {
    const reply = {
      id: crypto.randomUUID(),
      authorId: 'current-user',
      authorName: 'You',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const updated = discussionsRef.current.map(t =>
      t.id === threadId ? { ...t, comments: [...t.comments, reply] } : t,
    );
    saveDiscussions(updated);
  }, [saveDiscussions]);

  const handleCommentMarkClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setRightTab('discussions');
  }, []);

  // ── Tab config ──────────────────────────────────────
  const tabConfig: { id: LeftTab; icon: typeof LayoutGrid; label: string; count?: number }[] = [
    { id: 'items', icon: LayoutGrid, label: 'Items', count: items.length + researchItems.length || undefined },
    { id: 'graph', icon: Box, label: 'Knowledge Graph' },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 size={24} className="animate-spin text-venus-purple" />
      </div>
    );
  }

  if (!spark) return null;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">

      {/* ── Spark Header ── */}
      <div className="bg-surface border-b border-venus-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-1.5 rounded-md hover:bg-venus-gray-100 text-venus-gray-500 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-8 h-8 rounded-lg bg-venus-purple-light flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--venus-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-venus-gray-700 truncate">{spark.name}</h2>
            {spark.description && (
              <p className="text-sm text-venus-gray-500 truncate">{spark.description}</p>
            )}
          </div>
          <IntegrationsStatus />
          <button
            onClick={() => setLeftTab('generate')}
            className="flex items-center gap-2 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            <Wand2 size={15} />
            Generate
          </button>
        </div>
      </div>

      {/* ── Three-column layout ── */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">

        {/* Left column: Items / Graph / Chat / Generate */}
        <div className="shrink-0 flex flex-col border-r border-venus-gray-200" style={{ width: leftWidth }}>

          {/* Tab bar */}
          <div className="flex items-center gap-0.5 px-3 pt-3 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            {tabConfig.map(({ id, icon: Icon, label, count }) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                  leftTab === id
                    ? 'border-venus-purple text-venus-purple bg-venus-purple-light/50'
                    : 'border-transparent text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100'
                }`}
              >
                <Icon size={13} />
                {label}
                {count != null && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                    leftTab === id
                      ? 'bg-venus-purple/10 text-venus-purple'
                      : 'bg-venus-gray-200 text-venus-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}

            {/* Add Item — only on items/graph tabs */}
            {(leftTab === 'items' || leftTab === 'graph') && (
              <button
                onClick={() => setShowAddItemModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 ml-auto mb-1 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-medium rounded-md transition-colors shrink-0"
              >
                <Plus size={13} />
                Add
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

            {/* Items list */}
            {leftTab === 'items' && (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {/* Type filter chips */}
                {availableTypes.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <button
                      onClick={() => setTypeFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        typeFilter === 'all'
                          ? 'bg-venus-purple text-white'
                          : 'bg-venus-gray-100 text-venus-gray-500 hover:bg-venus-gray-200'
                      }`}
                    >
                      All
                    </button>
                    {availableTypes.map((type) => {
                      const cfg = typeFilterConfig[type];
                      if (!cfg) return null;
                      const FilterIcon = cfg.icon;
                      const count = type === 'web_research'
                        ? researchItems.length
                        : items.filter((i) => i.type === type).length;
                      return (
                        <button
                          key={type}
                          onClick={() => setTypeFilter(typeFilter === type ? 'all' : type as ItemType | 'web_research')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            typeFilter === type
                              ? 'bg-venus-purple text-white'
                              : 'bg-venus-gray-100 text-venus-gray-500 hover:bg-venus-gray-200'
                          }`}
                        >
                          <FilterIcon size={11} />
                          {cfg.label}
                          <span className={`${typeFilter === type ? 'text-white/70' : 'text-venus-gray-400'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {typeFilter === 'web_research' ? (
                  researchItems.length > 0 ? (
                    <div className="space-y-3">
                      {researchItems.map((ri) => (
                        <WebResearchCard key={ri.id} item={ri} onDelete={handleDeleteResearch} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-venus-gray-500">No research items yet.</p>
                      <p className="text-xs text-venus-gray-400 mt-1">Ask the assistant to research a topic to get started.</p>
                    </div>
                  )
                ) : (filteredItems.length > 0 || (typeFilter === 'all' && researchItems.length > 0)) ? (
                  <div className="space-y-3">
                    {filteredItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onDelete={handleDeleteItem}
                        onItemUpdated={handleItemUpdated}
                        onImageClick={handleImageClick}
                      />
                    ))}
                    {typeFilter === 'all' && researchItems.map((ri) => (
                      <WebResearchCard key={ri.id} item={ri} onDelete={handleDeleteResearch} />
                    ))}
                  </div>
                ) : items.length > 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-venus-gray-500">No items match this filter.</p>
                    <button
                      onClick={() => setTypeFilter('all')}
                      className="text-sm text-venus-purple hover:text-venus-purple-deep mt-2 transition-colors"
                    >
                      Clear filter
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 rounded-xl bg-venus-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Plus size={20} className="text-venus-gray-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-venus-gray-700 mb-1">No items yet</h3>
                    <p className="text-sm text-venus-gray-500 mb-4">
                      Add links, text, images, and notes to build your Spark.
                    </p>
                    <button
                      onClick={() => setShowAddItemModal(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Plus size={14} />
                      Add First Item
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Knowledge Graph */}
            {leftTab === 'graph' && (
              <div className="flex-1 min-h-0 p-4 flex flex-col">
                <div className="flex-1 min-h-0 rounded-lg border border-venus-gray-200 bg-venus-gray-50 overflow-hidden">
                  <ItemsVectorSpace sparkId={sparkId} />
                </div>
              </div>
            )}

            {/* Chat */}
            {leftTab === 'chat' && (
              <ChatPanel sparkId={sparkId} itemCount={items.length} />
            )}

            {/* Generate */}
            {leftTab === 'generate' && (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <ArtifactGenerator
                  sparkId={sparkId}
                  artifacts={artifacts}
                  onGenerated={loadSparkData}
                />
              </div>
            )}

          </div>
        </div>

        {/* Left resize handle */}
        <div
          onPointerDown={handlePointerDown('left')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-1 shrink-0 bg-venus-gray-200 hover:bg-venus-purple/40 active:bg-venus-purple/60 cursor-col-resize transition-colors touch-none"
        />

        {/* Middle column: Editor / Canvas */}
        <div className="relative flex-1 flex flex-col min-w-0 bg-surface">
          {/* View toggle bar */}
          <div className="flex items-center gap-0.5 px-3 pt-2 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            {([
              { id: 'editor' as MiddleView, icon: PenLine, label: 'Editor' },
              { id: 'canvas' as MiddleView, icon: LayoutDashboard, label: 'Canvas' },
            ]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMiddleView(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                  middleView === id
                    ? 'border-venus-purple text-venus-purple bg-venus-purple-light/50'
                    : 'border-transparent text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Editor view */}
          {middleView === 'editor' && (
            <div className="flex-1 min-h-0 relative">
              <SparkEditor
                onAskAI={handleAskAI}
                initialContent={spark.metadata?.editor_content as JSONContent | undefined}
                onContentChange={handleEditorChange}
                onCommentCreate={handleCommentCreate}
                onCommentMarkClick={handleCommentMarkClick}
                activeThreadId={activeThreadId}
                canvasGroups={canvasState.groups}
                sparkItems={items}
              />
            </div>
          )}

          {/* Canvas view */}
          {middleView === 'canvas' && (
            <div className="flex-1 min-h-0">
              <SparkCanvasDynamic
                sparkId={sparkId}
                items={items}
                canvasState={canvasState}
                onCanvasStateChange={handleCanvasStateChange}
              />
            </div>
          )}

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
        </div>

        {/* Right resize handle */}
        <div
          onPointerDown={handlePointerDown('right')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-1 shrink-0 bg-venus-gray-200 hover:bg-venus-purple/40 active:bg-venus-purple/60 cursor-col-resize transition-colors touch-none"
        />

        {/* Right column: Discussions / Scoring */}
        <div className="shrink-0 flex flex-col bg-surface border-l border-venus-gray-200" style={{ width: rightWidth }}>
          {/* Right tab bar */}
          <div className="flex items-center gap-0.5 px-3 pt-3 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            {([
              { id: 'discussions' as RightTab, icon: MessageSquareText, label: 'Discussions', count: discussions.filter(t => !t.resolved).length || undefined },
              { id: 'scoring' as RightTab, icon: Target, label: 'Scoring', count: undefined as number | undefined },
            ]).map(({ id, icon: Icon, label, count }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                  rightTab === id
                    ? 'border-venus-purple text-venus-purple bg-venus-purple-light/50'
                    : 'border-transparent text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100'
                }`}
              >
                <Icon size={13} />
                {label}
                {count != null && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                    rightTab === id
                      ? 'bg-venus-purple/10 text-venus-purple'
                      : 'bg-venus-gray-200 text-venus-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {rightTab === 'discussions' ? (
              <DiscussionsPanel
                discussions={discussions}
                activeThreadId={activeThreadId}
                onActivateThread={setActiveThreadId}
                onResolveThread={handleResolveThread}
                onAddReply={handleAddReply}
              />
            ) : (
              <ScorePanel sparkItems={items} canvasGroups={canvasState.groups} />
            )}
          </div>
        </div>

      </div>

      <AddItemModal
        isOpen={showAddItemModal}
        sparkId={sparkId}
        onClose={() => setShowAddItemModal(false)}
        onAdded={loadSparkData}
      />

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

    </div>
  );
}
