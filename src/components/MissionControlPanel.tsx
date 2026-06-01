'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Crosshair, Eye, Layers, Radar, Shield, Siren } from 'lucide-react';

interface MissionControlPanelProps {
  data: any;
  activeLayers: Record<string, boolean>;
  backendStatus: 'connecting' | 'connected' | 'error';
  mapView: { zoom: number; latitude?: number };
}

function MissionControlPanel({ data, activeLayers, backendStatus, mapView }: MissionControlPanelProps) {
  const summary = useMemo(() => {
    const flights = (data?.commercial_flights?.length || 0) + (data?.private_flights?.length || 0) + (data?.private_jets?.length || 0) + (data?.military_flights?.length || 0);
    const incidents = data?.gdelt?.length || 0;
    const liveFeeds = data?.live_feeds?.length || 0;
    const hazards = (data?.earthquakes?.length || 0) + (data?.fires?.length || 0) + (data?.weather_events?.length || 0);
    const maritime = (data?.maritime_ships?.length || 0) + (data?.maritime_ports?.length || 0) + (data?.maritime_chokepoints?.length || 0);
    const activeLayerCount = Object.values(activeLayers || {}).filter(Boolean).length;
    const operationalScore = Math.min(99, 42 + activeLayerCount * 3 + Math.min(25, Math.floor((incidents + hazards + liveFeeds) / 6)));
    return { flights, incidents, liveFeeds, hazards, maritime, activeLayerCount, operationalScore };
  }, [data, activeLayers]);

  const posture = backendStatus === 'error' ? 'DEGRADED' : summary.incidents > 40 || summary.hazards > 25 ? 'ELEVATED' : 'STABLE';
  const postureClass = posture === 'DEGRADED' ? 'gotham-tag--critical' : posture === 'ELEVATED' ? 'gotham-tag--high' : 'gotham-tag--low';

  const cards = [
    { label: 'AIR PICTURE', value: summary.flights, icon: Radar, color: '#00E5FF' },
    { label: 'MARITIME', value: summary.maritime, icon: Shield, color: '#00BCD4' },
    { label: 'INCIDENTS', value: summary.incidents, icon: Siren, color: '#FF3D3D' },
    { label: 'HAZARDS', value: summary.hazards, icon: AlertTriangle, color: '#FF9500' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.7, duration: 0.6 }}
      className="glass-panel mission-panel p-3 pointer-events-auto"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="mission-reticle"><Crosshair className="w-4 h-4" /></div>
          <div>
            <div className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">MISSION CONTROL</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.18em]">GOTHAM-STYLE OPS PICTURE</div>
          </div>
        </div>
        <span className={`gotham-tag ${postureClass}`}>{posture}</span>
      </div>

      <div className="mission-readiness mb-3">
        <div className="flex items-center justify-between mb-1">
          <span>OPERATIONAL PICTURE</span>
          <strong>{summary.operationalScore}%</strong>
        </div>
        <div className="mission-readiness-track">
          <div style={{ width: `${summary.operationalScore}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="mission-card">
              <div className="flex items-center justify-between mb-1">
                <span>{card.label}</span>
                <Icon className="w-3 h-3" style={{ color: card.color }} />
              </div>
              <strong style={{ color: card.color }}>{card.value.toLocaleString()}</strong>
            </div>
          );
        })}
      </div>

      <div className="mission-actions">
        <div><Layers className="w-3 h-3" /> {summary.activeLayerCount} ACTIVE LAYERS</div>
        <div><Eye className="w-3 h-3" /> ZOOM {mapView.zoom.toFixed(1)}</div>
      </div>
    </motion.div>
  );
}

export default memo(MissionControlPanel);