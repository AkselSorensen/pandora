import { NextResponse } from 'next/server';
import { CYBER_RSS_FEEDS } from '@/lib/intel-sources';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface ThreatRecord {
  id: string;
  title: string;
  source: string;
  severity: Severity;
  timestamp?: string;
  details?: Record<string, unknown>;
}

const nowIso = () => new Date().toISOString();

function normalizeSeverity(value: unknown): Severity {
  const score = typeof value === 'number' ? value : Number(value || 0);
  const text = String(value || '').toLowerCase();
  if (score >= 9 || /critical|ransomware|botnet|malware|exploited/.test(text)) return 'critical';
  if (score >= 7 || /high|cve|phishing|trojan|stealer|rat/.test(text)) return 'high';
  if (score >= 4 || /medium|suspicious|scan/.test(text)) return 'medium';
  return 'low';
}

function asIso(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? nowIso() : new Date(parsed).toISOString();
}

function stripHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlTag(item: string, tag: string) {
  return item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() || '';
}

async function fetchCisaKnownExploited(): Promise<ThreatRecord[]> {
  const response = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`CISA KEV request failed: ${response.status}`);
  const data = await response.json();
  return (data.vulnerabilities || []).slice(0, 35).map((vuln: any): ThreatRecord => ({
    id: `cisa-${vuln.cveID}`,
    title: `${vuln.cveID} — ${vuln.vulnerabilityName || `${vuln.vendorProject || 'Unknown'} ${vuln.product || ''}`}`.trim(),
    source: 'CISA KEV',
    severity: 'critical',
    timestamp: asIso(vuln.dateAdded),
    details: {
      cve: vuln.cveID,
      vendorProject: vuln.vendorProject,
      product: vuln.product,
      shortDescription: vuln.shortDescription,
      requiredAction: vuln.requiredAction,
      dueDate: vuln.dueDate,
      notes: vuln.notes,
    },
  }));
}

async function fetchNvdRecentCves(): Promise<ThreatRecord[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 7);
  const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
  url.searchParams.set('pubStartDate', start.toISOString());
  url.searchParams.set('pubEndDate', end.toISOString());
  url.searchParams.set('cvssV3Severity', 'CRITICAL');

  const response = await fetch(url.toString(), { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error(`NVD CVE request failed: ${response.status}`);
  const data = await response.json();

  return (data.vulnerabilities || []).slice(0, 25).map((entry: any): ThreatRecord => {
    const cve = entry.cve || {};
    const metric = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV2?.[0] || {};
    const cvss = metric.cvssData || {};
    const description = (cve.descriptions || []).find((item: any) => item.lang === 'en')?.value || cve.id;
    return {
      id: `nvd-${cve.id}`,
      title: `${cve.id} — ${description.slice(0, 96)}`,
      source: 'NVD CVE 2.0',
      severity: normalizeSeverity(cvss.baseScore || cvss.baseSeverity || 'high'),
      timestamp: asIso(cve.published),
      details: {
        cve: cve.id,
        description,
        baseScore: cvss.baseScore,
        vectorString: cvss.vectorString,
        references: (cve.references?.referenceData || cve.references || []).slice(0, 8),
      },
    };
  });
}

async function fetchGithubSecurityAdvisories(): Promise<ThreatRecord[]> {
  const query = `
    query RecentAdvisories {
      securityAdvisories(first: 25, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          ghsaId
          summary
          severity
          updatedAt
          publishedAt
          permalink
          identifiers { type value }
          vulnerabilities(first: 5) { nodes { package { name ecosystem } vulnerableVersionRange } }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error(`GitHub advisories request failed: ${response.status}`);
  const data = await response.json();
  if (data.errors?.length) throw new Error(data.errors.map((err: any) => err.message).join(' | '));

  return (data.data?.securityAdvisories?.nodes || []).map((advisory: any): ThreatRecord => ({
    id: `github-${advisory.ghsaId}`,
    title: `${advisory.ghsaId} — ${advisory.summary}`,
    source: 'GitHub Security Advisories',
    severity: normalizeSeverity(advisory.severity),
    timestamp: asIso(advisory.updatedAt || advisory.publishedAt),
    details: {
      permalink: advisory.permalink,
      identifiers: advisory.identifiers,
      vulnerabilities: advisory.vulnerabilities?.nodes,
    },
  }));
}

async function fetchUrlhaus(): Promise<ThreatRecord[]> {
  const response = await fetch('https://urlhaus.abuse.ch/downloads/json_recent/', { next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`URLhaus request failed: ${response.status}`);
  const data = await response.json();
  return Object.entries(data || {}).slice(0, 30).map(([id, item]: [string, any]): ThreatRecord => ({
    id: `urlhaus-${id}`,
    title: `${item.threat || 'malware URL'} — ${item.url || id}`,
    source: 'abuse.ch URLhaus',
    severity: normalizeSeverity(item.threat || 'malware'),
    timestamp: asIso(item.date_added),
    details: {
      url: item.url,
      host: item.urlhaus_reference,
      tags: item.tags,
      reporter: item.reporter,
      status: item.url_status,
    },
  }));
}

async function fetchThreatFox(): Promise<ThreatRecord[]> {
  const response = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'get_iocs', days: 3 }),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`ThreatFox request failed: ${response.status}`);
  const data = await response.json();
  if (data.query_status !== 'ok') return [];
  return (data.data || []).slice(0, 35).map((ioc: any): ThreatRecord => ({
    id: `threatfox-${ioc.id}`,
    title: `${ioc.malware_printable || ioc.malware || 'IOC'} — ${ioc.ioc_value}`,
    source: 'abuse.ch ThreatFox',
    severity: normalizeSeverity(ioc.threat_type || ioc.malware),
    timestamp: asIso(ioc.first_seen),
    details: {
      ioc: ioc.ioc_value,
      iocType: ioc.ioc_type,
      threatType: ioc.threat_type,
      malware: ioc.malware_printable || ioc.malware,
      confidence: ioc.confidence_level,
      tags: ioc.tags,
      reference: ioc.reference,
    },
  }));
}

async function scrapeCyberSecurityRss(): Promise<ThreatRecord[]> {
  const feeds = CYBER_RSS_FEEDS;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 PandoraRecon/1.0' },
        signal: AbortSignal.timeout(7000),
        next: { revalidate: 900 },
      });
      if (!response.ok) throw new Error(`${feed.name} RSS request failed: ${response.status}`);
      const xml = await response.text();
      const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);

      return items.slice(0, 8).map((item): ThreatRecord => {
        const title = stripHtml(xmlTag(item, 'title'));
        const description = stripHtml(xmlTag(item, 'description'));
        const link = stripHtml(xmlTag(item, 'link'));
        const date = xmlTag(item, 'pubDate') || xmlTag(item, 'updated') || xmlTag(item, 'dc:date');
        const text = `${title} ${description}`;

        return {
          id: `rss-${feed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Buffer.from(link || title).toString('base64url').slice(0, 18)}`,
          title,
          source: feed.name,
          severity: normalizeSeverity(text),
          timestamp: asIso(date),
          details: {
            url: link,
            excerpt: description.slice(0, 700),
            collection: 'public-rss-scrape',
          },
        };
      });
    }),
  );

  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

async function fetchInternetDbExposure(): Promise<ThreatRecord[]> {
  const targets = (process.env.CYBER_ASSETS || process.env.RECON_TARGETS || '')
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean);

  if (!targets.length) return [];

  const settled = await Promise.allSettled(
    targets.slice(0, 25).map(async (target): Promise<ThreatRecord | null> => {
      const response = await fetch(`https://internetdb.shodan.io/${encodeURIComponent(target)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 PandoraRecon/1.0' },
        next: { revalidate: 900 },
      });

      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`InternetDB request failed for ${target}: ${response.status}`);
      const data = await response.json();
      const vulnCount = Array.isArray(data.vulns) ? data.vulns.length : 0;
      const portCount = Array.isArray(data.ports) ? data.ports.length : 0;

      return {
        id: `internetdb-${target}`,
        title: `${target} — ${portCount} open ports${vulnCount ? `, ${vulnCount} vulnerabilities` : ''}`,
        source: 'InternetDB Exposure Scan',
        severity: vulnCount > 0 ? 'high' : portCount > 8 ? 'medium' : 'low',
        timestamp: nowIso(),
        details: {
          target,
          hostnames: data.hostnames,
          ports: data.ports,
          vulnerabilities: data.vulns,
          tags: data.tags,
          cpEs: data.cpes,
        },
      };
    }),
  );

  return settled.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
}

export async function GET() {
  const sources = [
    fetchCisaKnownExploited(),
    fetchNvdRecentCves(),
    fetchGithubSecurityAdvisories(),
    fetchUrlhaus(),
    fetchThreatFox(),
    scrapeCyberSecurityRss(),
    fetchInternetDbExposure(),
  ];
  const settled = await Promise.allSettled(sources);
  const threats = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => String(result.reason?.message || result.reason));

  return NextResponse.json({
    threats,
    errors,
    sources: [
      'CISA KEV',
      'NVD CVE',
      'GitHub Advisories',
      'URLhaus',
      'ThreatFox',
      'Public Security RSS Scrape',
      'InternetDB Exposure Scan',
    ],
  });
}