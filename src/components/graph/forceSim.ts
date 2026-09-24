/**
 * Deterministic force-directed layout for the Pandora knowledge graph.
 *
 * Hand written on purpose — the project takes no layout dependency. The core is a
 * simplified Fruchterman-Reingold iteration (repulsion k²/d, attraction d²/k, linear
 * temperature) with three additions:
 *
 *   1. repulsion only walks the 3x3 neighbourhood of a uniform spatial grid, so the
 *      nominal O(n²) pass is bounded by the local density instead of the node count;
 *   2. a weak gravity pulls every node toward the canvas centre, otherwise isolated
 *      clusters (nodes without an edge) escape the viewport;
 *   3. alpha decays by ALPHA_DECAY (0.98) per step and the layout freezes once alpha
 *      drops below ALPHA_MIN (0.005) — positions then stay put until reheat().
 *
 * Zero mock data: a node's initial position is derived from its entity id through a
 * FNV-1a hash (angle + area-uniform radius), never from Math.random, so the same API
 * payload always produces the exact same layout.
 */

export const MAX_SIM_NODES = 300;
export const ALPHA_START = 1;
export const ALPHA_DECAY = 0.98;
export const ALPHA_MIN = 0.005;
export const MIN_NODE_RADIUS = 3.5;
export const MAX_NODE_RADIUS = 18;

const GRAVITY = 0.06;
const MIN_DIST_SQ = 0.25;
const EDGE_PADDING = 12;

/** Raw node shape accepted from GET /api/graph. */
export interface SimNodeSeed {
  id: string;
  /** Display label — falls back to the id when the payload omits it. */
  label?: string | null;
  risk?: number | null;
  weight?: number | null;
}

/** Raw edge shape accepted from GET /api/graph. */
export interface SimEdgeSeed {
  id?: string | null;
  source: string;
  target: string;
  relation?: string | null;
  weight?: number | null;
}

export interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Force accumulator for the current step (not a persistent velocity). */
  vx: number;
  vy: number;
  risk: number;
  weight: number;
  radius: number;
  degree: number;
  /** A pinned node is held by the pointer and skips integration. */
  fixed: boolean;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
  /** Resolved indices into Simulation.nodes. */
  from: number;
  to: number;
}

/** Screen <-> world projection used by the canvas viewport (zoom + pan). */
export interface ScreenView {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Point {
  x: number;
  y: number;
}

/** FNV-1a — stable across runs, the only source of "randomness" in the layout. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function num(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Uniform spatial hash — rebuilt every step, buckets reused to avoid GC churn. */
class SpatialGrid {
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: number[][];

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = Math.max(12, cellSize);
    this.cols = Math.max(1, Math.ceil(Math.max(width, 1) / this.cellSize));
    this.rows = Math.max(1, Math.ceil(Math.max(height, 1) / this.cellSize));
    this.buckets = new Array<number[]>(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i += 1) this.buckets[i] = [];
  }

  clear(): void {
    for (let i = 0; i < this.buckets.length; i += 1) this.buckets[i].length = 0;
  }

  insert(index: number, x: number, y: number): void {
    const cx = clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const cy = clamp(Math.floor(y / this.cellSize), 0, this.rows - 1);
    this.buckets[cy * this.cols + cx].push(index);
  }

  /** Visits every index stored in the 3x3 cell block around (x, y). */
  forEachNeighbour(x: number, y: number, visit: (index: number) => void): void {
    const cx = clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const cy = clamp(Math.floor(y / this.cellSize), 0, this.rows - 1);
    for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
      if (gy < 0 || gy >= this.rows) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        if (gx < 0 || gx >= this.cols) continue;
        const bucket = this.buckets[gy * this.cols + gx];
        for (let b = 0; b < bucket.length; b += 1) visit(bucket[b]);
      }
    }
  }
}

/**
 * Deterministic seed position: hash of the id gives the angle, a second hash gives a
 * radially uniform distance so nodes do not pile up in the middle.
 */
export function seedPosition(id: string, width: number, height: number): Point {
  const angle = ((hashString(`${id}#angle`) % 100000) / 100000) * Math.PI * 2;
  const spread = Math.sqrt((hashString(`${id}#radius`) % 100000) / 100000);
  const reach = Math.min(width, height) * 0.42;
  const bAngle = ((hashString(`${id}#tilt`) % 1000) / 1000 - 0.5) * 0.6;
  return {
    x: clamp(width / 2 + Math.cos(angle + bAngle) * spread * reach, EDGE_PADDING, Math.max(EDGE_PADDING, width - EDGE_PADDING)),
    y: clamp(height / 2 + Math.sin(angle + bAngle) * spread * reach, EDGE_PADDING, Math.max(EDGE_PADDING, height - EDGE_PADDING)),
  };
}

export class Simulation {
  readonly nodes: SimNode[] = [];
  readonly edges: SimEdge[] = [];
  readonly width: number;
  readonly height: number;
  readonly k: number;
  alpha = ALPHA_START;
  frozen = false;
  steps = 0;
  /** Nodes dropped because the payload exceeded MAX_SIM_NODES. */
  truncated = 0;
  /** Edges dropped because an end node is missing or the link is a self loop. */
  orphanEdges = 0;

  private readonly positions = new Map<string, number>();
  private readonly grid: SpatialGrid;
  private readonly cutoff: number;

  constructor(nodes: SimNodeSeed[], edges: SimEdgeSeed[], width: number, height: number) {
    this.width = Math.max(80, width);
    this.height = Math.max(80, height);

    const kept = nodes.slice(0, MAX_SIM_NODES);
    this.truncated = Math.max(0, nodes.length - kept.length);

    const degrees = new Map<string, number>();
    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }

    for (const seed of kept) {
      if (this.positions.has(seed.id)) continue;
      const point = seedPosition(seed.id, this.width, this.height);
      const risk = clamp(num(seed.risk, 0), 0, 100);
      const weight = clamp(num(seed.weight, 0), 0, 1);
      const degree = degrees.get(seed.id) || 0;
      this.positions.set(seed.id, this.nodes.length);
      this.nodes.push({
        id: seed.id,
        label: typeof seed.label === 'string' && seed.label.length > 0 ? seed.label : seed.id,
        x: point.x,
        y: point.y,
        vx: 0,
        vy: 0,
        risk,
        weight,
        degree,
        fixed: false,
        radius: clamp(4 + weight * 3.5 + (risk / 100) * 6 + Math.min(degree, 10) * 0.45, MIN_NODE_RADIUS, MAX_NODE_RADIUS),
      });
    }

    const seen = new Set<string>();
    for (const edge of edges) {
      const from = this.positions.get(edge.source);
      const to = this.positions.get(edge.target);
      if (from === undefined || to === undefined || from === to) {
        this.orphanEdges += 1;
        continue;
      }
      const relation = edge.relation || 'UNKNOWN';
      const key = edge.id || `${from}>${to}>${relation}`;
      if (seen.has(key)) {
        this.orphanEdges += 1;
        continue;
      }
      seen.add(key);
      this.edges.push({
        id: key,
        source: edge.source,
        target: edge.target,
        relation,
        weight: clamp(num(edge.weight, 0.5), 0.05, 1),
        from,
        to,
      });
    }

    this.k = Math.sqrt((this.width * this.height) / Math.max(1, this.nodes.length));
    this.cutoff = this.k * 2.2;
    this.grid = new SpatialGrid(this.width, this.height, this.cutoff);
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  findNode(id: string): SimNode | null {
    const index = this.positions.get(id);
    return index === undefined ? null : this.nodes[index];
  }

  /** One Fruchterman-Reingold iteration. Returns false once the layout is frozen. */
  step(): boolean {
    if (this.frozen) return false;
    const nodes = this.nodes;
    const n = nodes.length;
    if (n === 0) {
      this.frozen = true;
      return false;
    }

    for (let i = 0; i < n; i += 1) {
      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }

    const cutoffSq = this.cutoff * this.cutoff;
    const kSq = this.k * this.k;

    // --- repulsion (grid limited) ---------------------------------------------
    this.grid.clear();
    for (let i = 0; i < n; i += 1) this.grid.insert(i, nodes[i].x, nodes[i].y);

    for (let i = 0; i < n; i += 1) {
      const a = nodes[i];
      this.grid.forEachNeighbour(a.x, a.y, (j) => {
        if (j <= i) return;
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > cutoffSq) return;
        if (d2 < MIN_DIST_SQ) {
          // Coincident nodes: deterministic nudge derived from the id, never random.
          const angle = ((hashString(a.id) % 3600) / 3600) * Math.PI * 2;
          dx = Math.cos(angle) * 0.5;
          dy = Math.sin(angle) * 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const force = kSq / d;
        const ux = dx / d;
        const uy = dy / d;
        a.vx += ux * force;
        a.vy += uy * force;
        b.vx -= ux * force;
        b.vy -= uy * force;
      });
    }

    // --- spring attraction on edges -------------------------------------------
    for (let e = 0; e < this.edges.length; e += 1) {
      const edge = this.edges[e];
      const a = nodes[edge.from];
      const b = nodes[edge.to];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const pull = ((d * d) / this.k) * (0.35 + edge.weight * 1.3);
      const ux = dx / d;
      const uy = dy / d;
      a.vx += ux * pull;
      a.vy += uy * pull;
      b.vx -= ux * pull;
      b.vy -= uy * pull;
    }

    // --- gravity toward the canvas centre -------------------------------------
    const cx = this.width / 2;
    const cy = this.height / 2;
    for (let i = 0; i < n; i += 1) {
      const node = nodes[i];
      node.vx += (cx - node.x) * GRAVITY;
      node.vy += (cy - node.y) * GRAVITY;
    }

    // --- bounded displacement (linear temperature) ----------------------------
    const limit = Math.max(0.5, this.k * 0.45 * this.alpha);
    const maxX = Math.max(EDGE_PADDING, this.width - EDGE_PADDING);
    const maxY = Math.max(EDGE_PADDING, this.height - EDGE_PADDING);
    for (let i = 0; i < n; i += 1) {
      const node = nodes[i];
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      const scale = speed > limit ? limit / speed : 1;
      node.x = clamp(node.x + node.vx * scale, EDGE_PADDING, maxX);
      node.y = clamp(node.y + node.vy * scale, EDGE_PADDING, maxY);
    }

    this.steps += 1;
    this.alpha *= ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN) {
      this.alpha = 0;
      this.frozen = true;
      return false;
    }
    return true;
  }

  /** Runs the iteration to completion (used to warm start the first paint). */
  settle(maxSteps = 400): number {
    let executed = 0;
    while (executed < maxSteps && this.step()) executed += 1;
    return executed;
  }

  /** Raises the temperature again — called when the user drags a node. */
  reheat(alpha = 0.35): void {
    this.alpha = Math.max(alpha, ALPHA_MIN * 2);
    this.frozen = false;
  }

  pin(id: string, x: number, y: number): SimNode | null {
    const node = this.findNode(id);
    if (!node) return null;
    node.fixed = true;
    node.x = x;
    node.y = y;
    node.vx = 0;
    node.vy = 0;
    return node;
  }

  movePinned(id: string, x: number, y: number): SimNode | null {
    const node = this.findNode(id);
    if (!node) return null;
    node.fixed = true;
    node.x = clamp(x, EDGE_PADDING, Math.max(EDGE_PADDING, this.width - EDGE_PADDING));
    node.y = clamp(y, EDGE_PADDING, Math.max(EDGE_PADDING, this.height - EDGE_PADDING));
    return node;
  }

  release(id: string): void {
    const node = this.findNode(id);
    if (node) node.fixed = false;
  }

  releaseAll(): void {
    for (const node of this.nodes) node.fixed = false;
  }
}

export function createSimulation(
  nodes: SimNodeSeed[],
  edges: SimEdgeSeed[],
  width: number,
  height: number,
): Simulation {
  return new Simulation(nodes, edges, width, height);
}

/* =====================================================================
   Projection helpers — world <-> screen (zoom / pan) and hit testing
   ===================================================================== */

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 6;

export function createView(scale = 1, offsetX = 0, offsetY = 0): ScreenView {
  return { scale, offsetX, offsetY };
}

export function worldToScreen(view: ScreenView, x: number, y: number): Point {
  return { x: x * view.scale + view.offsetX, y: y * view.scale + view.offsetY };
}

export function screenToWorld(view: ScreenView, x: number, y: number): Point {
  return { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
}

/** Zooms around a screen anchor so the point under the cursor stays put. */
export function zoomAt(view: ScreenView, sx: number, sy: number, factor: number): ScreenView {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === view.scale) return view;
  const world = screenToWorld(view, sx, sy);
  return {
    scale,
    offsetX: sx - world.x * scale,
    offsetY: sy - world.y * scale,
  };
}

export function panBy(view: ScreenView, dx: number, dy: number): ScreenView {
  return { scale: view.scale, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

export function boundsOf(nodes: SimNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = nodes[0].x;
  let minY = nodes[0].y;
  let maxX = nodes[0].x;
  let maxY = nodes[0].y;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Computes the view that frames every node inside width x height. */
export function fitView(nodes: SimNode[], width: number, height: number, padding = 36): ScreenView {
  if (nodes.length === 0) return createView();
  const { minX, minY, maxX, maxY } = boundsOf(nodes);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const usableW = Math.max(width - padding * 2, 20);
  const usableH = Math.max(height - padding * 2, 20);
  const scale = clamp(Math.min(usableW / spanX, usableH / spanY), MIN_SCALE, MAX_SCALE);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    scale,
    offsetX: width / 2 - cx * scale,
    offsetY: height / 2 - cy * scale,
  };
}

/** Nearest node under a screen point (within its drawn radius), or null. */
export function hitTest(nodes: SimNode[], view: ScreenView, sx: number, sy: number, slop = 6): SimNode | null {
  const world = screenToWorld(view, sx, sy);
  let best: SimNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const dx = node.x - world.x;
    const dy = node.y - world.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = node.radius + slop / view.scale;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}
