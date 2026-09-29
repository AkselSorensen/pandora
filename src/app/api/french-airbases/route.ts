import { NextRequest, NextResponse } from 'next/server';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function normalizeAirbase(el: any) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  return {
    id: `osm-${el.type}-${el.id}`,
    osm_id: el.id,
    osm_type: el.type,
    lat,
    lng,
    name: tags.name || tags['official_name'] || tags.ref || 'Aérodrome militaire public OSM',
    ref: tags.ref || tags['military:ref'] || '',
    operator: tags.operator || tags.owner || '',
    aeroway: tags.aeroway || '',
    military: tags.military || '',
    landuse: tags.landuse || '',
    icao: tags.icao || tags['ref:icao'] || '',
    wikidata: tags.wikidata || '',
    wikipedia: tags.wikipedia || '',
    source: 'OpenStreetMap Overpass',
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    type: 'french_airbase',
  };
}

export async function GET(req: NextRequest) {
  const query = `
    [out:json][timeout:25];
    area["ISO3166-1"="FR"][admin_level=2]->.france;
    (
      nwr(area.france)["aeroway"="aerodrome"]["military"];
      nwr(area.france)["military"="airfield"];
      nwr(area.france)["aeroway"="aerodrome"]["operator"~"Armée|Armee|Air et de l|Défense|Defense|Marine nationale|Aviation légère",i];
      nwr(area.france)["aeroway"="aerodrome"]["name"~"Base aérienne|Base aerienne|BA [0-9]|Aéronavale|Aeronavale|militaire|Saint-Dizier|Mont-de-Marsan|Istres|Évreux|Evreux|Orléans|Orleans|Villacoublay|Luxeuil|Nancy-Ochey|Cognac|Avord|Salon-de-Provence|Cazaux|Solenzara|Orange-Caritat|Landivisiau|Lanvéoc|Lanveoc",i];
    );
    out center tags 250;
  `;

  // The global Wikidata feed gives us a resilient first-party app fallback without relying on Overpass uptime.
  try {
    const fallbackUrl = new URL('/api/airbases?limit=1500', req.url);
    const fallback = await fetch(fallbackUrl, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (fallback.ok) {
      const payload = await fallback.json();
      const airbases = (payload.airbases || []).filter((base: any) => {
        const country = String(base.country || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return country === 'france' || country === 'french republic';
      }).map((base: any) => ({
        ...base,
        type: 'french_airbase',
        source: 'Wikidata SPARQL public data',
      }));
      if (airbases.length) {
        return NextResponse.json({
          airbases,
          total: airbases.length,
          source: 'Wikidata SPARQL',
          query: 'French air bases and military airfields from public Wikidata items',
          timestamp: new Date().toISOString(),
        }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' } });
      }
    }
  } catch (error) {
    console.warn('Wikidata French airbase fallback unavailable:', error instanceof Error ? error.message : error);
  }

  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'PandoraAtlas/1.0 (public French airbase map)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 86400 },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      const seen = new Set<string>();
      const airbases = (data.elements || [])
        .map(normalizeAirbase)
        .filter(Boolean)
        .filter((item: any) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'fr'));

      return NextResponse.json({
        airbases,
        total: airbases.length,
        source: endpoint,
        query: 'OpenStreetMap Overpass public data, no mockdata',
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' },
      });
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Wikidata is the independent global fallback when both Overpass mirrors are rate-limited.
  try {
    const fallbackUrl = new URL('/api/airbases?limit=1500', req.url);
    const fallback = await fetch(fallbackUrl, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (fallback.ok) {
      const payload = await fallback.json();
      const airbases = (payload.airbases || []).filter((base: any) => {
        const country = String(base.country || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return country === 'france' || country === 'french republic';
      }).map((base: any) => ({
        ...base,
        type: 'french_airbase',
        source: 'Wikidata SPARQL public data (Overpass fallback)',
      }));
      if (airbases.length) {
        return NextResponse.json({
          airbases,
          total: airbases.length,
          source: 'Wikidata SPARQL',
          query: 'French air bases and military airfields from public Wikidata items',
          timestamp: new Date().toISOString(),
        }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' } });
      }
    }
    errors.push('Wikidata fallback returned no French airbases');
  } catch (error) {
    errors.push(`Wikidata fallback: ${error instanceof Error ? error.message : String(error)}`);
  }

  return NextResponse.json({
    airbases: [],
    total: 0,
    error: 'Failed to fetch public OSM French airbases',
    errors,
    query: 'No fallback/mockdata returned by design',
    timestamp: new Date().toISOString(),
  }, { status: 502 });
}
