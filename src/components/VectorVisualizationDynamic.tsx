import dynamic from 'next/dynamic';

const VectorVisualization = dynamic(() => import('./VectorVisualization'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[280px] rounded-lg bg-venus-gray-50 flex items-center justify-center">
      <span className="text-xs text-venus-gray-400">Loading visualization...</span>
    </div>
  ),
});

export default VectorVisualization;
