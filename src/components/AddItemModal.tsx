'use client';

import { useState } from 'react';
import { X, Link2, Image, FileText, StickyNote, File } from 'lucide-react';
import type { ItemType } from '@/lib/types';

interface AddItemModalProps {
  isOpen: boolean;
  sparkId: string;
  onClose: () => void;
  onAdded: () => void;
}

const itemTypes: { type: ItemType; label: string; icon: typeof Link2; description: string }[] = [
  { type: 'link', label: 'Link', icon: Link2, description: 'Add a URL to a webpage or resource' },
  { type: 'text', label: 'Text', icon: FileText, description: 'Add a block of text or article content' },
  { type: 'note', label: 'Note', icon: StickyNote, description: 'Add a quick note or observation' },
  { type: 'image', label: 'Image', icon: Image, description: 'Add an image URL' },
  { type: 'file', label: 'File', icon: File, description: 'Reference an external file' },
];

export default function AddItemModal({ isOpen, sparkId, onClose, onAdded }: AddItemModalProps) {
  const [selectedType, setSelectedType] = useState<ItemType>('link');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTags('');
    setSelectedType('link');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const metadata: Record<string, unknown> = {};
      if (tags.trim()) {
        metadata.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (selectedType === 'link' && content) {
        metadata.url = content;
      }
      if (selectedType === 'image' && content) {
        metadata.image_url = content;
      }

      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          type: selectedType,
          title: title.trim(),
          content: content.trim() || undefined,
          metadata,
        }),
      });

      if (res.ok) {
        resetForm();
        onAdded();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const contentLabel = {
    link: 'URL',
    text: 'Content',
    note: 'Note',
    image: 'Image URL',
    file: 'File URL or Path',
  }[selectedType];

  const contentPlaceholder = {
    link: 'https://example.com/article',
    text: 'Paste or type your content here...',
    note: 'Write your note here...',
    image: 'https://example.com/image.jpg',
    file: 'https://example.com/document.pdf',
  }[selectedType];

  const isTextArea = selectedType === 'text' || selectedType === 'note';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 p-6" style={{ boxShadow: 'var(--venus-shadow-lg)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-venus-gray-700">Add Item to Spark</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-venus-gray-100 text-venus-gray-500">
            <X size={18} />
          </button>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-5">
          {itemTypes.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedType === type
                  ? 'bg-venus-purple text-white'
                  : 'bg-venus-gray-100 text-venus-gray-600 hover:bg-venus-gray-200'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-venus-gray-600 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this item a descriptive title"
              className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-venus-gray-600 mb-1.5">
              {contentLabel}
            </label>
            {isTextArea ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={contentPlaceholder}
                rows={5}
                className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors resize-none"
              />
            ) : (
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={contentPlaceholder}
                className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
              />
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-venus-gray-600 mb-1.5">
              Tags <span className="text-venus-gray-400 font-normal">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., research, competitor, design"
              className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-venus-gray-600 hover:bg-venus-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
