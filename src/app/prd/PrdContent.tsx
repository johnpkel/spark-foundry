'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle } from '@/components/ThemeProvider';

export default function PrdContent({ markdown }: { markdown: string }) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Header */}
      <header className="h-14 bg-surface border-b border-venus-gray-200 flex items-center px-6 shrink-0 sticky top-0 z-10">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded-md hover:bg-venus-gray-100 text-venus-gray-500 transition-colors mr-3"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-venus-purple flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-venus-gray-700">Product Requirements Document</h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <article className="max-w-4xl mx-auto px-6 py-10 prd-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
