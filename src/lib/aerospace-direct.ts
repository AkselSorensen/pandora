/**
 * Aerospace — direct ADS-B fallback.
 *
 * Used by `/api/aerospace` when the `pandora-aerospace` microservice is not
 * reachable (`PANDORA_AEROSPACE_URL` unset, service down, or upstream error).
 *
 * Two real public sources, merged by ICAO24 — never one OR the other:
 *  - OpenSky `/states/all`: ONE request, ~7 800 positioned aircraft worldwide
 *    (measured HTTP 200, 1 MB, ~0.6 s), rate-limit friendly. Backbone.
 *  - ADSB.lol /v2: the same six regional circles as the microservice. Adds what
 *    OpenSky lacks (type code `t`, registration `r`, military flag `dbFlags`),
 *    but it rate-limits bursts — six calls fired at once returned HTTP 420/429
 *    and only 2 of 6 regions answered. Queried in waves of two, spaced.
 *
 * Same classification rules as `ai/pandora-aerospace-service/sources.py`
 * (type-code sets + dbFlags bit 0 + OpenSky rotorcraft category).
 *
 * Real data only: no synthetic aircraft, no simulated positions. If every
 * upstream fails, the caller returns an empty list and an explicit error.
 */

export interface DirectAircraft {
  icao24: string;
  callsign: string;
  lat: number;
  lng: number;
  alt_m: number | null;
  speed_knots: number | null;
  heading: number | null;
  model: string;
  category: string;
  registration: string;
  is_military: boolean;
  is_heli: boolean;
  is_private: boolean;
  is_commercial: boolean;
}

const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';

/**
 * Measured 2026-10-05 on ADSB.lol /v2 (Europe 50.0/15.0): dist=250 NM → 647
 * aircraft, dist=2000 NM → 4078, dist=3000 NM → 4221, all HTTP 200. The radius
 * is NOT the constraint — the request rate is (a burst of six = HTTP 420/429).
 */
const ADSB_DIST_NM = 2000;
/** More than two ADSB.lol calls at a time triggers HTTP 420/429. */
const ADSB_CONCURRENCY = 2;
const ADSB_WAVE_GAP_MS = 400;
const MPS_TO_KNOTS = 1.943844;
/** OpenSky state-vector index 17, category 8 = rotorcraft. */
const OPEN_SKY_ROTORCRAFT_CATEGORY = 8;

const UA_HEADERS = { 'User-Agent': 'Pandora-Aerospace/1.0', Accept: 'application/json' } as const;

/**
 * ADSB.lol returns "@@@@@@@@" when the aircraft broadcasts no callsign — that
 * is not a name and must not be displayed as one.
 */
const cleanCallsign = (raw?: string | null) => {
  const cs = (raw || '').trim();
  return /[A-Za-z0-9]/.test(cs) ? cs : '';
};

/** Same six coverage circles as the microservice. */
const REGIONS: Array<{ label: string; lat: number; lon: number }> = [
  { label: 'North America', lat: 39.8, lon: -98.5 },
  { label: 'Europe', lat: 50.0, lon: 15.0 },
  { label: 'Asia', lat: 35.0, lon: 105.0 },
  { label: 'Australia', lat: -25.0, lon: 133.0 },
  { label: 'Africa', lat: 0.0, lon: 20.0 },
  { label: 'South America', lat: -15.0, lon: -60.0 },
];

const HELI_TYPES = new Set([
  'R22', 'R44', 'R66', 'B06', 'B06T', 'B204', 'B205', 'B206', 'B212', 'B222', 'B230',
  'B407', 'B412', 'B427', 'B429', 'B430', 'B505', 'B525',
  'AS32', 'AS35', 'AS50', 'AS55', 'AS65',
  'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75',
  'H125', 'H130', 'H135', 'H145', 'H155', 'H160', 'H175', 'H215', 'H225',
  'S55', 'S58', 'S61', 'S64', 'S70', 'S76', 'S92',
  'A109', 'A119', 'A139', 'A169', 'A189', 'AW09',
  'MD52', 'MD60', 'MDHI', 'MD90', 'NOTR', 'B47G', 'HUEY', 'GAMA', 'CABR', 'EXE',
]);

const PRIVATE_JET_TYPES = new Set([
  'G150', 'G200', 'G280', 'GLEX', 'G500', 'G550', 'G600', 'G650', 'G700',
  'GLF2', 'GLF3', 'GLF4', 'GLF5', 'GLF6', 'GL5T', 'GL7T', 'GV', 'GIV',
  'CL30', 'CL35', 'CL60', 'BD70', 'BD10',
  'C25A', 'C25B', 'C25C', 'C500', 'C510', 'C525', 'C550', 'C560', 'C56X', 'C680', 'C700', 'C750',
  'E35L', 'E50P', 'E55P', 'E545', 'E550',
  'FA50', 'FA7X', 'FA8X', 'F900', 'F2TH',
  'LJ35', 'LJ40', 'LJ45', 'LJ60', 'LJ70', 'LJ75',
  'PC12', 'PC24', 'TBM7', 'TBM8', 'TBM9', 'PRM1', 'SF50', 'EA50', 'VLJ',
]);

const MILITARY_TYPES = new Set([
  'C17', 'C5M', 'C130', 'C30J', 'KC10', 'KC46', 'KC35', 'E3CF', 'E3TF', 'E8A',
  'B1B', 'B2', 'B52', 'B21', 'F16', 'F15', 'F18', 'F22', 'F35', 'A10', 'F117',
  'RC135', 'E6B', 'P8A', 'P3', 'MQ9', 'RQ4', 'U2', 'EP3', 'RC12',
  'V22', 'CH47', 'UH60', 'AH64', 'AH1Z', 'MV22',
  'EUFI', 'RFAL', 'TORD', 'TYP', 'GR4',
  'TU95', 'TU160', 'TU22', 'SU27', 'SU30', 'SU34', 'SU35', 'SU57',
  'MIG29', 'MIG31', 'MIG35', 'MIG21', 'YAK130', 'YAK141',
  'J20', 'J16', 'J10', 'J11', 'J15', 'J31', 'KJ500', 'KJ200',
]);

const MILITARY_CALLSIGN_PREFIXES = [
  'RCH', 'KING', 'DUKE', 'EVAC', 'JAKE', 'REACH', 'CONVOY', 'SABRE',
  'VIPR', 'FANG', 'RAZOR', 'WOLF', 'HAWK', 'PHANTOM', 'RAIDER',
];

const COMMERCIAL_AIRLINER_TYPES = new Set([
  'A319', 'A320', 'A321', 'A332', 'A333', 'A339', 'A343', 'A359', 'A388',
  'B737', 'B738', 'B739', 'B38M', 'B39M', 'B752', 'B753', 'B763', 'B764',
  'B772', 'B77L', 'B77W', 'B788', 'B789', 'B78X',
  'E170', 'E175', 'E190', 'E195', 'E195E2', 'E190E2',
  'CRJ7', 'CRJ9', 'CRJ1', 'CRJ2',
  'AT43', 'AT72', 'AT76', 'DH8D', 'DH8C', 'DH8B',
  'A220', 'BCS1', 'BCS3',
]);

/** Mirrors `classify_aircraft` in ai/pandora-aerospace-service/sources.py. */
function classify(model: string, callsign: string, dbFlags: number, rotorcraft = false) {
  const modelUpper = (model || '').toUpperCase();
  const callsignUpper = (callsign || '').toUpperCase().trim();

  const isHeli = rotorcraft || HELI_TYPES.has(modelUpper);
  const isMilitaryModel = MILITARY_TYPES.has(modelUpper);
  const isMilitaryCallsign = MILITARY_CALLSIGN_PREFIXES.some((p) => callsignUpper.startsWith(p));
  const isJet = PRIVATE_JET_TYPES.has(modelUpper);
  const isCommercial = COMMERCIAL_AIRLINER_TYPES.has(modelUpper);

  let category: string;
  if (isMilitaryModel || isMilitaryCallsign || (dbFlags & 1) === 1) category = 'military';
  else if (isHeli) category = 'heli';
  else if (isJet) category = 'jet';
  else if (isCommercial) category = 'commercial';
  else if (modelUpper && !/^[A-Z]/.test(callsignUpper)) category = 'private';
  else if (modelUpper) category = 'commercial';
  // No usable type code nor callsign (the common OpenSky case): do not claim
  // "commercial" out of thin air.
  else category = 'unknown';

  return {
    category,
    is_heli: isHeli,
    is_military: category === 'military',
    is_private: category === 'private' || category === 'jet',
    is_commercial: category === 'commercial',
  };
}

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number | null;
  lon?: number | null;
  /** Feet (ADSB.lol) — the OpenSky branch converts metres → feet to match. */
  alt_baro?: number | string | null;
  gs?: number | null;
  track?: number | null;
  true_heading?: number | null;
  dbFlags?: number;
  /** Set by the OpenSky branch: state-vector category 8 = rotorcraft. */
  rotorcraft?: boolean;
}

type OpenSkyState = Array<string | number | boolean | null>;

const round = (value: number, decimals = 0) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** OpenSky `/states/all` → ADSB.lol-shaped records (one global request). */
function openskyToAdsbShape(states: OpenSkyState[]): AdsbAircraft[] {
  const out: AdsbAircraft[] = [];
  for (const s of states) {
    if (!Array.isArray(s) || s.length < 11) continue;
    const lat = s[6];
    const lon = s[5];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const baroM = typeof s[7] === 'number' ? s[7] : typeof s[13] === 'number' ? s[13] : null;
    const velocityMs = typeof s[9] === 'number' ? s[9] : null;
    out.push({
      hex: typeof s[0] === 'string' ? s[0] : '',
      flight: typeof s[1] === 'string' ? s[1].trim() : '',
      lat,
      lon,
      // metres → feet: `toMetres` below expects the ADSB.lol unit.
      alt_baro: baroM === null ? null : round(baroM / 0.3048, 1),
      gs: velocityMs === null ? null : round(velocityMs * MPS_TO_KNOTS, 1),
      track: typeof s[10] === 'number' ? s[10] : null,
      t: '', // OpenSky publishes no aircraft type code
      r: '',
      dbFlags: 0,
      rotorcraft: s[17] === OPEN_SKY_ROTORCRAFT_CATEGORY,
    });
  }
  return out;
}

async function fetchOpenSky(timeoutMs: number): Promise<AdsbAircraft[]> {
  try {
    const res = await fetch(OPENSKY_STATES_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: UA_HEADERS,
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { states?: OpenSkyState[] };
    return Array.isArray(payload.states) ? openskyToAdsbShape(payload.states) : [];
  } catch {
    return [];
  }
}

async function fetchRegion(region: { lat: number; lon: number }, timeoutMs: number): Promise<AdsbAircraft[]> {
  const url = `https://api.adsb.lol/v2/lat/${region.lat}/lon/${region.lon}/dist/${ADSB_DIST_NM}`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: UA_HEADERS,
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { ac?: AdsbAircraft[] };
    return Array.isArray(payload.ac) ? payload.ac : [];
  } catch {
    return [];
  }
}

/** ADSB.lol in spaced waves of two — a burst of six wakes its rate limiter. */
async function fetchAdsbRegions(timeoutMs: number): Promise<AdsbAircraft[]> {
  const collected: AdsbAircraft[] = [];
  for (let i = 0; i < REGIONS.length; i += ADSB_CONCURRENCY) {
    const wave = REGIONS.slice(i, i + ADSB_CONCURRENCY);
    const batches = await Promise.all(wave.map((region) => fetchRegion(region, timeoutMs)));
    for (const batch of batches) collected.push(...batch);
    if (i + ADSB_CONCURRENCY < REGIONS.length) await sleep(ADSB_WAVE_GAP_MS);
  }
  return collected;
}

/** Feet → metres, tolerating ADSB.lol's `"ground"` sentinel. */
function toMetres(value: AdsbAircraft['alt_baro']): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 0.3048);
}

export interface DirectAirspace {
  aircraft: DirectAircraft[];
  total: number;
  sourcesOk: number;
  /** Which real upstreams actually answered — surfaced in the UI, no guessing. */
  sources: string[];
}

export async function fetchDirectAirspace(maxAircraft = 800): Promise<DirectAirspace> {
  const [opensky, adsb] = await Promise.all([fetchOpenSky(12000), fetchAdsbRegions(8000)]);

  const sources: string[] = [];
  if (opensky.length > 0) sources.push('OpenSky Network');
  if (adsb.length > 0) sources.push('ADSB.lol v2');

  // OpenSky gives the volume; ADSB.lol overwrites its own entries with the
  // richer record (type code, registration, military flag, squawk).
  const merged = new Map<string, AdsbAircraft>();
  for (const ac of [...opensky, ...adsb]) {
    const hex = (ac.hex || '').toLowerCase();
    merged.set(hex || `${ac.lat}-${ac.lon}`, ac);
  }

  const seen: DirectAircraft[] = [];
  for (const ac of merged.values()) {
    const hex = (ac.hex || '').toLowerCase();
    const lat = ac.lat;
    const lon = ac.lon;
    if (!hex || typeof lat !== 'number' || typeof lon !== 'number') continue;

    const callsign = cleanCallsign(ac.flight);
    const model = (ac.t || '').toUpperCase();
    const flags = ac.dbFlags ?? 0;
    const cls = classify(model, callsign, flags, Boolean(ac.rotorcraft));

    seen.push({
      icao24: hex,
      callsign: callsign || hex,
      lat,
      lng: lon,
      alt_m: toMetres(ac.alt_baro),
      speed_knots: typeof ac.gs === 'number' ? Math.round(ac.gs) : null,
      heading: typeof ac.track === 'number' ? Math.round(ac.track) : typeof ac.true_heading === 'number' ? Math.round(ac.true_heading) : null,
      model: model || 'unknown',
      category: cls.category,
      registration: (ac.r || '').trim(),
      is_military: cls.is_military,
      is_heli: cls.is_heli,
      is_private: cls.is_private,
      is_commercial: cls.is_commercial,
    });
  }

  // Surface the interesting traffic first: military, then helicopters, then jets.
  const rank = (a: DirectAircraft) => (a.is_military ? 0 : a.is_heli ? 1 : a.is_private ? 2 : 3);
  seen.sort((a, b) => rank(a) - rank(b) || a.callsign.localeCompare(b.callsign));

  return { aircraft: seen.slice(0, maxAircraft), total: seen.length, sourcesOk: sources.length, sources };
}
