'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Wand2, LayoutGrid, Loader2, Link2, Image, FileText, StickyNote, File, HardDrive, Box } from 'lucide-react';
import ItemCard from '@/components/ItemCard';
import AddItemModal from '@/components/AddItemModal';
import ChatPanel from '@/components/ChatPanel';
import ArtifactGenerator from '@/components/ArtifactGenerator';
import ScorePanel from '@/components/ScorePanel';
import ImageLightbox from '@/components/ImageLightbox';
import ItemsVectorSpace from '@/components/ItemsVectorSpaceDynamic';
import type { Spark, SparkItem, GeneratedArtifact, ItemType } from '@/lib/types';

type LeftTab = 'items' | 'generate';

export default function SparkWorkspace() {
  const params = useParams();
  const router = useRouter();
  const sparkId = params.id as string;

  const [spark, setSpark] = useState<Spark | null>(null);
  const [items, setItems] = useState<SparkItem[]>([]);
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('items');
  const [itemsView, setItemsView] = useState<'list' | 'space'>('list');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');
  const [lightbox, setLightbox] = useState<{ src: string; alt?: string } | null>(null);

  // Resizable three-column layout
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(300);
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
    const minMiddle = 300;

    if (draggingHandle.current === 'left') {
      const raw = e.clientX - rect.left;
      const max = Math.min(rect.width * 0.4, rect.width - rightWidth - minMiddle);
      setLeftWidth(Math.min(Math.max(raw, 240), max));
    } else {
      const raw = rect.right - e.clientX;
      const max = Math.min(rect.width * 0.35, rect.width - leftWidth - minMiddle);
      setRightWidth(Math.min(Math.max(raw, 240), max));
    }
  }, [leftWidth, rightWidth]);

  const handlePointerUp = useCallback(() => {
    draggingHandle.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const loadSparkData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sparks/${sparkId}`);
      if (res.ok) {
        const data = await res.json();
        setSpark(data.spark);
        setItems(data.items);
        setArtifacts(data.artifacts);
      } else {
        router.push('/');
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

  const leftTabs: { id: LeftTab; label: string; icon: typeof LayoutGrid; count?: number }[] = [
    { id: 'items', label: 'Items', icon: LayoutGrid, count: items.length },
    { id: 'generate', label: 'Generate', icon: Wand2, count: artifacts.length },
  ];

  const typeFilterConfig: Record<string, { icon: typeof Link2; label: string }> = {
    link: { icon: Link2, label: 'Links' },
    image: { icon: Image, label: 'Images' },
    text: { icon: FileText, label: 'Text' },
    file: { icon: File, label: 'Files' },
    note: { icon: StickyNote, label: 'Notes' },
    google_drive: { icon: HardDrive, label: 'Drive' },
  };

  // Only show filter chips for types that exist in items
  const availableTypes = [...new Set(items.map((i) => i.type))];
  const filteredItems = typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter);

  const handleImageClick = useCallback((src: string, alt?: string) => {
    setLightbox({ src, alt });
  }, []);

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
      {/* Spark Header */}
      <div className="bg-white border-b border-venus-gray-200 px-6 py-4 shrink-0">
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
          <button
            onClick={() => setLeftTab('generate')}
            className="flex items-center gap-2 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            <Wand2 size={15} />
            Generate
          </button>
        </div>
      </div>

      {/* Three-column layout: Items/Generate | Chat | Scoring */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left column: Items + Generate */}
        <div className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          {/* Left tab bar */}
          <div className="flex items-center gap-1 px-6 pt-4 pb-2 shrink-0">
            {leftTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    leftTab === tab.id
                      ? 'bg-venus-purple-light text-venus-purple'
                      : 'text-venus-gray-500 hover:bg-venus-gray-100 hover:text-venus-gray-700'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      leftTab === tab.id
                        ? 'bg-venus-purple/10 text-venus-purple'
                        : 'bg-venus-gray-200 text-venus-gray-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Left tab content */}
          <div className="flex-1 overflow-y-auto">
            {leftTab === 'items' && (
              <div className={`${itemsView === 'space' ? 'flex flex-col h-full' : ''} px-6 py-4`}>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="text-sm font-medium text-venus-gray-500 uppercase tracking-wider">
                    {filteredItems.length} {filteredItems.length === 1 ? 'Item' : 'Items'}
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* List / 3D toggle */}
                    {items.length > 0 && (
                      <div className="flex items-center bg-venus-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setItemsView('list')}
                          className={`p-1.5 rounded-md transition-colors ${
                            itemsView === 'list'
                              ? 'bg-white text-venus-purple shadow-sm'
                              : 'text-venus-gray-400 hover:text-venus-gray-600'
                          }`}
                          title="List view"
                        >
                          <LayoutGrid size={14} />
                        </button>
                        <button
                          onClick={() => setItemsView('space')}
                          className={`p-1.5 rounded-md transition-colors ${
                            itemsView === 'space'
                              ? 'bg-white text-venus-purple shadow-sm'
                              : 'text-venus-gray-400 hover:text-venus-gray-600'
                          }`}
                          title="Vector space view"
                        >
                          <Box size={14} />
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => setShowAddItemModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Plus size={14} />
                      Add Item
                    </button>
                  </div>
                </div>

                {itemsView === 'space' ? (
                  /* 3D Vector Space View */
                  <div className="flex-1 min-h-0 rounded-lg border border-venus-gray-200 bg-venus-gray-50 overflow-hidden">
                    <ItemsVectorSpace sparkId={sparkId} />
                  </div>
                ) : (
                  <>
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
                          const FilterIcon = cfg.icon;
                          const count = items.filter((i) => i.type === type).length;
                          return (
                            <button
                              key={type}
                              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
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

                    {filteredItems.length > 0 ? (
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
                  </>
                )}
              </div>
            )}

            {leftTab === 'generate' && (
              <div className="px-6 py-4">
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

        {/* Middle column: Chat */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <ChatPanel sparkId={sparkId} itemCount={items.length} />
        </div>

        {/* Right resize handle */}
        <div
          onPointerDown={handlePointerDown('right')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-1 shrink-0 bg-venus-gray-200 hover:bg-venus-purple/40 active:bg-venus-purple/60 cursor-col-resize transition-colors touch-none"
        />

        {/* Right column: Content Scoring */}
        <div className="shrink-0 flex flex-col bg-white border-l border-venus-gray-200" style={{ width: rightWidth }}>
          <div className="flex-1 overflow-y-auto">
            <ScorePanel />
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
