import { NextResponse } from 'next/server';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat') || '48.8566');
  const lng = Number(searchParams.get('lng') || '2.3522');
  const radius = Math.min(Number(searchParams.get('radius') || '25000'), 75000);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ facilities: [], error: 'Missing lat/lng' }, { status: 400 });
  }

  const query = `
    [out:json][timeout:20];
    (
      node(around:${radius},${lat},${lng})[amenity~"hospital|police|fire_station|embassy"];
      node(around:${radius},${lat},${lng})[power~"plant|substation"];
      node(around:${radius},${lat},${lng})[aeroway~"aerodrome|heliport"];
      way(around:${radius},${lat},${lng})[amenity~"hospital|police|fire_station|embassy"];
      way(around:${radius},${lat},${lng})[power~"plant|substation"];
      way(around:${radius},${lat},${lng})[aeroway~"aerodrome|heliport"];
    );
    out center tags 300;
  `;

  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(25000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
    const data = await res.json();
    const facilities = (data.elements || []).map((el: any) => {
      const tags = el.tags || {};
      const fLat = el.lat ?? el.center?.lat;
      const fLng = el.lon ?? el.center?.lon;
      if (typeof fLat !== 'number' || typeof fLng !== 'number') return null;
      const type = tags.amenity || tags.power || tags.aeroway || 'critical';
      return {
        id: `osm-${el.type}-${el.id}`,
        lat: fLat,
        lng: fLng,
        name: tags.name || tags.operator || type,
        type,
        operator: tags.operator,
        source: 'OpenStreetMap Overpass',
      };
    }).filter(Boolean);

    return NextResponse.json({ facilities, total: facilities.length, timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('OSM critical API error:', error);
    return NextResponse.json({ facilities: [], error: 'Failed to fetch OSM critical facilities' }, { status: 500 });
  }
}