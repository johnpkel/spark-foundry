'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';

interface SessionInfo {
  authenticated: boolean;
  email?: string;
  display_name?: string;
  organization_uid?: string;
}

export default function HeaderUserMenu() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (isLoginPage) return;
    fetch('/api/auth/contentstack/session')
      .then((res) => res.json())
      .then((data) => setSession(data))
      .catch(() => setSession({ authenticated: false }));
  }, [isLoginPage]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Don't render user menu on login page
  if (isLoginPage) {
    return <span className="text-sm text-venus-gray-500">for Contentstack DXP</span>;
  }

  async function handleLogout() {
    await fetch('/api/auth/contentstack/logout', { method: 'POST' });
    router.push('/login');
  }

  if (!session?.authenticated) {
    return <span className="text-sm text-venus-gray-500">for Contentstack DXP</span>;
  }

  const initials = session.display_name
    ? session.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-venus-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-venus-purple-light text-venus-purple text-xs font-semibold flex items-center justify-center">
          {initials}
        </div>
        <span className="text-sm text-venus-gray-600 max-w-[120px] truncate">
          {session.display_name}
        </span>
        <ChevronDown size={14} className="text-venus-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg border border-venus-gray-200 shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-venus-gray-100">
            <p className="text-sm font-medium text-venus-gray-700 truncate">
              {session.display_name}
            </p>
            <p className="text-xs text-venus-gray-500 truncate">{session.email}</p>
            {session.organization_uid && (
              <p className="text-xs text-venus-gray-400 mt-1 truncate">
                Org: {session.organization_uid}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-venus-gray-600 hover:bg-venus-gray-50 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
