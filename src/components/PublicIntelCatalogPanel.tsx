'use client';

import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, ExternalLink, Globe2, Radio, Satellite, Search, ShieldAlert, Ship, Plane, CloudSun, Flame, DatabaseZap } from 'lucide-react';
import { CAMERA_COUNTRY_PORTALS, PUBLIC_INTEL_SOURCES, type PublicIntelCategory } from '@/lib/public-intel-catalog';

interface PublicIntelCatalogPanelProps {
  isMobile?: boolean;
}

const CATEGORY_META: Record<PublicIntelCategory | 'all', { label: string; icon: typeof Globe2; color: string }> = {
  all: { label: 'ALL', icon: Globe2, color: '#D4AF37' },
  satellite: { label: 'SAT', icon: Satellite, color: '#00E5FF' },
  camera: { label: 'CAM', icon: Camera, color: '#39FF14' },
  weather: { label: 'WX', icon: CloudSun, color: '#E040FB' },
  disaster: { label: 'DIS', icon: Flame, color: '#FF9500' },
  maritime: { label: 'SEA', icon: Ship, color: '#00BCD4' },
  aviation: { label: 'AIR', icon: Plane, color: '#D4AF37' },
  cyber: { label: 'CYB', icon: ShieldAlert, color: '#FF3D3D' },
  geospatial: { label: 'GEO', icon: DatabaseZap, color: '#76FF03' },
};

function PublicIntelCatalogPanel({ isMobile = false }: PublicIntelCatalogPanelProps) {
  const [category, setCategory] = useState<PublicIntelCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showCameras, setShowCameras] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return PUBLIC_INTEL_SOURCES.filter(source => {
      if (category !== 'all' && source.category !== category) return false;
      if (!q) return true;
      return `${source.name} ${source.category} ${source.region} ${source.country || ''} ${source.description} ${source.tags.join(' ')}`.toLowerCase().includes(q);
    }).slice(0, isMobile ? 14 : 24);
  }, [category, query, isMobile]);

  const stats = useMemo(() => {
    const open = PUBLIC_INTEL_SOURCES.filter(source => source.access === 'open').length;
    const cams = PUBLIC_INTEL_SOURCES.filter(source => source.category === 'camera').length;
    const sats = PUBLIC_INTEL_SOURCES.filter(source => source.category === 'satellite').length;
    const avg = Math.round(PUBLIC_INTEL_SOURCES.reduce((sum, source) => sum + source.confidence, 0) / PUBLIC_INTEL_SOURCES.length);
    return { open, cams, sats, avg };
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-panel public-intel-panel p-3 pointer-events-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="public-intel-orb"><Radio className="w-4 h-4" /></div>
          <div className="min-w-0">
            <div className="hud-text text-[12px] text-[var(--text-primary)] truncate">PUBLIC INTEL CATALOG</div>
            <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.16em] truncate">SATELLITES · CAMERAS · OPEN SOURCES</div>
          </div>
        </div>
        <span className="gotham-tag gotham-tag--info">OPEN</span>
      </div>

      <div className="public-intel-stats mb-3">
        <div><span>SOURCES</span><strong>{PUBLIC_INTEL_SOURCES.length}</strong></div>
        <div><span>OPEN</span><strong>{stats.open}</strong></div>
        <div><span>SAT</span><strong>{stats.sats}</strong></div>
        <div><span>CAM</span><strong>{stats.cams}</strong></div>
      </div>

      <div className="public-intel-search mb-2">
        <Search className="w-3.5 h-3.5" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search source, country, tag..." />
      </div>

      <div className="public-intel-cats mb-3">
        {(Object.keys(CATEGORY_META) as Array<PublicIntelCategory | 'all'>).map(key => {
          const meta = CATEGORY_META[key];
          const Icon = meta.icon;
          return <button key={key} onClick={() => setCategory(key)} className={category === key ? 'active' : ''} style={{ ['--cat-color' as string]: meta.color }}><Icon className="w-3 h-3" />{meta.label}</button>;
        })}
      </div>

      <div className="public-intel-list styled-scrollbar">
        {filtered.map(source => {
          const meta = CATEGORY_META[source.category];
          const Icon = meta.icon;
          return (
            <div key={source.id} className="public-intel-row">
              <div className="public-intel-row-head">
                <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                <strong className="truncate">{source.name}</strong>
                <span>{source.confidence}</span>
              </div>
              <p>{source.description}</p>
              <div className="public-intel-row-meta">
                <em>{source.category}</em><em>{source.region}</em><em>{source.access}</em><em>{source.freshness}</em>
              </div>
              <div className="public-intel-actions">
                <a href={source.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /> PORTAL</a>
                {source.apiUrl && <a href={source.apiUrl} target="_blank" rel="noopener noreferrer"><DatabaseZap className="w-3 h-3" /> API</a>}
              </div>
            </div>
          );
        })}
      </div>

      <button className="public-intel-camera-toggle mt-3" onClick={() => setShowCameras(prev => !prev)}>
        <Camera className="w-3.5 h-3.5" /> WORLD CAMERA PORTALS {showCameras ? '−' : '+'}
      </button>

      {showCameras && (
        <div className="public-camera-portals mt-2 styled-scrollbar">
          {CAMERA_COUNTRY_PORTALS.map(portal => (
            <a key={portal.region} href={portal.url} target="_blank" rel="noopener noreferrer">
              <Globe2 className="w-3.5 h-3.5" />
              <div><strong>{portal.region}</strong><p>{portal.label}</p><span>{portal.countries.join(' · ')}</span></div>
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}

      <div className="public-intel-disclaimer mt-3">
        Public/legal sources only. Camera portals are directories or official APIs; Pandora does not bypass authentication or access private cameras.
      </div>
    </motion.div>
  );
}

export default memo(PublicIntelCatalogPanel);