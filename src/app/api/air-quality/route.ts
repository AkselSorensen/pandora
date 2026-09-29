import { NextRequest, NextResponse } from 'next/server';

/**
 * Current modelled air quality for the selected map point.
 * OpenAQ v2 is retired and its former public endpoint now returns empty results;
 * Open-Meteo provides a keyless global atmospheric-composition model instead.
 */
export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams;
  const lat = Number(search.get('lat') || 48.8566);
  const lng = Number(search.get('lng') || 2.3522);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ stations: [], error: 'Invalid map coordinates' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,european_aqi,us_aqi',
      timezone: 'UTC',
    });
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json', 'User-Agent': 'PandoraAtlas/1.0' },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`Open-Meteo air quality returned ${res.status}`);

    const data = await res.json();
    const current = data.current;
    if (!current || typeof current.european_aqi !== 'number') throw new Error('Open-Meteo returned no current air-quality values');

    const aqi = current.european_aqi;
    const level = aqi <= 20 ? 'Good' : aqi <= 40 ? 'Fair' : aqi <= 60 ? 'Moderate' : aqi <= 80 ? 'Poor' : aqi <= 100 ? 'Very poor' : 'Extremely poor';
    const color = aqi <= 20 ? '#00E676' : aqi <= 40 ? '#A3D900' : aqi <= 60 ? '#FFD700' : aqi <= 80 ? '#FF9500' : aqi <= 100 ? '#FF1744' : '#8B0000';
    const stations = [{
      id: `open-meteo-${data.latitude}-${data.longitude}`,
      name: 'Air quality model — selected map area',
      city: '',
      country: '',
      lat: data.latitude,
      lng: data.longitude,
      pm25: current.pm2_5,
      pm10: current.pm10,
      ozone: current.ozone,
      nitrogenDioxide: current.nitrogen_dioxide,
      carbonMonoxide: current.carbon_monoxide,
      sulphurDioxide: current.sulphur_dioxide,
      europeanAqi: aqi,
      usAqi: current.us_aqi,
      unit: 'μg/m³',
      level,
      color,
      lastUpdated: current.time,
      source: 'Open-Meteo global atmospheric-composition model',
      modelled: true,
    }];

    return NextResponse.json({ stations, total: stations.length, source: 'Open-Meteo', timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('Air quality API error:', error);
    return NextResponse.json({ stations: [], error: 'Air quality model unavailable' }, { status: 502 });
  }
}
