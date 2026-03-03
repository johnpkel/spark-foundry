'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface CollabUser {
  clientId: number;
  name: string;
  color: string;
}

interface PresenceAvatarsProps {
  users: CollabUser[];
  /** The local user's clientId — clicking their avatar opens the name editor */
  localClientId: number | null;
  /** Called when the local user changes their display name */
  onNameChange?: (name: string) => void;
}

export default function PresenceAvatars({ users, localClientId, onNameChange }: PresenceAvatarsProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleStartEdit = useCallback(() => {
    const me = users.find(u => u.clientId === localClientId);
    setEditValue(me?.name ?? '');
    setEditing(true);
  }, [users, localClientId]);

  const handleCommit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && onNameChange) onNameChange(trimmed);
    setEditing(false);
  }, [editValue, onNameChange]);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {/* Stacked avatars */}
      <div className="flex items-center -space-x-2">
        {users.map((user) => {
          const initials = user.name
            .split(/\s+/)
            .map(w => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          const isLocal = user.clientId === localClientId;

          return (
            <div key={user.clientId} className="relative group">
              <button
                onClick={isLocal ? handleStartEdit : undefined}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold border-2 border-surface transition-transform ${
                  isLocal ? 'cursor-pointer hover:scale-110' : 'cursor-default'
                }`}
                style={{ backgroundColor: user.color }}
                title={isLocal ? `${user.name} (you) — click to edit` : user.name}
              >
                {initials}
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-venus-gray-700 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {user.name}{isLocal ? ' (you)' : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline name editor */}
      {editing && (
        <div className="flex items-center gap-1 ml-1">
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCommit();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={handleCommit}
            className="w-28 text-xs bg-venus-gray-50 border border-venus-gray-200 focus:border-venus-purple rounded px-2 py-1 outline-none"
            placeholder="Your name"
            maxLength={30}
          />
        </div>
      )}
    </div>
  );
}
