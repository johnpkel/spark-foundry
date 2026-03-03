import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Link2, Image, FileText, File, StickyNote, HardDrive, Database,
  Paperclip, BarChart2, MessageSquare,
} from 'lucide-react';
import { TYPE_COLORS } from '@/lib/canvas-layout';
import type { SparkItem } from '@/lib/types';

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  link: Link2,
  image: Image,
  text: FileText,
  file: File,
  note: StickyNote,
  google_drive: HardDrive,
  slack_message: MessageSquare,
  contentstack_entry: Database,
  contentstack_asset: Paperclip,
  clarity_insight: BarChart2,
};

interface SparkItemNodeData {
  item: SparkItem;
  [key: string]: unknown;
}

function SparkItemNode({ data }: NodeProps & { data: SparkItemNodeData }) {
  const { item } = data;
  const Icon = TYPE_ICONS[item.type] || FileText;
  const color = TYPE_COLORS[item.type] || '#888';

  // Resolve thumbnail for image/link items
  const thumb =
    item.type === 'image'
      ? (item.metadata?.image_url as string) || item.content || null
      : item.type === 'link'
        ? (item.metadata?.og_image as string) || null
        : null;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-0 !h-0" />
      <div
        className="spark-canvas-node bg-card-bg border border-venus-gray-200 rounded-lg px-3 py-2 w-[200px] cursor-grab active:cursor-grabbing transition-[border-color,box-shadow] duration-150"
        style={{ minHeight: 72 }}
      >
        {/* Header: icon + title */}
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}18`, color }}
          >
            <Icon size={12} />
          </div>
          <span className="text-xs font-medium text-venus-gray-700 truncate flex-1">
            {item.title}
          </span>
        </div>

        {/* Body: thumbnail or summary */}
        <div className="flex items-start gap-2">
          {thumb && (
            <img
              src={thumb}
              alt=""
              className="w-12 h-12 rounded object-cover shrink-0 border border-venus-gray-200"
              loading="lazy"
            />
          )}
          {item.summary && (
            <p className="text-[10px] leading-tight text-venus-gray-500 line-clamp-2 flex-1">
              {item.summary}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-0 !h-0" />
    </>
  );
}

export default memo(SparkItemNode);
