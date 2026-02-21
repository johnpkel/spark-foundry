'use client';

import { useState } from 'react';
import { FileText, Megaphone, Loader2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import type { GeneratedArtifact, ArtifactType } from '@/lib/types';

interface ArtifactGeneratorProps {
  sparkId: string;
  artifacts: GeneratedArtifact[];
  onGenerated: () => void;
}

const artifactTypes: { type: ArtifactType; label: string; icon: typeof FileText; description: string }[] = [
  {
    type: 'cms_entry',
    label: 'CMS Entry',
    icon: FileText,
    description: 'Generate a Contentstack webpage content entry',
  },
  {
    type: 'campaign_brief',
    label: 'Campaign Brief',
    icon: Megaphone,
    description: 'Create a comprehensive campaign brief',
  },
];

export default function ArtifactGenerator({ sparkId, artifacts, onGenerated }: ArtifactGeneratorProps) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleGenerate = async (type: ArtifactType) => {
    setGenerating(type);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spark_id: sparkId,
          type,
          instructions: instructions.trim() || undefined,
        }),
      });

      if (res.ok) {
        setInstructions('');
        onGenerated();
      }
    } finally {
      setGenerating(null);
    }
  };

  const copyToClipboard = async (artifact: GeneratedArtifact) => {
    await navigator.clipboard.writeText(JSON.stringify(artifact.content, null, 2));
    setCopiedId(artifact.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Generation Controls */}
      <div className="bg-card-bg rounded-xl border border-venus-gray-200 p-5">
        <h3 className="font-semibold text-venus-gray-700 mb-1">Generate Artifacts</h3>
        <p className="text-sm text-venus-gray-500 mb-4">
          Transform your collected information into business-ready documents.
        </p>

        <div className="mb-4">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Additional instructions (optional) — e.g., 'Focus on enterprise features' or 'Target marketing managers'"
            rows={2}
            className="w-full px-3 py-2 border border-venus-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-venus-purple/30 focus:border-venus-purple transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {artifactTypes.map(({ type, label, icon: Icon, description }) => (
            <button
              key={type}
              onClick={() => handleGenerate(type)}
              disabled={generating !== null}
              className="flex items-start gap-3 p-4 rounded-lg border border-venus-gray-200 hover:border-venus-purple/40 hover:bg-venus-purple-light/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-venus-purple-light flex items-center justify-center shrink-0">
                {generating === type ? (
                  <Loader2 size={16} className="animate-spin text-venus-purple" />
                ) : (
                  <Icon size={16} className="text-venus-purple" />
                )}
              </div>
              <div>
                <span className="text-sm font-medium text-venus-gray-700 block">{label}</span>
                <span className="text-xs text-venus-gray-500">{description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Generated Artifacts List */}
      {artifacts.length > 0 && (
        <div>
          <h3 className="font-semibold text-venus-gray-700 mb-3">Generated Artifacts</h3>
          <div className="space-y-3">
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="bg-card-bg rounded-xl border border-venus-gray-200 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedArtifact(expandedArtifact === artifact.id ? null : artifact.id)
                  }
                  className="w-full flex items-center justify-between p-4 hover:bg-venus-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-venus-purple-light flex items-center justify-center">
                      {artifact.type === 'cms_entry' ? (
                        <FileText size={14} className="text-venus-purple" />
                      ) : (
                        <Megaphone size={14} className="text-venus-purple" />
                      )}
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-medium text-venus-gray-700 block">
                        {artifact.title}
                      </span>
                      <span className="text-xs text-venus-gray-400">
                        {artifact.type.replace('_', ' ')} &middot; {artifact.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(artifact);
                      }}
                      className="p-1.5 rounded-md hover:bg-venus-gray-100 text-venus-gray-400"
                      title="Copy JSON"
                    >
                      {copiedId === artifact.id ? (
                        <Check size={14} className="text-venus-green" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                    {expandedArtifact === artifact.id ? (
                      <ChevronUp size={16} className="text-venus-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-venus-gray-400" />
                    )}
                  </div>
                </button>

                {expandedArtifact === artifact.id && (
                  <div className="border-t border-venus-gray-200 p-4">
                    <pre className="text-xs text-venus-gray-600 bg-venus-gray-50 p-4 rounded-lg overflow-x-auto max-h-96">
                      {JSON.stringify(artifact.content, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
