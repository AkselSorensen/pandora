import { NextResponse } from 'next/server';

function severityColor(severity: string) {
  if (severity === 'critical') return '#FF1744';
  if (severity === 'high') return '#FF6B00';
  if (severity === 'medium') return '#FFD700';
  return '#00E676';
}

function asIp(value: unknown) {
  const text = String(value || '').trim();
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(text) ? text : null;
}

export async function GET() {
  try {
    const response = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'get_iocs', days: 3 }),
      next: { revalidate: 900 },
    });

    if (!response.ok) throw new Error(`ThreatFox request failed: ${response.status}`);
    const data = await response.json();
    const iocs = (data.data || [])
      .map((ioc: any) => ({ ...ioc, ip: asIp(ioc.ioc_value) }))
      .filter((ioc: any) => ioc.ip)
      .slice(0, 40);

    const settled = await Promise.allSettled(
      iocs.map(async (ioc: any) => {
        const geo = await fetch(`http://ip-api.com/json/${encodeURIComponent(ioc.ip)}?fields=status,message,country,countryCode,regionName,city,lat,lon,isp,org,as,query`, {
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json());
        if (geo.status !== 'success' || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') return null;
        const severity = Number(ioc.confidence_level || 0) >= 80 ? 'critical' : Number(ioc.confidence_level || 0) >= 50 ? 'high' : 'medium';
        return {
          id: `threatfox-${ioc.id}`,
          ip: ioc.ip,
          lat: geo.lat,
          lng: geo.lon,
          city: geo.city,
          country: geo.country,
          countryCode: geo.countryCode,
          isp: geo.isp,
          org: geo.org,
          asn: geo.as,
          malware: ioc.malware_printable || ioc.malware || 'IOC',
          threatType: ioc.threat_type,
          confidence: ioc.confidence_level,
          firstSeen: ioc.first_seen,
          reference: ioc.reference,
          severity,
          color: severityColor(severity),
          source: 'abuse.ch ThreatFox + ip-api.com',
        };
      })
    );

    const threats = settled.flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : []);
    return NextResponse.json({ threats, total: threats.length, timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Cyber geo API error:', error);
    return NextResponse.json({ threats: [], error: 'Failed to fetch cyber geo threats' }, { status: 500 });
  }
}