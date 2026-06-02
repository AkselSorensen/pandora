'use client';

export type FusionRiskLevel = 'LOW' | 'WATCH' | 'ELEVATED' | 'CRITICAL';
export type FusionEntityType = 'aircraft' | 'ship' | 'camera' | 'incident' | 'hazard' | 'infrastructure' | 'country' | 'cyber' | 'news' | 'weather';

export interface FusionEntity {
  id: string;
  type: FusionEntityType;
  label: string;
  source: string;
  lat?: number;
  lng?: number;
  region?: string;
  timestamp?: string;
  confidence: number;
  risk: number;
  summary: string;
  tags: string[];
}

export interface FusionRelation {
  id: string;
  from: string;
  to: string;
  label: string;
  weight: number;
  rationale: string;
}

export interface FusionAnomaly {
  id: string;
  title: string;
  level: FusionRiskLevel;
  score: number;
  lat?: number;
  lng?: number;
  explanation: string;
  sources: string[];
  entityIds: string[];
}

export interface FusionHotspot {
  id: string;
  label: string;
  lat: number;
  lng: number;
  score: number;
  level: FusionRiskLevel;
  drivers: string[];
}

export interface SourceHealth {
  key: string;
  label: string;
  rows: number;
  confidence: number;
  status: 'ONLINE' | 'SYNCING' | 'STANDBY';
}

export interface FusionModel {
  generatedAt: string;
  posture: FusionRiskLevel;
  score: number;
  entities: FusionEntity[];
  relations: FusionRelation[];
  anomalies: FusionAnomaly[];
  hotspots: FusionHotspot[];
  sourceHealth: SourceHealth[];
  timeline: FusionEntity[];
  briefingBullets: string[];
}

type UnknownRecord = Record<string, unknown>;

const SOURCE_DEFS = [
  { key: 'commercial_flights', label: 'ADS-B commercial', confidence: 72 },
  { key: 'military_flights', label: 'ADS-B military', confidence: 67 },
  { key: 'private_jets', label: 'Private aviation', confidence: 64 },
  { key: 'maritime_ships', label: 'AIS maritime', confidence: 70 },
  { key: 'dark_vessels', label: 'AIS dark vessels', confidence: 78 },
  { key: 'maritime_dark_activity', label: 'Maritime anomalies', confidence: 76 },
  { key: 'cameras', label: 'CCTV grid', confidence: 62 },
  { key: 'gdelt', label: 'GDELT incidents', confidence: 68 },
  { key: 'earthquakes', label: 'USGS seismic', confidence: 90 },
  { key: 'weather_events', label: 'Weather hazards', confidence: 76 },
  { key: 'infrastructure', label: 'Critical infra', confidence: 74 },
  { key: 'news', label: 'OSINT news', confidence: 61 },
] as const;

function asArray<T = UnknownRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function nested(value: unknown, key: string): unknown {
  return asRecord(value)[key];
}

function numberFrom(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function textFrom(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function riskLevel(score: number): FusionRiskLevel {
  if (score >= 78) return 'CRITICAL';
  if (score >= 58) return 'ELEVATED';
  if (score >= 34) return 'WATCH';
  return 'LOW';
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function distanceKm(a: FusionEntity, b: FusionEntity): number | null {
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lat !== 'number' || typeof b.lng !== 'number') return null;
  const r = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function entityFromRaw(rawValue: unknown, type: FusionEntityType, source: string, idx: number): FusionEntity | null {
  const raw = asRecord(rawValue);
  const coordinates = asArray<unknown>(raw.coordinates);
  const position = asRecord(raw.position);
  const geometryCoordinates = asArray<unknown>(nested(raw.geometry, 'coordinates'));
  const lat = numberFrom(raw.lat, raw.latitude, raw.y, coordinates[1], position.lat, geometryCoordinates[1]);
  const lng = numberFrom(raw.lng, raw.lon, raw.longitude, raw.x, coordinates[0], position.lng, geometryCoordinates[0]);
  const label = textFrom(raw.name, raw.title, raw.callsign, raw.icao24, raw.mmsi, raw.id, raw.place, raw.location, raw.headline) || `${type.toUpperCase()} ${idx + 1}`;
  const magnitude = numberFrom(raw.mag, raw.magnitude, raw.severity, raw.score) || 0;
  const riskBase = type === 'hazard' ? 28 + magnitude * 12 : type === 'incident' ? 42 : type === 'infrastructure' ? 36 : type === 'cyber' ? 48 : type === 'ship' || type === 'aircraft' ? 22 : 18;
  const tags = [type, source.toLowerCase().replace(/\s+/g, '-')];
  if (magnitude >= 5) tags.push('high-magnitude');
  if (raw.country) tags.push(String(raw.country).toLowerCase());
  return {
    id: `${source}:${type}:${textFrom(raw.id, raw.icao24, raw.mmsi, raw.url) || idx}`,
    type,
    label,
    source,
    lat,
    lng,
    region: textFrom(raw.country, raw.region, raw.state, raw.city),
    timestamp: textFrom(raw.time, raw.timestamp, raw.publishedAt, raw.date, raw.updated),
    confidence: source.includes('USGS') ? 92 : source.includes('AIS') ? 72 : source.includes('GDELT') ? 68 : 64,
    risk: clamp(riskBase + Math.min(22, magnitude * 4)),
    summary: textFrom(raw.description, raw.summary, raw.url, raw.type) || `${source} object normalized into Pandora ontology.`,
    tags,
  };
}

function buildEntities(dataValue: unknown): FusionEntity[] {
  const data = asRecord(dataValue);
  const entities: FusionEntity[] = [];
  const add = (items: unknown[], type: FusionEntityType, source: string, limit: number) => {
    items.slice(0, limit).forEach((item, idx) => {
      const entity = entityFromRaw(item, type, source, idx);
      if (entity) entities.push(entity);
    });
  };

  add(asArray(data.gdelt), 'incident', 'GDELT', 80);
  add(asArray(data.earthquakes), 'hazard', 'USGS', 50);
  add(asArray(data.weather_events), 'weather', 'NOAA/Weather', 35);
  add(asArray(data.infrastructure), 'infrastructure', 'Critical Infra', 45);
  add(asArray(data.maritime_ships), 'ship', 'AIS', 60);
  add(asArray(data.dark_vessels), 'ship', 'AIS Dark Vessel', 40);
  add(asArray(data.maritime_dark_activity), 'incident', 'Maritime Dark Activity', 45);
  add(asArray(data.military_flights), 'aircraft', 'ADS-B Military', 35);
  add(asArray(data.commercial_flights), 'aircraft', 'ADS-B', 45);
  add(asArray(data.cameras), 'camera', 'CCTV', 45);
  add(asArray(data.news), 'news', 'OSINT RSS', 35);
  add(asArray(data.cyber_threats), 'cyber', 'Cyber', 35);

  return entities;
}

function buildRelations(entities: FusionEntity[]): FusionRelation[] {
  const relations: FusionRelation[] = [];
  const important = entities.filter(e => typeof e.lat === 'number' && typeof e.lng === 'number').slice(0, 120);
  for (let i = 0; i < important.length; i++) {
    for (let j = i + 1; j < important.length; j++) {
      const a = important[i];
      const b = important[j];
      const d = distanceKm(a, b);
      if (d !== null && d < 180 && relations.length < 90) {
        const label = d < 35 ? 'CO-LOCATED' : 'REGIONAL PROXIMITY';
        relations.push({
          id: `${a.id}->${b.id}`,
          from: a.id,
          to: b.id,
          label,
          weight: clamp(100 - d / 2),
          rationale: `${a.label} and ${b.label} are within ${Math.round(d)} km.`,
        });
      }
    }
  }

  const byRegion = new Map<string, FusionEntity[]>();
  entities.forEach(entity => {
    if (!entity.region) return;
    const key = entity.region.toLowerCase();
    byRegion.set(key, [...(byRegion.get(key) || []), entity]);
  });
  byRegion.forEach(group => {
    group.slice(0, 5).forEach((entity, idx, arr) => {
      const next = arr[idx + 1];
      if (next && relations.length < 120) {
        relations.push({ id: `region:${entity.id}->${next.id}`, from: entity.id, to: next.id, label: 'SAME REGION', weight: 52, rationale: `Both entities reference ${entity.region}.` });
      }
    });
  });
  return relations;
}

function clusterHotspots(entities: FusionEntity[]): FusionHotspot[] {
  const candidates = entities.filter(e => typeof e.lat === 'number' && typeof e.lng === 'number' && ['incident', 'hazard', 'weather', 'infrastructure', 'cyber'].includes(e.type));
  const hotspots = candidates.slice(0, 70).map((entity, idx) => {
    const nearby = candidates.filter(other => {
      const d = distanceKm(entity, other);
      return d !== null && d < 250;
    });
    const score = clamp(entity.risk + nearby.length * 7 + nearby.reduce((sum, e) => sum + e.risk, 0) / Math.max(nearby.length, 1) / 4);
    return {
      id: `hotspot:${idx}:${entity.id}`,
      label: entity.region || entity.label,
      lat: entity.lat!,
      lng: entity.lng!,
      score,
      level: riskLevel(score),
      drivers: [...new Set(nearby.map(e => e.type.toUpperCase()))].slice(0, 4),
    };
  });
  return hotspots.sort((a, b) => b.score - a.score).slice(0, 8);
}

function buildAnomalies(entities: FusionEntity[], hotspots: FusionHotspot[], dataValue: unknown): FusionAnomaly[] {
  const data = asRecord(dataValue);
  const anomalies: FusionAnomaly[] = [];
  hotspots.slice(0, 5).forEach((hotspot, idx) => {
    anomalies.push({
      id: `anomaly:hotspot:${idx}`,
      title: `Hotspot fusion détecté · ${hotspot.label}`,
      level: hotspot.level,
      score: hotspot.score,
      lat: hotspot.lat,
      lng: hotspot.lng,
      explanation: `Cluster multi-source avec signaux ${hotspot.drivers.join(', ') || 'OSINT'} et score ${Math.round(hotspot.score)}.`,
      sources: hotspot.drivers,
      entityIds: entities.filter(e => distanceKm(e, { ...e, lat: hotspot.lat, lng: hotspot.lng }) !== null).slice(0, 6).map(e => e.id),
    });
  });

  const military = asArray(data.military_flights).length;
  const incidents = asArray(data.gdelt).length;
  const hazards = asArray(data.earthquakes).length + asArray(data.weather_events).length;
  const darkVessels = asArray(data.dark_vessels).length;
  if (military > 25) anomalies.push({ id: 'anomaly:air-picture', title: 'Activité aérienne militaire dense', level: 'ELEVATED', score: clamp(48 + military), explanation: `${military} pistes militaires indexées dans l'image opérationnelle.`, sources: ['ADS-B Military'], entityIds: entities.filter(e => e.source === 'ADS-B Military').slice(0, 8).map(e => e.id) });
  if (incidents > 60) anomalies.push({ id: 'anomaly:gdelt-volume', title: 'Volume incident/news élevé', level: 'WATCH', score: clamp(35 + incidents / 2), explanation: `${incidents} événements GDELT actifs : bruit OSINT à surveiller.`, sources: ['GDELT'], entityIds: entities.filter(e => e.source === 'GDELT').slice(0, 8).map(e => e.id) });
  if (hazards > 30) anomalies.push({ id: 'anomaly:hazards', title: 'Exposition hazards multi-zones', level: 'ELEVATED', score: clamp(42 + hazards), explanation: `${hazards} signaux météo/sismiques corrélables aux infrastructures.`, sources: ['USGS', 'Weather'], entityIds: entities.filter(e => ['hazard', 'weather'].includes(e.type)).slice(0, 8).map(e => e.id) });
  if (darkVessels > 0) anomalies.push({ id: 'anomaly:dark-vessels', title: 'Navires fantômes / anomalies AIS détectés', level: darkVessels >= 5 ? 'CRITICAL' : 'ELEVATED', score: clamp(58 + darkVessels * 7), explanation: `${darkVessels} navires ou signaux AIS présentent un comportement suspect : gap AIS, saut impossible, loitering ou proximité chokepoint.`, sources: ['AIS Dark Vessel', 'Maritime Dark Activity'], entityIds: entities.filter(e => e.source === 'AIS Dark Vessel' || e.source === 'Maritime Dark Activity').slice(0, 8).map(e => e.id) });

  return anomalies.sort((a, b) => b.score - a.score).slice(0, 10);
}

function buildSourceHealth(dataValue: unknown): SourceHealth[] {
  const data = asRecord(dataValue);
  return SOURCE_DEFS.map(source => {
    const rows = asArray(data[source.key]).length;
    return {
      key: source.key,
      label: source.label,
      rows,
      confidence: source.confidence,
      status: rows > 0 ? 'ONLINE' : 'STANDBY',
    };
  });
}

export function buildFusionModel(data: unknown): FusionModel {
  const entities = buildEntities(data || {});
  const relations = buildRelations(entities);
  const hotspots = clusterHotspots(entities);
  const anomalies = buildAnomalies(entities, hotspots, data || {});
  const sourceHealth = buildSourceHealth(data || {});
  const activeSources = sourceHealth.filter(s => s.rows > 0).length;
  const anomalyPressure = anomalies.reduce((sum, a) => sum + a.score, 0) / Math.max(1, anomalies.length);
  const score = clamp(18 + activeSources * 4 + anomalyPressure * 0.55 + relations.length * 0.08);
  const posture = riskLevel(score);
  const timeline = [...entities]
    .filter(e => e.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 12);

  const briefingBullets = [
    `Posture globale ${posture} (${Math.round(score)}/100) basée sur ${entities.length.toLocaleString()} entités normalisées et ${relations.length.toLocaleString()} liens.`,
    `${activeSources}/${sourceHealth.length} sources alimentent actuellement l'ontologie Pandora.`,
    anomalies[0] ? `Signal prioritaire : ${anomalies[0].title} — ${anomalies[0].explanation}` : 'Aucune anomalie critique détectée dans les flux chargés.',
    hotspots[0] ? `Zone chaude principale : ${hotspots[0].label} (${Math.round(hotspots[0].score)}/100).` : 'Pas de hotspot géospatial exploitable pour le moment.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    posture,
    score,
    entities,
    relations,
    anomalies,
    hotspots,
    sourceHealth,
    timeline,
    briefingBullets,
  };
}

export function compactFusionSnapshot(model: FusionModel) {
  return {
    generatedAt: model.generatedAt,
    posture: model.posture,
    score: Math.round(model.score),
    entityCount: model.entities.length,
    relationCount: model.relations.length,
    topAnomalies: model.anomalies.slice(0, 6),
    topHotspots: model.hotspots.slice(0, 6),
    sourceHealth: model.sourceHealth,
    timeline: model.timeline.slice(0, 8).map(e => ({ label: e.label, type: e.type, source: e.source, timestamp: e.timestamp, risk: Math.round(e.risk) })),
    briefingBullets: model.briefingBullets,
  };
}