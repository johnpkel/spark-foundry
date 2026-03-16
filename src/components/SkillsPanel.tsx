'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Zap, ZapOff, Trash2, Edit3, Save, Upload, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { Skill } from '@/lib/types';

interface SkillsPanelProps {
  sparkId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function SkillsPanel({ sparkId, isOpen, onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'import'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [nameError, setNameError] = useState('');

  // Import state
  const [importMarkdown, setImportMarkdown] = useState('');

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills?spark_id=${sparkId}`);
      if (res.ok) setSkills(await res.json());
    } finally {
      setLoading(false);
    }
  }, [sparkId]);

  useEffect(() => {
    if (isOpen) fetchSkills();
  }, [isOpen, fetchSkills]);

  const validateName = (v: string) => {
    if (!v) { setNameError(''); return; }
    if (!/^[a-z0-9-]+$/.test(v)) setNameError('Lowercase letters, numbers, hyphens only');
    else if (v.length > 64) setNameError('Max 64 characters');
    else setNameError('');
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setInstructions('');
    setNameError('');
    setImportMarkdown('');
    setView('list');
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (!name || !description || !instructions || nameError) return;

    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spark_id: sparkId, name, description, instructions }),
    });

    if (res.ok) {
      resetForm();
      fetchSkills();
    }
  };

  const handleImport = async () => {
    if (!importMarkdown.trim()) return;

    const res = await fetch('/api/skills/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spark_id: sparkId, markdown: importMarkdown }),
    });

    if (res.ok) {
      resetForm();
      fetchSkills();
    }
  };

  const handleToggleActive = async (skill: Skill) => {
    const res = await fetch(`/api/skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !skill.is_active }),
    });
    if (res.ok) {
      setSkills(prev => prev.map(s =>
        s.id === skill.id ? { ...s, is_active: !s.is_active } : s
      ));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
    if (res.ok) setSkills(prev => prev.filter(s => s.id !== id));
  };

  const handleEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setName(skill.name);
    setDescription(skill.description);
    setInstructions(skill.instructions);
    setView('create');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !name || !description || !instructions || nameError) return;

    const res = await fetch(`/api/skills/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, instructions }),
    });

    if (res.ok) {
      resetForm();
      fetchSkills();
    }
  };

  if (!isOpen) return null;

  const activeCount = skills.filter(s => s.is_active).length;

  return (
    <div className="absolute inset-0 z-30 bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-venus-gray-200">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-venus-purple" />
          <span className="text-sm font-semibold text-venus-gray-700">
            Skills
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-venus-purple/10 text-venus-purple">
            {activeCount} active
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-venus-gray-100 transition-colors">
          <X size={16} className="text-venus-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'list' && (
          <div className="p-4 space-y-3">
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => { resetForm(); setView('create'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-medium rounded-md transition-colors"
              >
                <Plus size={12} />
                Create
              </button>
              <button
                onClick={() => { resetForm(); setView('import'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-gray-100 hover:bg-venus-gray-200 text-venus-gray-600 text-xs font-medium rounded-md transition-colors"
              >
                <Upload size={12} />
                Import
              </button>
            </div>

            {/* Skills list */}
            {loading ? (
              <div className="text-center py-8 text-xs text-venus-gray-400">Loading skills...</div>
            ) : skills.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 rounded-xl bg-venus-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Zap size={18} className="text-venus-gray-400" />
                </div>
                <p className="text-sm font-medium text-venus-gray-600 mb-1">No skills yet</p>
                <p className="text-xs text-venus-gray-400">Create a skill to give the assistant specialized capabilities.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {skills.map(skill => (
                  <div
                    key={skill.id}
                    className={`rounded-lg border transition-colors ${
                      skill.is_active
                        ? 'border-venus-purple/20 bg-venus-purple-light/20'
                        : 'border-venus-gray-200 bg-venus-gray-50 opacity-60'
                    }`}
                  >
                    {/* Skill header row */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        onClick={() => handleToggleActive(skill)}
                        className={`shrink-0 p-1 rounded-md transition-colors ${
                          skill.is_active
                            ? 'text-venus-purple hover:bg-venus-purple/10'
                            : 'text-venus-gray-400 hover:bg-venus-gray-200'
                        }`}
                        title={skill.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {skill.is_active ? <Zap size={14} /> : <ZapOff size={14} />}
                      </button>

                      <button
                        onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="text-xs font-semibold text-venus-gray-700 truncate">
                          {skill.name}
                        </div>
                        <div className="text-[11px] text-venus-gray-500 truncate">
                          {skill.description}
                        </div>
                      </button>

                      <button
                        onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
                        className="shrink-0 p-1 rounded-md hover:bg-venus-gray-100"
                      >
                        {expandedId === skill.id
                          ? <ChevronUp size={12} className="text-venus-gray-400" />
                          : <ChevronDown size={12} className="text-venus-gray-400" />
                        }
                      </button>
                    </div>

                    {/* Expanded details */}
                    {expandedId === skill.id && (
                      <div className="px-3 pb-3 border-t border-venus-gray-200/50">
                        <div className="mt-2 text-[11px] text-venus-gray-500 font-mono bg-surface rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {skill.instructions.substring(0, 500)}
                          {skill.instructions.length > 500 && '...'}
                        </div>
                        {skill.spark_id === null && (
                          <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-venus-gray-200 text-venus-gray-500">
                            global
                          </span>
                        )}
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => handleEdit(skill)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-venus-gray-500 hover:text-venus-gray-700 hover:bg-venus-gray-100 rounded transition-colors"
                          >
                            <Edit3 size={10} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(skill.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={10} />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create / Edit form */}
        {view === 'create' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-venus-gray-700">
                {editingId ? 'Edit Skill' : 'Create Skill'}
              </span>
              <button onClick={resetForm} className="text-xs text-venus-gray-400 hover:text-venus-gray-600">
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-venus-gray-500 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); validateName(e.target.value); }}
                placeholder="my-skill-name"
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-venus-gray-200 bg-surface text-venus-gray-700 placeholder:text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple"
              />
              {nameError && <p className="text-[10px] text-red-400 mt-0.5">{nameError}</p>}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-venus-gray-500 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this skill does and when to use it"
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-venus-gray-200 bg-surface text-venus-gray-700 placeholder:text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple"
              />
              <p className="text-[10px] text-venus-gray-400 mt-0.5">{description.length}/1024</p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-venus-gray-500 mb-1">Instructions</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Step-by-step instructions for the assistant to follow when this skill is activated..."
                rows={10}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-venus-gray-200 bg-surface text-venus-gray-700 placeholder:text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple resize-y"
              />
            </div>

            <button
              onClick={editingId ? handleSaveEdit : handleCreate}
              disabled={!name || !description || !instructions || !!nameError}
              className="flex items-center gap-1.5 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors w-full justify-center"
            >
              <Save size={12} />
              {editingId ? 'Save Changes' : 'Create Skill'}
            </button>
          </div>
        )}

        {/* Import view */}
        {view === 'import' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-venus-gray-700">Import from SKILL.md</span>
              <button onClick={resetForm} className="text-xs text-venus-gray-400 hover:text-venus-gray-600">
                Cancel
              </button>
            </div>

            <p className="text-[11px] text-venus-gray-500">
              Paste a SKILL.md file with YAML frontmatter (name, description) and instruction body.
            </p>

            <textarea
              value={importMarkdown}
              onChange={(e) => setImportMarkdown(e.target.value)}
              placeholder={`---\nname: my-skill\ndescription: What this skill does\n---\n\n## Instructions\nStep-by-step guidance...`}
              rows={14}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-venus-gray-200 bg-surface text-venus-gray-700 placeholder:text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple resize-y"
            />

            <button
              onClick={handleImport}
              disabled={!importMarkdown.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors w-full justify-center"
            >
              <Upload size={12} />
              Import Skill
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
