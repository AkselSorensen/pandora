'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Camera, Crosshair, Radio, Ship, X } from 'lucide-react';

type Props = {
  target: any;
  data: any;
  open: boolean;
  onClose: () => void;
};

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLng = (lngB - lngA) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MissionSituationPanel({ target, data, open, onClose }: Props) {
  const nearby = useMemo(() => {
    if (!target) return [];
    const collect = (kind: string, items: any[], label: (item: any) => string, detail: (item: any) => string) =>
      (items || []).filter(Boolean).filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
        .map((item) => ({
          kind,
          name: label(item),
          detail: detail(item),
          url: item.url || item.external_url,
          distance: distanceKm(Number(target.lat), Number(target.lng), Number(item.lat), Number(item.lng)),
        }))
        .filter((item) => item.distance <= 250)
        .sort((a, b) => a.distance - b.distance);

    return [
      ...collect('AIR', [data.commercial_flights, data.private_flights, data.private_jets, data.military_flights, data.tankers_isr].flat(), (i) => i.callsign || i.model || 'Aircraft', (i) => `${Math.round(Number(i.alt || 0))} m · ${Math.round(Number(i.speed_knots || 0))} kt`),
      ...collect('SEA', data.maritime_ships, (i) => i.name || i.mmsi || 'Vessel', (i) => [i.type, i.destination, i.flag].filter(Boolean).join(' · ') || 'AIS position'),
      ...collect('EVENT', [data.earthquakes, data.gdelt, data.military_events, data.weather_events, data.fires].flat(), (i) => i.place || i.name || i.title || i.type || 'Open signal', (i) => i.magnitude ? `Magnitude ${i.magnitude}` : i.type || i.category || 'Public source'),
      ...collect('CAMERA', data.cameras, (i) => i.name || i.city || 'Public camera', (i) => [i.city, i.country].filter(Boolean).join(', ') || 'Camera coverage'),
    ].sort((a, b) => a.distance - b.distance);
  }, [target, data.commercial_flights, data.private_flights, data.private_jets, data.military_flights, data.tankers_isr, data.maritime_ships, data.earthquakes, data.gdelt, data.military_events, data.weather_events, data.fires, data.cameras]);

  const groups = [
    { key: 'AIR', label: 'AIR CONTACTS', icon: Activity },
    { key: 'SEA', label: 'MARITIME', icon: Ship },
    { key: 'EVENT', label: 'EVENTS', icon: Radio },
    { key: 'CAMERA', label: 'CAMERA COVERAGE', icon: Camera },
  ];

  return (
    <AnimatePresence>
      {target && open && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
          className="mission-situation-panel absolute top-[76px] md:top-[88px] right-3 md:right-5 bottom-[84px] md:bottom-[76px] z-[210] w-[min(370px,calc(100vw-24px))] glass-panel flex flex-col overflow-hidden pointer-events-auto"
          aria-label="Mission situation around selected target"
        >
          <header className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-[8px] font-mono tracking-[0.18em] text-[var(--gold-primary)]"><Crosshair className="h-3.5 w-3.5" /> MISSION SITUATION</div>
              <div className="mt-1 text-[7px] font-mono tracking-wider text-[var(--text-muted)]">250 KM CONTEXT RADIUS</div>
            </div>
            <button onClick={onClose} aria-label="Close mission situation" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
          </header>

          <div className="border-b border-[var(--border-secondary)] px-4 py-3">
            <div className="text-[7px] font-mono tracking-[0.16em] text-[var(--text-muted)]">TRACKED SUBJECT / {String(target.type).toUpperCase()}</div>
            <div className="mt-1 truncate text-sm font-mono font-bold text-[var(--text-heading)]">{target.name}</div>
            <div className="mt-1 text-[8px] font-mono text-[var(--text-secondary)]">{Number(target.lat).toFixed(4)}°, {Number(target.lng).toFixed(4)}°</div>
          </div>

          <div className="grid grid-cols-4 border-b border-[var(--border-secondary)]">
            {groups.map((group) => {
              const count = nearby.filter((item) => item.kind === group.key).length;
              return <div key={group.key} className="border-r border-[var(--border-secondary)] px-2 py-2 text-center last:border-r-0"><group.icon className="mx-auto h-3 w-3 text-[var(--gold-primary)]" /><div className="mt-1 text-[11px] font-mono font-bold text-[var(--text-heading)]">{count}</div><div className="text-[6px] font-mono tracking-wider text-[var(--text-muted)]">{group.key}</div></div>;
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between text-[7px] font-mono tracking-[0.16em] text-[var(--text-muted)]"><span>NEAREST PUBLIC SIGNALS</span><span>{nearby.length} IN RANGE</span></div>
            {nearby.length ? nearby.slice(0, 12).map((item, index) => (
              <div key={`${item.kind}-${item.name}-${index}`} className="mission-signal-row border-t border-[var(--border-secondary)] py-2">
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-[9px] font-mono font-bold text-[var(--text-primary)]">{item.name}</span><span className="shrink-0 text-[7px] font-mono text-[var(--gold-primary)]">{Math.round(item.distance)} KM</span></div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[7px] font-mono text-[var(--text-muted)]"><span className="truncate">{item.detail}</span><span className="shrink-0">{item.kind}</span></div>
              </div>
            )) : <div className="rounded border border-dashed border-[var(--border-secondary)] px-3 py-6 text-center text-[8px] font-mono leading-relaxed text-[var(--text-muted)]">NO LOADED SIGNALS WITHIN 250 KM.<br />Enable nearby layers or wait for their feeds.</div>}
          </div>
          <footer className="border-t border-[var(--border-secondary)] px-4 py-2 text-[7px] font-mono leading-relaxed text-[var(--text-muted)]">Context is calculated from currently loaded public feeds. Missing or stale feeds may leave gaps.</footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
