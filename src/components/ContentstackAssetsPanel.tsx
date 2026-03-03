'use client';

import { useState, useEffect, useCallback } from 'react';
import { Paperclip, Loader2, Check, ChevronDown, Search, FolderOpen, Image } from 'lucide-react';

interface ContentstackAssetsPanelProps {
  sparkId: string;
  onImported: () => void;
}

interface Stack {
  api_key: string;
  name: string;
  uid: string;
}

interface Asset {
  uid: string;
  title: string;
  filename: string;
  url: string;
  content_type: string;
  file_size: number;
}

interface AssetFolder {
  uid: string;
  name: string;
  is_dir: boolean;
  parent_uid?: string;
}

type Phase = 'checking' | 'not_connected' | 'pick_stack' | 'browse' | 'importing' | 'done';
type BrowseMode = 'search' | 'folder';

export default function ContentstackAssetsPanel({
  sparkId,
  onImported,
}: ContentstackAssetsPanelProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [stackDropdownOpen, setStackDropdownOpen] = useState(false);

  // Browse state
  const [browseMode, setBrowseMode] = useState<BrowseMode>('search');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [selectedAssetUids, setSelectedAssetUids] = useState<Set<string>>(new Set());
  const [selectedFolderUid, setSelectedFolderUid] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetCount, setAssetCount] = useState(0);
  const [skip, setSkip] = useState(0);

  // Import state
  const [importProgress, setImportProgress] = useState<{ total: number; imported: number } | null>(null);
  const [totalImported, setTotalImported] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Check connection via session endpoint, then load stacks separately
  const checkConnection = useCallback(async () => {
    setPhase('checking');
    try {
      // First check if the user has a valid CS session (from app login)
      const sessionRes = await fetch('/api/auth/contentstack/session');
      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated) {
        setPhase('not_connected');
        return;
      }

      // Session exists — now load stacks
      const stacksRes = await fetch('/api/contentstack/stacks');
      if (!stacksRes.ok) {
        const errData = await stacksRes.json();
        setError(errData.error || 'Failed to load stacks');
        setPhase('pick_stack');
        return;
      }
      const data = await stacksRes.json();
      setStacks(data.stacks || []);
      setPhase('pick_stack');
    } catch {
      setPhase('not_connected');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'contentstack-auth' && event.data.status === 'success') {
        checkConnection();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkConnection]);

  const handleConnect = () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      '/api/auth/contentstack?popup=true',
      'contentstack-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const loadAssets = useCallback(
    async (stack: Stack, currentSkip: number, folderUid?: string) => {
      setLoadingAssets(true);
      try {
        let url = `/api/contentstack/assets?api_key=${stack.api_key}&skip=${currentSkip}`;
        if (folderUid) url += `&folder=${folderUid}`;
        if (currentSkip === 0) url += '&include_folders=true';

        const res = await fetch(url);
        if (!res.ok) {
          setError('Failed to load assets');
          return;
        }
        const data = await res.json();

        if (currentSkip === 0) {
          setAssets(data.assets || []);
          if (data.folders) setFolders(data.folders || []);
        } else {
          setAssets((prev) => [...prev, ...(data.assets || [])]);
        }
        setAssetCount(data.count || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setLoadingAssets(false);
      }
    },
    []
  );

  const handleSelectStack = async (stack: Stack) => {
    setSelectedStack(stack);
    setStackDropdownOpen(false);
    setSkip(0);
    setSelectedAssetUids(new Set());
    setSelectedFolderUid(null);
    await loadAssets(stack, 0);
    setPhase('browse');
  };

  const handleLoadMore = () => {
    if (!selectedStack) return;
    const newSkip = skip + 100;
    setSkip(newSkip);
    loadAssets(selectedStack, newSkip, selectedFolderUid || undefined);
  };

  const handleFolderSelect = (folderUid: string) => {
    if (!selectedStack) return;
    setSelectedFolderUid(folderUid);
    setSkip(0);
    setAssets([]);
    setSelectedAssetUids(new Set());
    loadAssets(selectedStack, 0, folderUid);
  };

  const toggleAsset = (uid: string) => {
    setSelectedAssetUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedAssetUids(new Set(assets.map((a) => a.uid)));
  };

  const handleImport = async () => {
    if (!selectedStack) return;

    setPhase('importing');
    setImportProgress(null);
    setTotalImported(0);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        spark_id: sparkId,
        stack_api_key: selectedStack.api_key,
        stack_name: selectedStack.name,
      };

      if (browseMode === 'folder' && selectedFolderUid) {
        body.folder_uid = selectedFolderUid;
      } else {
        body.asset_uids = Array.from(selectedAssetUids);
      }

      const res = await fetch('/api/contentstack/import-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        setError('Failed to start import');
        setPhase('browse');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setImportProgress({
                total: event.total,
                imported: event.imported,
              });
            } else if (event.type === 'done') {
              setTotalImported(event.total_imported);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('browse');
    }
  };

  // ─── Render ─────────────────────────────────

  if (phase === 'checking') {
    return (
      <div className="flex items-center justify-center py-8 text-venus-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Checking connection...
      </div>
    );
  }

  if (phase === 'not_connected') {
    return (
      <div className="text-center py-8">
        <Paperclip size={32} className="mx-auto text-venus-gray-300 mb-3" />
        <p className="text-sm text-venus-gray-500 mb-4">
          Connect to Contentstack to import assets
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
        >
          <Paperclip size={16} />
          Connect to Contentstack
        </button>
      </div>
    );
  }

  if (phase === 'pick_stack') {
    return (
      <div>
        <label className="block text-sm font-medium text-venus-gray-600 mb-2">
          Select Stack
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setStackDropdownOpen(!stackDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 border border-venus-gray-200 rounded-lg text-sm text-venus-gray-700 hover:border-venus-purple/30 transition-colors"
          >
            {selectedStack ? selectedStack.name : 'Choose a stack...'}
            <ChevronDown size={14} className="text-venus-gray-400" />
          </button>
          {stackDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-card-bg border border-venus-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {stacks.map((stack) => (
                <button
                  key={stack.api_key}
                  type="button"
                  onClick={() => handleSelectStack(stack)}
                  className="w-full text-left px-3 py-2 text-sm text-venus-gray-700 hover:bg-venus-gray-50 transition-colors"
                >
                  {stack.name}
                </button>
              ))}
              {stacks.length === 0 && (
                <div className="px-3 py-2 text-sm text-venus-gray-400">
                  No stacks found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'browse') {
    return (
      <div>
        {/* Stack info + change */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-venus-gray-500">
            Stack: <span className="font-medium text-venus-gray-600">{selectedStack?.name}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedStack(null);
              setPhase('pick_stack');
            }}
            className="text-xs text-venus-gray-400 hover:text-venus-gray-600 transition-colors"
          >
            Change
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-3 p-0.5 bg-venus-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setBrowseMode('search');
              setSelectedFolderUid(null);
              if (selectedStack) loadAssets(selectedStack, 0);
            }}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              browseMode === 'search'
                ? 'bg-white text-venus-gray-700 shadow-sm'
                : 'text-venus-gray-500 hover:text-venus-gray-700'
            }`}
          >
            <Search size={12} />
            Browse
          </button>
          <button
            type="button"
            onClick={() => setBrowseMode('folder')}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              browseMode === 'folder'
                ? 'bg-white text-venus-gray-700 shadow-sm'
                : 'text-venus-gray-500 hover:text-venus-gray-700'
            }`}
          >
            <FolderOpen size={12} />
            By Folder
          </button>
        </div>

        {/* Folder picker (folder mode) */}
        {browseMode === 'folder' && folders.length > 0 && (
          <div className="mb-3">
            <select
              value={selectedFolderUid || ''}
              onChange={(e) => e.target.value && handleFolderSelect(e.target.value)}
              className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm text-venus-gray-700 focus:outline-none focus:ring-2 focus:ring-venus-purple/30"
            >
              <option value="">Select a folder...</option>
              {folders.map((f) => (
                <option key={f.uid} value={f.uid}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Select all */}
        {assets.length > 0 && browseMode === 'search' && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-venus-gray-400">
              {selectedAssetUids.size} of {assetCount} selected
            </span>
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs text-venus-purple hover:text-venus-purple-deep transition-colors"
            >
              Select all visible
            </button>
          </div>
        )}

        {/* Asset list */}
        <div className="max-h-48 overflow-y-auto border border-venus-gray-200 rounded-lg divide-y divide-venus-gray-100">
          {assets.map((asset) => {
            const isImage = asset.content_type?.startsWith('image/');
            const isSelected = selectedAssetUids.has(asset.uid);
            return (
              <label
                key={asset.uid}
                className={`flex items-center gap-3 px-3 py-2 hover:bg-venus-gray-50 cursor-pointer transition-colors ${
                  isSelected ? 'bg-venus-purple-light/50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleAsset(asset.uid)}
                  className="rounded border-venus-gray-300 text-venus-purple focus:ring-venus-purple/30"
                />
                <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-venus-gray-100">
                  {isImage ? (
                    <Image size={14} className="text-venus-gray-400" />
                  ) : (
                    <Paperclip size={14} className="text-venus-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-venus-gray-700 truncate">
                    {asset.title || asset.filename}
                  </p>
                  <p className="text-xs text-venus-gray-400">
                    {asset.filename} · {formatBytes(asset.file_size)}
                  </p>
                </div>
              </label>
            );
          })}

          {loadingAssets && (
            <div className="flex items-center justify-center py-4 text-venus-gray-400">
              <Loader2 size={14} className="animate-spin mr-2" />
              Loading...
            </div>
          )}

          {!loadingAssets && assets.length === 0 && (
            <div className="px-3 py-4 text-sm text-venus-gray-400 text-center">
              {browseMode === 'folder' && !selectedFolderUid
                ? 'Select a folder to browse assets'
                : 'No assets found'}
            </div>
          )}
        </div>

        {/* Load more */}
        {assets.length < assetCount && !loadingAssets && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="w-full mt-2 py-1.5 text-xs text-venus-purple hover:text-venus-purple-deep transition-colors"
          >
            Load more ({assetCount - assets.length} remaining)
          </button>
        )}

        {error && <p className="text-xs text-venus-red mt-2">{error}</p>}

        {/* Import button */}
        <button
          type="button"
          onClick={handleImport}
          disabled={
            browseMode === 'search'
              ? selectedAssetUids.size === 0
              : !selectedFolderUid
          }
          className="w-full mt-4 px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {browseMode === 'folder' && selectedFolderUid
            ? 'Import All Assets in Folder'
            : `Import ${selectedAssetUids.size} Asset${selectedAssetUids.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    );
  }

  if (phase === 'importing') {
    return (
      <div className="py-4">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 size={16} className="animate-spin text-venus-purple" />
          <span className="text-sm font-medium text-venus-gray-700">
            Importing assets...
          </span>
        </div>

        {importProgress && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-venus-gray-600">Progress</span>
              <span className="text-xs text-venus-gray-400">
                {importProgress.imported}/{importProgress.total}
              </span>
            </div>
            <div className="w-full h-1.5 bg-venus-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-venus-purple rounded-full transition-all duration-300"
                style={{
                  width: `${importProgress.total > 0 ? (importProgress.imported / importProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-venus-red mt-3">{error}</p>}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="text-center py-6">
        <div className="w-10 h-10 rounded-full bg-venus-green-light flex items-center justify-center mx-auto mb-3">
          <Check size={20} className="text-venus-green" />
        </div>
        <p className="text-sm font-medium text-venus-gray-700 mb-1">
          Import Complete
        </p>
        <p className="text-sm text-venus-gray-500 mb-4">
          Successfully imported {totalImported} asset{totalImported !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={onImported}
          className="px-4 py-2 text-sm font-medium text-white bg-venus-purple hover:bg-venus-purple-deep rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
