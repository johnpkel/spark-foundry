'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import type { ItemType } from '@/lib/types';

// ─── Shared constants ─────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  link: '#6c5ce7',
  image: '#00b9e0',
  text: '#9387ed',
  file: '#007a52',
  note: '#ffae0a',
  google_drive: '#4285f4',
};

const TYPE_LABELS: Record<string, string> = {
  link: 'Link',
  image: 'Image',
  text: 'Text',
  file: 'File',
  note: 'Note',
  google_drive: 'Drive',
};

// ─── Types from the API ───────────────────────────────

interface VectorItem {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  position: [number, number, number];
}

interface VectorEdge {
  from: number;
  to: number;
  similarity: number;
}

// ─── Item Node ────────────────────────────────────────

function SpaceNode({
  item,
  index,
}: {
  item: VectorItem;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = TYPE_COLORS[item.type] || '#6c5ce7';
  const size = 0.18;

  // Fly-in animation
  const progress = useRef(0);
  const currentPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useMemo(() => new THREE.Vector3(...item.position), [item.position]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const delay = index * 0.06;
    if (state.clock.elapsedTime > delay && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 2.0);
    }
    const eased = 1 - Math.pow(1 - progress.current, 3);
    currentPos.current.lerpVectors(new THREE.Vector3(0, 0, 0), targetPos, eased);

    // Floating oscillation
    const float = Math.sin(state.clock.elapsedTime * 0.6 + index * 1.2) * 0.03;
    meshRef.current.position.set(
      currentPos.current.x,
      currentPos.current.y + float,
      currentPos.current.z
    );

    const targetScale = hovered ? 1.6 : 1;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      delta * 8
    );
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 1 : 0.85} />
      </mesh>

      {hovered && (
        <mesh position={currentPos.current}>
          <ringGeometry args={[size + 0.06, size + 0.14, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      {hovered && (
        <Html position={currentPos.current} distanceFactor={6} zIndexRange={[100, 0]}>
          <div
            className="pointer-events-none select-none bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-venus-gray-200 px-3 py-2 min-w-[180px] max-w-[240px]"
            style={{ transform: 'translate(-50%, -120%)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-full text-white"
                style={{ backgroundColor: color }}
              >
                {TYPE_LABELS[item.type] || item.type}
              </span>
            </div>
            <p className="text-xs font-medium text-venus-gray-700 leading-tight line-clamp-2">
              {item.title}
            </p>
            {item.summary && (
              <p className="text-[10px] text-venus-gray-500 mt-1 leading-tight line-clamp-2">
                {item.summary}
              </p>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Edge line between two items ──────────────────────

function EdgeLine({
  items,
  edge,
}: {
  items: VectorItem[];
  edge: VectorEdge;
}) {
  const fromPos = items[edge.from].position;
  const toPos = items[edge.to].position;
  const progress = useRef(0);
  const currentFrom = useRef<[number, number, number]>([0, 0, 0]);
  const currentTo = useRef<[number, number, number]>([0, 0, 0]);

  const delay = Math.max(edge.from, edge.to) * 0.06 + 0.3;

  useFrame((state, delta) => {
    if (state.clock.elapsedTime > delay && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 2.0);
    }
    const eased = 1 - Math.pow(1 - progress.current, 3);
    currentFrom.current = [fromPos[0] * eased, fromPos[1] * eased, fromPos[2] * eased];
    currentTo.current = [toPos[0] * eased, toPos[1] * eased, toPos[2] * eased];
  });

  return (
    <Line
      points={[currentFrom.current, currentTo.current]}
      color="#9387ed"
      lineWidth={1}
      transparent
      opacity={0.08 + (edge.similarity - 0.5) * 0.3}
      dashed
      dashSize={0.12}
      gapSize={0.08}
    />
  );
}

// ─── Particle Cloud ───────────────────────────────────

function ParticleCloud() {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const count = 150;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.015;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particles, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#9387ed" size={0.025} transparent opacity={0.35} sizeAttenuation />
    </points>
  );
}

// ─── Type Legend ───────────────────────────────────────

function TypeLegend({ types }: { types: string[] }) {
  return (
    <div className="absolute bottom-2 left-3 z-10 flex items-center gap-2 flex-wrap">
      {types.map((type) => (
        <div key={type} className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: TYPE_COLORS[type] || '#6c5ce7' }}
          />
          <span className="text-[10px] text-venus-gray-400">
            {TYPE_LABELS[type] || type}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 3D Scene (inner, rendered only on client) ────────

function VectorScene({ items, edges }: { items: VectorItem[]; edges: VectorEdge[] }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <OrbitControls
        enablePan={false}
        enableZoom
        autoRotate
        autoRotateSpeed={0.3}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={(5 * Math.PI) / 6}
        minDistance={3}
        maxDistance={12}
      />

      {items.map((item, i) => (
        <SpaceNode key={item.id} item={item} index={i} />
      ))}

      {edges.map((edge, i) => (
        <EdgeLine key={`edge-${i}`} items={items} edge={edge} />
      ))}

      <ParticleCloud />
    </>
  );
}

// ─── Main Component ───────────────────────────────────

interface ItemsVectorSpaceProps {
  sparkId: string;
}

export default function ItemsVectorSpace({ sparkId }: ItemsVectorSpaceProps) {
  const [items, setItems] = useState<VectorItem[]>([]);
  const [edges, setEdges] = useState<VectorEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/sparks/${sparkId}/vectors`);
        if (!res.ok) throw new Error('Failed to load vector data');
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
          setEdges(data.edges || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [sparkId]);

  const uniqueTypes = useMemo(
    () => [...new Set(items.map((i) => i.type))],
    [items]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-venus-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin text-venus-purple" />
        <span className="text-xs">Projecting vector space...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-red-500">{error}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <p className="text-sm text-venus-gray-500 mb-1">No embedded items yet</p>
        <p className="text-xs text-venus-gray-400">
          Items need embeddings to appear here. Add items and they&apos;ll be embedded automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Header */}
      <div className="absolute top-2 left-3 z-10 flex items-center gap-2">
        <span className="text-[10px] font-semibold text-venus-purple/70 uppercase tracking-wider">
          Vector Space
        </span>
        <span className="text-[10px] text-venus-gray-400">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {edges.length > 0 && ` · ${edges.length} connection${edges.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      <TypeLegend types={uniqueTypes as ItemType[]} />

      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 7], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <VectorScene items={items} edges={edges} />
      </Canvas>
    </div>
  );
}
