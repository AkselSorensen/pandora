import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Sonde = Record<string, any>;

/** Current meteorological and amateur radiosonde telemetry from SondeHub. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const lat = Number(params.get('lat') || 20);
  const lng = Number(params.get('lng') || 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ balloons: [], error: 'Invalid map coordinates' }, { status: 400 });
  }

  const query = new URLSearchParams({ lat: String(lat), lon: String(lng), distance: '2000000', last: '21600' });
  const sources = [
    `https://api.v2.sondehub.org/sondes?${query}`,
    `https://api.v2.sondehub.org/amateur?${query}`,
  ];

  try {
    const results = await Promise.allSettled(sources.map(async (url) => {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: 'application/json', 'User-Agent': 'PandoraAtlas/1.0 (public radiosonde map)' },
        next: { revalidate: 120 },
      });
      if (!res.ok) throw new Error(`SondeHub returned ${res.status}`);
      return await res.json() as Record<string, Sonde>;
    }));
    const feeds = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (feeds.length === 0) throw new Error('Both SondeHub feeds are unavailable');

    const now = Date.now();
    const balloons = new Map<string, Sonde>();
    for (const feed of feeds) {
      for (const [serial, sonde] of Object.entries(feed)) {
        if (typeof sonde.lat !== 'number' || typeof sonde.lon !== 'number' || typeof sonde.alt !== 'number') continue;
        const lastUpdate = Date.parse(sonde.datetime || sonde.time_received || '');
        if (!Number.isFinite(lastUpdate) || now - lastUpdate > 6 * 60 * 60 * 1000) continue;
        balloons.set(serial, {
          id: `sondehub-${serial}`,
          callsign: sonde.payload_callsign || sonde.serial || serial,
          lat: sonde.lat,
          lng: sonde.lon,
          altitude: Math.round(sonde.alt),
          speed: typeof sonde.vel_h === 'number' ? Math.round(sonde.vel_h * 10) / 10 : null,
          verticalRate: typeof sonde.vel_v === 'number' ? Math.round(sonde.vel_v * 10) / 10 : null,
          temperature: typeof sonde.temp === 'number' ? sonde.temp : null,
          type: sonde.type || sonde.manufacturer || 'radiosonde',
          status: 'active',
          lastUpdated: sonde.datetime || sonde.time_received,
          color: '#FFB300',
          source: 'SondeHub',
        });
      }
    }

    const data = [...balloons.values()];
    return NextResponse.json({ balloons: data, total: data.length, source: 'SondeHub V2', timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('SondeHub balloon feed error:', error);
    return NextResponse.json({ balloons: [], error: 'SondeHub balloon telemetry unavailable' }, { status: 502 });
  }
}
