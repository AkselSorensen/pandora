import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0 Pandora-OSINT/1.0';
const GDELT_DOC_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';

interface OSINTResult {
  id: string;
  title: string;
  source: string;
  url: string;
  content: string;
  timestamp: string;
  platform: 'twitter' | 'facebook' | 'linkedin' | 'web';
}

interface OSINTQuery {
  query: string;
  platforms: ('twitter' | 'facebook' | 'linkedin' | 'web')[];
  maxResults?: number;
}

type RawArticle = {
  title: string;
  source: string;
  url: string;
  content: string;
  timestamp?: string;
};

function cleanText(value: string | undefined | null): string {
  return (value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return cleanText(match?.[1]);
}

function decodeDuckDuckGoUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://duckduckgo.com${url}`);
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return url;
  }
}

function toResult(article: RawArticle, platform: OSINTResult['platform'], index: number, prefix: string): OSINTResult {
  return {
    id: `${prefix}-${index}-${Date.now()}`,
    title: article.title || article.url,
    source: article.source,
    url: article.url,
    content: article.content || article.title,
    timestamp: article.timestamp || new Date().toISOString(),
    platform,
  };
}

function dedupeResults(results: OSINTResult[]): OSINTResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = (result.url || result.title).toLowerCase().split('?')[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(result.title && result.url);
  });
}

async function searchDuckDuckGo(query: string, maxResults: number, platform: OSINTResult['platform'] = 'web'): Promise<OSINTResult[]> {
  const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 9000,
  });

  const $ = cheerio.load(response.data);
  const results: OSINTResult[] = [];
  $('.result').slice(0, maxResults).each((index, element) => {
    const link = $(element).find('a.result__a').first();
    const title = cleanText(link.text());
    const url = decodeDuckDuckGoUrl(link.attr('href') || '');
    const content = cleanText($(element).find('.result__snippet').text());
    const source = cleanText($(element).find('.result__url').text()) || 'DuckDuckGo';
    if (title && url) {
      results.push(toResult({ title, source, url, content }, platform, index, `duckduckgo-${platform}`));
    }
  });
  return results;
}

async function searchGoogleNews(query: string, maxResults: number): Promise<OSINTResult[]> {
  const response = await axios.get(`${GOOGLE_NEWS_RSS_URL}?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 9000,
  });
  const items = String(response.data).match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, maxResults).map((item, index) => {
    const title = xmlTag(item, 'title');
    const url = xmlTag(item, 'link');
    const source = xmlTag(item, 'source') || 'Google News';
    const content = xmlTag(item, 'description') || title;
    const pubDate = xmlTag(item, 'pubDate');
    return toResult({ title, source, url, content, timestamp: pubDate ? new Date(pubDate).toISOString() : undefined }, 'web', index, 'google-news');
  }).filter((result) => result.title && result.url);
}

async function searchGdelt(query: string, maxResults: number): Promise<OSINTResult[]> {
  const url = `${GDELT_DOC_URL}?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=${Math.min(maxResults, 250)}&sort=HybridRel&timespan=30d`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 9000,
  });
  const articles = (response.data?.articles || []) as { title?: string; domain?: string; url?: string; seendate?: string; sourceCountry?: string }[];
  return articles.slice(0, maxResults).map((article, index) => toResult({
    title: article.title || '',
    source: article.domain || 'GDELT',
    url: article.url || '',
    content: `${article.domain || 'GDELT'}${article.sourceCountry ? ` • ${article.sourceCountry}` : ''}`,
    timestamp: article.seendate ? new Date(article.seendate).toISOString() : undefined,
  }, 'web', index, 'gdelt')).filter((result) => result.title && result.url);
}

async function searchInternetArchive(query: string, maxResults: number): Promise<OSINTResult[]> {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=date&rows=${Math.min(maxResults, 50)}&page=1&output=json`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 9000,
  });
  const docs = (response.data?.response?.docs || []) as { identifier?: string; title?: string; description?: string; date?: string }[];
  return docs.slice(0, maxResults).map((doc, index) => toResult({
    title: doc.title || doc.identifier || 'Internet Archive item',
    source: 'Internet Archive',
    url: doc.identifier ? `https://archive.org/details/${encodeURIComponent(doc.identifier)}` : 'https://archive.org',
    content: cleanText(doc.description) || 'Archived public document / media entry.',
    timestamp: doc.date ? new Date(doc.date).toISOString() : undefined,
  }, 'web', index, 'archive')).filter((result) => result.title && result.url);
}

export async function scrapeTwitter(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    return await searchDuckDuckGo(`site:x.com OR site:twitter.com ${query}`, maxResults, 'twitter');
  } catch (error) {
    console.error('Twitter scraping error:', error);
    throw new Error('Failed to scrape Twitter');
  }
}

function fallbackResults(query: string, platform: OSINTResult['platform'], maxResults: number): OSINTResult[] {
  const sources: Record<OSINTResult['platform'], { name: string; url: (q: string) => string; title: string }[]> = {
    twitter: [
      { name: 'X/Twitter Search', title: 'Open X/Twitter search', url: (q) => `https://twitter.com/search?q=${encodeURIComponent(q)}` },
      { name: 'Nitter Search', title: 'Open public Nitter search', url: (q) => `https://nitter.net/search?f=tweets&q=${encodeURIComponent(q)}` },
    ],
    facebook: [
      { name: 'Facebook Search', title: 'Open Facebook public search', url: (q) => `https://www.facebook.com/search/top?q=${encodeURIComponent(q)}` },
    ],
    linkedin: [
      { name: 'LinkedIn Search', title: 'Open LinkedIn public search', url: (q) => `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}` },
    ],
    web: [
      { name: 'DuckDuckGo', title: 'Open DuckDuckGo web search', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
      { name: 'Google News', title: 'Open Google News search', url: (q) => `https://news.google.com/search?q=${encodeURIComponent(q)}` },
      { name: 'Internet Archive', title: 'Open Internet Archive text search', url: (q) => `https://archive.org/search?query=${encodeURIComponent(q)}` },
    ],
  };

  return sources[platform].slice(0, Math.max(1, Math.min(maxResults, sources[platform].length))).map((source, index) => ({
    id: `fallback-${platform}-${index}-${Date.now()}`,
    title: `${source.title}: ${query}`,
    source: source.name,
    url: source.url(query),
    content: `Direct scraping for ${platform} can be blocked by anti-bot or login requirements. This fallback opens a public search for "${query}".`,
    timestamp: new Date().toISOString(),
    platform,
  }));
}

export async function scrapeFacebook(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    return await searchDuckDuckGo(`site:facebook.com ${query}`, maxResults, 'facebook');
  } catch (error) {
    console.error('Facebook scraping error:', error);
    throw new Error('Failed to scrape Facebook');
  }
}

export async function scrapeLinkedIn(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    return await searchDuckDuckGo(`site:linkedin.com/in OR site:linkedin.com/company ${query}`, maxResults, 'linkedin');
  } catch (error) {
    console.error('LinkedIn scraping error:', error);
    throw new Error('Failed to scrape LinkedIn');
  }
}

export async function scrapeWeb(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  const perSource = Math.max(3, Math.ceil(maxResults / 3));
  const settled = await Promise.allSettled([
    searchGoogleNews(query, perSource),
    searchGdelt(query, perSource),
    searchDuckDuckGo(query, perSource, 'web'),
    searchInternetArchive(query, Math.max(2, Math.ceil(maxResults / 4))),
  ]);
  const results = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
  return dedupeResults(results).slice(0, maxResults);
}

export async function runOSINTQuery(query: OSINTQuery): Promise<OSINTResult[]> {
  const { query: searchQuery, platforms, maxResults = 10 } = query;
  const allResults: OSINTResult[] = [];
  
  for (const platform of platforms) {
    try {
      let results: OSINTResult[] = [];
      
      switch (platform) {
        case 'twitter':
          results = await scrapeTwitter(searchQuery, maxResults);
          break;
        case 'facebook':
          results = await scrapeFacebook(searchQuery, maxResults);
          break;
        case 'linkedin':
          results = await scrapeLinkedIn(searchQuery, maxResults);
          break;
        case 'web':
          results = await scrapeWeb(searchQuery, maxResults);
          break;
      }

      results = dedupeResults(results).slice(0, maxResults);

      if (results.length === 0) {
        results = fallbackResults(searchQuery, platform, maxResults);
      }
      
      allResults.push(...results);
    } catch (error) {
      console.warn(`Failed to scrape ${platform}:`, error);
      allResults.push(...fallbackResults(searchQuery, platform, maxResults));
    }
  }
  
  // Trier par timestamp (le plus récent en premier)
  return allResults.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function generateOSINTReport(query: OSINTQuery): Promise<{
  results: OSINTResult[];
  summary: string;
  html: string;
}> {
  const results = await runOSINTQuery(query);
  
  // Générer un résumé
  const summary = `OSINT query for "${query.query}" returned ${results.length} results ` +
                  `across ${query.platforms.length} platforms. ` +
                  `Found ${results.filter(r => r.platform === 'twitter').length} Twitter posts, ` +
                  `${results.filter(r => r.platform === 'facebook').length} Facebook posts, ` +
                  `${results.filter(r => r.platform === 'linkedin').length} LinkedIn posts, and ` +
                  `${results.filter(r => r.platform === 'web').length} web results.`;
  
  // Générer un HTML simple
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OSINT Report: ${query.query}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .result { border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; }
        .platform { color: #666; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <h1>OSINT Report: ${query.query}</h1>
      <p>${summary}</p>
      <h2>Results</h2>
      ${results.map(result => `
        <div class="result">
          <h3>${result.title}</h3>
          <div class="platform">${result.source} • ${new Date(result.timestamp).toLocaleString()}</div>
          <p>${result.content}</p>
          <a href="${result.url}" target="_blank">View Source</a>
        </div>
      `).join('')}
    </body>
    </html>
  `;
  
  return { results, summary, html };
}