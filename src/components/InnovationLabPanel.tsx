'use client';

import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Atom, BrainCircuit, ChevronRight, Cpu, Gauge, Network, Orbit, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { FusionModel, FusionRiskLevel } from '@/lib/palantir-fusion';

interface InnovationLabPanelProps {
  model: FusionModel;
  onOpenAip?: () => void;
  onLocate?: (lat: number, lng: number) => void;
  isMobile?: boolean;
}

type LabTab = 'radar' | 'forecast' | 'missions' | 'dna';

function levelClass(level: FusionRiskLevel) {
  if (level === 'CRITICAL') return 'gotham-tag--critical';
  if (level === 'ELEVATED') return 'gotham-tag--high';
  if (level === 'WATCH') return 'gotham-tag--info';
  return 'gotham-tag--low';
}

function InnovationLabPanel({ model, onOpenAip, onLocate, isMobile = false }: InnovationLabPanelProps) {
  const [tab, setTab] = useState<LabTab>('radar');

  const lab = useMemo(() => {
    const sourceOnline = model.sourceHealth.filter(s => s.rows > 0).length;
    const sourceScore = Math.round((sourceOnline / Math.max(1, model.sourceHealth.length)) * 100);
    const relationDensity = Math.round(Math.min(100, (model.relations.length / Math.max(1, model.entities.length)) * 65));
    const anomalyLoad = Math.round(Math.min(100, model.anomalies.reduce((sum, a) => sum + a.score, 0) / Math.max(1, model.anomalies.length)));
    const confidence = Math.round(model.sourceHealth.reduce((sum, s) => sum + (s.rows > 0 ? s.confidence : 0), 0) / Math.max(1, sourceOnline));
    const forecastScore = Math.round(Math.min(100, model.score * 0.72 + anomalyLoad * 0.18 + relationDensity * 0.1));
    const forecast = forecastScore > 78 ? 'CRITICAL DRIFT' : forecastScore > 58 ? 'ELEVATION LIKELY' : forecastScore > 35 ? 'WATCH WINDOW' : 'STABLE WINDOW';
    const narrative = [
      `Le graphe contient ${model.entities.length} objets et ${model.relations.length} liens exploitables.`,
      `La densité relationnelle est à ${relationDensity}%, avec une charge anomalie ${anomalyLoad}%.`,
      model.hotspots[0] ? `Le signal dominant converge vers ${model.hotspots[0].label}.` : 'Aucun point de convergence géospatial fort.',
      `Confiance moyenne des sources actives : ${Number.isFinite(confidence) ? confidence : 0}%.`,
    ];
    return { sourceScore, relationDensity, anomalyLoad, confidence: Number.isFinite(confidence) ? confidence : 0, forecastScore, forecast, narrative };
  }, [model]);

  const missions = useMemo(() => {
    const top = model.anomalies.slice(0, 4);
    return top.map((anomaly, idx) => ({
      id: anomaly.id,
      title: idx === 0 ? 'Priority Investigation Cell' : idx === 1 ? 'Source Verification Sprint' : idx === 2 ? 'Regional Watch Window' : 'Entity Graph Expansion',
      focus: anomaly.title,
      level: anomaly.level,
      steps: [
        'Vérifier sources primaires',
        'Comparer avec timeline 24h',
        'Ajouter entités liées au case',
      ],
      lat: anomaly.lat,
      lng: anomaly.lng,
    }));
  }, [model.anomalies]);

  const dna = model.anomalies[0];
  const dnaSegments = useMemo(() => {
    if (!dna) return [];
    return [
      { label: 'severity', value: Math.round(dna.score), color: '#FF3D3D' },
      { label: 'source mix', value: Math.min(100, dna.sources.length * 24), color: '#00E5FF' },
      { label: 'entity links', value: Math.min(100, dna.entityIds.length * 12), color: '#D4AF37' },
      { label: 'geo signal', value: typeof dna.lat === 'number' ? 82 : 22, color: '#00E676' },
    ];
  }, [dna]);

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-panel innovation-panel p-3 pointer-events-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="innovation-orb"><Atom className="w-4 h-4" /></div>
          <div className="min-w-0">
            <div className="hud-text text-[12px] text-[var(--text-primary)] truncate">ANALYTIC WORKBENCH</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em] truncate">FORECAST · SIGNAL TRACE · MISSION QUEUE</div>
          </div>
        </div>
        <span className={`gotham-tag ${levelClass(model.posture)}`}>VNEXT</span>
      </div>

      <div className="innovation-tabs mb-3">
        {[
          ['radar', 'Radar'], ['forecast', 'Future'], ['missions', 'Missions'], ['dna', 'DNA'],
        ].map(([id, label]) => <button key={id} onClick={() => setTab(id as LabTab)} className={tab === id ? 'active' : ''}>{label}</button>)}
      </div>

      {tab === 'radar' && (
        <div className="space-y-3">
          <div className="innovation-radar">
            <div className="innovation-radar-sweep" />
            {[
              { label: 'SRC', value: lab.sourceScore, icon: ShieldCheck },
              { label: 'LINK', value: lab.relationDensity, icon: Network },
              { label: 'ANOM', value: lab.anomalyLoad, icon: Zap },
              { label: 'CONF', value: lab.confidence, icon: Gauge },
            ].map((metric, idx) => {
              const Icon = metric.icon;
              return <div key={metric.label} className={`innovation-radar-node innovation-radar-node-${idx + 1}`}>
                <Icon className="w-3 h-3" />
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>;
            })}
          </div>
          <div className="innovation-narrative">
            {lab.narrative.map(line => <p key={line}><ChevronRight className="w-3 h-3" />{line}</p>)}
          </div>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="space-y-3">
          <div className="innovation-forecast-card">
            <div className="flex items-center justify-between mb-2"><span>POSTURE FORECAST</span><strong>{lab.forecastScore}%</strong></div>
            <div className="innovation-forecast-track"><div style={{ width: `${lab.forecastScore}%` }} /></div>
            <h3>{lab.forecast}</h3>
            <p>Projection heuristique basée sur la posture actuelle, la charge anomalie, la densité du graph et la santé des sources. Ce n’est pas une prédiction factuelle : c’est une aide à la priorisation.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="innovation-mini-metric"><span>1H</span><strong>{Math.max(0, lab.forecastScore - 8)}</strong></div>
            <div className="innovation-mini-metric"><span>6H</span><strong>{lab.forecastScore}</strong></div>
            <div className="innovation-mini-metric"><span>24H</span><strong>{Math.min(100, lab.forecastScore + 7)}</strong></div>
          </div>
        </div>
      )}

      {tab === 'missions' && (
        <div className="innovation-missions styled-scrollbar">
          {missions.map(mission => (
            <button key={mission.id} className="innovation-mission-card" onClick={() => typeof mission.lat === 'number' && typeof mission.lng === 'number' && onLocate?.(mission.lat, mission.lng)}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <strong>{mission.title}</strong>
                <span className={`gotham-tag ${levelClass(mission.level)}`}>{mission.level}</span>
              </div>
              <p>{mission.focus}</p>
              <ul>{mission.steps.map(step => <li key={step}>{step}</li>)}</ul>
            </button>
          ))}
          {!missions.length && <div className="innovation-empty">Aucune mission auto : les flux sont trop calmes pour générer une cellule.</div>}
          <button className="innovation-action" onClick={onOpenAip}><BrainCircuit className="w-3.5 h-3.5" /> SEND CONTEXT TO AIP</button>
        </div>
      )}

      {tab === 'dna' && (
        <div className="space-y-3">
          {dna ? (
            <>
              <div className="innovation-dna-title">
                <Orbit className="w-4 h-4" />
                <div><strong>{dna.title}</strong><p>{dna.explanation}</p></div>
              </div>
              <div className="innovation-dna-bars">
                {dnaSegments.map(segment => <div key={segment.label}>
                  <div className="flex items-center justify-between"><span>{segment.label}</span><strong>{segment.value}</strong></div>
                  <div className="innovation-dna-track"><div style={{ width: `${segment.value}%`, background: segment.color }} /></div>
                </div>)}
              </div>
              <div className="innovation-source-pills">
                {dna.sources.map(source => <span key={source}><Cpu className="w-3 h-3" />{source}</span>)}
              </div>
            </>
          ) : <div className="innovation-empty">Aucun signal DNA disponible.</div>}
          <button className="innovation-action" onClick={onOpenAip}><Sparkles className="w-3.5 h-3.5" /> EXPLAIN WITH OLLAMA</button>
        </div>
      )}
    </motion.div>
  );
}

export default memo(InnovationLabPanel);