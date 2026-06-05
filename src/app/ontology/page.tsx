'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, Database, GitBranch, Network, RefreshCw, Search, ShieldAlert } from 'lucide-react';

type OntologyNode = {
  id: string;
  type: string;
  label: string;
  risk: number;
  weight: number;
  tags?: string[];
  sources?: string[];
  properties?: Record<string, unknown>;
};

type OntologyEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight?: number;
  evidence?: string;
};

type OntologyPayload = {
  mode: string;
  generatedAt: string;
  summary: {
    nodes: number;
    edges: number;
    types: Record<string, number>;
    posture?: string;
    riskScore?: number;
  };
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  error?: string;
};

const typeColor: Record<string, string> = {
  Alert: 'gotham-tag--critical',
  Signal: 'gotham-tag--high',
  Digest: 'gotham-tag--info',
  OperationalPicture: 'gotham-tag--info',
  Category: 'gotham-tag--low',
  Source: 'gotham-tag--low',
  Location: 'gotham-tag--info',
  GeoPoint: 'gotham-tag--info',
};

function formatTime(value?: string) {
  if (!value) return 'N/A';
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

function riskClass(risk: number) {
  if (risk >= 85) return 'text-[var(--alert-red)]';
  if (risk >= 65) return 'text-[var(--alert-orange)]';
  if (risk >= 40) return 'text-[var(--gold-primary)]';
  return 'text-[var(--alert-green)]';
}

export default function OntologyPage() {
  const [payload, setPayload] = useState<OntologyPayload | null>(null);
  const [selected, setSelected] = useState<OntologyNode | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOntology = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/ontology', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Ontology API HTTP ${response.status}`);
      const data = await response.json();
      setPayload(data);
      setSelected(data.nodes?.[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ontology unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOntology();
  }, [loadOntology]);

  const filteredNodes = useMemo(() => {
    const nodes = payload?.nodes || [];
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((node) => `${node.label} ${node.type} ${(node.tags || []).join(' ')}`.toLowerCase().includes(q));
  }, [payload, query]);

  const relations = useMemo(() => {
    if (!payload || !selected) return [];
    return payload.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).slice(0, 30);
  }, [payload, selected]);

  const nodeById = useMemo(() => {
    const map = new Map<string, OntologyNode>();
    (payload?.nodes || []).forEach((node) => map.set(node.id, node));
    return map;
  }, [payload]);

  return (
    <main className="h-screen overflow-y-auto styled-scrollbar bg-[var(--bg-void)] text-[var(--text-primary)]">
      <div className="fixed inset-0 pointer-events-none opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(143,167,160,0.13),transparent_28%),radial-gradient(circle_at_85%_5%,rgba(191,164,106,0.10),transparent_30%)]" />
        <div className="absolute inset-0 crt-scanlines opacity-[0.03]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-8 md:py-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="glass-panel p-2.5 transition hover:border-[var(--gold-primary)]/50" title="Back to Atlas">
              <ArrowLeft className="h-4 w-4 text-[var(--gold-primary)]" />
            </Link>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="gotham-tag gotham-tag--info"><Network className="h-3 w-3" /> ONTOLOGY</span>
                <span className="gotham-tag gotham-tag--low">PALANTIR-LIKE GRAPH</span>
              </div>
              <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.28em] text-[var(--text-heading)] md:text-4xl">Pandora Ontology</h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)] md:text-sm">
                Graphe d’entités construit depuis `pandora-digest` et `pandora-alerts` : signaux, alertes, catégories, sources, lieux et relations.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/alerts" className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--alert-red)] transition hover:border-[var(--alert-red)]/50"><ShieldAlert className="h-3.5 w-3.5" /> Alerts</Link>
            <button onClick={loadOntology} disabled={loading} className="glass-panel inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold-primary)] transition hover:border-[var(--gold-primary)]/50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {(error || payload?.error) && <div className="glass-panel mb-4 border-[var(--alert-red)]/40 p-4 text-sm text-[var(--alert-red)]">{error || payload?.error}</div>}

        {loading && !payload ? (
          <div className="glass-panel flex min-h-[55vh] flex-col items-center justify-center gap-4 p-10 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-[var(--gold-primary)]" />
            <div className="hud-text text-xs text-[var(--text-secondary)]">Building entity graph...</div>
          </div>
        ) : payload ? (
          <div className="grid gap-4 pb-10 lg:grid-cols-[0.85fr_1.15fr_0.85fr]">
            <aside className="space-y-4">
              <div className="glass-panel p-5">
                <div className="mb-4 flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-[var(--gold-primary)]" /><h2 className="hud-text text-xs text-[var(--text-heading)]">Graph Summary</h2></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="glass-panel-sm p-3 text-center"><div className="hud-label">Nodes</div><div className="hud-value text-xl">{payload.summary.nodes}</div></div>
                  <div className="glass-panel-sm p-3 text-center"><div className="hud-label">Edges</div><div className="hud-value text-xl">{payload.summary.edges}</div></div>
                  <div className="glass-panel-sm p-3 text-center"><div className="hud-label">Posture</div><div className="hud-value text-sm">{payload.summary.posture || 'N/A'}</div></div>
                  <div className="glass-panel-sm p-3 text-center"><div className="hud-label">Risk</div><div className="hud-value text-xl">{payload.summary.riskScore ?? 0}</div></div>
                </div>
                <div className="mt-3 text-[10px] text-[var(--text-muted)]">Generated {formatTime(payload.generatedAt)}</div>
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2"><Database className="h-4 w-4 text-[var(--cyan-primary)]" /><h2 className="hud-text text-xs text-[var(--text-heading)]">Entity Types</h2></div>
                <div className="space-y-2">
                  {Object.entries(payload.summary.types || {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <div key={type} className="flex justify-between rounded border border-[var(--border-secondary)] bg-black/20 px-3 py-2 text-xs"><span>{type}</span><span className="hud-value">{count}</span></div>
                  ))}
                </div>
              </div>
            </aside>

            <section className="glass-panel p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><div className="hud-label">ENTITY INDEX</div><h2 className="font-mono text-lg font-bold uppercase tracking-[0.18em] text-[var(--text-heading)]">Nodes</h2></div>
                <div className="relative w-48"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="w-full rounded border border-[var(--border-secondary)] bg-black/30 py-2 pl-8 pr-3 text-xs outline-none focus:border-[var(--gold-primary)]/40" /></div>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto styled-scrollbar pr-1">
                {filteredNodes.map((node) => (
                  <button key={node.id} onClick={() => setSelected(node)} className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === node.id ? 'border-[var(--gold-primary)]/50 bg-[var(--gold-primary)]/10' : 'border-[var(--border-secondary)] bg-black/20 hover:border-[var(--border-primary)]'}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`gotham-tag ${typeColor[node.type] || 'gotham-tag--info'}`}>{node.type}</span><span className={`font-mono text-[10px] ${riskClass(node.risk)}`}>RISK {Math.round(node.risk)}</span></div>
                    <div className="line-clamp-2 text-sm font-semibold text-[var(--text-heading)]">{node.label}</div>
                    <div className="mt-2 flex flex-wrap gap-1">{(node.tags || []).slice(0, 4).map((tag) => <span key={tag} className="rounded border border-[var(--border-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">#{tag}</span>)}</div>
                  </button>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2"><GitBranch className="h-4 w-4 text-[var(--gold-primary)]" /><h2 className="hud-text text-xs text-[var(--text-heading)]">Selected Entity</h2></div>
                {selected ? <div className="space-y-3">
                  <div><span className={`gotham-tag ${typeColor[selected.type] || 'gotham-tag--info'}`}>{selected.type}</span></div>
                  <h3 className="text-base font-semibold text-[var(--text-heading)]">{selected.label}</h3>
                  <div className="grid grid-cols-2 gap-2"><div className="glass-panel-sm p-2 text-center"><div className="hud-label">Risk</div><div className={`font-mono text-lg font-bold ${riskClass(selected.risk)}`}>{Math.round(selected.risk)}</div></div><div className="glass-panel-sm p-2 text-center"><div className="hud-label">Weight</div><div className="hud-value text-lg">{Number(selected.weight || 0).toFixed(1)}</div></div></div>
                  <div><div className="hud-label mb-1">Sources</div><div className="text-xs text-[var(--text-secondary)]">{(selected.sources || []).join(' · ') || 'N/A'}</div></div>
                  <div><div className="hud-label mb-1">ID</div><div className="break-all font-mono text-[10px] text-[var(--text-muted)]">{selected.id}</div></div>
                </div> : <div className="text-sm text-[var(--text-secondary)]">Select an entity.</div>}
              </div>

              <div className="glass-panel p-5">
                <div className="mb-3 flex items-center gap-2"><Network className="h-4 w-4 text-[var(--cyan-primary)]" /><h2 className="hud-text text-xs text-[var(--text-heading)]">Relations</h2></div>
                <div className="space-y-2">
                  {relations.map((edge) => {
                    const otherId = edge.source === selected?.id ? edge.target : edge.source;
                    const other = nodeById.get(otherId);
                    return <div key={edge.id} className="rounded border border-[var(--border-secondary)] bg-black/20 p-3"><div className="gotham-tag gotham-tag--info mb-2">{edge.relation}</div><div className="text-xs text-[var(--text-secondary)]">{other?.label || otherId}</div>{edge.evidence && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{edge.evidence}</div>}</div>;
                  })}
                  {!relations.length && <div className="text-xs text-[var(--text-muted)]">No relation selected.</div>}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}