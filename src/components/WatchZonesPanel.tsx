'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, MapPin, Plus, Trash2 } from 'lucide-react';

interface WatchZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

interface WatchZonesPanelProps {
  center: { latitude: number; longitude: number };
  label?: string;
  signals: any[];
  onLocate: (lat: number, lng: number) => void;
}

const STORAGE_KEY = 'pandora.watch-zones.v1';

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export default function WatchZonesPanel({ center, label, signals, onLocate }: WatchZonesPanelProps) {
  const [zones, setZones] = useState<WatchZone[]>([]);
  const [name, setName] = useState('');
  const [radiusKm, setRadiusKm] = useState(250);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setZones(parsed.filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng)));
      }
    } catch { /* Keep an empty in-memory list if local storage is unavailable. */ }
  }, []);

  const nearbyByZone = useMemo(() => zones.map((zone) => ({
    zone,
    signals: signals.filter((signal) => {
      const coords = signal.coords;
      return Array.isArray(coords) && coords.length === 2
        && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1]))
        && distanceKm(zone.lat, zone.lng, Number(coords[0]), Number(coords[1])) <= zone.radiusKm;
    }),
  })), [signals, zones]);

  const persist = (next: WatchZone[]) => {
    setZones(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Zones remain available until this page closes. */ }
  };

  const saveCurrentArea = () => {
    const cleanName = name.trim() || label?.trim() || `Zone ${zones.length + 1}`;
    const zone: WatchZone = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      lat: center.latitude,
      lng: center.longitude,
      radiusKm,
    };
    persist([zone, ...zones]);
    setName('');
  };

  return (
    <section className="glass-panel p-3" aria-label="Watched areas">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-[var(--gold-primary)]" />
          <h2 className="hud-text text-[10px] text-[var(--text-primary)]">WATCHED AREAS</h2>
          <span className="text-[8px] font-mono text-[var(--text-muted)]">{zones.length}</span>
        </div>
        <span className="text-[7px] font-mono tracking-wider text-[var(--text-muted)]">THIS DEVICE</span>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={label || 'Zone name'}
          aria-label="Watched area name"
          className="min-w-0 flex-1 rounded border border-[var(--border-secondary)] bg-black/20 px-2 py-1.5 text-[9px] font-mono text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-active)]"
        />
        <select
          value={radiusKm}
          onChange={(event) => setRadiusKm(Number(event.target.value))}
          aria-label="Watched area radius"
          className="rounded border border-[var(--border-secondary)] bg-[var(--bg-panel)] px-1.5 text-[8px] font-mono text-[var(--text-secondary)]"
        >
          {[100, 250, 500, 1000].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
        </select>
        <button type="button" onClick={saveCurrentArea} className="inline-flex items-center gap-1 rounded border border-[var(--border-primary)] px-2 text-[8px] font-mono text-[var(--gold-primary)] hover:bg-[var(--hover-accent)]">
          <Plus className="h-3 w-3" /> SAVE VIEW
        </button>
      </div>

      <p className="mt-2 text-[8px] font-mono text-[var(--text-muted)]">Matches currently loaded, geolocated news signals. This panel does not send push notifications.</p>

      <div className="mt-3 space-y-2">
        {nearbyByZone.map(({ zone, signals: nearby }) => (
          <article key={zone.id} className="rounded border border-[var(--border-secondary)] bg-black/15 p-2">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => onLocate(zone.lat, zone.lng)} className="min-w-0 text-left">
                <span className="block truncate text-[9px] font-mono text-[var(--text-primary)]">{zone.name}</span>
                <span className="text-[7px] font-mono text-[var(--text-muted)]">{zone.lat.toFixed(2)}, {zone.lng.toFixed(2)} · {zone.radiusKm} km</span>
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-[var(--gold-primary)]">{nearby.length} MATCH{nearby.length === 1 ? '' : 'ES'}</span>
                <button type="button" onClick={() => persist(zones.filter((item) => item.id !== zone.id))} aria-label={`Remove ${zone.name}`} className="text-[var(--text-muted)] hover:text-red-400">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            {nearby.slice(0, 3).map((signal, index) => (
              <button key={`${signal.link || signal.title}-${index}`} type="button" onClick={() => onLocate(Number(signal.coords[0]), Number(signal.coords[1]))} className="mt-1 flex w-full items-center gap-1.5 truncate border-t border-[var(--border-secondary)] pt-1 text-left text-[8px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0 text-[#FF4081]" />
                <span className="truncate">{signal.title}</span>
              </button>
            ))}
          </article>
        ))}
        {zones.length === 0 && <p className="py-2 text-center text-[8px] font-mono text-[var(--text-muted)]">Save the current map view to start monitoring an area.</p>}
      </div>
    </section>
  );
}
