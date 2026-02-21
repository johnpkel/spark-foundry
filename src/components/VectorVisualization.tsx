'use client';

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { VectorContextItem, ItemType } from '@/lib/types';

// ─── Color map by item type ───────────────────────────
const TYPE_COLORS: Record<ItemType, string> = {
  link: '#6c5ce7',
  image: '#00b9e0',
  text: '#9387ed',
  file: '#007a52',
  note: '#ffae0a',
  google_drive: '#4285f4',
};

const TYPE_LABELS: Record<ItemType, string> = {
  link: 'Link',
  image: 'Image',
  text: 'Text',
  file: 'File',
  note: 'Note',
  google_drive: 'Drive',
};

// ─── Position items using golden-angle spiral ─────────
function computePositions(items: VectorContextItem[]) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
  return items.map((item, i) => {
    // Similarity → radial distance (high similarity = close to center)
    const minR = 1.2;
    const maxR = 3.5;
    const r = minR + (1 - item.similarity) * (maxR - minR);

    // Golden-angle spiral on sphere
    const theta = goldenAngle * i;
    const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(items.length, 1));

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    return { item, position: [x, y, z] as [number, number, number] };
  });
}

// ─── Query Node (center) ──────────────────────────────
function QueryNode() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
      meshRef.current.rotation.x += delta * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.35, 1]} />
      <meshBasicMaterial color="#6c5ce7" wireframe transparent opacity={0.8} />
    </mesh>
  );
}

// ─── Item Node ────────────────────────────────────────
function ItemNode({
  item,
  position,
  index,
}: {
  item: VectorContextItem;
  position: [number, number, number];
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = TYPE_COLORS[item.type] || '#6c5ce7';

  // Fly-in animation: start at origin, lerp to target position
  const progress = useRef(0);
  const currentPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Fly-in (staggered by index)
    const delay = index * 0.08;
    const elapsed = state.clock.elapsedTime;
    if (elapsed > delay && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 2.5);
    }
    const eased = 1 - Math.pow(1 - progress.current, 3); // ease-out cubic
    currentPos.current.lerpVectors(new THREE.Vector3(0, 0, 0), targetPos, eased);

    // Gentle floating oscillation
    const float = Math.sin(state.clock.elapsedTime * 0.8 + index * 1.5) * 0.04;
    meshRef.current.position.set(
      currentPos.current.x,
      currentPos.current.y + float,
      currentPos.current.z
    );

    // Hover scale
    const targetScale = hovered ? 1.5 : 1;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      delta * 8
    );
  });

  const similarity = (item.similarity * 100).toFixed(0);
  const size = 0.12 + item.similarity * 0.12; // higher similarity = slightly bigger

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

      {/* Glow ring on hover */}
      {hovered && (
        <mesh position={currentPos.current}>
          <ringGeometry args={[size + 0.05, size + 0.12, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Tooltip on hover */}
      {hovered && (
        <Html position={currentPos.current} distanceFactor={6} zIndexRange={[100, 0]}>
          <div className="pointer-events-none select-none bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-venus-gray-200 px-3 py-2 min-w-[180px] max-w-[240px]"
            style={{ transform: 'translate(-50%, -120%)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-full text-white"
                style={{ backgroundColor: color }}
              >
                {TYPE_LABELS[item.type] || item.type}
              </span>
              <span className="text-[10px] font-medium text-venus-gray-400">
                {similarity}% match
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

// ─── Connection Lines ─────────────────────────────────
function ConnectionLine({
  target,
  similarity,
  index,
}: {
  target: [number, number, number];
  similarity: number;
  index: number;
}) {
  const progress = useRef(0);
  const currentTarget = useRef<[number, number, number]>([0, 0, 0]);

  useFrame((state, delta) => {
    const delay = index * 0.08;
    if (state.clock.elapsedTime > delay && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 2.5);
    }
    const eased = 1 - Math.pow(1 - progress.current, 3);
    currentTarget.current = [
      target[0] * eased,
      target[1] * eased,
      target[2] * eased,
    ];
  });

  return (
    <Line
      points={[[0, 0, 0], currentTarget.current]}
      color="#6c5ce7"
      lineWidth={1}
      transparent
      opacity={0.15 + similarity * 0.25}
      dashed
      dashSize={0.1}
      gapSize={0.08}
    />
  );
}

// ─── Particle Cloud ───────────────────────────────────
function ParticleCloud() {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random positions in a sphere of radius ~5
      const r = 3 + Math.random() * 3;
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
      pointsRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[particles, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color="#9387ed" size={0.03} transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

// ─── Main Component ───────────────────────────────────
interface VectorVisualizationProps {
  items: VectorContextItem[];
  query: string;
  isProcessing: boolean;
}

export default function VectorVisualization({ items, query, isProcessing }: VectorVisualizationProps) {
  const positioned = useMemo(() => computePositions(items), [items]);

  return (
    <div className="w-full h-[280px] rounded-lg overflow-hidden relative">
      {/* Label */}
      <div className="absolute top-2 left-3 z-10 flex items-center gap-2">
        <span className="text-[10px] font-semibold text-venus-purple/70 uppercase tracking-wider">
          Vector Space
        </span>
        <span className="text-[10px] text-venus-gray-400">
          {items.length} item{items.length !== 1 ? 's' : ''} found
        </span>
        {isProcessing && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-venus-purple animate-pulse" />
        )}
      </div>

      {/* Query label */}
      <div className="absolute bottom-2 left-3 z-10">
        <span className="text-[10px] text-venus-gray-400 truncate max-w-[200px] block">
          &ldquo;{query}&rdquo;
        </span>
      </div>

      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 6], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={(3 * Math.PI) / 4}
        />

        <QueryNode />

        {positioned.map(({ item, position }, i) => (
          <ItemNode key={item.id} item={item} position={position} index={i} />
        ))}

        {positioned.map(({ item, position }, i) => (
          <ConnectionLine
            key={`line-${item.id}`}
            target={position}
            similarity={item.similarity}
            index={i}
          />
        ))}

        <ParticleCloud />
      </Canvas>
    </div>
  );
}
