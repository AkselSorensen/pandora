'use client';

/**
 * KnowledgeGraphPanel — Pandora entity graph workbench.
 *
 * Four tabs, all fed by the live graph proxies (no mock data anywhere):
 *   GRAPHE   canvas force-directed render (devicePixelRatio aware), node drag, wheel zoom,
 *            background pan, click selection, per-relation edge colours, node size from
 *            risk/weight, filters (type / domain / min_risk / limit).
 *   ENTITE   pivot around the selected entity: neighbours, relations, contributing sources,
 *            risk rank, and "AJOUTER AU DOSSIER" (GET /api/cases then POST evidence).
 *   RECHERCHE free text search -> results jump to ENTITE.
 *   POSTURE  degraded upstreams, ACL posture, top 20 by risk, distribution by type/domain.
 *
 * The ACL banner returned by the API is always rendered (clearance, compartments, dropped
 * nodes), on every tab. A non-ok response always surfaces the HTTP status + server message.
 *
 * All colours come from the CSS variables of globals.css — nothing is hard coded, and the
 * canvas palette is read from getComputedStyle on mount.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, ChevronRight, CircleCheck, Crosshair, Database, Focus, FolderPlus,
  GitBranch, Hash, Layers, Link2, ListTree, Loader2, Network, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Target, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  MAX_SIM_NODES, createSimulation, createView, fitView, hitTest, panBy, screenToWorld, zoomAt,
  worldToScreen, type ScreenView, type Simulation,
} from '@/components/graph/forceSim';

/* ------------------------------------------------------------------ types */

interface GraphNode {
  id: string;
  type: string;
  label: string;
  risk: number;
  weight: number;
  lat?: number | null;
  lon?: number | null;
  tags?: string[];
  sources?: string[];
  classification?: string;
  compartments?: string[];
  attrs?: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
  evidence?: string;
}

interface GraphAcl {
  clearance?: string;
  compartments?: string[];
  droppedNodes?: number;
  policy?: string;
}

interface GraphPayload {
  mode?: string;
  generatedAt?: string;
  stats?: {
    nodes?: number;
    edges?: number;
    types?: Record<string, number>;
    domains?: Record<string, number>;
    relations?: string[];
    sampled?: Record<string, number>;
  };
  degraded?: string[];
  sources?: Record<string, boolean>;
  acl?: GraphAcl;
  returned?: { nodes?: number; edges?: number };
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

interface EntityNeighbour {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
  evidence?: string;
  neighbour: GraphNode;
}

interface EntityPayload {
  found: boolean;
  entity: GraphNode;
  neighbours: EntityNeighbour[];
  degree: number;
  relations: string[];
  contributingSources: string[];
  riskRank: GraphNode[];
  acl?: GraphAcl;
}

interface SearchHit {
  id: string;
  type: string;
  label: string;
  risk: number;
  classification?: string;
  sources?: string[];
}

interface SearchPayload {
  count: number;
  entities: SearchHit[];
  acl?: GraphAcl;
}

interface CaseRecord {
  id: string;
  title: string;
  status: string;
  priority: string;
  classification?: string;
  evidenceCount?: number;
}

type Tab = 'graph' | 'entity' | 'search' | 'posture';

/* --------------------------------------------------------- palette plumbing */

/** CSS custom properties read from globals.css — no colour literal lives in this file. */
type PaletteVar =
  | '--bg-void'
  | '--gold-primary'
  | '--gold-light'
  | '--gold-dim'
  | '--cyan-primary'
  | '--cyan-dim'
  | '--alert-red'
  | '--alert-orange'
  | '--alert-green'
  | '--alert-blue'
  | '--text-primary'
  | '--text-secondary'
  | '--text-muted'
  | '--text-heading'
  | '--border-primary'
  | '--font-hud';

const PALETTE_VARS: PaletteVar[] = [
  '--bg-void', '--gold-primary', '--gold-light', '--gold-dim', '--cyan-primary', '--cyan-dim',
  '--alert-red', '--alert-orange', '--alert-green', '--alert-blue', '--text-primary',
  '--text-secondary', '--text-muted', '--text-heading', '--border-primary', '--font-hud',
];

const RELATION_VAR: Record<string, PaletteVar> = {
  HAS_ZONE: '--gold-primary',
  HAS_INFRA: '--cyan-primary',
  HAS_AIRCRAFT: '--alert-blue',
  HAS_SIGNAL: '--alert-orange',
  HAS_ALERT: '--alert-red',
  HAS_CYBER_INDICATOR: '--alert-green',
  HAS_NUCLEAR_ACTOR: '--alert-red',
  OPERATES_IN: '--gold-light',
  LOCATED_IN: '--cyan-dim',
  OBSERVED_NEAR: '--alert-orange',
  ATTRIBUTED_TO: '--gold-dim',
  ESCALATES_WITH: '--alert-red',
  CLASSIFIED_AS: '--text-secondary',
  ALERT_CATEGORY: '--gold-light',
  ALERT_AT: '--cyan-primary',
};

function relationVar(relation: string): PaletteVar {
  return RELATION_VAR[relation] || '--text-muted';
}

const TYPE_TAG: Record<string, string> = {
  Alert: 'gotham-tag--critical',
  NuclearActor: 'gotham-tag--critical',
  CyberIndicator: 'gotham-tag--high',
  Signal: 'gotham-tag--high',
  Aircraft: 'gotham-tag--info',
  InfraSite: 'gotham-tag--info',
  Zone: 'gotham-tag--info',
  Location: 'gotham-tag--info',
  OperationalPicture: 'gotham-tag--low',
  Category: 'gotham-tag--low',
  Source: 'gotham-tag--low',
};

function typeTag(type: string): string {
  return TYPE_TAG[type] || 'gotham-tag--low';
}

function riskTag(risk: number): string {
  if (risk >= 85) return 'gotham-tag--critical';
  if (risk >= 65) return 'gotham-tag--high';
  if (risk >= 40) return 'gotham-tag--info';
  return 'gotham-tag--low';
}

function riskVar(risk: number): PaletteVar {
  if (risk >= 85) return '--alert-red';
  if (risk >= 65) return '--alert-orange';
  if (risk >= 40) return '--gold-primary';
  return '--alert-green';
}

function priorityTag(priority: string): string {
  if (priority === 'critical') return 'gotham-tag--critical';
  if (priority === 'high') return 'gotham-tag--high';
  if (priority === 'normal' || priority === 'medium') return 'gotham-tag--info';
  return 'gotham-tag--low';
}

function clip(text: string, max = 26): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function count(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('fr-FR') : '0';
}

function readPalette(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const style = getComputedStyle(document.documentElement);
  const palette: Record<string, string> = {};
  for (const name of PALETTE_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) palette[name] = value;
  }
  return palette;
}

/** Turns any non-ok Response into "status + server message". */
async function describeFailure(response: Response): Promise<string> {
  let message = response.statusText || 'request failed';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const record = body as { detail?: unknown; error?: unknown; message?: unknown };
      const detail = record.detail ?? record.error ?? record.message;
      if (typeof detail === 'string') {
        message = detail;
      } else if (detail && typeof detail === 'object') {
        const nested = detail as { error?: unknown; reason?: unknown; message?: unknown };
        const parts = [nested.error, nested.reason ?? nested.message].filter(
          (part): part is string => typeof part === 'string' && part.length > 0,
        );
        if (parts.length > 0) message = parts.join(' — ');
      }
    }
  } catch {
    /* body was not JSON: keep the status text */
  }
  return `${response.status} ${message}`;
}

/* ------------------------------------------------------------ canvas render */

interface PaintOptions {
  dpr: number;
  selectedId: string | null;
  hoverId: string | null;
}

function paintScene(
  canvas: HTMLCanvasElement,
  sim: Simulation,
  view: ScreenView,
  palette: Record<string, string>,
  options: PaintOptions,
): void {
  const fallback = palette['--text-primary'];
  if (!fallback) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pick = (name: PaletteVar): string => palette[name] || fallback;
  const width = sim.width;
  const height = sim.height;
  const dpr = options.dpr;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pick('--bg-void');
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  // Frame + centre axes, drawn from the border/text variables.
  ctx.strokeStyle = pick('--border-primary');
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const selected = options.selectedId;

  // Edges — colour per relation, weight drives alpha and width.
  for (const edge of sim.edges) {
    const a = sim.nodes[edge.from];
    const b = sim.nodes[edge.to];
    const p1 = worldToScreen(view, a.x, a.y);
    const p2 = worldToScreen(view, b.x, b.y);
    if ((p1.x < -40 && p2.x < -40) || (p1.x > width + 40 && p2.x > width + 40)) continue;
    if ((p1.y < -40 && p2.y < -40) || (p1.y > height + 40 && p2.y > height + 40)) continue;
    const focused = selected !== null && (edge.source === selected || edge.target === selected);
    ctx.strokeStyle = pick(relationVar(edge.relation));
    ctx.globalAlpha = focused ? 0.92 : 0.16 + edge.weight * 0.3;
    ctx.lineWidth = focused ? 1.7 : 0.55 + edge.weight * 0.9;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes — colour per risk band, size from risk/weight/degree.
  const font = palette['--font-hud'] || 'monospace';
  for (const node of sim.nodes) {
    const point = worldToScreen(view, node.x, node.y);
    const isSelected = selected === node.id;
    const isHovered = options.hoverId === node.id;
    const radius = Math.max(2.2, node.radius * Math.min(Math.max(view.scale, 0.6), 1.6));
    if (point.x < -60 || point.x > width + 60 || point.y < -60 || point.y > height + 60) continue;

    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = pick(isSelected ? '--gold-primary' : '--cyan-primary');
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = pick(riskVar(node.risk));
    ctx.globalAlpha = 0.94;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isSelected || isHovered) {
      ctx.strokeStyle = pick('--text-heading');
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    if (view.scale >= 0.85 || isSelected || isHovered) {
      ctx.font = `600 9px ${font}`;
      ctx.fillStyle = pick(isSelected || isHovered ? '--text-heading' : '--text-secondary');
      ctx.fillText(clip(node.label), point.x + radius + 3, point.y + 3);
    }
  }

  // Collar legend — never anything but live counters.
  ctx.font = `600 9px ${font}`;
  ctx.fillStyle = pick('--text-muted');
  ctx.fillText(
    `NOEUDS ${sim.nodeCount} · ARETES ${sim.edgeCount} · ZOOM ${view.scale.toFixed(2)}`,
    8,
    height - 8,
  );
}

/* ---------------------------------------------------------------- component */

interface KnowledgeGraphPanelProps {
  className?: string;
  /** Kept permissive so the shell can pass extra attributes without a type break. */
  [key: string]: unknown;
}

const TABS: Array<[Tab, string]> = [
  ['graph', 'Graphe'],
  ['entity', 'Entité'],
  ['search', 'Recherche'],
  ['posture', 'Posture'],
];

function KnowledgeGraphPanel({ className }: KnowledgeGraphPanelProps) {
  const [tab, setTab] = useState<Tab>('graph');
  const [limit, setLimit] = useState(120);
  const [minRisk, setMinRisk] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');

  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [graphError, setGraphError] = useState('');
  const [graphLoading, setGraphLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntityPayload | null>(null);
  const [entityError, setEntityError] = useState('');
  const [entityLoading, setEntityLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [cases, setCases] = useState<CaseRecord[] | null>(null);
  const [casesError, setCasesError] = useState('');
  const [casesLoading, setCasesLoading] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierBusy, setDossierBusy] = useState<string | null>(null);
  const [dossierResult, setDossierResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const paletteRef = useRef<Record<string, string>>({});
  const viewRef = useRef<ScreenView>(createView());
  const paintRef = useRef<PaintOptions>({ dpr: 1, selectedId: null, hoverId: null });
  const hoverRef = useRef<string | null>(null);
  const grabRef = useRef({ dx: 0, dy: 0 });
  const pointerRef = useRef<{ mode: 'none' | 'pan' | 'node'; id: string; lastX: number; lastY: number; moved: boolean }>({
    mode: 'none', id: '', lastX: 0, lastY: 0, moved: false,
  });

  /* ------------------------------------------------------------ data loads */

  // The request is fired before any setState: this callback is called from an effect, and
  // an effect must not update state synchronously. The loading flag is raised by callers.
  const loadGraph = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit), min_risk: String(minRisk) });
      if (typeFilter) params.set('type', typeFilter);
      if (domainFilter) params.set('domain', domainFilter);
      const response = await fetch(`/api/graph?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        setGraphError(await describeFailure(response));
        setPayload(null);
        return;
      }
      setPayload((await response.json()) as GraphPayload);
      setGraphError('');
    } catch (error) {
      setGraphError(error instanceof Error ? `réseau — ${error.message}` : 'réseau — échec');
      setPayload(null);
    } finally {
      setGraphLoading(false);
    }
  }, [domainFilter, limit, minRisk, typeFilter]);

  useEffect(() => {
    // Deferred by a macrotask on purpose: an effect body must not hand setState a
    // synchronous call (react-hooks/set-state-in-effect), and the timer also lets a
    // filter change cancel a load that has not been fired yet.
    const timer = window.setTimeout(() => { void loadGraph(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadGraph]);

  const loadEntity = useCallback(async (id: string) => {
    setEntityLoading(true);
    setEntityError('');
    try {
      const response = await fetch(`/api/graph/entity/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) {
        setEntityError(await describeFailure(response));
        setEntity(null);
        return;
      }
      setEntity((await response.json()) as EntityPayload);
    } catch (error) {
      setEntityError(error instanceof Error ? `réseau — ${error.message}` : 'réseau — échec');
      setEntity(null);
    } finally {
      setEntityLoading(false);
    }
  }, []);

  const selectEntity = useCallback((id: string) => {
    setSelectedId(id);
    setTab('entity');
    setDossierResult(null);
    setDossierOpen(false);
    void loadEntity(id);
  }, [loadEntity]);

  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError('');
    try {
      const response = await fetch('/api/cases', { cache: 'no-store' });
      if (!response.ok) {
        setCasesError(await describeFailure(response));
        setCases(null);
        return;
      }
      const body = (await response.json()) as { total?: number; cases?: CaseRecord[] };
      setCases(Array.isArray(body.cases) ? body.cases : []);
    } catch (error) {
      setCasesError(error instanceof Error ? `réseau — ${error.message}` : 'réseau — échec');
      setCases(null);
    } finally {
      setCasesLoading(false);
    }
  }, []);

  const attachToCase = useCallback(async (caseId: string) => {
    const node = entity?.entity;
    if (!node) return;
    setDossierBusy(caseId);
    setDossierResult(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'entity',
          label: node.label,
          source_url: typeof window === 'undefined' ? '' : window.location.href,
          payload: { entity_id: node.id, type: node.type, label: node.label, risk: node.risk },
        }),
      });
      if (!response.ok) {
        const reason = await describeFailure(response);
        setDossierResult({
          tone: 'error',
          text: response.status === 403
            ? `REFUSÉ PAR LE CONTRÔLE D'ACCÈS — ${reason}`
            : response.status === 503
              ? `GOUVERNANCE INDISPONIBLE — ${reason}`
              : `ÉCHEC — ${reason}`,
        });
        return;
      }
      const body = (await response.json()) as { evidence?: { id?: string } };
      setDossierResult({
        tone: 'ok',
        text: `PREUVE AJOUTÉE AU DOSSIER ${caseId}${body.evidence?.id ? ` · ${body.evidence.id}` : ''}`,
      });
      void loadCases();
    } catch (error) {
      setDossierResult({ tone: 'error', text: error instanceof Error ? `RÉSEAU — ${error.message}` : 'RÉSEAU — ÉCHEC' });
    } finally {
      setDossierBusy(null);
    }
  }, [entity, loadCases]);

  const runSearch = useCallback(async (term: string) => {
    const query = term.trim();
    if (!query) {
      setResults({ count: 0, entities: [] });
      setSearchError('');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({ q: query });
      if (typeFilter) params.set('type', typeFilter);
      const response = await fetch(`/api/graph/search?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        setSearchError(await describeFailure(response));
        setResults(null);
        return;
      }
      setResults((await response.json()) as SearchPayload);
    } catch (error) {
      setSearchError(error instanceof Error ? `réseau — ${error.message}` : 'réseau — échec');
      setResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [typeFilter]);

  /* ----------------------------------------------------------- canvas wiring */

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    paintScene(canvas, sim, viewRef.current, paletteRef.current, paintRef.current);
  }, []);

  // The palette is read once from globals.css and kept in a ref: the canvas is painted
  // imperatively, so no state update (and no cascading render) is needed here.
  useEffect(() => {
    paletteRef.current = readPalette();
    repaint();
  }, [repaint]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => {
    paintRef.current = {
      dpr: Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2),
      selectedId,
      hoverId,
    };
    repaint();
  }, [hoverId, repaint, selectedId]);

  useEffect(() => {
    if (tab !== 'graph') return;
    if (!payload || size.width < 60 || size.height < 60) return;
    const sim = createSimulation(payload.nodes || [], payload.edges || [], size.width, size.height);
    sim.settle(140);
    simRef.current = sim;
    viewRef.current = fitView(sim.nodes, size.width, size.height);
    let frame = 0;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const alive = sim.step();
      repaint();
      frame = alive ? requestAnimationFrame(tick) : 0;
    };
    repaint();
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [payload, repaint, size.height, size.width, tab]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== 'graph') return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      viewRef.current = zoomAt(viewRef.current, event.clientX - rect.left, event.clientY - rect.top, factor);
      repaint();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [payload, repaint, tab]);

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim) return;
    const point = pointOf(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = hitTest(sim.nodes, viewRef.current, point.x, point.y);
    if (node) {
      const world = screenToWorld(viewRef.current, point.x, point.y);
      grabRef.current = { dx: node.x - world.x, dy: node.y - world.y };
      sim.pin(node.id, node.x, node.y);
      sim.reheat(0.2);
      pointerRef.current = { mode: 'node', id: node.id, lastX: point.x, lastY: point.y, moved: false };
      repaint();
      return;
    }
    pointerRef.current = { mode: 'pan', id: '', lastX: point.x, lastY: point.y, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim) return;
    const point = pointOf(event);
    const pointer = pointerRef.current;
    if (pointer.mode === 'pan') {
      const dx = point.x - pointer.lastX;
      const dy = point.y - pointer.lastY;
      pointer.lastX = point.x;
      pointer.lastY = point.y;
      pointer.moved = true;
      viewRef.current = panBy(viewRef.current, dx, dy);
      repaint();
      return;
    }
    if (pointer.mode === 'node') {
      const world = screenToWorld(viewRef.current, point.x, point.y);
      pointer.lastX = point.x;
      pointer.lastY = point.y;
      pointer.moved = true;
      sim.movePinned(pointer.id, world.x + grabRef.current.dx, world.y + grabRef.current.dy);
      sim.reheat(0.25);
      repaint();
      return;
    }
    const hovered = hitTest(sim.nodes, viewRef.current, point.x, point.y);
    const nextId = hovered ? hovered.id : null;
    if (nextId !== hoverRef.current) {
      hoverRef.current = nextId;
      setHoverId(nextId);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pointer = pointerRef.current;
    pointerRef.current = { mode: 'none', id: '', lastX: 0, lastY: 0, moved: false };
    if (!sim) return;
    if (pointer.mode === 'node') {
      sim.release(pointer.id);
      sim.reheat(0.15);
      repaint();
      if (!pointer.moved) selectEntity(pointer.id);
    }
  };

  const zoomBy = (factor: number) => {
    viewRef.current = zoomAt(viewRef.current, size.width / 2, size.height / 2, factor);
    repaint();
  };

  const refit = () => {
    const sim = simRef.current;
    if (!sim) return;
    viewRef.current = fitView(sim.nodes, sim.width, sim.height);
    repaint();
  };

  /* -------------------------------------------------------------- derived */

  const acl: GraphAcl = payload?.acl || {};
  const degraded = payload?.degraded || [];
  const nodes = payload?.nodes || [];
  const typeEntries = Object.entries(payload?.stats?.types || {}).sort((a, b) => b[1] - a[1]);
  const domainEntries = Object.entries(payload?.stats?.domains || {}).sort((a, b) => b[1] - a[1]);
  const relatedEdges = selectedId
    ? (payload?.edges || []).filter(edge => edge.source === selectedId || edge.target === selectedId)
    : [];
  const topRisk = [...nodes].sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id)).slice(0, 20);
  const droppedNodes = acl.droppedNodes || 0;

  const chip = (active: boolean) => `gotham-tag ${active ? 'gotham-tag--info' : 'gotham-tag--low'}`;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.35, duration: 0.6 }}
      className={`glass-panel aip-panel p-3 pointer-events-auto ${className || ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="mission-reticle"><Network className="w-4 h-4" /></div>
          <div className="min-w-0">
            <div className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">KNOWLEDGE GRAPH</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em] truncate">
              ENTITÉS · RELATIONS · PROVENANCE
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="gotham-tag gotham-tag--info">{payload?.mode || 'N/A'}</span>
          <button
            type="button"
            onClick={() => { setGraphLoading(true); void loadGraph(); }}
            className="aip-mini-button"
            title="Recharger le graphe"
          >
            <RefreshCw className={`h-3 w-3 ${graphLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Bandeau ACL — toujours affiché, quel que soit l'onglet */}
      <div className="glass-panel-sm px-3 py-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="hud-label">ACL</span>
          <span className="text-[9px] font-mono text-[var(--text-secondary)]">
            CLEARANCE {acl.clearance || 'N/A'}
          </span>
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            COMPARTIMENTS {(acl.compartments || []).join(', ') || 'AUCUN'}
          </span>
          <span className={`gotham-tag ${droppedNodes > 0 ? 'gotham-tag--high' : 'gotham-tag--low'}`}>
            {count(droppedNodes)} NŒUDS MASQUÉS
          </span>
          {degraded.length > 0 && (
            <span className="gotham-tag gotham-tag--critical">DÉGRADÉ {degraded.join(' · ')}</span>
          )}
          {acl.policy && (
            <span className="text-[9px] font-mono text-[var(--text-muted)]">POLICY {acl.policy}</span>
          )}
        </div>
      </div>

      <div className="aip-tabs mb-3">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? 'active' : ''}>
            {label}
          </button>
        ))}
      </div>

      {graphError && (
        <div className="glass-panel-sm mb-3 flex items-center gap-2 px-3 py-2">
          <AlertTriangle className="h-3 w-3 text-[var(--alert-red)]" />
          <span className="text-[10px] font-mono text-[var(--alert-red)]">GRAPHE — {graphError}</span>
        </div>
      )}

      {tab === 'graph' && (
        <div className="space-y-2">
          <div className="ops-watch-builder grid grid-cols-2 gap-2">
            <select value={typeFilter} onChange={event => { setGraphLoading(true); setTypeFilter(event.target.value); }}>
              <option value="">TYPE · TOUS</option>
              {typeEntries.map(([name, total]) => (
                <option key={name} value={name}>{`${name} (${total})`}</option>
              ))}
            </select>
            <select value={domainFilter} onChange={event => { setGraphLoading(true); setDomainFilter(event.target.value); }}>
              <option value="">DOMAINE · TOUS</option>
              {domainEntries.map(([name, total]) => (
                <option key={name} value={name}>{`${name} (${total})`}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="hud-label mr-1"><Target className="mr-1 inline h-3 w-3" />RISQUE MIN</span>
            {[0, 40, 65, 85].map(value => (
              <button key={value} type="button" className={chip(minRisk === value)} onClick={() => { setGraphLoading(true); setMinRisk(value); }}>
                ≥ {value}
              </button>
            ))}
            <span className="hud-label mx-1"><Layers className="mr-1 inline h-3 w-3" />LIMITE</span>
            {[60, 120, 200, 300].map(value => (
              <button key={value} type="button" className={chip(limit === value)} onClick={() => { setGraphLoading(true); setLimit(value); }}>
                {value}
              </button>
            ))}
          </div>

          <div
            ref={wrapRef}
            className="relative overflow-hidden rounded border border-[var(--border-primary)]"
            style={{ height: 'min(52vh, 460px)', background: 'var(--bg-void)' }}
          >
            <canvas
              ref={canvasRef}
              className="block h-full w-full touch-none"
              style={{ cursor: hoverId ? 'pointer' : 'grab' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {graphLoading && !payload && (
              <div className="absolute inset-0 flex items-center justify-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-[var(--gold-primary)]" />
                <span className="text-[10px] font-mono text-[var(--text-muted)]">CHARGEMENT DU GRAPHE…</span>
              </div>
            )}
            {!graphLoading && payload && nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
                <ListTree className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                  AUCUNE ENTITÉ PUBLIÉE POUR CES FILTRES
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                  Élargissez le type, le domaine ou abaissez le risque minimum.
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button type="button" className="aip-mini-button" onClick={() => zoomBy(1.25)} title="Zoom avant">
                <ZoomIn className="h-3 w-3" />
              </button>
              <button type="button" className="aip-mini-button" onClick={() => zoomBy(0.8)} title="Zoom arrière">
                <ZoomOut className="h-3 w-3" />
              </button>
              <button type="button" className="aip-mini-button" onClick={refit} title="Recadrer le graphe">
                <Focus className="h-3 w-3" /> RECADRER
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                RENVOYÉ {count(payload?.returned?.nodes || 0)} NŒUDS · {count(payload?.returned?.edges || 0)} ARÊTES
              </span>
              {nodes.length > MAX_SIM_NODES && (
                <span className="gotham-tag gotham-tag--high">
                  {count(nodes.length - MAX_SIM_NODES)} HORS SIMULATION
                </span>
              )}
            </div>
          </div>

          {selectedId && (
            <div className="aip-entity-row">
              <Crosshair className="h-3 w-3 text-[var(--gold-primary)]" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{selectedId}</span>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">{relatedEdges.length} ARÊTES</span>
              <button type="button" className="aip-mini-button" onClick={() => selectEntity(selectedId)}>
                FICHE <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'entity' && (
        <div className="space-y-3">
          {entityLoading && (
            <div className="glass-panel-sm flex items-center gap-2 px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--gold-primary)]" />
              <span className="text-[10px] font-mono text-[var(--text-muted)]">CHARGEMENT DE L’ENTITÉ…</span>
            </div>
          )}
          {entityError && (
            <div className="glass-panel-sm flex items-center gap-2 px-3 py-2">
              <ShieldAlert className="h-3 w-3 text-[var(--alert-red)]" />
              <span className="text-[10px] font-mono text-[var(--alert-red)]">ENTITÉ — {entityError}</span>
            </div>
          )}
          {!entityLoading && !entityError && !entity && (
            <div className="glass-panel-sm px-3 py-4 text-center">
              <Crosshair className="mx-auto mb-1 h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                AUCUNE ENTITÉ SÉLECTIONNÉE — cliquez un nœud dans GRAPHE ou lancez une RECHERCHE.
              </span>
            </div>
          )}
          {entity && !entity.found && (
            <div className="glass-panel-sm px-3 py-3">
              <span className="text-[10px] font-mono text-[var(--alert-red)]">
                ENTITÉ {selectedId || ''} INTROUVABLE OU MASQUÉE PAR LE CONTRÔLE D’ACCÈS.
              </span>
            </div>
          )}
          {entity && entity.found && (
            <>
              <div className="glass-panel-sm px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`gotham-tag ${typeTag(entity.entity.type)}`}>{entity.entity.type}</span>
                  <span className={`gotham-tag ${riskTag(entity.entity.risk)}`}>RISQUE {entity.entity.risk}</span>
                  {entity.entity.classification && (
                    <span className="gotham-tag gotham-tag--low">{entity.entity.classification}</span>
                  )}
                </div>
                <div className="mt-2 text-[12px] font-bold text-[var(--text-heading)]">{entity.entity.label}</div>
                <div className="text-[9px] font-mono text-[var(--text-muted)]">{entity.entity.id}</div>
                {(entity.entity.tags || []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(entity.entity.tags || []).map(tag => (
                      <span key={tag} className="gotham-tag gotham-tag--low">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="foundry-metric"><span>DEGRÉ</span><strong>{count(entity.degree)}</strong></div>
                <div className="foundry-metric"><span>VOISINS</span><strong>{count(entity.neighbours.length)}</strong></div>
                <div className="foundry-metric"><span>RELATIONS</span><strong>{count(entity.relations.length)}</strong></div>
                <div className="foundry-metric"><span>SOURCES</span><strong>{count(entity.contributingSources.length)}</strong></div>
              </div>

              {relatedEdges.length > 0 && (
                <div>
                  <div className="hud-label mb-1"><Link2 className="mr-1 inline h-3 w-3" />ARÊTES DU GRAPHE</div>
                  <div className="space-y-1">
                    {relatedEdges.slice(0, 12).map(edge => (
                      <div key={edge.id} className="aip-list-row">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: `var(${relationVar(edge.relation)})` }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[9px] text-[var(--text-primary)]">
                          {edge.relation}
                        </span>
                        <span className="truncate text-[9px] font-mono text-[var(--text-muted)]">
                          {clip(edge.source === selectedId ? edge.target : edge.source, 20)}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-secondary)]">{edge.weight.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {entity.neighbours.length > 0 && (
                <div>
                  <div className="hud-label mb-1"><GitBranch className="mr-1 inline h-3 w-3" />VOISINAGE</div>
                  <div className="space-y-1">
                    {entity.neighbours.slice(0, 20).map(link => (
                      <button
                        key={`${link.id}-${link.neighbour.id}-${link.relation}`}
                        type="button"
                        className="aip-entity-row w-full text-left"
                        onClick={() => selectEntity(link.neighbour.id)}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: `var(${relationVar(link.relation)})` }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">
                          {link.neighbour.label}
                        </span>
                        <span className="gotham-tag gotham-tag--low">{link.relation}</span>
                        <span className={`gotham-tag ${riskTag(link.neighbour.risk)}`}>{link.neighbour.risk}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {entity.contributingSources.length > 0 && (
                <div>
                  <div className="hud-label mb-1"><Database className="mr-1 inline h-3 w-3" />SOURCES CONTRIBUTRICES</div>
                  <div className="flex flex-wrap gap-1">
                    {entity.contributingSources.map(source => (
                      <span key={source} className="gotham-tag gotham-tag--info">{source}</span>
                    ))}
                  </div>
                </div>
              )}

              {entity.riskRank.length > 0 && (
                <div>
                  <div className="hud-label mb-1"><Hash className="mr-1 inline h-3 w-3" />RISK RANK</div>
                  <div className="space-y-1">
                    {entity.riskRank.slice(0, 6).map((node, index) => (
                      <button
                        key={node.id}
                        type="button"
                        className="aip-list-row w-full text-left"
                        onClick={() => selectEntity(node.id)}
                      >
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{node.label}</span>
                        <span className={`gotham-tag ${typeTag(node.type)}`}>{node.type}</span>
                        <span className={`gotham-tag ${riskTag(node.risk)}`}>{node.risk}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-panel-sm px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="hud-label"><FolderPlus className="mr-1 inline h-3 w-3" />DOSSIER ANALYSTE</span>
                  <button
                    type="button"
                    className="aip-action-button"
                    onClick={() => {
                      setDossierOpen(true);
                      if (!cases && !casesLoading) void loadCases();
                    }}
                  >
                    AJOUTER AU DOSSIER
                  </button>
                </div>
                {dossierOpen && (
                  <div className="mt-2 space-y-1">
                    {casesLoading && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--gold-primary)]" />
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">CHARGEMENT DES DOSSIERS…</span>
                      </div>
                    )}
                    {casesError && (
                      <span className="text-[9px] font-mono text-[var(--alert-red)]">DOSSIERS — {casesError}</span>
                    )}
                    {cases && cases.length === 0 && (
                      <span className="text-[9px] font-mono text-[var(--text-muted)]">AUCUN DOSSIER DISPONIBLE.</span>
                    )}
                    {(cases || []).map(record => (
                      <button
                        key={record.id}
                        type="button"
                        className="aip-case-row w-full text-left"
                        disabled={dossierBusy !== null}
                        onClick={() => void attachToCase(record.id)}
                      >
                        <span className={`gotham-tag ${priorityTag(record.priority)}`}>{record.priority}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{record.title}</span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">
                          {count(record.evidenceCount || 0)} PREUVES
                        </span>
                        {dossierBusy === record.id
                          ? <Loader2 className="h-3 w-3 animate-spin text-[var(--gold-primary)]" />
                          : <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />}
                      </button>
                    ))}
                    {dossierResult && (
                      <div className="flex items-center gap-2">
                        {dossierResult.tone === 'ok'
                          ? <CircleCheck className="h-3 w-3 text-[var(--alert-green)]" />
                          : <ShieldAlert className="h-3 w-3 text-[var(--alert-red)]" />}
                        <span
                          className={`text-[9px] font-mono ${dossierResult.tone === 'ok' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}`}
                        >
                          {dossierResult.text}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-3">
          <div className="ops-watch-builder space-y-2">
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void runSearch(event.currentTarget.value);
              }}
              placeholder="Rechercher une entité (label ou identifiant)…"
              aria-label="Recherche d'entité"
            />
            <button type="button" onClick={() => void runSearch(query)} disabled={searchLoading}>
              {searchLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Search className="h-3 w-3" />}
              RECHERCHER
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hud-label">
              FILTRE TYPE {typeFilter || 'TOUS'} · RÉSULTATS {count(results?.count || 0)}
            </span>
            {results?.acl?.droppedNodes !== undefined && (
              <span className="gotham-tag gotham-tag--low">
                {count(results.acl.droppedNodes)} MASQUÉS PAR L’ACL
              </span>
            )}
          </div>
          {searchError && (
            <div className="glass-panel-sm flex items-center gap-2 px-3 py-2">
              <ShieldAlert className="h-3 w-3 text-[var(--alert-red)]" />
              <span className="text-[10px] font-mono text-[var(--alert-red)]">RECHERCHE — {searchError}</span>
            </div>
          )}
          {results && results.entities.length === 0 && (
            <div className="glass-panel-sm px-3 py-3 text-center">
              <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                AUCUN RÉSULTAT POUR « {query || '—'} »
              </span>
            </div>
          )}
          {(results?.entities || []).map(hit => (
            <button
              key={hit.id}
              type="button"
              className="aip-entity-row w-full text-left"
              onClick={() => selectEntity(hit.id)}
            >
              <span className={`gotham-tag ${typeTag(hit.type)}`}>{hit.type}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{hit.label}</span>
              {hit.classification && <span className="gotham-tag gotham-tag--low">{hit.classification}</span>}
              <span className={`gotham-tag ${riskTag(hit.risk)}`}>{hit.risk}</span>
              <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      )}

      {tab === 'posture' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="foundry-metric"><span>NŒUDS</span><strong>{count(payload?.stats?.nodes || nodes.length)}</strong></div>
            <div className="foundry-metric"><span>ARÊTES</span><strong>{count(payload?.stats?.edges || 0)}</strong></div>
            <div className="foundry-metric"><span>TYPES</span><strong>{count(typeEntries.length)}</strong></div>
            <div className="foundry-metric"><span>DOMAINES</span><strong>{count(domainEntries.length)}</strong></div>
          </div>

          <div className="glass-panel-sm px-3 py-2">
            <div className="hud-label mb-1"><ShieldCheck className="mr-1 inline h-3 w-3" />POSTURE D’ACCÈS</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">CLEARANCE COURANTE</span>
                <span className="text-[9px] font-mono text-[var(--text-primary)]">{acl.clearance || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">NŒUDS MASQUÉS (ACL)</span>
                <span className={`gotham-tag ${droppedNodes > 0 ? 'gotham-tag--high' : 'gotham-tag--low'}`}>
                  {count(droppedNodes)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">GÉNÉRÉ LE</span>
                <span className="text-[9px] font-mono text-[var(--text-secondary)]">{payload?.generatedAt || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="hud-label mb-1"><AlertTriangle className="mr-1 inline h-3 w-3" />SOURCES DÉGRADÉES</div>
            {degraded.length === 0
              ? (
                <div className="flex items-center gap-2">
                  <CircleCheck className="h-3 w-3 text-[var(--alert-green)]" />
                  <span className="text-[9px] font-mono text-[var(--text-secondary)]">
                    AUCUNE SOURCE DÉGRADÉE SIGNALÉE PAR L’API.
                  </span>
                </div>
              )
              : (
                <div className="flex flex-wrap gap-1">
                  {degraded.map(source => (
                    <span key={source} className="gotham-tag gotham-tag--critical">{source}</span>
                  ))}
                </div>
              )}
          </div>

          {payload?.sources && (
            <div>
              <div className="hud-label mb-1"><Activity className="mr-1 inline h-3 w-3" />ÉTAT DES SOURCES</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(payload.sources).map(([name, live]) => (
                  <span key={name} className={`gotham-tag ${live ? 'gotham-tag--low' : 'gotham-tag--high'}`}>
                    {name} {live ? 'OK' : 'KO'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="hud-label mb-1"><Target className="mr-1 inline h-3 w-3" />TOP 20 PAR RISQUE</div>
            <div className="space-y-1">
              {topRisk.map((node, index) => (
                <button
                  key={node.id}
                  type="button"
                  className="aip-list-row w-full text-left"
                  onClick={() => selectEntity(node.id)}
                >
                  <span className="text-[9px] font-mono text-[var(--text-muted)]">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{node.label}</span>
                  <span className={`gotham-tag ${typeTag(node.type)}`}>{node.type}</span>
                  <div className="mission-readiness-track w-16">
                    <div style={{ width: `${Math.max(2, Math.min(100, node.risk))}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)]">{node.risk}</span>
                </button>
              ))}
              {topRisk.length === 0 && (
                <span className="text-[9px] font-mono text-[var(--text-muted)]">AUCUN NŒUD RENVOYÉ PAR L’API.</span>
              )}
            </div>
          </div>

          <div>
            <div className="hud-label mb-1"><Database className="mr-1 inline h-3 w-3" />RÉPARTITION PAR TYPE</div>
            <div className="space-y-1">
              {typeEntries.map(([name, total]) => (
                <div key={name} className="aip-list-row">
                  <span className="min-w-0 flex-1 truncate text-[9px] text-[var(--text-primary)]">{name}</span>
                  <div className="mission-readiness-track w-24">
                    <div style={{ width: `${nodes.length ? Math.max(2, Math.round((total / nodes.length) * 100)) : 0}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)]">{count(total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="hud-label mb-1"><Database className="mr-1 inline h-3 w-3" />RÉPARTITION PAR DOMAINE</div>
            <div className="space-y-1">
              {domainEntries.map(([name, total]) => (
                <div key={name} className="aip-list-row">
                  <span className="min-w-0 flex-1 truncate text-[9px] text-[var(--text-primary)]">{name}</span>
                  <div className="mission-readiness-track w-24">
                    <div style={{ width: `${nodes.length ? Math.max(2, Math.round((total / nodes.length) * 100)) : 0}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)]">{count(total)}</span>
                </div>
              ))}
              {domainEntries.length === 0 && (
                <span className="text-[9px] font-mono text-[var(--text-muted)]">AUCUN DOMAINE RENVOYÉ PAR L’API.</span>
              )}
            </div>
          </div>

          {payload?.returned && (
            <div className="text-[9px] font-mono text-[var(--text-muted)]">
              FENÊTRE RENVOYÉE {count(payload.returned.nodes || 0)} NŒUDS / {count(payload.returned.edges || 0)} ARÊTES
              {payload.stats?.sampled ? ` · ÉCHANTILLONNAGE ${Object.entries(payload.stats.sampled).map(([k, v]) => `${k}:${v}`).join(', ')}` : ''}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default memo(KnowledgeGraphPanel);
