import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_NEWS_FEEDS, type NewsRegion, type RssFeedSource } from '@/lib/intel-sources';

/**
 * PANDORA — Global News Intelligence API
 * Broad public RSS/Atom aggregation with risk scoring, de-duplication,
 * lightweight geo mapping and safe per-source timeouts.
 */

const BG_NEWS_SOURCES = new Set(['Dnevnik BG', 'Actualno BG', 'Mediapool BG', 'Novinite BG', 'BTA English', 'Sofia Globe']);
const SOFIA_COORDS: [number, number] = [42.698, 25.485];

const RSS_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PANDORA/1.0; OSINT feed aggregator)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
};

const RISK_KEYWORDS = [
  'war', 'missile', 'strike', 'attack', 'crisis', 'tension', 'military', 'conflict', 'defense', 'defence',
  'clash', 'nuclear', 'invasion', 'bomb', 'drone', 'weapon', 'sanctions', 'ceasefire', 'escalation',
  'ransomware', 'malware', 'breach', 'zero-day', 'cve', 'exploit', 'earthquake', 'wildfire', 'flood', 'cyclone',
  'terror', 'hostage', 'riot', 'protest', 'coup', 'martial law', 'evacuation', 'explosion', 'chemical', 'radiation',
];

const KEYWORD_COORDS: Record<string, [number, number]> = {
  ukraine: [49.487, 31.272], kyiv: [50.45, 30.523], kharkiv: [49.993, 36.23], russia: [61.524, 105.318],
  moscow: [55.755, 37.617], belarus: [53.71, 27.953], poland: [51.919, 19.145], moldova: [47.411, 28.369],
  israel: [31.046, 34.851], gaza: [31.416, 34.333], rafah: [31.296, 34.244], jerusalem: [31.768, 35.214],
  iran: [32.427, 53.688], tehran: [35.689, 51.389], lebanon: [33.854, 35.862], beirut: [33.893, 35.502],
  syria: [34.802, 38.996], damascus: [33.513, 36.292], iraq: [33.223, 43.679], baghdad: [33.315, 44.366],
  yemen: [15.552, 48.516], sanaa: [15.369, 44.191], china: [35.861, 104.195], taiwan: [23.697, 120.96],
  'north korea': [40.339, 127.51], 'south korea': [35.907, 127.766], japan: [36.204, 138.252],
  afghanistan: [33.939, 67.709], pakistan: [30.375, 69.345], india: [20.593, 78.962], myanmar: [21.916, 95.956],
  sudan: [12.862, 30.217], nigeria: [9.082, 8.675], egypt: [26.82, 30.802], libya: [26.335, 17.228],
  somalia: [5.152, 46.199], ethiopia: [9.145, 40.489], kenya: [-0.024, 37.906], 'south africa': [-30.559, 22.937],
  venezuela: [7.119, -66.589], mexico: [23.634, -102.552], haiti: [18.971, -72.285], brazil: [-14.235, -51.925],
  argentina: [-38.416, -63.616], 'united states': [38.907, -77.036], washington: [38.907, -77.036], canada: [56.13, -106.346],
  europe: [48.8, 2.3], 'middle east': [31.5, 34.8], africa: [0, 25], asia: [34, 100],
  'south china sea': [15, 115], 'red sea': [20, 38.5], 'persian gulf': [26.5, 51.5], 'strait of hormuz': [26.6, 56.3],
  'black sea': [43.5, 34], arctic: [75, 0], bulgaria: [42.698, 25.485], sofia: [42.698, 25.485],
  plovdiv: [42.136, 24.745], varna: [43.214, 27.915], burgas: [42.504, 27.462], ruse: [43.835, 25.965],
  balkans: [42, 22], greece: [39.074, 21.824], serbia: [44.016, 21.005], romania: [45.943, 24.967],
  turkey: [39, 35], france: [46.228, 2.214], germany: [51.166, 10.452], london: [51.507, -0.128], paris: [48.857, 2.352],
};

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function stripHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return stripHtml(m?.[1] || m?.[2] || '');
}

function getAtomLink(xml: string) {
  return xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] || '';
}

function parseFeedItems(xml: string): any[] {
  const rssItems = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atomItems = rssItems.length ? [] : [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const blocks = rssItems.length ? rssItems : atomItems;

  return blocks.map((itemXml) => ({
    title: getTag(itemXml, 'title'),
    link: getTag(itemXml, 'link') || getAtomLink(itemXml),
    pubDate: getTag(itemXml, 'pubDate') || getTag(itemXml, 'published') || getTag(itemXml, 'updated') || getTag(itemXml, 'dc:date'),
    description: (getTag(itemXml, 'description') || getTag(itemXml, 'summary') || getTag(itemXml, 'content')).substring(0, 450),
  })).filter((item) => item.title);
}

function scoreRisk(title: string, summary: string, category?: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = category === 'disaster' || category === 'cyber' || category === 'conflict' ? 2 : 1;
  for (const kw of RISK_KEYWORDS) if (text.includes(kw)) score += 2;
  return Math.min(10, score);
}

function findCoords(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [keyword, coords] of Object.entries(KEYWORD_COORDS)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) return coords;
  }
  return null;
}

function dedupeArticles(items: any[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.link || item.title).toLowerCase().replace(/\?.*$/, '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') as NewsRegion | null;
    const category = searchParams.get('category');
    const perFeed = clampNumber(searchParams.get('perFeed'), 8, 1, 20);
    const limit = clampNumber(searchParams.get('limit'), 250, 25, 500);
    const maxFeeds = clampNumber(searchParams.get('maxFeeds'), 80, 10, 120);

    const feeds = GLOBAL_NEWS_FEEDS
      .filter((feed) => !region || region === 'global' || feed.region === region || feed.region === 'global')
      .filter((feed) => !category || feed.category === category)
      .slice(0, maxFeeds);

    const feedPromises = feeds.map(async (feed: RssFeedSource) => {
      try {
        const res = await fetch(feed.url, { signal: AbortSignal.timeout(7000), headers: RSS_FETCH_HEADERS, next: { revalidate: 600 } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseFeedItems(xml).slice(0, perFeed).map((item) => ({ ...item, source: feed.name, region: feed.region, category: feed.category }));
      } catch {
        return [];
      }
    });

    const feedResults = await Promise.allSettled(feedPromises);
    const allArticles = feedResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

    const newsItems = dedupeArticles(allArticles).map((article) => {
      const riskScore = scoreRisk(article.title, article.description || '', article.category);
      const keywordCoords = findCoords(`${article.title} ${article.description || ''}`);
      const coords = keywordCoords ?? (BG_NEWS_SOURCES.has(article.source) ? SOFIA_COORDS : null);

      return {
        title: article.title,
        link: article.link,
        published: article.pubDate || new Date().toISOString(),
        source: article.source,
        region: article.region,
        category: article.category,
        risk_score: riskScore,
        coords: coords ? [coords[0], coords[1]] : null,
        coords_default: !keywordCoords && BG_NEWS_SOURCES.has(article.source),
        machine_assessment: null,
      };
    });

    newsItems.sort((a, b) => {
      const riskDelta = b.risk_score - a.risk_score;
      if (riskDelta) return riskDelta;
      return Date.parse(b.published || '') - Date.parse(a.published || '');
    });

    return NextResponse.json({
      news: newsItems.slice(0, limit),
      total: Math.min(newsItems.length, limit),
      collected: newsItems.length,
      feeds_requested: feeds.length,
      feeds_configured: GLOBAL_NEWS_FEEDS.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (error) {
    console.error('News fetch error:', error);
    return NextResponse.json({ news: [], error: 'Failed to fetch news' }, { status: 500 });
  }
}
