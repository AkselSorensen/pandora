'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command, Layers, MapPin, Sparkles } from 'lucide-react';

interface CommandPaletteProps {
  onNavigate: (lat: number, lng: number, zoom?: number) => void;
  onToggleLayer: (layer: string) => void;
  onOpenAip: () => void;
  onGenerateBriefing?: () => void;
}

const NAV_TARGETS = [
  { label: 'Ukraine', lat: 48.5, lng: 31.2, zoom: 5 },
  { label: 'Red Sea', lat: 16, lng: 40, zoom: 5 },
  { label: 'Taiwan Strait', lat: 24, lng: 119.5, zoom: 6 },
  { label: 'Istanbul', lat: 41.0082, lng: 28.9784, zoom: 9 },
  { label: 'Gaza', lat: 31.35, lng: 34.35, zoom: 8 },
];

function CommandPalette({ onNavigate, onToggleLayer, onOpenAip, onGenerateBriefing }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const commands = useMemo(() => [
    { id: 'aip', label: 'Open Pandora AIP', icon: Sparkles, run: onOpenAip },
    { id: 'brief', label: 'Generate / open briefing center', icon: Command, run: onGenerateBriefing || onOpenAip },
    ...['maritime', 'cctv', 'global_incidents', 'weather', 'infrastructure', 'flights', 'military', 'satellites'].map(layer => ({ id: `layer-${layer}`, label: `Toggle layer ${layer}`, icon: Layers, run: () => onToggleLayer(layer) })),
    ...NAV_TARGETS.map(target => ({ id: `nav-${target.label}`, label: `Go to ${target.label}`, icon: MapPin, run: () => onNavigate(target.lat, target.lng, target.zoom) })),
  ], [onGenerateBriefing, onNavigate, onOpenAip, onToggleLayer]);

  const filtered = commands.filter(command => command.label.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="command-palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <motion.div className="command-palette glass-panel" initial={{ y: -20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -20, scale: 0.98 }} onClick={e => e.stopPropagation()}>
            <div className="command-palette-input">
              <Command className="w-4 h-4" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Command: go to, toggle layer, open AIP..." />
              <span>CTRL K</span>
            </div>
            <div className="command-palette-list">
              {filtered.map(command => {
                const Icon = command.icon;
                return <button key={command.id} onClick={() => { command.run(); setOpen(false); setQuery(''); }}><Icon className="w-4 h-4" /><span>{command.label}</span></button>;
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(CommandPalette);