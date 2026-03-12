'use client';

interface DropOverlayProps {
  isDragOver: boolean;
  isUploading: boolean;
}

export default function DropOverlay({ isDragOver, isUploading }: DropOverlayProps) {
  if (!isDragOver && !isUploading) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-venus-purple/10 backdrop-blur-[2px] pointer-events-none">
      <div className="border-2 border-dashed border-venus-purple rounded-2xl px-8 py-6 bg-white/80 dark:bg-surface/80 shadow-lg flex flex-col items-center gap-2">
        {isUploading ? (
          <>
            <div className="w-5 h-5 border-2 border-venus-purple border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-venus-purple">Uploading...</span>
          </>
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--venus-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-medium text-venus-purple">Drop files here</span>
            <span className="text-xs text-venus-gray-500">Images, PDFs & Documents</span>
          </>
        )}
      </div>
    </div>
  );
}
