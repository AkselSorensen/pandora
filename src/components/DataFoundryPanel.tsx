'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, Database, GitBranch, RadioTower, ShieldCheck } from 'lucide-react';

interface DataFoundryPanelProps {
  data: any;
  activeLayers: Record<string, boolean>;
}

const SOURCES = [
  { key: 'commercial_flights', label: 'ADS-B AIR', layer: 'flights', accent: '#00E5FF' },
  { key: 'maritime_ships', label: 'AIS MARITIME', layer: 'maritime', accent: '#00BCD4' },
  { key: 'cameras', label: 'CCTV GRID', layer: 'cctv', accent: '#39FF14' },
  { key: 'news', label: 'OSINT RSS', layer: 'news_intel', accent: '#D4AF37' },
  { key: 'gdelt', label: 'INCIDENTS', layer: 'global_incidents', accent: '#FF3D3D' },
  { key: 'earthquakes', label: 'SEISMIC', layer: 'earthquakes', accent: '#FF9500' },
  { key: 'weather_events', label: 'WEATHER', layer: 'weather', accent: '#E040FB' },
  { key: 'infrastructure', label: 'CRITICAL INFRA', layer: 'infrastructure', accent: '#76FF03' },
];

function DataFoundryPanel({ data, activeLayers }: DataFoundryPanelProps) {
  const sources = useMemo(() => SOURCES.map(source => {
    const rows = Array.isArray(data?.[source.key]) ? data[source.key].length : 0;
    const enabled = Boolean(activeLayers?.[source.layer]);
    return {
      ...source,
      rows,
      enabled,
      status: rows > 0 ? 'INDEXED' : enabled ? 'INGESTING' : 'STANDBY',
    };
  }), [data, activeLayers]);

  const indexed = sources.filter(source => source.rows > 0).length;
  const enabled = sources.filter(source => source.enabled).length;
  const totalRows = sources.reduce((sum, source) => sum + source.rows, 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.65, duration: 0.6 }}
      className="glass-panel foundry-panel p-3 pointer-events-auto"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="foundry-orb">
            <Database className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
          </div>
          <div>
            <div className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">DATA FOUNDRY</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.18em]">PIPELINE · NORMALIZE · INDEX</div>
          </div>
        </div>
        <span className="gotham-tag gotham-tag--info">LIVE OPS</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="foundry-metric">
          <span>ACTIVE</span>
          <strong>{enabled}/{sources.length}</strong>
        </div>
        <div className="foundry-metric">
          <span>INDEXED</span>
          <strong>{indexed}</strong>
        </div>
        <div className="foundry-metric">
          <span>ROWS</span>
          <strong>{totalRows.toLocaleString()}</strong>
        </div>
      </div>

      <div className="space-y-1.5">
        {sources.map(source => (
          <div key={source.key} className="foundry-source-row">
            <div className="flex items-center gap-2 min-w-0">
              <span className="foundry-source-dot" style={{ backgroundColor: source.accent, boxShadow: source.enabled ? `0 0 10px ${source.accent}70` : 'none' }} />
              <span className="truncate">{source.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="tabular-nums text-[8px] text-[var(--text-secondary)]">{source.rows.toLocaleString()}</span>
              <span className={`foundry-status ${source.status === 'INDEXED' ? 'foundry-status--ok' : source.status === 'INGESTING' ? 'foundry-status--sync' : ''}`}>
                {source.status === 'INDEXED' ? <CheckCircle2 className="w-2.5 h-2.5" /> : source.status === 'INGESTING' ? <Activity className="w-2.5 h-2.5" /> : <RadioTower className="w-2.5 h-2.5" />}
                {source.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-[var(--border-secondary)]/60 flex items-center justify-between text-[8px] font-mono tracking-[0.16em] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5"><GitBranch className="w-3 h-3 text-[var(--cyan-primary)]" /> SOURCE GRAPH</span>
        <span className="flex items-center gap-1.5 text-[var(--alert-green)]"><ShieldCheck className="w-3 h-3" /> GOVERNED</span>
      </div>
    </motion.div>
  );
}

export default memo(DataFoundryPanel);