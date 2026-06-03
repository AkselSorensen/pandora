import { NextRequest, NextResponse } from 'next/server';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

function parsePoint(value: string): { lat: number; lng: number } | null {
  const match = /Point\(([-\d.]+)\s+([-\d.]+)\)/i.exec(value || '');
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function itemId(uri: string) {
  return uri.split('/').pop() || uri;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 800), 50), 1500);
  const country = searchParams.get('country')?.trim().toUpperCase();

  const countryFilter = country
    ? `?item wdt:P17 ?countryEntity. ?countryEntity wdt:P297 "${country.replace(/[^A-Z]/g, '')}".`
    : 'OPTIONAL { ?item wdt:P17 ?countryEntity. }';

  const query = `
    SELECT ?item ?itemLabel ?coord ?countryEntityLabel ?operatorLabel ?classLabel WHERE {
      VALUES ?class { wd:Q695850 wd:Q6981985 }
      ?item wdt:P625 ?coord;
            wdt:P31 ?class.
      ?class rdfs:label ?classLabel.
      FILTER(LANG(?classLabel) = "en")
      ${countryFilter}
      OPTIONAL { ?item wdt:P137 ?operator. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr". }
    }
    LIMIT ${limit}
  `;

  try {
    const res = await fetch(`${WIKIDATA_SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'PandoraAtlas/1.0 (public OSINT airbase layer; no mockdata)',
      },
      signal: AbortSignal.timeout(30000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`);
    const data = await res.json();
    const seen = new Set<string>();
    const airbases = (data.results?.bindings || []).flatMap((row: any) => {
      const coords = parsePoint(row.coord?.value || '');
      const id = itemId(row.item?.value || '');
      if (!coords || !id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id: `wikidata-${id}`,
        wikidata: id,
        name: row.itemLabel?.value || id,
        country: row.countryEntityLabel?.value || '',
        operator: row.operatorLabel?.value || '',
        class: row.classLabel?.value || 'air base',
        lat: coords.lat,
        lng: coords.lng,
        source: 'Wikidata SPARQL public data',
        source_url: row.item?.value || `https://www.wikidata.org/wiki/${id}`,
        type: 'airbase',
      }];
    });

    return NextResponse.json({
      airbases,
      total: airbases.length,
      source: 'Wikidata SPARQL',
      query: 'Public Wikidata items classified as air bases / military airfields; no mockdata',
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' },
    });
  } catch (error) {
    return NextResponse.json({
      airbases: [],
      total: 0,
      error: 'Failed to fetch public Wikidata airbases',
      details: error instanceof Error ? error.message : String(error),
      query: 'No fallback/mockdata returned by design',
      timestamp: new Date().toISOString(),
    }, { status: 502 });
  }
}
