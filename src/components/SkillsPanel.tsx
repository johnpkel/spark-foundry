'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Zap, ZapOff, Trash2, Edit3, Save, Upload, ChevronDown, ChevronUp,
  Settings2, AlertTriangle, Download, Loader2,
} from 'lucide-react';
import type { Skill, SkillVariable, SkillDraft } from '@/lib/types';

interface SkillsPanelProps {
  sparkId: string;
  isOpen: boolean;
  onClose: () => void;
  skillDraft?: SkillDraft | null;
  onDraftConsumed?: () => void;
}

export default function SkillsPanel({ sparkId, isOpen, onClose, skillDraft, onDraftConsumed }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'import' | 'configure'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [nameError, setNameError] = useState('');
  const [variables, setVariables] = useState<SkillVariable[]>([]);

  // Configure (per-Spark overrides) state
  const [configSkill, setConfigSkill] = useState<Skill | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

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

  // Handle incoming skill draft from chat
  useEffect(() => {
    if (skillDraft && isOpen) {
      setEditingId(null);
      setName(skillDraft.name);
      setDescription(skillDraft.description);
      setInstructions(skillDraft.instructions);
      setVariables(skillDraft.variables || []);
      setNameError('');
      setView('create');
      onDraftConsumed?.();
    }
  }, [skillDraft, isOpen, onDraftConsumed]);

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
    setVariables([]);
    setImportMarkdown('');
    setView('list');
    setEditingId(null);
    setConfigSkill(null);
  };

  // Auto-detect {{variables}} in instructions
  const detectedVars = Array.from(instructions.matchAll(/\{\{(\w+)\}\}/g))
    .map(m => m[1])
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const unmappedVars = detectedVars.filter(v => !variables.some(sv => sv.key === v));

  const handleCreate = async () => {
    if (!name || !description || !instructions || nameError) return;

    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spark_id: sparkId, name, description, instructions, variables }),
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
    setVariables(skill.variables || []);
    setView('create');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !name || !description || !instructions || nameError) return;

    const res = await fetch(`/api/skills/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, instructions, variables }),
    });

    if (res.ok) {
      resetForm();
      fetchSkills();
    }
  };

  const handleConfigure = async (skill: Skill) => {
    setConfigSkill(skill);
    setView('configure');
    // Fetch existing overrides for this Spark
    try {
      const res = await fetch(`/api/skills/${skill.id}/overrides?spark_id=${sparkId}`);
      if (res.ok) {
        const data = await res.json();
        setOverrides(data.overrides || {});
      } else {
        setOverrides({});
      }
    } catch {
      setOverrides({});
    }
  };

  const handleSaveOverrides = async () => {
    if (!configSkill) return;
    await fetch(`/api/skills/${configSkill.id}/overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spark_id: sparkId, overrides }),
    });
    resetForm();
  };

  const handleSeedSkills = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/skills/seed', { method: 'POST' });
      if (res.ok) {
        await fetchSkills();
      }
    } finally {
      setSeeding(false);
    }
  };

  // Variable list management
  const addVariable = (key?: string) => {
    const newVar: SkillVariable = {
      key: key || '',
      label: key ? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '',
      default_value: '',
      description: '',
    };
    setVariables(prev => [...prev, newVar]);
  };

  const updateVariable = (index: number, field: keyof SkillVariable, value: string) => {
    setVariables(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const removeVariable = (index: number) => {
    setVariables(prev => prev.filter((_, i) => i !== index));
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
            <div className="flex gap-2 flex-wrap">
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
              {skills.length > 0 && (
                <button
                  onClick={handleSeedSkills}
                  disabled={seeding}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-venus-gray-100 hover:bg-venus-gray-200 text-venus-gray-600 text-xs font-medium rounded-md transition-colors ml-auto disabled:opacity-40"
                  title="Restore any missing starter skills"
                >
                  {seeding ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Restore Starters
                </button>
              )}
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
                <p className="text-xs text-venus-gray-400 mb-4">
                  Get started with built-in skills for content strategy, research, and digital experience work.
                </p>
                <button
                  onClick={handleSeedSkills}
                  disabled={seeding}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  {seeding ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Install Starter Skills
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {skills.map(skill => {
                  const hasVars = skill.variables && skill.variables.length > 0;
                  const hasEmptyVars = hasVars && skill.variables.some(
                    v => !v.default_value
                  );

                  return (
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-venus-gray-700 truncate">
                              {skill.name}
                            </span>
                            {hasEmptyVars && (
                              <span title="Variables need defaults or overrides"><AlertTriangle size={10} className="text-amber-500 shrink-0" /></span>
                            )}
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
                          {hasVars && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {skill.variables.map(v => (
                                <span key={v.key} className="text-[10px] px-1.5 py-0.5 rounded bg-venus-purple/10 text-venus-purple font-mono">
                                  {`{{${v.key}}}`}
                                </span>
                              ))}
                            </div>
                          )}
                          {skill.spark_id === null && (
                            <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-venus-gray-200 text-venus-gray-500">
                              global
                            </span>
                          )}
                          <div className="flex gap-1.5 mt-2">
                            {hasVars && (
                              <button
                                onClick={() => handleConfigure(skill)}
                                className="flex items-center gap-1 px-2 py-1 text-[11px] text-venus-purple hover:bg-venus-purple/10 rounded transition-colors"
                              >
                                <Settings2 size={10} />
                                Configure
                              </button>
                            )}
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
                  );
                })}
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

            {/* Variables section */}
            <div>
              <button
                type="button"
                onClick={() => addVariable()}
                className="flex items-center gap-1.5 text-[11px] font-medium text-venus-gray-500 hover:text-venus-purple mb-2"
              >
                <Settings2 size={10} />
                Variables ({variables.length})
                <Plus size={10} />
              </button>

              {/* Auto-detected unmapped variables */}
              {unmappedVars.length > 0 && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-[10px] text-amber-700 mb-1">
                    Detected in instructions:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {unmappedVars.map(v => (
                      <button
                        key={v}
                        onClick={() => addVariable(v)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 hover:bg-amber-300 font-mono transition-colors"
                      >
                        + {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {variables.map((v, i) => (
                <div key={i} className="mb-2 p-2 bg-venus-gray-50 border border-venus-gray-200 rounded-md space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      value={v.key}
                      onChange={(e) => updateVariable(i, 'key', e.target.value.replace(/\W/g, '_').toLowerCase())}
                      placeholder="variable_key"
                      className="flex-1 px-2 py-1 text-[11px] font-mono rounded border border-venus-gray-200 bg-surface text-venus-gray-700 focus:outline-none focus:ring-1 focus:ring-venus-purple"
                    />
                    <input
                      value={v.label}
                      onChange={(e) => updateVariable(i, 'label', e.target.value)}
                      placeholder="Display Label"
                      className="flex-1 px-2 py-1 text-[11px] rounded border border-venus-gray-200 bg-surface text-venus-gray-700 focus:outline-none focus:ring-1 focus:ring-venus-purple"
                    />
                    <button onClick={() => removeVariable(i)} className="text-red-400 hover:text-red-600 p-0.5">
                      <X size={10} />
                    </button>
                  </div>
                  <input
                    value={v.default_value}
                    onChange={(e) => updateVariable(i, 'default_value', e.target.value)}
                    placeholder="Default value"
                    className="w-full px-2 py-1 text-[11px] rounded border border-venus-gray-200 bg-surface text-venus-gray-700 focus:outline-none focus:ring-1 focus:ring-venus-purple"
                  />
                  <input
                    value={v.description || ''}
                    onChange={(e) => updateVariable(i, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2 py-1 text-[11px] rounded border border-venus-gray-200 bg-surface text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple"
                  />
                </div>
              ))}
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

        {/* Configure per-Spark variable overrides */}
        {view === 'configure' && configSkill && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-venus-gray-700">
                Configure: {configSkill.name}
              </span>
              <button onClick={resetForm} className="text-xs text-venus-gray-400 hover:text-venus-gray-600">
                Cancel
              </button>
            </div>

            <p className="text-[11px] text-venus-gray-500">
              Set values for this Spark. These override the skill defaults.
            </p>

            {(configSkill.variables || []).map(v => (
              <div key={v.key}>
                <label className="block text-[11px] font-medium text-venus-gray-500 mb-1">
                  {v.label}
                  {v.description && (
                    <span className="font-normal text-venus-gray-400 ml-1">— {v.description}</span>
                  )}
                </label>
                <input
                  value={overrides[v.key] ?? ''}
                  onChange={(e) => setOverrides(prev => ({ ...prev, [v.key]: e.target.value }))}
                  placeholder={v.default_value || `Enter ${v.label.toLowerCase()}`}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-venus-gray-200 bg-surface text-venus-gray-700 placeholder:text-venus-gray-400 focus:outline-none focus:ring-1 focus:ring-venus-purple"
                />
                {v.default_value && !overrides[v.key] && (
                  <p className="text-[10px] text-venus-gray-400 mt-0.5">Default: {v.default_value}</p>
                )}
              </div>
            ))}

            <button
              onClick={handleSaveOverrides}
              className="flex items-center gap-1.5 px-4 py-2 bg-venus-purple hover:bg-venus-purple-deep text-white text-xs font-semibold rounded-lg transition-colors w-full justify-center"
            >
              <Save size={12} />
              Save Configuration
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
