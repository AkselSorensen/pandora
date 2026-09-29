import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type C2 = { ip: string; port?: number; malware?: string; firstSeen?: string; source: string; asn?: string; country?: string };

function isPublicIPv4(value: string) {
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
}

async function getFeed(url: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json,text/csv,text/plain', 'User-Agent': 'PandoraAtlas/1.0 (public cyber threat map)' },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`abuse.ch feed returned ${res.status}`);
  return res;
}

async function geolocate(entry: C2) {
  const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(entry.ip)}?fields=status,message,country,countryCode,city,lat,lon,isp,org,as,query`, {
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const geo = await res.json();
  if (geo.status !== 'success' || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') return null;
  return {
    id: `c2-${entry.ip}`,
    ip: entry.ip,
    lat: geo.lat,
    lng: geo.lon,
    city: geo.city || '',
    country: geo.country || entry.country || '',
    countryCode: geo.countryCode || '',
    isp: geo.isp || '',
    org: geo.org || entry.asn || '',
    asn: geo.as || entry.asn || '',
    malware: entry.malware || 'Botnet C2',
    threatType: 'botnet C2 server',
    confidence: 90,
    firstSeen: entry.firstSeen || null,
    reference: entry.source,
    severity: 'high',
    color: '#FF6B00',
    source: `${entry.source} + ip-api.com`,
    locationPrecision: 'Approximate IP geolocation',
  };
}

export async function GET() {
  try {
    const feeds = await Promise.allSettled([
      getFeed('https://feodotracker.abuse.ch/downloads/ipblocklist.json'),
      getFeed('https://sslbl.abuse.ch/blacklist/sslipblacklist.csv'),
    ]);
    const entries = new Map<string, C2>();

    const feodoResponse = feeds[0];
    if (feodoResponse.status === 'fulfilled') {
      const rows = await feodoResponse.value.json();
      for (const row of rows) {
        const ip = String(row.ip_address || '');
        if (!isPublicIPv4(ip) || row.status !== 'online') continue;
        entries.set(ip, { ip, port: Number(row.port) || undefined, malware: row.malware, firstSeen: row.first_seen, asn: row.as_name, country: row.country, source: 'abuse.ch Feodo Tracker' });
      }
    }

    const sslblResponse = feeds[1];
    if (sslblResponse.status === 'fulfilled') {
      const lines = (await sslblResponse.value.text()).split(/\r?\n/);
      for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const columns = line.split(',').map((value) => value.trim());
        const ip = columns.find(isPublicIPv4);
        if (ip && !entries.has(ip)) entries.set(ip, { ip, port: Number(columns[2]) || undefined, firstSeen: columns[0], malware: 'TLS botnet C2', source: 'abuse.ch SSLBL' });
      }
    }

    if (entries.size === 0) throw new Error('No active IP indicators available from Feodo Tracker or SSLBL');
    const limited = [...entries.values()].slice(0, 25);
    const settled = await Promise.allSettled(limited.map(geolocate));
    const threats = settled.flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : []);
    if (threats.length === 0) throw new Error('Threat IP feed loaded, but its locations could not be resolved');

    return NextResponse.json({ threats, total: threats.length, source: 'abuse.ch Feodo Tracker + SSLBL', timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Cyber geo feed error:', error);
    return NextResponse.json({ threats: [], error: 'Public cyber threat feeds unavailable' }, { status: 502 });
  }
}
