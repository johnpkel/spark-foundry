import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface VectorItem {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  position: [number, number, number];
}

export interface VectorEdge {
  from: number; // index into items
  to: number;
  similarity: number;
}

// ─── PCA: project 1024-dim embeddings → 3D ───────────

function pcaProject(embeddings: number[][]): [number, number, number][] {
  const N = embeddings.length;
  if (N === 0) return [];
  const D = embeddings[0].length;

  // 1. Center the data
  const mean = new Float64Array(D);
  for (const emb of embeddings) {
    for (let j = 0; j < D; j++) mean[j] += emb[j];
  }
  for (let j = 0; j < D; j++) mean[j] /= N;

  const centered = embeddings.map((emb) =>
    Float64Array.from(emb, (v, j) => v - mean[j])
  );

  // 2. Build N×N Gram matrix (X · X^T) — much smaller than D×D covariance
  const gram = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let dot = 0;
      for (let k = 0; k < D; k++) dot += centered[i][k] * centered[j][k];
      gram[i][j] = dot;
      gram[j][i] = dot;
    }
  }

  // 3. Deflated power iteration for top 3 eigenvectors
  const components: Float64Array[] = [];
  const eigenvalues: number[] = [];

  for (let c = 0; c < Math.min(3, N); c++) {
    // Random init
    let v = new Float64Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.random() - 0.5;

    // Power iteration (50 steps is plenty for small N)
    for (let iter = 0; iter < 50; iter++) {
      const Av = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < N; j++) sum += gram[i][j] * v[j];
        Av[i] = sum;
      }
      // Normalize
      let norm = 0;
      for (let i = 0; i < N; i++) norm += Av[i] * Av[i];
      norm = Math.sqrt(norm);
      if (norm < 1e-12) break;
      for (let i = 0; i < N; i++) v[i] = Av[i] / norm;
    }

    // Compute eigenvalue = v^T · A · v
    let eigenvalue = 0;
    for (let i = 0; i < N; i++) {
      let row = 0;
      for (let j = 0; j < N; j++) row += gram[i][j] * v[j];
      eigenvalue += v[i] * row;
    }

    components.push(v);
    eigenvalues.push(eigenvalue);

    // Deflate: A = A - λ · v · v^T
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        gram[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  // 4. Project each item: coordinate[c] = v_c[i] * sqrt(eigenvalue_c)
  //    This gives us the principal component scores
  const positions: [number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    const coords: number[] = [];
    for (let c = 0; c < 3; c++) {
      if (c < components.length && eigenvalues[c] > 1e-12) {
        coords.push(components[c][i] * Math.sqrt(eigenvalues[c]));
      } else {
        coords.push(0);
      }
    }
    positions.push(coords as [number, number, number]);
  }

  // 5. Normalize to a nice visual range (±3)
  let maxAbs = 0;
  for (const pos of positions) {
    for (const v of pos) maxAbs = Math.max(maxAbs, Math.abs(v));
  }
  const scale = maxAbs > 1e-12 ? 3 / maxAbs : 1;
  for (const pos of positions) {
    pos[0] *= scale;
    pos[1] *= scale;
    pos[2] *= scale;
  }

  return positions;
}

// Cosine similarity between two embedding vectors
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-12 ? dot / denom : 0;
}

// GET /api/sparks/[id]/vectors — 3D projected positions for all embedded items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('spark_items')
    .select('id, type, title, summary, embedding')
    .eq('spark_id', id)
    .not('embedding', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ items: [], edges: [] });
  }

  // Parse embeddings (stored as JSON string or array)
  const embeddings: number[][] = [];
  const validItems: typeof data = [];

  for (const item of data) {
    const emb = typeof item.embedding === 'string'
      ? JSON.parse(item.embedding)
      : item.embedding;
    if (Array.isArray(emb) && emb.length > 0) {
      embeddings.push(emb);
      validItems.push(item);
    }
  }

  if (validItems.length === 0) {
    return NextResponse.json({ items: [], edges: [] });
  }

  // PCA project to 3D
  const positions = pcaProject(embeddings);

  // Build items response
  const items: VectorItem[] = validItems.map((item, i) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    position: positions[i],
  }));

  // Find edges: connect items with cosine similarity > 0.5
  const edges: VectorEdge[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const sim = cosineSim(embeddings[i], embeddings[j]);
      if (sim > 0.5) {
        edges.push({ from: i, to: j, similarity: sim });
      }
    }
  }

  return NextResponse.json({ items, edges });
}
