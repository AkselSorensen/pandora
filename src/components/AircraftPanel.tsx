'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, ChevronDown, ChevronUp, Search, Eye, Compass,
  Activity, Star, Clock, Filter, AlertTriangle, Shield, CheckCircle
} from 'lucide-react';

interface AircraftPanelProps {
  data?: any;
  activeAircraft?: any;
  onSelectAircraft?: (aircraft: any) => void;
  onClose?: () => void;
}

export default function AircraftPanel({ data, activeAircraft, onSelectAircraft, onClose }: AircraftPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'commercial' | 'private' | 'jet' | 'military' | 'watchlist'>('all');
  const [sortBy, setSortBy] = useState<'callsign' | 'alt' | 'speed' | 'category'>('alt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // Charge la watchlist depuis localStorage au montage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('Pandora-aircraft-watchlist');
        if (stored) {
          setWatchlist(JSON.parse(stored));
        }
      } catch (e) {
        console.error('[AIRCRAFT] LocalStorage read failed:', e);
      }
    }
  }, []);

  // Gère l'ajout/retrait de la watchlist
  const toggleWatchlist = (icao: string, e: any) => {
    e.stopPropagation();
    const updated = watchlist.includes(icao)
      ? watchlist.filter(id => id !== icao)
      : [...watchlist, icao];
    setWatchlist(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('Pandora-aircraft-watchlist', JSON.stringify(updated));
      } catch (err) {
        console.error('[AIRCRAFT] LocalStorage write failed:', err);
      }
    }
  };

  // Regroupe tous les avions depuis les différentes catégories de données
  const allAircraft = useMemo(() => {
    const list: any[] = [];
    if (!data) return list;

    const addWithCategory = (arr: any[], cat: string) => {
      if (Array.isArray(arr)) {
        arr.forEach(item => {
          list.push({ ...item, sourceCategory: cat });
        });
      }
    };

    addWithCategory(data.commercial_flights, 'commercial');
    addWithCategory(data.private_flights, 'private');
    addWithCategory(data.private_jets, 'jet');
    addWithCategory(data.military_flights, 'military');

    return list;
  }, [data]);

  // Filtre et recherche
  const filteredAircraft = useMemo(() => {
    return allAircraft.filter(ac => {
      // Recherche textuelle
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || 
        (ac.callsign || '').toLowerCase().includes(q) ||
        (ac.icao24 || '').toLowerCase().includes(q) ||
        (ac.model || '').toLowerCase().includes(q) ||
        (ac.registration || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Filtre d'onglet
      if (activeTab === 'all') return true;
      if (activeTab === 'watchlist') return watchlist.includes(ac.icao24);
      return ac.category === activeTab;
    });
  }, [allAircraft, search, activeTab, watchlist]);

  // Tri
  const sortedAircraft = useMemo(() => {
    const sorted = [...filteredAircraft];
    sorted.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'callsign') {
        valA = a.callsign || '';
        valB = b.callsign || '';
      } else if (sortBy === 'category') {
        valA = a.category || '';
        valB = b.category || '';
      } else {
        // alt ou speed_knots
        valA = Number(a[sortBy === 'speed' ? 'speed_knots' : 'alt']) || 0;
        valB = Number(b[sortBy === 'speed' ? 'speed_knots' : 'alt']) || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredAircraft, sortBy, sortOrder]);

  const toggleSort = (field: 'callsign' | 'alt' | 'speed' | 'category') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Statistiques pour l'entête
  const stats = useMemo(() => {
    const res = { total: 0, mil: 0, pri: 0, jet: 0, com: 0, jammed: 0 };
    allAircraft.forEach(ac => {
      res.total++;
      if (ac.category === 'military') res.mil++;
      else if (ac.category === 'private') res.pri++;
      else if (ac.category === 'jet') res.jet++;
      else res.com++;

      if (ac.nac_p != null && ac.nac_p <= 4 && !ac.grounded) {
        res.jammed++;
      }
    });
    return res;
  }, [allAircraft]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="glass-panel p-3 pointer-events-auto flex flex-col w-full max-h-[500px]"
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full mb-2 focus:outline-none">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-[var(--gold-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">AIRCRAFT TRACKER</span>
          <span className="gotham-tag gotham-tag--low" style={{ fontSize: '7px', padding: '1px 4px' }}>
            {stats.total} LIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stats.jammed > 0 && (
            <div className="flex items-center gap-1 text-[var(--alert-red)] font-mono text-[9px] animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span>{stats.jammed} GPS JAM</span>
            </div>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col flex-grow overflow-hidden gap-2"
          >
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-5 gap-1 text-center py-1 bg-[var(--hover-accent)] rounded border border-[var(--border-primary)]">
              <div>
                <div className="text-[10px] font-mono font-bold text-[var(--gold-primary)]">{stats.total}</div>
                <div className="text-[7px] font-mono text-[var(--text-muted)]">TRACKED</div>
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-[var(--alert-red)]">{stats.mil}</div>
                <div className="text-[7px] font-mono text-[var(--text-muted)]">MILITARY</div>
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-cyan-400">{stats.com}</div>
                <div className="text-[7px] font-mono text-[var(--text-muted)]">COMM.</div>
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-pink-400">{stats.jet}</div>
                <div className="text-[7px] font-mono text-[var(--text-muted)]">JETS</div>
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-amber-400">{watchlist.length}</div>
                <div className="text-[7px] font-mono text-[var(--text-muted)]">WATCH</div>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3 h-3 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search callsign, ICAO, model, reg..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded bg-[var(--input-bg)] border border-[var(--border-primary)] text-[10px] font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--gold-primary)]"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-0.5 overflow-x-auto pb-1 styled-scrollbar">
              {[
                { id: 'all', label: 'ALL' },
                { id: 'commercial', label: 'COMM' },
                { id: 'military', label: 'MIL' },
                { id: 'jet', label: 'JETS' },
                { id: 'private', label: 'PRIV' },
                { id: 'watchlist', label: '★ WATCH' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-2 py-1 rounded text-[8px] font-mono tracking-wider whitespace-nowrap transition-all border ${
                    activeTab === tab.id
                      ? 'bg-[var(--hover-accent)] text-[var(--gold-primary)] border-[var(--border-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* List Header / Sort */}
            <div className="grid grid-cols-12 gap-1 px-1 py-1 bg-[var(--bg-primary)] border-b border-[var(--border-primary)] text-[8px] font-mono text-[var(--text-muted)] font-bold tracking-widest">
              <button onClick={() => toggleSort('callsign')} className="col-span-4 flex items-center gap-0.5 text-left focus:outline-none">
                FLIGHT {sortBy === 'callsign' && (sortOrder === 'asc' ? '▲' : '▼')}
              </button>
              <button onClick={() => toggleSort('category')} className="col-span-2 flex items-center gap-0.5 text-left focus:outline-none">
                CAT {sortBy === 'category' && (sortOrder === 'asc' ? '▲' : '▼')}
              </button>
              <button onClick={() => toggleSort('alt')} className="col-span-3 flex items-center gap-0.5 text-right justify-end focus:outline-none">
                ALT (m) {sortBy === 'alt' && (sortOrder === 'asc' ? '▲' : '▼')}
              </button>
              <button onClick={() => toggleSort('speed')} className="col-span-3 flex items-center gap-0.5 text-right justify-end focus:outline-none">
                SPD (kt) {sortBy === 'speed' && (sortOrder === 'asc' ? '▲' : '▼')}
              </button>
            </div>

            {/* Aircraft Scrollable List */}
            <div className="flex-grow overflow-y-auto styled-scrollbar space-y-0.5 pr-1 max-h-[220px]">
              {sortedAircraft.map(ac => {
                const isSelected = activeAircraft?.icao24 === ac.icao24;
                const isWatch = watchlist.includes(ac.icao24);
                const isJammed = ac.nac_p != null && ac.nac_p <= 4 && !ac.grounded;

                let catColor = 'text-cyan-400';
                if (ac.category === 'military') catColor = 'text-[var(--alert-red)]';
                else if (ac.category === 'jet') catColor = 'text-pink-400';
                else if (ac.category === 'private') catColor = 'text-amber-400';

                return (
                  <div
                    key={ac.icao24}
                    onClick={() => onSelectAircraft?.(ac)}
                    className={`grid grid-cols-12 gap-1 px-1 py-1.5 rounded items-center cursor-pointer transition-colors border ${
                      isSelected
                        ? 'bg-[var(--hover-accent)] border-[var(--gold-primary)]'
                        : isJammed
                        ? 'bg-[rgba(239,68,68,0.05)] border-[rgba(239,68,68,0.2)] hover:bg-[var(--hover-accent)]'
                        : 'border-transparent hover:bg-[var(--hover-accent)]'
                    }`}
                  >
                    {/* Callsign & Watchlist Icon */}
                    <div className="col-span-4 flex items-center gap-1 overflow-hidden text-ellipsis">
                      <button
                        onClick={(e) => toggleWatchlist(ac.icao24, e)}
                        className={`focus:outline-none transition-colors ${isWatch ? 'text-amber-400' : 'text-[var(--text-muted)] hover:text-amber-300'}`}
                      >
                        <Star className={`w-3 h-3 ${isWatch ? 'fill-amber-400' : ''}`} />
                      </button>
                      <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {ac.callsign}
                      </span>
                    </div>

                    {/* Category Code */}
                    <div className="col-span-2 text-[8px] font-mono">
                      <span className={`px-1 py-0.5 rounded text-[7px] font-bold bg-black bg-opacity-40 ${catColor}`}>
                        {ac.category === 'military' ? 'MIL' : ac.category === 'jet' ? 'JET' : ac.category === 'private' ? 'PRV' : 'COM'}
                      </span>
                    </div>

                    {/* Altitude */}
                    <div className="col-span-3 text-right text-[10px] font-mono text-[var(--text-secondary)]">
                      {ac.alt != null ? ac.alt.toLocaleString() : '---'}
                    </div>

                    {/* Speed / Jam Warning */}
                    <div className="col-span-3 text-right flex items-center justify-end gap-1">
                      {isJammed && (
                        <span title="GPS Jamming suspected (low NACp)">
                          <AlertTriangle className="w-2.5 h-2.5 text-[var(--alert-red)]" aria-label="GPS Jamming suspected (low NACp)" />
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                        {ac.speed_knots != null ? Math.round(ac.speed_knots) : '---'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {sortedAircraft.length === 0 && (
                <div className="text-center py-6 text-[10px] font-mono text-[var(--text-muted)]">
                  {stats.total === 0 ? 'Loading ADSB aircraft feed...' : 'No matching aircraft.'}
                </div>
              )}
            </div>

            {/* Selected Aircraft Detail Panel */}
            {activeAircraft && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 p-2 rounded-lg bg-black bg-opacity-50 border border-[var(--border-primary)] text-left animate-glow-pulse"
              >
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span className="text-[11px] font-mono font-bold text-[var(--gold-primary)]">
                      {activeAircraft.callsign}
                    </span>
                    <span className="text-[8px] font-mono text-[var(--text-muted)] ml-2">
                      ({activeAircraft.registration || 'No Reg'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      activeAircraft.category === 'military' ? 'bg-red-950 text-red-400 border border-red-800' :
                      activeAircraft.category === 'jet' ? 'bg-pink-950 text-pink-400 border border-pink-800' :
                      'bg-slate-900 text-cyan-400 border border-slate-700'
                    }`}>
                      {activeAircraft.category?.toUpperCase()}
                    </span>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white text-[9px] font-mono">
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-mono text-[var(--text-secondary)]">
                  <div>Model: <span className="text-[var(--text-primary)] font-bold">{activeAircraft.model || 'Unknown'}</span></div>
                  <div>ICAO: <span className="text-[var(--text-primary)]">{activeAircraft.icao24}</span></div>
                  <div>Altitude: <span className="text-[var(--text-primary)]">{(activeAircraft.alt || 0).toLocaleString()} m</span></div>
                  <div>Speed: <span className="text-[var(--text-primary)]">{activeAircraft.speed_knots || 0} kt</span></div>
                  <div>Heading: <span className="text-[var(--text-primary)]">{activeAircraft.heading}°</span></div>
                  <div>Squawk: <span className="text-yellow-400 font-bold">{activeAircraft.squawk || '----'}</span></div>
                </div>

                {activeAircraft.nac_p != null && activeAircraft.nac_p <= 4 && (
                  <div className="mt-1.5 p-1 rounded bg-red-950 bg-opacity-40 border border-red-900 text-[8px] font-mono text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                    <span>LOW SIGNAL INTEGRITY (NACp: {activeAircraft.nac_p}) - GPS JAMMING ZONE SUSPECTED</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
