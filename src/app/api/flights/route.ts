
import { NextResponse } from 'next/server';

/**
 * PANDORA — Flight Data API
 * Fetches real-time aircraft positions from adsb.lol (no API key required)
 * Covers 6 global regions for maximum coverage
 */

const REGIONS = [
  { lat: 39.8, lon: -98.5, dist: 2000 },   // North America
  { lat: 50.0, lon: 15.0, dist: 2000 },     // Europe
  { lat: 35.0, lon: 105.0, dist: 2000 },    // Asia
  { lat: -25.0, lon: 133.0, dist: 2000 },   // Australia
  { lat: 0.0, lon: 20.0, dist: 2500 },      // Africa
  { lat: -15.0, lon: -60.0, dist: 2000 },   // South America
];

// Helicopter type codes
const HELI_TYPES = new Set([
  'R22','R44','R66','B06','B06T','B204','B205','B206','B212','B222','B230',
  'B407','B412','B427','B429','B430','B505','B525',
  'AS32','AS35','AS50','AS55','AS65',
  'EC20','EC25','EC30','EC35','EC45','EC55','EC75',
  'H125','H130','H135','H145','H155','H160','H175','H215','H225',
  'S55','S58','S61','S64','S70','S76','S92',
  'A109','A119','A139','A169','A189','AW09',
  'MD52','MD60','MDHI','MD90','NOTR',
  'B47G','HUEY','GAMA','CABR','EXE',
]);

// Private jet types
const PRIVATE_JET_TYPES = new Set([
  'G150','G200','G280','GLEX','G500','G550','G600','G650','G700',
  'GLF2','GLF3','GLF4','GLF5','GLF6','GL5T','GL7T','GV','GIV',
  'CL30','CL35','CL60','BD70','BD10',
  'C25A','C25B','C25C','C500','C510','C525','C550','C560','C56X','C680','C700','C750',
  'E35L','E50P','E55P','E545','E550',
  'FA50','FA7X','FA8X','F900','F2TH',
  'LJ35','LJ40','LJ45','LJ60','LJ70','LJ75',
  'PC12','PC24','TBM7','TBM8','TBM9',
  'PRM1','SF50','EA50','VLJ',
]);

// Military type indicators
const MILITARY_INDICATORS = new Set([
  'C17','C5M','C130','C30J','KC10','KC46','KC35','E3CF','E3TF','E8A',
  'B1B','B2','B52','F16','F15','F18','F22','F35','A10','F117',
  'RC135','E6B','P8A','P3','MQ9','RQ4','U2','EP3','RC12',
  'V22','CH47','UH60','AH64','AH1Z','MV22',
  'EUFI','RFAL','TORD','TYP','GR4',
]);

const AIRLINE_CODE_RE = /^([A-Z]{3})\d/;

async function fetchRegion(region: typeof REGIONS[0]): Promise<any[] | null> {
  try {
    const url = `https://api.adsb.lol/v2/lat/${region.lat}/lon/${region.lon}/dist/${region.dist}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PandoraAtlas/1.0 (open source flight map)',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data.ac || [];
    }
    return null;
  } catch (e) {
    console.warn(`Region fetch failed for lat=${region.lat}:`, e);
    return null;
  }
}

function classifyFlight(f: any) {
  const modelUpper = (f.t || '').toUpperCase();
  const flightStr = (f.flight || '').trim().toUpperCase();
  const dbFlags = (f.dbFlags || 0);

  // Skip fixed structures
  if (modelUpper === 'TWR') return null;

  const lat = f.lat;
  const lon = f.lon;
  if (lat == null || lon == null) return null;

  const callsign = flightStr || f.hex || 'UNKNOWN';
  const altRaw = f.alt_baro;
  const altMeters = typeof altRaw === 'number' ? altRaw * 0.3048 : 0;
  const speedKnots = typeof f.gs === 'number' ? Math.round(f.gs * 10) / 10 : null;
  const heading = f.track || 0;
  const isHeli = HELI_TYPES.has(modelUpper);
  const isGrounded = typeof altRaw === 'number' && altRaw < 100;

  // Extract airline code
  const airlineMatch = AIRLINE_CODE_RE.exec(callsign);
  const airlineCode = airlineMatch ? airlineMatch[1] : '';

  // Classification
  let category: 'commercial' | 'private' | 'jet' | 'military' = 'commercial';
  if (dbFlags & 1 || MILITARY_INDICATORS.has(modelUpper) || (f.flight || '').match(/^(RCH|KING|DUKE|EVAC|JAKE|REACH|CONVOY)\d/i)) {
    category = 'military';
  } else if (PRIVATE_JET_TYPES.has(modelUpper)) {
    category = 'jet';
  } else if (!airlineCode && modelUpper && !['A319','A320','A321','A332','A333','A339','A343','A359','A388','B737','B738','B739','B38M','B39M','B752','B753','B763','B764','B772','B77L','B77W','B788','B789','B78X','E170','E175','E190','E195','CRJ7','CRJ9','AT43','AT72','DH8D'].includes(modelUpper)) {
    category = 'private';
  }

  return {
    callsign,
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lon * 100000) / 100000,
    alt: Math.round(altMeters),
    heading: Math.round(heading),
    speed_knots: speedKnots,
    model: f.t || 'Unknown',
    icao24: f.hex || '',
    registration: f.r || 'N/A',
    squawk: f.squawk || '',
    airline_code: airlineCode,
    aircraft_category: isHeli ? 'heli' : 'plane',
    category,
    grounded: isGrounded,
    nac_p: f.nac_p,
    type: 'flight',
  };
}

// In-memory cache to prevent global fan-out abuse
// NOTE (Issue #110): This cache is per-isolate in serverless environments (Vercel).
// Multiple isolates may each hold their own cache, but this is acceptable because:
// 1. It coalesces concurrent requests within the same isolate
// 2. It prevents hammering adsb.lol which would cause rate-limit bans
// For a globally shared cache, migrate to Vercel KV or similar persistent store.
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 120000; // 2 minutes: avoid hammering adsb.lol / rate limits
const STALE_TTL = 10 * 60 * 1000; // keep last known aircraft up to 10 minutes
let fetchPromise: Promise<any> | null = null;

function allFlights(data: any): any[] {
  if (!data) return [];
  return [
    ...(Array.isArray(data.commercial_flights) ? data.commercial_flights : []),
    ...(Array.isArray(data.private_flights) ? data.private_flights : []),
    ...(Array.isArray(data.private_jets) ? data.private_jets : []),
    ...(Array.isArray(data.military_flights) ? data.military_flights : []),
  ];
}

function flightKey(f: any) {
  return String(f.icao24 || f.callsign || `${f.lat},${f.lng},${f.model}`).toLowerCase();
}

function splitFlights(flights: any[]) {
  const commercial_flights: any[] = [];
  const private_flights: any[] = [];
  const private_jets: any[] = [];
  const military_flights: any[] = [];

  for (const flight of flights) {
    switch (flight.category) {
      case 'military': military_flights.push(flight); break;
      case 'jet': private_jets.push(flight); break;
      case 'private': private_flights.push(flight); break;
      default: commercial_flights.push(flight);
    }
  }

  return { commercial_flights, private_flights, private_jets, military_flights };
}

function mergeWithStaleFreshData(freshData: any, previousData: any) {
  if (!previousData) return freshData;
  const now = Date.now();
  const fresh = allFlights(freshData).map((f) => ({ ...f, last_seen: now, stale: false }));
  const previous = allFlights(previousData);
  const merged = new Map<string, any>();

  for (const flight of fresh) merged.set(flightKey(flight), flight);

  for (const flight of previous) {
    const key = flightKey(flight);
    if (merged.has(key)) continue;
    const lastSeen = Number(flight.last_seen || previousData.fetched_at || previousData.timestamp_ms || now);
    if (now - lastSeen <= STALE_TTL) {
      merged.set(key, {
        ...flight,
        last_seen: lastSeen,
        stale: true,
        stale_age_seconds: Math.round((now - lastSeen) / 1000),
      });
    }
  }

  const split = splitFlights(Array.from(merged.values()));
  return {
    ...freshData,
    ...split,
    total: merged.size,
    fresh_total: fresh.length,
    stale_total: merged.size - fresh.length,
    timestamp: new Date(now).toISOString(),
    timestamp_ms: now,
    cache_strategy: 'fresh-plus-stale-merge',
  };
}

export async function GET() {
  const now = Date.now();

  // Return cached data if within TTL
  if (cachedData && now - lastFetchTime < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }

  // Coalesce concurrent requests: wait for the active fetch rather than starting a new one
  if (fetchPromise) {
    try {
      const data = await fetchPromise;
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      });
    } catch {
      // Fallback to stale cache if the pending fetch failed
      if (cachedData) {
        return NextResponse.json({ ...cachedData, stale_response: true, warning: 'Upstream ADS-B fetch failed; serving cached aircraft.' }, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        });
      }
      return NextResponse.json({ error: 'Failed to fetch flight data' }, { status: 500 });
    }
  }

  const JAMMING_NACAP_THRESHOLD = 4;

  // Start new global fetch
  fetchPromise = (async () => {
    // Fetch all 6 regions in parallel
    const regionResults = await Promise.allSettled(
      REGIONS.map(r => fetchRegion(r))
    );

    const availableRegions = regionResults.filter((result) => result.status === 'fulfilled' && Array.isArray(result.value)).length;
    if (availableRegions === 0) throw new Error('All ADS-B regions are unavailable');

    const allRaw: any[] = [];
    const seenHex = new Set<string>();

    for (const result of regionResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        for (const ac of result.value) {
          const hex = (ac.hex || '').toLowerCase().trim();
          if (hex && !seenHex.has(hex)) {
            seenHex.add(hex);
            allRaw.push(ac);
          }
        }
      }
    }

    // Classify all flights
    const commercial: any[] = [];
    const privateFl: any[] = [];
    const jets: any[] = [];
    const military: any[] = [];
    const gpsJamming: any[] = [];

    for (const raw of allRaw) {
      const flight = classifyFlight(raw);
      if (!flight) continue;

      // GPS jamming detection
      if (typeof flight.nac_p === 'number' && flight.nac_p <= JAMMING_NACAP_THRESHOLD && !flight.grounded) {
        gpsJamming.push({
          lat: flight.lat,
          lng: flight.lng,
          nac_p: flight.nac_p,
          callsign: flight.callsign,
        });
      }

      switch (flight.category) {
        case 'military': military.push(flight); break;
        case 'jet': jets.push(flight); break;
        case 'private': privateFl.push(flight); break;
        default: commercial.push(flight);
      }
    }

    // Aggregate GPS jamming zones (grid-based)
    const jammingZones = aggregateJamming(gpsJamming, JAMMING_NACAP_THRESHOLD);

    return {
      commercial_flights: commercial,
      private_flights: privateFl,
      private_jets: jets,
      military_flights: military,
      gps_jamming: jammingZones,
      total: allRaw.length,
      fresh_total: allRaw.length,
      stale_total: 0,
      source_status: { regions_available: availableRegions, regions_total: REGIONS.length },
      timestamp: new Date().toISOString(),
      timestamp_ms: Date.now(),
      cache_strategy: 'fresh',
    };
  })();

  try {
    const freshData = await fetchPromise;
    const hasFreshAircraft = allFlights(freshData).length > 0;
    const data = hasFreshAircraft
      ? mergeWithStaleFreshData(freshData, cachedData)
      : cachedData
        ? { ...cachedData, stale_response: true, warning: 'Upstream returned no aircraft; preserving last known aircraft.' }
        : freshData;

    cachedData = data;
    lastFetchTime = Date.now();
    fetchPromise = null;

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Flight fetch error:', error);
    fetchPromise = null;
    if (cachedData) {
      return NextResponse.json({ ...cachedData, stale_response: true, warning: 'Upstream ADS-B fetch failed; serving cached aircraft.' }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
    return NextResponse.json(
      { error: 'Failed to fetch flight data' },
      { status: 500 }
    );
  }
}

function aggregateJamming(points: any[], threshold: number) {
  if (points.length === 0) return [];
  const grid = new Map<string, { lat: number; lng: number; count: number; total_nac_p: number }>();
  const GRID_SIZE = 2; // degrees

  for (const p of points) {
    const gLat = Math.floor(p.lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(p.lng / GRID_SIZE) * GRID_SIZE;
    const key = `${gLat},${gLng}`;

    if (!grid.has(key)) {
      grid.set(key, { lat: gLat + GRID_SIZE / 2, lng: gLng + GRID_SIZE / 2, count: 0, total_nac_p: 0 });
    }
    const cell = grid.get(key)!;
    cell.count++;
    cell.total_nac_p += p.nac_p;
  }

  return Array.from(grid.values())
    .filter(z => z.count >= 3) // Minimum 3 aircraft with degraded NACp
    .map(z => ({
      lat: z.lat,
      lng: z.lng,
      severity: Math.round((1 - (z.total_nac_p / z.count) / threshold) * 100),
      count: z.count,
    }));
}

