import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const SparkCanvas = dynamic(() => import('./SparkCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-venus-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin text-venus-purple" />
      <span className="text-xs">Loading canvas...</span>
    </div>
  ),
});

export default SparkCanvas;
