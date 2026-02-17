'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Wand2, LayoutGrid, Loader2 } from 'lucide-react';
import ItemCard from '@/components/ItemCard';
import AddItemModal from '@/components/AddItemModal';
import ChatPanel from '@/components/ChatPanel';
import ArtifactGenerator from '@/components/ArtifactGenerator';
import type { Spark, SparkItem, GeneratedArtifact } from '@/lib/types';

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
  const [showAddItemModal, setShowAddItemModal] = useState(false);

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

  const leftTabs: { id: LeftTab; label: string; icon: typeof LayoutGrid; count?: number }[] = [
    { id: 'items', label: 'Items', icon: LayoutGrid, count: items.length },
    { id: 'generate', label: 'Generate', icon: Wand2, count: artifacts.length },
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
        </div>
      </div>

      {/* Split layout: Items/Generate on left, Chat on right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Items + Generate */}
        <div className="flex-1 flex flex-col border-r border-venus-gray-200 min-w-0">
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
              <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-venus-gray-500 uppercase tracking-wider">
                    {items.length} {items.length === 1 ? 'Item' : 'Items'}
                  </h3>
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus size={14} />
                    Add Item
                  </button>
                </div>

                {items.length > 0 ? (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onDelete={handleDeleteItem}
                      />
                    ))}
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

        {/* Right panel: Chat (always visible) */}
        <div className="w-[420px] shrink-0 flex flex-col bg-white">
          <ChatPanel sparkId={sparkId} itemCount={items.length} />
        </div>
      </div>

      <AddItemModal
        isOpen={showAddItemModal}
        sparkId={sparkId}
        onClose={() => setShowAddItemModal(false)}
        onAdded={loadSparkData}
      />
    </div>
  );
}
