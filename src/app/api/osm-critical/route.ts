import { NextResponse } from 'next/server';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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

  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'PandoraAtlas/1.0 (public critical infrastructure map)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(12000),
        next: { revalidate: 1800 },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
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

      return NextResponse.json({ facilities, total: facilities.length, source: endpoint, timestamp: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
      });
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Use a geographically filtered Wikidata query when public Overpass mirrors are unavailable.
  try {
    const query = `
      SELECT DISTINCT ?item ?itemLabel ?location ?classLabel WHERE {
        SERVICE wikibase:around {
          ?item wdt:P625 ?location .
          bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral ;
            wikibase:radius "${Math.ceil(radius / 1000)}" ;
            wikibase:distance ?distance .
        }
        VALUES ?class { wd:Q16917 wd:Q1195942 wd:Q159719 wd:Q1248784 wd:Q245016 }
        ?item wdt:P31 ?class .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr" . }
      }
      LIMIT 300
    `;
    const url = `https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'PandoraAtlas/1.0 (public critical facility map)' },
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`);
    const data = await res.json();
    const facilities = (data.results?.bindings || []).flatMap((row: any) => {
      const coords = /Point\(([-\d.]+)\s+([-\d.]+)\)/i.exec(row.location?.value || '');
      const itemId = String(row.item?.value || '').split('/').pop();
      if (!coords || !itemId) return [];
      return [{
        id: `wikidata-${itemId}`,
        lat: Number(coords[2]),
        lng: Number(coords[1]),
        name: row.itemLabel?.value || itemId,
        type: row.classLabel?.value || 'critical facility',
        source: 'Wikidata public data (Overpass fallback)',
        source_url: row.item?.value,
      }];
    });
    return NextResponse.json({ facilities, total: facilities.length, source: 'Wikidata SPARQL', timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    errors.push(`Wikidata fallback: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.error('OSM critical feed unavailable:', errors);
  return NextResponse.json({ facilities: [], error: 'OpenStreetMap critical-infrastructure feeds unavailable', errors }, { status: 502 });
}
