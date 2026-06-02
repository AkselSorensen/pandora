import { NextResponse } from 'next/server';
import { GLOBAL_NEWS_FEEDS } from '@/lib/intel-sources';

export const dynamic = 'force-dynamic';

/**
 * PANDORA — Global Incidents API
 * Uses the public GDELT 2.1 DOC API as the wide global firehose, then
 * falls back to the expanded public RSS catalog when GDELT is unavailable.
 */

const GEO_DICT: Record<string, [number, number]> = {
  ukraine: [31.1656, 48.3794], kyiv: [30.5234, 50.4501], kharkiv: [36.2304, 49.9935], russia: [37.6173, 55.7558],
  moscow: [37.6173, 55.7558], belarus: [27.9534, 53.7098], gaza: [34.4668, 31.5017], israel: [34.8516, 31.0461],
  'tel aviv': [34.7818, 32.0853], palestine: [35.2332, 31.9522], iran: [53.688, 32.4279], tehran: [51.389, 35.6892],
  syria: [38.9968, 34.8021], lebanon: [35.8623, 33.8547], beirut: [35.5018, 33.8938], yemen: [47.5868, 15.5527],
  houthi: [44.2066, 15.3694], sudan: [30.2176, 12.8628], china: [116.4074, 39.9042], taiwan: [120.9605, 23.6978],
  korea: [127.7669, 35.9078], 'north korea': [127.51, 40.3399], usa: [-77.0369, 38.9072], 'united states': [-77.0369, 38.9072],
  myanmar: [95.956, 21.9162], haiti: [-72.2852, 18.9712], somalia: [46.1996, 5.1521], bulgaria: [25.4858, 42.7339],
  serbia: [21.0059, 44.0165], greece: [21.8243, 39.0742], turkey: [35.2433, 38.9637], macedonia: [21.7453, 41.6086],
  romania: [24.9668, 45.9432], france: [2.2137, 46.2276], germany: [10.4515, 51.1657], uk: [-3.4359, 55.3781],
  mexico: [-102.5528, 23.6345], venezuela: [-66.5897, 6.4238], nigeria: [8.6753, 9.082], ethiopia: [40.4897, 9.145],
  libya: [17.2283, 26.3351], egypt: [30.8025, 26.8206], pakistan: [69.3451, 30.3753], india: [78.9629, 20.5937],
  japan: [138.2529, 36.2048], 'south china sea': [115, 15], 'red sea': [38.5, 20], 'black sea': [34, 43.5],
};

const INCIDENT_QUERY = [
  'war', 'attack', 'strike', 'missile', 'drone', 'troops', 'military', 'explosion', 'bomb', 'clash',
  'protest', 'riot', 'coup', 'sanctions', 'earthquake', 'wildfire', 'flood', 'evacuation', 'cyberattack',
].join(' OR ');

const CONFLICT_KEYWORDS = ['attack', 'strike', 'missile', 'drone', 'war', 'troops', 'military', 'protest', 'riot', 'police', 'clash', 'bomb', 'killed', 'forces', 'explosion', 'evacuation', 'earthquake', 'wildfire', 'flood', 'cyberattack'];

function stripHtml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}

function xmlTag(item: string, tag: string) {
  return stripHtml(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
}

function findCoords(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [location, point] of Object.entries(GEO_DICT)) {
    const escaped = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) return point;
  }
  return null;
}

function isIncident(text: string) {
  const lower = text.toLowerCase();
  return CONFLICT_KEYWORDS.some((kw) => lower.includes(kw));
}

async function fetchGdeltEvents() {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', `(${INCIDENT_QUERY})`);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '100');
  url.searchParams.set('sort', 'HybridRel');
  url.searchParams.set('timespan', '24h');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`GDELT request failed: ${res.status}`);
  const data = await res.json();

  return (data.articles || []).flatMap((article: any, index: number) => {
    const title = stripHtml(article.title || 'Untitled GDELT article');
    const text = `${title} ${article.seendate || ''} ${article.domain || ''}`;
    const coords = findCoords(text);
    if (!coords || !isIncident(text)) return [];
    return [{
      id: `gdelt-${index}-${Buffer.from(article.url || title).toString('base64url').slice(0, 16)}`,
      lat: coords[1],
      lng: coords[0],
      name: `[GDELT:${article.domain || 'global'}] ${title}`,
      url: article.url,
      html: `<a href="${article.url}" target="_blank">${title}</a><br/><i>Source: GDELT / ${article.domain || 'unknown'}</i>`,
      type: 'conflict',
      published: article.seendate,
    }];
  });
}

async function fetchRssFallbackEvents() {
  const feeds = GLOBAL_NEWS_FEEDS
    .filter((feed) => ['world', 'regional', 'disaster', 'government'].includes(feed.category))
    .slice(0, 35);
  let eventId = 0;

  const settled = await Promise.allSettled(feeds.map(async (feed) => {
    const res = await fetch(feed.url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 PandoraGDELT/1.0' }, next: { revalidate: 600 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]).slice(0, 8);

    return items.flatMap((item) => {
      const title = xmlTag(item, 'title');
      const link = xmlTag(item, 'link');
      const desc = xmlTag(item, 'description');
      const text = `${title} ${desc}`;
      if (!title || !isIncident(text)) return [];
      const coords = findCoords(text);
      if (!coords) return [];
      return [{
        id: `osint-${feed.name.replace(/\s+/g, '')}-${eventId++}`,
        lat: coords[1],
        lng: coords[0],
        name: `[${feed.name}] ${title}`,
        url: link,
        html: `<a href="${link}" target="_blank">${title}</a><br/><i>Source: ${feed.name}</i>`,
        type: feed.category === 'disaster' ? 'disaster' : 'conflict',
      }];
    });
  }));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

function dedupeEvents(events: any[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = String(event.url || event.name).toLowerCase().replace(/\?.*$/, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET() {
  try {
    let source = 'GDELT 2.1 DOC API';
    let events: any[] = [];
    try {
      events = await fetchGdeltEvents();
    } catch (error) {
      console.warn('GDELT fetch failed, using RSS fallback:', error);
      source = 'Expanded OSINT RSS Mapping fallback';
      events = await fetchRssFallbackEvents();
    }

    const deduped = dedupeEvents(events).slice(0, 300);
    return NextResponse.json({
      events: deduped,
      total: deduped.length,
      timestamp: new Date().toISOString(),
      source,
      fallback_catalog_size: GLOBAL_NEWS_FEEDS.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Global incidents fetch error:', error);
    return NextResponse.json({ events: [], error: 'Failed to fetch global incident data' }, { status: 500 });
  }
}
