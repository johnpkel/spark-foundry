'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Link2, Image, FileText, StickyNote, File, HardDrive, Search, Check, Loader2, Unplug } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ItemType } from '@/lib/types';

interface AddItemModalProps {
  isOpen: boolean;
  sparkId: string;
  onClose: () => void;
  onAdded: () => void;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string;
  thumbnailLink?: string;
  webViewLink: string;
  modifiedTime: string;
  owners?: { displayName: string; emailAddress: string }[];
}

const itemTypes: { type: ItemType; label: string; icon: typeof Link2; description: string }[] = [
  { type: 'link', label: 'Link', icon: Link2, description: 'Add a URL to a webpage or resource' },
  { type: 'text', label: 'Text', icon: FileText, description: 'Add a block of text or article content' },
  { type: 'note', label: 'Note', icon: StickyNote, description: 'Add a quick note or observation' },
  { type: 'image', label: 'Image', icon: Image, description: 'Add an image URL' },
  { type: 'file', label: 'File', icon: File, description: 'Reference an external file' },
  { type: 'google_drive', label: 'Drive', icon: HardDrive, description: 'Add a file from Google Drive' },
];

const contentLabel: Record<string, string> = {
  link: 'URL',
  text: 'Content',
  note: 'Note',
  image: 'Image URL',
  file: 'File URL or Path',
  google_drive: 'Google Drive File',
};

const contentPlaceholder: Record<string, string> = {
  link: 'https://example.com/article',
  text: 'Paste or type your content here...',
  note: 'Write your note here...',
  image: 'https://example.com/image.jpg',
  file: 'https://example.com/document.pdf',
  google_drive: 'Search your Google Drive...',
};

export default function AddItemModal({ isOpen, sparkId, onClose, onAdded }: AddItemModalProps) {
  const [selectedType, setSelectedType] = useState<ItemType>('link');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Drive state
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null); // null = loading
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveQuery, setDriveQuery] = useState('');
  const [driveResults, setDriveResults] = useState<DriveFile[]>([]);
  const [driveSearching, setDriveSearching] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFile | null>(null);

  // Check Google Drive connection status when Drive tab is selected
  const checkDriveStatus = useCallback(async () => {
    setDriveConnected(null);
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      setDriveConnected(data.connected);
      setDriveEmail(data.email || null);
    } catch {
      setDriveConnected(false);
    }
  }, []);

  useEffect(() => {
    if (selectedType === 'google_drive' && isOpen) {
      checkDriveStatus();
    }
  }, [selectedType, isOpen, checkDriveStatus]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'google-auth') {
        if (event.data.status === 'success') {
          checkDriveStatus();
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkDriveStatus]);

  // Debounced Drive search — hooks must be above the early return
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeDriveSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setDriveResults([]);
      setDriveSearching(false);
      return;
    }
    setDriveSearching(true);
    try {
      const res = await fetch(`/api/google-drive/search?q=${encodeURIComponent(query)}`);
      if (res.status === 401) {
        setDriveConnected(false);
        return;
      }
      const data = await res.json();
      setDriveResults(data.files || []);
    } catch {
      // Network error
    } finally {
      setDriveSearching(false);
    }
  }, []);

  const handleDriveQueryChange = useCallback((value: string) => {
    setDriveQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeDriveSearch(value);
    }, 300);
  }, [executeDriveSearch]);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTags('');
    setSelectedType('link');
    setDriveQuery('');
    setDriveResults([]);
    setSelectedDriveFile(null);
    setDriveConnected(null);
    setDriveEmail(null);
  };

  const handleConnectGoogle = () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      '/api/auth/google',
      'google-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleDisconnect = async () => {
    await fetch('/api/auth/google/disconnect', { method: 'POST' });
    setDriveConnected(false);
    setDriveEmail(null);
    setDriveResults([]);
    setSelectedDriveFile(null);
  };

  const handleSelectDriveFile = (file: DriveFile) => {
    setSelectedDriveFile(file);
    if (!title.trim()) {
      setTitle(file.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (selectedType === 'google_drive' && !selectedDriveFile) return;

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
      if (selectedType === 'google_drive' && selectedDriveFile) {
        metadata.drive_file_id = selectedDriveFile.id;
        metadata.drive_mime_type = selectedDriveFile.mimeType;
        metadata.drive_icon_url = selectedDriveFile.iconLink;
        metadata.drive_thumbnail_url = selectedDriveFile.thumbnailLink || undefined;
        metadata.drive_web_view_link = selectedDriveFile.webViewLink;
        metadata.drive_modified_time = selectedDriveFile.modifiedTime;
        metadata.drive_export_status = 'pending';
        metadata.url = selectedDriveFile.webViewLink;
      }

      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          type: selectedType,
          title: title.trim(),
          content: selectedType === 'google_drive' ? undefined : content.trim() || undefined,
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

  const isTextArea = selectedType === 'text' || selectedType === 'note';
  const isDrive = selectedType === 'google_drive';

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
        <div className="flex gap-2 mb-5 flex-wrap">
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
          {/* Google Drive panel */}
          {isDrive && (
            <div className="mb-4">
              {driveConnected === null && (
                <div className="flex items-center justify-center py-8 text-venus-gray-400">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Checking connection...
                </div>
              )}

              {driveConnected === false && (
                <div className="text-center py-8">
                  <HardDrive size={32} className="mx-auto text-venus-gray-300 mb-3" />
                  <p className="text-sm text-venus-gray-500 mb-4">
                    Connect your Google Drive to search and add files
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
                  >
                    <HardDrive size={16} />
                    Connect Google Drive
                  </button>
                </div>
              )}

              {driveConnected === true && (
                <>
                  {/* Connected status + disconnect */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-venus-gray-500">
                      Connected as <span className="font-medium text-venus-gray-600">{driveEmail}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="flex items-center gap-1 text-xs text-venus-gray-400 hover:text-venus-red transition-colors"
                    >
                      <Unplug size={12} />
                      Disconnect
                    </button>
                  </div>

                  {/* Search input with typeahead */}
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-venus-gray-400" />
                    <input
                      type="text"
                      value={driveQuery}
                      onChange={(e) => handleDriveQueryChange(e.target.value)}
                      placeholder="Search your Google Drive..."
                      className="w-full pl-9 pr-9 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
                      autoFocus
                    />
                    {driveSearching && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-venus-gray-400 animate-spin" />
                    )}
                  </div>

                  {/* Search results */}
                  {driveResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-venus-gray-200 rounded-lg divide-y divide-venus-gray-100">
                      {driveResults.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => handleSelectDriveFile(file)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-venus-gray-50 transition-colors ${
                            selectedDriveFile?.id === file.id ? 'bg-venus-purple-light' : ''
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file.iconLink}
                            alt=""
                            className="w-5 h-5 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-venus-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-venus-gray-400">
                              {formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true })}
                            </p>
                          </div>
                          {selectedDriveFile?.id === file.id && (
                            <Check size={16} className="text-venus-purple shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {driveSearching && driveResults.length === 0 && driveQuery.trim() && (
                    <div className="flex items-center justify-center py-6 text-venus-gray-400">
                      <Loader2 size={16} className="animate-spin mr-2" />
                      Searching Drive...
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Standard title input — always shown (except when Drive is not connected) */}
          {(!isDrive || driveConnected === true) && (
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
                autoFocus={!isDrive}
              />
            </div>
          )}

          {/* Content input — hidden for Drive items */}
          {!isDrive && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-venus-gray-600 mb-1.5">
                {contentLabel[selectedType]}
              </label>
              {isTextArea ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={contentPlaceholder[selectedType]}
                  rows={5}
                  className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={contentPlaceholder[selectedType]}
                  className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors"
                />
              )}
            </div>
          )}

          {/* Tags — shown for connected Drive items and all non-Drive types */}
          {(!isDrive || driveConnected === true) && (
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
          )}

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
              disabled={
                loading ||
                (isDrive ? !selectedDriveFile || !title.trim() : !title.trim())
              }
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
