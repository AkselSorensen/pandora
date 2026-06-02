import axios from 'axios';
import * as cheerio from 'cheerio';
import { SocksProxyAgent } from 'socks-proxy-agent';

export interface DarkWebAlert {
  id: string;
  title: string;
  source: string;
  forum: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
  details: Record<string, unknown>;
}

interface ForumConfig {
  name: string;
  url: string;
  network?: 'tor' | 'i2p' | 'http';
  selectors?: {
    item?: string;
    title?: string;
    author?: string;
    time?: string;
    content?: string;
    link?: string;
  };
}

const DEFAULT_SELECTORS = {
  item: 'article, .post, .topic, .thread, li',
  title: 'h1, h2, h3, .title, .post-title, .topic-title, a',
  author: '.author, .username, .user, [rel="author"]',
  time: 'time, .date, .timestamp',
  content: '.content, .post-content, .body, p',
  link: 'a',
};

function parseForumConfig(): ForumConfig[] {
  const raw = process.env.DARKWEB_FORUMS_JSON || process.env.DARKWEB_FORUMS || '';
  if (!raw.trim()) return [];

  if (raw.trim().startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('DARKWEB_FORUMS_JSON must be a JSON array');
    return parsed;
  }

  return raw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ name: new URL(url).hostname, url }));
}

function inferNetwork(url: string, configured?: ForumConfig['network']): ForumConfig['network'] {
  if (configured) return configured;
  if (url.includes('.onion')) return 'tor';
  if (url.includes('.i2p')) return 'i2p';
  return 'http';
}

function severityFromText(value: string): DarkWebAlert['severity'] {
  const text = value.toLowerCase();
  if (/zero[-\s]?day|rce|exploit|credential dump|database leak|ransomware|initial access/.test(text)) return 'critical';
  if (/leak|stolen|malware|botnet|phishing|ddos|cve|access/.test(text)) return 'high';
  if (/market|forum|sale|dump|breach/.test(text)) return 'medium';
  return 'low';
}

function getProxyAgent(network: ForumConfig['network']) {
  if (network === 'tor') {
    const proxy = process.env.TOR_SOCKS_PROXY || 'socks5h://127.0.0.1:9050';
    return new SocksProxyAgent(proxy);
  }
  if (network === 'i2p') {
    const proxy = process.env.I2P_HTTP_PROXY;
    return proxy ? new URL(proxy) : undefined;
  }
  return undefined;
}

async function scrapeForum(forum: ForumConfig): Promise<DarkWebAlert[]> {
  const network = inferNetwork(forum.url, forum.network);
  const agent = getProxyAgent(network);
  const selectors = { ...DEFAULT_SELECTORS, ...(forum.selectors || {}) };

  const response = await axios.get(forum.url, {
    timeout: Number(process.env.DARKWEB_TIMEOUT_MS || 30000),
    httpAgent: agent,
    httpsAgent: agent,
    proxy: false,
    headers: {
      'User-Agent': process.env.DARKWEB_USER_AGENT || 'Mozilla/5.0 PandoraRecon/1.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 3,
  });

  const $ = cheerio.load(response.data);
  const alerts: DarkWebAlert[] = [];

  $(selectors.item).each((index: number, element: any) => {
    const title = $(element).find(selectors.title).first().text().trim();
    const content = $(element).find(selectors.content).first().text().trim();
    if (!title && !content) return;

    const author = $(element).find(selectors.author).first().text().trim() || forum.name;
    const timeElement = $(element).find(selectors.time).first();
    const timestamp = timeElement.attr('datetime') || timeElement.text().trim() || new Date().toISOString();
    const href = $(element).find(selectors.link).first().attr('href') || forum.url;
    const absoluteUrl = href.startsWith('http') ? href : new URL(href, forum.url).toString();
    const combinedText = `${title} ${content}`;

    alerts.push({
      id: `${forum.name}-${index}-${Buffer.from(absoluteUrl).toString('base64url').slice(0, 12)}`,
      title: title || content.slice(0, 120),
      source: author,
      forum: forum.name,
      severity: severityFromText(combinedText),
      timestamp: Number.isNaN(Date.parse(timestamp)) ? new Date().toISOString() : new Date(timestamp).toISOString(),
      details: {
        url: absoluteUrl,
        network,
        excerpt: content.slice(0, 500),
      },
    });
  });

  return alerts;
}

export async function monitorConfiguredDarkWebForums(): Promise<DarkWebAlert[]> {
  const forums = parseForumConfig();
  if (forums.length === 0) {
    throw new Error('No dark web forums configured. Set DARKWEB_FORUMS or DARKWEB_FORUMS_JSON.');
  }

  const settled = await Promise.allSettled(forums.map(scrapeForum));
  const alerts = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  if (alerts.length === 0) {
    const errors = settled
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => String(result.reason?.message || result.reason));
    throw new Error(errors.join(' | ') || 'Configured dark web forums returned no parseable records.');
  }

  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}