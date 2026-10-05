'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   PANDORA — Search / Locate Bar
   Coordinate and place name search with geocoding
   ═══════════════════════════════════════════════════════════════ */

interface SearchBarProps {
  onLocate: (lat: number, lng: number) => void;
  signals?: any[];
}

interface SearchResult {
  label: string;
  lat: number;
  lng: number;
  kind: 'place' | 'signal';
  source?: string;
}

export default function SearchBar({ onLocate, signals = [] }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const parseCoords = (s: string): { lat: number; lng: number } | null => {
    const m = s.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    return null;
  };

  const handleSearch = useCallback(async (q: string) => {
    setValue(q);
    const coords = parseCoords(q);
    if (coords) {
      setResults([{ label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`, ...coords, kind: 'place' }]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const matchingSignals: SearchResult[] = signals
        .filter((signal) => Array.isArray(signal.coords) && signal.coords.length === 2)
        .filter((signal) => `${signal.title || ''} ${signal.source || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 5)
        .map((signal) => ({
          label: signal.title || 'Untitled signal',
          lat: Number(signal.coords[0]),
          lng: Number(signal.coords[1]),
          kind: 'signal',
          source: signal.source || 'Unknown source',
        }));
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {
          headers: { 'Accept-Language': 'en' },
        });
        const data = await res.json();
        const places: SearchResult[] = data.map((r: any) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon), kind: 'place' }));
        setResults([...matchingSignals, ...places]);
      } catch { setResults(matchingSignals); }
      setLoading(false);
    }, 350);
  }, [signals]);

  const handleSelect = (r: SearchResult) => {
    onLocate(r.lat, r.lng);
    setOpen(false);
    setValue('');
    setResults([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 glass-panel-sm px-3 py-2 text-[9px] font-mono tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--gold-primary)] hover:border-[var(--border-active)] transition-all hover:shadow-[0_0_12px_rgba(212,175,55,0.08)]"
      >
        <Search className="w-3 h-3" />
        CMD: LOCATE
      </button>
    );
  }

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 glass-panel px-3 py-2.5 !border-[var(--border-active)]">
        <Search className="w-3.5 h-3.5 text-[var(--gold-primary)] flex-shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setValue(''); setResults([]); }
            if (e.key === 'Enter' && results.length > 0) handleSelect(results[0]);
          }}
          placeholder="SEARCH SIGNALS, PLACES OR COORDINATES..."
          className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] font-mono tracking-wider outline-none placeholder:text-[var(--text-muted)]"
        />
        {loading && <div className="w-3 h-3 border border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" />}
        <button onClick={() => { setOpen(false); setValue(''); setResults([]); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="w-3 h-3" />
        </button>
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-panel overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.5)] max-h-[200px] overflow-y-auto styled-scrollbar z-50">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-[var(--hover-accent)] transition-colors border-b border-[var(--border-secondary)] last:border-0 flex items-center gap-2"
            >
              <MapPin className={`w-3 h-3 flex-shrink-0 ${r.kind === 'signal' ? 'text-[#FF4081]' : 'text-[var(--gold-primary)]'}`} />
              <span className="min-w-0 flex-1 truncate text-[9px] font-mono text-[var(--text-secondary)]">{r.label}</span>
              <span className="flex-shrink-0 text-[7px] font-mono tracking-wider text-[var(--text-muted)]">{r.kind === 'signal' ? `SIGNAL · ${r.source}` : 'PLACE'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
