import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        attribute: 'class',
        defaultTheme: 'system',
        storageKey: 'spark-theme',
        enableSystem: true,
      }}
    >
      <DocsLayout
        tree={source.getPageTree()}
        nav={{
          title: (
            <span className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-venus-purple flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
              <span className="font-semibold text-[0.925rem]">Spark Foundry</span>
            </span>
          ),
          url: '/docs',
        }}
        links={[
          { text: 'Back to App', url: '/', active: 'none' },
        ]}
        sidebar={{
          defaultOpenLevel: 2,
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
