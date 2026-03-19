'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, X, Plus } from 'lucide-react';

interface PrimaryDomainsProps {
  domains: string[];
  onUpdate: (domains: string[]) => void;
}

/** Normalize a domain input: strip protocol, www., trailing slash, paths */
function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\/.*$/, '');
  return d;
}

export default function PrimaryDomains({ domains, onUpdate }: PrimaryDomainsProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus input when popover opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const addDomain = () => {
    const normalized = normalizeDomain(input);
    if (!normalized || domains.includes(normalized)) {
      setInput('');
      return;
    }
    onUpdate([...domains, normalized]);
    setInput('');
  };

  const removeDomain = (domain: string) => {
    onUpdate(domains.filter((d) => d !== domain));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDomain();
    }
  };

  // Display label
  const label = domains.length === 0
    ? null
    : domains.length === 1
      ? domains[0]
      : `${domains.length} domains`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors ${
          domains.length > 0
            ? 'text-venus-gray-600 hover:text-venus-gray-700 hover:bg-venus-gray-100'
            : 'text-venus-gray-400 hover:text-venus-gray-600 hover:bg-venus-gray-100'
        }`}
        title={domains.length > 0 ? `Primary: ${domains.join(', ')}` : 'Set primary domain'}
      >
        <Globe size={14} />
        {label && <span className="max-w-[140px] truncate">{label}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-surface border border-venus-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-venus-gray-200">
            <h4 className="text-xs font-semibold text-venus-gray-700">Primary Domains</h4>
            <p className="text-[10px] text-venus-gray-400 mt-0.5">
              The website(s) this Spark is anchored to
            </p>
          </div>

          {/* Domain list */}
          {domains.length > 0 && (
            <div className="px-3 py-2 space-y-1.5">
              {domains.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center gap-2 group"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-venus-green shrink-0" />
                  <span className="text-xs text-venus-gray-600 flex-1 truncate">{domain}</span>
                  <button
                    onClick={() => removeDomain(domain)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-venus-gray-100 text-venus-gray-400 hover:text-red-500 transition-all"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add input */}
          <div className="px-3 py-2 border-t border-venus-gray-100">
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="example.com"
                className="flex-1 text-xs bg-venus-gray-100 border border-venus-gray-200 focus:border-venus-gray-400 rounded px-2 py-1.5 outline-none text-venus-gray-700 placeholder:text-venus-gray-400"
              />
              <button
                onClick={addDomain}
                disabled={!input.trim()}
                className="p-1.5 rounded bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-30 text-white transition-colors"
                title="Add domain"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
