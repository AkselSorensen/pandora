import { NextResponse } from 'next/server';

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

export async function GET() {
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

  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30000),
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

  return NextResponse.json({
    airbases: [],
    total: 0,
    error: 'Failed to fetch public OSM French airbases',
    errors,
    query: 'No fallback/mockdata returned by design',
    timestamp: new Date().toISOString(),
  }, { status: 502 });
}
