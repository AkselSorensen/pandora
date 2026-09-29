'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock3, MapPin, SkipBack, SkipForward } from 'lucide-react';

type WindowKey = '24h' | '7d' | '30d' | 'all';

interface EventTimelinePanelProps {
  events: any[];
  onLocate: (lat: number, lng: number) => void;
}

const WINDOWS: { id: WindowKey; label: string; ms: number | null }[] = [
  { id: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'all', label: 'ALL', ms: null },
];

export default function EventTimelinePanel({ events, onLocate }: EventTimelinePanelProps) {
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');
  const [selectedId, setSelectedId] = useState('');

  const timeline = useMemo(() => {
    const cutoff = WINDOWS.find((item) => item.id === windowKey)?.ms;
    const now = Date.now();
    return events
      .filter((event) => Array.isArray(event.coords) && event.coords.length === 2 && event.published)
      .map((event) => ({
        ...event,
        timestamp: Date.parse(event.published),
        id: String(event.link || `${event.title}-${event.published}`),
      }))
      .filter((event) => Number.isFinite(event.timestamp) && (cutoff === null || now - event.timestamp <= cutoff))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events, windowKey]);

  useEffect(() => {
    if (!timeline.some((event) => event.id === selectedId)) {
      setSelectedId(timeline[timeline.length - 1]?.id || '');
    }
  }, [selectedId, timeline]);

  const selectedIndex = Math.max(0, timeline.findIndex((event) => event.id === selectedId));
  const selected = timeline[selectedIndex];

  const selectIndex = (index: number) => {
    const event = timeline[Math.max(0, Math.min(timeline.length - 1, index))];
    if (!event) return;
    setSelectedId(event.id);
    onLocate(Number(event.coords[0]), Number(event.coords[1]));
  };

  return (
    <section className="glass-panel p-3" aria-label="Event timeline">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
          <h2 className="hud-text text-[10px] text-[var(--text-primary)]">EVENT TIMELINE</h2>
          <span className="text-[8px] font-mono text-[var(--text-muted)]">{timeline.length}</span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Timeline period">
          {WINDOWS.map((item) => (
            <button key={item.id} type="button" onClick={() => setWindowKey(item.id)} aria-pressed={windowKey === item.id} className={`rounded px-1.5 py-1 text-[7px] font-mono ${windowKey === item.id ? 'border border-[var(--border-primary)] text-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {selected ? (
        <>
          <input
            aria-label="Select event in timeline"
            type="range"
            min={0}
            max={Math.max(0, timeline.length - 1)}
            value={selectedIndex}
            onChange={(event) => selectIndex(Number(event.target.value))}
            className="mt-3 w-full accent-[var(--gold-primary)]"
          />
          <div className="mt-1 flex items-center justify-between text-[7px] font-mono text-[var(--text-muted)]">
            <span>{new Date(timeline[0].timestamp).toLocaleString()}</span>
            <span>{new Date(timeline[timeline.length - 1].timestamp).toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded border border-[var(--border-secondary)] bg-black/15 p-2">
            <button type="button" aria-label="Previous event" onClick={() => selectIndex(selectedIndex - 1)} disabled={selectedIndex === 0} className="mt-0.5 text-[var(--text-muted)] hover:text-[var(--gold-primary)] disabled:opacity-30"><SkipBack className="h-3 w-3" /></button>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[9px] font-mono leading-relaxed text-[var(--text-primary)]">{selected.title}</p>
              <p className="mt-1 text-[7px] font-mono text-[var(--text-muted)]">{selected.source || 'Unknown source'} · {new Date(selected.timestamp).toLocaleString()}</p>
            </div>
            <button type="button" onClick={() => onLocate(Number(selected.coords[0]), Number(selected.coords[1]))} aria-label="Locate selected event" className="mt-0.5 text-[var(--gold-primary)]"><MapPin className="h-3 w-3" /></button>
            <button type="button" aria-label="Next event" onClick={() => selectIndex(selectedIndex + 1)} disabled={selectedIndex >= timeline.length - 1} className="mt-0.5 text-[var(--text-muted)] hover:text-[var(--gold-primary)] disabled:opacity-30"><SkipForward className="h-3 w-3" /></button>
          </div>
        </>
      ) : (
        <p className="py-4 text-center text-[8px] font-mono text-[var(--text-muted)]">No geolocated events in this time window.</p>
      )}
    </section>
  );
}
