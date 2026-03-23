'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Wand2, LayoutGrid, Loader2, Link2, Image, FileText,
  StickyNote, File, HardDrive, Box, Globe, Database, Paperclip, BarChart2,
  MessageSquare, MessageSquareText, Target, PanelRightClose, PanelRightOpen, BookOpen,
  Save, History, Pencil, Trash2, ChevronDown,
} from 'lucide-react';
import { SlackIcon } from '@/components/SlackIcon';
import IntegrationsStatus from '@/components/IntegrationsStatus';
import PrimaryDomains from '@/components/PrimaryDomains';
import { ThemeToggle } from '@/components/ThemeProvider';
import { ActivityLogButton } from '@/components/ActivityLogPanel';
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
import PresenceAvatars from '@/components/PresenceAvatars';
import type { CollabUser } from '@/components/PresenceAvatars';
import SparkCanvasDynamic from '@/components/canvas/SparkCanvasDynamic';
import DropOverlay from '@/components/DropOverlay';
import { useFileDrop } from '@/hooks/useFileDrop';
import type { CommentSubmitData } from '@/components/CommentPopover';
import { EditorContextProvider, useEditorContext } from '@/lib/editor-context';
import type { EditorSelection } from '@/lib/editor-context';
import type { JSONContent } from '@tiptap/react';
import type { Spark, SparkItem, GeneratedArtifact, ItemType, WebResearchItem, CommentThread, CanvasState, SparkVersion } from '@/lib/types';
import type { ScorePanelHandle } from '@/components/ScorePanel';
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
  const [collabUsers, setCollabUsers] = useState<CollabUser[]>([]);
  const [localClientId, setLocalClientId] = useState<number | null>(null);
  const [collabNameOverride, setCollabNameOverride] = useState<string | undefined>(undefined);

  // ── Version state ──────────────────────────────
  const [versions, setVersions] = useState<SparkVersion[]>([]);
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const scorePanelRef = useRef<ScorePanelHandle>(null);

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
        setLastSavedAt(new Date());
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

  // ── Primary domains update ─────────────────────────
  const updatePrimaryDomains = useCallback(async (domains: string[]) => {
    const currentSpark = sparkRef.current;
    if (!currentSpark) return;
    const merged = { ...(currentSpark.metadata ?? {}), primaryDomains: domains };
    setSpark(prev => prev ? { ...prev, metadata: merged } : prev);
    try {
      await fetch(`/api/sparks/${sparkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: merged }),
      });
    } catch {
      // silently fail
    }
  }, [sparkId]);

  const editorCtx = useEditorContext();

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

  // Resizable three-column layout
  const [leftWidth, setLeftWidth] = useState(420);
  const [rightWidth, setRightWidth] = useState(280);
  const [rightOpen, setRightOpen] = useState(true);
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
      const usedRight = rightOpen ? rightWidth : 0;
      const max = Math.min(rect.width * 0.4, rect.width - usedRight - minMiddle);
      setLeftWidth(Math.min(Math.max(raw, 240), max));
    } else {
      const raw = rect.right - e.clientX;
      const max = Math.min(rect.width * 0.35, rect.width - leftWidth - minMiddle);
      setRightWidth(Math.min(Math.max(raw, 200), max));
    }
  }, [leftWidth, rightWidth, rightOpen]);

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

  // Load versions on mount
  useEffect(() => {
    if (sparkId) loadVersions();
  }, [sparkId, loadVersions]);

  // Tick every 10s to update relative timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

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

  // Items panel file drop zone
  const itemsDrop = useFileDrop({ sparkId, onItemAdded: loadSparkData });

  const handleDeleteItem = async (itemId: string) => {
    const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== itemId));
      setCanvasState(prev => ({
        nodePositions: prev.nodePositions.filter(p => p.itemId !== itemId),
        groups: prev.groups
          .map(g => ({ ...g, itemIds: g.itemIds.filter(id => id !== itemId) }))
          .filter(g => g.itemIds.length > 0),
      }));
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
    file: { icon: File, label: 'Docs' },
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

  // ── Collaboration presence ────────────────────────
  const handlePresenceChange = useCallback((users: CollabUser[], clientId: number) => {
    setCollabUsers(users);
    setLocalClientId(clientId);
  }, []);

  const handleCollabNameChange = useCallback((name: string) => {
    setCollabNameOverride(name);
  }, []);

  // ── Tab config ──────────────────────────────────────
  const tabConfig: { id: LeftTab; icon: typeof LayoutGrid; label: string; count?: number }[] = [
    { id: 'items', icon: LayoutGrid, label: 'Items', count: items.length + researchItems.length || undefined },
    { id: 'graph', icon: Box, label: 'Knowledge Graph' },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
  ];

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 size={24} className="animate-spin text-venus-purple" />
      </div>
    );
  }

  if (!spark) return null;

  return (
    <div className="h-screen flex flex-col">

      {/* ── Unified Header ── */}
      <header className="h-14 bg-surface border-b border-venus-gray-200 flex items-center px-4 gap-3 shrink-0">
        {/* Left: back, icon, title */}
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-md hover:bg-venus-gray-100 text-venus-gray-500 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-7 h-7 rounded-lg bg-venus-purple-light flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--venus-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <h1 className="text-sm font-semibold text-venus-gray-700 truncate">{spark.name}</h1>

        {/* Right: presence, integrations, generate, logs, theme */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <PresenceAvatars
            users={collabUsers}
            localClientId={localClientId}
            onNameChange={handleCollabNameChange}
          />
          <IntegrationsStatus />
          <PrimaryDomains
            domains={(spark.metadata?.primaryDomains as string[]) ?? []}
            onUpdate={updatePrimaryDomains}
          />
          <button
            onClick={() => setLeftTab('generate')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Wand2 size={13} />
            Generate
          </button>
          <a
            href="/prd"
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100 rounded-md transition-colors"
            title="Product Requirements Document"
          >
            <FileText size={14} />
          </a>
          <a
            href="/docs"
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100 rounded-md transition-colors"
            title="Documentation"
          >
            <BookOpen size={14} />
          </a>
          <ActivityLogButton />
        </div>
      </header>

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
              <div className="flex-1 overflow-y-auto px-4 py-4 relative" {...itemsDrop.dragHandlers}>
                <DropOverlay isDragOver={itemsDrop.isDragOver} isUploading={itemsDrop.isUploading} />
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

            {/* Chat — always mounted to preserve state across tab switches */}
            <div className={`${leftTab === 'chat' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}`}>
              <ChatPanel sparkId={sparkId} itemCount={items.length} items={items} groups={canvasState.groups} onItemAdded={loadSparkData} />
            </div>

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
                          {v.scores && !!(v.scores as Record<string, unknown>).aiResult && (
                            <div className="text-[10px] text-green-500 mt-0.5">
                              Score: {String(((v.scores as Record<string, unknown>).aiResult as Record<string, unknown>)?.overallScore ?? '—')}
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

          {/* Editor view */}
          {middleView === 'editor' && (
            <div className="flex-1 min-h-0 relative">
              <SparkEditor
                sparkId={sparkId}
                onAskAI={handleAskAI}
                initialContent={spark.metadata?.editor_content as JSONContent | undefined}
                onContentChange={handleEditorChange}
                onCommentCreate={handleCommentCreate}
                onCommentMarkClick={handleCommentMarkClick}
                activeThreadId={activeThreadId}
                canvasGroups={canvasState.groups}
                sparkItems={items}
                onPresenceChange={handlePresenceChange}
                collabNameOverride={collabNameOverride}
                onItemAdded={loadSparkData}
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
                onItemAdded={loadSparkData}
              />
            </div>
          )}

        </div>

        {/* Right resize handle (only when open) */}
        {rightOpen && (
          <div
            onPointerDown={handlePointerDown('right')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-1 shrink-0 bg-venus-gray-200 hover:bg-venus-purple/40 active:bg-venus-purple/60 cursor-col-resize transition-colors touch-none"
          />
        )}

        {/* Right column: Discussions / Scoring (collapsible drawer) */}
        <div className="shrink-0 flex flex-col bg-surface border-l border-venus-gray-200" style={{ width: rightOpen ? rightWidth : 'auto' }}>
          {/* Tab bar with collapse toggle */}
          <div className="flex items-center gap-0.5 px-1.5 pt-3 pb-0 shrink-0 border-b border-venus-gray-200 bg-surface">
            <button
              onClick={() => setRightOpen(v => !v)}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-venus-gray-100 transition-colors -mb-px"
              title={rightOpen ? 'Collapse panel' : 'Expand panel'}
            >
              {rightOpen
                ? <PanelRightClose size={14} className="text-venus-gray-400" />
                : <PanelRightOpen size={14} className="text-venus-gray-400" />
              }
            </button>
            {rightOpen && ([
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
          {rightOpen && (
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
                <ScorePanel
                  ref={scorePanelRef}
                  sparkItems={items}
                  canvasGroups={canvasState.groups}
                  primaryDomains={(spark.metadata?.primaryDomains as string[]) ?? []}
                  sparkId={sparkId}
                  initialLyticsCache={(spark.metadata?.lyticsCache as Record<string, unknown>) ?? undefined}
                />
              )}
            </div>
          )}
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
