'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const redirect = searchParams.get('redirect');

  const loginUrl = redirect
    ? `/api/auth/contentstack?redirect=${encodeURIComponent(redirect)}`
    : '/api/auth/contentstack';

  return (
    <div className="min-h-screen flex items-center justify-center bg-venus-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-venus-gray-200 shadow-sm p-8">
          {/* Logo + Title */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-venus-purple flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-venus-gray-700">Spark Foundry</h1>
            <p className="text-sm text-venus-gray-500 mt-1">Sign in to continue</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-venus-red-light border border-venus-red/20 text-sm text-venus-red">
              Authentication failed. Please try again.
            </div>
          )}

          {/* Sign in button */}
          <a
            href={loginUrl}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn size={16} />
            Sign in with Contentstack
          </a>

          <p className="text-xs text-venus-gray-400 text-center mt-6">
            You&apos;ll be redirected to Contentstack to authorize access.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-venus-gray-50">
        <div className="w-12 h-12 rounded-xl bg-venus-gray-100 animate-pulse" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
