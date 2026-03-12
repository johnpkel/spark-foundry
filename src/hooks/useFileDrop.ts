'use client';

import { useCallback, useState } from 'react';

const ACCEPTED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  // Document types
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

export interface UseFileDropOptions {
  sparkId: string;
  onItemAdded?: () => void;
}

export interface UseFileDropReturn {
  isDragOver: boolean;
  isUploading: boolean;
  dragHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

export function useFileDrop({ sparkId, onItemAdded }: UseFileDropOptions): UseFileDropReturn {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as globalThis.Node)) return;
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(f =>
      ACCEPTED_TYPES.includes(f.type),
    );
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('spark_id', sparkId);

        const res = await fetch('/api/contentstack/upload-asset', {
          method: 'POST',
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          alert(`Failed to upload ${file.name}: ${err.error}`);
          continue;
        }
      }
      onItemAdded?.();
    } finally {
      setIsUploading(false);
    }
  }, [sparkId, onItemAdded]);

  return { isDragOver, isUploading, dragHandlers: { onDragOver, onDragLeave, onDrop } };
}
