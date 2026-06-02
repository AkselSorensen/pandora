'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, BarChart3, Newspaper, Search, X, Globe, MapPinned, Radar, Satellite, Moon,
  ExternalLink, AlertTriangle, Activity, Database, Wifi, Brain, Shield, EyeOff, BookOpen
} from 'lucide-react';
import IntelFeed from '@/components/IntelFeed';
import MarketsPanel from '@/components/MarketsPanel';
import SearchBar from '@/components/SearchBar';
import ScaleBar from '@/components/ScaleBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import SharePanel from '@/components/SharePanel';
import ViewPresets from '@/components/ViewPresets';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import GlobalStatusBar from '@/components/GlobalStatusBar';
import LiveAlerts from '@/components/LiveAlerts';
import DataFoundryPanel from '@/components/DataFoundryPanel';
import MissionControlPanel from '@/components/MissionControlPanel';
import AipFusionPanel from '@/components/AipFusionPanel';
import AdvancedOpsPanel from '@/components/AdvancedOpsPanel';
import CommandPalette from '@/components/CommandPalette';
import InnovationLabPanel from '@/components/InnovationLabPanel';
import PublicIntelCatalogPanel from '@/components/PublicIntelCatalogPanel';
import { buildFusionModel } from '@/lib/palantir-fusion';
import CyberThreatRadar from '@/components/CyberThreatRadar';
import DarkWebMonitor from '@/components/DarkWebMonitor';
import ReconPlaybooks from '@/components/ReconPlaybooks';
import OSINTHub from '@/components/OSINTHub';

const PandoraMap = dynamic(() => import('@/components/PandoraMap'), { ssr: false });
const LayerPanel = dynamic(() => import('@/components/LayerPanel'));
const CameraViewer = dynamic(() => import('@/components/CameraViewer'));
const OsintPanel = dynamic(() => import('@/components/OsintPanel'));

const TANKER_ISR_TYPES = new Set([
  'KC10', 'KC46', 'KC35', 'K35R', 'K35A', 'A332', 'A333', 'A339', 'MRTT',
  'E3CF', 'E3TF', 'E3A', 'E7', 'E8A', 'E6B', 'RC135', 'P8A', 'P3', 'EP3',
  'RQ4', 'MQ9', 'U2', 'GLEX', 'GLF5', 'GLF6', 'C30J', 'C130', 'C17', 'C5M',
]);

const MIL_EVENT_KEYWORDS = [
  'attack', 'strike', 'missile', 'drone', 'war', 'troops', 'military', 'clash',
  'bomb', 'killed', 'forces', 'airstrike', 'shelling', 'frontline', 'invasion',
  'naval', 'army', 'defence', 'defense', 'mobilisation', 'mobilization',
];

function deriveTankersIsr(flights: any[] = []) {
  return flights.filter((flight) => {
    const model = String(flight.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const callsign = String(flight.callsign || '').toUpperCase();
    return (
      TANKER_ISR_TYPES.has(model) ||
      /^(NATO|MAGIC|SENTRY|FORTE|JAKE|REACH|RCH|TEXACO|QID|NACHO|LAGR|CACTI|COBRA|DRAGO|DUKE)/.test(callsign) ||
      model.includes('RC135') || model.includes('RQ4') || model.includes('P8') || model.includes('KC')
    );
  }).map((flight) => ({
    ...flight,
    mission_hint: inferMilitaryMission(flight),
  }));
}

function inferMilitaryMission(flight: any) {
  const model = String(flight.model || '').toUpperCase();
  const callsign = String(flight.callsign || '').toUpperCase();
  if (model.includes('KC') || /^(TEXACO|QID|NACHO|LAGR|CACTI)/.test(callsign)) return 'AERIAL REFUELING';
  if (model.includes('E3') || model.includes('E7') || /^(NATO|MAGIC|SENTRY)/.test(callsign)) return 'AEW / AWACS';
  if (model.includes('RC') || model.includes('RQ') || model.includes('U2') || /^(FORTE|JAKE|COBRA)/.test(callsign)) return 'ISR / RECON';
  if (model.includes('P8') || model.includes('P3')) return 'MARITIME PATROL';
  if (model.includes('C17') || model.includes('C130') || model.includes('C5')) return 'MILITARY AIRLIFT';
  return 'MILITARY WATCH';
}

function deriveMilitaryEvents(events: any[] = []) {
  return events.filter((event) => {
    const text = `${event.name || ''} ${event.type || ''}`.toLowerCase();
    return MIL_EVENT_KEYWORDS.some((keyword) => text.includes(keyword));
  });
}

function deriveSentinelBuckets(scenes: any[] = []) {
  return {
    sentinel_scenes: scenes,
    sentinel_sar: scenes.filter((scene) => String(scene.platform || scene.mode || '').toLowerCase().includes('sentinel-1') || scene.polarization),
    sentinel_optical: scenes.filter((scene) => String(scene.platform || '').toLowerCase().includes('sentinel-2') || scene.cloud_cover !== null),
  };
}

function deriveDisasterOps(weatherEvents: any[] = [], fires: any[] = [], earthquakes: any[] = []) {
  const weather = weatherEvents.filter((event) => /flood|storm|cyclone|volcano|severe/i.test(`${event.type || ''} ${event.title || ''}`));
  const majorQuakes = earthquakes.filter((eq) => Number(eq.magnitude || 0) >= 5.5);
  return [
    ...weather.map((event) => ({ ...event, layer_type: 'weather' })),
    ...fires.slice(0, 150).map((event) => ({ ...event, title: 'Active fire / thermal anomaly', type: 'fire', layer_type: 'fire' })),
    ...majorQuakes.map((event) => ({ ...event, title: `M${event.magnitude} earthquake`, type: 'earthquake', layer_type: 'earthquake' })),
  ].filter((item) => typeof item.lat === 'number' && typeof item.lng === 'number');
}

function derivePortCongestion(ports: any[] = [], ships: any[] = []) {
  return ports.map((port) => {
    const nearby = ships.filter((ship) => {
      if (typeof ship.lat !== 'number' || typeof ship.lng !== 'number') return false;
      const dLat = ship.lat - port.lat;
      const dLng = (ship.lng - port.lng) * Math.cos((port.lat * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng) <= 0.75;
    });
    const score = Math.min(100, nearby.length * 8);
    return {
      ...port,
      vessel_count: nearby.length,
      score,
      level: score >= 75 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'WATCH' : 'LOW',
    };
  }).filter((port) => port.vessel_count > 0 || port.type === 'container' || port.type === 'energy');
}

function distanceDeg(a: any, b: any) {
  if (typeof a?.lat !== 'number' || typeof a?.lng !== 'number' || typeof b?.lat !== 'number' || typeof b?.lng !== 'number') return Infinity;
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function deriveMaritimeDarkActivity(ships: any[] = [], ports: any[] = [], chokepoints: any[] = []) {
  const events: any[] = [];

  for (const choke of chokepoints || []) {
    const nearby = (ships || []).filter((ship) => distanceDeg(ship, choke) <= 0.8);
    const slow = nearby.filter((ship) => Number(ship.speed || 0) <= 1.5);
    if (slow.length >= 3) {
      events.push({
        id: `dark-choke-slow-${choke.name}`,
        lat: choke.lat,
        lng: choke.lng,
        type: 'chokepoint_slow_cluster',
        title: `Low-speed vessel cluster near ${choke.name}`,
        severity: slow.length >= 8 ? 'CRITICAL' : 'HIGH',
        vessel_count: slow.length,
        context: `${slow.length} AIS vessels <= 1.5 kt within chokepoint radius`,
        source: 'AIS-derived heuristic',
      });
    }
    if (nearby.length >= 12) {
      events.push({
        id: `dark-choke-density-${choke.name}`,
        lat: choke.lat,
        lng: choke.lng,
        type: 'chokepoint_density',
        title: `Abnormal AIS concentration near ${choke.name}`,
        severity: nearby.length >= 25 ? 'CRITICAL' : 'WATCH',
        vessel_count: nearby.length,
        context: `${nearby.length} AIS vessels detected near chokepoint`,
        source: 'AIS-derived heuristic',
      });
    }
  }

  for (const port of ports || []) {
    const nearby = (ships || []).filter((ship) => distanceDeg(ship, port) <= 0.5);
    const verySlow = nearby.filter((ship) => Number(ship.speed || 0) <= 0.8);
    if (verySlow.length >= 5) {
      events.push({
        id: `dark-port-loiter-${port.name}`,
        lat: port.lat,
        lng: port.lng,
        type: 'port_loitering',
        title: `Low-speed / stopped AIS vessels around ${port.name}`,
        severity: verySlow.length >= 12 ? 'HIGH' : 'WATCH',
        vessel_count: verySlow.length,
        context: `${verySlow.length} vessels <= 0.8 kt inside port approach radius`,
        source: 'AIS-derived heuristic',
      });
    }
  }

  return events;
}

function deriveRiskHeatmap(data: any) {
  const cells = new Map<string, any>();
  const add = (lat: number, lng: number, weight: number, label: string) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const gLat = Math.round(lat / 5) * 5;
    const gLng = Math.round(lng / 5) * 5;
    const key = `${gLat},${gLng}`;
    const current = cells.get(key) || { lat: gLat, lng: gLng, score: 0, drivers: new Set<string>() };
    current.score += weight;
    current.drivers.add(label);
    cells.set(key, current);
  };

  (data.gdelt || []).forEach((e: any) => add(e.lat, e.lng, 14, 'incidents'));
  (data.military_events || []).forEach((e: any) => add(e.lat, e.lng, 18, 'mil-events'));
  (data.earthquakes || []).forEach((e: any) => add(e.lat, e.lng, Math.min(28, Number(e.magnitude || 0) * 4), 'seismic'));
  (data.fires || []).slice(0, 500).forEach((e: any) => add(e.lat, e.lng, 4, 'fires'));
  (data.weather_events || []).forEach((e: any) => add(e.lat, e.lng, 12, 'weather'));
  (data.cyber_geo_threats || []).forEach((e: any) => add(e.lat, e.lng, 16, 'cyber'));
  (data.military_flights || []).forEach((e: any) => add(e.lat, e.lng, 8, 'mil-air'));
  (data.tankers_isr || []).forEach((e: any) => add(e.lat, e.lng, 12, 'isr/tanker'));
  (data.port_congestion || []).forEach((e: any) => add(e.lat, e.lng, Math.min(25, Number(e.score || 0) / 4), 'ports'));
  (data.infrastructure || []).forEach((e: any) => add(e.lat, e.lng, 10, 'infra'));
  (data.maritime_dark_activity || []).forEach((e: any) => add(e.lat, e.lng, e.severity === 'CRITICAL' ? 30 : 18, 'dark-ais'));

  return Array.from(cells.values())
    .map((cell: any) => ({ ...cell, score: Math.min(100, Math.round(cell.score)), drivers: Array.from(cell.drivers).join(', ') }))
    .filter((cell: any) => cell.score >= 12)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 250);
}

function deriveSpaceWeatherPoints(spaceWeather: any) {
  if (!spaceWeather) return [];
  const kp = Number(spaceWeather.kp_index || 0);
  const level = kp >= 7 ? 'CRITICAL' : kp >= 5 ? 'ELEVATED' : kp >= 4 ? 'WATCH' : 'LOW';
  return [
    { id: 'swpc-north', name: 'NOAA SWPC Aurora / GNSS North', lat: 68, lng: -45, kp, level, color: spaceWeather.storm_color || '#D4AF37' },
    { id: 'swpc-south', name: 'NOAA SWPC Aurora / GNSS South', lat: -65, lng: 135, kp, level, color: spaceWeather.storm_color || '#D4AF37' },
  ];
}

// --- Hooks ---
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w < 768 || (h < 500 && w < 1024));
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}

// --- Clock Components ---
const UptimeClock = () => {
  const [uptime, setUptime] = useState('00:00:00');
  const startTime = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - startTime.current) / 1000);
      setUptime(
        `${String(Math.floor(e / 3600)).padStart(2, '0')}:${String(
          Math.floor((e % 3600) / 60)
        ).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="hidden lg:inline">
      UPTIME: <span className="text-[var(--gold-primary)]">{uptime}</span>
    </span>
  );
};

const ZuluClock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date();
      setTime(
        `ZULU ${String(now.getUTCHours()).padStart(2, '0')}:${String(
          now.getUTCMinutes()
        ).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}Z`
      );
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="text-[var(--cyan-primary)] font-bold tabular-nums">
      {time || 'ZULU --:--:--Z'}
    </span>
  );
};

const DataThroughput = () => {
  const [throughput, setThroughput] = useState('0.0');
  useEffect(() => {
    const iv = setInterval(() => {
      setThroughput((1.2 + Math.random() * 3.6).toFixed(1));
    }, 2500);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="text-[var(--alert-green)] font-bold tabular-nums">
      {throughput} MB/s
    </span>
  );
};

// --- Main Component ---
export default function Dashboard() {
  const dataRef = useRef<any>({});
  const [, setDataVersion] = useState(0);
  const data = dataRef.current;

  // --- State ---
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [mapView, setMapView] = useState({ zoom: 2.5, latitude: 20, longitude: 0 });
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [regionDossier, setRegionDossier] = useState<any>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [activeCamera, setActiveCamera] = useState<any>(null);
  const [spaceWeather, setSpaceWeather] = useState<any>(null);
  const [showLayers, setShowLayers] = useState(true);
  const [showMarkets, setShowMarkets] = useState(true);
  const [showIntel, setShowIntel] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'layers' | 'markets' | 'intel' | 'search' | 'recon' | 'aip' | 'ops' | 'lab' | 'sources' | null>(null);
  const [desktopTool, setDesktopTool] = useState<'layers' | 'foundry' | 'mission' | 'aip' | 'recon' | 'ops' | 'lab' | 'sources' | 'markets' | 'intel' | 'search' | 'alerts' | 'cyber' | 'darkweb' | 'playbooks' | 'osint'>('layers');
  const [mapProjection, setMapProjection] = useState<'globe' | 'mercator'>('globe');
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');
  const [sweepData, setSweepData] = useState<any>(null);
  const [scanTargets, setScanTargets] = useState<any[]>([]);
  const [liveFeedUrl, setLiveFeedUrl] = useState<string | null>(null);
  const [liveFeedName, setLiveFeedName] = useState('');
  const [liveFeedEmbedAllowed, setLiveFeedEmbedAllowed] = useState(true);

  const isMobile = useIsMobile();
  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);

  // --- Layer State ---
  const [activeLayers, setActiveLayers] = useState({
    flights: false,
    private: false,
    jets: false,
    military: false,
    tankers_isr: false,
    frontlines: false,
    mil_conflict_events: false,
    naval_bases: false,
    satellite_scenes: false,
    sar_watch: false,
    optical_watch: false,
    maritime: true,
    maritime_dark_activity: false,
    satellites: false,
    balloons: false,
    cctv: true,
    live_news: true,
    news_intel: true,
    earthquakes: true,
    fires: false,
    weather: false,
    air_quality: false,
    disaster_ops: false,
    radiation: false,
    infrastructure: false,
    global_incidents: true,
    conflict_zones: true,
    country_risk: false,
    cyber_geo: false,
    port_congestion: false,
    risk_heatmap: false,
    space_weather_layer: false,
    osm_critical: false,
    war_alerts: false,
    gps_jamming: false,
    day_night: true,
  });

  // --- Effects ---
  // Splash screen
  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  // URL state: parse on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const lat = parseFloat(p.get('lat') || '');
    const lon = parseFloat(p.get('lon') || '');
    const zoom = parseFloat(p.get('zoom') || '');
    if (!isNaN(lat) && !isNaN(lon)) {
      setFlyToLocation({ lat, lng: lon, ts: Date.now() });
      if (!isNaN(zoom)) setMapView((v) => ({ ...v, zoom }));
    }
    const layers = p.get('layers');
    if (layers) {
      const active = layers.split(',');
      setActiveLayers((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          (next as any)[k] = active.includes(k);
        });
        return next;
      });
    }
  }, []);

  // URL state: update URL on view change (debounced)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('lat', (mouseCoords?.lat ?? mapView.latitude ?? 20).toFixed(4));
      p.set('lon', (mouseCoords?.lng ?? mapView.longitude ?? 0).toFixed(4));
      p.set('zoom', mapView.zoom.toFixed(2));
      const active = Object.entries(activeLayers)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',');
      p.set('layers', active);
      const url = `${window.location.pathname}?${p.toString()}`;
      window.history.replaceState(null, '', url);
    }, 1500);
  }, [mapView, activeLayers, mouseCoords]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName)) return;
      if (e.key === 'f' && !e.ctrlKey) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        setIsFullscreen(!!document.fullscreenElement);
      }
      if (e.key === 'l') setShowLayers((p) => !p);
      if (e.key === 'm') setShowMarkets((p) => !p);
      if (e.key === 'i') setShowIntel((p) => !p);
      if (e.key === 'r') setFlyToLocation({ lat: 20, lng: 0, ts: Date.now() });
      if (e.key === 'g') setMapProjection((p) => (p === 'globe' ? 'mercator' : 'globe'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Mouse coords + reverse geocode
  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    setMouseCoords(coords);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d =
          Math.abs(coords.lat - lastGeocodedPos.current.lat) +
          Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.5) return;
      }
      const gk = `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`;
      if (geocodeCache.current.has(gk)) {
        setLocationLabel(geocodeCache.current.get(gk)!);
        lastGeocodedPos.current = coords;
        return;
      }
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (res.ok) {
          const d = await res.json();
          const a = d.address || {};
          const label = [a.city || a.town || a.village || a.county, a.state || a.region, a.country]
            .filter(Boolean)
            .join(', ') || 'Unknown';
          if (geocodeCache.current.size > 500) {
            const it = geocodeCache.current.keys();
            for (let i = 0; i < 100; i++) {
              const k = it.next().value;
              if (k) geocodeCache.current.delete(k);
            }
          }
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e) {
        console.warn('[Pandora] Suppressed error:', e instanceof Error ? e.message : e);
      }
    }, 3000);
  }, []);

  // Region dossier (right-click)
  const handleRightClick = useCallback(async (coords: { lat: number; lng: number }) => {
    setDossierLoading(true);
    setRegionDossier(null);
    try {
      const res = await fetch(`/api/region-dossier?lat=${coords.lat}&lng=${coords.lng}`);
      if (res.ok) setRegionDossier(await res.json());
    } catch (e) {
      console.warn('[Pandora] Suppressed error:', e instanceof Error ? e.message : e);
    } finally {
      setDossierLoading(false);
    }
  }, []);

  // Entity click handler
  const handleEntityClick = useCallback((entity: any) => {
    if (entity?.type === 'cctv') setActiveCamera(entity);
    if (entity?.type === 'live_news' && entity.url) {
      setLiveFeedUrl(entity.url);
      setLiveFeedName(entity.name);
      setLiveFeedEmbedAllowed(entity.embed_allowed !== false);
    }
  }, []);

  // Shared fetch utility
  const fetchEndpoint = useCallback(
    async (url: string, transform?: (d: any) => any, options?: RequestInit) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(url, options);
        if (res.ok) {
          const json = await res.json();
          const d = transform ? transform(json) : json;
          dataRef.current = { ...dataRef.current, ...d };
          setDataVersion((v) => v + 1);
          setBackendStatus('connected');
        }
      } catch (e) {
        console.warn('[Pandora] Suppressed error:', e instanceof Error ? e.message : e);
        setBackendStatus('error');
      }
    },
    []
  );

  // Progressive data loading
  useEffect(() => {
    fetchEndpoint('/api/earthquakes');
    fetchEndpoint('/api/news');
    const marketTimer = setTimeout(() => fetchEndpoint('/api/markets', (d) => ({ markets: d })), 800);

    const spaceTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/space-weather');
        if (r.ok) setSpaceWeather(await r.json());
      } catch (e) {
        console.warn('[Pandora] Suppressed error:', e instanceof Error ? e.message : e);
      }
    }, 5000);

    const intervals = [
      setInterval(() => fetchEndpoint('/api/earthquakes'), 900000),
      setInterval(() => fetchEndpoint('/api/news'), 1800000),
      setInterval(() => fetchEndpoint('/api/markets', (d) => ({ markets: d })), 900000),
    ];
    return () => {
      clearTimeout(marketTimer);
      clearTimeout(spaceTimer);
      intervals.forEach(clearInterval);
    };
  }, [fetchEndpoint]);

  // Layer-aware data loading
  const layerFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeLayers.flights || activeLayers.military || activeLayers.tankers_isr || activeLayers.jets || activeLayers.private) {
      if (!layerFetchedRef.current.has('flights')) {
        fetchEndpoint('/api/flights', (d) => ({ ...d, tankers_isr: deriveTankersIsr(d.military_flights || []) }));
        layerFetchedRef.current.add('flights');
      }
    }
    if (activeLayers.satellites && !layerFetchedRef.current.has('satellites')) {
      fetchEndpoint('/api/satellites');
      layerFetchedRef.current.add('satellites');
    }
    if (activeLayers.fires && !layerFetchedRef.current.has('fires')) {
      fetchEndpoint('/api/fires');
      layerFetchedRef.current.add('fires');
    }
    if (activeLayers.cctv && !layerFetchedRef.current.has('cctv')) {
      fetchEndpoint('/api/cctv?region=all');
      layerFetchedRef.current.add('cctv');
    }
    if ((activeLayers.maritime || activeLayers.maritime_dark_activity || activeLayers.naval_bases || activeLayers.port_congestion || activeLayers.risk_heatmap) && !layerFetchedRef.current.has('maritime')) {
      fetchEndpoint('/api/maritime', (d) => ({
        maritime_ports: d.ports,
        maritime_chokepoints: d.chokepoints,
        maritime_ships: d.ships,
        maritime_dark_activity_api: d.dark_activity || [],
        dark_vessels: d.dark_vessels || [],
        naval_bases: (d.ports || []).filter((p: any) => p.type === 'naval'),
      }));
      layerFetchedRef.current.add('maritime');
    }
    if (activeLayers.balloons && !layerFetchedRef.current.has('balloons')) {
      fetchEndpoint('/api/balloons', (d) => ({ balloons: d.balloons }));
      layerFetchedRef.current.add('balloons');
    }
    if (activeLayers.radiation && !layerFetchedRef.current.has('radiation')) {
      fetchEndpoint('/api/radiation', (d) => ({ radiation: d.stations }));
      layerFetchedRef.current.add('radiation');
    }
    if (activeLayers.live_news && !layerFetchedRef.current.has('live_news')) {
      fetchEndpoint('/api/live-news', (d) => ({ live_feeds: d.feeds }));
      layerFetchedRef.current.add('live_news');
    }
    if (activeLayers.weather && !layerFetchedRef.current.has('weather')) {
      fetchEndpoint('/api/weather', (d) => ({ weather_events: d.events }));
      layerFetchedRef.current.add('weather');
    }
    if (activeLayers.air_quality && !layerFetchedRef.current.has('air_quality')) {
      fetchEndpoint('/api/air-quality', (d) => ({ air_quality: d.stations || [] }));
      layerFetchedRef.current.add('air_quality');
    }
    if (activeLayers.country_risk && !layerFetchedRef.current.has('country_risk')) {
      fetchEndpoint('/api/country-risk-geo', (d) => ({ country_risk: d.countries || [] }));
      layerFetchedRef.current.add('country_risk');
    }
    if (activeLayers.cyber_geo && !layerFetchedRef.current.has('cyber_geo')) {
      fetchEndpoint('/api/cyber-geo', (d) => ({ cyber_geo_threats: d.threats || [] }));
      layerFetchedRef.current.add('cyber_geo');
    }
    if (activeLayers.osm_critical && !layerFetchedRef.current.has('osm_critical')) {
      const lat = Number.isFinite(mapView.latitude) ? mapView.latitude : 48.8566;
      const lng = Number.isFinite(mapView.longitude) ? mapView.longitude : 2.3522;
      fetchEndpoint(`/api/osm-critical?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius=50000`, (d) => ({ osm_critical: d.facilities || [] }));
      layerFetchedRef.current.add('osm_critical');
    }
    if (activeLayers.infrastructure && !layerFetchedRef.current.has('infrastructure')) {
      fetchEndpoint('/api/infrastructure', (d) => ({ infrastructure: d.infrastructure }));
      layerFetchedRef.current.add('infrastructure');
    }
    if ((activeLayers.global_incidents || activeLayers.mil_conflict_events) && !layerFetchedRef.current.has('gdelt')) {
      fetchEndpoint('/api/gdelt', (d) => ({ gdelt: d.events, military_events: deriveMilitaryEvents(d.events || []) }));
      layerFetchedRef.current.add('gdelt');
    }
    if (activeLayers.frontlines && !layerFetchedRef.current.has('frontlines')) {
      fetchEndpoint('/api/frontlines', (d) => ({ frontlines: d.frontlines ? [d.frontlines] : [] }));
      layerFetchedRef.current.add('frontlines');
    }
    if ((activeLayers.satellite_scenes || activeLayers.sar_watch || activeLayers.optical_watch) && !layerFetchedRef.current.has('sentinel')) {
      const lat = Number.isFinite(mapView.latitude) ? mapView.latitude : 20;
      const lng = Number.isFinite(mapView.longitude) ? mapView.longitude : 0;
      fetchEndpoint(`/api/sentinel?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius=3&days=30`, (d) => deriveSentinelBuckets(d.scenes || []));
      layerFetchedRef.current.add('sentinel');
    }
  }, [activeLayers, fetchEndpoint, mapView.latitude, mapView.longitude]);

  useEffect(() => {
    const next: any = {};
    if (activeLayers.disaster_ops) next.disaster_ops = deriveDisasterOps(data.weather_events || [], data.fires || [], data.earthquakes || []);
    else next.disaster_ops = [];
    if (activeLayers.port_congestion) next.port_congestion = derivePortCongestion(data.maritime_ports || [], data.maritime_ships || []);
    else next.port_congestion = [];
    if (activeLayers.maritime_dark_activity) next.maritime_dark_activity = [
      ...(data.maritime_dark_activity_api || []),
      ...deriveMaritimeDarkActivity(data.maritime_ships || [], data.maritime_ports || [], data.maritime_chokepoints || []),
    ];
    else next.maritime_dark_activity = [];
    if (activeLayers.risk_heatmap) next.risk_heatmap = deriveRiskHeatmap({ ...data, ...next });
    else next.risk_heatmap = [];
    if (activeLayers.space_weather_layer) next.space_weather_points = deriveSpaceWeatherPoints(spaceWeather);
    else next.space_weather_points = [];
    dataRef.current = { ...dataRef.current, ...next };
    setDataVersion((v) => v + 1);
  }, [activeLayers.disaster_ops, activeLayers.port_congestion, activeLayers.maritime_dark_activity, activeLayers.risk_heatmap, activeLayers.space_weather_layer, data.weather_events, data.fires, data.earthquakes, data.gdelt, data.military_events, data.cyber_geo_threats, data.military_flights, data.tankers_isr, data.infrastructure, data.maritime_ports, data.maritime_chokepoints, data.maritime_ships, data.maritime_dark_activity_api, spaceWeather]);

  // Layer-aware polling
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    if (activeLayers.flights || activeLayers.military || activeLayers.tankers_isr || activeLayers.jets || activeLayers.private) {
      intervals.push(setInterval(() => fetchEndpoint('/api/flights', (d) => ({ ...d, tankers_isr: deriveTankersIsr(d.military_flights || []) })), 300000));
    }
    if (activeLayers.balloons) {
      intervals.push(
        setInterval(() => fetchEndpoint('/api/balloons', (d) => ({ balloons: d.balloons })), 300000)
      );
    }
    if (activeLayers.radiation) {
      intervals.push(
        setInterval(() => fetchEndpoint('/api/radiation', (d) => ({ radiation: d.stations })), 300000)
      );
    }
    if (activeLayers.maritime || activeLayers.maritime_dark_activity || activeLayers.naval_bases || activeLayers.port_congestion || activeLayers.risk_heatmap) {
      intervals.push(
        setInterval(
          () => fetchEndpoint('/api/maritime', (d) => ({
            maritime_ports: d.ports,
            maritime_chokepoints: d.chokepoints,
            maritime_ships: d.ships,
            maritime_dark_activity_api: d.dark_activity || [],
            dark_vessels: d.dark_vessels || [],
            naval_bases: (d.ports || []).filter((p: any) => p.type === 'naval'),
          })),
          60000
        )
      );
    }
    return () => intervals.forEach(clearInterval);
  }, [activeLayers, fetchEndpoint]);

  // --- Memoized Values ---
  const totalFlights = useMemo(
    () =>
      (data.commercial_flights?.length || 0) +
      (data.private_flights?.length || 0) +
      (data.private_jets?.length || 0) +
      (data.military_flights?.length || 0),
    [data.commercial_flights, data.private_flights, data.private_jets, data.military_flights]
  );

  const activeFeedCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);
  const totalFeedCount = useMemo(() => Object.keys(activeLayers).length, [activeLayers]);

  const fusionModel = useMemo(() => buildFusionModel(data), [data]);

  // --- Render ---
  return (
    <main className="fixed inset-0 w-full h-full bg-[var(--bg-void)] overflow-hidden">
      {/* ===================================================================
         SPLASH SCREEN — PANDORA ATLAS
         =================================================================== */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="product-splash absolute inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(26, 36, 55, 0.92) 0%, var(--bg-void) 72%)',
            }}
          >
            {/* Scanline CRT overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-[1]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(191,164,106,0.015) 2px, rgba(191,164,106,0.015) 4px)',
                animation: 'splashScanDrift 8s linear infinite',
              }}
            />

            {/* Version badge */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="absolute top-6 left-6 z-[2] font-mono text-[10px] tracking-[0.3em] text-[var(--gold-primary)]"
            >
              V4.2
            </motion.div>

            {/* Geometric tactical logo */}
            <div className="product-mark relative w-40 h-40 mb-8 flex items-center justify-center z-[2]">
              {/* Outer ring */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{
                  opacity: { duration: 0.6 },
                  scale: { duration: 0.8, ease: 'easeOut' },
                  rotate: { duration: 20, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(191,164,106,0.2)' }}
              >
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                  style={{
                    background: 'var(--gold-primary)',
                    boxShadow: '0 0 12px var(--gold-primary), 0 0 24px rgba(191,164,106,0.3)',
                  }}
                />
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'rgba(191,164,106,0.5)', boxShadow: '0 0 6px rgba(191,164,106,0.3)' }}
                />
              </motion.div>

              {/* Middle ring */}
              <motion.div
                initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{
                  opacity: { duration: 0.6, delay: 0.15 },
                  scale: { duration: 0.8, delay: 0.15, ease: 'easeOut' },
                  rotate: { duration: 12, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute rounded-full"
                style={{ inset: '18px', border: '1px solid rgba(143,167,160,0.15)' }}
              >
                <div
                  className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'var(--cyan-primary)',
                    boxShadow: '0 0 10px var(--cyan-primary), 0 0 20px rgba(143,167,160,0.2)',
                  }}
                />
                <div
                  className="absolute bottom-0 left-1/4 translate-y-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'rgba(143,167,160,0.4)' }}
                />
              </motion.div>

              {/* Inner ring */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{
                  opacity: { duration: 0.6, delay: 0.3 },
                  scale: { duration: 0.8, delay: 0.3, ease: 'easeOut' },
                  rotate: { duration: 7, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute rounded-full"
                style={{ inset: '40px', border: '1px solid rgba(191,164,106,0.25)' }}
              >
                <div
                  className="absolute top-0 left-1/4 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }}
                />
              </motion.div>

              {/* Core circle + crosshair */}
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  border: '2px solid var(--gold-primary)',
                  boxShadow:
                    '0 0 20px rgba(191,164,106,0.15), inset 0 0 20px rgba(191,164,106,0.05)',
                }}
              >
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-5 h-5 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(191,164,106,0.4) 0%, rgba(191,164,106,0.05) 70%)',
                  }}
                />
                <div
                  className="absolute w-[1px] h-full"
                  style={{
                    background:
                      'linear-gradient(to bottom, transparent, rgba(191,164,106,0.3), transparent)',
                  }}
                />
                <div
                  className="absolute w-full h-[1px]"
                  style={{
                    background:
                      'linear-gradient(to right, transparent, rgba(191,164,106,0.3), transparent)',
                  }}
                />
              </motion.div>

              {/* Radar sweep */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.15, 0], rotate: [0, 360] }}
                transition={{
                  opacity: { duration: 3, repeat: Infinity },
                  rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
                  delay: 0.6,
                }}
                className="absolute inset-[10px] rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0deg, rgba(191,164,106,0.15) 40deg, transparent 80deg)',
                }}
              />
            </div>

            {/* Title: PANDORA */}
            <div className="flex items-center gap-[2px] mb-3 z-[2]">
              {'PANDORA'.split('').map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                  className="text-4xl md:text-5xl font-bold tracking-[0.5em] font-mono"
                  style={{
                    color: 'var(--text-heading)',
                    textShadow: '0 0 30px rgba(191,164,106,0.2)',
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>

            {/* Subtitle: SOVEREIGN ATLAS SYSTEM */}
            <div className="overflow-hidden mb-8 z-[2]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.2, duration: 0.8, ease: 'easeInOut' }}
                className="overflow-hidden whitespace-nowrap"
              >
                <p className="text-[10px] md:text-[11px] font-mono tracking-[0.5em] text-[var(--gold-primary)]">
                  OPERATIONS INTELLIGENCE PLATFORM
                </p>
              </motion.div>
            </div>

            {/* Progress bar */}
            <div className="w-64 md:w-80 z-[2]">
              <div
                className="relative w-full h-[2px] rounded-full overflow-hidden"
                style={{ background: 'rgba(191,164,106,0.1)' }}
              >
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: ['0%', '25%', '50%', '78%', '100%'] }}
                  transition={{
                    duration: 2.2,
                    delay: 0.5,
                    times: [0, 0.25, 0.5, 0.75, 1],
                    ease: 'easeInOut',
                  }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, var(--gold-primary), var(--cyan-primary), var(--gold-primary))',
                    boxShadow: '0 0 12px rgba(191,164,106,0.4)',
                  }}
                />
              </div>
              <div className="mt-3 h-4 flex items-center justify-center">
                {[
                  { text: 'LOADING ATLAS WORKSPACE...', delay: 0.5 },
                  { text: 'SYNCING PUBLIC DATA SOURCES...', delay: 1.1 },
                  { text: 'PREPARING OPERATIONAL VIEW...', delay: 1.7 },
                  { text: 'WORKSPACE READY', delay: 2.2 },
                ].map((stage, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0] }}
                    transition={{
                      delay: stage.delay,
                      duration: 0.6,
                      times: [0, 0.1, 0.7, 1],
                    }}
                    className="absolute text-[9px] font-mono tracking-[0.25em]"
                    style={{
                      color: i === 3 ? 'var(--cyan-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {stage.text}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Decorative grid lines */}
            <div
              className="absolute inset-0 pointer-events-none z-[0]"
              style={{ opacity: 0.03 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(191,164,106,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(191,164,106,0.5) 1px, transparent 1px)',
                  backgroundSize: '60px 60px',
                }}
              />
            </div>

            {/* Corner frame accents */}
            {[
              { t: '10px', l: '10px', bw: '2px 0 0 2px' },
              { t: '10px', r: '10px', bw: '2px 2px 0 0' },
              { b: '10px', l: '10px', bw: '0 0 2px 2px' },
              { b: '10px', r: '10px', bw: '0 2px 2px 0' },
            ].map((pos, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                className="absolute w-8 h-8 z-[2]"
                style={{
                  top: pos.t,
                  bottom: pos.b,
                  left: pos.l,
                  right: pos.r,
                  borderWidth: pos.bw,
                  borderStyle: 'solid',
                  borderColor: 'var(--gold-primary)',
                }}
              />
            ))}

            {/* Inline keyframe for scanline drift */}
            <style jsx>{`
              @keyframes splashScanDrift {
                0% { background-position: 0 0; }
                100% { background-position: 0 100vh; }
              }
              @keyframes hud-scanline {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================================
         MAP
         =================================================================== */}
      <ErrorBoundary name="Map">
        <PandoraMap
          data={data}
          activeLayers={activeLayers}
          projection={mapProjection}
          mapStyle={
            mapStyle === 'satellite'
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              : 'dark'
          }
          onEntityClick={handleEntityClick}
          onMouseCoords={handleMouseCoords}
          onRightClick={handleRightClick}
          onViewStateChange={setMapView}
          flyToLocation={flyToLocation}
          sweepData={sweepData}
          scanTargets={scanTargets}
          fusionHotspots={fusionModel.hotspots}
        />
      </ErrorBoundary>

      {/* ===================================================================
         MAP VIEW CONTROLS (3D/2D + SATELLITE TOGGLE)
         =================================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.5 }}
        className="map-view-controls absolute bottom-[75px] md:bottom-6 left-3 md:left-[315px] z-[200] flex items-center gap-2 pointer-events-none"
      >
        <button
          onClick={() => setMapProjection((p) => (p === 'globe' ? 'mercator' : 'globe'))}
          className="glass-panel p-2.5 pointer-events-auto hover:border-[var(--gold-primary)]/40 transition-colors group relative"
          title={mapProjection === 'globe' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
        >
          {mapProjection === 'globe' ? (
            <MapPinned className="w-4 h-4 text-[var(--gold-primary)] group-hover:scale-110 transition-transform" />
          ) : (
            <Globe className="w-4 h-4 text-[var(--cyan-primary)] group-hover:scale-110 transition-transform" />
          )}
          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--text-muted)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity glass-panel px-2 py-1 z-[300]">
            {mapProjection === 'globe' ? '2D MAP' : '3D GLOBE'}
          </span>
        </button>

        <button
          onClick={() => setMapStyle((s) => (s === 'dark' ? 'satellite' : 'dark'))}
          className="glass-panel p-2.5 pointer-events-auto hover:border-[var(--gold-primary)]/40 transition-colors group relative"
          title={mapStyle === 'dark' ? 'Satellite View' : 'Night View'}
        >
          {mapStyle === 'dark' ? (
            <Satellite className="w-4 h-4 text-[var(--alert-green)] group-hover:scale-110 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--cyan-primary)] group-hover:scale-110 transition-transform" />
          )}
          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--text-muted)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity glass-panel px-2 py-1 z-[300]">
            {mapStyle === 'dark' ? 'SATELLITE' : 'NIGHT MODE'}
          </span>
        </button>
      </motion.div>

      {/* ===================================================================
         HEADER — PANDORA ATLAS
         =================================================================== */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 2.5 }}
        className={`app-header absolute top-3 left-3 md:top-5 md:left-5 z-[200] pointer-events-none flex items-center gap-2 md:gap-3`}
      >
        <div className="pandora-product-logo w-7 h-7 md:w-9 md:h-9 flex items-center justify-center relative">
          {/* Ambient glow ring */}
          <div
            className="absolute inset-[-4px] md:inset-[-5px] rounded-full border border-[var(--gold-primary)]/20"
            style={{ animation: 'pandora-rotate 12s linear infinite' }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[var(--gold-primary)] shadow-[0_0_6px_var(--gold-primary)]"
            />
          </div>
          <div
            className="absolute inset-[-8px] md:inset-[-10px] rounded-full border border-[var(--gold-primary)]/10"
            style={{ animation: 'pandora-rotate 20s linear infinite reverse' }}
          >
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-0.5 h-0.5 rounded-full bg-[var(--gold-primary)]/60"
            />
          </div>
          <div className="w-5 h-5 md:w-7 md:h-7 rounded-full border-2 border-[var(--gold-primary)] flex items-center justify-center animate-glow-pulse">
            <div className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-[var(--gold-primary)]/30 border border-[var(--gold-primary)]/60" />
          </div>
          <div className="absolute w-[1px] h-full bg-[var(--gold-primary)]/30" />
          <div className="absolute w-full h-[1px] bg-[var(--gold-primary)]/30" />
        </div>
        {/* Horizontal rule */}
        <div className="hidden md:block absolute top-1/2 left-[52px] w-[200px] h-[1px] bg-gradient-to-r from-[var(--gold-primary)]/40 via-[var(--gold-primary)]/15 to-transparent" />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-base md:text-xl font-bold tracking-[0.4em] md:tracking-[0.5em] text-[var(--text-heading)] font-mono">
              Pandora Atlas
            </h1>
            <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm border border-[var(--cyan-primary)]/40 bg-[var(--cyan-primary)]/10 text-[7px] font-mono font-bold tracking-[0.15em] text-[var(--cyan-primary)] uppercase">
              <Globe className="w-2.5 h-2.5" />
              OPEN SOURCE
            </span>
            <span className="hidden xl:inline-flex gotham-tag gotham-tag--info">ATLAS MODE</span>
          </div>
          <span className="text-[8px] md:text-[9px] text-[var(--gold-primary)] font-mono tracking-[0.2em] md:tracking-[0.3em] opacity-80">
            GLOBAL SITUATIONAL ATLAS
          </span>
        </div>
      </motion.div>

      {/* ===================================================================
         TOP-RIGHT STATUS (desktop) — C2 DISPLAY
         =================================================================== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3 }}
        className="app-status status-bar-desktop absolute top-3 right-3 md:top-4 md:right-5 z-[200] pointer-events-none flex items-center gap-1.5 md:gap-3 text-[9px] md:text-[10px] font-mono tracking-widest text-[var(--text-muted)]"
      >
        <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-[var(--border-primary)] bg-black/30">
          <ZuluClock />
        </span>
        <span className="hidden lg:inline text-[var(--border-primary)]">│</span>
        <span className="flex items-center gap-1">
          SYS: <span className={backendStatus === 'connected' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}>{backendStatus.toUpperCase()}</span>
        </span>
        {spaceWeather && (
          <span className="hidden lg:inline">
            SOLAR: <span style={{ color: spaceWeather.storm_color, fontWeight: 700 }}>Kp{spaceWeather.kp_index}</span>
          </span>
        )}
        <span className="hidden lg:inline-flex items-center gap-1">
          <Wifi className="w-3 h-3 text-[var(--cyan-primary)]" />
          <span className="text-[var(--cyan-primary)] font-bold">{activeFeedCount}/{totalFeedCount}</span>
          <span className="text-[var(--text-muted)]/60">FEEDS</span>
        </span>
        <UptimeClock />
        <a
          href="https://ko-fi.com/M8D41ZYW4Z"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto hover:opacity-80 transition-opacity ml-1 flex items-center"
        >

        </a>
      </motion.div>

      {/* ===================================================================
         MOBILE: Compact top status
         =================================================================== */}
      {isMobile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-2"
        >
          <a
            href="https://ko-fi.com/M8D41ZYW4Z"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-panel px-2 py-1 flex items-center gap-1.5 text-[7px] font-mono tracking-widest hover:opacity-80 transition-opacity border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10"
          >
            <div className="w-1 h-1 rounded-full bg-[var(--gold-primary)] animate-pandora-pulse" />
          </a>
        </motion.div>
      )}

      {/* ===================================================================
         DESKTOP TOOL RAIL — one focused workspace at a time
         =================================================================== */}
      {!isMobile && (
        <>
          <nav className="tool-rail desktop-only" aria-label="Pandora tools">
            {[
              { id: 'layers' as const, icon: Layers, label: 'Layers' },
              { id: 'foundry' as const, icon: Database, label: 'Foundry' },
              { id: 'mission' as const, icon: Activity, label: 'Mission' },
              { id: 'aip' as const, icon: Brain, label: 'Analyst' },
              { id: 'recon' as const, icon: Radar, label: 'Recon' },
              { id: 'ops' as const, icon: MapPinned, label: 'Ops' },
              { id: 'lab' as const, icon: Satellite, label: 'Lab' },
              { id: 'sources' as const, icon: Globe, label: 'Sources' },
              { id: 'markets' as const, icon: BarChart3, label: 'Markets' },
              { id: 'intel' as const, icon: Newspaper, label: 'Intel' },
              { id: 'search' as const, icon: Search, label: 'Search' },
              { id: 'alerts' as const, icon: AlertTriangle, label: 'Alerts' },
              { id: 'cyber' as const, icon: Shield, label: 'Cyber' },
              { id: 'darkweb' as const, icon: EyeOff, label: 'Dark Web' },
              { id: 'playbooks' as const, icon: BookOpen, label: 'Playbooks' },
              { id: 'osint' as const, icon: Search, label: 'OSINT' },
            ].map((tool) => {
            const Icon = tool.icon;
            return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setDesktopTool(tool.id)}
                  className={`tool-rail-button ${desktopTool === tool.id ? 'active' : ''}`}
                  title={tool.label}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section
              key={desktopTool}
              initial={{ opacity: 0, x: -12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="tool-workspace desktop-only glass-panel styled-scrollbar"
            >
              <div className="tool-workspace-header">
                <div>
                  <span className="hud-label">PANDORA WORKSPACE</span>
                  <h2>
                    {desktopTool === 'layers'
                      ? 'Data Layers'
                      : desktopTool === 'cyber'
                      ? 'Cyber Threat Radar'
                      : desktopTool === 'darkweb'
                      ? 'Dark Web Monitor'
                      : desktopTool === 'playbooks'
                      ? 'Recon Playbooks'
                      : desktopTool === 'osint'
                      ? 'OSINT Automation Hub'
                      : desktopTool === 'foundry'
                      ? 'Data Foundry'
                      : desktopTool === 'mission'
                      ? 'Mission Control'
                      : desktopTool === 'aip'
                      ? 'Analyst Copilot'
                      : desktopTool === 'recon'
                      ? 'Recon Toolkit'
                      : desktopTool === 'ops'
                      ? 'Command Deck'
                      : desktopTool === 'lab'
                      ? 'Innovation Lab'
                      : desktopTool === 'sources'
                      ? 'Public Intel Catalog'
                      : desktopTool === 'markets'
                      ? 'Markets & Intel'
                      : desktopTool === 'intel'
                      ? 'Intel Feed'
                      : desktopTool === 'search'
                      ? 'Locate & Share'
                      : 'Live Alerts'}
                  </h2>
                </div>
                <span className="gotham-tag gotham-tag--info">
                  {activeFeedCount}/{totalFeedCount} FEEDS
                </span>
              </div>

              <div className="tool-workspace-body">
                {desktopTool === 'layers' && (
                  <div className="space-y-3">
                    <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} />
                    <motion.div className="glass-panel-sm px-3 py-2.5 pointer-events-auto">
                      <div className="grid grid-cols-5 gap-2 text-center">
                        <div><div className="hud-label">AIR</div><div className="hud-value text-[10px]">{totalFlights.toLocaleString()}</div></div>
                        <div><div className="hud-label">SAT</div><div className="hud-value text-[10px]">{(data.satellites?.length || 0).toLocaleString()}</div></div>
                        <div><div className="hud-label">CCTV</div><div className="hud-value text-[10px]">{(data.cameras?.length || 0).toLocaleString()}</div></div>
                        <div><div className="hud-label">WX</div><div className="hud-value text-[10px]">{(data.weather_events?.length || 0)}</div></div>
                        <div><div className="hud-label">NUC</div><div className="hud-value text-[10px]">{(data.infrastructure?.length || 0)}</div></div>
                      </div>
                    </motion.div>
                    <ViewPresets onNavigate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMapView((v) => ({ ...v, zoom })); }} />
                  </div>
                )}

                {desktopTool === 'foundry' && <DataFoundryPanel data={data} activeLayers={activeLayers} />}
                {desktopTool === 'mission' && <MissionControlPanel data={data} activeLayers={activeLayers} backendStatus={backendStatus} mapView={mapView} />}
                {desktopTool === 'aip' && <AipFusionPanel model={fusionModel} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />}
                {desktopTool === 'recon' && (
                  <OsintPanel
                    onSweepVisualize={setSweepData}
                    onScanGeolocate={(target, data) => {
                      setScanTargets((prev) => {
                        const existing = prev.filter((t) => t.id !== target);
                        return [{ id: target, timestamp: Date.now(), ...data }, ...existing].slice(0, 10);
                      });
                      setFlyToLocation({ lat: data.lat, lng: data.lng, ts: Date.now() });
                    }}
                  />
                )}
                {desktopTool === 'ops' && <AdvancedOpsPanel model={fusionModel} mouseCoords={mouseCoords} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />}
                {desktopTool === 'lab' && <InnovationLabPanel model={fusionModel} onOpenAip={() => setDesktopTool('aip')} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />}
                {desktopTool === 'sources' && <PublicIntelCatalogPanel />}
                {desktopTool === 'markets' && <MarketsPanel data={data} spaceWeather={spaceWeather} />}
                {desktopTool === 'intel' && <IntelFeed data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />}
                {desktopTool === 'search' && (
                  <div className="space-y-3">
                    <SearchBar onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />
                    <SharePanel mapView={mapView} activeLayers={activeLayers} mouseCoords={mouseCoords} />
                  </div>
                )}
                {desktopTool === 'alerts' && <LiveAlerts data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} onWatchFeed={(url, name, embedAllowed = true) => { setLiveFeedUrl(url); setLiveFeedName(name); setLiveFeedEmbedAllowed(embedAllowed); }} />}
                {desktopTool === 'cyber' && <CyberThreatRadar />}
                {desktopTool === 'darkweb' && <DarkWebMonitor />}
                {desktopTool === 'playbooks' && <ReconPlaybooks />}
                {desktopTool === 'osint' && <OSINTHub />}
              </div>
            </motion.section>
          </AnimatePresence>
        </>
      )}

      {/* ===================================================================
         LIVE FEED VIEWER OVERLAY
         =================================================================== */}
      <AnimatePresence>
        {liveFeedUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setLiveFeedUrl(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-[90vw] max-w-[900px] flex flex-col relative rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-2xl bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#C65D4E] animate-pandora-pulse" />
                  <span className="text-[12px] font-mono font-bold text-white tracking-wider">{liveFeedName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono text-[9px] font-bold">
                    LIVE STREAM
                  </span>
                  {!liveFeedEmbedAllowed && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono text-[9px]">
                      EXTERNAL ONLY
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={
                      liveFeedUrl.includes('channel=')
                        ? `https://www.youtube.com/channel/${liveFeedUrl.split('channel=')[1].split('&')[0]}/live`
                        : liveFeedUrl.includes('/embed/')
                        ? `https://www.youtube.com/watch?v=${liveFeedUrl.split('/embed/')[1].split('?')[0]}`
                        : liveFeedUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--border-primary)] hover:bg-[var(--gold-primary)] hover:text-black text-white transition-colors text-[11px] font-mono"
                  >
                    <span>Open in YouTube</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => setLiveFeedUrl(null)}
                    className="text-white/70 hover:text-white transition-colors p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body — iframe or external card */}
              {liveFeedEmbedAllowed ? (
                <div className="w-full aspect-video relative bg-black">
                  <iframe
                    src={liveFeedUrl}
                    className="w-full h-full absolute inset-0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="w-full aspect-video flex items-center justify-center bg-black/95">
                  <div className="text-center px-8">
                    <div className="w-14 h-14 rounded-full bg-[#7FA276]/10 border border-[#7FA276]/20 flex items-center justify-center mx-auto mb-4">
                      <ExternalLink className="w-6 h-6 text-[#7FA276]" />
                    </div>
                    <p className="text-[13px] font-mono font-bold text-white tracking-widest mb-2">
                      EMBED RESTRICTED
                    </p>
                    <p className="text-[11px] font-mono text-white/50 mb-6 max-w-xs">
                      {liveFeedName} does not allow third-party embedding. Click below to open the live
                      stream directly.
                    </p>
                    <a
                      href={
                        liveFeedUrl.includes('channel=')
                          ? `https://www.youtube.com/channel/${liveFeedUrl.split('channel=')[1].split('&')[0]}/live`
                          : liveFeedUrl.includes('/embed/')
                          ? `https://www.youtube.com/watch?v=${liveFeedUrl.split('/embed/')[1].split('?')[0]}`
                          : liveFeedUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded border border-[#7FA276]/40 text-[#7FA276] font-mono text-[12px] hover:bg-[#7FA276]/10 transition-colors tracking-wider"
                    >
                      <ExternalLink className="w-4 h-4" />
                      OPEN LIVE STREAM
                    </a>
                  </div>
                </div>
              )}

              {/* Footer — only show for embeddable feeds */}
              {liveFeedEmbedAllowed && (
                <div className="bg-[#111]/90 px-4 py-2.5 border-t border-[var(--border-primary)] flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[var(--gold-primary)] shrink-0" />
                  <span className="text-[11px] font-mono text-white/70 leading-relaxed">
                    If you see &ldquo;Video unavailable&rdquo;, use{' '}
                    <strong className="text-[var(--gold-primary)]">Open in YouTube</strong> above.
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================================
         MOBILE UI
         =================================================================== */}
      {isMobile && (
        <>
          {/* Mobile Bottom Navigation */}
          <div className="mobile-nav">
            <div className="glass-panel mobile-nav-inner">
              {[
                { id: 'layers' as const, icon: Layers, label: 'LAYERS' },
                { id: 'markets' as const, icon: BarChart3, label: 'MARKETS' },
                { id: 'intel' as const, icon: Newspaper, label: 'INTEL' },
                { id: 'recon' as const, icon: Radar, label: 'RECON' },
                { id: 'aip' as const, icon: Brain, label: 'AIP' },
                { id: 'ops' as const, icon: Activity, label: 'OPS' },
                { id: 'lab' as const, icon: Database, label: 'LAB' },
                { id: 'sources' as const, icon: Globe, label: 'SRC' },
                { id: 'search' as const, icon: Search, label: 'SEARCH' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMobilePanel(mobilePanel === tab.id ? null : tab.id)}
                  className={`mobile-nav-btn ${mobilePanel === tab.id ? 'active' : ''}`}
                >
                  <tab.icon
                    className={`w-4 h-4 ${tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}`}
                  />
                  <span className={tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}>
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobilePanel && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-[52px] left-0 right-0 z-[400] glass-panel rounded-b-none overflow-y-auto styled-scrollbar"
                style={{
                  maxHeight: 'min(55vh, calc(100dvh - 100px))',
                  paddingBottom: 'env(safe-area-inset-bottom, 4px)',
                }}
              >
                <div className="mobile-drawer-handle" />
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="hud-text text-[9px] text-[var(--text-primary)]">
                      {mobilePanel === 'layers'
                        ? 'LAYERS & FOUNDRY'
                        : mobilePanel === 'markets'
                        ? 'MARKETS & INTEL'
                        : mobilePanel === 'intel'
                        ? 'INTEL FEED'
                        : mobilePanel === 'recon'
                        ? 'Pandora RECON'
                        : mobilePanel === 'aip'
                        ? 'PANDORA AIP / FUSION'
                        : mobilePanel === 'ops'
                        ? 'COMMAND DECK'
                        : mobilePanel === 'lab'
                        ? 'INNOVATION LAB'
                        : mobilePanel === 'sources'
                        ? 'PUBLIC INTEL SOURCES'
                        : 'SEARCH'}
                    </span>
                  <button
                    onClick={() => setMobilePanel(null)}
                    className="text-[var(--text-muted)] p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  </div>
                </div>
                {mobilePanel === 'layers' && (
                  <>
                    <div className="glass-panel-sm p-2 mb-2">
                      <div className="grid grid-cols-5 gap-1 text-center">
                        <div>
                          <div className="hud-label" style={{ fontSize: '6px' }}>AIR</div>
                          <div className="hud-value text-[9px]">{totalFlights.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="hud-label" style={{ fontSize: '6px' }}>SAT</div>
                          <div className="hud-value text-[9px]">{(data.satellites?.length || 0)}</div>
                        </div>
                        <div>
                          <div className="hud-label" style={{ fontSize: '6px' }}>CAM</div>
                          <div className="hud-value text-[9px]">{(data.cameras?.length || 0)}</div>
                        </div>
                        <div>
                          <div className="hud-label" style={{ fontSize: '6px' }}>WX</div>
                          <div className="hud-value text-[9px]" style={{ color: '#C18447' }}>
                            {(data.weather_events?.length || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="hud-label" style={{ fontSize: '6px' }}>NUC</div>
                          <div className="hud-value text-[9px]" style={{ color: '#7FA276' }}>
                            {(data.infrastructure?.length || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} />
                    <div className="mt-2">
                      <DataFoundryPanel data={data} activeLayers={activeLayers} />
                    </div>
                    <div className="mt-2">
                      <ViewPresets
                        onNavigate={(lat, lng, zoom) => {
                          setFlyToLocation({ lat, lng, ts: Date.now() });
                          setMapView((v) => ({ ...v, zoom }));
                          setMobilePanel(null);
                        }}
                      />
                    </div>
                  </>
                )}
                {mobilePanel === 'markets' && <MarketsPanel data={data} spaceWeather={spaceWeather} />}
                {mobilePanel === 'intel' && (
                  <IntelFeed
                    data={data}
                    onLocate={(lat, lng) => {
                      setFlyToLocation({ lat, lng, ts: Date.now() });
                      setMobilePanel(null);
                    }}
                  />
                )}
                {mobilePanel === 'search' && (
                  <div className="space-y-2">
                    <SearchBar
                      onLocate={(lat, lng) => {
                        setFlyToLocation({ lat, lng, ts: Date.now() });
                        setMobilePanel(null);
                      }}
                    />
                    <SharePanel mapView={mapView} activeLayers={activeLayers} mouseCoords={mouseCoords} />
                  </div>
                )}
                {mobilePanel === 'recon' && (
                  <div className="space-y-2">
                    <MissionControlPanel
                      data={data}
                      activeLayers={activeLayers}
                      backendStatus={backendStatus}
                      mapView={mapView}
                    />
                    <OsintPanel
                      isOpen={true}
                      onClose={() => setMobilePanel(null)}
                      isMobile={true}
                      onSweepVisualize={setSweepData}
                    />
                  </div>
                )}
                {mobilePanel === 'aip' && (
                  <AipFusionPanel
                    model={fusionModel}
                    isMobile={true}
                    onLocate={(lat, lng) => {
                      setFlyToLocation({ lat, lng, ts: Date.now() });
                      setMobilePanel(null);
                    }}
                  />
                )}
                {mobilePanel === 'ops' && (
                  <AdvancedOpsPanel
                    model={fusionModel}
                    isMobile={true}
                    mouseCoords={mouseCoords}
                    onLocate={(lat, lng) => {
                      setFlyToLocation({ lat, lng, ts: Date.now() });
                      setMobilePanel(null);
                    }}
                  />
                )}
                {mobilePanel === 'lab' && (
                  <InnovationLabPanel
                    model={fusionModel}
                    isMobile={true}
                    onOpenAip={() => setMobilePanel('aip')}
                    onLocate={(lat, lng) => {
                      setFlyToLocation({ lat, lng, ts: Date.now() });
                      setMobilePanel(null);
                    }}
                  />
                )}
                {mobilePanel === 'sources' && <PublicIntelCatalogPanel isMobile={true} />}
            </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ===================================================================
         BOTTOM CENTER (desktop) — HUD Bar
         =================================================================== */}
      {!isMobile && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3, duration: 0.8 }}
          className="bottom-command-hud desktop-only absolute bottom-5 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto"
        >
          <div
            className="glass-panel px-5 py-2.5 flex items-center gap-0 pandora-glow relative overflow-hidden"
            style={{
              borderImage: 'linear-gradient(90deg, rgba(191,164,106,0.05), rgba(191,164,106,0.2), rgba(191,164,106,0.05)) 1',
              borderImageSlice: 1,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            {/* Animated scan line */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <div
                className="absolute top-0 bottom-0 w-[60px] bg-gradient-to-r from-transparent via-[var(--gold-primary)]/[0.07] to-transparent"
                style={{ animation: 'hud-scanline 4s ease-in-out infinite' }}
              />
            </div>

            {/* COORDINATES */}
            <div className="flex flex-col items-center min-w-[110px] px-3">
              <div className="hud-label">COORDINATES</div>
              <div className="text-[10px] font-mono font-bold text-[var(--gold-primary)] tracking-wide tabular-nums">
                {mouseCoords ? `${mouseCoords.lat.toFixed(4)}, ${mouseCoords.lng.toFixed(4)}` : '—'}
              </div>
            </div>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent flex-shrink-0" />

            {/* LOCATION */}
            <div className="flex flex-col items-center min-w-[160px] max-w-[280px] px-3">
              <div className="hud-label">LOCATION</div>
              <div className="text-[9px] text-[var(--text-secondary)] font-mono truncate max-w-[280px]">
                {locationLabel || 'Hover over map...'}
              </div>
            </div>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent flex-shrink-0" />

            {/* ZOOM */}
            <div className="flex flex-col items-center px-3">
              <div className="hud-label">ZOOM</div>
              <div className="text-[10px] font-mono font-bold text-[var(--gold-primary)] tabular-nums">
                {mapView.zoom.toFixed(1)}
              </div>
            </div>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent flex-shrink-0" />

            {/* ACTIVE LAYERS */}
            <div className="flex flex-col items-center px-3 min-w-[60px]">
              <div className="hud-label">ACTIVE LAYERS</div>
              <div className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-[var(--gold-primary)]" />
                <span className="text-[10px] font-mono font-bold text-[var(--gold-primary)] tabular-nums">
                  {activeFeedCount}
                </span>
              </div>
            </div>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent flex-shrink-0" />

            {/* DATA FEEDS */}
            <div className="flex flex-col items-center px-3 min-w-[60px]">
              <div className="hud-label">FEEDS</div>
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-[var(--cyan-primary)]" />
                <span className="text-[10px] font-mono font-bold text-[var(--cyan-primary)] tabular-nums">
                  {activeFeedCount}/{totalFeedCount}
                </span>
              </div>
            </div>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-[var(--border-primary)] to-transparent flex-shrink-0" />

            {/* THROUGHPUT */}
            <div className="flex flex-col items-center px-3 min-w-[70px]">
              <div className="hud-label">THROUGHPUT</div>
              <div className="flex items-center gap-1">
                <Database className="w-3 h-3 text-[var(--alert-green)]" />
                <DataThroughput />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ===================================================================
         SCALE BAR (desktop)
         =================================================================== */}
      <div className="scale-bar-wrap desktop-only absolute bottom-[4.5rem] left-[20rem] z-[201] pointer-events-none">
        <ScaleBar zoom={mapView.zoom} latitude={mapView.latitude} />
      </div>

      {/* ===================================================================
         REGION DOSSIER — Fiche d'information
         =================================================================== */}
      {(regionDossier || dossierLoading) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-16 md:top-20 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 z-[300] md:w-[480px] max-h-[65vh] overflow-y-auto styled-scrollbar"
        >
          <div className="glass-panel p-5 pandora-glow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-[var(--gold-primary)] tracking-wider">
                ENTITY / REGION DOSSIER
              </h2>
              <button
                onClick={() => {
                  setRegionDossier(null);
                  setDossierLoading(false);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
              >
                ✕
              </button>
            </div>
            {dossierLoading ? (
              <div className="text-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-widest">
                  COMPILING DOSSIER...
                </span>
              </div>
            ) : (
              regionDossier && (
                <div className="space-y-3">
                  <div>
                    <div className="hud-label mb-0.5">LOCATION</div>
                    <div className="text-xs text-[var(--text-primary)]">{regionDossier.location?.display_name}</div>
                  </div>
                  {regionDossier.country && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="hud-label mb-0.5">COUNTRY</div>
                        <div className="text-xs text-[var(--text-primary)]">
                          {regionDossier.country.flag} {regionDossier.country.name}
                        </div>
                      </div>
                      <div>
                        <div className="hud-label mb-0.5">CAPITAL</div>
                        <div className="text-xs text-[var(--text-primary)]">{regionDossier.country.capital}</div>
                      </div>
                      <div>
                        <div className="hud-label mb-0.5">POPULATION</div>
                        <div className="text-xs text-[var(--text-primary)]">
                          {regionDossier.country.population?.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="hud-label mb-0.5">REGION</div>
                        <div className="text-xs text-[var(--text-primary)]">
                          {regionDossier.country.subregion || regionDossier.country.region}
                        </div>
                      </div>
                      <div>
                        <div className="hud-label mb-0.5">LANGUAGES</div>
                        <div className="text-xs text-[var(--text-primary)]">
                          {regionDossier.country.languages?.join(', ')}
                        </div>
                      </div>
                      <div>
                        <div className="hud-label mb-0.5">AREA</div>
                        <div className="text-xs text-[var(--text-primary)]">
                          {regionDossier.country.area?.toLocaleString()} km²
                        </div>
                      </div>
                    </div>
                  )}
                  {regionDossier.head_of_state && (
                    <div>
                      <div className="hud-label mb-0.5">HEAD OF STATE</div>
                      <div className="text-xs text-[var(--gold-primary)]">{regionDossier.head_of_state.name}</div>
                      <div className="text-[8px] text-[var(--text-muted)]">
                        {regionDossier.head_of_state.position}
                      </div>
                    </div>
                  )}
                  {regionDossier.wikipedia && (
                    <div>
                      <div className="hud-label mb-1">INTELLIGENCE BRIEF</div>
                      <div className="flex gap-3">
                        {regionDossier.wikipedia.thumbnail && (
                          <img
                            src={regionDossier.wikipedia.thumbnail}
                            alt=""
                            className="w-14 h-14 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <p className="text-[8px] text-[var(--text-secondary)] leading-relaxed">
                          {regionDossier.wikipedia.extract}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </motion.div>
      )}

      {/* ===================================================================
         CAMERA VIEWER — Visualisation des caméras
         =================================================================== */}
      <CameraViewer
        camera={activeCamera}
        onClose={() => setActiveCamera(null)}
        onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })}
      />

      {/* ===================================================================
         OVERLAYS — Effets visuels
         =================================================================== */}
      <div className="vignette absolute inset-0 pointer-events-none z-[2]" />
      <div className="crt-scanlines absolute inset-0 pointer-events-none z-[3] opacity-[0.02]" />

      {/* Corner frames */}
      {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
        <div key={i} className={`absolute ${pos} w-16 h-16 pointer-events-none z-[1]`}>
          <div
            className={`absolute ${pos.includes('top') ? 'top-0' : 'bottom-0'} ${
              pos.includes('left') ? 'left-0' : 'right-0'
            } w-full h-[1px] bg-gradient-to-${
              pos.includes('left') ? 'r' : 'l'
            } from-[var(--gold-primary)]/30 to-transparent`}
          />
          <div
            className={`absolute ${pos.includes('top') ? 'top-0' : 'bottom-0'} ${
              pos.includes('left') ? 'left-0' : 'right-0'
            } w-[1px] h-full bg-gradient-to-${
              pos.includes('top') ? 'b' : 't'
            } from-[var(--gold-primary)]/30 to-transparent`}
          />
        </div>
      ))}

      {/* ===================================================================
         KEYBOARD SHORTCUTS OVERLAY
         =================================================================== */}
      <KeyboardShortcuts />

      {/* ===================================================================
         COMMAND PALETTE — Recherche globale
         =================================================================== */}
      <CommandPalette
        onNavigate={(lat, lng, zoom) => {
          setFlyToLocation({ lat, lng, ts: Date.now() });
          if (zoom) setMapView((v) => ({ ...v, zoom }));
        }}
        onToggleLayer={(layer) => setActiveLayers((prev) => ({ ...prev, [layer]: !(prev as any)[layer] }))}
        onOpenAip={() => setMobilePanel('aip')}
        onGenerateBriefing={() => setMobilePanel('ops')}
      />

      {/* ===================================================================
         GLOBAL STATUS TICKER (bottom)
         =================================================================== */}
      <GlobalStatusBar />

      {/* Shortcut hint */}
      <div className="desktop-only absolute bottom-[26px] right-5 z-[200] pointer-events-none text-[6px] font-mono text-[var(--text-muted)]/40 tracking-widest">
        [?] SHORTCUTS · [F] FULLSCREEN · [S] SHARE · [R] RESET VIEW
      </div>
    </main>
  );
}