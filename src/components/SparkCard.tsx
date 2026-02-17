'use client';

import { formatDistanceToNow } from 'date-fns';
import { FileText, Link2, Image, StickyNote, File, MoreVertical, Trash2, Archive } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Spark } from '@/lib/types';

interface SparkCardProps {
  spark: Spark;
  itemCount?: number;
  onClick: () => void;
  onDelete: (id: string) => void;
}

const typeIcons = {
  link: Link2,
  image: Image,
  text: FileText,
  file: File,
  note: StickyNote,
};

export default function SparkCard({ spark, itemCount = 0, onClick, onDelete }: SparkCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="bg-white rounded-xl border border-venus-gray-200 p-5 hover:border-venus-purple/40 hover:shadow-md transition-all cursor-pointer group relative"
      onClick={onClick}
    >
      {/* Menu */}
      <div className="absolute top-4 right-4" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-1 rounded-md hover:bg-venus-gray-100 text-venus-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-venus-gray-200 py-1 w-40 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-venus-gray-600 hover:bg-venus-gray-50 flex items-center gap-2"
            >
              <Archive size={14} />
              Archive
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(spark.id);
                setMenuOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-venus-red hover:bg-venus-red-light flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Spark icon */}
      <div className="w-10 h-10 rounded-lg bg-venus-purple-light flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--venus-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      <h3 className="font-semibold text-venus-gray-700 mb-1 pr-8">{spark.name}</h3>
      {spark.description && (
        <p className="text-sm text-venus-gray-500 mb-3 line-clamp-2">{spark.description}</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-venus-gray-100">
        <div className="flex items-center gap-1.5">
          {Object.entries(typeIcons).slice(0, 3).map(([type, Icon]) => (
            <Icon key={type} size={14} className="text-venus-gray-400" />
          ))}
          <span className="text-xs text-venus-gray-400 ml-1">{itemCount} items</span>
        </div>
        <span className="text-xs text-venus-gray-400">
          {formatDistanceToNow(new Date(spark.updated_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
