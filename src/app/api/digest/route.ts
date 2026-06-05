import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Severity = 'critical' | 'high' | 'medium' | 'low';

type DigestItem = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  source: string;
  timestamp?: string;
  location?: string;
  url?: string;
  summary?: string;
  confidence: number;
  tags: string[];
};

type SourceStatus = {
  key: string;
  label: string;
  ok: boolean;
  count: number;
  error?: string;
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  high: 75,
  medium: 45,
  low: 20,
};

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeSeverity(value: unknown, fallback: Severity = 'medium'): Severity {
  const text = String(value || '').toLowerCase();
  const score = Number(value || 0);
  if (score >= 9 || /critical|severe|red|ransomware|exploited|missile|strike|tsunami|magnitude 7|m7\b/.test(text)) return 'critical';
  if (score >= 7 || /high|orange|war|attack|drone|wildfire|earthquake|malware|cve|kev/.test(text)) return 'high';
  if (score >= 4 || /medium|watch|yellow|flood|storm|protest|phishing|suspicious/.test(text)) return 'medium';
  if (/low|green|minor/.test(text)) return 'low';
  return fallback;
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDate(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function rankItems(items: DigestItem[]) {
  return [...items].sort((a, b) => {
    const severityDelta = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDelta) return severityDelta;
    const timeA = Date.parse(a.timestamp || '') || 0;
    const timeB = Date.parse(b.timestamp || '') || 0;
    return timeB - timeA;
  });
}

function dedupe(items: DigestItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}:${item.title}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 140);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(origin: string, path: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin);
    const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Pandora-Digest/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildMarkdown(digest: {
  generatedAt: string;
  posture: string;
  riskScore: number;
  executiveSummary: string[];
  priorityItems: DigestItem[];
  recommendedActions: string[];
  sourceStatus: SourceStatus[];
}) {
  const lines = [
    '# PANDORA THREAT INTEL DIGEST',
    '',
    `Generated: ${digest.generatedAt}`,
    `Posture: ${digest.posture} (${digest.riskScore}/100)`,
    '',
    '## Executive summary',
    ...digest.executiveSummary.map((line) => `- ${line}`),
    '',
    '## Priority items',
    ...digest.priorityItems.map((item, index) => [
      `${index + 1}. **[${item.severity.toUpperCase()}] ${item.title}**`,
      `   - Category: ${item.category}`,
      `   - Source: ${item.source}`,
      item.location ? `   - Location: ${item.location}` : '',
      item.timestamp ? `   - Time: ${item.timestamp}` : '',
      item.url ? `   - URL: ${item.url}` : '',
    ].filter(Boolean).join('\n')),
    '',
    '## Recommended analyst actions',
    ...digest.recommendedActions.map((action, index) => `${index + 1}. ${action}`),
    '',
    '## Source health',
    ...digest.sourceStatus.map((source) => `- ${source.ok ? 'OK' : 'ERR'} ${source.label}: ${source.count}${source.error ? ` (${source.error})` : ''}`),
    '',
    '> Defensive OSINT digest generated from public/open sources. Validate primary sources before operational decisions.',
  ];
  return lines.join('\n');
}

async function fetchDigestService() {
  const digestUrl = process.env.PANDORA_DIGEST_URL;
  if (!digestUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${digestUrl.replace(/\/$/, '')}/digest`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Pandora-Web-Digest-Proxy/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Digest service HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  try {
    const serviceDigest = await fetchDigestService();
    if (serviceDigest) {
      return NextResponse.json(serviceDigest, { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    console.warn('Pandora digest service unavailable, using Next.js fallback:', error);
  }

  const sourceStatus: SourceStatus[] = [];
  const items: DigestItem[] = [];
  const origin = req.nextUrl.origin;

  const sources = await Promise.allSettled([
    fetchJson(origin, '/api/cyber-threats', 14000),
    fetchJson(origin, '/api/gdelt', 9000),
    fetchJson(origin, '/api/earthquakes', 8000),
    fetchJson(origin, '/api/fires', 8000),
    fetchJson(origin, '/api/weather', 8000),
    fetchJson(origin, '/api/space-weather', 8000),
  ]);

  const [cyber, gdelt, earthquakes, fires, weather, spaceWeather] = sources;

  if (cyber.status === 'fulfilled') {
    const threats = asArray(cyber.value.threats).slice(0, 80);
    sourceStatus.push({ key: 'cyber', label: 'Cyber Threats', ok: true, count: threats.length });
    threats.forEach((threat: any, index) => items.push({
      id: String(threat.id || `cyber-${index}`),
      title: stripHtml(threat.title || 'Cyber threat'),
      category: 'Cyber',
      severity: normalizeSeverity(threat.severity, 'high'),
      source: String(threat.source || 'Cyber feed'),
      timestamp: safeDate(threat.timestamp),
      url: typeof threat.details?.permalink === 'string' ? threat.details.permalink : typeof threat.details?.url === 'string' ? threat.details.url : undefined,
      summary: stripHtml(threat.details?.shortDescription || threat.details?.description || threat.details?.excerpt || ''),
      confidence: threat.source === 'CISA KEV' ? 95 : 75,
      tags: ['cyber', String(threat.severity || '').toLowerCase()].filter(Boolean),
    }));
  } else {
    sourceStatus.push({ key: 'cyber', label: 'Cyber Threats', ok: false, count: 0, error: String(cyber.reason?.message || cyber.reason) });
  }

  if (gdelt.status === 'fulfilled') {
    const events = asArray(gdelt.value.events).slice(0, 80);
    sourceStatus.push({ key: 'gdelt', label: 'Global Incidents', ok: true, count: events.length });
    events.forEach((event: any, index) => items.push({
      id: String(event.id || `gdelt-${index}`),
      title: stripHtml(event.name || 'Global incident'),
      category: event.type === 'disaster' ? 'Disaster / News' : 'Geopolitical',
      severity: normalizeSeverity(event.name, 'medium'),
      source: String(gdelt.value.source || 'GDELT / RSS'),
      timestamp: safeDate(event.published),
      location: typeof event.lat === 'number' && typeof event.lng === 'number' ? `${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}` : undefined,
      url: event.url,
      summary: stripHtml(event.html || event.name || ''),
      confidence: gdelt.value.source?.includes('GDELT') ? 78 : 62,
      tags: ['news', event.type || 'incident'],
    }));
  } else {
    sourceStatus.push({ key: 'gdelt', label: 'Global Incidents', ok: false, count: 0, error: String(gdelt.reason?.message || gdelt.reason) });
  }

  if (earthquakes.status === 'fulfilled') {
    const quakes = asArray(earthquakes.value.earthquakes).filter((eq: any) => Number(eq.magnitude || 0) >= 4.5).slice(0, 40);
    sourceStatus.push({ key: 'earthquakes', label: 'USGS Earthquakes', ok: true, count: quakes.length });
    quakes.forEach((eq: any) => items.push({
      id: String(eq.id),
      title: `M${Number(eq.magnitude || 0).toFixed(1)} earthquake — ${eq.place || 'unknown location'}`,
      category: 'Natural Hazard',
      severity: Number(eq.magnitude || 0) >= 6.5 ? 'critical' : Number(eq.magnitude || 0) >= 5.5 ? 'high' : 'medium',
      source: 'USGS',
      timestamp: typeof eq.time === 'number' ? new Date(eq.time).toISOString() : safeDate(eq.time),
      location: eq.place,
      url: eq.url,
      summary: `Depth ${Math.round(Number(eq.depth || 0))}km${eq.tsunami ? ' · tsunami flag' : ''}`,
      confidence: 96,
      tags: ['earthquake', `m${Math.floor(Number(eq.magnitude || 0))}`],
    }));
  } else {
    sourceStatus.push({ key: 'earthquakes', label: 'USGS Earthquakes', ok: false, count: 0, error: String(earthquakes.reason?.message || earthquakes.reason) });
  }

  if (fires.status === 'fulfilled') {
    const fireItems = asArray(fires.value.fires || fires.value.events).slice(0, 30);
    sourceStatus.push({ key: 'fires', label: 'Active Fires', ok: true, count: fireItems.length });
    fireItems.slice(0, 12).forEach((fire: any, index) => items.push({
      id: String(fire.id || `fire-${index}`),
      title: stripHtml(fire.title || fire.name || 'Active fire / thermal anomaly'),
      category: 'Natural Hazard',
      severity: 'medium',
      source: String(fire.source || 'NASA FIRMS / EONET'),
      timestamp: safeDate(fire.date || fire.time),
      location: typeof fire.lat === 'number' && typeof fire.lng === 'number' ? `${fire.lat.toFixed(2)}, ${fire.lng.toFixed(2)}` : undefined,
      url: fire.url,
      confidence: 70,
      tags: ['fire', 'thermal'],
    }));
  } else {
    sourceStatus.push({ key: 'fires', label: 'Active Fires', ok: false, count: 0, error: String(fires.reason?.message || fires.reason) });
  }

  if (weather.status === 'fulfilled') {
    const wx = asArray(weather.value.events || weather.value.weather_events).slice(0, 30);
    sourceStatus.push({ key: 'weather', label: 'Severe Weather', ok: true, count: wx.length });
    wx.slice(0, 12).forEach((event: any, index) => items.push({
      id: String(event.id || `weather-${index}`),
      title: stripHtml(event.title || event.name || event.type || 'Severe weather event'),
      category: 'Weather',
      severity: normalizeSeverity(event.severity || event.title, 'medium'),
      source: String(event.source || 'Public weather feed'),
      timestamp: safeDate(event.date || event.time),
      location: event.location || (typeof event.lat === 'number' && typeof event.lng === 'number' ? `${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}` : undefined),
      url: event.url,
      confidence: 70,
      tags: ['weather', event.type || 'alert'],
    }));
  } else {
    sourceStatus.push({ key: 'weather', label: 'Severe Weather', ok: false, count: 0, error: String(weather.reason?.message || weather.reason) });
  }

  if (spaceWeather.status === 'fulfilled') {
    const sw = spaceWeather.value || {};
    const kp = Number(sw.kp_index || sw.kp || 0);
    sourceStatus.push({ key: 'space-weather', label: 'NOAA Space Weather', ok: true, count: kp ? 1 : 0 });
    if (kp >= 4) {
      items.push({
        id: 'space-weather-kp',
        title: `Geomagnetic activity elevated — Kp ${kp}`,
        category: 'Space Weather / GNSS',
        severity: kp >= 7 ? 'critical' : kp >= 5 ? 'high' : 'medium',
        source: 'NOAA SWPC',
        timestamp: new Date().toISOString(),
        summary: 'Potential HF radio, aurora and GNSS degradation watch.',
        confidence: 85,
        tags: ['space-weather', 'gnss'],
      });
    }
  } else {
    sourceStatus.push({ key: 'space-weather', label: 'NOAA Space Weather', ok: false, count: 0, error: String(spaceWeather.reason?.message || spaceWeather.reason) });
  }

  const priorityItems = rankItems(dedupe(items)).slice(0, 18);
  const counts = priorityItems.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const riskScore = Math.min(100, Math.round(priorityItems.reduce((sum, item) => sum + SEVERITY_WEIGHT[item.severity] * (item.confidence / 100), 0) / Math.max(1, Math.min(priorityItems.length, 10))));
  const posture = riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'ELEVATED' : riskScore >= 35 ? 'WATCH' : 'ROUTINE';

  const executiveSummary = [
    `${priorityItems.length} signaux prioritaires retenus sur ${items.length} signaux collectés.` ,
    `${counts.critical || 0} critique(s), ${counts.high || 0} haut(s), ${counts.medium || 0} moyen(s).`,
    `Dominantes: ${Object.entries(counts).filter(([key]) => !['critical', 'high', 'medium', 'low'].includes(key)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, value]) => `${key} (${value})`).join(' · ') || 'aucune dominance claire'}.`,
    `Couverture sources: ${sourceStatus.filter((s) => s.ok).length}/${sourceStatus.length} connecteurs actifs.`,
  ];

  const recommendedActions = [
    priorityItems[0] ? `Qualifier le signal prioritaire: “${priorityItems[0].title}”.` : 'Activer davantage de sources pour densifier le digest.',
    'Comparer les signaux critiques avec au moins deux sources primaires avant décision.',
    counts.Cyber ? 'Vérifier exposition des actifs suivis et prioriser CISA KEV / CVE critiques.' : 'Maintenir une veille cyber légère et surveiller CISA KEV.',
    counts['Natural Hazard'] ? 'Croiser risques naturels avec infrastructures critiques, ports, vols et news locales.' : 'Surveiller les alertes naturelles en arrière-plan.',
    'Créer un dossier analyste si un même lieu ou thème persiste sur plusieurs cycles.',
  ];

  const digest = {
    generatedAt: new Date().toISOString(),
    posture,
    riskScore,
    executiveSummary,
    priorityItems,
    counts,
    recommendedActions,
    sourceStatus,
    markdown: '',
  };

  digest.markdown = buildMarkdown(digest);

  return NextResponse.json(digest, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
