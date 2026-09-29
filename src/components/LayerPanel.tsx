'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, Satellite, Activity, Globe, Radio, Eye,
  Shield, Sun, AlertTriangle, Camera, Flame, Target,
  CloudLightning, Radiation, Tv, Anchor, Ship, Newspaper,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Search as SearchIcon, X, Zap, Radar,
  Wind, Server, Building2, Waves, CloudSun, LoaderCircle, CircleCheck, CircleAlert,
} from 'lucide-react';

interface LayerPanelProps {
  data: any;
  activeLayers: any;
  setActiveLayers: React.Dispatch<React.SetStateAction<any>>;
  layerStatuses?: Record<string, 'loading' | 'ready' | 'error'>;
}

const LAYER_GROUPS = [
  {
    label: 'AVIATION',
    icon: Plane,
    color: '#00E5FF',
    layers: [
      { key: 'flights', label: 'Commercial', icon: Plane, color: '#00E5FF', dataKey: 'commercial_flights' },
      { key: 'private', label: 'Private', icon: Plane, color: '#00E676', dataKey: 'private_flights' },
      { key: 'jets', label: 'Private Jets', icon: Plane, color: '#FF69B4', dataKey: 'private_jets' },
    ],
  },
  {
    label: 'MILITARY / DEFENSE',
    icon: Shield,
    color: '#FF3D3D',
    layers: [
      { key: 'military', label: 'Military Aircraft', icon: Shield, color: '#FF3D3D', dataKey: 'military_flights' },
      { key: 'tankers_isr', label: 'Tankers / ISR Watch', icon: Radio, color: '#FF9500', dataKey: 'tankers_isr' },
      { key: 'frontlines', label: 'Frontlines', icon: Target, color: '#FF1744', dataKey: 'frontlines' },
      { key: 'mil_conflict_events', label: 'Military Events', icon: AlertTriangle, color: '#FF6B00', dataKey: 'military_events' },
      { key: 'naval_bases', label: 'Naval Bases', icon: Anchor, color: '#00BCD4', dataKey: 'naval_bases' },
      { key: 'airbases', label: 'Global Air Bases', icon: Shield, color: '#60A5FA', dataKey: 'airbases' },
      { key: 'french_airbases', label: 'French Air Bases', icon: Shield, color: '#3B82F6', dataKey: 'french_airbases' },
    ],
  },
  {
    label: 'SATELLITE INTEL',
    icon: Satellite,
    color: '#D4AF37',
    layers: [
      { key: 'satellite_scenes', label: 'Sentinel Scenes', icon: Satellite, color: '#D4AF37', dataKey: 'sentinel_scenes' },
      { key: 'sar_watch', label: 'SAR Watch', icon: Radar, color: '#00E5FF', dataKey: 'sentinel_sar' },
      { key: 'optical_watch', label: 'Optical Watch', icon: Eye, color: '#76FF03', dataKey: 'sentinel_optical' },
    ],
  },
  {
    label: 'MARITIME & SPACE',
    icon: Ship,
    color: '#00BCD4',
    layers: [
      { key: 'maritime', label: 'Maritime / Naval', icon: Ship, color: '#00BCD4', dataKey: 'maritime_ships,maritime_ports,maritime_chokepoints' },
      { key: 'maritime_dark_activity', label: 'Dark Activity Heuristics', icon: Radar, color: '#FF1744', dataKey: 'maritime_dark_activity' },
      { key: 'satellites', label: 'Satellites', icon: Satellite, color: '#D4AF37', dataKey: 'satellites' },
      { key: 'balloons', label: 'High-Altitude Balloons', icon: Radio, color: '#FFB300', dataKey: 'balloons' },
    ],
  },
  {
    label: 'SURVEILLANCE',
    icon: Camera,
    color: '#39FF14',
    layers: [
      { key: 'cctv', label: 'CCTV Cameras', icon: Camera, color: '#39FF14', dataKey: 'cameras' },
      { key: 'live_news', label: 'Live News Feeds', icon: Tv, color: '#FF4081', dataKey: 'live_feeds' },
      { key: 'news_intel', label: 'SIGINT News (RSS)', icon: Newspaper, color: '#D4AF37', dataKey: 'news' },
    ],
  },
  {
    label: 'NATURAL HAZARDS',
    icon: Activity,
    color: '#FF9500',
    layers: [
      { key: 'earthquakes', label: 'Earthquakes (24h)', icon: Activity, color: '#FF9500', dataKey: 'earthquakes' },
      { key: 'fires', label: 'Active Fires', icon: Flame, color: '#FF6B00', dataKey: 'fires' },
      { key: 'weather', label: 'Severe Weather', icon: CloudLightning, color: '#E040FB', dataKey: 'weather_events' },
      { key: 'air_quality', label: 'Air Quality', icon: Wind, color: '#00E676', dataKey: 'air_quality' },
      { key: 'disaster_ops', label: 'Disaster Ops', icon: CloudSun, color: '#FFD700', dataKey: 'disaster_ops' },
    ],
  },
  {
    label: 'THREATS & INFRA',
    icon: AlertTriangle,
    color: '#FF3D3D',
    layers: [
      { key: 'conflict_zones', label: 'Conflict Zones', icon: Target, color: '#FF1744', dataKey: '' },
      { key: 'infrastructure', label: 'Nuclear Facilities', icon: Radiation, color: '#76FF03', dataKey: 'infrastructure' },
      { key: 'radiation', label: 'Radiation Sensors', icon: Radiation, color: '#B6FF00', dataKey: 'radiation' },
      { key: 'global_incidents', label: 'Global Incidents', icon: AlertTriangle, color: '#FF3D3D', dataKey: 'gdelt' },
      { key: 'gps_jamming', label: 'GPS Jamming', icon: Radio, color: '#FF4444', dataKey: 'gps_jamming' },
      { key: 'country_risk', label: 'Country Risk Index', icon: Globe, color: '#FF9500', dataKey: 'country_risk' },
      { key: 'cyber_geo', label: 'Cyber Geo Threats', icon: Server, color: '#00E5FF', dataKey: 'cyber_geo_threats' },
      { key: 'port_congestion', label: 'Port Congestion', icon: Waves, color: '#00BCD4', dataKey: 'port_congestion' },
      { key: 'risk_heatmap', label: 'Global Risk Heatmap', icon: Radar, color: '#FF1744', dataKey: 'risk_heatmap' },
      { key: 'space_weather_layer', label: 'Space Weather Ops', icon: CloudSun, color: '#D4AF37', dataKey: 'space_weather_points' },
    ],
  },
  {
    label: 'OSM INFRASTRUCTURE',
    icon: Building2,
    color: '#76FF03',
    layers: [
      { key: 'osm_critical', label: 'Critical Facilities', icon: Building2, color: '#76FF03', dataKey: 'osm_critical' },
    ],
  },
  {
    label: 'DISPLAY',
    icon: Sun,
    color: '#448AFF',
    layers: [
      { key: 'day_night', label: 'Day / Night Cycle', icon: Sun, color: '#448AFF', dataKey: '' },
    ],
  },
];

// Flat list for backward compat
const ALL_LAYERS = LAYER_GROUPS.flatMap(g => g.layers);

function LayerPanel({ data, activeLayers, setActiveLayers, layerStatuses = {} }: LayerPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    LAYER_GROUPS.forEach(g => { initial[g.label] = true; });
    return initial;
  });
  const [layerSearch, setLayerSearch] = useState('');

  const toggle = (key: string) => setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  const getCount = (dk: string): number | null => {
    if (!dk) return null;
    let total = 0;
    let found = false;
    for (const k of dk.split(',')) {
      if (data[k] && Array.isArray(data[k])) {
        total += data[k].length;
        found = true;
      }
    }
    return found ? total : null;
  };
  const totalEntities = ALL_LAYERS.reduce((s: number, l: any) => s + (getCount(l.dataKey) || 0), 0);
  const activeCount = Object.values(activeLayers).filter(Boolean).length;
  const visibleGroups = LAYER_GROUPS
    .map(group => ({
      ...group,
      layers: group.layers.filter(layer => {
        const q = layerSearch.trim().toLowerCase();
        if (!q) return true;
        return `${group.label} ${layer.label} ${layer.key}`.toLowerCase().includes(q);
      }),
    }))
    .filter(group => group.layers.length > 0);
  const activeLayerItems = ALL_LAYERS.filter(layer => activeLayers[layer.key]);

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupLabel]: !prev[groupLabel] }));
  };

  const applyPreset = (preset: 'clear' | 'all' | 'surveillance' | 'hazards' | 'ops') => {
    setActiveLayers((prev: any) => {
      const next = { ...prev };
      ALL_LAYERS.forEach(layer => { next[layer.key] = false; });

      if (preset === 'all') ALL_LAYERS.forEach(layer => { next[layer.key] = true; });
      if (preset === 'surveillance') ['cctv', 'live_news', 'news_intel', 'global_incidents', 'satellite_scenes', 'cyber_geo'].forEach(key => { next[key] = true; });
      if (preset === 'hazards') ['earthquakes', 'fires', 'weather', 'air_quality', 'disaster_ops', 'radiation', 'space_weather_layer'].forEach(key => { next[key] = true; });
      if (preset === 'ops') ['military', 'tankers_isr', 'frontlines', 'mil_conflict_events', 'maritime', 'maritime_dark_activity', 'naval_bases', 'airbases', 'french_airbases', 'port_congestion', 'risk_heatmap', 'satellite_scenes', 'sar_watch', 'satellites', 'balloons', 'conflict_zones', 'global_incidents', 'country_risk', 'cyber_geo', 'gps_jamming', 'infrastructure', 'osm_critical', 'space_weather_layer', 'day_night'].forEach(key => { next[key] = true; });

      return next;
    });
  };

  const toggleAllInGroup = (group: typeof LAYER_GROUPS[0]) => {
    const allActive = group.layers.every(l => activeLayers[l.key]);
    setActiveLayers((prev: any) => {
      const next = { ...prev };
      group.layers.forEach(l => { next[l.key] = !allActive; });
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="glass-panel p-3 pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Eye className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--alert-green)] animate-pandora-pulse" />
          </div>
          <span className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest">DATA LAYERS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`gotham-tag ${activeCount > 10 ? 'gotham-tag--critical' : activeCount > 5 ? 'gotham-tag--high' : 'gotham-tag--low'}`} style={{ fontSize: '8px', padding: '1px 6px' }}>
            {activeCount}/{ALL_LAYERS.length}
          </span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '7px', padding: '1px 5px' }}>{totalEntities.toLocaleString()} ENT</span>
        </div>
      </div>

      {/* Command strip */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[
          { id: 'ops' as const, label: 'OPS', tone: 'text-[var(--cyan-primary)]' },
          { id: 'surveillance' as const, label: 'WATCH', tone: 'text-[var(--alert-green)]' },
          { id: 'hazards' as const, label: 'HAZ', tone: 'text-[var(--alert-orange)]' },
          { id: 'clear' as const, label: 'CLEAR', tone: 'text-[var(--alert-red)]' },
        ].map(action => (
          <button
            key={action.id}
            onClick={() => applyPreset(action.id)}
            className={`glass-panel-sm px-2 py-1.5 text-[8px] font-mono font-bold tracking-[0.12em] hover:border-[var(--border-active)] transition-colors ${action.tone}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          value={layerSearch}
          onChange={(event) => setLayerSearch(event.target.value)}
          placeholder="FILTER LAYERS..."
          className="w-full h-8 pl-7 pr-8 rounded-lg border border-[var(--border-secondary)] bg-black/20 text-[9px] font-mono tracking-[0.14em] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-active)]"
        />
        {layerSearch && (
          <button onClick={() => setLayerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Live stack summary */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="glass-panel-sm px-2 py-2 text-center">
          <div className="hud-label">ACTIVE</div>
          <div className="hud-value text-[12px]">{activeCount}</div>
        </div>
        <div className="glass-panel-sm px-2 py-2 text-center">
          <div className="hud-label">ENTITIES</div>
          <div className="hud-value text-[12px]">{totalEntities.toLocaleString()}</div>
        </div>
        <div className="glass-panel-sm px-2 py-2 text-center">
          <div className="hud-label">GROUPS</div>
          <div className="hud-value text-[12px]">{LAYER_GROUPS.filter(group => group.layers.some(layer => activeLayers[layer.key])).length}</div>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-1">
        {visibleGroups.map((group) => {
          const isExpanded = expandedGroups[group.label];
          const groupActiveCount = group.layers.filter(l => activeLayers[l.key]).length;
          const allActive = groupActiveCount === group.layers.length;
          const GroupIcon = group.icon;

          return (
            <div key={group.label}>
              {/* Group Header */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  <GroupIcon className="w-3 h-3 flex-shrink-0" style={{ color: group.color }} />
                  <span className="text-[9px] font-mono tracking-[0.15em] text-[var(--text-secondary)] font-bold flex-1 text-left">{group.label}</span>
                  <span className="text-[8px] font-mono tabular-nums" style={{ color: groupActiveCount > 0 ? group.color : 'var(--text-muted)' }}>
                    {groupActiveCount}/{group.layers.length}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                </button>
                {/* Toggle all in group */}
                <button
                  onClick={() => toggleAllInGroup(group)}
                  className="p-1 rounded hover:bg-white/[0.05] transition-colors"
                  title={allActive ? 'Disable all' : 'Enable all'}
                >
                  {allActive ? (
                    <ToggleRight className="w-3.5 h-3.5" style={{ color: group.color }} />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                </button>
              </div>

              {/* Layer items */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-2 pl-2 border-l border-[var(--border-secondary)]/40 space-y-px">
                      {group.layers.map((layer) => {
                        const Icon = layer.icon;
                        const isActive = activeLayers[layer.key];
                        const count = getCount(layer.dataKey);
                        const layerStatus = layerStatuses[layer.key];
                        const StatusIcon = layerStatus === 'loading' ? LoaderCircle : layerStatus === 'ready' ? CircleCheck : layerStatus === 'error' ? CircleAlert : null;
                        const countLabel = layerStatus === 'loading'
                          ? '…'
                          : layerStatus === 'error'
                            ? 'OFFLINE'
                            : count === null
                              ? null
                              : count === 0
                                ? layerStatus === 'ready' ? 'NO SIGNAL' : '—'
                                : count.toLocaleString();
                        return (
                          <button
                            key={layer.key}
                            onClick={() => toggle(layer.key)}
                            className={`w-full flex items-center gap-2.5 px-2 py-[5px] rounded-md transition-all duration-200 group ${
                              isActive
                                ? 'bg-white/[0.04] border border-white/[0.06]'
                                : 'border border-transparent hover:bg-white/[0.02]'
                            }`}
                          >
                            {/* Color dot indicator */}
                            <div
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300 ${isActive ? 'scale-100' : 'scale-50 opacity-30'}`}
                              style={{
                                backgroundColor: layer.color,
                                boxShadow: isActive ? `0 0 6px ${layer.color}60` : 'none',
                              }}
                            />
                            <Icon
                              className="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200"
                              style={{ color: isActive ? layer.color : 'var(--text-muted)' }}
                            />
                            <span className={`text-[11px] font-mono tracking-wide flex-1 text-left transition-colors duration-200 ${
                              isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                            }`}>
                              {layer.label}
                            </span>
                            {StatusIcon && (
                              <span className="flex-shrink-0" title={layerStatus === 'error' ? 'Feed unavailable — automatic retry in 30 seconds. Toggle this layer off and on to retry immediately.' : `Feed ${layerStatus}`}>
                                <StatusIcon
                                  className={`h-3 w-3 ${layerStatus === 'loading' ? 'animate-spin text-[var(--gold-primary)]' : layerStatus === 'ready' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}`}
                                  aria-label={layerStatus === 'error' ? 'Feed unavailable; automatic retry scheduled' : `Feed ${layerStatus}`}
                                />
                              </span>
                            )}
                            {countLabel !== null && (
                              <span
                                className={`text-[8px] font-mono tabular-nums font-bold transition-colors duration-200 ${countLabel === 'OFFLINE' ? 'text-[var(--alert-red)]' : countLabel === 'NO SIGNAL' ? 'text-[var(--text-muted)]' : ''}`}
                                style={countLabel === 'OFFLINE' || countLabel === 'NO SIGNAL' ? undefined : { color: isActive ? layer.color : 'var(--text-muted)' }}
                              >
                                {countLabel}
                              </span>
                            )}
                            {/* Toggle switch */}
                            <div className={`layer-toggle ${isActive ? 'active' : ''}`} />
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Active layer chips */}
      <div className="mt-3 pt-3 border-t border-[var(--border-secondary)]/60">
        <div className="flex items-center justify-between mb-2">
          <span className="hud-label">ACTIVE STACK</span>
          <button onClick={() => applyPreset('all')} className="text-[8px] font-mono text-[var(--cyan-primary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
            <Zap className="w-3 h-3" /> ALL
          </button>
        </div>
        {activeLayerItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeLayerItems.slice(0, 10).map(layer => (
              <button
                key={layer.key}
                onClick={() => toggle(layer.key)}
                className="px-2 py-1 rounded-full border border-[var(--border-secondary)] bg-white/[0.03] text-[8px] font-mono tracking-[0.08em] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
              >
                {layer.label}
              </button>
            ))}
            {activeLayerItems.length > 10 && <span className="px-2 py-1 text-[8px] font-mono text-[var(--text-muted)]">+{activeLayerItems.length - 10}</span>}
          </div>
        ) : (
          <div className="text-[9px] font-mono text-[var(--text-muted)]">No active layers.</div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(LayerPanel);
