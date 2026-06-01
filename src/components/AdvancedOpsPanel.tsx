'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Clipboard, Download, Eye, MapPin, Plus, Radar, Route, Trash2 } from 'lucide-react';
import type { FusionEntity, FusionModel } from '@/lib/palantir-fusion';

interface AdvancedOpsPanelProps {
  model: FusionModel;
  mouseCoords?: { lat: number; lng: number } | null;
  onLocate?: (lat: number, lng: number) => void;
  isMobile?: boolean;
}

interface WatchRule {
  id: string;
  label: string;
  query: string;
  type: 'keyword' | 'region' | 'type';
}

const WATCH_KEY = 'pandora:watch-rules:v1';

function loadWatchRules(): WatchRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function distanceKm(a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }) {
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lat !== 'number' || typeof b.lng !== 'number') return Infinity;
  const r = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function AdvancedOpsPanel({ model, mouseCoords, onLocate, isMobile = false }: AdvancedOpsPanelProps) {
  const [tab, setTab] = useState<'timeline' | 'watch' | 'briefing' | 'simulate'>('timeline');
  const [watchRules, setWatchRules] = useState<WatchRule[]>(() => loadWatchRules());
  const [watchInput, setWatchInput] = useState('ukraine');
  const [watchType, setWatchType] = useState<WatchRule['type']>('keyword');
  const [simCenter, setSimCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [simRadius, setSimRadius] = useState(250);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(WATCH_KEY, JSON.stringify(watchRules));
  }, [watchRules]);

  const timeline = useMemo(() => {
    const anomalyEvents = model.anomalies.map(anomaly => ({
      id: anomaly.id,
      label: anomaly.title,
      source: 'FUSION',
      type: 'anomaly',
      risk: anomaly.score,
      lat: anomaly.lat,
      lng: anomaly.lng,
      timestamp: model.generatedAt,
      summary: anomaly.explanation,
    }));
    return [...anomalyEvents, ...model.timeline].slice(0, isMobile ? 10 : 16);
  }, [model, isMobile]);

  const watchHits = useMemo(() => {
    if (!watchRules.length) return [];
    return model.entities.filter(entity => watchRules.some(rule => {
      const q = rule.query.toLowerCase();
      if (rule.type === 'type') return entity.type.toLowerCase().includes(q);
      if (rule.type === 'region') return (entity.region || '').toLowerCase().includes(q);
      return `${entity.label} ${entity.summary} ${entity.source} ${entity.tags.join(' ')}`.toLowerCase().includes(q);
    })).slice(0, 16);
  }, [model.entities, watchRules]);

  const simulation = useMemo(() => {
    const center = simCenter || mouseCoords || model.hotspots[0];
    if (!center) return [] as FusionEntity[];
    return model.entities
      .filter(entity => distanceKm(center, entity) <= simRadius)
      .sort((a, b) => distanceKm(center, a) - distanceKm(center, b))
      .slice(0, 18);
  }, [model.entities, model.hotspots, mouseCoords, simCenter, simRadius]);

  const briefingMarkdown = useMemo(() => {
    return `# Pandora Command Briefing\n\nGenerated: ${new Date(model.generatedAt).toLocaleString()}\n\n## Posture\n- Global posture: **${model.posture}**\n- Fusion score: **${Math.round(model.score)}/100**\n- Entities: ${model.entities.length}\n- Relations: ${model.relations.length}\n\n## Executive Summary\n${model.briefingBullets.map(b => `- ${b}`).join('\n')}\n\n## Top Anomalies\n${model.anomalies.slice(0, 8).map(a => `- **${a.level} ${Math.round(a.score)}** — ${a.title}: ${a.explanation}`).join('\n')}\n\n## Hotspots\n${model.hotspots.slice(0, 8).map(h => `- ${h.label}: ${h.level} ${Math.round(h.score)}/100 (${h.drivers.join(', ')})`).join('\n')}\n`;
  }, [model]);

  const addWatch = () => {
    const query = watchInput.trim();
    if (!query) return;
    setWatchRules(prev => [{ id: `watch-${Date.now()}`, label: query.toUpperCase(), query, type: watchType }, ...prev].slice(0, 12));
    setWatchInput('');
  };

  const downloadBriefing = () => {
    const blob = new Blob([briefingMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pandora-briefing-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} className="glass-panel ops-panel p-3 pointer-events-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="ops-orb"><Radar className="w-4 h-4" /></div>
          <div>
            <div className="hud-text text-[12px] text-[var(--text-primary)]">COMMAND DECK</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em]">TIMELINE · WATCH · BRIEF · SIM</div>
          </div>
        </div>
        <span className="gotham-tag gotham-tag--info">OPS</span>
      </div>

      <div className="ops-tabs mb-3">
        {[
          ['timeline', 'Time'], ['watch', 'Watch'], ['briefing', 'Brief'], ['simulate', 'Sim'],
        ].map(([id, label]) => <button key={id} onClick={() => setTab(id as typeof tab)} className={tab === id ? 'active' : ''}>{label}</button>)}
      </div>

      {tab === 'timeline' && (
        <div className="ops-timeline styled-scrollbar">
          {timeline.map((event) => (
            <button key={event.id} onClick={() => typeof event.lat === 'number' && typeof event.lng === 'number' && onLocate?.(event.lat, event.lng)} className="ops-time-row">
              <span className="ops-time-dot" style={{ background: event.risk > 70 ? '#FF3D3D' : event.risk > 45 ? '#FF9500' : '#00E5FF' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{event.label}</div>
                <p className="truncate">{event.source} · {event.type} · {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'live'}</p>
              </div>
              <strong>{Math.round(event.risk || 0)}</strong>
            </button>
          ))}
        </div>
      )}

      {tab === 'watch' && (
        <div className="space-y-3">
          <div className="ops-watch-builder">
            <select value={watchType} onChange={e => setWatchType(e.target.value as WatchRule['type'])}>
              <option value="keyword">KEYWORD</option>
              <option value="region">REGION</option>
              <option value="type">TYPE</option>
            </select>
            <input value={watchInput} onChange={e => setWatchInput(e.target.value)} placeholder="ukraine / ship / cyber" />
            <button onClick={addWatch}><Plus className="w-3 h-3" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {watchRules.map(rule => <button key={rule.id} onClick={() => setWatchRules(prev => prev.filter(r => r.id !== rule.id))} className="ops-chip"><Bell className="w-3 h-3" /> {rule.label} <Trash2 className="w-3 h-3" /></button>)}
          </div>
          <div className="ops-hit-list styled-scrollbar">
            {watchHits.map(entity => (
              <button key={entity.id} className="ops-hit-row" onClick={() => typeof entity.lat === 'number' && typeof entity.lng === 'number' && onLocate?.(entity.lat, entity.lng)}>
                <Eye className="w-3 h-3" /> <span className="truncate">{entity.label}</span><em>{entity.type}</em>
              </button>
            ))}
            {!watchHits.length && <div className="ops-empty">Aucun hit watchlist pour le moment.</div>}
          </div>
        </div>
      )}

      {tab === 'briefing' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => navigator.clipboard?.writeText(briefingMarkdown)} className="ops-action flex-1"><Clipboard className="w-3 h-3" /> COPY MD</button>
            <button onClick={downloadBriefing} className="ops-action flex-1"><Download className="w-3 h-3" /> EXPORT</button>
          </div>
          <pre className="ops-briefing styled-scrollbar">{briefingMarkdown}</pre>
        </div>
      )}

      {tab === 'simulate' && (
        <div className="space-y-3">
          <div className="ops-sim-card">
            <div className="flex items-center justify-between mb-2"><span>WHAT-IF IMPACT RADIUS</span><strong>{simRadius} KM</strong></div>
            <input type="range" min="50" max="1000" step="50" value={simRadius} onChange={e => setSimRadius(Number(e.target.value))} />
            <button onClick={() => mouseCoords && setSimCenter(mouseCoords)} className="ops-action w-full mt-2"><MapPin className="w-3 h-3" /> USE CURRENT MAP COORDS</button>
          </div>
          <div className="ops-hit-list styled-scrollbar">
            {simulation.map(entity => (
              <button key={entity.id} className="ops-hit-row" onClick={() => typeof entity.lat === 'number' && typeof entity.lng === 'number' && onLocate?.(entity.lat, entity.lng)}>
                <Route className="w-3 h-3" /> <span className="truncate">{entity.label}</span><em>{Math.round(entity.risk)}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default memo(AdvancedOpsPanel);