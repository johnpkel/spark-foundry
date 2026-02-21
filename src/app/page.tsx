'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Search } from 'lucide-react';
import SparkCard from '@/components/SparkCard';
import CreateSparkModal from '@/components/CreateSparkModal';
import type { Spark } from '@/lib/types';

export default function Dashboard() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const loadSparks = useCallback(async () => {
    try {
      const res = await fetch('/api/sparks');
      if (res.ok) {
        const data = await res.json();
        setSparks(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSparks();
  }, [loadSparks]);

  const handleDeleteSpark = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Spark? This cannot be undone.')) return;

    const res = await fetch(`/api/sparks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadSparks();
    }
  };

  const filteredSparks = sparks.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-venus-gray-700">Your Sparks</h2>
          <p className="text-sm text-venus-gray-500 mt-1">
            Collect, organize, and transform information into business artifacts
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Spark
        </button>
      </div>

      {/* Search */}
      {sparks.length > 0 && (
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-venus-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sparks..."
            className="w-full pl-10 pr-4 py-2.5 border border-venus-gray-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
          />
        </div>
      )}

      {/* Sparks grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card-bg rounded-xl border border-venus-gray-200 p-5 animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-venus-gray-100 mb-3" />
              <div className="h-5 bg-venus-gray-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-venus-gray-100 rounded w-full mb-4" />
              <div className="h-px bg-venus-gray-100 mb-3" />
              <div className="h-3 bg-venus-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredSparks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSparks.map((spark) => (
            <SparkCard
              key={spark.id}
              spark={spark}
              onClick={() => router.push(`/spark/${spark.id}`)}
              onDelete={handleDeleteSpark}
            />
          ))}
        </div>
      ) : sparks.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-venus-purple-light flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-venus-purple" />
          </div>
          <h3 className="text-lg font-semibold text-venus-gray-700 mb-2">Create your first Spark</h3>
          <p className="text-sm text-venus-gray-500 mb-6 max-w-sm mx-auto">
            A Spark is a workspace where you collect links, images, notes, and other information — then use AI to transform it into business artifacts.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Spark
          </button>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-venus-gray-500">No sparks match your search.</p>
        </div>
      )}

      <CreateSparkModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadSparks}
      />
    </div>
  );
}
