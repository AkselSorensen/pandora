'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Crosshair, Folder, GitBranch, Link, Loader2, MapPin, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import type { FusionEntity, FusionModel, FusionRiskLevel } from '@/lib/palantir-fusion';
import { compactFusionSnapshot } from '@/lib/palantir-fusion';

interface AipFusionPanelProps {
  model: FusionModel;
  onLocate?: (lat: number, lng: number) => void;
  isMobile?: boolean;
}

interface InvestigationCase {
  id: string;
  title: string;
  createdAt: string;
  notes: string;
  entityIds: string[];
}

const CASES_KEY = 'pandora:aip-investigations:v1';

function tagClass(level: FusionRiskLevel) {
  if (level === 'CRITICAL') return 'gotham-tag--critical';
  if (level === 'ELEVATED') return 'gotham-tag--high';
  if (level === 'WATCH') return 'gotham-tag--info';
  return 'gotham-tag--low';
}

function loadCases(): InvestigationCase[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CASES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function AipFusionPanel({ model, onLocate, isMobile = false }: AipFusionPanelProps) {
  const [tab, setTab] = useState<'fusion' | 'graph' | 'cases' | 'aip'>('fusion');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [cases, setCases] = useState<InvestigationCase[]>(() => loadCases());
  const [activeCaseId, setActiveCaseId] = useState<string | null>(() => loadCases()[0]?.id || null);
  const [prompt, setPrompt] = useState('Résume la situation et les anomalies prioritaires.');
  const [briefing, setBriefing] = useState(model.briefingBullets.join('\n\n'));
  const [aipMode, setAipMode] = useState<'local' | 'ollama' | 'local-fallback'>('local');
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  }, [cases]);

  const entityMap = useMemo(() => new Map(model.entities.map(entity => [entity.id, entity])), [model.entities]);
  const selectedEntity = selectedEntityId ? entityMap.get(selectedEntityId) : model.entities[0];
  const activeCase = cases.find(item => item.id === activeCaseId) || null;
  const graphEntities = model.entities.slice(0, isMobile ? 14 : 22);
  const graphRelations = model.relations.filter(relation => graphEntities.some(e => e.id === relation.from) && graphEntities.some(e => e.id === relation.to)).slice(0, 28);

  const createCase = () => {
    const anomaly = model.anomalies[0];
    const next: InvestigationCase = {
      id: `case-${Date.now()}`,
      title: anomaly ? anomaly.title.replace('Hotspot fusion détecté · ', 'Investigation · ') : `Investigation ${cases.length + 1}`,
      createdAt: new Date().toISOString(),
      notes: anomaly?.explanation || 'Nouvelle enquête analyste.',
      entityIds: anomaly?.entityIds?.slice(0, 8) || [],
    };
    setCases(prev => [next, ...prev].slice(0, 8));
    setActiveCaseId(next.id);
    setTab('cases');
  };

  const addSelectedToCase = () => {
    if (!selectedEntity || !activeCaseId) return;
    setCases(prev => prev.map(item => item.id === activeCaseId ? { ...item, entityIds: [...new Set([selectedEntity.id, ...item.entityIds])].slice(0, 20) } : item));
  };

  const generateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await fetch('/api/aip/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: compactFusionSnapshot(model), note: prompt }),
      });
      const json = await res.json();
      setBriefing(json.briefing || model.briefingBullets.join('\n\n'));
      setAipMode(json.mode || 'local-fallback');
    } catch {
      setBriefing(model.briefingBullets.join('\n\n'));
      setAipMode('local-fallback');
    } finally {
      setLoadingBriefing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.75, duration: 0.6 }}
      className="glass-panel aip-panel p-3 pointer-events-auto"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="aip-orb"><Brain className="w-4 h-4" /></div>
          <div className="min-w-0">
            <div className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">ANALYST COPILOT</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em] truncate">FUSION · ONTOLOGY · LOCAL MODEL</div>
          </div>
        </div>
        <span className={`gotham-tag ${tagClass(model.posture)}`}>{model.posture}</span>
      </div>

      <div className="aip-tabs mb-3">
        {[
          ['fusion', 'Fusion'],
          ['graph', 'Graph'],
          ['cases', 'Cases'],
          ['aip', 'AIP'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)} className={tab === id ? 'active' : ''}>{label}</button>
        ))}
      </div>

      {tab === 'fusion' && (
        <div className="space-y-3">
          <div className="aip-score-card">
            <div className="flex items-center justify-between mb-1">
              <span>FUSION SCORE</span>
              <strong>{Math.round(model.score)}%</strong>
            </div>
            <div className="mission-readiness-track"><div style={{ width: `${Math.round(model.score)}%` }} /></div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="foundry-metric"><span>ENTITIES</span><strong>{model.entities.length}</strong></div>
            <div className="foundry-metric"><span>LINKS</span><strong>{model.relations.length}</strong></div>
            <div className="foundry-metric"><span>ANOM</span><strong>{model.anomalies.length}</strong></div>
          </div>

          <div className="space-y-1.5">
            {model.anomalies.slice(0, 4).map(anomaly => (
              <div key={anomaly.id} className="aip-list-row">
                <div className="min-w-0">
                  <div className="truncate text-[9px] text-[var(--text-primary)]">{anomaly.title}</div>
                  <div className="truncate text-[7px] text-[var(--text-muted)]">{anomaly.explanation}</div>
                </div>
                <span className={`gotham-tag ${tagClass(anomaly.level)}`}>{Math.round(anomaly.score)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {model.hotspots.slice(0, 3).map(hotspot => (
              <button key={hotspot.id} onClick={() => onLocate?.(hotspot.lat, hotspot.lng)} className="aip-hotspot-row w-full">
                <MapPin className="w-3 h-3 text-[var(--gold-primary)]" />
                <span className="truncate">{hotspot.label}</span>
                <strong>{Math.round(hotspot.score)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'graph' && (
        <div className="space-y-3">
          <div className="aip-graph-stage">
            <svg viewBox="0 0 280 150" className="w-full h-[150px]" role="img" aria-label="Ontology graph">
              {graphRelations.map((relation, idx) => {
                const fromIndex = graphEntities.findIndex(e => e.id === relation.from);
                const toIndex = graphEntities.findIndex(e => e.id === relation.to);
                if (fromIndex < 0 || toIndex < 0) return null;
                const ax = 25 + (fromIndex % 7) * 38;
                const ay = 24 + Math.floor(fromIndex / 7) * 42;
                const bx = 25 + (toIndex % 7) * 38;
                const by = 24 + Math.floor(toIndex / 7) * 42;
                return <line key={`${relation.id}-${idx}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(0,229,255,0.18)" strokeWidth="1" />;
              })}
              {graphEntities.map((entity, idx) => {
                const x = 25 + (idx % 7) * 38;
                const y = 24 + Math.floor(idx / 7) * 42;
                const selected = selectedEntity?.id === entity.id;
                const color = entity.type === 'incident' ? '#FF3D3D' : entity.type === 'hazard' ? '#FF9500' : entity.type === 'infrastructure' ? '#76FF03' : entity.type === 'ship' ? '#00BCD4' : '#D4AF37';
                return <circle key={entity.id} cx={x} cy={y} r={selected ? 6 : 4} fill={color} stroke={selected ? '#fff' : 'rgba(255,255,255,0.25)'} strokeWidth="1" />;
              })}
            </svg>
          </div>

          <div className="aip-entity-list styled-scrollbar">
            {graphEntities.map(entity => (
              <button key={entity.id} onClick={() => setSelectedEntityId(entity.id)} className={`aip-entity-row ${selectedEntity?.id === entity.id ? 'active' : ''}`}>
                <GitBranch className="w-3 h-3" />
                <span className="truncate">{entity.label}</span>
                <em>{entity.type}</em>
              </button>
            ))}
          </div>

          {selectedEntity && (
            <div className="aip-dossier">
              <div className="flex items-center justify-between gap-2 mb-1">
                <strong className="truncate">{selectedEntity.label}</strong>
                <span className="gotham-tag gotham-tag--info">{selectedEntity.confidence}%</span>
              </div>
              <p>{selectedEntity.summary}</p>
              <div className="flex items-center justify-between mt-2">
                <span><Link className="w-3 h-3" /> {model.relations.filter(r => r.from === selectedEntity.id || r.to === selectedEntity.id).length} links</span>
                <button onClick={addSelectedToCase} className="aip-mini-button"><Plus className="w-3 h-3" /> CASE</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'cases' && (
        <div className="space-y-3">
          <button onClick={createCase} className="aip-action-button w-full"><Folder className="w-3.5 h-3.5" /> OPEN INVESTIGATION FROM TOP SIGNAL</button>
          <div className="space-y-1.5">
            {cases.length === 0 && <div className="aip-empty">Aucune enquête locale. Crée un case depuis une anomalie.</div>}
            {cases.map(item => (
              <button key={item.id} onClick={() => setActiveCaseId(item.id)} className={`aip-case-row ${activeCaseId === item.id ? 'active' : ''}`}>
                <Folder className="w-3 h-3" />
                <span className="truncate">{item.title}</span>
                <em>{item.entityIds.length}</em>
              </button>
            ))}
          </div>
          {activeCase && (
            <div className="aip-dossier">
              <div className="flex items-center justify-between gap-2 mb-2">
                <strong className="truncate">{activeCase.title}</strong>
                <button onClick={() => setCases(prev => prev.filter(item => item.id !== activeCase.id))} className="text-[var(--text-muted)] hover:text-[var(--alert-red)]"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <textarea value={activeCase.notes} onChange={e => setCases(prev => prev.map(item => item.id === activeCase.id ? { ...item, notes: e.target.value } : item))} className="aip-notes" />
              <div className="mt-2 space-y-1">
                {activeCase.entityIds.slice(0, 6).map(id => entityMap.get(id)).filter(Boolean).map(entity => (
                  <div key={(entity as FusionEntity).id} className="aip-linked-entity"><Crosshair className="w-3 h-3" /> <span className="truncate">{(entity as FusionEntity).label}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'aip' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="gotham-tag gotham-tag--info"><Sparkles className="w-3 h-3" /> {aipMode}</span>
            <span className="text-[7px] font-mono text-[var(--text-muted)]">OLLAMA READY IF CONFIGURED</span>
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="aip-prompt" />
          <button onClick={generateBriefing} disabled={loadingBriefing} className="aip-action-button w-full disabled:opacity-60">
            {loadingBriefing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            GENERATE AIP BRIEFING
          </button>
          <pre className="aip-briefing styled-scrollbar">{briefing}</pre>
        </div>
      )}
    </motion.div>
  );
}

export default memo(AipFusionPanel);